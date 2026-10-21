import type { ImportBatches, ImportedMemory, ImportSummary } from '../libs/memory-import'

import { computed, ref, shallowRef } from 'vue'

import { buildImportBatches, createMemoryImportAgent, readExport, runMemoryImport, summarizeImport } from '../libs/memory-import'
import { useMemoryStore } from '../stores/memory'
import { useConsciousnessStore } from '../stores/modules/consciousness'
import { useTextGeneration } from './text-generation'

/** Where the import page is: no file, file read, model reading, list to review, saved. */
export type MemoryImportPhase = 'idle' | 'reading' | 'ready' | 'extracting' | 'review' | 'saved'

export type MemoryImportError = 'empty' | 'unreadable' | 'no-model' | 'failed'

/** A learned fact in the review list. Only kept facts are saved. */
export interface MemoryImportItem extends ImportedMemory {
  keep: boolean
}

/**
 * Imports the conversations that the person exported from other chat apps as general memories, which every character
 * card reads.
 *
 * Use when:
 * - The memory import settings page needs its state. The file is read on the device. Only after `start`, the trimmed
 *   messages of the person go to the chat model of the consciousness module, the one that the person connected.
 *
 * Returns:
 * - `read`, which reads a picked file and prepares the batches without sending anything.
 * - `start` and `cancel`, which run and stop the extraction.
 * - `save`, which writes the kept facts as general memories. A fact with the name of a general memory replaces it.
 */
export function useMemoryImport() {
  const memory = useMemoryStore()
  const consciousness = useConsciousnessStore()
  const { generateText } = useTextGeneration()

  const phase = ref<MemoryImportPhase>('idle')
  const error = ref<MemoryImportError>()
  const fileName = ref('')
  const summary = shallowRef<ImportSummary>()
  const plan = shallowRef<ImportBatches>()
  const progress = ref({ done: 0, total: 0 })
  const items = ref<MemoryImportItem[]>([])
  const failed = ref(0)
  const saved = ref(0)
  let controller: AbortController | undefined

  const model = computed(() => consciousness.activeProvider && consciousness.activeModel
    ? { providerId: consciousness.activeProvider, model: consciousness.activeModel }
    : undefined)
  const kept = computed(() => items.value.filter(item => item.keep).length)

  function reset() {
    controller?.abort()
    controller = undefined
    phase.value = 'idle'
    error.value = undefined
    fileName.value = ''
    summary.value = undefined
    plan.value = undefined
    progress.value = { done: 0, total: 0 }
    items.value = []
    failed.value = 0
    saved.value = 0
  }

  async function read(file: File) {
    reset()
    phase.value = 'reading'
    fileName.value = file.name
    try {
      const conversations = await readExport(file)
      const batches = buildImportBatches(conversations)
      if (!batches.batches.length) {
        error.value = 'empty'
        phase.value = 'idle'
        return
      }
      summary.value = summarizeImport(conversations)
      plan.value = batches
      phase.value = 'ready'
    }
    catch (cause) {
      console.warn('[memory-import] The file could not be read:', cause)
      error.value = 'unreadable'
      phase.value = 'idle'
    }
  }

  async function start() {
    const selection = model.value
    if (!plan.value || phase.value !== 'ready')
      return
    if (!selection) {
      error.value = 'no-model'
      return
    }

    const current = new AbortController()
    controller = current
    error.value = undefined
    phase.value = 'extracting'
    progress.value = { done: 0, total: plan.value.batches.length }
    try {
      const result = await runMemoryImport({
        agent: createMemoryImportAgent({ generateText: generateText(selection) }),
        batches: plan.value.batches,
        known: memory.entries.filter(entry => !entry.persona),
        signal: current.signal,
        onProgress: (done, total) => {
          progress.value = { done, total }
        },
      })
      if (current.signal.aborted)
        return
      failed.value = result.failed
      if (result.failed === plan.value.batches.length) {
        error.value = 'failed'
        phase.value = 'ready'
        return
      }
      items.value = result.memories.map(entry => ({ ...entry, keep: true }))
      phase.value = 'review'
    }
    catch (cause) {
      if (!current.signal.aborted) {
        console.warn('[memory-import] The extraction failed:', cause)
        error.value = 'failed'
      }
      if (controller === current)
        phase.value = 'ready'
    }
    finally {
      if (controller === current)
        controller = undefined
    }
  }

  function cancel() {
    controller?.abort()
    controller = undefined
    if (phase.value === 'extracting')
      phase.value = 'ready'
  }

  function save() {
    let count = 0
    for (const item of items.value) {
      if (item.keep && memory.writeGeneral(item))
        count += 1
    }
    saved.value = count
    phase.value = 'saved'
  }

  return { phase, error, fileName, summary, plan, progress, items, kept, failed, saved, model, read, start, cancel, save, reset }
}
