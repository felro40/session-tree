/**
 * Card 12: how big each session's context is — how many tokens resuming it would load — beside
 * the lifetime tokens it used. Pure (no React, no SDK): node:test drives the same functions and
 * store the page uses, and every style reads the figure from `contextFigure` only.
 *
 * - **Measured**: the last call's `read + write` cache tokens from the stored prompt-cache clock
 *   (`row.context_measured`), used only while the backend names no invalid reason for it
 *   (`row.context_invalid_reason`: compacted, route changed, session rotated, storage
 *   unavailable) and its confidence is known (not `unknown`). Shown as `155k ctx`.
 * - **Estimated**: Hermes's stored-context estimate (`POST /sessions/context`), whenever there is
 *   no usable measurement. Shown as `~108k ctx`.
 * - **None**: no stored system prompt (the session never ran), the estimate failed, or an older
 *   backend that reports no context at all: `— ctx`.
 * - **Loading**: the estimate is on its way, or the one loaded was fetched under another
 *   signature (stale: never shown as current): `… ctx`.
 *
 * The estimate is fetched lazily (`ContextStore`: batched, ≤ 100 ids per request, per profile,
 * cached per block) and again when the row's last activity, message count, transcript revision or
 * clock validity moves (`contextSignature`).
 */
import { dateTimeLabel, shortAge } from './format.ts'
import type { SessionRow } from './sessions.ts'
import { tokenLabel } from '../styles/swimlanes/spec.ts'

export interface ContextMeasured {
  /** `read_tokens + write_tokens` of the last call that touched the prompt cache. */
  tokens: number
  /** When that call was sent (epoch seconds). */
  sent_at: null | number
  /** `proven` / `declared` / `assumed` / `unknown`. */
  confidence: string
}

export type CacheStateId = 'expired' | 'may_be_warm' | 'unknown' | 'warm'

export interface CacheWindowRow {
  state: CacheStateId
  guaranteed_until: null | number
  estimated_until: null | number
  reason: null | string
}

export interface ContextCategory {
  id: string
  label: string
  tokens: number
}

export interface ContextEstimate {
  total: number
  categories: ContextCategory[]
}

export interface ContextAnswer {
  contexts: Record<string, { estimate: ContextEstimate | null; context_window: null | number }>
}

export type ContextEntry =
  | { status: 'loaded'; sig: string; estimate: ContextEstimate | null; window: null | number }
  | { status: 'failed'; sig: string }

export type ContextKind = 'estimated' | 'loading' | 'measured' | 'none'

export interface ContextFigure {
  kind: ContextKind
  /** The figure's tokens (`null` for none / loading). */
  tokens: null | number
  /** The block's text: `155k`, `~108k`, `—`, `…`. */
  value: string
  /** `155k ctx`. */
  label: string
  /** The model's context window when known (never guessed), and the share of it in use. */
  window: null | number
  percent: null | number
  /** Why there is no usable measurement (a reason, confidence unknown, or none stored). */
  notMeasured: null | string
  /** The tooltip's context lines. */
  lines: string[]
}

/** Why a stored measurement no longer holds, as the backend names it. */
export const INVALID_REASONS: Record<string, string> = {
  compacted: 'compacted or pruned since that call',
  route_changed: 'the model or provider changed since that call',
  session_rotated: 'the session moved to another id since that call',
  storage_unavailable: 'the session store could not be read'
}

/** `154,789`: a full number with separators (tooltips and the inspector). */
export function fullNumber(value: null | number | undefined): string {
  const n = Number(value ?? 0)

  return Number.isFinite(n) ? Math.round(n).toLocaleString('en-US') : '—'
}

/** A row from a backend that predates card 12 (no context fields at all). */
export function reportsContext(row: SessionRow): boolean {
  return 'context_measured' in row
}

const validTokens = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0

/** The measurement, when it counts: no invalid reason and a known confidence. */
export function usableMeasurement(row: SessionRow): ContextMeasured | undefined {
  const measured = row.context_measured

  if (!measured || !validTokens(measured.tokens) || row.context_invalid_reason || measured.confidence === 'unknown') {
    return undefined
  }

  return measured
}

/** Whether the block needs the estimate fetched (no usable measurement, a backend that has it). */
export function needsEstimate(row: SessionRow): boolean {
  return reportsContext(row) && !usableMeasurement(row)
}

