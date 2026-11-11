/**
 * Live block status (R11), from the backend row and the SDK's `host.state` (pre-check 10):
 *
 * - running: the row's `is_active` (the core 300 s activity heuristic), or the session open in
 *   this window is mid-turn (`busy` / `busyBySession[focusedSessionId]`; `busyBySession` is keyed
 *   by runtime id and only the focused session's runtime → stored mapping is exposed).
 * - needs input: the SDK exposes no source (no `host.state` atom). The set is a parameter so a
 *   later source can feed it; today the page passes an empty set.
 * - unread: the row's `unread`; pinned: the row's `pinned`.
 * - open: `host.state.focusedStoredSessionId`.
 */
import type { SessionRow } from './sessions.ts'

export interface HostStatusSnapshot {
  busy: boolean
  busyBySession: Readonly<Record<string, boolean>>
  focusedSessionId: null | string
  focusedStoredSessionId: null | string
  /** Stored ids waiting on the user (no SDK source yet). */
  needsInput: ReadonlySet<string>
}

export type StatusTone = 'idle' | 'needs-input' | 'running' | 'unread'

export interface LiveStatus {
  running: boolean
  needsInput: boolean
  unread: boolean
  pinned: boolean
  open: boolean
  /** The one dot a compact block shows: running > needs input > unread > idle. */
  tone: StatusTone
}

export const EMPTY_HOST_STATUS: HostStatusSnapshot = {
  busy: false,
  busyBySession: {},
  focusedSessionId: null,
  focusedStoredSessionId: null,
  needsInput: new Set()
}

export function liveStatus(row: SessionRow, host: HostStatusSnapshot): LiveStatus {
  const ids = new Set([row.id, ...(row._lineage_ids ?? [])])
  const open = Boolean(host.focusedStoredSessionId && ids.has(host.focusedStoredSessionId))
  const focusedBusy = open && (host.busy || Boolean(host.focusedSessionId && host.busyBySession[host.focusedSessionId]))
  const running = Boolean(row.is_active) || focusedBusy || Boolean(host.busyBySession[row.id])
  const needsInput = [...ids].some(id => host.needsInput.has(id))
  const unread = Boolean(row.unread)

  return {
    running,
    needsInput,
    unread,
    pinned: Boolean(row.pinned),
    open,
    tone: running ? 'running' : needsInput ? 'needs-input' : unread ? 'unread' : 'idle'
  }
}
