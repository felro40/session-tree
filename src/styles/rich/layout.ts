/**
 * Rich cards layout (R12): auto-arranged on first view, new sessions placed without moving any
 * placed card, dragging never re-parents.
 *
 * - A family is a top-down tree: the shared tidy layout (`layoutFamily`) run transposed — depth
 *   down the canvas, siblings across it, a parent centred over its children, a "continued as"
 *   successor tree to the right of its predecessor's.
 * - Cards are big (280 × 164), so the families are packed in two dimensions rather than in one
 *   long row: project groups (`projects.tree` order, no project last, the same in every scope),
 *   each a label over its families wrapped into rows, are shelved left to right and wrapped at a
 *   width that keeps the whole canvas near a 16:10 frame (the mockup's arrangement).
 * - `previous` (stored positions) is kept exactly (the same objects). A new card goes under its
 *   parent (right of its last sibling), right of its predecessor or above its child, at the nearest
 *   free spot inside its group (never in another group's shelf segment, else under a continuation
 *   label: card 7, review r1 N1); a new family at the first free spot of its group's area.
 */
import type { Family, GraphModel } from '../../model/graph.ts'
import { GROUP_PREFIX, LABEL_WIDTH, groupKey, groupOrder, labelGroup, laidOutFamilies, layoutFamily } from '../../model/layout.ts'
import type { GroupLabel, LayoutResult, LayoutSpec, Point, Rect } from '../../model/layout.ts'
import { NO_PROJECT_ID } from '../../model/projects.ts'
import { LABEL_BAND } from './spec.ts'

/** Canvas width ÷ height the packing aims at. */
export const TARGET_ASPECT = 1.6
/** Columns a new family's spot is looked for in, right of its group's label (a merge). */
export const MERGE_COLUMNS = 12

/** The transposed spec the shared tidy layout runs with (depth ↔ siblings, width ↔ height). */
export function transposedSpec(spec: LayoutSpec): LayoutSpec {
  return { ...spec, nodeWidth: spec.nodeHeight, nodeHeight: spec.nodeWidth, columnGap: spec.rowGap, rowGap: spec.columnGap, labelHeight: 0 }
}

interface Local {
  family: Family
  positions: Map<string, Point>
  width: number
  height: number
}

/** A family's cards with its top-left at 0,0 (top-down), and its size. */
function familyLocal(model: GraphModel, family: Family, spec: LayoutSpec): Local {
  if (family.nodeIds.length === 1) {
    return { family, positions: new Map([[family.nodeIds[0], { x: 0, y: 0 }]]), width: spec.nodeWidth, height: spec.nodeHeight }
  }

  const local = layoutFamily(model, family, transposedSpec(spec))
  const positions = new Map<string, Point>()
  let width = 0
  let height = 0

  for (const [id, point] of local.positions) {
    const canvas = { x: point.y, y: point.x }

    positions.set(id, canvas)
    width = Math.max(width, canvas.x + spec.nodeWidth)
    height = Math.max(height, canvas.y + spec.nodeHeight)
  }

  return { family, positions, width, height }
}

const groupOf = (family: Family) => family.projectId ?? NO_PROJECT_ID
const labelOf = (projectId: string): GroupLabel => ({ id: groupKey(projectId === NO_PROJECT_ID ? undefined : projectId), projectId: projectId === NO_PROJECT_ID ? undefined : projectId })
/** A continuation label's separator: `group:<project>\u001f<n>` (`labelGroup` in model/layout.ts). */
const CONTINUATION = '\u001f'

/** A fresh layout of everything the spec shows: the families flow left to right in rows, project
 *  by project, each project's first family under its label (and a continuation label when the
 *  project wraps onto the next row), wrapped at a width that keeps the canvas near 16:10. */
