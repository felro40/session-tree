/**
 * The Project swimlanes layout (card 5): a pure function of the data. It never reads stored
 * positions and nothing it returns is ever saved (R12: no dragging, no saved positions); "now"
 * and the time-zone offset are inputs, so the same inputs always give the same output.
 *
 * - **Lanes.** One horizontal lane per project, in `projects.tree` order; sessions with no
 *   project go in a last lane named like the core's bucket (`Home`). A project with no session
 *   under the current filters gets no lane (unless it is the scope).
 * - **Time axis.** Local days (the browser's zone, passed as a fixed offset). A piecewise linear
 *   scale: day column `d` of the window spans `[d·DAY_WIDTH, (d+1)·DAY_WIDTH)` and a block's x is
 *   its column's left plus the fraction of that day elapsed at its start. The window is today and
 *   the 8 days before it (`WINDOW_DAYS`).
 *   - A start before the window goes into the "earlier" zone left of the first column, ordered by
 *     start (x by rank inside the zone, never on a day tick).
 *   - A start in the future (clock skew) is clamped to now: never right of the now marker.
 *   - A missing or invalid `started_at` falls back to `last_active`, else the earlier zone (before
 *     every dated session there).
 * - **Trees** grow left to right: a child starts at least `CHILD_GAP` right of its parent's right
 *   edge (branch parent, or the predecessor of a "continued as" link), across lanes too. That
 *   right-of-parent clamp is the only exception to "x follows the start time" within a row; the
 *   clamped nodes are returned.
 * - **Rows.** Greedy interval packing per lane, in a fixed order (families by their root's start,
 *   then id; inside a family parents before children, by start then id). A block takes its
 *   parent's row when it fits there, else the first row it fits in; a "continued as" successor
 *   goes in a row under its predecessor (the link drops, then runs right). No two blocks overlap.
 *   x is in whole pixels (floored: monotonic in time, never right of the exact time).
 * - **Stand-ins** (R7) sit in their child's lane just left of the child.
 * - **Scope** (R5): the other lanes collapse to thin headers with an activity bar; a scoped
 *   block's parent from another project is shown as a ghost at the scoped lane's left edge.
 * - **Singles** (R8) stay in each lane's "no branches N" chip unless Show all puts them on the axis.
 */
import type { Viewport } from '../../model/device-prefs.ts'
import { ALL_PROJECTS } from '../../model/graph.ts'
import type { EdgeKind, GraphModel, GraphNode } from '../../model/graph.ts'
import type { LayoutResult, Point } from '../../model/layout.ts'
import { NO_PROJECT_ID } from '../../model/projects.ts'
import type { ProjectInfo } from '../../model/projects.ts'
import type { Port } from '../../model/route.ts'
import type { FrameLayout } from '../types.ts'
import {
  AXIS_HEIGHT,
  CHILD_GAP,
  CHIP_GAP,
  CHIP_HEIGHT,
  CHIP_WIDTH,
  DAY_WIDTH,
  EARLIER_GAP,
  EARLIER_WIDTH,
  FIT_MAX_ZOOM,
  GHOST_GAP,
  HEADER_WIDTH,
  LANE_COLLAPSED_HEIGHT,
  LANE_MIN_HEIGHT,
  LANE_PADDING,
  PACK_GAP,
  ROW_HEIGHT,
  STANDIN_GAP,
  SWIM_RESET_X,
  SWIM_HEIGHT,
  SWIM_WIDTH,
  swimPorts,
  WINDOW_DAYS
} from './spec.ts'

export interface SwimInput {
  model: GraphModel
  /** R8 "Show all": singles leave the chips and go on the time axis. */
  showAll: boolean
  /** Lanes this device collapsed (lane keys); a project scope collapses the others on top. */
  collapsed: ReadonlySet<string>
  nowMs: number
  /** Minutes to add to UTC for local time (`-Date#getTimezoneOffset()`), fixed for the window. */
  tzOffsetMinutes: number
}

