<script setup lang="ts">
import type { EdgeDockState } from '../../shared/eventa'

import { useElectronEventaContext, useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onScopeDispose, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

import { electronEdgeDockGetState, electronEdgeDockStateChanged, electronEdgeDockToggle } from '../../shared/eventa'

const { t } = useI18n()
const { activeCard } = storeToRefs(useAiriCardStore())
const getState = useElectronEventaInvoke(electronEdgeDockGetState)
const toggle = useElectronEventaInvoke(electronEdgeDockToggle)
const context = useElectronEventaContext()

// The tab shows first when she hides at the edge, so that is the state until main answers.
const tucked = shallowRef(true)
const label = computed(() => tucked.value
  ? t('tamagotchi.settings.pages.system.general.edge-dock.show', { name: activeCard.value?.name || 'Ruby' })
  : t('tamagotchi.settings.pages.system.general.edge-dock.hide'))

function applyState(state: EdgeDockState | undefined) {
  if (state)
    tucked.value = state.tucked
}

onScopeDispose(context.value.on(electronEdgeDockStateChanged, event => applyState(event?.body)))

onMounted(async () => {
  try {
    applyState(await getState())
  }
  catch (error) {
    console.warn('Failed to read the edge dock state:', error)
  }
})

async function toggleCharacter() {
  try {
    // Main answers at once with the target state, so the arrow turns while she slides.
    applyState(await toggle())
  }
  catch (error) {
    console.error('Failed to toggle the edge dock:', error)
  }
}
</script>

<template>
  <!--
    A plain button on purpose: the whole window is the tab. The buttons of @proj-airi/ui bring their own size,
    padding, and theme colors, and this tab must look the same on every desktop wallpaper.
  -->
  <button
    type="button"
    :aria-label="label"
    :title="label"
    :class="[
      'group relative h-screen w-screen box-border overflow-hidden',
      'flex items-center justify-center pl-[3px]',
      'rounded-r-xl border border-l-0 border-solid border-white/10',
      'bg-neutral-950/80 hover:bg-neutral-900/90 active:bg-neutral-800/90',
      'cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/60',
      'transition-colors duration-200 ease-out',
    ]"
    @click="toggleCharacter"
  >
    <!-- The Redragon red line along the screen edge. It grows and glows more on hover. -->
    <span
      aria-hidden="true"
      :class="[
        'absolute inset-y-4 left-0 w-[3px] rounded-r-full',
        'bg-[#d81f2a] shadow-[0_0_6px_#d81f2a99]',
        'group-hover:inset-y-2.5 group-hover:shadow-[0_0_10px_2px_#d81f2ad9]',
        'transition-all duration-200 ease-out',
      ]"
    />
    <span
      aria-hidden="true"
      :class="[
        'i-solar:alt-arrow-right-linear size-[18px] text-white',
        'transition-transform duration-300 ease-out',
        tucked ? 'group-hover:translate-x-0.5' : 'rotate-180 group-hover:-translate-x-0.5',
      ]"
    />
  </button>
</template>

<route lang="yaml">
meta:
  layout: stage
</route>
