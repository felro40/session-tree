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
export const TOKEN_BAR = 54
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
