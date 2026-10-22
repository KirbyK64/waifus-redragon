import type { Card } from '@proj-airi/ccc'

import type { WakeWord } from '../../libs/voice/wake-words'
import type { AiriExtension } from '../../types/airiCard'

import { CONVERSATION_RULES, PERSONA_TEXT } from './airi-card-redragon-personas'
import { REDRAGON_WAKE_WORDS } from './airi-card-redragon-wake-words'

/**
 * Ruby and Violet, the Redragon characters that ship with this build.
 *
 * Ruby replaces ReLU as the `default` card. Violet is a second built-in card
 * that initialization adds when it is missing, so a user who deletes her gets
 * her back on the next start, like the `default` card.
 */
export const REDRAGON_VIOLET_CARD_ID = 'redragon-violet'

export type RedragonCharacter = 'ruby' | 'violet'

// NOTICE: the dash rule is part of the conversation rules on purpose. Visible text from
// these characters must never use the long dash, and the model only follows what the
// prompt says. Our bridge also turns any long dash in a reply into a comma.
interface Persona {
  name: string
  systemPrompt: string
  description: string
  personality: string
  scenario: string
  greeting: string
}

function persona(character: RedragonCharacter): Persona {
  const text = PERSONA_TEXT[character]
  return {
    name: text.name,
    systemPrompt: `${text.identity}\n\n${CONVERSATION_RULES}`,
    description: text.description,
    personality: text.personality,
    scenario: text.scenario,
    greeting: text.greeting,
  }
}

/**
 * How the system prompt of each earlier built-in card began. A stored card that still
 * begins like this was never edited, so it takes the current text on startup.
 */
const EARLIER_PROMPTS: Record<RedragonCharacter, readonly string[]> = {
  ruby: ['Você é a Ruby, mascote da Redragon. Tom calmo', 'Você é a Carmen, mascote da Redragon.'],
  violet: ['Você é a Violet, mascote da Redragon. Tom ousado'],
}

const DISPLAY_MODEL_IDS: Record<RedragonCharacter, string> = {
  // Ruby's 3D body keeps the id it shipped with in v0.1.0, so models saved by older installs still load.
  ruby: 'preset-vrm-carmen',
  violet: 'preset-vrm-violet',
}

/** The card of one Redragon character, before the user edits it. */
export function redragonCard(character: RedragonCharacter): Card & { extensions: { airi: AiriExtension } } {
  const text = persona(character)
  const avatarModelId = `${character}-vrm-avatar-model`
  const wakeWords: WakeWord[] = REDRAGON_WAKE_WORDS[character]

  return {
    name: text.name,
    version: '1.0.0',
    description: text.description,
    personality: text.personality,
    scenario: text.scenario,
    systemPrompt: text.systemPrompt,
    greetings: [text.greeting],
    creator: 'Redragon',
    extensions: {
      airi: {
        wakeWords,
        defaultAvatarModelId: avatarModelId,
        avatarModels: [{
          id: avatarModelId,
          displayModelId: DISPLAY_MODEL_IDS[character],
          type: 'vrm',
          config: {},
        }],
        modules: {
          // The bridge code of the app points chat, voice and hearing at our
          // bridge. Each character speaks with her own ElevenLabs voice there;
          // the bundled pt-BR Kokoro voices stay available in the settings.
          // NOTICE: the chat selection lives on the card too. An empty one falls back to the
          // defaults that the leader window saved at startup, before the activation, and chat
          // then fails with "No chat provider or model configured". Same ids as the activation
          // (apps/stage-tamagotchi/src/renderer/composables/use-waifus-activation.ts).
          consciousness: { provider: 'openai-compatible', model: 'gpt-4.1-mini' },
          speech: { provider: 'elevenlabs', model: 'eleven_flash_v2_5', voice_id: character },
          vision: { provider: '', model: '' },
        },
        agents: {},
      },
    },
  }
}

/**
 * The stored card with the current personality, when it is an earlier built-in card that
 * the user never edited. Cards keep their voice, model and every other setting.
 * Returns undefined when the card needs no change.
 */
export function refreshedRedragonCard<T extends Card>(character: RedragonCharacter, card: T): T | undefined {
  if (!EARLIER_PROMPTS[character].some(prefix => card.systemPrompt?.startsWith(prefix)))
    return undefined

  const text = persona(character)
  return {
    ...card,
    name: text.name,
    systemPrompt: text.systemPrompt,
    description: text.description,
    personality: text.personality,
    scenario: text.scenario,
    greetings: [text.greeting],
  }
}
