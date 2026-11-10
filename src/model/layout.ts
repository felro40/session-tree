/**
 * Auto-layout (R12): a deterministic tidy-tree layout of the graph model.
 *
 * - Each family is a forest: a tree per root (a node with no branch parent), depth → column
 *   (left to right), leaves stacked in order, a parent centred on its children. Siblings are
 *   ordered by creation time. A "continued as" successor's tree is stacked under its
 *   predecessor's tree, so the dashed link runs down (Dense mockup).
 * - Families are packed top to bottom without overlap, grouped by project (project order from
 *   `projects.tree`, the scoped project first, no project last) under a group label; inside a
 *   group the most recently used family comes first.
 * - Singles are laid out only when the style shows them on the canvas ("Show all"); then they
 *   fill a grid at the foot of their project group.
 * - `mergeLayout` places new nodes without moving any node that already has a position.
 */
import { ALL_PROJECTS } from './graph.ts'
import type { Family, GraphModel } from './graph.ts'
import { NO_PROJECT_ID } from './projects.ts'

export interface Point {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface LayoutSpec {
  nodeWidth: number
  nodeHeight: number
  /** Gap between depth columns. */
  columnGap: number
  /** Gap between stacked rows. */
  rowGap: number
  /** Extra gap above a "continued as" successor tree (room for its label). */
  treeGap: number
  familyGap: number
  groupGap: number
  /** Height reserved for a group label above the group. */
  labelHeight: number
  singlesColumns: number
  includeSingles: boolean
}

export const GROUP_PREFIX = 'group:'
export const LABEL_WIDTH = 240

export interface GroupLabel {
  id: string
  projectId?: string
}

export const groupKey = (projectId: string | undefined) => `${GROUP_PREFIX}${projectId ?? NO_PROJECT_ID}`

export interface LayoutResult {
  /** Node id → top-left; group label id (`group:<project>`) → its top-left. */
  positions: Map<string, Point>
  labels: GroupLabel[]
}

/** Families this spec puts on the canvas. */
export function laidOutFamilies(model: GraphModel, spec: Pick<LayoutSpec, 'includeSingles'>): Family[] {
  return model.families.filter(family => spec.includeSingles || family.nodeIds.length > 1)
}

/** Family-local positions (origin 0,0) and the family's height. */
function layoutFamily(model: GraphModel, family: Family, spec: LayoutSpec): { positions: Map<string, Point>; height: number } {
  const step = spec.nodeHeight + spec.rowGap
  const column = spec.nodeWidth + spec.columnGap
  const members = new Set(family.nodeIds)
  const positions = new Map<string, Point>()
  const seen = new Set<string>()
  let cursorY = 0

  const byCreated = (a: string, b: string) =>
    (model.nodeById.get(a)?.createdAt ?? 0) - (model.nodeById.get(b)?.createdAt ?? 0) || a.localeCompare(b)

  const place = (id: string, depth: number): number => {
    seen.add(id)
    const kids = (model.childrenOf.get(id) ?? []).filter(kid => members.has(kid) && !seen.has(kid))
    let y: number

    if (kids.length === 0) {
      y = cursorY
      cursorY += step
    } else {
      const ys = kids.map(kid => place(kid, depth + 1))

      y = (ys[0] + ys[ys.length - 1]) / 2
    }

    positions.set(id, { x: depth * column, y })

    return y
  }

  const roots = family.nodeIds.filter(id => !model.parentOf.has(id) || !members.has(model.parentOf.get(id)!))
  const queue = roots.filter(id => !model.continuedFrom.has(id)).sort(byCreated)

  const placeTree = (root: string) => {
    if (seen.has(root)) {
      return
    }

    if (positions.size > 0) {
      cursorY += spec.treeGap
    }

    const before = new Set(positions.keys())

    place(root, 0)

    // Successors of anything in this tree come next, oldest first.
    const successors = [...positions.keys()]
      .filter(id => !before.has(id))
      .flatMap(id => model.continuedAs.get(id) ?? [])
      .filter(id => members.has(id))
      .sort(byCreated)

    for (const successor of successors) {
      placeTree(successor)
    }
  }

  for (const root of queue) {
    placeTree(root)
  }

  // Anything left (cycles, successors whose predecessor was not reached): its own tree.
  for (const id of [...roots, ...family.nodeIds].sort(byCreated)) {
    placeTree(id)
  }

  return { positions, height: Math.max(0, cursorY - spec.rowGap) }
}

/** Groups in display order: the scoped project first, then `projects.tree` order, no project last. */
function groupOrder(model: GraphModel, families: readonly Family[]): (string | undefined)[] {
  const present = new Set(families.map(family => family.projectId ?? NO_PROJECT_ID))
  const order: string[] = []
  const scope = model.options.scope

  if (scope !== ALL_PROJECTS && present.has(scope)) {
    order.push(scope)
  }

  for (const project of model.projects) {
    if (!project.isNoProject && present.has(project.id) && !order.includes(project.id)) {
      order.push(project.id)
    }
  }

  for (const id of [...present].sort()) {
    if (id !== NO_PROJECT_ID && !order.includes(id)) {
      order.push(id)
    }
  }

  if (present.has(NO_PROJECT_ID) && !order.includes(NO_PROJECT_ID)) {
    order.push(NO_PROJECT_ID)
  }

  return order.map(id => (id === NO_PROJECT_ID ? undefined : id))
}

/** Lays out `families` from `top` down; returns positions, labels and the bottom edge. */
function layoutFamilies(
  model: GraphModel,
  families: readonly Family[],
  spec: LayoutSpec,
  top: number,
  skipLabels: ReadonlySet<string> = new Set()
): LayoutResult & { bottom: number } {
  const positions = new Map<string, Point>()
  const labels: GroupLabel[] = []
  const step = spec.nodeHeight + spec.rowGap
  let y = top

  for (const projectId of groupOrder(model, families)) {
    const inGroup = families.filter(family => (family.projectId ?? NO_PROJECT_ID) === (projectId ?? NO_PROJECT_ID))
    const key = groupKey(projectId)

    if (inGroup.length === 0) {
      continue
    }

    if (!skipLabels.has(key)) {
      labels.push({ id: key, projectId })
      positions.set(key, { x: 0, y })
      y += spec.labelHeight
    }

    const trees = inGroup.filter(family => family.nodeIds.length > 1)
    const singles = inGroup.filter(family => family.nodeIds.length === 1)

    for (const family of trees) {
      const local = layoutFamily(model, family, spec)

      for (const [id, point] of local.positions) {
        positions.set(id, { x: point.x, y: point.y + y })
      }

      y += local.height + spec.familyGap
    }

    singles.forEach((family, index) => {
      positions.set(family.nodeIds[0], {
        x: (index % spec.singlesColumns) * (spec.nodeWidth + spec.columnGap),
        y: y + Math.floor(index / spec.singlesColumns) * step
      })
    })

    if (singles.length > 0) {
      y += Math.ceil(singles.length / spec.singlesColumns) * step - spec.rowGap + spec.familyGap
    }

    y += spec.groupGap - spec.familyGap
  }

  return { positions, labels, bottom: y }
}

/** A fresh layout of everything this spec shows. */
export function layoutGraph(model: GraphModel, spec: LayoutSpec): LayoutResult {
  const { positions, labels } = layoutFamilies(model, laidOutFamilies(model, spec), spec, 0)

  return { positions, labels }
}

export function rectOf(id: string, point: Point, spec: Pick<LayoutSpec, 'labelHeight' | 'nodeHeight' | 'nodeWidth'>): Rect {
  return id.startsWith(GROUP_PREFIX)
    ? { x: point.x, y: point.y, width: LABEL_WIDTH, height: spec.labelHeight }
    : { x: point.x, y: point.y, width: spec.nodeWidth, height: spec.nodeHeight }
}

export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

/**
 * A label that continues a project group further down the canvas: used only when a new family
 * of a labelled group is too tall for that group's band (`mergeLayout`).
 */
const CONTINUATION = '\u001f'

/** The group (`group:<project>`) a label id belongs to, continuation labels included. */
export function labelGroup(id: string): string {
  const cut = id.indexOf(CONTINUATION)

  return cut === -1 ? id : id.slice(0, cut)
}

/** Vertical room of one group label on the canvas: under it, down to the next label. */
interface Band {
  top: number
  /** Last y a block's bottom edge may reach; `Infinity` for the lowest group. */
  bottom: number
}

/**
 * Positions for `model` that keep every position in `previous` (R12: new sessions never move
 * blocks already placed, by the user or an earlier layout). Everything new is placed inside
 * its own project group's band (from under its label down to the next group's label), so it
 * never lands under another project's heading:
 * - a new node of a known family goes next to its parent (next column, under its last
 *   sibling), predecessor or child, at the nearest free row of that column inside the band,
 *   else in the next column to the right that has one;
 * - a whole new family (or a single, with Show all) goes at the first free spot of its band,
 *   scanning columns left to right and rows top to bottom; a family taller than the band is
 *   laid out under everything with a continuation label for its project;
 * - families of a project that has no group yet are laid out under everything, labelled.
 * Deterministic: the same inputs give the same positions.
 */
export function mergeLayout(previous: ReadonlyMap<string, Point> | undefined, model: GraphModel, spec: LayoutSpec): LayoutResult {
  if (!previous || previous.size === 0) {
    return layoutGraph(model, spec)
  }

  const positions = new Map(previous)
  const families = laidOutFamilies(model, spec)
  const shown = new Set(families.flatMap(family => family.nodeIds))
  const step = spec.nodeHeight + spec.rowGap
  const column = spec.nodeWidth + spec.columnGap
  // Blocks keep half a gap clear on each side, so a new block never touches a neighbour.
  const clearX = spec.columnGap / 2
  const clearY = spec.rowGap / 2

  const blockRects = (): Rect[] =>
    [...positions]
      .filter(([id]) => shown.has(id))
      .map(([id, point]) => rectOf(id, point, spec))
      .map(rect => ({ x: rect.x - clearX, y: rect.y - clearY, width: rect.width + 2 * clearX, height: rect.height + 2 * clearY }))

  const labelEntries = (): [string, Point][] =>
    [...positions].filter(([id]) => id.startsWith(GROUP_PREFIX)).sort(([a, p], [b, q]) => p.y - q.y || p.x - q.x || a.localeCompare(b))

  const occupied = (): Rect[] => [...blockRects(), ...labelEntries().map(([id, point]) => rectOf(id, point, spec))]

  const bottomOf = (rects: Rect[]) => Math.max(0, ...rects.map(rect => rect.y + rect.height))

  const bandUnder = (labelY: number, labels: [string, Point][]): Band => {
    const next = labels.find(([, point]) => point.y > labelY)

    return { top: labelY + spec.labelHeight, bottom: next ? next[1].y - spec.rowGap : Infinity }
  }

  /** The band of `key`'s group holding `anchorY` (its lowest label at or above it), else its first. */
  const bandOf = (key: string, anchorY?: number): Band | undefined => {
    const labels = labelEntries()
    const own = labels.filter(([id]) => labelGroup(id) === key)

    if (own.length === 0) {
      // No label for this group: the band the anchor sits in, between whatever labels surround it.
      if (anchorY === undefined) {
        return undefined
      }

      const above = labels.filter(([, point]) => point.y <= anchorY).pop()

      return above ? bandUnder(above[1].y, labels) : { top: -Infinity, bottom: labels[0] ? labels[0][1].y - spec.rowGap : Infinity }
    }

    const pick = anchorY === undefined ? own[0] : (own.filter(([, point]) => point.y <= anchorY).pop() ?? own[0])

    return bandUnder(pick[1].y, labels)
  }

  /**
   * The first origin (columns from `x0` rightwards, rows in `rowsFor(column)` order) where every
   * block of `shape` (offsets from the origin; the shape's height is `height`) is inside `band`
   * and clear of every other block and label.
   */
  const findSpot = (shape: readonly Point[], height: number, band: Band, x0: number, rowsFor: (top: number, bottom: number) => number[]): Point | undefined => {
    const all = occupied()
    const lowest = band.bottom === Infinity ? Math.max(band.top, bottomOf(all)) + step + height : band.bottom
    const top = band.top === -Infinity ? Math.min(0, ...all.map(rect => rect.y)) : band.top
    const maxTop = lowest - height

    if (maxTop < top) {
      return undefined
    }

    // Only what reaches into the band's height can collide.
    const near = all.filter(rect => rect.y < lowest && rect.y + rect.height > top)
    const right = Math.max(x0, ...near.map(rect => rect.x + rect.width))
    const rows = rowsFor(top, maxTop)

    // Once x passes `right`, nothing in the band is to the right of it: the loop always ends there.
    for (let x = x0; x <= right + column; x += column) {
      for (const y of rows) {
        const free = shape.every(point => {
          const rect = rectOf('', { x: x + point.x, y: y + point.y }, spec)

          return !near.some(other => overlaps(other, rect))
        })

        if (free) {
          return { x, y }
        }
      }
    }

    return undefined
  }

  /** Rows of one column, nearest to `start` first: down from it, then up. */
  const rowsNear = (start: number) => (top: number, maxTop: number): number[] => {
    const first = Math.min(maxTop, Math.max(top, start))
    const rows: number[] = []

    for (let y = first; y <= maxTop; y += step) {
      rows.push(y)
    }

    for (let y = first - step; y >= top; y -= step) {
      rows.push(y)
    }

    rows.push(top, maxTop)

    return [...new Set(rows)]
  }

  /** Rows top to bottom, on the band's grid. */
  const rowsDown = (top: number, maxTop: number): number[] => {
    const rows: number[] = []

    for (let y = top; y <= maxTop; y += step) {
      rows.push(y)
    }

    rows.push(maxTop)

    return [...new Set(rows)]
  }

  /** A family too tall for its band: under everything, under a continuation label. */
  const continueGroup = (key: string, local: ReadonlyMap<string, Point>) => {
    let n = 1

    while (positions.has(`${key}${CONTINUATION}${n}`)) {
      n += 1
    }

    const labelId = `${key}${CONTINUATION}${n}`
    const top = bottomOf(occupied()) + spec.groupGap

    positions.set(labelId, { x: 0, y: top })

    for (const [id, point] of local) {
      positions.set(id, { x: point.x, y: point.y + top + spec.labelHeight })
    }
  }

  const newFamilies: Family[] = []

  for (const family of families) {
    if (!family.nodeIds.some(id => positions.has(id))) {
      newFamilies.push(family)
      continue
    }

    const key = groupKey(family.projectId)

    // Family members come in creation order: parents before children, predecessors first.
    for (const id of family.nodeIds) {
      if (positions.has(id)) {
        continue
      }

      const parent = model.parentOf.get(id)
      const predecessor = model.continuedFrom.get(id)
      const child = (model.childrenOf.get(id) ?? []).find(kid => positions.has(kid))
      let anchor: Point | undefined
      let start: Point

      if (parent && positions.has(parent)) {
        const p = positions.get(parent)!
        const siblings = (model.childrenOf.get(parent) ?? []).filter(kid => kid !== id && positions.has(kid))
        const below = siblings.length > 0 ? Math.max(...siblings.map(kid => positions.get(kid)!.y)) + step : p.y

        anchor = p
        start = { x: p.x + column, y: below }
      } else if (predecessor && positions.has(predecessor)) {
        const p = positions.get(predecessor)!

        anchor = p
        start = { x: p.x, y: p.y + step + spec.treeGap }
      } else if (child) {
        const c = positions.get(child)!

        anchor = c
        start = { x: c.x - column, y: c.y }
      } else {
        // Its relatives are not placed (or not shown): anywhere free in the family's band.
        anchor = family.nodeIds.map(other => positions.get(other)).find((point): point is Point => Boolean(point))
        start = { x: 0, y: anchor?.y ?? 0 }
      }

      const band = bandOf(key, anchor?.y)
      const spot = band ? findSpot([{ x: 0, y: 0 }], spec.nodeHeight, band, start.x, rowsNear(start.y)) : undefined

      if (spot) {
        positions.set(id, spot)
      } else {
        continueGroup(key, new Map([[id, { x: 0, y: 0 }]]))
      }
    }
  }

  // New families of groups that already have a label: inside that group's band.
  const unlabelled: Family[] = []

  for (const family of newFamilies) {
    const key = groupKey(family.projectId)
    const band = bandOf(key)

    if (!band) {
      unlabelled.push(family)
      continue
    }

    const local =
      family.nodeIds.length > 1 ? layoutFamily(model, family, spec) : { positions: new Map([[family.nodeIds[0], { x: 0, y: 0 }]]), height: spec.nodeHeight }
    const ids = [...local.positions.keys()]
    const spot = findSpot(
      ids.map(id => local.positions.get(id)!),
      local.height,
      band,
      0,
      rowsDown
    )

    if (spot) {
      for (const id of ids) {
        const point = local.positions.get(id)!

        positions.set(id, { x: point.x + spot.x, y: point.y + spot.y })
      }
    } else {
      continueGroup(key, local.positions)
    }
  }

  // Families of projects with no group on the canvas yet: a labelled block under everything.
  if (unlabelled.length > 0) {
    const top = bottomOf(occupied()) + spec.groupGap
    const block = layoutFamilies(model, unlabelled, spec, top)

    for (const [id, point] of block.positions) {
      positions.set(id, point)
    }
  }

  // A group whose families were all placed before it had a label (its project only became
  // known later): label it above its topmost block when that spot is free.
  for (const family of families) {
    const key = groupKey(family.projectId)

    if (positions.has(key)) {
      continue
    }

    const members = families
      .filter(other => groupKey(other.projectId) === key)
      .flatMap(other => other.nodeIds)
      .map(id => positions.get(id))
      .filter((point): point is Point => Boolean(point))
    const topmost = members.reduce<Point | undefined>((best, point) => (!best || point.y < best.y || (point.y === best.y && point.x < best.x) ? point : best), undefined)

    if (topmost) {
      const spot = { x: topmost.x, y: topmost.y - spec.labelHeight }
      const label = rectOf(key, spot, spec)

      if (![...positions].filter(([id]) => shown.has(id) || id.startsWith(GROUP_PREFIX)).some(([id, point]) => overlaps(rectOf(id, point, spec), label))) {
        positions.set(key, spot)
      }
    }
  }

  // Labels of groups that still have blocks on the canvas.
  const present = new Set(families.map(family => groupKey(family.projectId)))
  const labels = [...positions.keys()]
    .filter(id => id.startsWith(GROUP_PREFIX) && present.has(labelGroup(id)))
    .map(id => {
      const projectId = labelGroup(id).slice(GROUP_PREFIX.length)

      return { id, projectId: projectId === NO_PROJECT_ID ? undefined : projectId }
    })

  return { positions, labels }
}
