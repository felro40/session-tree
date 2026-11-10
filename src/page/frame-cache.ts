/**
 * When a framed style (Swimlanes) is laid out again (B1, card-5 review). The page's clock ticks
 * every minute so ages and the now marker move; a new layout on every tick gave a new positions
 * map, which re-ran the canvas's obstacle router over every block (0.5–0.7 s on 500 sessions).
 *
 * - The layout is recomputed only when one of its real inputs changes: the style, the graph
 *   model (rows, projects, scope, profile, Show archived), Show all, the collapsed lanes, the
 *   local day of "now" or the time-zone offset at "now". A minute tick inside the same local day
 *   and offset returns the previous layout object itself.
 * - The `nowMs` given to the pure layout (the future-start clamp) is the one captured at that
 *   recompute; the now marker follows the live clock in the style's layers (`swimNowX`).
 * - Defence in depth: when a recompute yields the same positions (or the same shown set), the
 *   previous map (set) is reused, so the canvas's rectangles and routes stay put.
 *
 * Pure (no React): the page holds one cache per mounted page.
 */
import type { GraphModel } from '../model/graph.ts'
import type { Point } from '../model/layout.ts'
import type { FrameLayout, StyleFrame } from '../styles/types.ts'

/** Minutes to add to UTC for local time at an instant (ms). */
export type OffsetAt = (ms: number) => number

/** The browser's offset at an instant. */
export const browserOffsetAt: OffsetAt = ms => -new Date(ms).getTimezoneOffset()

const DAY_MS = 86_400_000

/** The local day of `nowMs` and the offset in force then: what a framed layout keys on. */
export function clockKey(nowMs: number, offsetAt: OffsetAt): { day: number; offset: number } {
  const offset = offsetAt(nowMs)

  return { day: Math.floor((nowMs + offset * 60_000) / DAY_MS), offset }
}

export interface FrameRequest {
  frame: StyleFrame
  model: GraphModel
  showAll: boolean
  collapsed: ReadonlySet<string>
  nowMs: number
  /** Defaults to `browserOffsetAt`. */
  offsetAt?: OffsetAt
}

interface Entry {
  frame: StyleFrame
  model: GraphModel
  showAll: boolean
  collapsed: ReadonlySet<string>
  offsetAt: OffsetAt
  day: number
  offset: number
  layout: FrameLayout
}

const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>) => a === b || (a.size === b.size && [...a].every(each => b.has(each)))

function samePositions(a: ReadonlyMap<string, Point>, b: ReadonlyMap<string, Point>): boolean {
  if (a === b) {
    return true
  }

  if (a.size !== b.size) {
    return false
  }

  for (const [id, point] of a) {
    const other = b.get(id)

    if (!other || other.x !== point.x || other.y !== point.y) {
      return false
    }
  }

  return true
}

export interface FrameCache {
  /** The layout for this request: the previous object when no real input changed. */
  get(request: FrameRequest): FrameLayout
  /** How many times the style's `compute` ran (tests and diagnostics). */
  readonly computed: number
}

export function createFrameCache(): FrameCache {
  let last: Entry | undefined
  let computed = 0

  return {
    get computed() {
      return computed
    },

    get(request) {
      const offsetAt = request.offsetAt ?? browserOffsetAt
      const { day, offset } = clockKey(request.nowMs, offsetAt)

      if (
        last &&
        last.frame === request.frame &&
        last.model === request.model &&
        last.showAll === request.showAll &&
        last.offsetAt === offsetAt &&
        last.day === day &&
        last.offset === offset &&
        sameSet(last.collapsed, request.collapsed)
      ) {
        return last.layout
      }

      computed += 1
      const layout = request.frame.compute({ model: request.model, showAll: request.showAll, collapsed: request.collapsed, nowMs: request.nowMs, offsetAt })

      if (last) {
        // Same values, same objects: the canvas does not rebuild its rectangles or re-route.
        if (samePositions(last.layout.positions, layout.positions)) {
          layout.positions = last.layout.positions
        }

        if (sameSet(last.layout.shown, layout.shown)) {
          layout.shown = last.layout.shown
        }
      }

      last = { frame: request.frame, model: request.model, showAll: request.showAll, collapsed: request.collapsed, offsetAt, day, offset, layout }

      return layout
    }
  }
}
