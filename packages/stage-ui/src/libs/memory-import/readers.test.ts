import type { ExportFile } from './types'

import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { dateOf, geminiHtmlActivities, readExportFiles, sourcesOf } from './readers'

function fixture(name: string, path = name): ExportFile {
  return { path, text: readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf-8') }
}

function texts(files: ExportFile[]) {
  return readExportFiles(files).map(conversation => [conversation.id, conversation.messages.map(message => message.text)])
}

describe('readExportFiles', () => {
  // The branch on screen is what the person kept. A regenerated reply and its draft follow-up are left behind.
  it('reads the visible ChatGPT branch and keeps custom instructions once', () => {
    const conversations = readExportFiles([fixture('chatgpt-conversations.json', 'conversations.json')])

    expect(conversations.map(conversation => [conversation.id, conversation.title, conversation.messages.map(message => message.text)])).toEqual([
      ['66e1a2b0-0000-4000-8000-000000000001', 'Treino de jiu-jitsu', [
        'Treino jiu-jitsu três vezes por semana, me ajuda a montar um aquecimento?',
        'Essa é a minha faixa, sou faixa azul.',
      ]],
      ['659c1e70-0000-4000-8000-000000000002', 'Receita de pão', ['Faço pão de fermentação natural todo domingo.']],
      ['custom-instructions', 'ChatGPT custom instructions', [
        'The user provided the following information about themselves: Sou designer de jogos em Porto Alegre.',
        'The user provided the additional info about how they would like you to respond: Responda curto.',
      ]],
    ])
    expect(conversations[0]).toMatchObject({ source: 'chatgpt', createdAt: 1726063200512 })
    expect(conversations[0].messages[0].at).toBe(1726063201100)
  })

  it('reads the human messages of Claude, from text or content blocks, without attachments', () => {
    expect(texts([fixture('claude-conversations.json', 'conversations.json')])).toEqual([
      ['2b7c9a10-0000-4000-8000-00000000c001', [
        'Tenho um canal de speedrun de Hollow Knight e quero ideias de vídeo.',
        'Gravo sempre de madrugada, depois que minha filha Lia dorme.',
      ]],
    ])
  })

  // Takeout has no conversation ids, so the prompts of one day read as one conversation.
  it('groups Gemini prompts of the Takeout JSON by day and skips other activities', () => {
    const conversations = readExportFiles([fixture('gemini-my-activity.json', 'Takeout/My Activity/Gemini Apps/MyActivity.json')])

    expect(conversations.map(conversation => [conversation.id, conversation.title, conversation.messages.map(message => message.text)])).toEqual([
      ['gemini-2025-06-10', 'Gemini 2025-06-10', [
        'quais teclados mecânicos são bons para quem digita muito?',
        'sou fã de switches lineares, qual escolher?',
      ]],
      ['gemini-2025-06-12', 'Gemini 2025-06-12', ['me lembra de regar as plantas toda sexta']],
    ])
    expect(conversations[0].createdAt).toBe(Date.parse('2025-06-10T22:15:03.120Z'))
  })

  it('reads Gemini prompts of the Takeout HTML without the replies', () => {
    expect(texts([fixture('gemini-my-activity.html', 'Takeout/My Activity/Gemini Apps/MyActivity.html')])).toEqual([
      ['gemini-2025-06-11', [
        'como cuidar de uma suculenta no apartamento?',
        'tenho um gato chamado Biscoito & ele morde fios',
      ]],
    ])
  })

  it('reads the human responses of Grok with MongoDB dates', () => {
    const [conversation, ...rest] = readExportFiles([fixture('grok-prod-grok-backend.json')])

    expect(rest).toEqual([])
    expect(conversation).toEqual({
      source: 'grok',
      id: 'grok-conv-0001',
      title: 'Viagem para o Japão',
      createdAt: Date.parse('2025-08-01T18:00:00.000Z'),
      messages: [{ text: 'Quero ir ao Japão em abril ver as cerejeiras, já estudo japonês faz um ano.', at: 1754071200000 }],
    })
  })

  it('detects the format from the content, so a renamed export still reads', () => {
    expect(texts([fixture('claude-conversations.json', 'download (3).json')])[0][0]).toBe('2b7c9a10-0000-4000-8000-00000000c001')
    expect(readExportFiles([{ path: 'users.json', text: '[{"uuid": "u", "full_name": "Someone"}]' }])).toEqual([])
    expect(readExportFiles([{ path: 'broken.json', text: '{"conversations": [' }])).toEqual([])
    expect(readExportFiles([{ path: 'page.html', text: '<html><body>Gemini</body></html>' }])).toEqual([])
  })

  it('reads plain text only when the person picked the file', () => {
    const notes = fixture('notes.txt')

    expect(readExportFiles([notes])).toEqual([])
    expect(readExportFiles([notes], { plainText: true })).toEqual([{
      source: 'text',
      id: 'notes.txt',
      title: 'notes.txt',
      messages: [
        { text: 'Me chamo Bia, moro em Curitiba e trabalho com ilustração.' },
        { text: 'Gosto de jogos de ritmo e de café coado.' },
      ],
    }])
  })

  it('keeps one conversation per source and id across files and lists the sources in order', () => {
    const conversations = readExportFiles([
      fixture('grok-prod-grok-backend.json'),
      fixture('grok-prod-grok-backend.json', 'copy/prod-grok-backend.json'),
      fixture('chatgpt-conversations.json', 'conversations.json'),
    ])

    expect(conversations.filter(conversation => conversation.source === 'grok')).toHaveLength(1)
    expect(sourcesOf(conversations)).toEqual(['chatgpt', 'grok'])
  })

  it('strips a byte order mark before reading JSON', () => {
    const file = fixture('grok-prod-grok-backend.json')

    expect(readExportFiles([{ ...file, text: `\uFEFF${file.text}` }])).toHaveLength(1)
  })
})

describe('geminiHtmlActivities', () => {
  it('reads the title and date lines of each Gemini activity cell', () => {
    expect(geminiHtmlActivities(fixture('gemini-my-activity.html').text)).toEqual([
      { title: 'Prompted como cuidar de uma suculenta no apartamento?', at: Date.parse('2025-06-11T22:30:00.000Z') },
      { title: 'Prompted tenho um gato chamado Biscoito & ele morde fios', at: Date.parse('2025-06-11T22:45:10.000Z') },
      { title: 'Used an Assistant feature', at: Date.parse('2025-06-11T23:00:00.000Z') },
    ])
  })
})

describe('dateOf', () => {
  it('reads the date shapes of every export', () => {
    expect(dateOf(1726063200.512)).toBe(1726063200512)
    expect(dateOf(1754071200000)).toBe(1754071200000)
    expect(dateOf('1726063200')).toBe(1726063200000)
    expect(dateOf('2025-03-02T13:20:11.482911Z')).toBe(Date.parse('2025-03-02T13:20:11.482Z'))
    expect(dateOf({ $date: { $numberLong: '1754071200000' } })).toBe(1754071200000)
    expect(dateOf({ $date: '2025-08-01T18:00:00.000Z' })).toBe(Date.parse('2025-08-01T18:00:00.000Z'))
    expect(dateOf('Jun 11, 2025, 7:30:00\u202FPM GMT-03:00')).toBe(Date.parse('2025-06-11T22:30:00.000Z'))
  })

  // An account in Portuguese or Spanish gets the HTML dates in its language. The day is what matters.
  it('reads localized Takeout dates by their day and time', () => {
    expect(dateOf('11 de jun. de 2025, 19:30:00 BRT')).toBe(Date.UTC(2025, 5, 11, 19, 30, 0))
    expect(dateOf('3 de set. de 2024 08:05')).toBe(Date.UTC(2024, 8, 3, 8, 5, 0))
    expect(dateOf('2 dic 2023, 10:00:00 CET')).toBe(Date.UTC(2023, 11, 2, 10, 0, 0))
  })

  it('returns undefined for what is not a date', () => {
    expect(dateOf(undefined)).toBeUndefined()
    expect(dateOf(null)).toBeUndefined()
    expect(dateOf('ontem')).toBeUndefined()
    expect(dateOf(Number.NaN)).toBeUndefined()
  })
})
