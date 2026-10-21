<script setup lang="ts">
import { useMemoryImport } from '@proj-airi/stage-ui/composables/use-memory-import'
import { useMemoryStore } from '@proj-airi/stage-ui/stores/memory'
import { useProviderStore } from '@proj-airi/stage-ui/stores/providers/provider'
import { Button, Callout, Checkbox, Progress } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

const { t, locale } = useI18n()
const { enabled } = storeToRefs(useMemoryStore())
const { configuredChatProvidersMetadata } = storeToRefs(useProviderStore())
const memoryImport = useMemoryImport()
const { phase, error, fileName, summary, plan, progress, items, kept, failed, saved, model } = memoryImport

const KEY = 'settings.pages.modules.memory-long-term.import'
const HOW_TO = ['chatgpt', 'claude', 'gemini', 'grok'] as const

const fileInput = useTemplateRef<HTMLInputElement>('fileInput')

const providerName = computed(() => {
  const selection = model.value
  if (!selection)
    return ''
  return configuredChatProvidersMetadata.value.find(provider => provider.id === selection.providerId)?.localizedName ?? selection.providerId
})

const period = computed(() => {
  const { from, to } = summary.value ?? {}
  if (from === undefined || to === undefined)
    return ''
  const format = new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium' })
  return t(`${KEY}.summary.period`, { from: format.format(from), to: format.format(to) })
})

/** About four characters per token. The known memories and the reply add to it, so this is the floor. */
const tokens = computed(() => Math.max(1, Math.round((plan.value?.characters ?? 0) / 4 / 1000)))
const percent = computed(() => progress.value.total ? progress.value.done / progress.value.total * 100 : 0)

function pick() {
  fileInput.value?.click()
}

async function handleFile(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  target.value = ''
  if (file)
    await memoryImport.read(file)
}

onBeforeUnmount(() => memoryImport.cancel())
</script>

