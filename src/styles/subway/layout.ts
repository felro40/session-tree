/**
 * Subway map layout (R12, card 7): auto-arranged on first view, new sessions placed without moving
 * any placed station, dragging never re-parents.
 *
 * - A family is laid out on the metro grid: depth → column (`COLUMN` apart), one track per row
 *   (`ROW` apart). A station's first row child continues on its row; each later one takes the
 *   next free row below everything placed so far (depth first), so the rows between a station
 *   and a split hold only stations of earlier splits' subtrees, all in later columns. The drop
 *   from the parent's own bottom slot therefore runs through empty space, the splits of one
 *   station drop side by side (later splits further left), and no two tracks share a corridor.
 * - Families are stacked top to bottom, grouped by project (the shared `groupOrder`: the scoped
 *   project first, `projects.tree` order, no project last), each group under its label with room
 *   for the first row's station labels. With Show all, singles fill a grid under the group's trees.
 * - `previous` (stored positions) is kept exactly (the same objects). A new station goes where its
 *   track would put it (right of its parent on the parent's row for the first row child, else on
 *   a row under its placed siblings), at the nearest free spot *inside its group's band* (from its
 *   label down to the next group's label), keeping its label's room clear; a new family at the
 *   first free spot of its group's band; what does not fit goes under everything, with a
 *   continuation label for its group.
 */
import type { Family, GraphModel } from '../../model/graph.ts'
import { GROUP_PREFIX, LABEL_WIDTH, groupKey, groupOrder, labelGroup, laidOutFamilies } from '../../model/layout.ts'
import type { GroupLabel, LayoutResult, LayoutSpec, Point, Rect } from '../../model/layout.ts'
import { NO_PROJECT_ID } from '../../model/projects.ts'
import { subwayPlan } from './plan.ts'
import { COLUMN, FAMILY_STEP, GROUP_LABEL_H, GROUP_STEP, GROUP_TOP, LABEL_GAP, LABEL_H, LABEL_W, ROW, SINGLES_COLUMNS, STATION_H, STATION_W } from './spec.ts'

/** Columns a new family's spot is looked for in (a merge). */
export const MERGE_COLUMNS = 8
const CONTINUATION = '\u001f'

/** A family's stations on the grid: column and row (origin 0, 0), and the rows it uses. */
export function familyGrid(model: GraphModel, family: Family): { cells: Map<string, { col: number; row: number }>; rows: number } {
  const plan = subwayPlan(model)
  const cells = new Map<string, { col: number; row: number }>()

  if (family.nodeIds.length === 1) {
    cells.set(family.nodeIds[0], { col: 0, row: 0 })

    return { cells, rows: 1 }
  }

  let nextRow = 0
  const place = (id: string, col: number, row: number) => {
    cells.set(id, { col, row })

    for (const [index, kid] of (plan.rowKids.get(id) ?? []).entries()) {
      if (!cells.has(kid)) {
        place(kid, col + 1, index === 0 ? row : nextRow++)
      }
    }
  }

  for (const root of plan.roots.get(family.id) ?? family.nodeIds) {
    if (!cells.has(root)) {
      place(root, 0, nextRow++)
    }
  }

  return { cells, rows: nextRow }
}

/** A fresh layout of everything the spec shows. */
export function freshSubwayLayout(model: GraphModel, spec: LayoutSpec): LayoutResult {
  const families = laidOutFamilies(model, spec)
  const positions = new Map<string, Point>()
  const labels: GroupLabel[] = []
  let y = 0

  for (const projectId of groupOrder(model, families)) {
    const key = groupKey(projectId)
    const inGroup = families.filter(family => (family.projectId ?? NO_PROJECT_ID) === (projectId ?? NO_PROJECT_ID))

    if (inGroup.length === 0) {
      continue
    }

    labels.push({ id: key, projectId })
    positions.set(key, { x: 0, y })
    let top = y + GROUP_TOP
    let last = top

    for (const family of inGroup.filter(each => each.nodeIds.length > 1)) {
      const grid = familyGrid(model, family)

      for (const [id, cell] of grid.cells) {
        positions.set(id, { x: cell.col * COLUMN, y: top + cell.row * ROW })
      }

      last = top + (grid.rows - 1) * ROW
      top = last + FAMILY_STEP
    }

    const singles = inGroup.filter(each => each.nodeIds.length === 1)

    singles.forEach((family, index) => {
      positions.set(family.nodeIds[0], { x: (index % SINGLES_COLUMNS) * COLUMN, y: top + Math.floor(index / SINGLES_COLUMNS) * ROW })
    })

    if (singles.length > 0) {
      last = top + (Math.ceil(singles.length / SINGLES_COLUMNS) - 1) * ROW
    }

    y = last + GROUP_STEP
  }

  return { positions, labels }
}

