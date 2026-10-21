import type { ExportFile, ImportedConversation, ImportedMessage, ImportSource } from './types'

/**
 * Reads the conversations of chat app data exports, and keeps only what the person wrote.
 *
 * Use when:
 * - The memory import has the files of an export: `conversations.json` of ChatGPT or Claude, the Gemini Apps activity of
 *   Google Takeout (JSON or HTML), `prod-grok-backend.json` of Grok, or, for a loose file, plain text that the person wrote.
 *
 * Expects:
 * - Files already decoded as text. The format is detected from the content, so a renamed file still reads.
 * - `plainText` only for a file that the person picked on its own. A text file inside an archive is not theirs to read.
 *
 * Returns:
 * - Conversations with at least one message of the person, once per source and id. Files of another format are skipped.
 */
export function readExportFiles(files: ExportFile[], options: { plainText?: boolean } = {}): ImportedConversation[] {
  const seen = new Set<string>()
  const conversations: ImportedConversation[] = []
  for (const file of files) {
    for (const conversation of readExportFile(file, options)) {
      const key = `${conversation.source}:${conversation.id}`
      if (seen.has(key) || !conversation.messages.length)
        continue
      seen.add(key)
      conversations.push(conversation)
    }
  }
  return conversations
}

/** The sources of the conversations, each once, in a stable order. */
export function sourcesOf(conversations: ImportedConversation[]): ImportSource[] {
  const order: ImportSource[] = ['chatgpt', 'claude', 'gemini', 'grok', 'text']
  const found = new Set(conversations.map(conversation => conversation.source))
  return order.filter(source => found.has(source))
}

function readExportFile(file: ExportFile, options: { plainText?: boolean }): ImportedConversation[] {
  if (/\.json$/i.test(file.path)) {
    const value = parseJson(file.text)
    if (Array.isArray(value)) {
      if (value.some(item => isRecord(item) && isRecord(item.mapping)))
        return readChatGpt(value)
      if (value.some(item => isRecord(item) && Array.isArray(item.chat_messages)))
        return readClaude(value)
      if (value.some(isGeminiActivity))
        return readGeminiActivities(value.filter(isGeminiActivity).map(item => ({ title: String(item.title), at: dateOf(item.time) })))
    }
    if (isRecord(value) && Array.isArray(value.conversations))
      return readGrok(value.conversations)
    return []
  }
  if (/\.html?$/i.test(file.path))
    return /outer-cell/.test(file.text) && /gemini|bard/i.test(file.text) ? readGeminiActivities(geminiHtmlActivities(file.text)) : []
  if (options.plainText && /\.(?:txt|md|markdown)$/i.test(file.path))
    return readPlainText(file)
  return []
}

// ChatGPT

/**
 * A ChatGPT conversation is a tree of message nodes. The branch on screen runs from `current_node` up to the root, so
 * only that branch is read: edited and regenerated branches are drafts. Custom instructions repeat in every
 * conversation, so they become one conversation of their own.
 */
function readChatGpt(items: unknown[]): ImportedConversation[] {
  const conversations: ImportedConversation[] = []
  const instructions = new Map<string, ImportedMessage>()
  for (const item of items) {
    if (!isRecord(item) || !isRecord(item.mapping))
      continue
    const mapping = item.mapping as Record<string, unknown>
    const messages: ImportedMessage[] = []
    for (const message of chatGptBranch(mapping, typeof item.current_node === 'string' ? item.current_node : undefined)) {
      const role = isRecord(message.author) ? message.author.role : undefined
      const content = isRecord(message.content) ? message.content : undefined
      if (role !== 'user' || !content)
        continue
      const at = dateOf(message.create_time)
      if (content.content_type === 'user_editable_context') {
        for (const text of [content.user_profile, content.user_instructions]) {
          if (typeof text === 'string' && text.trim())
            instructions.set(text.trim(), { text: text.trim(), at })
        }
        continue
      }
      if (isRecord(message.metadata) && message.metadata.is_visually_hidden_from_conversation === true)
        continue
      const text = Array.isArray(content.parts) ? content.parts.filter(part => typeof part === 'string').join('\n').trim() : ''
      if (text)
        messages.push({ text, at })
    }
    conversations.push({
      source: 'chatgpt',
      id: String(item.conversation_id ?? item.id ?? `chatgpt-${conversations.length}`),
      title: typeof item.title === 'string' ? item.title : '',
      createdAt: dateOf(item.create_time),
      messages,
    })
  }
  if (instructions.size) {
    const messages = [...instructions.values()]
    conversations.push({ source: 'chatgpt', id: 'custom-instructions', title: 'ChatGPT custom instructions', createdAt: latest(messages), messages })
  }
  return conversations
}