/** What a block's estimate depends on: a change refetches it. */
export function contextSignature(row: SessionRow): string {
  return [
    row.last_active ?? row.started_at ?? 0,
    row.message_count ?? 0,
    row.transcript_revision ?? 0,
    row.context_invalid_reason ?? '',
    row.context_measured?.sent_at ?? ''
  ].join('|')
}

function notMeasuredReason(row: SessionRow): string {
  const measured = row.context_measured
  const reason = row.context_invalid_reason

  if (measured && reason) {
    return `the last call's measurement no longer holds: ${INVALID_REASONS[reason] ?? reason}`
  }

  if (measured && measured.confidence === 'unknown') {
    return "the last call's cache confidence is unknown (an implicit cache reports only what it hit)"
  }

  return 'no prompt-cache call is stored for this session'
}

function windowParts(tokens: number, window: null | number): { window: null | number; percent: null | number } {
  return validTokens(window) && window > 0 ? { window, percent: Math.round((tokens / window) * 100) } : { window: null, percent: null }
}

/** The session's context figure: the one rule every style and the inspector use. */
export function contextFigure(row: SessionRow, entry: ContextEntry | undefined): ContextFigure {
  const known = entry?.status === 'loaded' ? entry.window : null
  const measured = usableMeasurement(row)

  if (measured) {
    const parts = windowParts(measured.tokens, known)
    const when = measured.sent_at ? ` (${dateTimeLabel(measured.sent_at)})` : ''

    return {
      kind: 'measured',
      tokens: measured.tokens,
      value: tokenLabel(measured.tokens),
      label: `${tokenLabel(measured.tokens)} ctx`,
      ...parts,
      notMeasured: null,
      lines: [
        `Context: ${fullNumber(measured.tokens)} tokens, measured at the last call${when}`,
        "Leaves out that call's uncached input and its reply.",
        ...windowLine(measured.tokens, parts)
      ]
    }
  }

  if (!reportsContext(row)) {
    return none(null, ['Context: not reported by this Hermes backend'])
  }

  const why = notMeasuredReason(row)

  // Card 12 fix r1 (D4): an entry fetched under another signature (the row moved on: a new message,
  // a compaction, the clock's validity) is never shown as the current figure, in any style, the
  // tooltip or the inspector: it is loading until the estimate for the row as it is now lands.
  if (!entry || entry.sig !== contextSignature(row)) {
    return { kind: 'loading', tokens: null, value: '…', label: '… ctx', window: null, percent: null, notMeasured: why, lines: ['Context: estimating…', `Not measured: ${why}.`] }
  }

  if (entry.status === 'failed') {
    return none(why, ['Context: the estimate could not be loaded', `Not measured: ${why}.`])
  }

  if (!entry.estimate || !validTokens(entry.estimate.total)) {
    return none(why, ['Context: none yet — the session has no stored system prompt (it never ran)'])
  }

  const total = entry.estimate.total
  const parts = windowParts(total, known)

  return {
    kind: 'estimated',
    tokens: total,
    value: `~${tokenLabel(total)}`,
    label: `~${tokenLabel(total)} ctx`,
    ...parts,
    notMeasured: why,
    lines: [`Context: ~${fullNumber(total)} tokens, estimated from the stored prompt, tools and transcript`, `Not measured: ${why}.`, ...windowLine(total, parts)]
  }
}

function none(why: null | string, lines: string[]): ContextFigure {
  return { kind: 'none', tokens: null, value: '—', label: '— ctx', window: null, percent: null, notMeasured: why, lines }
}

function windowLine(tokens: number, parts: { window: null | number; percent: null | number }): string[] {
  return parts.window ? [`Window: ${fullNumber(tokens)} / ${fullNumber(parts.window)} (${parts.percent}%)`] : []
}

/** The lifetime tokens (`input + output`, the row's columns, unchanged). */
export function lifetimeTokens(row: SessionRow | undefined): number {
  return Math.max(0, Number(row?.input_tokens) || 0) + Math.max(0, Number(row?.output_tokens) || 0)
}

/** `26k used`. */
export function usedLabel(tokens: number): string {
  return `${tokenLabel(tokens)} used`
}

export function lifetimeLine(row: SessionRow): string {
  return `${fullNumber(lifetimeTokens(row))} tokens used (lifetime: input + output)`
}

