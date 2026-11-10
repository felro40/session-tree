/**
 * Link geometry and the "middle ground" router (R13).
 *
 * - While a block is dragged its links are redrawn live in the style's link shape, with no
 *   obstacle check (`router.live`).
 * - On drop, `routeLinks` checks every link: one whose live shape would cross another block
 *   detours around it (`router.route`); the others keep the live shape. Links that now cross
 *   the dropped block re-route in the same pass.
 * - Routing lives behind one `LinkRouter` per link shape so a stronger router can replace it.
 *   The detour itself is an orthogonal path on a sparse grid around the inflated obstacles
 *   (A* with a bend penalty), drawn with rounded corners whose radius stays under the
 *   clearance, so the drawn path never enters a block.
 */
import type { Point, Rect } from './layout.ts'

export type Dir = 'down' | 'left' | 'right' | 'up'

/** A link end: where it touches the block and the direction it leaves the block in. */
export interface Port extends Point {
  dir: Dir
}

export type Seg =
  | { kind: 'L'; to: Point }
  | { kind: 'Q'; c: Point; to: Point }
  | { kind: 'C'; c1: Point; c2: Point; to: Point }

export interface Path {
  start: Point
  segs: Seg[]
}

export interface Route {
  path: Path
  svg: string
  /** True when the route goes around obstacles. */
  detoured: boolean
  /** A point halfway along the path (for a link label). */
  mid: Point
}

export interface RouteInput {
  from: Port
  to: Port
  /** Blocks the link must not cross (its own two ends excluded). */
  obstacles: readonly Rect[]
  /** The link's own two blocks: a detour must not run through them either. */
  ends?: readonly Rect[]
}

export interface LinkRouter {
  shape: 'curve' | 'octilinear' | 'orthogonal'
  /** The plain shape, used live while dragging and whenever nothing is in the way. */
  live(from: Port, to: Port): Route
  /** The plain shape, or a detour when it would cross one of `obstacles`. */
  route(input: RouteInput): Route
}

const VEC: Record<Dir, Point> = { down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 }, up: { x: 0, y: -1 } }

const round = (n: number) => Math.round(n * 100) / 100
const pt = (p: Point) => `${round(p.x)} ${round(p.y)}`

export function pathToSvg(path: Path): string {
  let d = `M${pt(path.start)}`

  for (const seg of path.segs) {
    d += seg.kind === 'L' ? ` L${pt(seg.to)}` : seg.kind === 'Q' ? ` Q${pt(seg.c)} ${pt(seg.to)}` : ` C${pt(seg.c1)} ${pt(seg.c2)} ${pt(seg.to)}`
  }

  return d
}

/** Points along the path (`perSeg` per segment, both ends included). */
export function samplePath(path: Path, perSeg = 24): Point[] {
  const out: Point[] = [path.start]
  let from = path.start

  for (const seg of path.segs) {
    for (let i = 1; i <= perSeg; i += 1) {
      const t = i / perSeg
      const u = 1 - t

      if (seg.kind === 'L') {
        out.push({ x: from.x + (seg.to.x - from.x) * t, y: from.y + (seg.to.y - from.y) * t })
      } else if (seg.kind === 'Q') {
        out.push({
          x: u * u * from.x + 2 * u * t * seg.c.x + t * t * seg.to.x,
          y: u * u * from.y + 2 * u * t * seg.c.y + t * t * seg.to.y
        })
      } else {
        out.push({
          x: u * u * u * from.x + 3 * u * u * t * seg.c1.x + 3 * u * t * t * seg.c2.x + t * t * t * seg.to.x,
          y: u * u * u * from.y + 3 * u * u * t * seg.c1.y + 3 * u * t * t * seg.c2.y + t * t * t * seg.to.y
        })
      }
    }

    from = seg.to
  }

  return out
}

/** Strictly inside `rect` shrunk by `inset` on every side. */
export function insideRect(point: Point, rect: Rect, inset = 0): boolean {
  return (
    point.x > rect.x + inset &&
    point.x < rect.x + rect.width - inset &&
    point.y > rect.y + inset &&
    point.y < rect.y + rect.height - inset
  )
}