export type SwimZone = 'earlier' | 'ghost' | 'standin' | 'window'

export interface SwimBox {
  id: string
  x: number
  /** Top edge; for a block in a collapsed lane, the lane's middle (activity bar). */
  y: number
  width: number
  height: number
  lane: string
  /** Row inside the lane; -1 in a collapsed lane. */
  row: number
  zone: SwimZone
  /** The start time the x follows (seconds), after the fallbacks and the future clamp. */
  time: null | number
  /** Pushed right of its parent (x then reads "after", not an exact time). */
  clamped: boolean
}

export interface SwimLane {
  /** The project id, or `NO_PROJECT_ID` for the no-project lane. */
  key: string
  project?: ProjectInfo
  label: string
  top: number
  height: number
  /** Collapsed: by this device's choice or by the scope. */
  collapsed: boolean
  /** Collapsed because another project is the scope (derived, never stored). */
  scopeCollapsed: boolean
  rows: number
  /** What the lane holds under the current filters (singles included). */
  sessions: number
  tokens: number
  inTrees: number
  singles: number
  /** The chip's sessions (most recent first); empty with Show all. */
  singleIds: string[]
  chip?: { x: number; y: number; width: number; height: number }
  /** A collapsed lane's activity bar: one mark per block it holds. */
  activity: { id: string; x: number; width: number; standin: boolean }[]
}

export interface SwimTick {
  x: number
  /** Local day number (days since 1970-01-01, local). */
  day: number
  label: string
  /** The first column or the first of a month: shows the month. */
  bold: boolean
}

export interface SwimLink {
  id: string
  source: string
  target: string
  kind: EdgeKind
  from: Port
  to: Port
}

export interface SwimLayout extends LayoutResult {
  /** Every block with an x (those in collapsed lanes too, as activity marks). */
  boxes: Map<string, SwimBox>
  /** Blocks drawn on the canvas. */
  shown: Set<string>
  /** Scope ghosts (parents from another project, dimmed and read-only). */
  ghosts: Set<string>
  clamped: Set<string>
  /** Sessions whose start was in the future (clamped to now). */
  future: Set<string>
  lanes: SwimLane[]
  ticks: SwimTick[]
  earlier: { x: number; width: number }
  window: { left: number; right: number; firstDay: number; today: number }
  nowX: number
  /** `Nov 2026`, for the corner. */
  monthLabel: string
  links: SwimLink[]
  /** What Fit frames: the shown blocks, the chips and the now marker, over every lane. */
  bounds: { minX: number; maxX: number; height: number }
}

const DAY_S = 86_400
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const validTime = (value: unknown): null | number => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null)

/** Local day number of `seconds` at the fixed offset. */
export const localDay = (seconds: number, offsetSeconds: number): number => Math.floor((seconds + offsetSeconds) / DAY_S)

/** The start a block's x follows: `started_at`, else `last_active`, else none; never after now. */
export function effectiveStart(node: GraphNode, nowSeconds: number): { time: null | number; future: boolean } {
  const raw = validTime(node.row?.started_at) ?? validTime(node.row?.last_active)

  if (raw === null) {
    return { time: null, future: false }
  }

  return raw > nowSeconds ? { time: nowSeconds, future: true } : { time: raw, future: false }
}

/** The lane a node belongs to. */
export function laneKeyOf(node: GraphNode, projectById: ReadonlyMap<string, ProjectInfo>): string {
  if (!node.projectId) {
    return NO_PROJECT_ID
  }

  const project = projectById.get(node.projectId)

  return project?.isNoProject ? NO_PROJECT_ID : node.projectId
}

const tokensOf = (node: GraphNode) => Math.max(0, Number(node.row?.input_tokens) || 0) + Math.max(0, Number(node.row?.output_tokens) || 0)

/** The session's tokens as the block and the lane header count them (in + out). */
export const blockTokens = tokensOf

function dayLabel(day: number, bold: boolean): string {
  const date = new Date(day * DAY_S * 1000)

  return bold ? `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}` : `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()}`
}

