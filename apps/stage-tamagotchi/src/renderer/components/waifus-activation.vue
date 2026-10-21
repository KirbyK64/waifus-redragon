<script setup lang="ts">
import type { ActivationCheck } from '../composables/use-waifus-activation'

import { computed, onMounted, ref, useTemplateRef } from 'vue'

import duoArt from '../assets/waifus/duo.webp'

import { checkActivationCode, normalizeActivationCode, useWaifusActivation } from '../composables/use-waifus-activation'

const emit = defineEmits<{
  (e: 'configured'): void
  (e: 'skipped'): void
}>()

type Status = 'idle' | 'checking' | 'saving' | 'done' | 'paste-blocked' | 'failed' | ActivationCheck

const code = ref('')
const status = ref<Status>('idle')
const input = useTemplateRef<HTMLInputElement>('input')
const { activate } = useWaifusActivation()

const busy = computed(() => status.value === 'checking' || status.value === 'saving' || status.value === 'done')

// The texts are pt-BR only: this build is for the Redragon team.
const STATUS_TEXT: Partial<Record<Status, string>> = {
  'checking': 'Conferindo o código...',
  'saving': 'Código aceito. Preparando a Ruby e a Violet...',
  'done': 'Pronto. Pode conversar com elas.',
  'paste-blocked': 'Não consegui ler a área de transferência. Clique no campo e aperte Ctrl+V.',
  'malformed': 'Esse não parece o nosso código: ele começa com wr- e tem 35 caracteres.',
  'refused': 'A Integraction não reconheceu esse código. Confira se ele veio inteiro ou peça um novo.',
  'offline': 'Não consegui falar com a Integraction. Veja a internet e tente de novo.',
  'failed': 'O código foi aceito, mas a configuração falhou. Feche e abra o app de novo.',
}
const statusText = computed(() => STATUS_TEXT[status.value] ?? '')
const statusTone = computed(() => {
  if (status.value === 'done' || status.value === 'saving')
    return 'ok'
  if (status.value === 'checking' || status.value === 'paste-blocked')
    return 'info'
  return 'error'
})

async function pasteCode() {
  try {
    code.value = normalizeActivationCode(await navigator.clipboard.readText())
    status.value = 'idle'
  }
  catch {
    status.value = 'paste-blocked'
  }
  input.value?.focus()
}

async function submit() {
  if (busy.value)
    return
  const value = normalizeActivationCode(code.value)
  code.value = value
  status.value = 'checking'
  const check = await checkActivationCode(value)
  if (check !== 'ok') {
    status.value = check
    input.value?.focus()
    return
  }

  status.value = 'saving'
  try {
    await activate(value)
  }
  catch (error) {
    console.error('[Waifus] Failed to configure the bridge providers.', error)
    status.value = 'failed'
    return
  }
  status.value = 'done'
  emit('configured')
}

onMounted(() => input.value?.focus())
</script>

<template>
  <div class="activation">
    <div class="art" aria-hidden="true">
      <div class="glow" />
      <img :src="duoArt" alt="" draggable="false">
    </div>

    <form class="panel" novalidate @submit.prevent="submit">
      <p class="kicker">
        Waifus Redragon
      </p>
      <h1>Ruby e Violet no seu PC</h1>
      <p class="lead">
        Cole o código de acesso que a Integraction te mandou. Com ele as duas conversam, falam com voz própria e atendem quando você chama "Hey Ruby" ou "Hey Violet".
      </p>

      <label for="waifus-code">Código de acesso</label>
      <div class="field">
        <input
          id="waifus-code"
          ref="input"
          v-model="code"
          type="text"
          inputmode="text"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          placeholder="wr-..."
          :disabled="busy"
          :aria-invalid="statusTone === 'error' && statusText !== ''"
          aria-describedby="waifus-status"
        >
        <button type="button" class="secondary" :disabled="busy" @click="pasteCode">
          Colar
        </button>
      </div>

      <p id="waifus-status" class="status" :class="statusTone" role="status" aria-live="polite">
        {{ statusText }}
      </p>

      <button type="submit" class="primary" :disabled="busy || code.trim() === ''">
        {{ busy ? 'Ativando...' : 'Ativar' }}
      </button>

      <p class="fine">
        O código é seu: não passe pra ninguém. Sem código, peça pro time da Integraction.
      </p>
      <button type="button" class="skip" :disabled="busy" @click="emit('skipped')">
        Pular por agora
      </button>
    </form>
  </div>