export function pathHits(path: Path, rects: readonly Rect[], inset = 0.5): boolean {
  const samples = samplePath(path)

  return rects.some(rect => samples.some(sample => insideRect(sample, rect, inset)))
}

function routeOf(path: Path, detoured: boolean): Route {
  const samples = samplePath(path, 12)

  return { path, svg: pathToSvg(path), detoured, mid: samples[Math.floor(samples.length / 2)] }
}

/** The Dense link: a cubic bezier leaving and entering along the ports' directions. */
export function curvePath(from: Port, to: Port): Path {
  const horizontal = from.dir === 'left' || from.dir === 'right'
  const span = horizontal ? Math.abs(to.x - from.x) : Math.abs(to.y - from.y)
  const d = Math.max(horizontal ? 24 : 14, span / 2)
  const a = VEC[from.dir]
  const b = VEC[to.dir]

  return {
    start: { x: from.x, y: from.y },
    segs: [
      {
        kind: 'C',
        c1: { x: from.x + a.x * d, y: from.y + a.y * d },
        c2: { x: to.x + b.x * d, y: to.y + b.y * d },
        to: { x: to.x, y: to.y }
      }
    ]
  }
}

// --- orthogonal detour on a sparse grid ------------------------------------------------------

export interface GridRouteOptions {
  /** Clearance kept from every obstacle. */
  margin: number
  /** Cost of one bend, in pixels of length. */
  bendPenalty: number
}

const DEFAULT_GRID: GridRouteOptions = { margin: 12, bendPenalty: 40 }

/** A bounded binary heap keyed by f-score (A* open set). */
class Heap {
  private items: { f: number; s: number }[] = []

  get size() {
    return this.items.length
  }

  push(f: number, s: number) {
    const items = this.items

    items.push({ f, s })
    let i = items.length - 1

    while (i > 0) {
      const p = (i - 1) >> 1

      if (items[p].f <= items[i].f) {
        break
      }

      ;[items[p], items[i]] = [items[i], items[p]]
      i = p
    }
  }

  pop(): number {
    const items = this.items
    const top = items[0]
    const last = items.pop()!

    if (items.length > 0) {
      items[0] = last
      let i = 0

      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i

        if (l < items.length && items[l].f < items[m].f) {
          m = l
        }

        if (r < items.length && items[r].f < items[m].f) {
          m = r
        }

        if (m === i) {
          break
        }

        ;[items[m], items[i]] = [items[i], items[m]]
        i = m
      }
    }

    return top.s
  }
}

const uniqueSorted = (values: number[]) => [...new Set(values.map(round))].sort((a, b) => a - b)

/**
 * An orthogonal polyline from `from` to `to` that keeps `margin` clear of every obstacle, or
 * null when there is none. Both ends leave along their port direction for `margin` first.
 */
