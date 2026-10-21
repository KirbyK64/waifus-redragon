import type { ExportFile, ImportedConversation } from './types'

import JSZip from 'jszip'

import { readExportFiles } from './readers'

/**
 * Archive entries that hold conversations. A Takeout archive has the activity of every Google product, so only the
 * Gemini Apps (formerly Bard) folder is read. Attachments, images, and other files are never decoded.
 */
export function isConversationEntry(path: string) {
  const name = path.split('/').pop() ?? ''
  if (/^conversations(?:-\d+)?\.json$/i.test(name) || /^prod-grok-backend\.json$/i.test(name))
    return true
  return /gemini|bard/i.test(path) && /\.(?:json|html?)$/i.test(name) && /activ|ativid/i.test(name)
}

/**
 * Reads a file that the person picked: a `.zip` data export of ChatGPT, Claude, Google Takeout, or Grok, or one file of
 * such an export, or a text file of their own.
 *
 * Use when:
 * - The import page receives a file. Nothing leaves the device here.
 *
 * Returns:
 * - The conversations, with only the messages of the person. An archive without a known export resolves to an empty list.
 */
export async function readExport(file: Blob & { name: string }): Promise<ImportedConversation[]> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  // A zip file starts with "PK". The extension is not enough: browsers rename downloads.
  if (bytes[0] === 0x50 && bytes[1] === 0x4B)
    return readExportFiles(await readArchiveEntries(bytes))
  return readExportFiles([{ path: file.name, text: new TextDecoder().decode(bytes) }], { plainText: true })
}

async function readArchiveEntries(bytes: Uint8Array): Promise<ExportFile[]> {
  const zip = await JSZip.loadAsync(bytes)
  const files: ExportFile[] = []
  for (const entry of Object.values(zip.files)) {
    if (!entry.dir && isConversationEntry(entry.name))
      files.push({ path: entry.name, text: await entry.async('string') })
  }
  return files
}
