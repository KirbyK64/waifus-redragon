import type { Rectangle } from 'electron'

import type { EdgeDockState } from '../../../shared/eventa'
import type { globalAppConfigSchema } from '../../configs/global'
import type { Config } from '../../libs/electron/persistence'
import type { I18n } from '../../libs/i18n'
import type { setupCaptionWindowManager } from '../caption'

import { join, resolve } from 'node:path'
import { env } from 'node:process'

import { useLogg } from '@guiiai/logg'
import { defineInvoke, defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import { isRendererUnavailable } from '@proj-airi/electron-vueuse/main'
import { animate, utils } from 'animejs'
import { app, BrowserWindow, ipcMain, screen } from 'electron'
import { debounce } from 'es-toolkit'
import { isLinux, isMacOS, isWindows } from 'std-env'

import icon from '../../../../resources/icon.png?asset'

import {
  electronEdgeDockGetState,
  electronEdgeDockSetEnabled,
  electronEdgeDockSlide,
  electronEdgeDockStateChanged,
  electronEdgeDockToggle,
} from '../../../shared/eventa'
import { resolveIsWayland } from '../../app/ozone'
import { onAppBeforeQuit } from '../../libs/bootkit/lifecycle'
import { baseUrl, getElectronMainDirname, load, withHashRoute } from '../../libs/electron/location'
import { createReusableWindow } from '../../libs/electron/window-manager'
import { createI18nService } from '../../services/airi/i18n'
import { excludeWindowFromTaskbar, showWindowOnAllWorkspaces } from '../shared/app-icon'
import { protectPrivilegedWindowNavigation, setWindowAlwaysOnTop, transparentWindowConfig } from '../shared/window'

/** Width of the tab at the left screen edge. The docked main window starts right after it. */
export const EDGE_TAB_WIDTH = 24
export const EDGE_TAB_HEIGHT = 76

/** Time of one slide of the character in or out of her window. */
const SLIDE_DURATION_MS = 300
/** Time of one glide of the window to the edge and back. */
const GLIDE_DURATION_MS = 320
/** A slide that the page does not finish in this extra time counts as done, so the window never stays stuck. */
const SLIDE_TIMEOUT_MARGIN_MS = 800
/** Quiet time after the last move before a moved window snaps back to the edge, where `moved` does not exist. */
const MOVE_SETTLE_MS = 400

type CaptionWindowManager = ReturnType<typeof setupCaptionWindowManager>

/**
 * Tells whether the edge dock can work on this platform.
 *
 * Wayland does not let an app place its own windows, so the dock cannot keep the character at the edge there.
 */
export function isEdgeDockSupported(): boolean {
  if (!isLinux)
    return true
  return !resolveIsWayland({
    explicitOzonePlatform: app.commandLine.getSwitchValue('ozone-platform'),
    ozonePlatformHint: app.commandLine.getSwitchValue('ozone-platform-hint'),
    env,
  })
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max))
}

/**
 * Keeps the main window at the left edge of its display, with a small tab that slides the character in and out.
 *
 * Use when:
 * - The user turns on the `edgeDock` option, from the tray or from the settings
 *
 * Expects:
 * - The main window exists and its page answers `electronEdgeDockSlide`
 * - The fullscreen mode reports its start and end through `setSuspended`
 *
 * Returns:
 * - N/A
 */
export class EdgeDock {
  private readonly log = useLogg('edge-dock').useGlobalConfig()
  private readonly supported = isEdgeDockSupported()
  private readonly mainWindow: BrowserWindow
  private readonly captionWindow: CaptionWindowManager
  private readonly appConfig: Config<typeof globalAppConfigSchema>
  private readonly i18n: I18n

