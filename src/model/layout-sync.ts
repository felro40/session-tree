/**
 * The page side of the synced layout store (card 4, R16/R17): block positions and the synced
 * view settings, kept in step with the backend (`/state`, `dashboard/layout_store.py`).
 *
 * - **Reads** come from the last server snapshot of a profile, with this window's not yet
 *   acknowledged changes replayed on top. A snapshot is cached in `ctx.storage`, so a page that
 *   cannot reach the backend shows the last saved layout (and keeps working: changes queue).
 * - **Writes** queue and go out debounced (~300 ms) and batched; never while a block is being
 *   dragged (a drop records the final spot; nothing is sent per mouse move).
 *   - a drop is a `set` upsert (last write wins per block on the server);
 *   - what an auto-layout placed is an `if_absent` upsert, so a late first save from one window
 *     can never undo another window's drop;
 *   - Re-arrange is a delete of the style + scope layout; its Undo puts back what this window
 *     showed before (`PUT`).
 * - **Other windows' changes** arrive by push (`plugin.session-tree.layout.changed`) or by the
 *   poll; a refresh never moves a block that is being dragged here.
 * - A failed request (unreachable backend) keeps the queue, marks the profile offline and retries
 *   with a backoff; a refused one (4xx: bad input, caps) is dropped and reported.
 *
 * No React and no SDK in here: the transport, storage and timers are injected (unit tests).
 */
import type { LayoutResult, Point } from './layout.ts'

export interface StoredEntry {
  x: number
  y: number
  updated_at: number
}

export type StoredLayouts = Record<string, Record<string, Record<string, StoredEntry>>>

export interface SyncedSettings {
  /** The synced view style; `null` until someone picks one (the page uses its default). */
  style: null | string
  snap: boolean
}

export interface StateSnapshot {
  schema: number
  rev: number
  settings: SyncedSettings
  layouts: StoredLayouts
}

export type StateAnswer = StateSnapshot | { schema: number; rev: number; unchanged: true }

export interface PositionsBody {
  style: string
  scope: string
  mode: 'if_absent' | 'set'
  positions: { id: string; x: number; y: number }[]
}

export interface SyncTransport {
  getState(profile: string, sinceRev?: number): Promise<StateAnswer>
  patchPositions(profile: string, body: PositionsBody): Promise<{ rev: number; changed: boolean }>
  patchSettings(profile: string, patch: Partial<SyncedSettings>): Promise<{ rev: number; changed: boolean; settings: SyncedSettings }>
  deleteLayout(profile: string, style: string, scope: string): Promise<{ rev: number; changed: boolean }>
  putLayout(profile: string, body: { style: string; scope: string; positions: { id: string; x: number; y: number }[] }): Promise<{ rev: number; changed: boolean }>
  /** Forget these blocks in every layout of the profile (a session moved to another project). */
  forgetBlocks(profile: string, ids: string[]): Promise<{ rev: number; changed: boolean }>
}

export interface SyncStorage {
  get<T>(key: string, fallback: T): T
  set(key: string, value: unknown): void
}

export interface SyncTimers {
  setTimeout(fn: () => void, ms: number): () => void
}

/** One style + scope layout of one profile. */
export interface LayoutRef {
  profile: string
  style: string
  scope: string
}

type Op =
  | { kind: 'upsert'; ref: LayoutRef; mode: 'if_absent' | 'set'; entries: [string, Point][] }
  | { kind: 'replace'; ref: LayoutRef; entries: [string, Point][] | null }
  | { kind: 'forget'; profile: string; ids: string[] }
  | { kind: 'settings'; profile: string; patch: Partial<SyncedSettings> }

type LayoutOp = Extract<Op, { ref: LayoutRef }>

export type SyncStatus = 'loading' | 'offline' | 'online'

export const DEBOUNCE_MS = 300
export const RETRY_MS = [1000, 2000, 5000, 5000, 10_000]
/** The page polls every this many ms while visible (no push, or a missed push). */
export const POLL_MS = 5000
export const CACHE_KEY = 'layoutCache.v1'
export const PENDING_KEY = 'layoutPending.v1'
/** Sent per request at most (the backend's batch cap is 2000). */
export const BATCH_LIMIT = 1000

interface ProfileState {
  /** The last server snapshot (fetched, or the cache). */
  server: StateSnapshot | null
  /** True once a fetch answered, or failed (the cache, or nothing, is then what there is). */
  settled: boolean
  status: SyncStatus
}

