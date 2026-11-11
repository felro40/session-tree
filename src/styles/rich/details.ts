/**
 * Rich cards (card 6): the per-session details a card shows beyond its row — the last-message
 * excerpt and the 7-day activity — fetched from the backend (`POST /sessions/details`) only for
 * cards in or near the viewport, batched (≤ 100 ids per request, per profile) and cached per
 * session. Pure (no React, no SDK): node:test drives the same object the page uses.
 *
 * - A card asks with a signature of what the details depend on (the row's last activity and
 *   message count, the local day and the time zone offset). A cached entry with that signature is
 *   current; one with another signature is shown while the new one loads (no flash back to the
 *   skeleton), and refetched: that is how a `sessions.changed` refetch refreshes exactly the
 *   sessions that changed.
 * - Details never reach the graph model, the layout or the routing chain: a card subscribes to
 *   its own entry (`subscribe(id)`), so an answer re-renders that card only.
 */
export interface CardDetails {
  /** The last user / assistant message as plain text, or `null` (the card shows `preview`). */
  excerpt: null | string
  role: null | string
  /** Messages per local day, oldest first, today last (7 values). */
  activity: number[]
  /** The 7 local dates (`YYYY-MM-DD`) `activity` counts. */
  days: string[]
}

export interface DetailsAnswer {
  days: string[]
  details: Record<string, { excerpt: null | string; excerpt_role: null | string; activity: number[] }>
}

export type FetchDetails = (profile: string, ids: string[], tzOffsetMinutes: number) => Promise<DetailsAnswer>

export interface Wanted {
  /** The card's key (the graph node id: unique across profiles); entries are kept under it. */
  key: string
  /** The stored session id the backend is asked for. */
  id: string
  profile: string
  sig: string
}

export interface DetailsEntry {
  /** `null`: the backend has no such session (deleted meanwhile). */
  details: CardDetails | null
  sig: string
}

export interface DetailsTimers {
  setTimeout(fn: () => void, ms: number): () => void
  now(): number
}

/** The backend's cap on ids per request. */
export const MAX_BATCH = 100
/** Wants arriving within this window go out as one request. */
export const BATCH_MS = 60
/** A failed id is not asked for again before this long. */
export const RETRY_AFTER_MS = 15_000
/** The most entries kept (a bound on top of `retain`; well over the 500-session fixture). */
export const MAX_ENTRIES = 2000
const LOG_MAX = 200

/** What a session's details depend on: its row's activity and count, the local day, the offset. */
export function detailsSignature(row: { last_active?: null | number; message_count?: null | number; started_at?: null | number }, nowMs: number, tzOffsetMinutes: number): string {
  const day = Math.floor((nowMs / 1000 + tzOffsetMinutes * 60) / 86400)

  return `${row.last_active ?? row.started_at ?? 0}|${row.message_count ?? 0}|${day}|${tzOffsetMinutes}`
}

export class DetailsStore {
  private readonly fetchDetails: FetchDetails
  private readonly timers: DetailsTimers
  private readonly tz: () => number
  private readonly entries = new Map<string, DetailsEntry>()
  private readonly pending = new Map<string, Wanted>()
  /** id → the signature of its request in flight. */
  private readonly inflight = new Map<string, string>()
  private readonly failedAt = new Map<string, number>()
  private readonly listeners = new Map<string, Set<() => void>>()
  private cancelTimer: (() => void) | undefined
  private disposed = false
  /** Every request made (most recent last, capped): tests and the e2e's diagnostics. */
  readonly log: { profile: string; ids: string[] }[] = []

  constructor(fetchDetails: FetchDetails, timers: DetailsTimers, tzOffsetMinutes: () => number) {
    this.fetchDetails = fetchDetails
    this.timers = timers
    this.tz = tzOffsetMinutes
  }

  get(id: string): DetailsEntry | undefined {
    return this.entries.get(id)
  }

  /** Asks for the details of `items` (the cards near the viewport): only what is not current. */
  want(items: Iterable<Wanted>): void {
    if (this.disposed) {
      return
    }

    const now = this.timers.now()

    for (const item of items) {
      const failed = this.failedAt.get(item.key)

      if (this.entries.get(item.key)?.sig === item.sig || this.inflight.get(item.key) === item.sig || (failed !== undefined && now - failed < RETRY_AFTER_MS)) {
        continue
      }

      this.pending.set(item.key, item)
    }

    if (this.pending.size > 0 && !this.cancelTimer) {
      this.cancelTimer = this.timers.setTimeout(() => this.flush(), BATCH_MS)
    }
  }

  subscribe(id: string, listener: () => void): () => void {
    let set = this.listeners.get(id)

    if (!set) {
      set = new Set()
      this.listeners.set(id, set)
    }

    set.add(listener)

    return () => {
      set.delete(listener)

      if (set.size === 0) {
        this.listeners.delete(id)
      }
    }
  }

