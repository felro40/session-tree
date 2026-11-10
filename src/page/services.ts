/**
 * The page's long-lived services, made once per plugin load in `register(ctx)` and shared by the
 * Session Tree page and its settings page: the synced layout store (`LayoutSync`) and the
 * per-device preferences (`DevicePrefs`). Push, poll and timers all go through `ctx.*`, so a
 * plugin reload retires them.
 */
import { host } from '@hermes/plugin-sdk'
import type { PluginContext } from '@hermes/plugin-sdk'
import { useCallback, useSyncExternalStore } from 'react'

import { LAYOUT_CHANGED_EVENT, stateTransport } from '../api.ts'
import { restErrorText } from '../model/actions.ts'
import { DevicePrefs } from '../model/device-prefs.ts'
import { LayoutSync, NEWER_SCHEMA, POLL_MS } from '../model/layout-sync.ts'

/** The store was written by a newer Session Tree (B1 of the card-4 review): the page's banner. */
export const READ_ONLY_MESSAGE = 'Layout saved by a newer Session Tree version — changes here are not saved'

export interface Services {
  sync: LayoutSync
  prefs: DevicePrefs
}

export function createServices(ctx: PluginContext): Services {
  const sync = new LayoutSync(
    stateTransport(ctx),
    ctx.storage,
    { setTimeout: (fn, ms) => ctx.setTimeout(fn, ms) },
    {
      // LayoutSync calls this at most once per refusal kind per page lifetime, never per request.
      onRefused: (error, kind) =>
        host.notify(
          kind === NEWER_SCHEMA
            ? { kind: 'warning', title: 'Session Tree', message: READ_ONLY_MESSAGE }
            : { kind: 'error', title: 'Session Tree could not save the layout', message: restErrorText(error) }
        )
    }
  )

  ctx.onDispose(() => sync.dispose())
  // A reload or a closed tab: the next window adopts this window's unsent queue at once (NB1).
  ctx.addEventListener(window, 'pagehide', () => sync.release())
  // Push (card 1 pre-check 5: `broadcast_plugin_event` reaches `host.onEvent` in the Webapp; a
  // plugin `ctx.socket` never dials there), and the poll as the fallback, only while visible.
  ctx.onEvent(LAYOUT_CHANGED_EVENT, event => sync.onRemoteChange(event.payload))
  ctx.setInterval(() => {
    if (document.visibilityState === 'visible') {
      sync.poll()
    }
  }, POLL_MS)

  return { sync, prefs: new DevicePrefs(ctx.storage) }
}

/** Re-render on every visible change of the store; the value is a memo key. */
export function useSyncVersion(sync: LayoutSync): number {
  const subscribe = useCallback((listener: () => void) => sync.subscribe(listener), [sync])

  return useSyncExternalStore(subscribe, () => sync.changeVersion)
}

export function usePrefsVersion(prefs: DevicePrefs): number {
  const subscribe = useCallback((listener: () => void) => prefs.subscribe(listener), [prefs])

  return useSyncExternalStore(subscribe, () => prefs.changeVersion)
}