const EMPTY_SETTINGS: SyncedSettings = { style: null, snap: false }

const refKey = (ref: LayoutRef) => `${ref.profile}\u0000${ref.style}\u0000${ref.scope}`

const sameRef = (a: LayoutRef, b: LayoutRef) => a.profile === b.profile && a.style === b.style && a.scope === b.scope

/** A refusal the backend will repeat (bad input, a cap): retrying cannot help. */
export function isRefusal(error: unknown): boolean {
  const match = /^(\d{3}): /.exec(error instanceof Error ? error.message : String(error ?? ''))

  return Boolean(match && ['400', '409', '413', '422'].includes(match[1]))
}

export class LayoutSync {
  private readonly profiles = new Map<string, ProfileState>()
  private pending: Op[]
  private readonly listeners = new Set<() => void>()
  private readonly watched = new Map<string, number>()
  private dragging: ReadonlySet<string> = new Set()
  private cancelFlush?: () => void
  private flushing = false
  private failures = 0
  /** Bumps when an acknowledged write changes the snapshot: a fetch begun before it is stale. */
  private writeSeq = 0
  private disposed = false
  private version = 0

  private readonly transport: SyncTransport
  private readonly storage: SyncStorage
  private readonly timers: SyncTimers
  private readonly options: { debounceMs?: number; onRefused?: (error: unknown) => void }

  constructor(transport: SyncTransport, storage: SyncStorage, timers: SyncTimers, options: { debounceMs?: number; onRefused?: (error: unknown) => void } = {}) {
    this.transport = transport
    this.storage = storage
    this.timers = timers
    this.options = options
    this.pending = (storage.get<Op[] | null>(PENDING_KEY, null) ?? []).filter(isOp)

    if (this.pending.length > 0) {
      this.schedule(0)
    }
  }

  // --- subscription -------------------------------------------------------------------------