function chatGptBranch(mapping: Record<string, unknown>, currentNode: string | undefined): Record<string, unknown>[] {
  const branch: Record<string, unknown>[] = []
  const visited = new Set<string>()
  let id = currentNode
  while (id && !visited.has(id) && isRecord(mapping[id])) {
    visited.add(id)
    const node = mapping[id] as Record<string, unknown>
    if (isRecord(node.message))
      branch.push(node.message)
    id = typeof node.parent === 'string' ? node.parent : undefined
  }
  if (branch.length)
    return branch.reverse()
  // Older exports may lack `current_node`. Then every message counts, in time order.
  return Object.values(mapping)
    .map(node => isRecord(node) && isRecord(node.message) ? node.message : undefined)
    .filter((message): message is Record<string, unknown> => Boolean(message))
    .sort((left, right) => (dateOf(left.create_time) ?? 0) - (dateOf(right.create_time) ?? 0))
}

// Claude

function readClaude(items: unknown[]): ImportedConversation[] {
  const conversations: ImportedConversation[] = []
  for (const item of items) {
    if (!isRecord(item) || !Array.isArray(item.chat_messages))
      continue
    const messages: ImportedMessage[] = []
    for (const message of item.chat_messages) {
      if (!isRecord(message) || message.sender !== 'human')
        continue
      const text = typeof message.text === 'string' && message.text.trim()
        ? message.text.trim()
        : (Array.isArray(message.content) ? message.content : [])
            .filter(part => isRecord(part) && part.type === 'text' && typeof part.text === 'string')
            .map(part => String((part as Record<string, unknown>).text))
            .join('\n')
            .trim()
      if (text)
        messages.push({ text, at: dateOf(message.created_at) })
    }
    conversations.push({
      source: 'claude',
      id: String(item.uuid ?? `claude-${conversations.length}`),
      title: typeof item.name === 'string' ? item.name : '',
      createdAt: dateOf(item.created_at),
      messages,
    })
  }
  return conversations
}

// Gemini

/** Activity titles that name the prompt, in the languages of Takeout. The prompt follows the prefix. */
const GEMINI_PROMPT_PREFIX = /^(?:Prompted|Asked|Enviou o comando|Comando enviado|Solicitou|Perguntou|Preguntaste|Pediste|Consulta)\s*:?\s+/i
/** Activities that are not a prompt: feedback, settings, Gems, and use without a prompt. */
const GEMINI_NOT_PROMPT = /^(?:Used|Gave feedback|Created|Updated|Deleted|Viewed|Shared|Usou|Deu feedback|Enviou feedback|Criou|Atualizou|Excluiu|Visualizou|Compartilhou)\b/i

function isGeminiActivity(item: unknown): item is Record<string, unknown> {
  if (!isRecord(item) || typeof item.title !== 'string')
    return false
  const products = Array.isArray(item.products) ? item.products.join(' ') : ''
  return /gemini|bard/i.test(`${typeof item.header === 'string' ? item.header : ''} ${products}`)
}

/**
 * Takeout keeps one activity per prompt and no conversation ids. The prompts of one day become one conversation, so
 * a day of questions about one project reads together.
 */
function readGeminiActivities(activities: { title: string, at?: number }[]): ImportedConversation[] {
  const days = new Map<string, ImportedMessage[]>()
  for (const activity of activities) {
    const title = activity.title.trim()
    if (!title || GEMINI_NOT_PROMPT.test(title))
      continue
    const text = title.replace(GEMINI_PROMPT_PREFIX, '').trim()
    if (!text)
      continue
    const day = activity.at === undefined ? 'undated' : new Date(activity.at).toISOString().slice(0, 10)
    days.set(day, [...(days.get(day) ?? []), { text, at: activity.at }])
  }
  return [...days].map(([day, messages]) => ({
    source: 'gemini' as const,
    id: `gemini-${day}`,
    title: day === 'undated' ? 'Gemini' : `Gemini ${day}`,
    createdAt: messages.reduce<number | undefined>((oldest, message) => message.at === undefined ? oldest : Math.min(oldest ?? message.at, message.at), undefined),
    messages: messages.sort((left, right) => (left.at ?? 0) - (right.at ?? 0)),
  }))
}

/**
 * Reads the activities of a Takeout `MyActivity.html`. Each activity is an `outer-cell`, and its first content cell starts
 * with the title line and the date line, separated by `<br>`. The reply of the model comes after them and is not read.
 */