  /** The target state: true from the start of a slide out until the next reveal starts. */
  private tucked = false
  /** True while the fullscreen mode covers the screen. The dock waits until the mode ends. */
  private suspended = false
  /** Where the window was before the dock moved it. The window goes back there when the dock turns off. */
  private boundsBeforeDock: Rectangle | undefined
  private captionHiddenByDock = false
  /** Grows with each tuck or reveal, so an older motion that ends late does nothing. */
  private motion = 0
  private glide: { animation: ReturnType<typeof animate>, finish: () => void } | undefined
  private quitting = false
  private tabContext: ReturnType<typeof createContext>['context'] | undefined
  private readonly listeners = new Set<(state: EdgeDockState) => void>()

  private readonly mainContext: ReturnType<typeof createContext>['context']
  private readonly requestSlide: (req: { visible: boolean, duration: number }, options?: { signal?: AbortSignal }) => Promise<void>

  private readonly tab = createReusableWindow(async () => {
    const window = new BrowserWindow({
      ...transparentWindowConfig(),
      title: 'Edge Tab',
      width: EDGE_TAB_WIDTH,
      height: EDGE_TAB_HEIGHT,
      show: false,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      acceptFirstMouse: true,
      // Like the main window, a panel on macOS stays above apps in fullscreen.
      type: isMacOS ? 'panel' : undefined,
      icon,
      webPreferences: {
        preload: join(getElectronMainDirname(), '../preload/index.mjs'),
        sandbox: false,
      },
    })

    excludeWindowFromTaskbar(window)
    if (isMacOS) {
      window.setWindowButtonVisibility(false)
      window.setHiddenInMissionControl(true)
    }
    showWindowOnAllWorkspaces(window)
    // One level above the main window, so the tab is never under her.
    setWindowAlwaysOnTop(window, true, 2)
    protectPrivilegedWindowNavigation(window)

    // Alt+F4 on the focused tab would remove the only way to bring her back from the edge.
    window.on('close', (event) => {
      if (!this.quitting)
        event.preventDefault()
    })

    // NOTICE:
    // The tab registers only the locale service, never the base window services. With the app service, App.vue sees
    // Windows and mounts the 5 px resize handles, which would cover the whole 24 px tab.
    // Removal condition: App.vue lets a page opt out of the resize handles.
    const { context } = createContext(ipcMain, window, { onlySameWindow: true })
    await createI18nService({ context, window, i18n: this.i18n })
    this.tabContext = context
    window.once('closed', () => {
      if (this.tabContext === context)
        this.tabContext = undefined
    })

    await load(window, withHashRoute(baseUrl(resolve(getElectronMainDirname(), '..', 'renderer')), '/edge-tab', {
      query: { 'stage-runtime': 'minimal', 'synced-leader': 'false' },
    }))

    return window
  })

  constructor(params: {
    mainWindow: BrowserWindow
    captionWindow: CaptionWindowManager
    appConfig: Config<typeof globalAppConfigSchema>
    i18n: I18n
    /** Whether the fullscreen mode is on now. Later changes come through `setSuspended`. */
    isFullscreen: () => boolean
  }) {
    this.mainWindow = params.mainWindow
    this.captionWindow = params.captionWindow
    this.appConfig = params.appConfig
    this.i18n = params.i18n
    this.suspended = params.isFullscreen()

    // `onlySameWindow` keeps the slide requests and the state events between main and the main window page.
    const { context } = createContext(ipcMain, this.mainWindow, { onlySameWindow: true })
    this.mainContext = context
    this.requestSlide = defineInvoke(context, electronEdgeDockSlide)

    // The tab, the settings and the tray ask from different windows, so these handlers answer any sender.
    const { context: sharedContext } = createContext(ipcMain)
    defineInvokeHandler(sharedContext, electronEdgeDockGetState, () => this.state)
    defineInvokeHandler(sharedContext, electronEdgeDockSetEnabled, payload => this.setEnabled(Boolean(payload)))
    defineInvokeHandler(sharedContext, electronEdgeDockToggle, () => this.toggle())

    this.listenToMainWindow()
    this.listenToDisplays()

    onAppBeforeQuit(() => {
      this.quitting = true
      this.stopGlide()
    })

    if (this.active)
      this.enter({ tuck: true })
  }

