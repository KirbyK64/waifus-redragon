<script setup lang="ts">
import type { EdgeDockState } from '../../../../shared/eventa'

import SettingsGeneralFields from '@proj-airi/stage-pages/components/settings-general-fields.vue'

import { useElectronEventaContext, useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { FieldCheckbox } from '@proj-airi/ui'
import { useEventListener } from '@vueuse/core'
import { onMounted, onScopeDispose, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

import { electron, electronAppIconGet, electronAppIconSet, electronEdgeDockGetState, electronEdgeDockSetEnabled, electronEdgeDockStateChanged } from '../../../../shared/eventa'

const { t } = useI18n()
const getHidden = useElectronEventaInvoke(electronAppIconGet)
const setHidden = useElectronEventaInvoke(electronAppIconSet)
const isLinux = useElectronEventaInvoke(electron.app.isLinux)
// The value stays undefined on Linux, and the field does not show there.
const hideAppIcon = shallowRef<boolean>()

onMounted(async () => {
  try {
    if (!await isLinux())
      hideAppIcon.value = await getHidden()
  }
  catch {
    toast.error(t('tamagotchi.settings.pages.system.general.hide-app-icon.load-error'))
  }
})

async function updateHidden(hidden: boolean) {
  try {
    hideAppIcon.value = await setHidden(hidden)
  }
  catch {
    toast.error(t('tamagotchi.settings.pages.system.general.hide-app-icon.save-error'))
  }
}

const getEdgeDockState = useElectronEventaInvoke(electronEdgeDockGetState)
const setEdgeDockEnabled = useElectronEventaInvoke(electronEdgeDockSetEnabled)
const eventaContext = useElectronEventaContext()
// The value stays undefined where the dock cannot work (Wayland), and the field does not show there.
const edgeDock = shallowRef<boolean>()

function applyEdgeDockState(state: EdgeDockState | undefined) {
  edgeDock.value = state?.supported ? state.enabled : undefined
}

async function loadEdgeDock(options: { quiet?: boolean } = {}) {
  try {
    applyEdgeDockState(await getEdgeDockState())
  }
  catch {
    if (!options.quiet)
      toast.error(t('tamagotchi.settings.pages.system.general.edge-dock.load-error'))
  }
}

async function updateEdgeDock(enabled: boolean) {
  try {
    applyEdgeDockState(await setEdgeDockEnabled(enabled))
  }
  catch {
    toast.error(t('tamagotchi.settings.pages.system.general.edge-dock.save-error'))
  }
}

onMounted(() => void loadEdgeDock())
// The tray can change the option while this page is open in its own window, so the page reads it again on focus.
useEventListener(window, 'focus', () => void loadEdgeDock({ quiet: true }))
// Inside the fullscreen mode of the main window, the page also hears each change at once.
onScopeDispose(eventaContext.value.on(electronEdgeDockStateChanged, event => applyEdgeDockState(event?.body)))
</script>

<template>
  <SettingsGeneralFields>
    <template #additional-fields>
      <FieldCheckbox
        v-if="hideAppIcon !== undefined"
        :model-value="hideAppIcon"
        :label="t('tamagotchi.settings.pages.system.general.hide-app-icon.title')"
        :description="t('tamagotchi.settings.pages.system.general.hide-app-icon.description')"
        @update:model-value="updateHidden"
      />
      <FieldCheckbox
        v-if="edgeDock !== undefined"
        :model-value="edgeDock"
        :label="t('tamagotchi.settings.pages.system.general.edge-dock.title')"
        :description="t('tamagotchi.settings.pages.system.general.edge-dock.description')"
        @update:model-value="updateEdgeDock"
      />
    </template>
  </SettingsGeneralFields>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.system.general.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
</route>
