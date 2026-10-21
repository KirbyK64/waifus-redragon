import messages from '@proj-airi/i18n/locales'

import { createFallbackOptions, resolveSupportedLocale } from '@proj-airi/i18n'
import { createI18n } from 'vue-i18n'

function getLocale() {
  let language = localStorage.getItem('settings/language')

  if (!language) {
    // NOTICE: Waifus Redragon is for a Brazilian team, so it starts in pt-BR
    // whatever the system language is. A language that the user picks still wins.
    language = 'pt-BR'
  }

  return resolveSupportedLocale(language, Object.keys(messages!))
}

export const i18n = createI18n({
  legacy: false,
  locale: getLocale(),
  messages,
  ...createFallbackOptions(console.warn),
})