  /** Called after every change a reader can see (positions, settings, status). */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)

    return () => this.listeners.delete(listener)
  }

  /** Bumps on every visible change: a cheap memo key for React. */
  get changeVersion(): number {
    return this.version
  }

  private emit(): void {
    this.version += 1

    for (const listener of [...this.listeners]) {
      listener()
    }
  }

  // --- reads --------------------------------------------------------------------------------

  private profile(profile: string): ProfileState {
    let state = this.profiles.get(profile)

    if (!state) {
      const cached = this.storage.get<StateSnapshot | null>(`${CACHE_KEY}:${profile}`, null)

      state = { server: isSnapshot(cached) ? cached : null, settled: false, status: 'loading' }
      this.profiles.set(profile, state)
    }

    return state
  }

  status(profile: string): SyncStatus {
    return this.profile(profile).status
  }

  /** The store revision of this window's snapshot of `profile` (`null`: none yet). */
  revision(profile: string): null | number {
    return this.profile(profile).server?.rev ?? null
  }

  /** Whether the page may lay out: a fetch answered or failed (then the cache, or nothing). */
  settled(profile: string): boolean {
    return this.profile(profile).settled
  }

  /** Whether this profile's layouts come from the cache because the backend is unreachable. */
  offline(profile: string): boolean {
    return this.profile(profile).status === 'offline'
  }

  /** The synced settings as this window has them (its own unsent changes included). */
  settings(profile: string): SyncedSettings {
    const base = { ...(this.profile(profile).server?.settings ?? this.anySettings()) }

    for (const op of this.pending) {
      if (op.kind === 'settings') {
        Object.assign(base, op.patch)
      }
    }

    return base
  }

  /** Settings are global: any profile's snapshot holds them. */
  private anySettings(): SyncedSettings {
    let best: StateSnapshot | null = null

    for (const state of this.profiles.values()) {
      if (state.server && (!best || state.server.rev > best.rev)) {
        best = state.server
      }
    }

    return best?.settings ?? EMPTY_SETTINGS
  }

  /** The positions of one layout: the server's, this window's unsent changes on top. */
  positions(ref: LayoutRef): Map<string, Point> {
    const stored = this.profile(ref.profile).server?.layouts[ref.style]?.[ref.scope] ?? {}
    const out = new Map<string, Point>(Object.entries(stored).map(([id, entry]) => [id, { x: entry.x, y: entry.y }]))

    for (const op of this.pending) {
      if (op.kind === 'forget' ? op.profile === ref.profile : op.kind !== 'settings' && sameRef(op.ref, ref)) {
        applyOp(out, op as LayoutOp | Extract<Op, { kind: 'forget' }>)
      }
    }

    return out
  }

  // --- local changes ------------------------------------------------------------------------

  /**
   * Lay out against the stored positions and keep what the layout placed. Called while the page
   * renders, so it never notifies; new placements are queued as `if_absent` (`save: false` for a
   * style that saves nothing, Swimlanes).
   */
  place(ref: LayoutRef, compute: (previous: ReadonlyMap<string, Point> | undefined) => LayoutResult, { save = true }: { save?: boolean } = {}): LayoutResult {
    const previous = this.positions(ref)
    const result = compute(previous.size > 0 ? previous : undefined)

    if (!save) {
      return result
    }

    const placed: [string, Point][] = []

    for (const [id, point] of result.positions) {
      if (!previous.has(id)) {
        placed.push([id, { x: point.x, y: point.y }])
      }
    }

    if (placed.length > 0) {
      this.queue({ kind: 'upsert', ref, mode: 'if_absent', entries: placed }, false)
    }

    return result
  }

  /** A drop: these blocks now sit here. */
  drop(ref: LayoutRef, moves: ReadonlyMap<string, Point>): void {
    if (moves.size === 0) {
      return
    }

    this.queue({ kind: 'upsert', ref, mode: 'set', entries: [...moves].map(([id, point]) => [id, { x: point.x, y: point.y }]) }, true)
  }

  /** Re-arrange: forget this layout. Answers what was shown, for Undo. */
  rearrange(ref: LayoutRef): Map<string, Point> {
    const previous = this.positions(ref)

    this.queue({ kind: 'replace', ref, entries: null }, true)

    return previous
  }

  /** Undo of a Re-arrange: the layout becomes `previous` again. */
  restore(ref: LayoutRef, previous: ReadonlyMap<string, Point>): void {
    this.queue({ kind: 'replace', ref, entries: [...previous].map(([id, point]) => [id, { x: point.x, y: point.y }]) }, true)
  }

  /**
   * A block moved to another project: forget its stored spot in every layout of the profile (here
   * and on the server), so each layout places it anew in its new band.
   */
  forget(profile: string, id: string): void {
    this.queue({ kind: 'forget', profile, ids: [id] }, true)
  }

  setSettings(profile: string, patch: Partial<SyncedSettings>): void {
    this.queue({ kind: 'settings', profile, patch }, true)
  }

  /** While blocks are dragged nothing is sent, and a refresh keeps their spots. */
  setDragging(ids: Iterable<string> | null): void {
    const was = this.dragging.size > 0

    this.dragging = new Set(ids ?? [])

    if (was && this.dragging.size === 0 && this.pending.length > 0) {
      this.schedule(this.options.debounceMs ?? DEBOUNCE_MS)
    }
  }

  get isDragging(): boolean {
    return this.dragging.size > 0
  }

  private queue(op: Op, notify: boolean): void {
    this.pending.push(op)
    this.persistPending()
    this.schedule(this.options.debounceMs ?? DEBOUNCE_MS)

    if (notify) {
      this.emit()
    }
  }

  private persistPending(): void {
    this.storage.set(PENDING_KEY, this.pending)
  }

  /** (Re)starts the flush timer: trailing debounce, so a burst of drops goes out as one batch. */
  private schedule(ms: number): void {
    if (this.disposed) {
      return
    }

    this.cancelFlush?.()
    this.cancelFlush = this.timers.setTimeout(() => {
      this.cancelFlush = undefined
      void this.flush()
    }, ms)
  }

  // --- sending ------------------------------------------------------------------------------

  /** Sends the queue in order; consecutive upserts of one layout and mode go as one request. */
  async flush(): Promise<void> {
    if (this.flushing || this.disposed) {
      return
    }

    if (this.dragging.size > 0) {
      // Never while dragging: setDragging(null) reschedules.
      return
    }

    this.flushing = true

    try {
      while (this.pending.length > 0 && this.dragging.size === 0 && !this.disposed) {
        const [op, count] = this.nextBatch()

        try {
          await this.send(op)
          this.ack(op)
          this.pending.splice(0, count)
          this.persistPending()
          this.failures = 0
          this.markOnline(opProfile(op))
        } catch (error) {
          if (isRefusal(error)) {
            this.pending.splice(0, count)
            this.persistPending()
            this.options.onRefused?.(error)
            this.emit()
            continue
          }

          this.markOffline(opProfile(op))
          this.retry()

          return
        }
      }
    } finally {
      this.flushing = false
    }

    if (this.pending.length > 0 && this.dragging.size === 0) {
      this.schedule(0)
    }
  }

  /** The first pending op merged with the consecutive upserts of the same layout and mode. */
  private nextBatch(): [Op, number] {
    const first = this.pending[0]

    if (first.kind !== 'upsert') {
      return [first, 1]
    }

    const merged = new Map(first.entries)
    let count = 1

    while (count < this.pending.length) {
      const next = this.pending[count]

      if (next.kind !== 'upsert' || next.mode !== first.mode || !sameRef(next.ref, first.ref) || merged.size + next.entries.length > BATCH_LIMIT) {
        break
      }

      for (const [id, point] of next.entries) {
        if (first.mode === 'set' || !merged.has(id)) {
          merged.set(id, point)
        }
      }

      count += 1
    }

    return [{ ...first, entries: [...merged] }, count]
  }

  private async send(op: Op): Promise<void> {
    if (op.kind === 'settings') {
      await this.transport.patchSettings(op.profile, op.patch)
    } else if (op.kind === 'forget') {
      await this.transport.forgetBlocks(op.profile, op.ids)
    } else if (op.kind === 'upsert') {
      for (let start = 0; start < op.entries.length; start += BATCH_LIMIT) {
        await this.transport.patchPositions(op.ref.profile, {
          style: op.ref.style,
          scope: op.ref.scope,
          mode: op.mode,
          positions: op.entries.slice(start, start + BATCH_LIMIT).map(([id, point]) => ({ id, x: point.x, y: point.y }))
        })
      }
    } else if (op.entries === null) {
      await this.transport.deleteLayout(op.ref.profile, op.ref.style, op.ref.scope)
    } else {
      await this.transport.putLayout(op.ref.profile, {
        style: op.ref.style,
        scope: op.ref.scope,
        positions: op.entries.map(([id, point]) => ({ id, x: point.x, y: point.y }))
      })
    }
  }

  /** The server applied `op`: fold it into the snapshot this window keeps (the next fetch corrects it). */
  private ack(op: Op): void {
    const now = Date.now() / 1000

    this.writeSeq += 1

    if (op.kind === 'settings') {
      for (const state of this.profiles.values()) {
        if (state.server) {
          state.server = { ...state.server, settings: { ...state.server.settings, ...op.patch } }
        }
      }

      return
    }

    const state = this.profile(opProfile(op))
    const server = state.server ?? { schema: 1, rev: 0, settings: this.anySettings(), layouts: {} }
    const refs: LayoutRef[] =
      op.kind === 'forget'
        ? Object.entries(server.layouts).flatMap(([style, scopes]) => Object.keys(scopes).map(scope => ({ profile: op.profile, style, scope })))
        : [op.ref]

    for (const ref of refs) {
      const scopes = (server.layouts[ref.style] ??= {})
      const current = new Map(Object.entries(scopes[ref.scope] ?? {}).map(([id, entry]) => [id, { x: entry.x, y: entry.y }]))

      applyOp(current, op)

      if (current.size === 0) {
        delete scopes[ref.scope]
      } else {
        scopes[ref.scope] = Object.fromEntries([...current].map(([id, point]) => [id, { ...point, updated_at: now }]))
      }

      if (Object.keys(scopes).length === 0) {
        delete server.layouts[ref.style]
      }
    }

    state.server = server
    this.cache(opProfile(op))
  }

  private retry(): void {
    const ms = RETRY_MS[Math.min(this.failures, RETRY_MS.length - 1)]

    this.failures += 1
    this.schedule(ms)
  }

  private markOnline(profile: string): void {
    const state = this.profile(profile)

    if (state.status !== 'online') {
      state.status = 'online'
      state.settled = true
      this.emit()
    }
  }

  private markOffline(profile: string): void {
    const state = this.profile(profile)

    if (state.status !== 'offline' || !state.settled) {
      state.status = 'offline'
      state.settled = true
      this.emit()
    }
  }

  private cache(profile: string): void {
    const server = this.profile(profile).server

    if (server) {
      this.storage.set(`${CACHE_KEY}:${profile}`, server)
    }
  }

  // --- fetching -----------------------------------------------------------------------------

  /** Fetch (or re-check) one profile's state. A failure leaves the cache in place, offline. */
  async refresh(profile: string): Promise<void> {
    if (this.disposed) {
      return
    }

    const state = this.profile(profile)
    const known = state.settled && state.status === 'online' ? state.server?.rev : undefined
    const seq = this.writeSeq

    try {
      const answer = await this.transport.getState(profile, known)

      if (seq !== this.writeSeq) {
        // A write of this window was acknowledged meanwhile: this answer may predate it.
        void this.refresh(profile)

        return
      }

      if (!('unchanged' in answer)) {
        state.server = answer
        this.cache(profile)
      }

      const wasOnline = state.status === 'online'
      const changed = !('unchanged' in answer) || !wasOnline || !state.settled

      state.status = 'online'
      state.settled = true

      // Back from offline: send what queued meanwhile now. Online, the debounce timer (if any)
      // stays as it is: a poll must not flush a drop early.
      if (!wasOnline && this.pending.length > 0 && !this.flushing) {
        this.failures = 0
        this.schedule(0)
      }

      if (changed) {
        this.emit()
      }
    } catch {
      this.markOffline(profile)

      if (this.watched.has(profile)) {
        this.retryRefresh(profile)
      }
    }
  }

  private refreshTimers = new Map<string, () => void>()

  private retryRefresh(profile: string): void {
    if (this.refreshTimers.has(profile) || this.disposed) {
      return
    }

    const ms = RETRY_MS[Math.min(this.failures, RETRY_MS.length - 1)]

    this.refreshTimers.set(
      profile,
      this.timers.setTimeout(() => {
        this.refreshTimers.delete(profile)
        void this.refresh(profile)
      }, ms)
    )
  }

  /** A page or settings view shows `profile`: load it now, and poll / follow pushes for it. */
  watch(profile: string): () => void {
    this.watched.set(profile, (this.watched.get(profile) ?? 0) + 1)

    if (!this.profile(profile).settled || this.profile(profile).status !== 'online') {
      void this.refresh(profile)
    }

    return () => {
      const count = (this.watched.get(profile) ?? 1) - 1

      if (count <= 0) {
        this.watched.delete(profile)
      } else {
        this.watched.set(profile, count)
      }
    }
  }

  /** The poll: every watched profile, cheaply (`since_rev`). */
  poll(): void {
    for (const profile of this.watched.keys()) {
      void this.refresh(profile)
    }
  }

  /** A push from the backend: refresh what it touched, unless this window already has it. */
  onRemoteChange(payload: unknown): void {
    const { rev, profile } = (payload ?? {}) as { rev?: unknown; profile?: unknown }

    for (const name of this.watched.keys()) {
      const known = this.profile(name).server?.rev ?? -1

      if (typeof rev === 'number' && rev <= known) {
        continue
      }

      if (profile === '*' || profile === name || typeof profile !== 'string') {
        void this.refresh(name)
      }
    }
  }

  dispose(): void {
    this.disposed = true
    this.cancelFlush?.()

    for (const cancel of this.refreshTimers.values()) {
      cancel()
    }

    this.refreshTimers.clear()
    this.listeners.clear()
  }

  /** Test and debug view: what is still waiting to be sent. */
  get pendingCount(): number {
    return this.pending.length
  }
}