  dispose(): void {
    this.disposed = true
    this.cancelTimer?.()
    this.cancelTimer = undefined
    this.pending.clear()
  }

  /**
   * Card 7 (card-6 review r1 N5): forgets every card not in `keys` (the sessions of the loaded
   * data): its entry, its failure mark, its pending want, and an answer still in flight for it.
   * Then, past `MAX_ENTRIES`, the oldest entries go too (a bound, whatever the caller passes).
   */
  retain(keys: Iterable<string>): void {
    const keep = new Set(keys)

    for (const map of [this.entries, this.failedAt, this.pending, this.inflight] as Map<string, unknown>[]) {
      for (const key of [...map.keys()]) {
        if (!keep.has(key)) {
          map.delete(key)
        }
      }
    }

    for (const key of [...this.entries.keys()].slice(0, Math.max(0, this.entries.size - MAX_ENTRIES))) {
      this.entries.delete(key)
    }
  }

  /** How many entries are cached (tests and diagnostics). */
  get size(): number {
    return this.entries.size
  }

  /** Back in use after `dispose` (a remount of the same canvas). */
  resume(): void {
    this.disposed = false
  }

  private notify(id: string): void {
    for (const listener of [...(this.listeners.get(id) ?? [])]) {
      listener()
    }
  }

  private flush(): void {
    this.cancelTimer = undefined

    if (this.disposed) {
      return
    }

    const byProfile = new Map<string, Wanted[]>()

    for (const item of this.pending.values()) {
      byProfile.set(item.profile, [...(byProfile.get(item.profile) ?? []), item])
    }

    this.pending.clear()
    const tz = this.tz()

    for (const [profile, items] of byProfile) {
      for (let start = 0; start < items.length; start += MAX_BATCH) {
        const batch = items.slice(start, start + MAX_BATCH)
        const ids = batch.map(item => item.id)

        for (const item of batch) {
          this.inflight.set(item.key, item.sig)
        }

        this.log.push({ profile, ids })

        if (this.log.length > LOG_MAX) {
          this.log.splice(0, this.log.length - LOG_MAX)
        }

        this.fetchDetails(profile, ids, tz).then(
          answer => this.settle(batch, answer),
          () => this.fail(batch)
        )
      }
    }
  }

  private settle(batch: readonly Wanted[], answer: DetailsAnswer): void {
    for (const item of batch) {
      // A newer request for this id (another signature) supersedes this answer.
      if (this.inflight.get(item.key) !== item.sig) {
        continue
      }

      this.inflight.delete(item.key)
      this.failedAt.delete(item.key)

      if (this.disposed) {
        continue
      }

      const found = answer.details?.[item.id]

      this.entries.set(item.key, {
        sig: item.sig,
        details: found
          ? {
              excerpt: typeof found.excerpt === 'string' ? found.excerpt : null,
              role: typeof found.excerpt_role === 'string' ? found.excerpt_role : null,
              activity: Array.isArray(found.activity) ? found.activity.map(value => (Number.isFinite(value) && value > 0 ? Math.floor(value) : 0)) : [],
              days: Array.isArray(answer.days) ? answer.days : []
            }
          : null
      })
      this.notify(item.key)
    }
  }

  private fail(batch: readonly Wanted[]): void {
    const now = this.timers.now()

    for (const item of batch) {
      if (this.inflight.get(item.key) === item.sig) {
        this.inflight.delete(item.key)
        this.failedAt.set(item.key, now)
      }
    }
  }
}

export interface ViewBox {
  x: number
  y: number
  zoom: number
}

/**
 * Ids whose rectangle meets the viewport grown by `margin` of its size on every side (flow
 * coordinates): the cards "in or near" view. `view` is React Flow's transform (`x`, `y` in screen
 * pixels, `zoom`); `width` / `height` the canvas size in screen pixels.
 */
export function nearIds(
  rects: Iterable<readonly [string, { x: number; y: number; width: number; height: number }]>,
  view: ViewBox,
  width: number,
  height: number,
  margin = 0.5
): string[] {
  if (!(view.zoom > 0) || !(width > 0) || !(height > 0)) {
    return []
  }

  const w = width / view.zoom
  const h = height / view.zoom
  const left = -view.x / view.zoom - w * margin
  const top = -view.y / view.zoom - h * margin
  const right = left + w * (1 + 2 * margin)
  const bottom = top + h * (1 + 2 * margin)
  const out: string[] = []

  for (const [id, rect] of rects) {
    if (rect.x < right && rect.x + rect.width > left && rect.y < bottom && rect.y + rect.height > top) {
      out.push(id)
    }
  }

  return out
}
