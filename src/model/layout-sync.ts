/**
 * The page side of the synced layout store (card 4, R16/R17): block positions and the synced
 * view settings, kept in step with the backend (`/state`, `dashboard/layout_store.py`).
 *
 * - **Reads** come from the last server snapshot of a profile, with this window's not yet
 *   acknowledged changes replayed on top. A snapshot is cached in `ctx.storage`, so a page that
 *   cannot reach the backend shows the last saved layout (and keeps working: changes queue).
 * - **Keys.** Positions are stored per *layout key*, not per block id: a compression lineage's
 *   block is keyed by the lineage root (its id, the tip, changes on every compaction), every other
 *   block by its own id (`GraphNode.layoutKey`). `place()` takes the page's key mapping; every
 *   other call (drop, forget, Re-arrange, Undo) already speaks layout keys.
 * - **Writes** queue and go out debounced (~300 ms) and batched; never while a block is being
 *   dragged (a drop records the final spot; nothing is sent per mouse move).
 *   - a drop is a `set` upsert (last write wins per block on the server);
 *   - what an auto-layout placed is an `if_absent` upsert, so a late first save from one window
 *     can never undo another window's drop;
 *   - Re-arrange is a delete of the style + scope layout (the server keeps a backup of it); its
 *     Undo puts back what this window showed before (`PUT`); a restore from Layout history is a
 *     `PUT` with `backup: true` (the server keeps the layout it replaces too).
 * - **Failures** (card-4 review B1):
 *   - *transient* (no answer, a timeout, 5xx, 408, 429): the queue stays, the profile is marked
 *     offline (the banner) and the send is retried with a backoff; nothing is notified;
 *   - *newer schema* (409 `newer_schema: …`, or a `GET /state` answering `read_only`): the store
 *     is read-only for this page's lifetime, or until a later `GET /state` serves a supported
 *     schema. Nothing more is sent; changes stay in this window only (`storeReadOnly`, the
 *     page's banner); one notice;
 *   - *other refusals* (any other 4xx: caps, validation): that op is dropped; an auto-layout's
 *     refused placements are remembered so `place()` never queues them again, until that layout
 *     is re-arranged or replaced (card-4 review carry-forward 3); one notice per refusal kind
 *     (status) per page lifetime. 401 / 403 (signed out) are transient (carry-forward 2).
 * - **Pending queue** (card-4 review NB1): each window owns one slot of the device's queue
 *   (`layoutPending.v2`: `{slots: {<window id>: {beat, ops}}}`) and rewrites only its own slot.
 *   A slot whose heartbeat is older than `ORPHAN_MS` (its window closed, or a plugin reload
 *   disposed it) is adopted by the next window that looks. Every drop also stamps the device's
 *   drop record (`layoutDrops.v1`, per layout + key); a queued drop older than the latest drop
 *   of that block on this device is discarded before it is sent, so an older drop never
 *   overwrites a newer one from another window of the same device.
 * - **Other windows' changes** arrive by push (`plugin.session-tree.layout.changed`, with `epoch`
 *   and `rev`) or by the poll (`since_rev` + `epoch`); a refresh never moves a block that is
 *   being dragged here. A new `epoch` (the file was recreated, its `rev` restarted) always
 *   refreshes (card-4 review NB2).
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
  /** Names the state file (with `rev`); a recreated file has a new one. Absent: an old cache. */
  epoch?: string
  rev: number
  settings: SyncedSettings
  layouts: StoredLayouts
  /** The file has a newer schema: everything is served empty and every write is refused. */
  read_only?: boolean
  store_schema?: number
}

export type StateAnswer = StateSnapshot | { schema: number; epoch?: string; rev: number; unchanged: true }

export interface PositionsBody {
  style: string
  scope: string
  mode: 'if_absent' | 'set'
  positions: { id: string; x: number; y: number }[]
}

/** What a poll already has: unchanged is answered only for the same epoch and rev. */
export interface KnownState {
  rev: number
  epoch: string
}