export function orthogonalRoute(
  from: Port,
  to: Port,
  obstacles: readonly Rect[],
  options: GridRouteOptions = DEFAULT_GRID
): Point[] | null {
  const m = options.margin
  // The grid lives on 0.01 px (`round`); the inflated rectangles do too, so a stub that ends on a
  // block's own inflated edge is on that edge, never 0.005 px inside it (card 6: a real drop gives
  // fractional block coordinates, and the detour used to fail there).
  const inflated = obstacles.map(r => {
    const x = round(r.x - m)
    const y = round(r.y - m)

    return { x, y, width: round(r.x + r.width + m) - x, height: round(r.y + r.height + m) - y }
  })
  const start = { x: round(from.x + VEC[from.dir].x * m), y: round(from.y + VEC[from.dir].y * m) }
  const goal = { x: round(to.x + VEC[to.dir].x * m), y: round(to.y + VEC[to.dir].y * m) }

  if (inflated.some(r => insideRect(start, r)) || inflated.some(r => insideRect(goal, r))) {
    return null
  }

  // Grid lines: every inflated obstacle edge, both stubs, one more step out from each stub (so
  // the first move along the port direction always has somewhere to go) and an outer frame.
  const allX = [start.x, goal.x, ...inflated.flatMap(r => [r.x, r.x + r.width])]
  const allY = [start.y, goal.y, ...inflated.flatMap(r => [r.y, r.y + r.height])]
  const extraX = [start.x + VEC[from.dir].x * m, goal.x + VEC[to.dir].x * m, Math.min(...allX) - m, Math.max(...allX) + m]
  const extraY = [start.y + VEC[from.dir].y * m, goal.y + VEC[to.dir].y * m, Math.min(...allY) - m, Math.max(...allY) + m]
  const xs = uniqueSorted([...allX, ...extraX])
  const ys = uniqueSorted([...allY, ...extraY])
  const W = xs.length
  const H = ys.length
  const blockedPoint = (x: number, y: number) => inflated.some(r => insideRect({ x, y }, r))

  // Segment between adjacent grid points crosses an inflated interior?
  const blockedH = (y: number, x1: number, x2: number) =>
    inflated.some(r => y > r.y && y < r.y + r.height && x1 < r.x + r.width && x2 > r.x)
  const blockedV = (x: number, y1: number, y2: number) =>
    inflated.some(r => x > r.x && x < r.x + r.width && y1 < r.y + r.height && y2 > r.y)

  const si = xs.indexOf(start.x)
  const sj = ys.indexOf(start.y)
  const gi = xs.indexOf(goal.x)
  const gj = ys.indexOf(goal.y)
  // State: (i, j, dir) with dir 0..3 = right, left, down, up; 4 = start (no direction yet).
  const DIRS = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ]
  const key = (i: number, j: number, d: number) => (j * W + i) * 5 + d
  const g = new Map<number, number>()
  const came = new Map<number, number>()
  const open = new Heap()
  const h = (i: number, j: number) => Math.abs(xs[i] - goal.x) + Math.abs(ys[j] - goal.y)
  const startKey = key(si, sj, 4)
  // From the stub the path may go on or turn (a stub squeezed into a tight gap must turn).
  const firstDir = { right: 0, left: 1, down: 2, up: 3 }[from.dir]
  const lastDir = { right: 1, left: 0, down: 3, up: 2 }[to.dir]

  g.set(startKey, 0)
  open.push(h(si, sj), startKey)

  let found = -1
  let expanded = 0

  while (open.size > 0 && expanded < 200_000) {
    const current = open.pop()
    const d = current % 5
    const cell = (current - d) / 5
    const i = cell % W
    const j = (cell - i) / W

    expanded += 1

    if (i === gi && j === gj && d !== (lastDir ^ 1)) {
      found = current
      break
    }

    const base = g.get(current)!

    for (let nd = 0; nd < 4; nd += 1) {
      if (d === 4 && nd === (firstDir ^ 1)) {
        continue // the stub already left the source block; never double back into it
      }

      if (d !== 4 && ((d ^ 1) === nd)) {
        continue // no U-turn in place
      }

      const ni = i + DIRS[nd][0]
      const nj = j + DIRS[nd][1]

      if (ni < 0 || nj < 0 || ni >= W || nj >= H || blockedPoint(xs[ni], ys[nj])) {
        continue
      }

      const blocked =
        nd < 2 ? blockedH(ys[j], Math.min(xs[i], xs[ni]), Math.max(xs[i], xs[ni])) : blockedV(xs[i], Math.min(ys[j], ys[nj]), Math.max(ys[j], ys[nj]))

      if (blocked) {
        continue
      }

      const step = Math.abs(xs[ni] - xs[i]) + Math.abs(ys[nj] - ys[j])
      const cost = base + step + (d !== 4 && d !== nd ? options.bendPenalty : 0)
      const next = key(ni, nj, nd)

      if (cost < (g.get(next) ?? Infinity)) {
        g.set(next, cost)
        came.set(next, current)
        open.push(cost + h(ni, nj), next)
      }
    }
  }

  if (found < 0) {
    return null
  }

  const cells: Point[] = []

  for (let s: number | undefined = found; s !== undefined; s = came.get(s)) {
    const d = s % 5
    const cell = (s - d) / 5
    const i = cell % W

    cells.push({ x: xs[i], y: ys[(cell - i) / W] })
  }

  cells.reverse()

  return simplify([{ x: from.x, y: from.y }, ...cells, { x: to.x, y: to.y }])
}

