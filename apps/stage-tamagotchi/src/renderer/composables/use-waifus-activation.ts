import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { REDRAGON_VIOLET_CARD_ID } from '@proj-airi/stage-ui/stores/modules/airi-card-redragon'
import { useConsciousnessStore } from '@proj-airi/stage-ui/stores/modules/consciousness'
import { useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProviderConfigStore } from '@proj-airi/stage-ui/stores/providers/config'
import { useProviderStore } from '@proj-airi/stage-ui/stores/providers/provider'

/**
 * The Integraction bridge. It holds the house keys for chat, voice and
 * transcription, so the app carries only a personal access code that the
 * bridge can limit and revoke.
 */
export const WAIFUS_BRIDGE_URL = 'https://pm.solidpower.com.br/waifus-redragon/api/index.php/v1/'

const CHAT_PROVIDER = 'openai-compatible'
const CHAT_MODEL = 'gpt-4.1-mini'
const SPEECH_PROVIDER = 'elevenlabs'
const SPEECH_MODEL = 'eleven_flash_v2_5'
const HEARING_PROVIDER = 'openai-compatible-audio-transcription'
const HEARING_MODEL = 'gpt-4o-mini-transcribe'

/** The codes that `_ops/waifus-redragon/codigos.php` issues: `wr-` and 32 letters or digits. */
const CODE_PATTERN = /^wr-[A-Z0-9]{32}$/i

export type ActivationCheck = 'ok' | 'malformed' | 'refused' | 'offline'

/** Removes the spaces and line breaks that a pasted message brings along. */
export function normalizeActivationCode(text: string) {
  return text.replace(/\s+/g, '')
}

/** Asks the bridge whether it accepts the code. The model list costs nothing. */
export async function checkActivationCode(code: string, signal?: AbortSignal): Promise<ActivationCheck> {
  if (!CODE_PATTERN.test(code))
    return 'malformed'
  try {
    const response = await fetch(`${WAIFUS_BRIDGE_URL}models`, { headers: { Authorization: `Bearer ${code}` }, signal })
    if (response.ok)
      return 'ok'
    return response.status === 401 ? 'refused' : 'offline'
  }
  catch {
    return 'offline'
  }
}

/** Points chat, voice and hearing at the bridge with one access code. */
export function useWaifusActivation() {
  const providerStore = useProviderStore()
  const providerConfigStore = useProviderConfigStore()
  const consciousness = useConsciousnessStore()
  const hearing = useHearingStore()
  const speech = useSpeechStore()
  const cardStore = useAiriCardStore()

  // Same route as the stock onboarding: the synchronization leader owns provider
  // configuration, so the save goes through its synced actions.
  async function configureProvider(providerId: string, code: string) {
    await providerStore.initializeProvider(providerId)
    await providerConfigStore.patchProviderConfig(providerId, { apiKey: code, baseUrl: WAIFUS_BRIDGE_URL })
    await providerStore.forceProviderConfigured(providerId)
  }

  async function activate(code: string) {
    for (const providerId of [CHAT_PROVIDER, SPEECH_PROVIDER, HEARING_PROVIDER])
      await configureProvider(providerId, code)

    consciousness.activeProvider = CHAT_PROVIDER
    consciousness.activeModel = CHAT_MODEL
    hearing.activeTranscriptionProvider = HEARING_PROVIDER
    hearing.activeTranscriptionModel = HEARING_MODEL
    // "Hey Ruby" and "Hey Violet" wake each character once the microphone is on.
    hearing.inputMode = 'wake-word'

    await speech.selectProviderModel(SPEECH_PROVIDER, SPEECH_MODEL, cardStore.activeCardId === REDRAGON_VIOLET_CARD_ID ? 'violet' : 'ruby')
  }

  return { activate }
}