function applyOp(target: Map<string, Point>, op: Exclude<Op, { kind: 'settings' }>): void {
  if (op.kind === 'forget') {
    for (const id of op.ids) {
      target.delete(id)
    }

    return
  }

  if (op.kind === 'replace') {
    target.clear()

    for (const [id, point] of op.entries ?? []) {
      target.set(id, point)
    }

    return
  }

  for (const [id, point] of op.entries) {
    if (op.mode === 'set' || !target.has(id)) {
      target.set(id, point)
    }
  }
}

function opProfile(op: Op): string {
  return op.kind === 'settings' || op.kind === 'forget' ? op.profile : op.ref.profile
}

function isSnapshot(value: unknown): value is StateSnapshot {
  const snapshot = value as StateSnapshot | null

  return Boolean(snapshot && typeof snapshot.rev === 'number' && snapshot.settings && typeof snapshot.layouts === 'object' && snapshot.layouts)
}

function isOp(value: unknown): value is Op {
  const op = value as Op | null

  if (!op || typeof op !== 'object') {
    return false
  }

  if (op.kind === 'settings') {
    return typeof op.profile === 'string' && Boolean(op.patch)
  }

  if (op.kind === 'forget') {
    return typeof op.profile === 'string' && Array.isArray(op.ids)
  }

  return (op.kind === 'upsert' || op.kind === 'replace') && Boolean(op.ref) && (op.entries === null || Array.isArray(op.entries))
}

export { refKey as layoutRefKey }
