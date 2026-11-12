/**
 * Card 10 (L3, A9): the camera of a project scope. Block positions are shared by every scope,
 * so a scope differs from All projects only in what it frames and in its remembered view (zoom +
 * pan per style + profile + scope, on this device: `viewport.v2`).
 *
 * - A project scope frames that project's blocks on the canvas (Fit, and a first visit with no
 *   remembered view); All projects frames everything.
 * - A remembered view comes back, unless it shows none of what the scope frames: then it is
 *   framed instead.
 *
 * No React and no SDK in here (unit tests).
 */
import { ALL_PROJECTS } from './graph.ts'
import type { GraphModel } from './graph.ts'
import { anyInView, laidOutFamilies } from './layout.ts'
import type { LayoutSpec, Point } from './layout.ts'

export interface View {
  x: number
  y: number
  zoom: number
}

/**
 * The blocks a scope frames: in a project scope its own blocks on the canvas (not dimmed);
 * `undefined` for All projects, or a scope with none on the canvas (then everything).
 */
export function scopeFrameIds(model: GraphModel, spec: Pick<LayoutSpec, 'includeSingles'>, scope: string): string[] | undefined {
  if (scope === ALL_PROJECTS) {
    return undefined
  }

  const ids = laidOutFamilies(model, spec)
    .flatMap(family => family.nodeIds)
    .filter(id => model.nodeById.get(id)?.outOfScope === false)

  return ids.length > 0 ? ids : undefined
}

/**
 * What the camera does on arriving at a view: its remembered `saved` view when that shows some
 * of `ids` (`positions` + `size`, over a `width` × `height` pane), else `'fit'` (frame them).
 */
export function viewOnArrival(
  saved: undefined | View,
  ids: readonly string[],
  positions: ReadonlyMap<string, Point>,
  size: { width: number; height: number },
  pane: { width: number; height: number }
): View | 'fit' {
  if (!saved) {
    return 'fit'
  }

  if (pane.width <= 0 || pane.height <= 0) {
    return saved
  }

  const rects = ids.flatMap(id => {
    const point = positions.get(id)

    return point ? [{ x: point.x, y: point.y, ...size }] : []
  })

  return anyInView(rects, saved, pane.width, pane.height) ? saved : 'fit'
}