</template>

<style scoped>
.activation {
  --waifus-bg: #0f0f0f;
  --waifus-surface: #17171c;
  --waifus-line: #2e2e37;
  --waifus-text: #f3f3f6;
  --waifus-muted: #b4b4c0;
  --waifus-red: #d0202e;
  --waifus-red-hover: #e0303d;
  --waifus-violet: #8b5cf6;
  --waifus-ok: #4ade80;
  --waifus-error: #ff8590;

  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
  align-items: center;
  gap: 32px;
  height: 100%;
  min-height: 0;
  color: var(--waifus-text);
  background: var(--waifus-bg);
}

.art {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
  height: 100%;
}

.glow {
  position: absolute;
  inset: 12% 6%;
  border-radius: 50%;
  background:
    radial-gradient(closest-side at 35% 55%, rgb(208 32 46 / 0.32), transparent 70%),
    radial-gradient(closest-side at 68% 50%, rgb(139 92 246 / 0.3), transparent 70%);
  filter: blur(24px);
}

/* The art has a black background. Lighten drops it into the page and keeps the characters. */
.art img {
  position: relative;
  width: 100%;
  max-height: 100%;
  object-fit: contain;
  mix-blend-mode: lighten;
  user-select: none;
}

.panel {
  display: flex;
  flex-direction: column;
  max-width: 420px;
}

.kicker {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--waifus-muted);
}

h1 {
  margin: 0 0 12px;
  font-size: 30px;
  font-weight: 800;
  line-height: 1.15;
  text-wrap: balance;
}

.lead {
  margin: 0 0 28px;
  font-size: 15px;
  line-height: 1.55;
  color: var(--waifus-muted);
}

label {
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
}

.field {
  display: flex;
  gap: 8px;
}

input {
  flex: 1;
  min-width: 0;
  height: 44px;
  padding: 0 14px;
  border: 1px solid var(--waifus-line);
  border-radius: 10px;
  font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  font-size: 14px;
  color: var(--waifus-text);
  background: var(--waifus-surface);
  outline: none;
}

input::placeholder {
  color: #7d7d8a;
}

input:focus-visible {
  border-color: var(--waifus-violet);
  box-shadow: 0 0 0 3px rgb(139 92 246 / 0.35);
}

input[aria-invalid='true'] {
  border-color: var(--waifus-error);
}

button {
  border: 0;
  border-radius: 10px;
  font: inherit;
  cursor: pointer;
}

button:disabled {
  cursor: default;
  opacity: 0.55;
}

button:focus-visible {
  outline: 2px solid var(--waifus-violet);
  outline-offset: 2px;
}

.secondary {
  height: 44px;
  padding: 0 16px;
  border: 1px solid var(--waifus-line);
  font-weight: 600;
  color: var(--waifus-text);
  background: var(--waifus-surface);
}

.secondary:not(:disabled):hover {
  background: #202027;
}

.status {
  min-height: 36px;
  margin: 10px 0 6px;
  font-size: 13px;
  line-height: 1.45;
}

.status.ok {
  color: var(--waifus-ok);
}

.status.info {
  color: var(--waifus-muted);
}

.status.error {
  color: var(--waifus-error);
}

.primary {
  height: 48px;
  font-size: 16px;
  font-weight: 700;
  color: #fff;
  background: var(--waifus-red);
}

.primary:not(:disabled):hover {
  background: var(--waifus-red-hover);
}

.fine {
  margin: 14px 0 4px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--waifus-muted);
}

.skip {
  align-self: flex-start;
  padding: 6px 0;
  font-size: 13px;
  color: var(--waifus-muted);
  text-decoration: underline;
  text-underline-offset: 3px;
  background: none;
}

.skip:not(:disabled):hover {
  color: var(--waifus-text);
}

@media (max-width: 720px) {
  .activation {
    grid-template-columns: minmax(0, 1fr);
    align-content: start;
    gap: 12px;
    overflow-y: auto;
  }

  .art {
    height: 180px;
  }

  .panel {
    max-width: none;
  }

  h1 {
    font-size: 24px;
  }
}
</style>
