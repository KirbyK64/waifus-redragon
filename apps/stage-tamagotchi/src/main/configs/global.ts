import { array, boolean, object, optional, picklist, string } from 'valibot'

import { createConfig } from '../libs/electron/persistence'

const shortcutAcceleratorSchema = object({
  modifiers: array(picklist(['cmd-or-ctrl', 'cmd', 'ctrl', 'alt', 'shift', 'super'])),
  key: string(),
})

export const globalAppConfigSchema = object({
  /** Keeps the main window tucked behind the left screen edge with a small tab that reveals it. */
  edgeDock: optional(boolean()),
  hideAppIcon: optional(boolean()),
  language: optional(string()),
  spotlightShortcutAccelerator: optional(shortcutAcceleratorSchema),
  updateChannel: optional(picklist(['latest', 'stable', 'alpha', 'beta', 'nightly', 'canary'])),
})

export function createGlobalAppConfig() {
  const config = createConfig('app', 'options.json', globalAppConfigSchema)
  config.setup()

  return config
}