export function freshRichLayout(model: GraphModel, spec: LayoutSpec): LayoutResult {
  const families = laidOutFamilies(model, spec)
  const locals = families.map(family => familyLocal(model, family, spec))
  const gapX = spec.columnGap
  const gapY = spec.familyGap
  const area = locals.reduce((sum, local) => sum + (local.width + gapX) * (local.height + gapY + LABEL_BAND), 0)
  const target = Math.max(LABEL_WIDTH, ...locals.map(local => local.width), Math.sqrt(area * TARGET_ASPECT))
  const positions = new Map<string, Point>()
  const labels: GroupLabel[] = []
  const continued = new Map<string, number>()
  let x = 0
  let y = 0
  let rowHeight = 0
  let rowGroup: string | undefined

  for (const projectId of groupOrder(model, families).map(id => id ?? NO_PROJECT_ID)) {
    // Trees first, then singles (Show all), each in the model's order (most recently used first).
    const members = locals.filter(local => groupOf(local.family) === projectId)
    const ordered = [...members.filter(local => local.family.nodeIds.length > 1), ...members.filter(local => local.family.nodeIds.length === 1)]

    for (const local of ordered) {
      // A new project in the same row keeps the group gap from the one before.
      const lead = x > 0 && rowGroup !== projectId ? spec.groupGap - gapX : 0

      if (x > 0 && x + lead + local.width > target) {
        y += rowHeight + gapY
        x = 0
        rowHeight = 0
        rowGroup = undefined
      } else {
        x += lead
      }

      if (rowGroup !== projectId) {
        const label = labelOf(projectId)
        const count = continued.get(label.id)
        const id = count === undefined ? label.id : `${label.id}${CONTINUATION}${count}`

        continued.set(label.id, (count ?? 0) + 1)
        labels.push({ id, projectId: label.projectId })
        positions.set(id, { x, y })
        rowGroup = projectId
      }

      for (const [id, point] of local.positions) {
        positions.set(id, { x: x + point.x, y: y + LABEL_BAND + point.y })
      }

      x += local.width + gapX
      rowHeight = Math.max(rowHeight, LABEL_BAND + local.height)
    }
  }

  return { positions, labels }
}

/** Rectangles in buckets, for overlap queries in near-constant time (the 500-session fixture). */
class RectIndex {
  private readonly buckets = new Map<string, Rect[]>()
  private static readonly SIZE = 400

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

