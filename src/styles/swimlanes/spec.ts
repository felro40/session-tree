/**
 * Project swimlanes geometry (pure, no React): block size, the time scale, lane spacing and the
 * link ports. World units are flow pixels at 100 % zoom; the header column and the time axis are
 * screen-space overlays of a fixed size.
 */
import type { EdgeKind } from '../../model/graph.ts'
import type { LayoutSpec, Rect } from '../../model/layout.ts'
import type { Port } from '../../model/route.ts'

/** Compact block (mockup `variants/project-swimlanes/`: 170 × 54). */
export const SWIM_WIDTH = 170
export const SWIM_HEIGHT = 54
/** One local day on the time axis. */
export const DAY_WIDTH = 140
/** Day columns on the axis: today and the 8 days before it (the mockup's Nov 2 → Tue 10). */
export const WINDOW_DAYS = 9
/** The "earlier" zone left of the first day column. */
export const EARLIER_WIDTH = 420
/** Clear space between the last earlier-zone block and the first day column. */
export const EARLIER_GAP = 24
/** A child starts at least this far right of its parent's right edge (the right-of-parent clamp). */
export const CHILD_GAP = 36
/** Horizontal room kept free between two blocks of one row (half on each side). */
export const PACK_GAP = 16
/** A stand-in ("Parent not loaded") sits this far left of its child. */
export const STANDIN_GAP = 24
/** The project-scope ghost parents' column, this far left of the earlier zone. */
export const GHOST_GAP = 40
/** Row pitch inside a lane (block + gap) and the lane's top padding. */
export const ROW_HEIGHT = 72
export const LANE_PADDING = 16
export const LANE_MIN_HEIGHT = 112
/** A collapsed lane: a thin header with an activity bar. */
export const LANE_COLLAPSED_HEIGHT = 32
/** The "no branches N" chip, right of the rightmost block. */
export const CHIP_GAP = 24
export const CHIP_WIDTH = 118
export const CHIP_HEIGHT = 24
/** Screen-space overlays: the lane header column and the time axis. */
export const HEADER_WIDTH = 168
export const AXIS_HEIGHT = 26
/** "continued as" links leave the predecessor's bottom edge this far from its left edge. */
export const SWIM_RESET_X = 30
/** Elbow stub out of the parent's right edge, and the corner radius. */
export const ELBOW_STUB = 14
export const ELBOW_RADIUS = 7
/** Fit never zooms in past this. */
export const FIT_MAX_ZOOM = 1.15
export const SWIM_GRID = 16

/** The tooltip of the disabled Snap toggle (R12: no dragging in this style). */
export const NO_DRAG_TIP = 'Swimlanes has no dragging'

/**
 * Branch links run from the parent's right edge into the child's left edge. A "continued as"
 * link drops from the predecessor's bottom edge and runs right into the successor's left edge
 * (mockup); when the successor is not below and to the right of that drop, it uses the branch
 * shape instead.
 */
export function swimPorts(kind: EdgeKind, source: Rect, target: Rect): { from: Port; to: Port } {
  const to: Port = { x: target.x, y: target.y + target.height / 2, dir: 'left' }

  if (kind === 'reset') {
    const dropX = source.x + SWIM_RESET_X

    if (to.y > source.y + source.height + ELBOW_RADIUS + 2 && to.x > dropX + ELBOW_RADIUS + 2) {
      return { from: { x: dropX, y: source.y + source.height, dir: 'down' }, to }
    }
  }

  return { from: { x: source.x + source.width, y: source.y + source.height / 2, dir: 'right' }, to }
}

/** `1.4M`, `402k`, `950` — the mockup's token figures. */
export function tokenLabel(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '0'
  }

  if (value >= 1e6) {
    return `${(value / 1e6).toFixed(1)}M`
  }

  if (value >= 1e3) {
    return `${Math.round(value / 1e3)}k`
  }

  return String(Math.round(value))
}

/**
 * The shared layout spec (block size, Show all) for the canvas shell's bookkeeping: rectangles
 * for the router and which families are on the canvas. The lanes themselves come from `layout.ts`.
 */
export function swimLayoutSpec({ showAll }: { showAll: boolean }): LayoutSpec {
  return {
    nodeWidth: SWIM_WIDTH,
    nodeHeight: SWIM_HEIGHT,
    columnGap: CHILD_GAP,
    rowGap: ROW_HEIGHT - SWIM_HEIGHT,
    treeGap: 0,
    familyGap: 0,
    groupGap: 0,
    labelHeight: 0,
    singlesColumns: 1,
    includeSingles: showAll
  }
}
