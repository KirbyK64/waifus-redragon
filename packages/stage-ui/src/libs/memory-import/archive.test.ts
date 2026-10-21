import { readFileSync } from 'node:fs'

import JSZip from 'jszip'

import { describe, expect, it } from 'vitest'

import { isConversationEntry, readExport } from './archive'

function fixture(name: string) {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf-8')
}

async function zipOf(entries: Record<string, string>, name: string) {
  const zip = new JSZip()
  for (const [path, text] of Object.entries(entries))
    zip.file(path, text)
  return new File([await zip.generateAsync({ type: 'blob' })], name)
}

describe('isConversationEntry', () => {
  it('accepts the conversation files of each export and nothing else', () => {
    expect(isConversationEntry('conversations.json')).toBe(true)
    expect(isConversationEntry('export/conversations-001.json')).toBe(true)
    expect(isConversationEntry('ttl/30d/export_data/0000/prod-grok-backend.json')).toBe(true)
    expect(isConversationEntry('Takeout/My Activity/Gemini Apps/MyActivity.json')).toBe(true)
    expect(isConversationEntry('Takeout/Minha atividade/Apps do Gemini/MinhaAtividade.html')).toBe(true)

    expect(isConversationEntry('Takeout/My Activity/Search/MyActivity.json')).toBe(false)
    expect(isConversationEntry('Takeout/My Activity/Gemini Apps/image.png')).toBe(false)
    expect(isConversationEntry('chat.html')).toBe(false)
    expect(isConversationEntry('users.json')).toBe(false)
  })
})

describe('readExport', () => {
  it('reads the conversations of a ChatGPT archive and skips the rest', async () => {
    const file = await zipOf({
      'conversations.json': fixture('chatgpt-conversations.json'),
      'chat.html': '<html>Gemini</html>',
      'user.json': '{"email": "someone@example.com"}',
      'file-abc.png': 'not an image',
    }, 'export.zip')

    const conversations = await readExport(file)

    expect(conversations.map(conversation => conversation.id)).toEqual([
      '66e1a2b0-0000-4000-8000-000000000001',
      '659c1e70-0000-4000-8000-000000000002',
      'custom-instructions',
    ])
  })

  // Takeout may hold the activity of every Google product. Only the Gemini Apps folder is the person's chat.
  it('reads only the Gemini Apps activity of a Takeout archive', async () => {
    const file = await zipOf({
      'Takeout/My Activity/Gemini Apps/MyActivity.json': fixture('gemini-my-activity.json'),
      'Takeout/My Activity/Search/MyActivity.json': JSON.stringify([{ header: 'Gemini Apps', title: 'Prompted segredo da busca', time: '2025-01-01T00:00:00Z', products: ['Gemini Apps'] }]),
      'Takeout/archive_browser.html': '<html></html>',
    }, 'takeout-20250612T000000Z-001.zip')

    const conversations = await readExport(file)

    expect(conversations.map(conversation => conversation.id)).toEqual(['gemini-2025-06-10', 'gemini-2025-06-12'])
  })

  it('reads a zip by its content even without the extension', async () => {
    const file = await zipOf({ 'prod-grok-backend.json': fixture('grok-prod-grok-backend.json') }, 'download')

    expect((await readExport(file)).map(conversation => conversation.source)).toEqual(['grok'])
  })

  it('reads a loose export file and a text file of the person', async () => {
    expect((await readExport(new File([fixture('claude-conversations.json')], 'conversations.json'))).map(conversation => conversation.source)).toEqual(['claude'])
    expect((await readExport(new File([fixture('notes.txt')], 'sobre-mim.txt')))[0].messages).toHaveLength(2)
  })

  it('resolves to an empty list for an archive without a known export', async () => {
    expect(await readExport(await zipOf({ 'photos/a.jpg': 'x' }, 'fotos.zip'))).toEqual([])
  })
})
