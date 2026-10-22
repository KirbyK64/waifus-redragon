<script setup lang="ts">
import type { ActivationCheck } from '../composables/use-waifus-activation'

import { computed, onMounted, ref } from 'vue'

import duoArt from '../assets/waifus/duo.webp'

import { checkActivationCode, useWaifusActivation, WAIFUS_APP_CODE } from '../composables/use-waifus-activation'

const emit = defineEmits<{
  (e: 'configured'): void
  (e: 'skipped'): void
}>()

type Status = 'checking' | 'saving' | 'done' | 'failed' | Exclude<ActivationCheck, 'ok'>

const status = ref<Status>('checking')
const { activate } = useWaifusActivation()

// The texts are pt-BR only: this build is for the Redragon team. Nothing here asks for a code or a password:
// the app carries its own key for the bridge (see WAIFUS_APP_CODE).
const STATUS_TEXT: Record<Status, string> = {
  checking: 'Acordando a Ruby e a Violet...',
  saving: 'Quase lá: ligando a conversa, a voz e o ouvido...',
  done: 'Pronto. Pode conversar com elas.',
  malformed: 'Esta cópia do app veio incompleta. Baixe o instalador de novo na página do app.',
  refused: 'Esta versão do app saiu do ar. Baixe a nova na página do app.',
  offline: 'Não consegui conectar. Veja a internet e tente de novo.',
  failed: 'Algo falhou ao preparar as duas. Feche e abra o app de novo.',
}
const statusText = computed(() => STATUS_TEXT[status.value])
const statusTone = computed(() => {
  if (status.value === 'done' || status.value === 'saving')
    return 'ok'
  if (status.value === 'checking')
    return 'info'
  return 'error'
})
const busy = computed(() => status.value === 'checking' || status.value === 'saving' || status.value === 'done')
const canRetry = computed(() => status.value === 'offline' || status.value === 'failed')

async function start() {
  status.value = 'checking'
  const check = await checkActivationCode(WAIFUS_APP_CODE)
  if (check !== 'ok') {
    status.value = check
    return
  }

  status.value = 'saving'
  try {
    await activate(WAIFUS_APP_CODE)
  }
  catch (error) {
    console.error('[Waifus] Failed to configure the bridge providers.', error)
    status.value = 'failed'
    return
  }
  status.value = 'done'
  emit('configured')
}

onMounted(start)
</script>

<template>
  <div class="activation">
    <div class="art" aria-hidden="true">
      <div class="glow" />
      <img :src="duoArt" alt="" draggable="false">
    </div>

    <div class="panel">
      <p class="kicker">
        Waifus Redragon
      </p>
      <h1>Ruby e Violet no seu PC</h1>
      <p class="lead">
        Já já elas aparecem na sua tela, prontas pra conversar. Pra chamar pela voz, ligue o microfone na barrinha do lado dela e diga "Hey Ruby" ou "Hey Violet".
      </p>

      <p id="waifus-status" class="status" :class="statusTone" role="status" aria-live="polite">
        {{ statusText }}
      </p>

      <button v-if="canRetry" type="button" class="primary" @click="start">
        Tentar de novo
      </button>
      <button v-if="!busy" type="button" class="skip" @click="emit('skipped')">
        Abrir sem conversa
      </button>
    </div>
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
  margin: 0 0 20px;
  font-size: 15px;
  line-height: 1.55;
  color: var(--waifus-muted);
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
