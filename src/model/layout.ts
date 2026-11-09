/**
 * Temporary foundation layout: each branch family is a left-to-right tree
 * (depth → column, leaf order → row), families stack top to bottom, a reset
 * successor ("continued as") stacks right under its predecessor's family, and
 * unrelated singles fill a grid below. Card 2 replaces this with the real
 * auto-layout; it exists so the canvas has deterministic, non-overlapping
 * positions to draw.
 */
import type { GraphLink, SessionRow } from './sessions.ts'

export interface Point {
  x: number
  y: number
}

export const BLOCK_WIDTH = 220
export const BLOCK_HEIGHT = 36
const COLUMN_GAP = 60
const ROW_GAP = 14
const FAMILY_GAP = 36
const SINGLES_PER_ROW = 4

const recency = (row: SessionRow | undefined): number => row?.last_active || row?.started_at || 0

export function layoutForest(rows: readonly SessionRow[], links: readonly GraphLink[]): Map<string, Point> {
  const ids = new Set(rows.map(row => row.id))
  const rowById = new Map(rows.map(row => [row.id, row]))
  const children = new Map<string, string[]>()
  const continuedAs = new Map<string, string[]>()
  const hasParent = new Set<string>()
  const linked = new Set<string>()

  for (const link of links) {
    if (!ids.has(link.source) || !ids.has(link.target)) {
      continue
    }

    linked.add(link.source)
    linked.add(link.target)

    if (hasParent.has(link.target)) {
      continue
    }

    hasParent.add(link.target)
    const into = link.kind === 'branch' ? children : continuedAs

    into.set(link.source, [...(into.get(link.source) ?? []), link.target])
  }

  const byRecency = (a: string, b: string) => recency(rowById.get(b)) - recency(rowById.get(a)) || a.localeCompare(b)

  for (const list of [...children.values(), ...continuedAs.values()]) {
    list.sort(byRecency)
  }

  const positions = new Map<string, Point>()
  const seen = new Set<string>()
  const step = BLOCK_HEIGHT + ROW_GAP
  let cursorY = 0
  // Reset successors met while placing a family; they get their own family rows after it.
  let pendingSuccessors: string[] = []

  const place = (id: string, depth: number): number => {
    if (seen.has(id)) {
      return positions.get(id)?.y ?? cursorY
    }

    seen.add(id)
    pendingSuccessors.push(...(continuedAs.get(id) ?? []))
    const kids = (children.get(id) ?? []).filter(kid => !seen.has(kid))
    let y: number

    if (kids.length === 0) {
      y = cursorY
      cursorY += step
    } else {
      const ys = kids.map(kid => place(kid, depth + 1))
      y = (Math.min(...ys) + Math.max(...ys)) / 2
    }

    positions.set(id, { x: depth * (BLOCK_WIDTH + COLUMN_GAP), y })

    return y
  }

  const placeFamily = (root: string) => {
    place(root, 0)
    cursorY += FAMILY_GAP

    while (pendingSuccessors.length > 0) {
      const next = pendingSuccessors
      pendingSuccessors = []

      for (const successor of next) {
        if (!seen.has(successor)) {
          place(successor, 0)
          cursorY += FAMILY_GAP
        }
      }
    }
  }

  const roots = rows
    .map(row => row.id)
    .filter(id => linked.has(id) && !hasParent.has(id))
    .sort(byRecency)

  for (const root of roots) {
    placeFamily(root)
  }

  // Cycles (corrupt lineage) leave linked rows unplaced: give each its own family row.
  for (const row of rows) {
    if (linked.has(row.id) && !seen.has(row.id)) {
      placeFamily(row.id)
    }
  }

  const singles = rows.filter(row => !linked.has(row.id)).sort((a, b) => byRecency(a.id, b.id))

  singles.forEach((row, index) => {
    positions.set(row.id, {
      x: (index % SINGLES_PER_ROW) * (BLOCK_WIDTH + COLUMN_GAP),
      y: cursorY + Math.floor(index / SINGLES_PER_ROW) * step
    })
  })

  return positions
}