/** Drops repeated and collinear points. */
export function simplify(points: readonly Point[]): Point[] {
  const out: Point[] = []

  for (const p of points) {
    const last = out[out.length - 1]

    if (last && Math.abs(last.x - p.x) < 1e-6 && Math.abs(last.y - p.y) < 1e-6) {
      continue
    }

    if (out.length >= 2) {
      const a = out[out.length - 2]
      const b = out[out.length - 1]

      if ((Math.abs(a.x - b.x) < 1e-6 && Math.abs(b.x - p.x) < 1e-6) || (Math.abs(a.y - b.y) < 1e-6 && Math.abs(b.y - p.y) < 1e-6)) {
        out[out.length - 1] = p
        continue
      }
    }

    out.push(p)
  }

  return out
}

/** A polyline with each corner rounded by up to `radius` (never more than half a segment). */
export function roundedPolyline(points: readonly Point[], radius: number): Path {
  const segs: Seg[] = []

  for (let k = 1; k < points.length; k += 1) {
    const corner = points[k]

    if (k === points.length - 1) {
      segs.push({ kind: 'L', to: corner })
      break
    }

    const prev = points[k - 1]
    const next = points[k + 1]
    const inLen = Math.hypot(corner.x - prev.x, corner.y - prev.y)
    const outLen = Math.hypot(next.x - corner.x, next.y - corner.y)
    const r = Math.min(radius, inLen / 2, outLen / 2)
    const a = { x: corner.x - ((corner.x - prev.x) / (inLen || 1)) * r, y: corner.y - ((corner.y - prev.y) / (inLen || 1)) * r }
    const b = { x: corner.x + ((next.x - corner.x) / (outLen || 1)) * r, y: corner.y + ((next.y - corner.y) / (outLen || 1)) * r }

    segs.push({ kind: 'L', to: a }, { kind: 'Q', c: corner, to: b })
  }

  return { start: points[0], segs }
}

/** Obstacles worth considering for a link between two ports. */
export function nearObstacles(from: Point, to: Point, obstacles: readonly Rect[], reach = 360): Rect[] {
  const x1 = Math.min(from.x, to.x) - reach
  const x2 = Math.max(from.x, to.x) + reach
  const y1 = Math.min(from.y, to.y) - reach
  const y2 = Math.max(from.y, to.y) + reach

  return obstacles.filter(r => r.x < x2 && r.x + r.width > x1 && r.y < y2 && r.y + r.height > y1)
}

/** Clearances tried in turn; the last (a 1 px stub) squeezes through a tight gap at a port. */
export const DETOUR_MARGINS = [12, 6, 3, 1] as const

/** A detour for `from → to` around `obstacles` (and the link's own `ends`), or undefined. The
 *  clearance shrinks when a block sits close to a port (12, 6, 3 px, then a 1 px stub that
 *  leaves through a gap of 2 px or more between the port's block and a neighbour). */
export function detour(from: Port, to: Port, obstacles: readonly Rect[], radius: number, ends: readonly Rect[] = []): Path | undefined {
  for (const margin of DETOUR_MARGINS) {
    const path = detourWith(from, to, obstacles, Math.max(0, Math.min(radius, margin - 2)), ends, margin)

    if (path) {
      return path
    }
  }

  return undefined
}