export function layoutSwimlanes(input: SwimInput): SwimLayout {
  const { model, showAll, collapsed } = input
  const nowS = input.nowMs / 1000
  const offset = input.tzOffsetMinutes * 60
  const today = localDay(nowS, offset)
  const firstDay = today - (WINDOW_DAYS - 1)
  const scope = model.options.scope
  const scoped = scope !== ALL_PROJECTS
  const projectById = new Map(model.projects.map(project => [project.id, project]))
  const laneOf = (node: GraphNode) => laneKeyOf(node, projectById)
  const node = (id: string) => model.nodeById.get(id)!

  // --- what goes on the axis -------------------------------------------------------------------
  const onAxis = new Set(model.families.filter(family => showAll || family.nodeIds.length > 1).flatMap(family => family.nodeIds))
  const time = new Map<string, null | number>()
  const future = new Set<string>()

  for (const each of model.nodes) {
    if (each.kind === 'session') {
      const start = effectiveStart(each, nowS)

      time.set(each.id, start.time)

      if (start.future) {
        future.add(each.id)
      }
    }
  }

  const sortKey = (id: string) => time.get(id) ?? -Infinity
  const byTime = (a: string, b: string) => sortKey(a) - sortKey(b) || (a < b ? -1 : a > b ? 1 : 0)

  // --- x from the start time -------------------------------------------------------------------
  const timeX = new Map<string, number>()
  const zone = new Map<string, SwimZone>()
  const earlierIds: string[] = []

  for (const id of onAxis) {
    if (node(id).kind !== 'session') {
      continue
    }

    const t = time.get(id) ?? null

    if (t === null || localDay(t, offset) < firstDay) {
      earlierIds.push(id)
      continue
    }

    const day = localDay(t, offset)
    const fraction = (t + offset - day * DAY_S) / DAY_S

    // Whole pixels (floor: monotonic, never right of the exact time): the router works on
    // integer coordinates, and a block never sits right of the now marker.
    timeX.set(id, Math.floor((day - firstDay) * DAY_WIDTH + fraction * DAY_WIDTH))
    zone.set(id, 'window')
  }

  earlierIds.sort(byTime)
  const spread = EARLIER_WIDTH - SWIM_WIDTH - EARLIER_GAP

  earlierIds.forEach((id, rank) => {
    timeX.set(id, Math.floor(-EARLIER_WIDTH + (earlierIds.length > 1 ? (rank / (earlierIds.length - 1)) * spread : 0)))
    zone.set(id, 'earlier')
  })

  // --- the right-of-parent clamp (parents first, across lanes) ---------------------------------
  const parentOf = (id: string) => model.parentOf.get(id) ?? model.continuedFrom.get(id)
  const x = new Map<string, number>()
  const clamped = new Set<string>()

  const resolve = (id: string, guard: Set<string>): number => {
    const known = x.get(id)

    if (known !== undefined) {
      return known
    }

    let value = timeX.get(id) ?? 0
    const parent = parentOf(id)

    guard.add(id)

    if (parent && onAxis.has(parent) && node(parent).kind === 'session' && !guard.has(parent)) {
      const least = resolve(parent, guard) + SWIM_WIDTH + CHILD_GAP

      if (value < least) {
        value = least
        clamped.add(id)
      }
    }

    x.set(id, value)

    return value
  }

  for (const id of [...onAxis].filter(id => node(id).kind === 'session').sort(byTime)) {
    resolve(id, new Set())
  }

  // Stand-ins: just left of their leftmost child.
  for (const id of onAxis) {
    if (node(id).kind === 'standin') {
      const kids = (model.childrenOf.get(id) ?? []).map(kid => x.get(kid)).filter((value): value is number => value !== undefined)

      x.set(id, (kids.length > 0 ? Math.min(...kids) : 0) - SWIM_WIDTH - STANDIN_GAP)
      zone.set(id, 'standin')
    }
  }

  // --- lanes -----------------------------------------------------------------------------------
  const sessionsByLane = new Map<string, GraphNode[]>()

  for (const each of model.nodes) {
    if (each.kind === 'session') {
      const key = laneOf(each)

      sessionsByLane.set(key, [...(sessionsByLane.get(key) ?? []), each])
    }
  }

  const laneKeys: string[] = []

  for (const project of model.projects) {
    if (!project.isNoProject && (sessionsByLane.has(project.id) || project.id === scope) && !laneKeys.includes(project.id)) {
      laneKeys.push(project.id)
    }
  }

  for (const key of [...sessionsByLane.keys()].sort()) {
    if (key !== NO_PROJECT_ID && !laneKeys.includes(key)) {
      laneKeys.push(key)
    }
  }

  if (sessionsByLane.has(NO_PROJECT_ID) || scope === NO_PROJECT_ID) {
    laneKeys.push(NO_PROJECT_ID)
  }

  const noProject = model.projects.find(project => project.isNoProject)

  // Family order: by the start of its first root, then id.
  const familyStart = new Map<string, number>()

  for (const family of model.families) {
    const roots = family.nodeIds.filter(id => node(id).kind === 'session' && !(parentOf(id) && family.nodeIds.includes(parentOf(id)!)))
    const starts = (roots.length > 0 ? roots : family.nodeIds).map(id => sortKey(id))

    familyStart.set(family.id, starts.length > 0 ? Math.min(...starts) : -Infinity)
  }

  const kidsOf = (id: string) => [...(model.childrenOf.get(id) ?? []), ...(model.continuedAs.get(id) ?? [])].sort(byTime)

  /** A family's nodes, parents before children (pre-order from its roots, by start then id). */
  const familyOrder = (familyId: string): string[] => {
    const family = model.families.find(each => each.id === familyId)!
    const members = new Set(family.nodeIds)
    const roots = family.nodeIds.filter(id => !parentOf(id) || !members.has(parentOf(id)!)).sort(byTime)
    const out: string[] = []
    const seen = new Set<string>()
    const walk = (id: string) => {
      if (seen.has(id) || !members.has(id)) {
        return
      }

      seen.add(id)
      out.push(id)
      kidsOf(id).forEach(walk)
    }

    roots.forEach(walk)
    family.nodeIds.forEach(walk)

    return out
  }

  const boxes = new Map<string, SwimBox>()
  const ghosts = new Set<string>()
  const ghostBoxes = new Map<string, SwimBox>()
  const lanes: SwimLane[] = []
  let top = 0

  const ghostX = -EARLIER_WIDTH - GHOST_GAP - SWIM_WIDTH

  for (const key of laneKeys) {
    const project = key === NO_PROJECT_ID ? noProject : projectById.get(key)
    const scopeCollapsed = scoped && key !== scope
    const isCollapsed = scopeCollapsed || (!scoped && collapsed.has(key))
    const members = [...onAxis].filter(id => laneOf(node(id)) === key)
    const families = [...new Set(members.map(id => node(id).familyId))].sort(
      (a, b) => (familyStart.get(a) ?? 0) - (familyStart.get(b) ?? 0) || (a < b ? -1 : a > b ? 1 : 0)
    )
    const memberSet = new Set(members)
    const order = families.flatMap(familyId => familyOrder(familyId).filter(id => memberSet.has(id)))
    const sessions = sessionsByLane.get(key) ?? []
    const singleNodes = sessions.filter(each => each.single)
    const singleIds = showAll ? [] : model.singles.filter(each => laneOf(each) === key).map(each => each.id)

    // Ghost parents (scope only): the scoped lane's blocks' parents from other projects.
    const laneGhosts = !scoped || key !== scope
      ? []
      : [...new Set(order.map(id => parentOf(id)).filter((id): id is string => Boolean(id && onAxis.has(id) && node(id).kind === 'session' && laneOf(node(id)) !== key)))].sort(byTime)

    const rows: [number, number][][] = []
    const rowOf = new Map<string, number>()

    /**
     * Packs `id` at `at`: its preferred row when it fits there, else the first row from `from`
     * on that fits. `clearFrom` widens the room it needs to the left (a successor keeps the run
     * of its "continued as" link free), only for choosing the row.
     */
    const pack = (id: string, at: number, preferred?: number, from = 0, clearFrom = at): number => {
      const lo = at - PACK_GAP / 2
      const hi = at + SWIM_WIDTH + PACK_GAP / 2
      const fits = (row: number, left = lo) => (rows[row] ?? []).every(([a, b]) => hi <= a || left >= b)
      let row = preferred !== undefined && fits(preferred) ? preferred : -1

      const wide = Math.min(lo, clearFrom - PACK_GAP / 2)

      for (let candidate = from; row < 0; candidate += 1) {
        if (fits(candidate, wide)) {
          row = candidate
        }
      }

      rows[row] = [...(rows[row] ?? []), [lo, hi]]
      rowOf.set(id, row)

      return row
    }

    if (!isCollapsed) {
      for (const id of laneGhosts) {
        pack(id, ghostX)
        ghosts.add(id)
      }

      for (const id of order) {
        const branchParent = model.parentOf.get(id)
        const predecessor = model.continuedFrom.get(id)
        const predecessorRow = predecessor !== undefined ? rowOf.get(predecessor) : undefined

        // A branch child takes its parent's row when it fits; a "continued as" successor goes
        // under its predecessor (the link drops, then runs right: mockup).
        if (predecessorRow !== undefined && branchParent === undefined) {
          pack(id, x.get(id)!, undefined, predecessorRow + 1, x.get(predecessor!)! + SWIM_RESET_X)
        } else {
          pack(id, x.get(id)!, branchParent !== undefined ? rowOf.get(branchParent) : undefined)
        }
      }
    }

    const height = isCollapsed ? LANE_COLLAPSED_HEIGHT : Math.max(LANE_MIN_HEIGHT, LANE_PADDING + rows.length * ROW_HEIGHT)
    const lane: SwimLane = {
      key,
      project,
      label: project?.label ?? (key === NO_PROJECT_ID ? 'Home' : key),
      top,
      height,
      collapsed: isCollapsed,
      scopeCollapsed,
      rows: isCollapsed ? 0 : rows.length,
      sessions: sessions.length,
      tokens: sessions.reduce((sum, each) => sum + tokensOf(each), 0),
      inTrees: sessions.length - singleNodes.length,
      singles: singleNodes.length,
      singleIds,
      activity: []
    }

    for (const id of [...laneGhosts, ...order]) {
      const ghost = laneGhosts.includes(id) && !isCollapsed
      const row = rowOf.get(id) ?? -1
      const bx = ghost ? ghostX : x.get(id)!

      const box: SwimBox = {
        id,
        x: bx,
        y: isCollapsed ? top + height / 2 : top + LANE_PADDING + row * ROW_HEIGHT,
        width: SWIM_WIDTH,
        height: SWIM_HEIGHT,
        lane: ghost ? laneOf(node(id)) : key,
        row: isCollapsed ? -1 : row,
        zone: ghost ? 'ghost' : (zone.get(id) ?? 'window'),
        time: time.get(id) ?? null,
        clamped: !ghost && clamped.has(id)
      }

      boxes.set(id, box)

      if (ghost) {
        ghostBoxes.set(id, box)
      }

      if (isCollapsed) {
        lane.activity.push({ id, x: bx, width: SWIM_WIDTH, standin: node(id).kind === 'standin' })
      }
    }

    lanes.push(lane)
    top += height
  }

  // A ghost's own (collapsed) lane may have set it as an activity mark after the scoped lane
  // placed it: the ghost box wins.
  for (const [id, ghost] of ghostBoxes) {
    boxes.set(id, ghost)
  }

  const shown = new Set<string>()

  for (const lane of lanes) {
    if (!lane.collapsed) {
      for (const [id, box] of boxes) {
        if (box.lane === lane.key && box.row >= 0 && box.zone !== 'ghost') {
          shown.add(id)
        }
      }
    }
  }

  for (const id of ghosts) {
    shown.add(id)
  }

  // --- chips, axis, bounds ---------------------------------------------------------------------
  const windowRight = WINDOW_DAYS * DAY_WIDTH
  const rightmost = Math.max(windowRight, ...[...boxes.values()].filter(box => box.zone !== 'ghost').map(box => box.x + box.width))
  const chipX = rightmost + CHIP_GAP

  for (const lane of lanes) {
    if (!lane.collapsed && lane.singleIds.length > 0) {
      lane.chip = { x: chipX, y: lane.top + LANE_PADDING, width: CHIP_WIDTH, height: CHIP_HEIGHT }
    }
  }

  const ticks: SwimTick[] = []

  for (let d = 0; d < WINDOW_DAYS; d += 1) {
    const day = firstDay + d
    const bold = d === 0 || new Date(day * DAY_S * 1000).getUTCDate() === 1

    ticks.push({ x: d * DAY_WIDTH, day, label: dayLabel(day, bold), bold })
  }

  const nowFraction = (nowS + offset - today * DAY_S) / DAY_S
  const nowX = (today - firstDay) * DAY_WIDTH + nowFraction * DAY_WIDTH
  const todayDate = new Date(today * DAY_S * 1000)

  const positions = new Map<string, Point>()

  for (const id of shown) {
    const box = boxes.get(id)!

    positions.set(id, { x: box.x, y: box.y })
  }

  const links: SwimLink[] = model.edges
    .filter(edge => shown.has(edge.source) && shown.has(edge.target))
    .map(edge => {
      const source = boxes.get(edge.source)!
      const target = boxes.get(edge.target)!

      return { id: edge.id, source: edge.source, target: edge.target, kind: edge.kind, ...swimPorts(edge.kind, source, target) }
    })

  const shownBoxes = [...shown].map(id => boxes.get(id)!)
  const chips = lanes.filter(lane => lane.chip).map(lane => lane.chip!.x + lane.chip!.width)
  const minX = shownBoxes.length > 0 ? Math.min(...shownBoxes.map(box => box.x)) : 0
  const maxX = Math.max(nowX, ...shownBoxes.map(box => box.x + box.width), ...chips)

  return {
    positions,
    labels: [],
    boxes,
    shown,
    ghosts,
    clamped,
    future,
    lanes,
    ticks,
    earlier: { x: -EARLIER_WIDTH, width: EARLIER_WIDTH },
    window: { left: 0, right: windowRight, firstDay, today },
    nowX,
    monthLabel: `${MONTHS[todayDate.getUTCMonth()]} ${todayDate.getUTCFullYear()}`,
    links,
    bounds: { minX: minX - 12, maxX: maxX + 12, height: top }
  }
}

/**
 * Fit: every lane's height and the shown content's width into a canvas of `width` × `height`,
 * right of the header column and under the time axis.
 */
export function fitSwimlanes(layout: Pick<SwimLayout, 'bounds'>, width: number, height: number, minZoom: number): Viewport {
  const { minX, maxX, height: contentHeight } = layout.bounds
  const availableWidth = Math.max(60, width - HEADER_WIDTH - 16)
  const availableHeight = Math.max(60, height - AXIS_HEIGHT - 12)
  const zoom = Math.min(FIT_MAX_ZOOM, Math.max(minZoom, Math.min(availableWidth / Math.max(1, maxX - minX), availableHeight / Math.max(1, contentHeight))))

  return { x: HEADER_WIDTH + 8 - minX * zoom, y: AXIS_HEIGHT + 6, zoom }
}

/** The frame's layout as the page holds it (`frame.compute`): a `SwimLayout` with `fit`. */
export type SwimFrameLayout = SwimLayout & FrameLayout
