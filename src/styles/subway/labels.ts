/**
 * Subway station labels (card 7): each label (168 × 46, beside its station, outside the station's
 * box) goes to the first candidate spot (`LABEL_SPOTS`: above, below, above-left, below-left,
 * right, left) that overlaps no station, no group label and no label placed before it; when none
 * is free, the spot with the least overlap. Stations are taken top to bottom, left to right (ties
 * by id), so the result is deterministic. In the auto-layout every label fits above its station.
 * Pure (no React).
 */
import type { Point, Rect } from '../../model/layout.ts'
import { RectIndex } from './layout.ts'
import { LABEL_H, LABEL_SPOTS, LABEL_W, STATION_H, STATION_W } from './spec.ts'
import type { LabelSpot } from './spec.ts'

export interface PlacedLabel {
  spot: LabelSpot
  rect: Rect
  /** False when every candidate overlapped something (the least-overlap spot was taken). */
  clear: boolean
}

/** The label rectangle (flow coordinates) of a station at `point` in `spot`. */
export function labelRect(point: Point, spot: LabelSpot): Rect {
  const at = LABEL_SPOTS.find(each => each.key === spot) ?? LABEL_SPOTS[0]

  return { x: point.x + at.x, y: point.y + at.y, width: LABEL_W, height: LABEL_H }
}

const area = (a: Rect, b: Rect) => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))

/** Label spots for `stations` (id → box top-left), avoiding the stations and `blocked` rectangles. */
export function placeLabels(stations: ReadonlyMap<string, Point>, blocked: readonly Rect[] = []): Map<string, PlacedLabel> {
  const obstacles = new RectIndex()
  const placed = new RectIndex()

  for (const point of stations.values()) {
    obstacles.add({ x: point.x, y: point.y, width: STATION_W, height: STATION_H })
  }

  for (const rect of blocked) {
    obstacles.add(rect)
  }

  const order = [...stations].sort(([a, p], [b, q]) => p.y - q.y || p.x - q.x || (a < b ? -1 : a > b ? 1 : 0))
  const out = new Map<string, PlacedLabel>()

  for (const [id, point] of order) {
    let best: undefined | { spot: LabelSpot; rect: Rect; overlap: number }

    for (const candidate of LABEL_SPOTS) {
      const rect = labelRect(point, candidate.key)
      const hits = [...obstacles.hits(rect), ...placed.hits(rect)]
      const overlap = hits.reduce((sum, other) => sum + area(rect, other), 0)

      if (!best || overlap < best.overlap) {
        best = { spot: candidate.key, rect, overlap }
      }

      if (overlap === 0) {
        break
      }
    }

    placed.add(best!.rect)
    out.set(id, { spot: best!.spot, rect: best!.rect, clear: best!.overlap === 0 })
  }

  return out
}
