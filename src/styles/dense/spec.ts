/** Dense geometry (pure, no React): block size, layout spacing and link ports. */
import type { EdgeKind } from '../../model/graph.ts'
import type { LayoutSpec, Rect } from '../../model/layout.ts'
import type { Port } from '../../model/route.ts'

export const DENSE_WIDTH = 168
export const DENSE_HEIGHT = 26
/** "continued as" links leave and enter blocks this far from their left edge. */
export const DENSE_RESET_X = 22
export const DENSE_GRID = 16

export function denseLayoutSpec({ showAll }: { showAll: boolean }): LayoutSpec {
  return {
    nodeWidth: DENSE_WIDTH,
    nodeHeight: DENSE_HEIGHT,
    columnGap: 54,
    rowGap: 8,
    treeGap: 26,
    familyGap: 18,
    groupGap: 30,
    labelHeight: 26,
    singlesColumns: 4,
    includeSingles: showAll
  }
}

/** Branch links run left to right (right edge → left edge); "continued as" runs down. */
export function densePorts(kind: EdgeKind, source: Rect, target: Rect): { from: Port; to: Port } {
  if (kind === 'reset') {
    return {
      from: { x: source.x + DENSE_RESET_X, y: source.y + source.height, dir: 'down' },
      to: { x: target.x + DENSE_RESET_X, y: target.y, dir: 'up' }
    }
  }

  return {
    from: { x: source.x + source.width, y: source.y + source.height / 2, dir: 'right' },
    to: { x: target.x, y: target.y + target.height / 2, dir: 'left' }
  }
}
