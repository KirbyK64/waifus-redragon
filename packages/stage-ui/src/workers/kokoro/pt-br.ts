/**
 * Brazilian Portuguese G2P for Kokoro-82M.
 *
 * kokoro-js only phonemizes English. Kokoro's pt-BR voices (pf_dora, pm_alex,
 * pm_santa) were trained on misaki's `EspeakG2P('pt-br')`: eSpeak NG IPA with
 * stress marks and tied multi-letter phonemes, folded by the E2M table below.
 * eSpeak NG compiled to WASM gives the same phoneme stream (checked against
 * libespeak-ng 1.52 + misaki on 10 sentences, identical output), so this file
 * only turns its `_` separated output into Kokoro's alphabet.
 */

export type EspeakPhonemize = (text: string) => string

// NOTICE: misaki/espeak.py `EspeakG2P.E2M` without the `^` tie. In the `_`
// separated output, a group with more than one letter is a tied phoneme.
const E2M: Record<string, string> = {
  'aɪ': 'I',
  'aʊ': 'W',
  'dz': 'ʣ',
  'dʒ': 'ʤ',
  'eɪ': 'A',
  'oʊ': 'O',
  'əʊ': 'Q',
  'ss': 'S',
  'ts': 'ʦ',
  'tʃ': 'ʧ',
  'ɔɪ': 'Y',
}

// Same set kokoro-js keeps verbatim between phonemized sections
const PUNCTUATION = ';:,.!?¡¿\u2014…"«»“”(){}[]'
const PUNCTUATION_PATTERN = new RegExp(`(\\s*[${PUNCTUATION.replace(/[\]\\[]/g, '\\$&')}]+\\s*)+`, 'g')

const FEMININE_HOURS: Record<number, string> = { 1: 'uma', 2: 'duas', 21: 'vinte e uma', 22: 'vinte e duas' }

function hourWords(hour: string): string {
  const n = Number(hour)
  return FEMININE_HOURS[n] ?? String(n)
}

/**
 * Rewrites what eSpeak NG reads wrong on its own. It already reads integers,
 * decimals with comma, thousands with dot and ordinals (1º) in pt-BR.
 */
export function normalizePtBrText(text: string): string {
  return text
    .replace(/\p{Extended_Pictographic}|️|‍/gu, '')
    .replace(/[*_#`~]+/g, ' ')
    .replace(/\bR\$\s?(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?(?:\s+(mil|milhão|milhões|bilhão|bilhões)\b)?/g, (_, integer: string, cents?: string, scale?: string) => {
      if (scale)
        return `${integer} ${scale}${scale === 'mil' ? '' : ' de'} reais`
      const reais = Number(integer.replace(/\./g, ''))
      const centavos = cents ? Number(cents.padEnd(2, '0')) : 0
      const parts: string[] = []
      if (reais > 0 || centavos === 0)
        parts.push(`${integer} ${reais === 1 ? 'real' : 'reais'}`)
      if (centavos > 0)
        parts.push(`${centavos} ${centavos === 1 ? 'centavo' : 'centavos'}`)
      return parts.join(' e ')
    })
    .replace(/(\d+(?:,\d+)?)\s?%/g, '$1 por cento')
    .replace(/\b([01]?\d|2[0-3])(?:h|:)([0-5]\d)\b/g, (_, h: string, m: string) => m === '00'
      ? `${hourWords(h)} ${Number(h) === 1 ? 'hora' : 'horas'}`
      : `${hourWords(h)} e ${Number(m)}`)
    .replace(/\b([01]?\d|2[0-3])h\b/g, (_, h: string) => `${hourWords(h)} ${Number(h) === 1 ? 'hora' : 'horas'}`)
    .replace(/\bk{3,}\b/gi, 'rá rá rá')
    .replace(/\bh+m+\b/gi, 'hum')
    .replace(/\bvcs\b/gi, 'vocês')
    .replace(/\bvc\b/gi, 'você')
    .replace(/\btbm?\b/gi, 'também')
    .replace(/\bpq\b/gi, 'porque')
    .replace(/\bblz\b/gi, 'beleza')
    .replace(/\bmsm\b/gi, 'mesmo')
    .replace(/\.{3}/g, '…')
    .replace(/\s+/g, ' ')
    .trim()
}

/** `k_ˈa_ɾ_ə_m_eɪ_ŋ dʒ_y` becomes `kˈaɾəmAŋ ʤy` */
export function espeakToKokoro(output: string): string {
  return output
    .split(/\s+/)
    .filter(word => word && word !== '|')
    .map(word => word
      .split('_')
      .filter(Boolean)
      .map((group) => {
        const [, stress, base] = group.match(/^([ˈˌ]*)(.*)$/su)!
        return stress + (E2M[base] ?? base)
      })
      .join('')
      .replace(/[\^-]/g, ''))
    .filter(Boolean)
    .join(' ')
}

export function phonemizePtBr(text: string, espeak: EspeakPhonemize): string {
  const normalized = normalizePtBrText(text)
  let phonemes = ''
  let last = 0
  for (const match of normalized.matchAll(PUNCTUATION_PATTERN)) {
    if (match.index > last)
      phonemes += espeakToKokoro(espeak(normalized.slice(last, match.index)))
    phonemes += match[0]
    last = match.index + match[0].length
  }
  if (last < normalized.length)
    phonemes += espeakToKokoro(espeak(normalized.slice(last)))
  return phonemes.trim()
}

/**
 * Splits on sentence ends, then on commas, so no chunk passes the model's
 * 510 token window (one token per phoneme symbol).
 */
export function splitPhonemes(phonemes: string, maxLength = 400): string[] {
  const chunks: string[] = []
  for (const sentence of phonemes.match(/[^.!?…]+[.!?…]*\s*/g) ?? []) {
    if (sentence.length <= maxLength) {
      chunks.push(sentence.trim())
      continue
    }
    let current = ''
    for (const part of sentence.match(/[^,;:]+[,;:]*\s*/g) ?? []) {
      if ((current + part).length > maxLength && current) {
        chunks.push(current.trim())
        current = ''
      }
      current += part.length > maxLength ? `${part.slice(0, maxLength)} ` : part
    }
    chunks.push(current.trim())
  }
  return chunks.filter(Boolean)
}

let espeakLoading: Promise<EspeakPhonemize> | null = null

/**
 * Loads eSpeak NG (WASM + 24 MB of voice data) on the first pt-BR request
 * only, so English users never download it.
 */
export function loadEspeakPtBr(): Promise<EspeakPhonemize> {
  espeakLoading ??= (async () => {
    const [{ default: createEspeak }, { default: dataUrl }] = await Promise.all([
      import('@echogarden/espeak-ng-emscripten'),
      import('@echogarden/espeak-ng-emscripten/espeak-ng.data?url'),
    ])
    const espeakModule = await createEspeak({
      locateFile: (path: string) => path.endsWith('.data') ? dataUrl : path,
    })
    const espeak = new espeakModule.eSpeakNGWorker()
    espeak.set_voice('pt-br')
    const decoder = new TextDecoder()

    return (text: string) => {
      // NOTICE: returns a pointer to a NUL terminated UTF-8 string in the WASM heap
      const { ptr } = espeak.convert_to_phonemes(text, true)
      const heap = espeakModule.HEAPU8
      let end = ptr
      while (heap[end])
        end++
      return decoder.decode(heap.subarray(ptr, end))
    }
  })()

  espeakLoading.catch(() => {
    espeakLoading = null
  })
  return espeakLoading
}
