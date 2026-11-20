/**
 * Rich cards geometry (pure, no React): card size, layout spacing, link ports and the token
 * scale (mockup `variants/rich-cards/`). Trees grow top-down: a parent above its children, links
 * from the parent's bottom edge into the child's top edge; a "continued as" successor stands to
 * the right of its predecessor's tree, linked edge to edge.
 */
import type { EdgeKind, GraphModel, GraphNode } from '../../model/graph.ts'
import type { LayoutSpec, Rect } from '../../model/layout.ts'
import type { Port } from '../../model/route.ts'

/** Airy, fixed-size cards: the layout never jumps when the details arrive. */
export const RICH_WIDTH = 280
export const RICH_HEIGHT = 164
/** Horizontal room between sibling cards. */
export const SIBLING_GAP = 60
/** Vertical room between a parent and its children (the needs-input banner sits above a card). */
export const LEVEL_GAP = 100
/** Canvas y of the top row of cards; the project labels sit above it. */
export const LABEL_BAND = 44
export const LABEL_HEIGHT = 26
export const RICH_GRID = 20
/** The token bar's full width (px) and the ghost cards' offset per compacted layer. */
export const TOKEN_BAR = 32
export const GHOST_STEP = 9
export const MAX_GHOSTS = 2
/** x offset where a (rare) vertical "continued as" handle sits. */
export const RICH_RESET_X = 40

export function richLayoutSpec({ showAll }: { showAll: boolean }): LayoutSpec {
  return {
    nodeWidth: RICH_WIDTH,
    nodeHeight: RICH_HEIGHT,
    columnGap: SIBLING_GAP,
    rowGap: LEVEL_GAP,
    treeGap: 48,
    familyGap: SIBLING_GAP,
    groupGap: 120,
    labelHeight: LABEL_HEIGHT,
    singlesColumns: 3,
    includeSingles: showAll
  }
}

/** Branch links run top-down (bottom centre → top centre); "continued as" runs right. */
export function richPorts(kind: EdgeKind, source: Rect, target: Rect): { from: Port; to: Port } {
  if (kind === 'reset') {
    return {
      from: { x: source.x + source.width, y: source.y + source.height / 2, dir: 'right' },
      to: { x: target.x, y: target.y + target.height / 2, dir: 'left' }
    }
  }

  return {
    from: { x: source.x + source.width / 2, y: source.y + source.height, dir: 'down' },
    to: { x: target.x + target.width / 2, y: target.y, dir: 'up' }
  }
}

/** A session's tokens as the card counts them (in + out). */
export const cardTokens = (node: GraphNode): number => Math.max(0, Number(node.row?.input_tokens) || 0) + Math.max(0, Number(node.row?.output_tokens) || 0)

/** The token bar's scale: the largest session in the current scope (every session for All projects). */
export function maxTokensInScope(model: GraphModel): number {
  let max = 0

  for (const node of model.nodes) {
    if (node.kind === 'session' && !node.outOfScope) {
      max = Math.max(max, cardTokens(node))
    }
  }

  return max
}

/** The bar's filled width in px: tokens / max of `TOKEN_BAR`. */
export function tokenBarWidth(tokens: number, max: number): number {
  return max > 0 ? (TOKEN_BAR * Math.min(tokens, max)) / max : 0
}

/**
 * The context bars' scope scale (card 12 fix r1, D1/D3): the largest context figure over the
 * in-scope sessions, or `pending` until every one of them has settled once.
 */
export interface ContextScale {
  pending: boolean
  /** The largest in-scope figure (0 while pending). */
  max: number
  /** Each in-scope session's last settled contribution (the next call's `previous`). */
  settled: ReadonlyMap<string, number>
}

/**
 * Card 12 (A2): the bar shows the context. Filled against the model's context window when that is
 * known, else against the scope scale (`scale`: the largest context in the scope, the old token
 * bar's rule). While that scale is pending (fix r1, D3) the bar is unfilled and has no `of`; the
 * window path never waits for the scope.
 */
