/**
 * Subway station labels (card 7): each label (168 × 46, beside its station, outside the station's
 * box) goes to the first candidate spot (`LABEL_SPOTS`: above, below, above-left, below-left,
 * right, left) that is free: it overlaps no station, no group label, no label placed before it
 * and (card 8, F2) no routed track. When no spot is free, the spot with the least overlap of
 * stations and labels, as before; among spots of equal overlap, the one through which fewer of the
 * station's own tracks run, then fewer other tracks (then the earlier spot). Stations are taken top
 * to bottom, left to right (ties by id), so the result is deterministic. In the auto-layout every
 * label fits above its station and no track runs through that spot (the router keeps it clear), so
 * the tracks never move an auto-layout label. Pure (no React).
 */
import type { Point, Rect } from '../../model/layout.ts'
import { samplePath } from '../../model/route.ts'
import type { Path } from '../../model/route.ts'
import { RectIndex } from './layout.ts'
import { LABEL_H, LABEL_SPOTS, LABEL_W, STATION_H, STATION_W } from './spec.ts'
import type { LabelSpot } from './spec.ts'

export interface PlacedLabel {
  spot: LabelSpot
  rect: Rect
  /** False when every candidate overlapped a station or label (the least-overlap spot was taken). */
  clear: boolean
}

/** A routed track and its two end stations. */
export interface LabelTrack {
  source: string
  target: string
  path: Path
}

/** The label rectangle (flow coordinates) of a station at `point` in `spot`. */
export function labelRect(point: Point, spot: LabelSpot): Rect {
  const at = LABEL_SPOTS.find(each => each.key === spot) ?? LABEL_SPOTS[0]

  return { x: point.x + at.x, y: point.y + at.y, width: LABEL_W, height: LABEL_H }
}

const area = (a: Rect, b: Rect) => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))

/** How far inside a label a track must pass to count (the fuzz test and the e2e use 0.5 px too). */
const INSET = 0.5

/** Whether the segment a→b passes through the inside of `rect` shrunk by 0.5 px (Liang–Barsky). */
export function segmentCrosses(a: Point, b: Point, rect: Rect): boolean {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const edges: [number, number][] = [
    [-dx, a.x - (rect.x + INSET)],
    [dx, rect.x + rect.width - INSET - a.x],
    [-dy, a.y - (rect.y + INSET)],
    [dy, rect.y + rect.height - INSET - a.y]
  ]
  let lo = 0
  let hi = 1

  for (const [p, q] of edges) {
    if (p === 0) {
      // Parallel to this pair of edges: only a run strictly between them is inside.
      if (q <= 0) {
        return false
      }
    } else if (p < 0) {
      lo = Math.max(lo, q / p)
    } else {
      hi = Math.min(hi, q / p)
    }

    if (lo >= hi) {
      return false
    }
  }

  return true
}

/** A straight piece of a track, indexed by its bounding box. */
interface Piece extends Rect {
  a: Point
  b: Point
  source: string
  target: string
}

/** The tracks' straight pieces (a curve, if a router ever drew one, by its sampled points). */
function piecesOf(tracks: readonly LabelTrack[]): RectIndex {
  const index = new RectIndex()

  for (const { source, target, path } of tracks) {
    const points = path.segs.every(seg => seg.kind === 'L') ? [path.start, ...path.segs.map(seg => seg.to)] : samplePath(path)

    for (let i = 1; i < points.length; i += 1) {
      const [a, b] = [points[i - 1], points[i]]
      const piece: Piece = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y), a, b, source, target }

      index.add(piece)
    }
  }

  return index
}

/** [own tracks, other tracks] through the label `rect` of station `id`. */
function trackHits(pieces: RectIndex, rect: Rect, id: string): [number, number] {
  const own = new Set<string>()
  const other = new Set<string>()
  // RectIndex overlap is strict, so a vertical or horizontal piece (an empty box) is found by
  // probing with the label grown by a pixel; the exact test is `segmentCrosses`.
  const probe = { x: rect.x - 1, y: rect.y - 1, width: rect.width + 2, height: rect.height + 2 }

  for (const piece of pieces.hits(probe) as Piece[]) {
    if (segmentCrosses(piece.a, piece.b, rect)) {
      ;(piece.source === id || piece.target === id ? own : other).add(`${piece.source}>${piece.target}`)
    }
  }

  return [own.size, other.size]
}

const better = (a: readonly number[], b: readonly number[]) => a[0] < b[0] || (a[0] === b[0] && (a[1] < b[1] || (a[1] === b[1] && a[2] < b[2])))

/**
 * Label spots for `stations` (id → box top-left), avoiding the stations, the `blocked` rectangles
 * (the project labels) and the routed `tracks` (card 8, F2).
 */
export function placeLabels(stations: ReadonlyMap<string, Point>, blocked: readonly Rect[] = [], tracks: readonly LabelTrack[] = []): Map<string, PlacedLabel> {
  const obstacles = new RectIndex()
  const placed = new RectIndex()
  const pieces = piecesOf(tracks)

  for (const point of stations.values()) {
    obstacles.add({ x: point.x, y: point.y, width: STATION_W, height: STATION_H })
  }

  for (const rect of blocked) {
    obstacles.add(rect)
  }

  const order = [...stations].sort(([a, p], [b, q]) => p.y - q.y || p.x - q.x || (a < b ? -1 : a > b ? 1 : 0))
  const out = new Map<string, PlacedLabel>()

  for (const [id, point] of order) {
    let best: undefined | { spot: LabelSpot; rect: Rect; score: [number, number, number] }

    for (const candidate of LABEL_SPOTS) {
      const rect = labelRect(point, candidate.key)
      const overlap = [...obstacles.hits(rect), ...placed.hits(rect)].reduce((sum, other) => sum + area(rect, other), 0)
      const score: [number, number, number] = [overlap, ...trackHits(pieces, rect, id)]

      if (!best || better(score, best.score)) {
        best = { spot: candidate.key, rect, score }
      }

      if (score.every(each => each === 0)) {
        break
      }
    }

    placed.add(best!.rect)
    out.set(id, { spot: best!.spot, rect: best!.rect, clear: best!.score[0] === 0 })
  }

  return out
}

/** The tracks for `placeLabels`: every routed link of a routing (its ends and its path). */
export function labelTracks(links: readonly { id: string; source: string; target: string }[], routes: ReadonlyMap<string, { route: { path: Path } }>): LabelTrack[] {
  const out: LabelTrack[] = []

  for (const link of links) {
    const routed = routes.get(link.id)

    if (routed) {
      out.push({ source: link.source, target: link.target, path: routed.route.path })
    }
  }

  return out
}