/** `14:07` in local time; with the date when it is not today. */
export function clockLabel(epochSeconds: number, nowMs: number): string {
  const date = new Date(epochSeconds * 1000)
  const now = new Date(nowMs)
  const hhmm = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`

  return date.toDateString() === now.toDateString() ? hhmm : dateTimeLabel(epochSeconds)
}

export interface CacheState {
  state: 'none' | CacheStateId
  /** `warm until 14:07`, `may be warm until 15:02`, `expired 2h ago`, `unknown (…)`. */
  text: string
}

/**
 * The cache state at `nowMs`: the backend's (`stored_cache_window` + `cache_certainly_warm` /
 * `cache_certainly_cold` when the rows were read), moved on by the clock since — warm before
 * `guaranteed_until`, may be warm until `estimated_until`, expired from then on.
 */
export function cacheState(window: CacheWindowRow | null | undefined, nowMs: number): CacheState {
  if (!window) {
    return { state: 'none', text: 'no prompt-cache call stored' }
  }

  if (window.state === 'unknown') {
    const reason = window.reason && INVALID_REASONS[window.reason] ? INVALID_REASONS[window.reason] : 'confidence unknown'

    return { state: 'unknown', text: `unknown (${reason})` }
  }

  const now = nowMs / 1000
  const guaranteed = validTokens(window.guaranteed_until) ? window.guaranteed_until : null
  const estimated = validTokens(window.estimated_until) ? window.estimated_until : null

  if (window.state === 'warm' && guaranteed !== null && now < guaranteed) {
    return { state: 'warm', text: `warm until ${clockLabel(guaranteed, nowMs)}` }
  }

  if (window.state !== 'expired' && estimated !== null && now < estimated) {
    return { state: 'may_be_warm', text: `may be warm until ${clockLabel(estimated, nowMs)}` }
  }

  if (estimated !== null) {
    const ago = shortAge(estimated, nowMs)

    return { state: 'expired', text: ago === 'now' ? 'expired just now' : `expired ${ago} ago` }
  }

  return { state: 'unknown', text: 'unknown (no end known)' }
}

/** Every block's tooltip lines below its title: the context, the lifetime figure, the cache. */
export function contextTooltip(row: SessionRow, entry: ContextEntry | undefined, nowMs: number): string[] {
  return [...contextFigure(row, entry).lines, lifetimeLine(row), `Cache: ${cacheState(row.cache_window, nowMs).text}`]
}

// --- the estimate store -------------------------------------------------------------------------

export type FetchContext = (profile: string, ids: string[]) => Promise<ContextAnswer>

export interface ContextWanted {
  /** The block's key (the graph node id); entries are kept under it. */
  key: string
  /** The stored session id the backend is asked for. */
  id: string
  profile: string
  sig: string
}

export interface ContextTimers {
  setTimeout(fn: () => void, ms: number): () => void
  now(): number
}

/** The backend's cap on ids per request. */
export const MAX_BATCH = 100
export const BATCH_MS = 60
/** A failed id is asked for again after this long (it shows `—` meanwhile). */
export const RETRY_AFTER_MS = 30_000
export const MAX_ENTRIES = 2000
const LOG_MAX = 200

export function wantedOf(node: { id: string; profile: string; row?: SessionRow }): ContextWanted | undefined {
  return node.row ? { key: node.id, id: node.row.id, profile: node.profile, sig: contextSignature(node.row) } : undefined
}

/**
 * Fix r1 (D2): what Rich cards ask for — every in-scope session without a usable measurement,
 * wherever it is (the scope scale needs them all; the store batches ≤ `MAX_BATCH` ids a request).
 */
export function inScopeWanted(nodes: Iterable<{ id: string; kind: string; profile: string; outOfScope?: boolean; row?: SessionRow }>): ContextWanted[] {
  const out: ContextWanted[] = []

  for (const node of nodes) {
    if (node.kind === 'session' && !node.outOfScope && node.row && needsEstimate(node.row)) {
      out.push(wantedOf(node)!)
    }
  }

  return out
}

export class ContextStore {
  private readonly fetchContext: FetchContext
  private readonly timers: ContextTimers
  private readonly entries = new Map<string, ContextEntry>()
  private readonly pending = new Map<string, ContextWanted>()
  private readonly inflight = new Map<string, string>()
  private readonly failedAt = new Map<string, number>()
  private readonly listeners = new Map<string, Set<() => void>>()
  private readonly everyListeners = new Set<() => void>()
  private cancelTimer: (() => void) | undefined
  private disposed = false
  /** Bumped on every settled answer (the Rich scale's subscription). */
  version = 0
  /** Every request made (most recent last, capped): tests and the e2e's diagnostics. */
  readonly log: { profile: string; ids: string[] }[] = []

  constructor(fetchContext: FetchContext, timers: ContextTimers) {
    this.fetchContext = fetchContext
    this.timers = timers
  }

  get(key: string): ContextEntry | undefined {
    return this.entries.get(key)
  }

  get size(): number {
    return this.entries.size
  }

  /** Asks for the estimates of `items`: only what is not current (a failure waits `RETRY_AFTER_MS`). */
  want(items: Iterable<ContextWanted | undefined>): void {
    if (this.disposed) {
      return
    }

    const now = this.timers.now()

    for (const item of items) {
      if (!item) {
        continue
      }

      const entry = this.entries.get(item.key)
      const failed = this.failedAt.get(item.key)

      // A failure waits RETRY_AFTER_MS only for the signature it failed under (a stale failed entry
      // shows as loading, D4, so a new signature is asked for at once).
      if (
        (entry?.status === 'loaded' && entry.sig === item.sig) ||
        this.inflight.get(item.key) === item.sig ||
        (failed !== undefined && entry?.sig === item.sig && now - failed < RETRY_AFTER_MS)
      ) {
        continue
      }

      this.pending.set(item.key, item)
    }

    if (this.pending.size > 0 && !this.cancelTimer) {
      this.cancelTimer = this.timers.setTimeout(() => this.flush(), BATCH_MS)
    }
  }

  subscribe(key: string, listener: () => void): () => void {
    let set = this.listeners.get(key)

    if (!set) {
      set = new Set()
      this.listeners.set(key, set)
    }

    set.add(listener)

    return () => {
      set.delete(listener)

      if (set.size === 0) {
        this.listeners.delete(key)
      }
    }
  }

  /** Any entry changed (`version` moved). */
  subscribeAll(listener: () => void): () => void {
    this.everyListeners.add(listener)

    return () => this.everyListeners.delete(listener)
  }

  /** Forgets every block not in `keys` (the loaded data), then the oldest past `MAX_ENTRIES`. */
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

  dispose(): void {
    this.disposed = true
    this.cancelTimer?.()
    this.cancelTimer = undefined
    this.pending.clear()
  }

  resume(): void {
    this.disposed = false
  }

  private set(key: string, entry: ContextEntry): void {
    this.entries.set(key, entry)
    this.version += 1

    for (const listener of [...(this.listeners.get(key) ?? [])]) {
      listener()
    }

    for (const listener of [...this.everyListeners]) {
      listener()
    }
  }

  private flush(): void {
    this.cancelTimer = undefined

    if (this.disposed) {
      return
    }

    const byProfile = new Map<string, ContextWanted[]>()

    for (const item of this.pending.values()) {
      byProfile.set(item.profile, [...(byProfile.get(item.profile) ?? []), item])
    }

    this.pending.clear()

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

        this.fetchContext(profile, ids).then(
          answer => this.settle(batch, answer),
          () => this.fail(batch)
        )
      }
    }
  }

  private settle(batch: readonly ContextWanted[], answer: ContextAnswer): void {
    for (const item of batch) {
      if (this.inflight.get(item.key) !== item.sig) {
        continue
      }

      this.inflight.delete(item.key)
      this.failedAt.delete(item.key)

      if (this.disposed) {
        continue
      }

      const found = answer?.contexts?.[item.id]
      const estimate = found?.estimate
      const valid =
        estimate && validTokens(estimate.total)
          ? {
              total: estimate.total,
              categories: Array.isArray(estimate.categories)
                ? estimate.categories
                    .filter(cat => cat && typeof cat.id === 'string' && validTokens(cat.tokens))
                    .map(cat => ({ id: cat.id, label: typeof cat.label === 'string' ? cat.label : cat.id, tokens: cat.tokens }))
                : []
            }
          : null

      this.set(item.key, { status: 'loaded', sig: item.sig, estimate: valid, window: validTokens(found?.context_window) && found.context_window > 0 ? found.context_window : null })
    }
  }

  private fail(batch: readonly ContextWanted[]): void {
    const now = this.timers.now()

    for (const item of batch) {
      if (this.inflight.get(item.key) === item.sig) {
        this.inflight.delete(item.key)
        this.failedAt.set(item.key, now)

        if (!this.disposed) {
          this.set(item.key, { status: 'failed', sig: item.sig })
        }
      }
    }
  }
}
