/**
 * Subway map geometry (pure, no React; mockup `variants/subway-map/`): the station box, the
 * metro grid the auto-layout uses, the label box, the link ports and the track shades.
 *
 * A station's box (the React Flow node) is small: the ring or the ×N capsule. Its label (title,
 * at most 2 lines, and a muted meta line) is drawn beside it, outside the box, where the label
 * placement put it (`labels.ts`). Tracks attach to the box: a line that continues the station's
 * track leaves its right edge (centre), a split leaves its bottom edge at the split's own slot, and
 * every line enters its target's left edge (centre).
 */
import type { EdgeKind } from '../../model/graph.ts'
import type { LayoutSpec, Rect } from '../../model/layout.ts'
import type { Port } from '../../model/route.ts'

export const STATION_W = 40
export const STATION_H = 20
/** The metro grid (R4 snap; every auto-layout coordinate is a multiple of it). */
export const SUBWAY_GRID = 25
/** Column pitch (a station plus its label's width and room) and row pitch (one track per row). */
export const COLUMN = 250
export const ROW = 100
/** The label box beside a station: 2 title lines and a meta line. */
export const LABEL_W = 168
export const LABEL_H = 46
export const LABEL_GAP = 4
/** Group label height (the shared project label). */
export const GROUP_LABEL_H = 26
/** A group's first station row sits this far under its label (the station labels go above it). */
export const GROUP_TOP = 100
/** The next family's first row, under the previous family's last row. */
export const FAMILY_STEP = 125
/** The next group's label, under the previous group's last row. */
export const GROUP_STEP = 75
/** Singles on the canvas (Show all): a grid this many columns wide. */
export const SINGLES_COLUMNS = 4
/** A split's departures along the parent's bottom edge: this far apart, right to left. */
export const SLOT_PITCH = 8
/** The 45° cut at a bend (one grid step) and a side port's stub before it turns. */
export const BEND = 25
export const SIDE_STUB = 30
/** The track's stroke and its halo (the casing drawn under it, in the canvas colour). */
export const TRACK_WIDTH = 4.5
export const CASING_WIDTH = 8
/** Shades of the project colour, one per track of a family (mixed with the theme's text colour). */
export const SHADES = [100, 58, 80, 42, 90, 68, 50, 74] as const

export function subwayLayoutSpec({ showAll }: { showAll: boolean }): LayoutSpec {
  return {
    nodeWidth: STATION_W,
    nodeHeight: STATION_H,
    columnGap: COLUMN - STATION_W,
    rowGap: ROW - STATION_H,
    treeGap: ROW,
    familyGap: FAMILY_STEP - ROW,
    groupGap: GROUP_STEP,
    labelHeight: GROUP_LABEL_H,
    singlesColumns: SINGLES_COLUMNS,
    includeSingles: showAll
  }
}

/**
 * Where split `slot` (1, 2, …) leaves its parent's bottom edge, from the box's centre: the first
 * split rightmost, each later (lower) one further left, so a later split's drop never crosses an
 * earlier split's run into its station. Slots past the fifth pack into the box's last 4 px.
 */
export function splitOffset(slot: number): number {
  if (slot <= 5) {
    return 2 * SLOT_PITCH - (slot - 1) * SLOT_PITCH
  }

  return -2 * SLOT_PITCH - Math.min(STATION_W / 2 - 2 * SLOT_PITCH - 1, slot - 5)
}

/** Slot 0 (the line that continues the track): right edge → the target's left edge. A split
 *  (slot ≥ 1): its own spot on the bottom edge → the target's left edge. */
export function subwayPorts(_kind: EdgeKind, source: Rect, target: Rect, slot = 0): { from: Port; to: Port } {
  const to: Port = { x: target.x, y: target.y + target.height / 2, dir: 'left' }

  if (slot <= 0) {
    return { from: { x: source.x + source.width, y: source.y + source.height / 2, dir: 'right' }, to }
  }

  return { from: { x: source.x + source.width / 2 + splitOffset(slot), y: source.y + source.height, dir: 'down' }, to }
}

/** A track's colour: shade `ordinal` of the project colour (`--st-pc`), from the theme otherwise. */
export function trackColour(ordinal: number): string {
  const mix = SHADES[ordinal % SHADES.length]

  return mix === 100 ? 'var(--st-pc)' : `color-mix(in oklab, var(--st-pc) ${mix}%, var(--ui-text-primary))`
}

/** The base colour a family's tracks are shades of: the project's colour from data, else the
 *  theme's accent (a project without a colour still gets a visible line). */
export const lineBase = (color: null | string | undefined): string => color || 'var(--ui-accent)'

/** Label candidates around a station (offsets from the box's top-left), in the order tried:
 *  above (the mockup's place), below, above-left, below-left, right, left. */
export const LABEL_SPOTS = [
  { key: 'above', x: 2, y: -LABEL_GAP - LABEL_H },
  { key: 'below', x: 2, y: STATION_H + LABEL_GAP },
  { key: 'above-left', x: STATION_W - 2 - LABEL_W, y: -LABEL_GAP - LABEL_H },
  { key: 'below-left', x: STATION_W - 2 - LABEL_W, y: STATION_H + LABEL_GAP },
  { key: 'right', x: STATION_W + 8, y: STATION_H / 2 - LABEL_H / 2 },
  { key: 'left', x: -8 - LABEL_W, y: STATION_H / 2 - LABEL_H / 2 }
] as const

export type LabelSpot = (typeof LABEL_SPOTS)[number]['key']
