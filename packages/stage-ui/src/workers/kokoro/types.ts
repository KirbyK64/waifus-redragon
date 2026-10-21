/**
 * Kokoro TTS domain types.
 *
 * Worker communication uses the unified protocol from protocol.ts.
 * These types define the domain-specific data structures (voices, etc.).
 */

import type { GenerateOptions } from 'kokoro-js'

import type { PtBrVoiceKey } from './voices-pt-br'

export type VoiceKey = NonNullable<GenerateOptions['voice']> | PtBrVoiceKey

export interface Voice {
  language: string
  name: string
  gender: string
}

export type Voices = Record<string, Voice>
