import { describe, expect, it } from 'vitest'

import { espeakToKokoro, normalizePtBrText, phonemizePtBr, splitPhonemes } from './pt-br'

// Real eSpeak NG (pt-br) output for these inputs, so the test runs without WASM
const ESPEAK: Record<string, string> = {
  'Carmen': 'k_ˈa_ɾ_ə_m_eɪ_ŋ',
  'quer jogar comigo hoje': 'k_ˈɛ_r ʒ_o_ɡ_ˈa_r k_ˌo_m_ˈi_ɡ_w ˈo_ʒ_y',
  'esse mouse tem vinte e seis mil DPI': 'ˌe_s_i m_ˈaʊ_z_i t_ˈeɪ_ŋ v_ˈi_ŋ_tʃ_j i s_ˈeɪ_z m_ˈiʊ_ d_ˌe_p_ˌe_ˈi',
  'não': 'n_ˈɐ̃ʊ̃',
}

describe('pt-BR phonemes for Kokoro', () => {
  it('folds tied espeak groups like misaki EspeakG2P', () => {
    expect(espeakToKokoro(ESPEAK.Carmen)).toBe('kˈaɾəmAŋ')
    expect(espeakToKokoro(ESPEAK['esse mouse tem vinte e seis mil DPI'])).toBe('ˌesi mˈWzi tˈAŋ vˈiŋʧj i sˈAz mˈiʊ dˌepˌeˈi')
    expect(espeakToKokoro(ESPEAK['não'])).toBe('nˈɐ̃ʊ̃')
    expect(espeakToKokoro('v_ˈi_ŋ_tʃ_y__i_s_ˈeɪ_s | ˈa')).toBe('vˈiŋʧyisˈAs ˈa')
  })

  it('keeps punctuation between phonemized sections', () => {
    const phonemes = phonemizePtBr('Carmen, quer jogar comigo hoje?', text => ESPEAK[text] ?? '')
    expect(phonemes).toBe('kˈaɾəmAŋ, kˈɛr ʒoɡˈar kˌomˈiɡw ˈoʒy?')
  })

  it('normalizes money, percent, hours and chat slang', () => {
    expect(normalizePtBrText('Teclado de R$ 199,90')).toBe('Teclado de 199 reais e 90 centavos')
    expect(normalizePtBrText('R$ 1,00 ou R$ 0,5 ou R$ 1.299')).toBe('1 real ou 50 centavos ou 1.299 reais')
    expect(normalizePtBrText('100% de vitória')).toBe('100 por cento de vitória')
    expect(normalizePtBrText('Às 22h30, ou 1h, ou 14:00')).toBe('Às vinte e duas e 30, ou uma hora, ou 14 horas')
    expect(normalizePtBrText('vc tb jogou? kkkk')).toBe('você também jogou? rá rá rá')
    expect(normalizePtBrText('Hm... *boceja* bora 🎮')).toBe('hum… boceja bora')
  })

  it('splits long input under the token window', () => {
    const sentence = `${'a'.repeat(300)}, ${'b'.repeat(300)}. `
    const chunks = splitPhonemes(sentence.repeat(2), 400)
    expect(chunks.every(chunk => chunk.length <= 400)).toBe(true)
    expect(chunks.join('').replace(/[^ab]/g, '').length).toBe(1200)
    expect(splitPhonemes('')).toEqual([])
  })
})