function detourWith(from: Port, to: Port, obstacles: readonly Rect[], radius: number, ends: readonly Rect[], margin: number): Path | undefined {
  const options = { ...DEFAULT_GRID, margin }
  const near = [...nearObstacles(from, to, obstacles), ...ends]
  const points =
    orthogonalRoute(from, to, near, options) ??
    // A wider search only while the grid stays small (its size grows with the square of the count).
    (obstacles.length <= 120 && obstacles.length + ends.length > near.length
      ? orthogonalRoute(from, to, [...obstacles, ...ends], options)
      : null)

  if (!points) {
    return undefined
  }

  const rounded = roundedPolyline(points, radius)

  if (!pathHits(rounded, obstacles)) {
    return rounded
  }

  const sharp = roundedPolyline(points, 0)

  return pathHits(sharp, obstacles) ? undefined : sharp
}

/** Dense: thin bezier curves; a blocked link detours with rounded corners. */
export const curveRouter: LinkRouter = {
  shape: 'curve',
  live: (from, to) => routeOf(curvePath(from, to), false),
  route({ from, to, obstacles, ends }) {
    const plain = curvePath(from, to)

    if (!pathHits(plain, obstacles)) {
      return routeOf(plain, false)
    }

    const around = detour(from, to, obstacles, 10, ends)

    return around ? routeOf(around, true) : routeOf(plain, false)
  }
}

/**
 * The orthogonal link (Swimlanes; the elbow styles): out of the source along its port, one
 * vertical run, into the target along its port. A right → left link turns `stub` px right of the
 * source; a link whose target starts left of that goes round (out, down or up to the middle,
 * back, in). A down → left link drops to the target's height, then runs right into it.
 */
export function elbowPoints(from: Port, to: Port, stub = 14): Point[] {
  const start = { x: from.x, y: from.y }
  const end = { x: to.x, y: to.y }

  if (from.dir === 'down' || from.dir === 'up') {
    return simplify([start, { x: from.x, y: to.y }, end])
  }

  if (Math.abs(to.y - from.y) < 0.5 && to.x >= from.x) {
    return [start, end]
  }

  if (to.x - stub >= from.x + stub) {
    const turn = from.x + stub

    return simplify([start, { x: turn, y: from.y }, { x: turn, y: to.y }, end])
  }

  const middle = (from.y + to.y) / 2

  return simplify([start, { x: from.x + stub, y: from.y }, { x: from.x + stub, y: middle }, { x: to.x - stub, y: middle }, { x: to.x - stub, y: to.y }, end])
}

/** Orthogonal elbows with rounded corners; a blocked link detours (same corner radius). */
export function makeOrthogonalRouter(radius = 7, stub = 14): LinkRouter {
  const plain = (from: Port, to: Port) => roundedPolyline(elbowPoints(from, to, stub), radius)

  return {
    shape: 'orthogonal',
    live: (from, to) => routeOf(plain(from, to), false),
    route({ from, to, obstacles, ends }) {
      const path = plain(from, to)

      if (!pathHits(path, obstacles)) {
        return routeOf(path, false)
      }

      const around = detour(from, to, obstacles, radius, ends)

      return around ? routeOf(around, true) : routeOf(path, false)
    }
  }
}

export const orthogonalRouter: LinkRouter = makeOrthogonalRouter()

export interface LinkEnds {
  id: string
  source: string
  target: string
  from: Port
  to: Port
}

/**
 * Routes every link against every other block (R13, on drop): a link keeps its plain shape
 * unless that shape crosses a block other than its own two ends.
 */
export function routeLinks(links: readonly LinkEnds[], rects: ReadonlyMap<string, Rect>, router: LinkRouter): Map<string, Route> {
  const all = [...rects]
  const out = new Map<string, Route>()

  for (const link of links) {
    const obstacles = all.filter(([id]) => id !== link.source && id !== link.target).map(([, rect]) => rect)
    const ends = [rects.get(link.source), rects.get(link.target)].filter((rect): rect is Rect => Boolean(rect))

    out.set(link.id, router.route({ from: link.from, to: link.to, obstacles, ends }))
  }

  return out
}