<template>
  <div :class="['flex flex-col', 'gap-4']">
    <p :class="['text-sm', 'text-neutral-500 dark:text-neutral-400']">
      {{ t(`${KEY}.description`) }}
    </p>

    <Callout v-if="!enabled" theme="orange" :label="t(`${KEY}.memory_off`)" />

    <section
      v-if="phase === 'idle' || phase === 'reading'"
      :class="['flex flex-col', 'gap-3', 'rounded-xl', 'bg-neutral-50 dark:bg-neutral-800/60', 'p-4']"
    >
      <h2 :class="['flex items-center', 'gap-2', 'text-sm font-medium']">
        <span :class="['i-solar:download-minimalistic-bold-duotone', 'text-lg', 'text-primary-500 dark:text-primary-400']" aria-hidden="true" />
        {{ t(`${KEY}.how.title`) }}
      </h2>
      <ul :class="['flex flex-col', 'gap-1.5', 'text-sm', 'text-neutral-600 dark:text-neutral-300']">
        <li v-for="source in HOW_TO" :key="source">
          {{ t(`${KEY}.how.${source}`) }}
        </li>
      </ul>
      <div :class="['flex flex-wrap items-center', 'gap-3', 'pt-1']">
        <Button
          variant="primary"
          icon="i-solar:folder-open-bold-duotone"
          :label="t(`${KEY}.choose`)"
          :loading="phase === 'reading'"
          @click="pick"
        />
        <span :class="['text-xs', 'text-neutral-500 dark:text-neutral-400']">
          {{ phase === 'reading' ? t(`${KEY}.reading`) : t(`${KEY}.choose_hint`) }}
        </span>
      </div>
    </section>

    <p v-if="error" :class="['text-sm', 'text-red-500']" role="alert">
      {{ t(`${KEY}.errors.${error.replace('-', '_')}`) }}
    </p>

    <template v-if="summary && plan && (phase === 'ready' || phase === 'extracting')">
      <section :class="['flex flex-col', 'gap-2', 'rounded-xl', 'bg-neutral-50 dark:bg-neutral-800/60', 'p-4']">
        <h2 :class="['flex items-center', 'gap-2', 'text-sm font-medium']">
          <span :class="['i-solar:chat-square-like-bold-duotone', 'text-lg', 'text-primary-500 dark:text-primary-400']" aria-hidden="true" />
          <span :class="['min-w-0 flex-1', 'truncate']">{{ t(`${KEY}.summary.title`, { file: fileName }) }}</span>
        </h2>
        <ul :class="['flex flex-col', 'gap-1', 'text-sm']">
          <li>{{ t(`${KEY}.summary.sources`, { sources: summary.sources.map(source => t(`${KEY}.sources.${source}`)).join(', ') }) }}</li>
          <li>{{ t(`${KEY}.summary.conversations`, { count: summary.conversations }) }}</li>
          <li>{{ t(`${KEY}.summary.messages`, { count: summary.messages }) }}</li>
          <li v-if="period">
            {{ period }}
          </li>
        </ul>
        <p :class="['text-xs', 'text-neutral-500 dark:text-neutral-400']">
          {{ t(`${KEY}.summary.plan`, { count: plan.conversations, tokens, batches: plan.batches.length }) }}
          <template v-if="plan.truncated">
            {{ t(`${KEY}.summary.truncated`) }}
          </template>
        </p>
      </section>

      <Callout v-if="model" theme="orange" :label="t(`${KEY}.warning.label`)">
        {{ t(`${KEY}.warning.body`, { provider: providerName, model: model.model }) }}
      </Callout>
      <Callout v-else theme="orange" :label="t(`${KEY}.errors.no_model`)">
        <RouterLink to="/settings/modules/consciousness" :class="['underline']">
          {{ t(`${KEY}.go_to_consciousness`) }}
        </RouterLink>
      </Callout>

      <div v-if="phase === 'extracting'" :class="['flex flex-col', 'gap-2']">
        <Progress :progress="percent" />
        <div :class="['flex items-center', 'gap-3']">
          <span :class="['flex-1', 'text-sm', 'text-neutral-500 dark:text-neutral-400']" role="status">
            {{ t(`${KEY}.progress`, { done: progress.done, total: progress.total }) }}
          </span>
          <Button icon="i-solar:close-circle-linear" :label="t(`${KEY}.cancel`)" @click="memoryImport.cancel()" />
        </div>
      </div>
      <div v-else :class="['flex flex-wrap', 'gap-2']">
        <Button variant="primary" icon="i-solar:magic-stick-3-bold-duotone" :label="t(`${KEY}.start`)" :disabled="!model" @click="memoryImport.start()" />
        <Button :label="t(`${KEY}.again`)" @click="memoryImport.reset()" />
      </div>
    </template>

    <section v-if="phase === 'review'" :class="['flex flex-col', 'gap-2', 'rounded-xl', 'bg-neutral-50 dark:bg-neutral-800/60', 'p-4']">
      <h2 :class="['flex items-center', 'gap-2', 'text-sm font-medium']">
        <span :class="['i-solar:notebook-bookmark-bold-duotone', 'text-lg', 'text-primary-500 dark:text-primary-400']" aria-hidden="true" />
        <span :class="['min-w-0 flex-1', 'truncate']">{{ t(`${KEY}.review.title`) }}</span>
        <span :class="['text-xs', 'text-neutral-400 dark:text-neutral-500']">{{ kept }}/{{ items.length }}</span>
      </h2>
      <p :class="['text-xs', 'text-neutral-500 dark:text-neutral-400']">
        {{ items.length ? t(`${KEY}.review.description`) : t(`${KEY}.review.empty`) }}
      </p>
      <p v-if="failed" :class="['text-xs', 'text-neutral-500 dark:text-neutral-400']">
        {{ t(`${KEY}.review.failed`, { count: failed }) }}
      </p>
      <ul v-if="items.length" :class="['flex flex-col', 'gap-2']">
        <li
          v-for="item in items"
          :key="item.name"
          :class="['flex items-start', 'gap-3', 'rounded-lg', 'bg-white dark:bg-neutral-900/60', 'px-3 py-2.5']"
        >
          <div :class="['min-w-0 flex-1', 'flex flex-col', 'gap-0.5']">
            <span :class="['flex items-center', 'gap-2', 'text-sm font-medium']">
              <span :class="['truncate']">{{ item.name }}</span>
              <span v-if="item.updates" :class="['rounded', 'bg-primary-100 dark:bg-primary-900/60', 'px-1.5', 'text-xs', 'text-primary-600 dark:text-primary-300']">{{ t(`${KEY}.review.updates`) }}</span>
            </span>
            <span v-if="item.description" :class="['text-xs', 'text-neutral-500 dark:text-neutral-400']">{{ item.description }}</span>
            <p :class="['pt-1', 'text-sm', 'whitespace-pre-wrap break-words']">
              {{ item.body }}
            </p>
          </div>
          <Checkbox v-model="item.keep" :aria-label="t(`${KEY}.review.keep`, { name: item.name })" />
        </li>
      </ul>
      <div :class="['flex flex-wrap', 'gap-2', 'pt-1']">
        <Button v-if="items.length" variant="primary" icon="i-solar:diskette-linear" :label="t(`${KEY}.save`, { count: kept })" :disabled="!kept" @click="memoryImport.save()" />
        <Button :label="t(`${KEY}.again`)" @click="memoryImport.reset()" />
      </div>
    </section>

    <section v-if="phase === 'saved'" :class="['flex flex-col', 'gap-3', 'rounded-xl', 'bg-neutral-50 dark:bg-neutral-800/60', 'p-4']">
      <p :class="['text-sm']" role="status">
        {{ t(`${KEY}.saved`, { count: saved }) }}
      </p>
      <div :class="['flex flex-wrap', 'gap-2']">
        <RouterLink to="/settings/modules/memory-long-term-memories" :class="['text-sm', 'underline', 'text-primary-600 dark:text-primary-300']">
          {{ t(`${KEY}.open_memories`) }}
        </RouterLink>
        <Button :label="t(`${KEY}.again`)" @click="memoryImport.reset()" />
      </div>
    </section>

    <input
      ref="fileInput"
      type="file"
      accept=".zip,.json,.html,.htm,.txt,.md,application/zip,application/json,text/html,text/plain"
      :class="['hidden']"
      @change="handleFile"
    >
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.modules.memory-long-term.import.title
  subtitleKey: settings.pages.modules.memory-long-term.title
  stageTransition:
    name: slide
</route>
