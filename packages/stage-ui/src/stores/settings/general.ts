import messages from '@proj-airi/i18n/locales'

import { resolveSupportedLocale } from '@proj-airi/i18n'
import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'
import { onMounted } from 'vue'

export const useSettingsGeneral = defineStore('settings-general', () => {
  const language = useLocalStorageManualReset<string>('settings/language', '')
  const streamerMode = useLocalStorageManualReset<boolean>('settings/streamer-mode', false)

  const disableTransitions = useLocalStorageManualReset<boolean>('settings/disable-transitions', true)
  const usePageSpecificTransitions = useLocalStorageManualReset<boolean>('settings/use-page-specific-transitions', true)

  const websocketSecureEnabled = useLocalStorageManualReset<boolean>('settings/websocket/secure-enabled', false)

  function getLanguage() {
    let language = localStorage.getItem('settings/language')

    if (!language) {
      // NOTICE: Waifus Redragon is for a Brazilian team, so it starts in pt-BR
      // whatever the system language is. A language that the user picks still wins.
      language = 'pt-BR'
    }

    return resolveSupportedLocale(language, Object.keys(messages!))
  }

  function resetState() {
    language.reset()
    streamerMode.reset()
    disableTransitions.reset()
    usePageSpecificTransitions.reset()
    websocketSecureEnabled.reset()
  }

  onMounted(() => language.value = getLanguage())

  return {
    language,
    streamerMode,
    disableTransitions,
    usePageSpecificTransitions,
    websocketSecureEnabled,
    getLanguage,
    resetState,
  }
})