export function contextBar(
  tokens: null | number,
  window: null | number,
  scale: number | Pick<ContextScale, 'max' | 'pending'>
): { width: number; scale: 'pending' | 'scope' | 'window'; of: null | number } {
  const value = tokens ?? 0
  const { max, pending } = typeof scale === 'number' ? { max: scale, pending: false } : scale

  if (window && window > 0) {
    return { width: tokenBarWidth(value, window), scale: 'window', of: window }
  }

  return pending ? { width: 0, scale: 'pending', of: null } : { width: tokenBarWidth(value, max), scale: 'scope', of: max }
}

/**
 * A figure's share of the scope scale: measured → its tokens, estimated → `estimate.total`,
 * none / failed / no row → 0, loading (on its way, or stale: D4) → `null` (not settled).
 */
export function scaleTokens(figure: undefined | { kind: string; tokens: null | number }): null | number {
  if (!figure) {
    return 0
  }

  if (figure.kind === 'loading') {
    return null
  }

  return figure.kind === 'none' ? 0 : Math.max(0, figure.tokens ?? 0)
}

/**
 * Fix r1 (D1, D3): the bars' scale over the same rows `maxTokensInScope` reads (every in-scope
 * session, whatever is or was in the viewport). Pending until each has settled once; afterwards a
 * row that is being refetched (loading again: a new signature) keeps its `previous` settled value
 * until its new figure lands. So the scale follows the data's versions, never the viewport.
 * Pure: `figureOf` is the card's `contextFigure`, `previous` the last call's `settled`.
 */
export function contextScaleInScope(
  model: GraphModel,
  figureOf: (node: GraphNode) => undefined | { kind: string; tokens: null | number },
  previous: ReadonlyMap<string, number> = new Map()
): ContextScale {
  const settled = new Map<string, number>()
  let max = 0
  let pending = false

  for (const node of model.nodes) {
    if (node.kind === 'session' && !node.outOfScope) {
      const value = scaleTokens(figureOf(node)) ?? previous.get(node.id)

      if (value === undefined) {
        pending = true
      } else {
        settled.set(node.id, value)
        max = Math.max(max, value)
      }
    }
  }

  return { pending, max: pending ? 0 : max, settled }
}

/** `contextScaleInScope` with its `previous` kept between calls (one per Rich canvas). */
export class ScopeScaleMemory {
  private settled: ReadonlyMap<string, number> = new Map()

  update(model: GraphModel, figureOf: (node: GraphNode) => undefined | { kind: string; tokens: null | number }): ContextScale {
    const next = contextScaleInScope(model, figureOf, this.settled)

    this.settled = next.settled

    return next
  }
}

/** `claude-opus-4.1` → `opus-4.1`; `anthropic/claude-sonnet-5` → `sonnet-5`. */
export function shortModel(model: null | string | undefined): string {
  const last = (model ?? '').trim().split('/').pop() ?? ''

  return last.replace(/^claude-/, '') || '—'
}

/** Sparkline geometry for 7 values in a `width` × `height` box (mockup formula). */
export function sparkPoints(values: readonly number[], width = 50, height = 18): { x: number; y: number }[] {
  const max = Math.max(1, ...values)
  const n = Math.max(1, values.length - 1)

  return values.map((value, index) => ({ x: 2 + (index * (width - 4)) / n, y: height - 2 - (value / max) * (height - 5) }))
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** The sparkline tooltip: one line per local day, `Mon 11-03: 4 msgs`. */
export function activityTooltip(values: readonly number[], days: readonly string[]): string {
  const lines = values.map((value, index) => {
    const day = days[index]
    const date = day ? new Date(`${day}T12:00:00Z`) : undefined
    const label = date && !Number.isNaN(date.getTime()) ? `${WEEKDAYS[date.getUTCDay()]} ${day.slice(5)}` : `day ${index + 1}`

    return `${label}: ${value} msg${value === 1 ? '' : 's'}`
  })

  return `Last 7 days\n${lines.join('\n')}`
}