/** A station's footprint: its box and the room of a label above it (the auto-layout's place). */
export function footprint(point: Point): Rect {
  const top = point.y - LABEL_GAP - LABEL_H - LABEL_GAP

  return { x: point.x - 4, y: top, width: Math.max(STATION_W, LABEL_W + 4) + 8, height: point.y + STATION_H + LABEL_GAP - top }
}

/** Rectangles in buckets: overlap queries in near-constant time (the 500-session fixture). */
export class RectIndex {
  private readonly buckets = new Map<string, Rect[]>()
  private static readonly SIZE = 300

  add(rect: Rect): void {
    for (const key of this.keys(rect)) {
      const list = this.buckets.get(key)

      if (list) {
        list.push(rect)
      } else {
        this.buckets.set(key, [rect])
      }
    }
  }

  /** The rectangles that overlap `rect` (each once). */
  hits(rect: Rect): Rect[] {
    const out = new Set<Rect>()

    for (const key of this.keys(rect)) {
      for (const other of this.buckets.get(key) ?? []) {
        if (rect.x < other.x + other.width && other.x < rect.x + rect.width && rect.y < other.y + other.height && other.y < rect.y + rect.height) {
          out.add(other)
        }
      }
    }

    return [...out]
  }

  private *keys(rect: Rect): Generator<string> {
    const size = RectIndex.SIZE

    for (let bx = Math.floor(rect.x / size); bx <= Math.floor((rect.x + rect.width) / size); bx += 1) {
      for (let by = Math.floor(rect.y / size); by <= Math.floor((rect.y + rect.height) / size); by += 1) {
        yield `${bx},${by}`
      }
    }
  }
}

interface Band {
  top: number
  bottom: number
}

