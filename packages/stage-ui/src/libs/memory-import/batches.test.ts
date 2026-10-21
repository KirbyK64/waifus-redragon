import type { ImportedConversation } from './types'

import { describe, expect, it } from 'vitest'

import { buildImportBatches, summarizeImport, trimMessage } from './batches'

function conversation(id: string, createdAt: number | undefined, messages: string[], source: ImportedConversation['source'] = 'chatgpt'): ImportedConversation {
  return { source, id, title: `Title ${id}`, createdAt, messages: messages.map(text => ({ text })) }
}

describe('trimMessage', () => {
  it('replaces code and inline files with markers and collapses whitespace', () => {
    expect(trimMessage('fix this\n```ts\nconst a = 1\n```\n  please')).toBe('fix this [code ts] please')
    expect(trimMessage('see data:image/png;base64,iVBORw0KGgo= here')).toBe('see [file] here')
    expect(trimMessage('unclosed\n```\nconst a = 1')).toBe('unclosed [code]')
  })

  it('drops a message without words', () => {
    expect(trimMessage('  ...  ')).toBe('')
    expect(trimMessage('```\n123\n```')).toBe('')
  })

  // The start says what the person wants, and the end often says why.
  it('keeps the start and the end of a long message within the limit', () => {
    const text = `Começo ${'meio '.repeat(400)}fim da mensagem`
    const trimmed = trimMessage(text, 200)

    expect(trimmed.length).toBeLessThanOrEqual(200)
    expect(trimmed.startsWith('Começo meio')).toBe(true)
    expect(trimmed.endsWith('fim da mensagem')).toBe(true)
    expect(trimmed).toContain(' [...] ')
  })
})

describe('summarizeImport', () => {
  it('counts conversations, messages, characters, and the period', () => {
    const summary = summarizeImport([
      { source: 'claude', id: 'a', title: '', createdAt: 2_000, messages: [{ text: 'abc', at: 3_000 }, { text: 'de' }] },
      { source: 'grok', id: 'b', title: '', messages: [{ text: 'f', at: 1_000 }] },
    ])

    expect(summary).toEqual({ sources: ['claude', 'grok'], conversations: 2, messages: 3, characters: 6, from: 1_000, to: 3_000 })
  })

  it('leaves the period out when nothing has a date', () => {
    expect(summarizeImport([conversation('a', undefined, ['oi'], 'text')])).toEqual({ sources: ['text'], conversations: 1, messages: 1, characters: 2, from: undefined, to: undefined })
  })
})

describe('buildImportBatches', () => {
  it('puts the newest conversation first under its title, date, and source', () => {
    const { batches, conversations, truncated } = buildImportBatches([
      conversation('old', Date.UTC(2024, 0, 2), ['velha']),
      conversation('none', undefined, ['sem data'], 'text'),
      conversation('new', Date.UTC(2025, 4, 6), ['nova', '```\n\n```']),
    ])

    expect(batches).toEqual([
      '## Title new (2025-05-06) [chatgpt]\n- nova\n\n## Title old (2024-01-02) [chatgpt]\n- velha\n\n## Title none [text]\n- sem data',
    ])
    expect(conversations).toBe(3)
    expect(truncated).toBe(false)
  })

  // The model reads each batch alone, so a conversation that continues in the next batch keeps its title there.
  it('repeats the title when a conversation continues in the next batch', () => {
    const { batches } = buildImportBatches([conversation('long', Date.UTC(2025, 0, 1), ['a'.repeat(30), 'b'.repeat(30), 'c'.repeat(30)])], { batchCharacters: 80 })

    expect(batches).toEqual([
      `## Title long (2025-01-01) [chatgpt]\n- ${'a'.repeat(30)}`,
      `## Title long (2025-01-01) [chatgpt]\n- ${'b'.repeat(30)}`,
      `## Title long (2025-01-01) [chatgpt]\n- ${'c'.repeat(30)}`,
    ])
  })

  // A long conversation gives its opening, so the budget reaches more conversations.
  it('reads the opening of each conversation up to its share', () => {
    const { batches } = buildImportBatches([conversation('long', 1, ['a'.repeat(30), 'b'.repeat(30), 'c'.repeat(30)])], { conversationCharacters: 70 })

    expect(batches).toEqual([`## Title long (1970-01-01) [chatgpt]\n- ${'a'.repeat(30)}\n- ${'b'.repeat(30)}`])
  })

  it('stops at the budget and reports that older conversations were left out', () => {
    const result = buildImportBatches([
      conversation('new', 3, ['x'.repeat(40)]),
      conversation('middle', 2, ['y'.repeat(40)]),
      conversation('old', 1, ['z'.repeat(40)]),
    ], { budgetCharacters: 100 })

    expect(result.conversations).toBe(2)
    expect(result.characters).toBe(84)
    expect(result.truncated).toBe(true)
    expect(result.batches.join('\n')).not.toContain('z')
  })

  it('returns no batches for conversations without words', () => {
    expect(buildImportBatches([conversation('empty', 1, ['...'])])).toEqual({ batches: [], conversations: 0, characters: 0, truncated: false })
  })
})
