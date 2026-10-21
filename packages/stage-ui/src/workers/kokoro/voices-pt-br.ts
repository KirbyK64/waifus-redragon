/**
 * Kokoro pt-BR voices, bundled with the app.
 *
 * kokoro-js would fetch voice files from the Hugging Face `main` branch, and
 * only knows its English list. These are the v1.0 files (identical to
 * onnx-community/Kokoro-82M-v1.0-ONNX at 1939ad2a), plus two presets mixed
 * from them for the Redragon personas.
 */

import type { Voices } from './types'

import carmenUrl from './voices/carmen.bin?url'
import pfDoraUrl from './voices/pf_dora.bin?url'
import pmAlexUrl from './voices/pm_alex.bin?url'
import pmSantaUrl from './voices/pm_santa.bin?url'
import violetUrl from './voices/violet.bin?url'

export const PT_BR_VOICES = {
  pf_dora: { name: 'Dora', language: 'pt-br', gender: 'Female' },
  pm_alex: { name: 'Alex', language: 'pt-br', gender: 'Male' },
  pm_santa: { name: 'Santa', language: 'pt-br', gender: 'Male' },
  ruby: { name: 'Ruby', language: 'pt-br', gender: 'Female' },
  violet: { name: 'Violet', language: 'pt-br', gender: 'Female' },
} as const satisfies Voices

export type PtBrVoiceKey = keyof typeof PT_BR_VOICES

const VOICE_URLS: Record<PtBrVoiceKey, string> = {
  pf_dora: pfDoraUrl,
  pm_alex: pmAlexUrl,
  pm_santa: pmSantaUrl,
  // The Ruby preset keeps the file name from when she was called Carmen.
  ruby: carmenUrl,
  violet: violetUrl,
}

// NOTICE: the speech provider only sends a voice id, so each preset carries
// its persona's pace here.
export const PT_BR_VOICE_SPEED: Record<PtBrVoiceKey, number> = {
  pf_dora: 1,
  pm_alex: 1,
  pm_santa: 1,
  ruby: 0.9,
  violet: 1.05,
}

export function isPtBrVoice(voice: string): voice is PtBrVoiceKey {
  return Object.hasOwn(PT_BR_VOICES, voice)
}

const styles = new Map<PtBrVoiceKey, Promise<Float32Array>>()

/** 510 x 256 style vectors, one row per input length */
export function loadPtBrVoice(voice: PtBrVoiceKey): Promise<Float32Array> {
  let style = styles.get(voice)
  if (!style) {
    style = fetch(VOICE_URLS[voice])
      .then((response) => {
        if (!response.ok)
          throw new Error(`Failed to load Kokoro voice ${voice}: HTTP ${response.status}`)
        return response.arrayBuffer()
      })
      .then(buffer => new Float32Array(buffer))
    styles.set(voice, style)
    style.catch(() => styles.delete(voice))
  }
  return style
}