  hits(rect: Rect): boolean {
    for (const key of this.keys(rect)) {
      for (const other of this.buckets.get(key) ?? []) {
        if (rect.x < other.x + other.width && other.x < rect.x + rect.width && rect.y < other.y + other.height && other.y < rect.y + rect.height) {
          return true
        }
      }
    }

    return false
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

/** Positions for `model` that keep every position of `previous` (the same objects). */
export function mergeRichLayout(previous: ReadonlyMap<string, Point>, model: GraphModel, spec: LayoutSpec): LayoutResult {
  const positions = new Map(previous)
  const families = laidOutFamilies(model, spec)
  const stepX = spec.nodeWidth + spec.columnGap
  const stepY = spec.nodeHeight + spec.rowGap
  const clearX = spec.columnGap / 2
  const clearY = spec.familyGap / 2
  const index = new RectIndex()
  const cardRect = (point: Point): Rect => ({ x: point.x - clearX, y: point.y - clearY, width: spec.nodeWidth + 2 * clearX, height: spec.nodeHeight + 2 * clearY })
  const labelRect = (point: Point): Rect => ({ x: point.x, y: point.y, width: LABEL_WIDTH, height: spec.labelHeight })
  const fits = (point: Point) => !index.hits({ x: point.x, y: point.y, width: spec.nodeWidth, height: spec.nodeHeight })
  const place = (id: string, point: Point) => {
    positions.set(id, point)
    index.add(cardRect(point))
  }
  let bottom = 0

  // Every remembered card is an obstacle, also one not shown now (it comes back to its spot).
  for (const [id, point] of positions) {
    index.add(id.startsWith(GROUP_PREFIX) ? labelRect(point) : cardRect(point))
    bottom = Math.max(bottom, point.y + (id.startsWith(GROUP_PREFIX) ? spec.labelHeight : spec.nodeHeight))
  }

  /**
   * Card 7 (card-6 review r1 N1): the search stays inside its group. The shelves partition the
   * canvas into group segments: a label's segment runs from it to the next label on its shelf
   * row (or on to the right) and down to the next shelf row (or on down); a continuation label
   * starts another segment of its group. A new card's centre may not lie in another group's
   * segment (left of or above every label is nobody's). Nothing placed moves.
   */
  const shelfLabels = [...positions].filter(([id]) => id.startsWith(GROUP_PREFIX)).map(([id, point]) => ({ key: labelGroup(id), x: point.x, y: point.y }))
  const sameRow = (a: { y: number }, b: { y: number }) => Math.abs(a.y - b.y) < 1
  // The first segment of a shelf row also owns the room left of it.
  const segments = shelfLabels.map(label => ({
    key: label.key,
    x: shelfLabels.some(other => sameRow(other, label) && other.x < label.x) ? label.x : -Infinity,
    y: label.y,
    right: Math.min(Infinity, ...shelfLabels.filter(other => sameRow(other, label) && other.x > label.x).map(other => other.x)),
    bottom: Math.min(Infinity, ...shelfLabels.filter(other => other.y > label.y + 1).map(other => other.y))
  }))

  const inOtherGroup = (point: Point, key: string) => {
    const cx = point.x + spec.nodeWidth / 2
    const cy = point.y + spec.nodeHeight / 2

    return segments.some(segment => segment.key !== key && cx >= segment.x && cx < segment.right && cy >= segment.y && cy < segment.bottom)
  }

  /** A continuation label for `key` under everything; returns the spot under it. */
  const continueGroup = (key: string): Point => {
    let n = 1

    while (positions.has(`${key}${CONTINUATION}${n}`)) {
      n += 1
    }

    const label = { x: 0, y: bottom + spec.groupGap }

    positions.set(`${key}${CONTINUATION}${n}`, label)
    index.add(labelRect(label))

    // The segments above end where this one starts.
    for (const segment of segments) {
      if (segment.y < label.y && segment.bottom > label.y) {
        segment.bottom = label.y
      }
    }

    segments.push({ key, x: -Infinity, y: label.y, right: Infinity, bottom: Infinity })
    bottom = label.y + spec.labelHeight

    return { x: 0, y: label.y + LABEL_BAND }
  }

  const inOwnSegment = (point: Point, key: string) => {
    const cx = point.x + spec.nodeWidth / 2
    const cy = point.y + spec.nodeHeight / 2

    return segments.some(segment => segment.key === key && cx >= segment.x && cx < segment.right && cy >= segment.y && cy < segment.bottom)
  }

  /**
   * Card 7 fix r1 (review r1 finding 4): the whole of the group's own segments, on the grid
   * around `base`, nearest to `anchor` (the parent) first; ties: the nearer row, then right of
   * left. Only reached when the base row and the rows below have no room in the group — a parent
   * on its group's last shelf row has its base row in the next segment already, and its child
   * used to go under a continuation label far away despite free room on the parent's own row.
   */
  const nearestInSegment = (base: Point, anchor: Point, key: string): Point | null => {
    const candidates: { point: Point; dist: number; dy: number; dx: number }[] = []

    for (let dy = -40; dy < 40; dy += 1) {
      for (let k = -16; k <= 16; k += 1) {
        const point = { x: base.x + k * stepX, y: base.y + dy * stepY }

        if (point.y >= 0 && inOwnSegment(point, key)) {
          candidates.push({ point, dist: Math.hypot(point.x - anchor.x, point.y - anchor.y), dy: Math.abs(point.y - anchor.y), dx: point.x - anchor.x })
        }
      }
    }

    candidates.sort((a, b) => a.dist - b.dist || a.dy - b.dy || (a.dx >= 0 ? 0 : 1) - (b.dx >= 0 ? 0 : 1) || a.dx - b.dx)

    return candidates.find(candidate => fits(candidate.point) && !inOtherGroup(candidate.point, key))?.point ?? null
  }

  /** The nearest free spot on `base`'s row (right first, then left), then the rows below, inside
   *  its group (never in another group's segment); then anywhere in its group's own segments,
   *  nearest to `anchor`; else under everything, below a continuation label of its group. */
  const nearest = (base: Point, key: string, anchor: Point = base): Point => {
    for (let dy = 0; dy < 40; dy += 1) {
      for (let k = 0; k <= 16; k += 1) {
        for (const sign of [1, -1]) {
          if (k === 0 && sign === -1) {
            continue
          }

          const point = { x: base.x + sign * k * stepX, y: base.y + dy * stepY }

          if (fits(point) && !inOtherGroup(point, key)) {
            return point
          }
        }
      }
    }

    return nearestInSegment(base, anchor, key) ?? continueGroup(key)
  }

  const newFamilies: Family[] = []

  for (const family of families) {
    if (!family.nodeIds.some(id => positions.has(id))) {
      newFamilies.push(family)
      continue
    }

    // Members come in creation order: parents before children, predecessors first.
    for (const id of family.nodeIds) {
      if (positions.has(id)) {
        continue
      }

      const parent = model.parentOf.get(id)
      const predecessor = model.continuedFrom.get(id)
      const child = (model.childrenOf.get(id) ?? []).find(kid => positions.has(kid))
      let base: Point
      // The block the new card hangs off (its parent, predecessor or child): pass 2 of nearest().
      let anchor: Point | undefined

      if (parent && positions.has(parent)) {
        const p = positions.get(parent)!
        const siblings = (model.childrenOf.get(parent) ?? []).filter(kid => kid !== id && positions.has(kid)).map(kid => positions.get(kid)!)
        const row = siblings.filter(sibling => Math.abs(sibling.y - (p.y + stepY)) < stepY / 2)

        anchor = p
        base = row.length > 0 ? { x: Math.max(...row.map(sibling => sibling.x)) + stepX, y: p.y + stepY } : { x: p.x, y: p.y + stepY }
      } else if (predecessor && positions.has(predecessor)) {
        const p = positions.get(predecessor)!

        anchor = p
        base = { x: p.x + stepX + spec.treeGap, y: p.y }
      } else if (child) {
        const c = positions.get(child)!

        anchor = c
        base = { x: c.x, y: c.y - stepY }
      } else {
        base = family.nodeIds.map(other => positions.get(other)).find((point): point is Point => Boolean(point)) ?? { x: 0, y: LABEL_BAND }
      }

      const spot = nearest(base, groupKey(family.projectId), anchor ?? base)

      place(id, spot)
      bottom = Math.max(bottom, spot.y + spec.nodeHeight)
    }
  }

  // New families (and singles with Show all): the first free spot of their group's area — right of
  // and below its label — else under everything, with a label when the group has none yet.
  const labelsAt = new Map([...positions].filter(([id]) => id.startsWith(GROUP_PREFIX)).map(([id, point]) => [id, point]))
  const cursors = new Map<string, number>()

  for (const family of newFamilies) {
    const local = familyLocal(model, family, spec)
    const key = groupKey(family.projectId)
    let label = labelsAt.get(key)

    if (!label) {
      label = { x: 0, y: bottom + spec.groupGap }
      positions.set(key, label)
      labelsAt.set(key, label)
      index.add(labelRect(label))
      bottom = label.y + spec.labelHeight
    }

    const origin = { x: label.x, y: label.y + LABEL_BAND }
    const free = (at: Point) => [...local.positions.values()].every(point => fits({ x: at.x + point.x, y: at.y + point.y }))
    let spot: Point | undefined

    // Row by row from where the group's last new family went; columns left to right.
    for (let row = cursors.get(key) ?? 0; row < 400 && !spot; row += 1) {
      for (let col = 0; col < MERGE_COLUMNS; col += 1) {
        const at = { x: origin.x + col * stepX, y: origin.y + row * stepY }

        if (free(at)) {
          spot = at
          cursors.set(key, row)
          break
        }
      }
    }

    spot ??= { x: 0, y: bottom + spec.groupGap }

    for (const [id, point] of local.positions) {
      const at = { x: spot.x + point.x, y: spot.y + point.y }

      place(id, at)
      bottom = Math.max(bottom, at.y + spec.nodeHeight)
    }
  }

  // Labels (continuations too) of groups that still have cards on the canvas.
  const present = new Set(families.map(family => groupKey(family.projectId)))
  const labels = [...positions.keys()]
    .filter(id => id.startsWith(GROUP_PREFIX) && present.has(labelGroup(id)))
    .map(id => ({ id, projectId: labelOf(labelGroup(id).slice(GROUP_PREFIX.length)).projectId }))

  return { positions, labels }
}

export function layoutRich(model: GraphModel, previous: ReadonlyMap<string, Point> | undefined, spec: LayoutSpec): LayoutResult {
  return previous && previous.size > 0 ? mergeRichLayout(previous, model, spec) : freshRichLayout(model, spec)
}
