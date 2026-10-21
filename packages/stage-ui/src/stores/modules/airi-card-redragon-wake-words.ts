import type { WakeWord } from '../../libs/voice/wake-words'
import type { RedragonCharacter } from './airi-card-redragon'

const KWS_MODEL_ID = 'sherpa-onnx-kws-zipformer-zh-en-3M-2025-12-20'

/**
 * "Hey Ruby" and "Hey Violet" for the built-in keyword spotter.
 *
 * Measured with the same model and search settings as the detector, against synthetic voices in Brazilian
 * Portuguese and English at 3 speeds, clean and with speech, music and hiss behind them. `HH EY1` covers "hey"
 * and the Portuguese "rei"; `EY1` alone covers "ei". Ruby has the Brazilian R (`HH UW1 B IY0`, "rúbi"), the
 * English R, and the pinyin spelling of the same sounds. Violet only matches with the final T or CH, because
 * without them "Ei, vai lá ver" woke her up.
 */
export const REDRAGON_WAKE_WORDS: Record<RedragonCharacter, WakeWord[]> = {
  ruby: [{
    text: 'Hey Ruby',
    modelId: KWS_MODEL_ID,
    pronunciations: [
      ['HH', 'EY1', 'HH', 'UW1', 'B', 'IY0'],
      ['HH', 'EY1', 'R', 'UW1', 'B', 'IY0'],
      ['h', 'ēi', 'h', 'ú', 'b', 'í'],
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
