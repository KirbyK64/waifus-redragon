import { readFileSync } from 'node:fs'

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useMemoryStore } from '../stores/memory'
import { useMemoryImport } from './use-memory-import'

const consciousness = vi.hoisted(() => ({ activeProvider: 'test-provider', activeModel: 'test-model' }))
const generated = vi.hoisted(() => ({ selections: [] as unknown[], requests: [] as string[], reply: '{"entries": []}' }))

vi.mock('../stores/modules/consciousness', () => ({ useConsciousnessStore: () => consciousness }))
vi.mock('./text-generation', () => ({
  useTextGeneration: () => ({
    generateText: (selection: unknown) => {
      generated.selections.push(selection)
      return async (conversation: { turns: { content: { text: string }[] }[] }) => {
        generated.requests.push(conversation.turns[1].content[0].text)
        return generated.reply
      }
    },
  }),
}))

function grokExport() {
  return new File([readFileSync(new URL('../libs/memory-import/fixtures/grok-prod-grok-backend.json', import.meta.url))], 'prod-grok-backend.json')
}

describe('useMemoryImport', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    consciousness.activeProvider = 'test-provider'
    consciousness.activeModel = 'test-model'
    generated.selections = []
    generated.requests = []
  })

  // Reading the file sends nothing. Only start sends the messages of the person to the connected model.
  it('reads the file on the device, then learns, reviews, and saves general memories', async () => {
    const memory = useMemoryStore()
    memory.writeGeneral({ name: 'viagem', description: 'Quer viajar.', body: 'Quer viajar.' })
    memory.write({ name: 'segredo', description: 'Da carta.', body: 'Só da Ruby.' }, 'ruby')
    const importer = useMemoryImport()

    await importer.read(grokExport())

    expect(importer.phase.value).toBe('ready')
    expect(importer.summary.value).toMatchObject({ sources: ['grok'], conversations: 1, messages: 1 })
    expect(importer.plan.value?.batches).toHaveLength(1)
    expect(generated.requests).toEqual([])

    generated.reply = JSON.stringify({ entries: [
      { name: 'viagem', description: 'Quer ir ao Japão em abril.', body: 'Quer ir ao Japão em abril ver as cerejeiras.' },
      { name: 'idiomas', description: 'Estuda japonês há um ano.', body: 'Estuda japonês há um ano.' },
      { name: 'errado', description: 'Fato errado.', body: 'Fato errado.' },
    ] })
    await importer.start()

    expect(generated.selections).toEqual([{ providerId: 'test-provider', model: 'test-model' }])
    const request = JSON.parse(generated.requests[0])
    expect(request.messages).toContain('Quero ir ao Japão em abril')
    expect(request.messages).not.toContain('hanami')
    expect(request.knownMemories.map((entry: { name: string }) => entry.name)).toEqual(['viagem'])
    expect(importer.phase.value).toBe('review')
    expect(importer.items.value.map(item => [item.name, item.updates])).toEqual([['viagem', true], ['idiomas', false], ['errado', false]])

    importer.items.value[2].keep = false
    expect(importer.kept.value).toBe(2)
    importer.save()

    expect(importer.phase.value).toBe('saved')
    expect(importer.saved.value).toBe(2)
    expect(memory.read('viagem', 'violet')?.body).toBe('Quer ir ao Japão em abril ver as cerejeiras.')
    expect(memory.read('idiomas', 'ruby')?.body).toBe('Estuda japonês há um ano.')
    expect(memory.read('errado', 'ruby')).toBeUndefined()
    expect(memory.entries.filter(entry => !entry.persona)).toHaveLength(2)
    expect(memory.read('segredo', 'ruby')?.body).toBe('Só da Ruby.')
  })

  it('reports a file without conversations and a missing chat model', async () => {
    const importer = useMemoryImport()

    await importer.read(new File(['{"users": []}'], 'users.json'))
    expect([importer.phase.value, importer.error.value]).toEqual(['idle', 'empty'])

    consciousness.activeModel = ''
    await importer.read(grokExport())
    await importer.start()
    expect([importer.phase.value, importer.error.value]).toEqual(['ready', 'no-model'])
    expect(generated.requests).toEqual([])
  })

  it('stays ready with an error when every part fails', async () => {
    const importer = useMemoryImport()
    generated.reply = 'not JSON'

    await importer.read(grokExport())
    await importer.start()

    expect([importer.phase.value, importer.error.value, importer.failed.value]).toEqual(['ready', 'failed', 1])
  })
})
