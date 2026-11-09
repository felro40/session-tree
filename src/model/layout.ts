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
 * Positions for `model` that keep every position in `previous` (R12: new sessions never move
 * blocks already placed, by the user or an earlier layout). A new node of a known family goes
 * next to its parent, predecessor or child, then down to the first free row; whole new
 * families are laid out as a block under everything already placed.
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

  const occupied = (): Rect[] =>
    [...positions]
      .filter(([id]) => shown.has(id) || id.startsWith(GROUP_PREFIX))
      .map(([id, point]) => rectOf(id, point, spec))

  const bottomOf = (rects: Rect[]) => Math.max(0, ...rects.map(rect => rect.y + rect.height))

  const freeRow = (x: number, y: number, rects: Rect[]): Point => {
    let candidate = { x, y }

    while (rects.some(rect => overlaps(rect, rectOf('', candidate, spec)))) {
      candidate = { x, y: candidate.y + step }
    }

    return candidate
  }

  const newFamilies: Family[] = []

  for (const family of families) {
    if (!family.nodeIds.some(id => positions.has(id))) {
      newFamilies.push(family)
      continue
    }

    // Family members come in creation order: parents before children, predecessors first.
    for (const id of family.nodeIds) {
      if (positions.has(id)) {
        continue
      }

      const rects = occupied()
      const parent = model.parentOf.get(id)
      const predecessor = model.continuedFrom.get(id)
      const child = (model.childrenOf.get(id) ?? []).find(kid => positions.has(kid))
      let start: Point

      if (parent && positions.has(parent)) {
        const p = positions.get(parent)!
        const siblings = (model.childrenOf.get(parent) ?? []).filter(kid => kid !== id && positions.has(kid))
        const below = siblings.length > 0 ? Math.max(...siblings.map(kid => positions.get(kid)!.y)) + step : p.y

        start = { x: p.x + column, y: below }
      } else if (predecessor && positions.has(predecessor)) {
        const p = positions.get(predecessor)!

        start = { x: p.x, y: p.y + step + spec.treeGap }
      } else if (child) {
        const c = positions.get(child)!

        start = { x: c.x - column, y: c.y }
      } else {
        start = { x: 0, y: bottomOf(rects) + spec.familyGap }
      }

      positions.set(id, freeRow(start.x, start.y, rects))
    }
  }

  if (newFamilies.length > 0) {
    const top = bottomOf(occupied()) + spec.groupGap
    const labelled = new Set([...positions.keys()].filter(id => id.startsWith(GROUP_PREFIX)))
    const block = layoutFamilies(model, newFamilies, spec, top, labelled)

    for (const [id, point] of block.positions) {
      positions.set(id, point)
    }
  }

  // A group whose families were all placed before it had a label (its project only became
  // known later): label it above its topmost block when that spot is free.
  for (const family of families) {
    const key = groupKey(family.projectId === NO_PROJECT_ID ? undefined : family.projectId)

    if (positions.has(key)) {
      continue
    }

    const members = families
      .filter(other => (other.projectId ?? NO_PROJECT_ID) === (family.projectId ?? NO_PROJECT_ID))
      .flatMap(other => other.nodeIds)
      .map(id => positions.get(id))
      .filter((point): point is Point => Boolean(point))
    const topmost = members.reduce<Point | undefined>((best, point) => (!best || point.y < best.y || (point.y === best.y && point.x < best.x) ? point : best), undefined)

    if (topmost) {
      const spot = { x: topmost.x, y: topmost.y - spec.labelHeight }

      if (!occupied().some(rect => overlaps(rect, rectOf(key, spot, spec)))) {
        positions.set(key, spot)
      }
    }
  }

  // Labels of groups that still have blocks on the canvas.
  const present = new Set(families.map(family => groupKey(family.projectId === NO_PROJECT_ID ? undefined : family.projectId)))
  const labels = [...positions.keys()]
    .filter(id => id.startsWith(GROUP_PREFIX) && present.has(id))
    .map(id => {
      const projectId = id.slice(GROUP_PREFIX.length)

      return { id, projectId: projectId === NO_PROJECT_ID ? undefined : projectId }
    })

  return { positions, labels }
}
