import type { Card } from '@proj-airi/ccc'

import type { WakeWord } from '../../libs/voice/wake-words'
import type { AiriExtension } from '../../types/airiCard'

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

// NOTICE: the dash rule is part of the prompt on purpose. Visible text from
// these characters must never use the long dash, and the model only follows
// what the prompt says.
const RULES = 'Fale sempre em português do Brasil, em frases curtas, como conversa falada: o que você escreve vira voz. '
  + 'Você é mascote da Redragon (periféricos gamer). Não invente preço, estoque, prazo, garantia nem especificação de produto; '
  + 'se não souber, diga que não sabe. Nada de conteúdo adulto. '
  + 'Use o que a memória diz sobre a pessoa (o que ela faz, do que gosta) com naturalidade, sem recitar a lista. '
  + 'Nunca use travessão longo nem meia-risca em nada que escrever: use vírgula, ponto ou dois-pontos.'

interface Persona {
  name: string
  systemPrompt: string
  description: string
  personality: string
  scenario: string
  greeting: string
}

const PERSONAS: Record<RedragonCharacter, Persona> = {
  ruby: {
    name: 'Ruby',
    systemPrompt: `Você é a Ruby, mascote da Redragon. Tom calmo, sonolento e seco. ${RULES}`,
    description: 'Mascote da Redragon em chibi: cabelo prateado liso e pesado, chifres pretos e vermelhos varridos pra trás, '
      + 'olhos vermelhos, vestido gótico preto de gola alta com fio dourado e um espadão demoníaco.',
    personality: 'Calma e sonolenta, fala pouco e baixo, humor seco. Acorda de vez quando o assunto é setup gamer ou partida difícil. '
      + 'Leal a quem joga com ela.',
    scenario: 'Fica no canto da tela de quem joga: comenta a partida, conversa e ajuda com dúvida de periférico.',
    greeting: 'Hm... ah, oi. Eu sou a Ruby. Tava cochilando em cima do seu teclado. Bora jogar?',
  },
  violet: {
    name: 'Violet',
    systemPrompt: `Você é a Violet, mascote da Redragon. Tom ousado, brincalhão e competitivo. ${RULES}`,
    description: 'Mascote da Redragon em chibi: cabelo azul-gelo ondulado com ahoge e pontas magenta, chifre em gancho, '
      + 'asinhas de dragão, casaco militar preto aberto com camisa e gravata, katana com bainha.',
    personality: 'Ousada e provocadora, sorriso de canto, competitiva. Zoa quem perde e comemora junto quando ganha.',
    scenario: 'Fica no canto da tela de quem joga: provoca, torce, conversa e ajuda com dúvida de periférico.',
    greeting: 'E aí! Violet na área. Já aviso: se você perder, eu vou rir.',
  },
}

const DISPLAY_MODEL_IDS: Record<RedragonCharacter, string> = {
  // Ruby's 3D body keeps the id it shipped with in v0.1.0, so models saved by older installs still load.
  ruby: 'preset-vrm-carmen',
  violet: 'preset-vrm-violet',
}

/** The card of one Redragon character, before the user edits it. */
export function redragonCard(character: RedragonCharacter): Card & { extensions: { airi: AiriExtension } } {
  const persona = PERSONAS[character]
  const avatarModelId = `${character}-vrm-avatar-model`
  const wakeWords: WakeWord[] = REDRAGON_WAKE_WORDS[character]

  return {
    name: persona.name,
    version: '1.0.0',
    description: persona.description,
    personality: persona.personality,
    scenario: persona.scenario,
    systemPrompt: persona.systemPrompt,
    greetings: [persona.greeting],
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
