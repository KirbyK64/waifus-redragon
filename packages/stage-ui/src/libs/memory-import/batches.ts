import type { ImportedConversation, ImportSummary } from './types'

import { sourcesOf } from './readers'

/** A message keeps its start and its end. The middle of a long paste rarely says who the person is. */
export const MAX_MESSAGE_CHARACTERS = 1_000
/** The opening messages of a conversation say what it is about. Past this, the next conversation teaches more. */
export const CONVERSATION_CHARACTERS = 2_000
/** One request reads about 6 thousand tokens of messages, which every chat model with tools accepts. */
export const BATCH_CHARACTERS = 24_000
/** The newest conversations go first, up to about 100 thousand tokens in all, so a large export stays cheap. */
export const BUDGET_CHARACTERS = 400_000

/**
 * Prepares one message for the model: a code block becomes a marker, whitespace collapses, and a long message keeps
 * its start and end. Returns an empty string for a message without words of its own.
 *
 * @example
 * trimMessage('fix this\n```ts\nconst a = 1\n```')
 * // => 'fix this [code ts]'
 */
export function trimMessage(text: string, limit = MAX_MESSAGE_CHARACTERS) {
  const plain = text
    .replace(/```([\w+-]*)[^\n]*\n[\s\S]*?(?:```|$)/g, (_, language: string) => ` [code${language ? ` ${language}` : ''}] `)
    .replace(/data:[\w/+.-]+;base64,[\w+/=]+/g, '[file]')
    .replace(/\s+/g, ' ')
    .trim()
  // A message of only code or files says nothing that the person wrote.
  if (!/[\p{L}\p{N}]/u.test(plain.replace(/\[code[^\]]*\]|\[file\]/g, '')))
    return ''
  if (plain.length <= limit)
    return plain
  const tail = Math.floor(limit * 0.2)
  return `${plain.slice(0, limit - tail - 7).trimEnd()} [...] ${plain.slice(-tail).trimStart()}`
}

/** Counts what the export holds, before anything leaves the device. */
export function summarizeImport(conversations: ImportedConversation[]): ImportSummary {
  let messages = 0
  let characters = 0
  let from: number | undefined
  let to: number | undefined
  for (const conversation of conversations) {
    for (const message of conversation.messages) {
      messages += 1
      characters += message.text.length
      const at = message.at ?? conversation.createdAt
      if (at !== undefined) {
        from = Math.min(from ?? at, at)
        to = Math.max(to ?? at, at)
      }
    }
  }
  return { sources: sourcesOf(conversations), conversations: conversations.length, messages, characters, from, to }
}

/** The text that the model reads, in batches, and how much of the export it covers. */
export interface ImportBatches {
  batches: string[]
  /** Conversations with at least one message in a batch. */
  conversations: number
  characters: number
  /** True when the budget left older conversations out. */
  truncated: boolean
}

/**
 * Packs the messages of the person into batches for the model, newest conversation first.
 *
 * Use when:
 * - The person confirmed the import. The batches are what the connected chat model reads.
 *
 * Expects:
 * - Conversations from {@link readExportFiles}. Dates are optional: undated conversations go last.
 *
 * Returns:
 * - Batches of at most `batchCharacters`, each conversation under a title line, and at most `budgetCharacters` in all.
 *   Each conversation gives its first `conversationCharacters`, so a long export reads more conversations instead of
 *   all of a few. A conversation that does not fit in the batch continues in the next batch under the same title.
 */
export function buildImportBatches(
  conversations: ImportedConversation[],
  options: { batchCharacters?: number, budgetCharacters?: number, conversationCharacters?: number } = {},
): ImportBatches {
  const batchCharacters = options.batchCharacters ?? BATCH_CHARACTERS
  const conversationCharacters = options.conversationCharacters ?? CONVERSATION_CHARACTERS
  const budgetCharacters = options.budgetCharacters ?? BUDGET_CHARACTERS
  const ordered = [...conversations].sort((left, right) => (right.createdAt ?? -Infinity) - (left.createdAt ?? -Infinity))
  const batches: string[] = []
  let current = ''
  let used = 0
  let included = 0
  let truncated = false

  for (const conversation of ordered) {
    const lines = conversation.messages.map(message => trimMessage(message.text)).filter(Boolean).map(text => `- ${text}`)
    if (!lines.length)
      continue
    const date = conversation.createdAt === undefined ? '' : ` (${new Date(conversation.createdAt).toISOString().slice(0, 10)})`
    const heading = `## ${conversation.title.replace(/\s+/g, ' ').trim() || 'Untitled'}${date} [${conversation.source}]`
    let headed = false
    let counted = false
    let conversationUsed = 0
    for (const line of lines) {
      if (conversationUsed && conversationUsed + line.length > conversationCharacters)
        break
      if (used + line.length > budgetCharacters) {
        truncated = true
        break
      }
      const block = headed ? `\n${line}` : `${current ? '\n\n' : ''}${heading}\n${line}`
      if (current && current.length + block.length > batchCharacters) {
        batches.push(current)
        current = `${heading}\n${line}`
      }
      else {
        current += block
      }
      headed = true
      used += line.length
      conversationUsed += line.length
      if (!counted) {
        included += 1
        counted = true
      }
    }
    if (truncated)
      break
  }
  if (current)
    batches.push(current)
  return { batches, conversations: included, characters: used, truncated }
}