  /** The persisted option. The dock can still wait for the end of the fullscreen mode. */
  get enabled(): boolean {
    return this.supported && this.appConfig.get()?.edgeDock === true
  }

  /** Whether the dock places the window now. */
  get active(): boolean {
    return this.enabled && !this.suspended
  }

  get state(): EdgeDockState {
    return { supported: this.supported, enabled: this.enabled, tucked: this.active && this.tucked }
  }

  get isSupported(): boolean {
    return this.supported
  }

  /** Whether the main window must keep its saved position, because the dock placed it and will return it there. */
  ownsBounds(): boolean {
    return this.enabled
  }

  onChange(listener: (state: EdgeDockState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Turns the dock on or off and saves the choice. Resolves at once with the new state, the motion runs on. */
  setEnabled(value: boolean): EdgeDockState {
    if (!this.supported || value === this.enabled)
      return this.state

    this.appConfig.update({ ...this.appConfig.get(), edgeDock: value })
    if (value) {
      if (!this.suspended)
        this.enter({ tuck: true })
      else
        this.emitState()
    }
    else {
      this.leave()
    }
    return this.state
  }

  /** Tucks the character when she shows and reveals her when she is tucked. Returns the new target state at once. */
  toggle(): EdgeDockState {
    if (!this.active)
      return this.state
    if (this.tucked)
      void this.reveal({ focus: true })
    else
      void this.tuck()
    return this.state
  }

  /**
   * Called by the main window when the user closes it. Returns `false` when the dock is off, so the window hides as
   * before.
   */
  tuckOnClose(): boolean {
    if (!this.active)
      return false
    void this.tuck()
    return true
  }

  /** Slides the character out of her window, then hides the window. The tab stays. */
  async tuck(): Promise<void> {
    if (!this.active || this.tucked || this.mainWindow.isDestroyed())
      return

    const motion = ++this.motion
    this.tucked = true
    this.emitState()
    this.hideCaption()
    if (this.mainWindow.isVisible())
      await this.slide(false, SLIDE_DURATION_MS)
    else
      await this.slide(false, 0)

    if (motion !== this.motion || !this.tucked || this.mainWindow.isDestroyed())
      return
    this.mainWindow.hide()
  }

  /** Shows the window at the edge and slides the character in. When the dock is off, it only shows the window. */
  async reveal(options: { focus?: boolean } = {}): Promise<void> {
    const window = this.mainWindow
    if (window.isDestroyed())
      return

    if (!this.active || !this.tucked) {
      if (window.isMinimized())
        window.restore()
      window.show()
      if (options.focus)
        window.focus()
      return
    }

    const motion = ++this.motion
    this.tucked = false
    this.emitState()
    if (window.isMinimized())
      window.restore()
    // A display can change while she hides, so she comes back at the edge of the display she is on now.
    window.setBounds(this.dockedBounds(window.getBounds()))
    if (options.focus) {
      window.show()
      window.focus()
    }
    else {
      window.showInactive()
    }
    this.showCaption()
    void this.showTab()
    await this.slide(true, SLIDE_DURATION_MS)
    if (motion !== this.motion)
      return
    this.tab.getOpenWindow()?.moveTop()
  }

  /**
   * Pauses the dock while the fullscreen mode covers the screen. A fullscreen window is never docked, so the tab hides
   * and the character shows in place. When the mode ends, the window comes back to the edge.
   */
  setSuspended(value: boolean): void {
    if (this.suspended === value)
      return

    if (value) {
      const wasActive = this.active
      this.suspended = true
      this.motion++
      this.stopGlide()
      this.tucked = false
      this.hideTab()
      this.showCaption()
      // The fullscreen surfaces use fixed elements, which a transform on the page would move.
      if (wasActive)
        void this.slide(true, 0)
      this.emitState()
      return
    }

    this.suspended = false
    if (this.enabled) {
      this.enter({ tuck: false })
      return
    }
    // The dock went off during the fullscreen mode, and the mode just put the window back at the edge.
    if (this.boundsBeforeDock)
      void this.returnFromEdge()
    this.emitState()
  }

  /** Moves the window to the edge and shows the tab. With `tuck`, the character then slides out. */
  private enter(options: { tuck: boolean }): void {
    const window = this.mainWindow
    if (window.isDestroyed())
      return

    this.boundsBeforeDock ??= window.getBounds()
    const docked = this.dockedBounds(window.getBounds())

    if (!window.isVisible()) {
      // A hidden window has nothing to show on the way, so it moves at once and stays tucked.
      this.motion++
      window.setBounds(docked)
      this.tucked = true
      void this.slide(false, 0)
      this.emitState()
      void this.showTab()
      return
    }

    this.tucked = false
    this.emitState()
    const motion = ++this.motion
    void this.glideTo(docked).then(() => {
      if (motion !== this.motion || !this.active)
        return
      void this.showTab()
      if (options.tuck)
        void this.tuck()
    })
  }

  /** Hides the tab, slides the character back in if she hides, and returns the window to where it was. */
  private leave(): void {
    const window = this.mainWindow
    const wasTucked = this.tucked
    this.tucked = false
    const motion = ++this.motion
    this.hideTab()
    this.emitState()
    if (window.isDestroyed())
      return

    // The fullscreen mode owns the window now. It returns to the edge when the mode ends, and leaves from there.
    if (this.suspended)
      return

    void (async () => {
      if (wasTucked) {
        if (window.isMinimized())
          window.restore()
        window.showInactive()
        this.showCaption()
        await this.slide(true, SLIDE_DURATION_MS)
        if (motion !== this.motion)
          return
      }
      await this.returnFromEdge()
    })()
  }

  /** Glides the window back to its place from before the dock, kept inside the display. */
  private async returnFromEdge(): Promise<void> {
    const window = this.mainWindow
    const before = this.boundsBeforeDock
    this.boundsBeforeDock = undefined
    if (!before || window.isDestroyed())
      return

    const current = window.getBounds()
    const workArea = screen.getDisplayMatching(before).workArea
    await this.glideTo({
      x: clamp(before.x, workArea.x, workArea.x + workArea.width - current.width),
      y: clamp(before.y, workArea.y, workArea.y + workArea.height - current.height),
      width: current.width,
      height: current.height,
    })
  }

  /** Where the window stays while docked: right after the tab, at the height the user chose, on its own display. */
  private dockedBounds(from: Rectangle): Rectangle {
    const workArea = screen.getDisplayMatching(from).workArea
    return {
      x: workArea.x + EDGE_TAB_WIDTH,
      y: clamp(from.y, workArea.y, workArea.y + workArea.height - from.height),
      width: from.width,
      height: from.height,
    }
  }

  /** The tab sits flush with the left edge of the work area, centered on the main window. */
  private tabBounds(): Rectangle {
    const main = this.mainWindow.getBounds()
    const workArea = screen.getDisplayMatching(main).workArea
    const centerY = main.y + Math.round(main.height / 2)
    return {
      x: workArea.x,
      y: clamp(centerY - Math.round(EDGE_TAB_HEIGHT / 2), workArea.y, workArea.y + workArea.height - EDGE_TAB_HEIGHT),
      width: EDGE_TAB_WIDTH,
      height: EDGE_TAB_HEIGHT,
    }
  }

  private placeTab(): void {
    const tab = this.tab.getOpenWindow()
    if (!tab || this.mainWindow.isDestroyed())
      return
    // `setBounds` with the size, never `setPosition`: see the NOTICE in `glideTo`.
    tab.setBounds(this.tabBounds())
  }

  private async showTab(): Promise<void> {
    if (!this.active)
      return
    try {
      const tab = await this.tab.getWindow()
      if (!this.active || tab.isDestroyed())
        return
      tab.setBounds(this.tabBounds())
      if (!tab.isVisible())
        tab.showInactive()
      tab.moveTop()
      this.emitState()
    }
    catch (error) {
      // Without a tab she cannot come back from the edge, so she shows and stays.
      this.log.withError(error).error('Failed to show the edge tab, the character stays shown')
      if (this.tucked)
        await this.reveal({ focus: false })
    }
  }

  private hideTab(): void {
    const tab = this.tab.getOpenWindow()
    if (tab?.isVisible())
      tab.hide()
  }

  private hideCaption(): void {
    if (!this.captionWindow.isVisible() || !this.captionWindow.getIsFollowingWindow())
      return
    this.captionHiddenByDock = true
    void this.captionWindow.getWindow().then((caption) => {
      if (!caption.isDestroyed() && this.tucked)
        caption.hide()
    }).catch(error => this.log.withError(error).warn('Failed to hide the caption at the edge'))
  }

  private showCaption(): void {
    if (!this.captionHiddenByDock)
      return
    this.captionHiddenByDock = false
    void this.captionWindow.getWindow().then((caption) => {
      if (!caption.isDestroyed() && !caption.isVisible())
        caption.showInactive()
    }).catch(error => this.log.withError(error).warn('Failed to show the caption again'))
  }

  /**
   * Asks the main window page to slide the character. Resolves when the slide ends, when a newer slide replaces it, or
   * after a timeout.
   *
   * NOTICE:
   * The character slides inside her own window, with a CSS transform on the page, and the window stays where it is.
   * Moving the window past the screen edge looks the same but breaks in three ways. A display at the left of this one
   * would show her there. Windows moves a window back on screen when the work area changes. Above 100% scaling,
   * each move of the window changes its size a little (electron/electron#9477). The window hides only after the
   * page has painted her out, so nothing of her stays at the edge, and it never leaves its display.
   * Removal: none planned, this is the design of the dock.
   */
  private async slide(visible: boolean, duration: number): Promise<void> {
    if (isRendererUnavailable(this.mainWindow))
      return
    try {
      await this.requestSlide({ visible, duration }, { signal: AbortSignal.timeout(duration + SLIDE_TIMEOUT_MARGIN_MS) })
    }
    catch (error) {
      // The page can be loading. It asks for the state when it mounts, and tucks itself then.
      this.log.withError(error).debug('The main window page did not finish the edge slide')
    }
  }

  private stopGlide(): void {
    const glide = this.glide
    this.glide = undefined
    glide?.animation.pause()
    glide?.finish()
  }

  /** Moves the window to `target` and keeps its size. A hidden window moves at once. */
  private glideTo(target: Rectangle): Promise<void> {
    this.stopGlide()
    const window = this.mainWindow
    if (window.isDestroyed())
      return Promise.resolve()

    const start = window.getBounds()
    const size = { width: start.width, height: start.height }
    if (!window.isVisible() || (start.x === target.x && start.y === target.y)) {
      window.setBounds({ x: target.x, y: target.y, ...size })
      this.placeTab()
      return Promise.resolve()
    }

    const state = { x: start.x, y: start.y }
    return new Promise<void>((resolve) => {
      const glide = {
        finish: resolve,
        animation: animate(state, {
          x: target.x,
          y: target.y,
          duration: GLIDE_DURATION_MS,
          ease: 'outCubic',
          modifier: utils.round(0),
          onRender: () => {
            // NOTICE:
            // Above 100% scaling on Windows, `setPosition` reuses the rounded window size, so each call changes it a
            // little. A glide calls it each frame, and the window would grow. `setBounds` with the size keeps it.
            // Source: https://github.com/electron/electron/issues/9477
            // Removal: Electron keeps the size of a window that `setPosition` moves.
            if (!window.isDestroyed())
              window.setBounds({ x: state.x, y: state.y, ...size })
          },
          onComplete: () => {
            if (this.glide === glide)
              this.glide = undefined
            this.placeTab()
            resolve()
          },
        }),
      }
      this.glide = glide
    })
  }

  /** Brings a window that the user moved or resized away from the edge back to it. */
  private readonly snapBack = (): void => {
    const window = this.mainWindow
    if (!this.active || this.tucked || this.glide || window.isDestroyed() || !window.isVisible())
      return

    const bounds = window.getBounds()
    const docked = this.dockedBounds(bounds)
    if (Math.abs(bounds.x - docked.x) <= 1 && Math.abs(bounds.y - docked.y) <= 1) {
      this.placeTab()
      return
    }
    void this.glideTo(docked)
  }

  private listenToMainWindow(): void {
    const window = this.mainWindow
    const settleAfterMove = debounce(this.snapBack, MOVE_SETTLE_MS)
    const settleAfterResize = debounce(this.snapBack, MOVE_SETTLE_MS)

    // A tray click, a second launch, or a fullscreen surface can show the window while she hides. She slides in then,
    // instead of appearing out of nothing.
    const onShow = () => {
      if (!this.active || !this.tucked)
        return
      const motion = ++this.motion
      this.tucked = false
      this.emitState()
      window.setBounds(this.dockedBounds(window.getBounds()))
      this.showCaption()
      void this.showTab()
      void this.slide(true, SLIDE_DURATION_MS).then(() => {
        if (motion === this.motion)
          this.tab.getOpenWindow()?.moveTop()
      })
    }
    // Something else hid the window. She counts as tucked, so the next show slides her in.
    const onHide = () => {
      if (!this.active || this.tucked)
        return
      this.motion++
      this.tucked = true
      this.hideCaption()
      void this.slide(false, 0)
      this.emitState()
    }
    const onMove = () => {
      if (!this.active)
        return
      // The tab follows a drag up or down at once.
      this.placeTab()
      if (!isWindows)
        settleAfterMove()
    }
    const onResize = () => {
      if (this.active)
        settleAfterResize()
    }

    window.on('show', onShow)
    window.on('hide', onHide)
    window.on('move', onMove)
    window.on('resize', onResize)
    // NOTICE:
    // Windows sends `moved` once, when the user drops the window after a drag, and never for `setBounds`. macOS sends
    // it for every move, and Linux never sends it, so those platforms wait for the moves to settle instead.
    // Source: https://www.electronjs.org/docs/latest/api/browser-window#event-moved-macos-windows
    // Removal: Electron sends a drag end event on every platform.
    if (isWindows)
      window.on('moved', this.snapBack)

    window.once('closed', () => {
      settleAfterMove.cancel()
      settleAfterResize.cancel()
      this.stopGlide()
      this.tab.close()
    })
  }

  private listenToDisplays(): void {
    // A resolution change, a moved taskbar, or an unplugged display moves the work area under the docked window.
    const replace = debounce(() => {
      if (!this.active || this.mainWindow.isDestroyed())
        return
      this.stopGlide()
      this.mainWindow.setBounds(this.dockedBounds(this.mainWindow.getBounds()))
      this.placeTab()
    }, 200)

    screen.on('display-metrics-changed', replace)
    screen.on('display-added', replace)
    screen.on('display-removed', replace)
    onAppBeforeQuit(() => {
      replace.cancel()
      screen.off('display-metrics-changed', replace)
      screen.off('display-added', replace)
      screen.off('display-removed', replace)
    })
  }

  private emitState(): void {
    const state = this.state
    for (const listener of this.listeners)
      listener(state)

    if (!isRendererUnavailable(this.mainWindow))
      this.mainContext.emit(electronEdgeDockStateChanged, state).catch(error => this.log.withError(error).debug('Failed to send the edge dock state to the main window'))

    const tab = this.tab.getOpenWindow()
    if (tab && this.tabContext && !isRendererUnavailable(tab))
      this.tabContext.emit(electronEdgeDockStateChanged, state).catch(error => this.log.withError(error).debug('Failed to send the edge dock state to the tab'))
  }
}
