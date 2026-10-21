import type { WakeWord } from '../../libs/voice/wake-words'
import type { RedragonCharacter } from './airi-card-redragon'

const KWS_MODEL_ID = 'sherpa-onnx-kws-zipformer-zh-en-3M-2025-12-20'

/**
 * "Hey Carmen" and "Hey Violet" for the built-in keyword spotter.
 *
 * Chosen from about 2,000 variants against 720 recordings (9 synthetic voices in Brazilian Portuguese and
 * English, 3 speeds, clean, speech, music and hiss) with the same model and search settings as the detector.
 * `HH EY1` covers "hey" and the Portuguese "rei"; `EY1` alone covers "ei". Violet only matches with the final
 * T or CH, because without them "Ei, vai lá ver" woke her up. The dictionary pronunciation of Carmen
 * (`K AA1 R M AH0 N`) stays out: it fired on "Ei Carlos".
 */
export const REDRAGON_WAKE_WORDS: Record<RedragonCharacter, WakeWord[]> = {
  carmen: [{
    text: 'Hey Carmen',
    modelId: KWS_MODEL_ID,
    pronunciations: [
      ['HH', 'EY1', 'K', 'AA1', 'R', 'M', 'IH0', 'NG'],
      ['HH', 'EY1', 'K', 'AE1', 'R', 'AH0', 'M', 'IH0', 'NG'],
      ['EY1', 'K', 'AA1', 'R', 'M', 'IH0', 'NG'],
      ['EY1', 'K', 'AA1', 'R', 'M', 'EY0', 'N'],
      ['HH', 'EY1', 'K', 'AA1', 'R', 'M', 'EY0', 'N'],
      ['HH', 'EY1', 'K', 'AA1', 'R', 'AH0', 'M', 'AH0', 'N'],
      ['HH', 'EY1', 'K', 'AA1', 'R', 'M', 'EH1', 'N'],
      ['HH', 'EY1', 'K', 'AE1', 'R', 'AH0', 'M', 'IY0', 'N'],
    ],
  }],
  violet: [{
    text: 'Hey Violet',
    modelId: KWS_MODEL_ID,
    pronunciations: [
      ['HH', 'EY1', 'V', 'IY0', 'AH0', 'L', 'EH1', 'T'],
      ['HH', 'EY1', 'V', 'AY1', 'AH0', 'L', 'AH0', 'T'],
      ['HH', 'EY1', 'V', 'AY1', 'AH0', 'L', 'EH1', 'T'],
      ['EY1', 'V', 'AY1', 'AH0', 'L', 'EH1', 'T'],
      ['EY1', 'V', 'IY0', 'AH0', 'L', 'EH1', 'T'],
      ['EY1', 'V', 'AY1', 'AH0', 'L', 'EH1', 'CH'],
      ['HH', 'EY1', 'V', 'IY0', 'OW0', 'L', 'EH1', 'T'],
      ['HH', 'EY1', 'V', 'AY1', 'OW0', 'L', 'EH1', 'T'],
      ['EY1', 'V', 'IY0', 'OW0', 'L', 'EH1', 'T'],
      ['EY1', 'V', 'AY1', 'OW0', 'L', 'EH1', 'T'],
    ],
  }],
}