/** Positions for `model` that keep every position of `previous` (the same objects). */
export function mergeSubwayLayout(previous: ReadonlyMap<string, Point>, model: GraphModel, spec: LayoutSpec): LayoutResult {
  const positions = new Map(previous)
  const families = laidOutFamilies(model, spec)
  const plan = subwayPlan(model)
  const index = new RectIndex()
  const labelRect = (point: Point): Rect => ({ x: point.x, y: point.y, width: LABEL_WIDTH, height: GROUP_LABEL_H })
  let bottom = 0

  // Every remembered station is an obstacle, also one not shown now (it comes back to its spot).
  for (const [id, point] of positions) {
    const rect = id.startsWith(GROUP_PREFIX) ? labelRect(point) : footprint(point)

    index.add(rect)
    bottom = Math.max(bottom, rect.y + rect.height)
  }

  const labelsSorted = () => [...positions].filter(([id]) => id.startsWith(GROUP_PREFIX)).sort(([a, p], [b, q]) => p.y - q.y || (a < b ? -1 : 1))

  /** The band of group `key` holding `anchorY` (its lowest label at or above it, else its first). */
  const bandOf = (key: string, anchorY?: number): Band | undefined => {
    const all = labelsSorted()
    const own = all.filter(([id]) => labelGroup(id) === key)

    if (own.length === 0) {
      return undefined
    }

    const pick = anchorY === undefined ? own[0] : (own.filter(([, point]) => point.y <= anchorY).pop() ?? own[0])
    const next = all.find(([, point]) => point.y > pick[1].y)

    return { top: pick[1].y + GROUP_LABEL_H, bottom: next ? next[1].y : Infinity }
  }

  const inBand = (point: Point, band: Band) => footprint(point).y >= band.top && point.y + STATION_H + LABEL_GAP <= band.bottom
  const free = (point: Point) => index.hits(footprint(point)).length === 0
  const place = (id: string, point: Point) => {
    positions.set(id, point)
    const rect = footprint(point)

    index.add(rect)
    bottom = Math.max(bottom, rect.y + rect.height)
  }

  /** A continuation label for `key` under everything; returns its first station row's y. */
  const continueGroup = (key: string): number => {
    let n = 1

    while (positions.has(`${key}${CONTINUATION}${n}`)) {
      n += 1
    }

    const label = { x: 0, y: bottom + GROUP_STEP }

    positions.set(`${key}${CONTINUATION}${n}`, label)
    index.add(labelRect(label))
    bottom = label.y + GROUP_LABEL_H

    return label.y + GROUP_TOP
  }

  /** The nearest free spot to `base` inside `band`: its row (right, then left), then rows below, then above. */
  const nearest = (base: Point, band: Band): Point | undefined => {
    for (const dy of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, -1, -2, -3, -4]) {
      for (let k = 0; k <= 12; k += 1) {
        for (const sign of k === 0 ? [1] : [1, -1]) {
          const point = { x: base.x + sign * k * COLUMN, y: base.y + dy * ROW }

          if (inBand(point, band) && free(point)) {
            return point
          }
        }
      }
    }

    return undefined
  }

  const newFamilies: Family[] = []

  for (const family of families) {
    if (!family.nodeIds.some(id => positions.has(id))) {
      newFamilies.push(family)
      continue
    }

    const key = groupKey(family.projectId)

    // Members come in creation order: parents before children, predecessors first.
    for (const id of family.nodeIds) {
      if (positions.has(id)) {
        continue
      }

      const parent = model.parentOf.get(id) ?? model.continuedFrom.get(id)
      const child = (plan.rowKids.get(id) ?? []).find(kid => positions.has(kid))
      let base: Point

      if (parent && positions.has(parent)) {
        const p = positions.get(parent)!
        const kids = plan.rowKids.get(parent) ?? []
        const placed = kids.filter(kid => kid !== id && positions.has(kid)).map(kid => positions.get(kid)!.y)

        base = kids.indexOf(id) === 0 && placed.length === 0 ? { x: p.x + COLUMN, y: p.y } : { x: p.x + COLUMN, y: Math.max(p.y, ...placed) + ROW }
      } else if (child) {
        const c = positions.get(child)!

        base = { x: c.x - COLUMN, y: c.y }
      } else {
        base = family.nodeIds.map(other => positions.get(other)).find((point): point is Point => Boolean(point)) ?? { x: 0, y: GROUP_TOP }
      }

      const band = bandOf(key, base.y)
      const spot = band ? nearest(base, band) : undefined

      place(id, spot ?? { x: 0, y: continueGroup(key) })
    }
  }

  // New families (and singles with Show all): the first free spot of their group's band, else under
  // everything (with a label when the group has none yet, a continuation label when it has one).
  for (const family of newFamilies) {
    const key = groupKey(family.projectId)
    const grid = familyGrid(model, family)
    const cells = [...grid.cells]
    const band = bandOf(key)
    let spot: Point | undefined

    if (band) {
      const first = band.top - GROUP_LABEL_H + GROUP_TOP

      for (let row = 0; row < 400 && !spot; row += 1) {
        const y = first + row * ROW

        if (y + STATION_H > band.bottom) {
          break
        }

        for (let col = 0; col < MERGE_COLUMNS && !spot; col += 1) {
          const at = { x: col * COLUMN, y }

          if (cells.every(([, cell]) => inBand({ x: at.x + cell.col * COLUMN, y: at.y + cell.row * ROW }, band!) && free({ x: at.x + cell.col * COLUMN, y: at.y + cell.row * ROW }))) {
            spot = at
          }
        }
      }
    }

    if (!spot) {
      if (band) {
        spot = { x: 0, y: continueGroup(key) }
      } else {
        const label = { x: 0, y: bottom + GROUP_STEP }

        positions.set(key, label)
        index.add(labelRect(label))
        bottom = label.y + GROUP_LABEL_H
        spot = { x: 0, y: label.y + GROUP_TOP }
      }
    }

    for (const [id, cell] of cells) {
      place(id, { x: spot.x + cell.col * COLUMN, y: spot.y + cell.row * ROW })
    }
  }

  // Labels (continuations too) of groups that still have stations on the canvas.
  const present = new Set(families.map(family => groupKey(family.projectId)))
  const labels = [...positions.keys()]
    .filter(id => id.startsWith(GROUP_PREFIX) && present.has(labelGroup(id)))
    .map(id => {
      const projectId = labelGroup(id).slice(GROUP_PREFIX.length)

      return { id, projectId: projectId === NO_PROJECT_ID ? undefined : projectId }
    })

  return { positions, labels }
}

export function layoutSubway(model: GraphModel, previous: ReadonlyMap<string, Point> | undefined, spec: LayoutSpec): LayoutResult {
  return previous && previous.size > 0 ? mergeSubwayLayout(previous, model, spec) : freshSubwayLayout(model, spec)
}