export interface SyncTransport {
  getState(profile: string, since?: KnownState): Promise<StateAnswer>
  patchPositions(profile: string, body: PositionsBody): Promise<{ rev: number; changed: boolean }>
  patchSettings(profile: string, patch: Partial<SyncedSettings>): Promise<{ rev: number; changed: boolean; settings: SyncedSettings }>
  deleteLayout(profile: string, style: string, scope: string): Promise<{ rev: number; changed: boolean }>
  /** `backup`: a restore of an earlier layout; the server keeps the layout it replaces first. */
  putLayout(
    profile: string,
    body: { style: string; scope: string; positions: { id: string; x: number; y: number }[]; backup?: boolean }
  ): Promise<{ rev: number; changed: boolean }>
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

/**
 * Block id (what the canvas and the style's layout use) ↔ layout key (what the store keys a
 * position by). The default is the identity.
 */
export interface LayoutKeys {
  toStore(id: string): string
  fromStore(key: string): string
}

/** What a refusal notice is about: `newer_schema`, or the refusing HTTP status (`'413'`, …). */
export type RefusalKind = string

export interface SyncOptions {
  debounceMs?: number
  /** At most once per kind per `LayoutSync` (page) lifetime; never per failed request. */
  onRefused?: (error: unknown, kind: RefusalKind) => void
  /** This window's id in the device's pending queue (default: random). */
  windowId?: string
  /** The device clock (heartbeats, drop times). */
  now?: () => number
}

type Op =
  | { kind: 'upsert'; ref: LayoutRef; mode: 'if_absent' | 'set'; entries: [string, Point][]; at?: number }
  | { kind: 'replace'; ref: LayoutRef; entries: [string, Point][] | null; backup?: boolean }
  | { kind: 'forget'; profile: string; ids: string[] }
  | { kind: 'settings'; profile: string; patch: Partial<SyncedSettings> }

type LayoutOp = Extract<Op, { ref: LayoutRef }>

export type SyncStatus = 'loading' | 'offline' | 'online'

export const DEBOUNCE_MS = 300
export const RETRY_MS = [1000, 2000, 5000, 5000, 10_000]
/** The page polls every this many ms while visible (no push, or a missed push). */
export const POLL_MS = 5000
export const CACHE_KEY = 'layoutCache.v1'
/** The device's pending queue: one slot per window (NB1). */
export const PENDING_KEY = 'layoutPending.v2'
/** The card-4 queue (one shared list): adopted once, then cleared. */
export const LEGACY_PENDING_KEY = 'layoutPending.v1'
/** The latest drop time per layout + key on this device (NB1). */
export const DROPS_KEY = 'layoutDrops.v1'
/** A slot whose heartbeat is older than this belongs to a closed window: adopt it. */
export const ORPHAN_MS = 30_000
/** Drop-record entries kept at most this long / this many. */
export const DROP_RECORD_MS = 30 * 24 * 3600_000
export const DROP_RECORD_MAX = 5000
/** Sent per request at most (the backend's batch cap is 2000). */
export const BATCH_LIMIT = 1000
/** The refusal kind of a write refused because `state.json` has a newer schema. */
export const NEWER_SCHEMA = 'newer_schema'

interface ProfileState {
  /** The last server snapshot (fetched, or the cache). */
  server: StateSnapshot | null
  /** True once a fetch answered, or failed (the cache, or nothing, is then what there is). */
  settled: boolean
  status: SyncStatus
}

interface PendingSlot {
  beat: number
  ops: Op[]
}

const EMPTY_SETTINGS: SyncedSettings = { style: null, snap: false }
const IDENTITY_KEYS: LayoutKeys = { toStore: id => id, fromStore: key => key }

const refKey = (ref: LayoutRef) => `${ref.profile}\u0000${ref.style}\u0000${ref.scope}`
const entryKey = (ref: LayoutRef, key: string) => `${refKey(ref)}\u0000${key}`

const sameRef = (a: LayoutRef, b: LayoutRef) => a.profile === b.profile && a.style === b.style && a.scope === b.scope

/**
 * How a failed write is handled (B1): `null` = transient (no HTTP answer, 5xx, 408, 429, and
 * 401 / 403 — a signed-out tab: the queued op is retried after the user signs in again, card-4
 * review carry-forward 2), `newer_schema` (409 from a newer `state.json`: read-only), else the
 * refusing status.
 */
export function refusalKind(error: unknown): null | RefusalKind {
  const match = /^(\d{3}): ([\s\S]*)$/.exec(error instanceof Error ? error.message : String(error ?? ''))

  if (!match) {
    return null
  }

  const status = Number(match[1])

  if (status < 400 || status > 499 || status === 401 || status === 403 || status === 408 || status === 429) {
    return null
  }

  return status === 409 && match[2].includes(NEWER_SCHEMA) ? NEWER_SCHEMA : match[1]
}

/** A refusal the backend will repeat (bad input, a cap, a newer schema): retrying cannot help. */
export function isRefusal(error: unknown): boolean {
  return refusalKind(error) !== null
}

function randomId(): string {
  const crypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto

  return crypto?.randomUUID?.() ?? `w${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
}

export class LayoutSync {
  private readonly profiles = new Map<string, ProfileState>()
  private pending: Op[] = []
  /** Changes made while the store is read-only: shown here, never sent, never persisted. */
  private localOnly: Op[] = []
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
  private readOnly = false
  /** `layout + key` of auto-layout placements the backend refused: never queued again. */
  private readonly refusedPlacements = new Set<string>()
  private readonly notified = new Set<RefusalKind>()
  /** The ops in this window's slot as last written (to tell an adoption by another window). */
  private persistedOps = new Set<Op>()
  private ownsSlot = false
  private lastDropAt = 0

  private readonly transport: SyncTransport
  private readonly storage: SyncStorage
  private readonly timers: SyncTimers
  private readonly options: SyncOptions
  private readonly windowId: string
  private readonly now: () => number

  constructor(transport: SyncTransport, storage: SyncStorage, timers: SyncTimers, options: SyncOptions = {}) {
    this.transport = transport
    this.storage = storage
    this.timers = timers
    this.options = options
    this.windowId = options.windowId ?? randomId()
    this.now = options.now ?? Date.now

    if (this.adoptOrphans()) {
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

  /** The store was written by a newer Session Tree: nothing is saved from this page (B1). */
  get storeReadOnly(): boolean {
    return this.readOnly
  }

  /** This window's ops a reader sees: the unsent queue, then the read-only local changes. */
  private overlay(): Op[] {
    return this.localOnly.length > 0 ? [...this.pending, ...this.localOnly] : this.pending
  }

  /** The synced settings as this window has them (its own unsent changes included). */
  settings(profile: string): SyncedSettings {
    const base = { ...(this.profile(profile).server?.settings ?? this.anySettings()) }

    for (const op of this.overlay()) {
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

  /** The positions of one layout, by layout key: the server's, this window's unsent changes on top. */
  positions(ref: LayoutRef): Map<string, Point> {
    const stored = this.profile(ref.profile).server?.layouts[ref.style]?.[ref.scope] ?? {}
    const out = new Map<string, Point>(Object.entries(stored).map(([id, entry]) => [id, { x: entry.x, y: entry.y }]))

    for (const op of this.overlay()) {
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
   * style that saves nothing, Swimlanes). `keys` maps the layout's block ids to layout keys;
   * `compute` and the answer speak block ids.
   */
  place(
    ref: LayoutRef,
    compute: (previous: ReadonlyMap<string, Point> | undefined) => LayoutResult,
    { save = true, keys = IDENTITY_KEYS }: { save?: boolean; keys?: LayoutKeys } = {}
  ): LayoutResult {
    const stored = this.positions(ref)
    const previous = keys === IDENTITY_KEYS ? stored : new Map([...stored].map(([key, point]) => [keys.fromStore(key), point]))
    const result = compute(previous.size > 0 ? previous : undefined)

    if (!save) {
      return result
    }

    const placed: [string, Point][] = []

    for (const [id, point] of result.positions) {
      const key = keys.toStore(id)

      if (!stored.has(key) && !this.refusedPlacements.has(entryKey(ref, key))) {
        placed.push([key, { x: point.x, y: point.y }])
      }
    }

    if (placed.length > 0) {
      this.queue({ kind: 'upsert', ref, mode: 'if_absent', entries: placed }, false)
    }

    return result
  }

  /** A drop: these blocks (by layout key) now sit here. */
  drop(ref: LayoutRef, moves: ReadonlyMap<string, Point>): void {
    if (moves.size === 0) {
      return
    }

    // Strictly increasing within this window; across windows the device clock orders drops.
    const at = Math.max(this.now(), this.lastDropAt + 1)

    this.lastDropAt = at

    if (!this.readOnly) {
      this.recordDrops(ref, [...moves.keys()], at)
    }

    this.queue({ kind: 'upsert', ref, mode: 'set', entries: [...moves].map(([id, point]) => [id, { x: point.x, y: point.y }]), at }, true)
  }

  /** Re-arrange: forget this layout. Answers what was shown (by layout key), for Undo. */
  rearrange(ref: LayoutRef): Map<string, Point> {
    const previous = this.positions(ref)

    // Carry-forward 3 (card-4 review): a fresh layout may store what a cap refused before.
    this.clearRefused(ref)
    this.queue({ kind: 'replace', ref, entries: null }, true)

    return previous
  }

  /** Forgets the refused auto-layout placements of one layout (a Re-arrange, a stored PUT). */
  private clearRefused(ref: LayoutRef): void {
    const prefix = `${refKey(ref)}\u0000`

    for (const key of [...this.refusedPlacements]) {
      if (key.startsWith(prefix)) {
        this.refusedPlacements.delete(key)
      }
    }
  }

  /** Undo of a Re-arrange: the layout becomes `previous` again. */
  restore(ref: LayoutRef, previous: ReadonlyMap<string, Point>): void {
    this.queue({ kind: 'replace', ref, entries: [...previous].map(([id, point]) => [id, { x: point.x, y: point.y }]) }, true)
  }

  /**
   * A restore from Layout history: the layout becomes a backup's positions (by layout key); the
   * server keeps the layout it replaces as a backup first. Answers what was shown, for Undo.
   */
  restoreBackup(ref: LayoutRef, positions: ReadonlyMap<string, Point>): Map<string, Point> {
    const previous = this.positions(ref)

    this.clearRefused(ref)
    this.queue({ kind: 'replace', ref, entries: [...positions].map(([id, point]) => [id, { x: point.x, y: point.y }]), backup: true }, true)

    return previous
  }

  /**
   * A block moved to another project: forget its stored spot (by layout key) in every layout of
   * the profile (here and on the server), so each layout places it anew in its new band.
   */
  forget(profile: string, key: string): void {
    this.queue({ kind: 'forget', profile, ids: [key] }, true)
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
    if (this.readOnly) {
      // B1: nothing is sent while the store is read-only; the change shows in this window only.
      this.localOnly.push(op)
    } else {
      this.pending.push(op)
      this.persistPending()
      this.schedule(this.options.debounceMs ?? DEBOUNCE_MS)
    }

    if (notify) {
      this.emit()
    }
  }

  // --- the device's pending queue (NB1) ------------------------------------------------------

  private readSlots(): Record<string, PendingSlot> {
    const raw = this.storage.get<{ slots?: unknown } | null>(PENDING_KEY, null)
    const slots: Record<string, PendingSlot> = {}

    if (raw && typeof raw === 'object' && raw.slots && typeof raw.slots === 'object') {
      for (const [owner, value] of Object.entries(raw.slots as Record<string, unknown>)) {
        const slot = value as PendingSlot | null

        if (slot && typeof slot.beat === 'number' && Array.isArray(slot.ops)) {
          slots[owner] = { beat: slot.beat, ops: slot.ops.filter(isOp) }
        }
      }
    }

    return slots
  }

  private writeSlots(slots: Record<string, PendingSlot>): void {
    this.storage.set(PENDING_KEY, { slots })
  }

  /**
   * Another window adopted this window's slot (it looked orphaned, e.g. a long-hidden tab): it
   * sends those ops, so this window keeps only what it queued since.
   */
  private reconcileSlot(slots: Record<string, PendingSlot>): void {
    if (this.ownsSlot && !(this.windowId in slots)) {
      this.pending = this.pending.filter(op => !this.persistedOps.has(op))
      this.ownsSlot = false
      this.persistedOps = new Set()
    }
  }

  /** Rewrites this window's slot only (and refreshes its heartbeat). */
  private persistPending(beat = this.now()): void {
    const slots = this.readSlots()

    this.reconcileSlot(slots)

    if (this.pending.length > 0) {
      slots[this.windowId] = { beat, ops: this.pending }
      this.ownsSlot = true
      this.persistedOps = new Set(this.pending)
    } else {
      delete slots[this.windowId]
      this.ownsSlot = false
      this.persistedOps = new Set()
    }

    this.writeSlots(slots)
  }

  /** Takes over the slots of closed windows (and the card-4 shared queue). True: adopted some. */
  private adoptOrphans(): boolean {
    const slots = this.readSlots()
    const now = this.now()
    const adopted: Op[] = []
    const legacy = this.storage.get<unknown>(LEGACY_PENDING_KEY, null)

    if (Array.isArray(legacy)) {
      adopted.push(...legacy.filter(isOp))
      this.storage.set(LEGACY_PENDING_KEY, null)
    }

    for (const [owner, slot] of Object.entries(slots)) {
      if (owner !== this.windowId && now - slot.beat > ORPHAN_MS) {
        adopted.push(...slot.ops)
        delete slots[owner]
      }
    }

    if (adopted.length === 0) {
      return false
    }

    this.writeSlots(slots)
    this.pending = [...adopted, ...this.pending]
    this.persistPending()

    return true
  }

  private recordDrops(ref: LayoutRef, keys: string[], at: number): void {
    const record = { ...this.storage.get<Record<string, number>>(DROPS_KEY, {}) }

    for (const key of keys) {
      const name = entryKey(ref, key)

      record[name] = Math.max(typeof record[name] === 'number' ? record[name] : 0, at)
    }

    const kept = Object.entries(record)
      .filter(([, when]) => typeof when === 'number' && at - when < DROP_RECORD_MS)
      .sort((a, b) => b[1] - a[1])
      .slice(0, DROP_RECORD_MAX)

    this.storage.set(DROPS_KEY, Object.fromEntries(kept))
  }

  /**
   * Discards queued drops that a newer drop of the same block on this device (any window)
   * supersedes, before anything is sent: last write wins per block on the server, so an older
   * drop sent late would overwrite the newer one.
   */
  private supersede(): void {
    const record = this.storage.get<Record<string, number>>(DROPS_KEY, {})
    let changed = false

    this.pending = this.pending.flatMap(op => {
      if (op.kind !== 'upsert' || op.mode !== 'set' || typeof op.at !== 'number') {
        return [op]
      }

      const at = op.at
      const entries = op.entries.filter(([key]) => !((record[entryKey(op.ref, key)] ?? 0) > at))

      if (entries.length === op.entries.length) {
        return [op]
      }

      changed = true

      return entries.length > 0 ? [{ ...op, entries }] : []
    })

    if (changed) {
      this.persistPending()
      this.emit()
    }
  }

  /** (Re)starts the flush timer: trailing debounce, so a burst of drops goes out as one batch. */
  private schedule(ms: number): void {
    if (this.disposed || this.readOnly) {
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
    if (this.flushing || this.disposed || this.readOnly) {
      return
    }

    if (this.dragging.size > 0) {
      // Never while dragging: setDragging(null) reschedules.
      return
    }

    this.flushing = true

    try {
      if (this.pending.length > 0) {
        // The heartbeat of this window's slot, and an adoption by another window noticed.
        this.persistPending()
      }

      while (this.pending.length > 0 && this.dragging.size === 0 && !this.disposed && !this.readOnly) {
        this.supersede()

        if (this.pending.length === 0) {
          break
        }

        const [op, count] = this.nextBatch()
        const batch = this.pending.slice(0, count)

        try {
          await this.send(op)
          this.ack(op)
          this.dequeue(batch)
          this.failures = 0
          this.markOnline(opProfile(op))

          if (op.kind === 'replace') {
            // The layout was replaced on the server (Re-arrange's delete, Undo's PUT): what a
            // cap refused before may fit now (carry-forward 3).
            this.clearRefused(op.ref)
          }
        } catch (error) {
          const kind = refusalKind(error)

          if (kind === NEWER_SCHEMA) {
            this.enterReadOnly(error)

            return
          }

          if (kind !== null) {
            // A deterministic refusal: drop it, never re-queue the same placement, one notice
            // per kind (B1).
            this.dequeue(batch)

            if (op.kind === 'upsert' && op.mode === 'if_absent') {
              for (const [key] of op.entries) {
                this.refusedPlacements.add(entryKey(op.ref, key))
              }
            }

            this.notifyOnce(kind, error)
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

  /** Removes these ops (sent or refused); gone already if another window took them over. */
  private dequeue(batch: readonly Op[]): void {
    const sent = new Set(batch)

    this.pending = this.pending.filter(op => !sent.has(op))
    this.persistPending()
  }

  private notifyOnce(kind: RefusalKind, error: unknown): void {
    if (this.notified.has(kind)) {
      return
    }

    this.notified.add(kind)
    this.options.onRefused?.(error, kind)
  }

  /** B1: a newer Session Tree wrote the store. Send nothing more; keep changes local. */
  private enterReadOnly(error: unknown): void {
    if (this.readOnly) {
      return
    }

    this.readOnly = true
    this.cancelFlush?.()
    this.cancelFlush = undefined
    this.notifyOnce(NEWER_SCHEMA, error ?? new Error(`409: ${NEWER_SCHEMA}`))
    this.emit()
  }

  private leaveReadOnly(): void {
    if (!this.readOnly) {
      return
    }

    // The store is supported again: what was changed meanwhile was never saved (the banner said
    // so); the layouts come from the store again, and saves resume.
    this.readOnly = false
    this.localOnly = []
    this.failures = 0

    if (this.pending.length > 0) {
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
        positions: op.entries.map(([id, point]) => ({ id, x: point.x, y: point.y })),
        ...(op.backup ? { backup: true } : {})
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

    if (server && !server.read_only) {
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
    const server = state.server
    // NB2: "unchanged" only for the same file (epoch) and revision.
    const known = state.settled && state.status === 'online' && server?.epoch ? { rev: server.rev, epoch: server.epoch } : undefined
    const seq = this.writeSeq

    try {
      const answer = await this.transport.getState(profile, known)

      if (seq !== this.writeSeq) {
        // A write of this window was acknowledged meanwhile: this answer may predate it.
        void this.refresh(profile)

        return
      }

      const full = !('unchanged' in answer)

      if (full) {
        state.server = answer
        this.cache(profile)
      }

      const wasOnline = state.status === 'online'
      const changed = full || !wasOnline || !state.settled

      state.status = 'online'
      state.settled = true

      if (full && answer.read_only) {
        this.enterReadOnly(null)
      } else if (full) {
        this.leaveReadOnly()
      }

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

  /** The poll: every watched profile, cheaply (`since_rev` + `epoch`); closed windows' queues. */
  poll(): void {
    if (this.adoptOrphans()) {
      this.schedule(0)
    } else if (this.pending.length > 0 && !this.flushing) {
      this.persistPending() // the heartbeat while a drag or a backoff holds the queue
    }

    for (const profile of this.watched.keys()) {
      void this.refresh(profile)
    }
  }

  /** A push from the backend: refresh what it touched, unless this window already has it. */
  onRemoteChange(payload: unknown): void {
    const { rev, epoch, profile } = (payload ?? {}) as { rev?: unknown; epoch?: unknown; profile?: unknown }

    for (const name of this.watched.keys()) {
      const server = this.profile(name).server
      // NB2: a rev of another file (a new epoch) says nothing about this window's snapshot.
      const sameFile = typeof epoch === 'string' && server?.epoch === epoch

      if (typeof rev === 'number' && sameFile && rev <= (server?.rev ?? -1)) {
        continue
      }

      if (profile === '*' || profile === name || typeof profile !== 'string') {
        void this.refresh(name)
      }
    }
  }

  /**
   * The page is going away (`pagehide`: a reload, a closed tab): mark this window's slot as
   * orphaned, so the next window (the reloaded page) adopts the queue at once instead of after
   * `ORPHAN_MS`. If the page comes back (the back/forward cache), its next write reclaims the slot
   * unless another window adopted it meanwhile.
   */
  release(): void {
    if (this.pending.length > 0) {
      this.persistPending(0)
    }
  }

  dispose(): void {
    this.disposed = true
    this.cancelFlush?.()
    // The next window (a plugin reload) adopts the queue at once.
    this.release()

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
