import type { GenerateText } from '@proj-airi/agents'

import type { LearnedMemory, MemoryImportAgent } from './extract'

import { describe, expect, it, vi } from 'vitest'

import { createMemoryImportAgent, createMemoryImportConversation, MEMORY_IMPORT_INSTRUCTIONS, parseLearnedMemories, runMemoryImport } from './extract'

const EM_DASH = String.fromCharCode(0x2014)
const EN_DASH = String.fromCharCode(0x2013)

function fact(name: string, body: string, description = body): LearnedMemory {
  return { name, description, body }
}

function reply(entries: unknown[]) {
  return JSON.stringify({ entries })
}

describe('memory import instructions', () => {
  it('forbid invented facts and long dashes, and contain no dash themselves', () => {
    expect(MEMORY_IMPORT_INSTRUCTIONS).toContain('Não invente')
    expect(MEMORY_IMPORT_INSTRUCTIONS).toContain('Nunca use travessão longo nem meia-risca')
    expect(MEMORY_IMPORT_INSTRUCTIONS).not.toContain(EM_DASH)
    expect(MEMORY_IMPORT_INSTRUCTIONS).not.toContain(EN_DASH)
  })

  it('send the batch and the known facts as data after the instructions', () => {
    const conversation = createMemoryImportConversation('## Chat\n- oi', [fact('trabalho', 'x'.repeat(500), 'Designer.')])
    const [system, user] = conversation.turns

    expect(system).toMatchObject({ type: 'system', authority: 'system', content: [{ type: 'text', text: MEMORY_IMPORT_INSTRUCTIONS }] })
    if (user.type !== 'user')
      throw new Error('The second turn is not the batch')
    const payload = JSON.parse((user.content as { text: string }[])[0].text)
    expect(payload.messages).toBe('## Chat\n- oi')
    expect(payload.knownMemories).toEqual([{ name: 'trabalho', description: 'Designer.', body: 'x'.repeat(400) }])
  })
})

describe('parseLearnedMemories', () => {
  it('reads fenced JSON and normalizes names', () => {
    expect(parseLearnedMemories('```json\n{"entries": [{"name": "Gosta de Café", "description": "Gosta de café coado.", "body": "Toma café coado toda manhã."}]}\n```')).toEqual([
      { name: 'gosta-de-café', description: 'Gosta de café coado.', body: 'Toma café coado toda manhã.' },
    ])
  })

  it('reads the first object when the model writes a sentence around it', () => {
    expect(parseLearnedMemories('Aqui está: {"entries": []} Pronto.')).toEqual([])
  })

  it('drops entries without a name or a body, cuts long fields, and replaces forbidden dashes', () => {
    const learned = parseLearnedMemories(reply([
      { name: '', description: 'x', body: 'x' },
      { name: 'empty-body', description: 'x', body: '   ' },
      { name: 'wrong', description: 1, body: 'x' },
      'not an entry',
      { name: 'rotina', description: `Treina cedo ${EM_DASH} antes do trabalho.`, body: `Treina das 6${EN_DASH}7h. ${'a'.repeat(700)}` },
    ]))

    expect(learned).toHaveLength(1)
    expect(learned[0].name).toBe('rotina')
    expect(learned[0].description).toBe('Treina cedo, antes do trabalho.')
    expect(learned[0].body.startsWith('Treina das 6-7h.')).toBe(true)
    expect(learned[0].body).toHaveLength(600)
    expect(learned.map(entry => `${entry.description}${entry.body}`).join('')).not.toMatch(new RegExp(`[${EM_DASH}${EN_DASH}]`))
  })

  it('throws when the reply has no entries list', () => {
    expect(() => parseLearnedMemories('{"facts": []}')).toThrow()
    expect(() => parseLearnedMemories('sem JSON aqui')).toThrow()
  })
})