export function geminiHtmlActivities(html: string): { title: string, at?: number }[] {
  const activities: { title: string, at?: number }[] = []
  for (const cell of html.split(/<div class="outer-cell/).slice(1)) {
    const header = /class="header-cell[^>]*>([\s\S]*?)<\/div>/.exec(cell)?.[1] ?? ''
    if (!/gemini|bard/i.test(htmlText(header)))
      continue
    const content = /class="content-cell[^>]*>([\s\S]*?)<\/div>/.exec(cell)?.[1]
    if (!content)
      continue
    const lines = content.split(/<br\s*\/?>/i).map(htmlText).filter(Boolean)
    if (!lines.length)
      continue
    activities.push({ title: lines[0], at: lines[1] ? dateOf(lines[1]) : undefined })
  }
  return activities
}

function htmlText(html: string) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&emsp;|&ensp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, '\'')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

// Grok

/** The Grok export keeps each conversation with its responses. A response of the person has the sender `human`. */
function readGrok(items: unknown[]): ImportedConversation[] {
  const conversations: ImportedConversation[] = []
  for (const item of items) {
    if (!isRecord(item))
      continue
    const conversation = isRecord(item.conversation) ? item.conversation : item
    const messages: ImportedMessage[] = []
    for (const entry of Array.isArray(item.responses) ? item.responses : []) {
      const response = isRecord(entry) && isRecord(entry.response) ? entry.response : entry
      if (!isRecord(response) || typeof response.sender !== 'string' || !/^(?:human|user)$/i.test(response.sender))
        continue
      const text = typeof response.message === 'string' ? response.message.trim() : ''
      if (text)
        messages.push({ text, at: dateOf(response.create_time) })
    }
    conversations.push({
      source: 'grok',
      id: String(conversation.id ?? conversation.conversation_id ?? `grok-${conversations.length}`),
      title: typeof conversation.title === 'string' ? conversation.title : '',
      createdAt: dateOf(conversation.create_time) ?? latest(messages),
      messages: messages.sort((left, right) => (left.at ?? 0) - (right.at ?? 0)),
    })
  }
  return conversations
}

// Plain text

/** A text file that the person wrote, for example notes about themselves. Each paragraph is one message. */
function readPlainText(file: ExportFile): ImportedConversation[] {
  const messages = file.text.split(/\r?\n\s*\r?\n/).map(paragraph => paragraph.trim()).filter(Boolean).map(text => ({ text }))
  return [{ source: 'text', id: file.path, title: file.path.split('/').pop() ?? file.path, messages }]
}

// Shared

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text.replace(/^\uFEFF/, ''))
  }
  catch {
    return undefined
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Reads the dates of the exports: seconds since the epoch (ChatGPT), ISO strings (Claude, Takeout), and the extended
 * JSON of MongoDB (Grok). Milliseconds stay as they are. A date that does not read is undefined.
 */
export function dateOf(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value))
    return value < 1e11 ? Math.round(value * 1000) : Math.round(value)
  if (typeof value === 'string') {
    if (/^\d+(?:\.\d+)?$/.test(value.trim()))
      return dateOf(Number(value))
    const parsed = Date.parse(value.replace(/\u202F/g, ' '))
    return Number.isNaN(parsed) ? localizedDate(value) : parsed
  }
  if (isRecord(value)) {
    if ('$date' in value)
      return dateOf(value.$date)
    if ('$numberLong' in value)
      return dateOf(Number(value.$numberLong))
  }
  return undefined
}

const MONTHS: Record<string, number> = {
  jan: 0, ene: 0, fev: 1, feb: 1, mar: 2, abr: 3, apr: 3, mai: 4, may: 4, jun: 5, jul: 6, ago: 7, aug: 7,
  set: 8, sep: 8, out: 9, oct: 9, nov: 10, dez: 11, dic: 11, dec: 11,
}

/**
 * Takeout writes the dates of `MyActivity.html` in the language of the account, for example
 * `11 de jun. de 2025, 19:30:00 BRT`. The day and the time are read as written, without the time zone: the importer
 * only needs the day.
 */
function localizedDate(value: string): number | undefined {
  const match = /(\d{1,2})\s+(?:de\s+)?([a-zç]{3})[a-zç]*\.?\s+(?:de\s+)?(\d{4})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/i.exec(value)
  const month = match ? MONTHS[match[2].toLowerCase()] : undefined
  if (!match || month === undefined)
    return undefined
  return Date.UTC(Number(match[3]), month, Number(match[1]), Number(match[4] ?? 0), Number(match[5] ?? 0), Number(match[6] ?? 0))
}

function latest(messages: ImportedMessage[]) {
  return messages.reduce<number | undefined>((newest, message) => message.at === undefined ? newest : Math.max(newest ?? message.at, message.at), undefined)
}
