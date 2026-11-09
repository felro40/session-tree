/**
 * Live refresh: refetch on the gateway's `sessions.changed` / `projects.changed` broadcasts
 * (pre-check 7), and poll as a fallback while the page is visible. Both go through `ctx.*` so
 * a plugin reload retires them.
 */
import type { PluginContext } from '@hermes/plugin-sdk'
import { useEffect, useRef } from 'react'

/** Fallback poll period (R17 / card 2: at least 5 s). */
export const POLL_MS = 10_000

export function useLiveRefresh(ctx: PluginContext, refresh: { sessions(): void; projects(): void }): void {
  const latest = useRef(refresh)

  useEffect(() => {
    latest.current = refresh
  })

  useEffect(() => {
    const offSessions = ctx.onEvent('sessions.changed', () => latest.current.sessions())
    const offProjects = ctx.onEvent('projects.changed', () => {
      latest.current.projects()
      latest.current.sessions()
    })
    const offPoll = ctx.setInterval(() => {
      if (document.visibilityState === 'visible') {
        latest.current.sessions()
        latest.current.projects()
      }
    }, POLL_MS)

    return () => {
      offSessions()
      offProjects()
      offPoll()
    }
  }, [ctx])
}