describe('createMemoryImportAgent', () => {
  it('asks the connected model once per batch and reads its reply', async () => {
    const generateText = vi.fn<GenerateText>(async () => reply([{ name: 'cidade', description: 'Mora em Curitiba.', body: 'Mora em Curitiba.' }]))
    const signal = new AbortController().signal
    const agent = createMemoryImportAgent({ generateText })

    await expect(agent.extract('## Chat\n- moro em Curitiba', [], signal)).resolves.toEqual([fact('cidade', 'Mora em Curitiba.')])
    expect(generateText).toHaveBeenCalledTimes(1)
    expect(generateText.mock.calls[0][1]).toBe(signal)
  })
})

describe('runMemoryImport', () => {
  function agentOf(replies: (LearnedMemory[] | Error)[]) {
    const known: LearnedMemory[][] = []
    const agent: MemoryImportAgent = {
      extract: vi.fn(async (_batch: string, current: readonly LearnedMemory[]) => {
        known.push([...current])
        const next = replies.shift()
        if (next instanceof Error)
          throw next
        return next ?? []
      }),
    }
    return { agent, known }
  }

  // A fact with the name of a memory that exists updates it, so the person sees it as an update.
  it('merges facts by name and marks the ones that update a known memory', async () => {
    const { agent, known } = agentOf([
      [fact('trabalho', 'Designer de jogos.'), fact('cidade', 'Mora em Porto Alegre.')],
      [fact('cidade', 'Mora em Porto Alegre, no bairro Bom Fim.')],
    ])
    const progress = vi.fn()

    const result = await runMemoryImport({
      agent,
      batches: ['a', 'b'],
      known: [fact('trabalho', 'Trabalha com jogos.')],
      signal: new AbortController().signal,
      onProgress: progress,
    })

    expect(result).toEqual({
      failed: 0,
      memories: [
        { ...fact('trabalho', 'Designer de jogos.'), updates: true },
        { ...fact('cidade', 'Mora em Porto Alegre, no bairro Bom Fim.'), updates: false },
      ],
    })
    expect(known[1].map(entry => entry.body)).toEqual(['Designer de jogos.', 'Mora em Porto Alegre.'])
    expect(progress.mock.calls).toEqual([[1, 2], [2, 2]])
  })

  it('skips facts that did not change', async () => {
    const { agent } = agentOf([[fact('trabalho', 'Trabalha com jogos.')]])

    const result = await runMemoryImport({ agent, batches: ['a'], known: [fact('trabalho', 'Trabalha com jogos.')], signal: new AbortController().signal })

    expect(result.memories).toEqual([])
  })

  it('adds at most the limit of new facts but still applies updates', async () => {
    const { agent } = agentOf([
      [fact('a', '1'), fact('b', '2')],
      [fact('c', '3'), fact('a', '1 mais')],
    ])

    const result = await runMemoryImport({ agent, batches: ['x', 'y'], known: [], signal: new AbortController().signal, limit: 2 })

    expect(result.memories.map(entry => [entry.name, entry.body])).toEqual([['a', '1 mais'], ['b', '2']])
  })

  it('adds at most 12 new facts from one reply', async () => {
    const { agent } = agentOf([Array.from({ length: 20 }, (_, index) => fact(`fato-${index}`, `${index}`))])

    const result = await runMemoryImport({ agent, batches: ['x'], known: [], signal: new AbortController().signal })

    expect(result.memories).toHaveLength(12)
  })

  it('counts a failed batch and goes on with the next', async () => {
    const { agent } = agentOf([new Error('rate limit'), [fact('gosto', 'Gosta de jogos de ritmo.')]])

    const result = await runMemoryImport({ agent, batches: ['x', 'y'], known: [], signal: new AbortController().signal })

    expect(result).toEqual({ failed: 1, memories: [{ ...fact('gosto', 'Gosta de jogos de ritmo.'), updates: false }] })
  })

  it('rejects when the person cancels', async () => {
    const controller = new AbortController()
    const agent: MemoryImportAgent = {
      extract: vi.fn(async () => {
        controller.abort()
        throw new DOMException('Aborted', 'AbortError')
      }),
    }

    await expect(runMemoryImport({ agent, batches: ['x', 'y'], known: [], signal: controller.signal })).rejects.toThrow('Aborted')
    expect(agent.extract).toHaveBeenCalledTimes(1)
  })
})
