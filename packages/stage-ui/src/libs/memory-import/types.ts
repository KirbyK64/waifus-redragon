/** The chat apps whose data exports the importer reads. `text` is a plain text or Markdown file that a person wrote. */
export type ImportSource = 'chatgpt' | 'claude' | 'gemini' | 'grok' | 'text'

/** One message that the person wrote. Replies of the other model are not kept: they are not facts about the person. */
export interface ImportedMessage {
  text: string
  /** Milliseconds since the epoch, when the export has it. */
  at?: number
}

/** One conversation of an export, reduced to what the person said in it. */
export interface ImportedConversation {
  source: ImportSource
  id: string
  title: string
  /** Milliseconds since the epoch, when the export has it. */
  createdAt?: number
  messages: ImportedMessage[]
}

/** One file of an export, already decoded as text. Paths keep the folders of the archive. */
export interface ExportFile {
  path: string
  text: string
}

/** What an export holds, for the person to check before anything leaves the device. */
export interface ImportSummary {
  sources: ImportSource[]
  conversations: number
  messages: number
  characters: number
  /** Oldest and newest dates, in milliseconds since the epoch. */
  from?: number
  to?: number
}
