/**
 * Card 9: the selection (a set of blocks with one primary block) and moving several blocks at
 * once. Pure (no React): node:test drives the same functions the page and the canvas use.
 *
 * - **Selecting.** A plain click selects only that block; Shift+click adds or removes one block;
 *   a box replaces the selection with the blocks fully inside it, Shift + a box adds them; Esc or
 *   a click on empty canvas clears it; Ctrl/⌘+A selects every editable block shown.
 * - **Never selectable** by a box, Shift+click or Ctrl/⌘+A (`canvasSelectable`): dimmed
 *   out-of-scope blocks (R5), "Parent not loaded" stand-ins (R7), and sessions that sit in a
 *   style's singles list or drawer rather than on the canvas (R8). A plain click on a row of such
 *   a list still selects that one session, as before card 9 (the page's `plainSelectable`).
 * - **Moving.** Every selected block moves by the grabbed block's offset, so their spacing stays
 *   the same; with Snap the offset comes from the grabbed block's snapped spot (`groupPositions`).
 * - **A live refresh** keeps the selected blocks that are still shown (`keepShown`).
 */
import type { GraphModel } from './graph.ts'
import type { Point, Rect } from './layout.ts'

export interface Selection {
  /** Selected block ids, in the order they were selected. */
  readonly ids: readonly string[]
  /** The block the user acted on last (a click, Shift+click, the first of a box); `null` when empty. */
  readonly primary: null | string
}

export type SelectionAction =
  /** A plain click (or a menu, a list row, a drag of an unselected block): only this block. */
  | { type: 'only'; id: string }
  /** Shift+click: add or remove this block. */
  | { type: 'toggle'; id: string }
  /** A selection box: the blocks fully inside it, replacing the selection or (Shift) added to it. */
  | { type: 'box'; ids: readonly string[]; additive: boolean }
  /** Ctrl/⌘+A: every editable block shown. */
  | { type: 'all'; ids: readonly string[] }
  /** Esc, a click on empty canvas, a new scope, profile or style. */
  | { type: 'clear' }

export const EMPTY_SELECTION: Selection = Object.freeze({ ids: Object.freeze([]) as readonly string[], primary: null })

const make = (ids: readonly string[], primary: null | string): Selection =>
  ids.length === 0 ? EMPTY_SELECTION : { ids, primary: primary !== null && ids.includes(primary) ? primary : ids[ids.length - 1] }

/**
 * A block a box, Shift+click or Ctrl/⌘+A may select: a session block on the canvas (in `shown`),
 * not read-only (out of scope) and not a stand-in.
 */
export function canvasSelectable(model: GraphModel, shown: ReadonlySet<string>, id: string): boolean {
  const node = model.nodeById.get(id)

  return Boolean(node && shown.has(id) && node.kind === 'session' && !node.readOnly)
}

/**
 * The next selection. `selectable` guards everything that adds blocks; `plainSelectable` (default:
 * `selectable`) guards a plain one-block selection, which may also come from a singles list.
 */
export function reduceSelection(
  selection: Selection,
  action: SelectionAction,
  selectable: (id: string) => boolean,
  plainSelectable: (id: string) => boolean = selectable
): Selection {
  switch (action.type) {
    case 'only':
      return plainSelectable(action.id) ? make([action.id], action.id) : EMPTY_SELECTION

    case 'toggle': {
      if (selection.ids.includes(action.id)) {
        const ids = selection.ids.filter(id => id !== action.id)

        return make(ids, selection.primary === action.id ? null : selection.primary)
      }

      if (!selectable(action.id)) {
        return selection
      }

      // A single picked from a list is not a canvas block: Shift+click starts a canvas selection.
      return make([...selection.ids.filter(selectable), action.id], action.id)
    }

    case 'box': {
      const boxed = unique(action.ids.filter(selectable))

      if (!action.additive) {
        return make(boxed, boxed[0] ?? null)
      }

      if (boxed.length === 0) {
        return selection
      }

      const kept = selection.ids.filter(selectable)
      const added = boxed.filter(id => !kept.includes(id))

      return make([...kept, ...added], added[0] ?? selection.primary)
    }

    case 'all': {
      const ids = unique(action.ids.filter(selectable))

      return make(ids, selection.primary)
    }

    case 'clear':
      return EMPTY_SELECTION
  }
}

function unique(ids: readonly string[]): string[] {
  return [...new Set(ids)]
}

export function selectedSet(selection: Selection): ReadonlySet<string> {
  return new Set(selection.ids)
}

/** The one selected block, or `null` with none or several (the lineage highlight, the inspector). */
export function singleSelected(selection: Selection): null | string {
  return selection.ids.length === 1 ? selection.ids[0] : null
}

/**
 * After a live refresh: the selected blocks that are still shown. A one-block selection (which may
 * be a single picked from a list) survives while `singleOk` holds (default: `selectable`). Nothing
 * lost: the same object, so nothing re-renders.
 */
export function keepShown(selection: Selection, selectable: (id: string) => boolean, singleOk: (id: string) => boolean = selectable): Selection {
  if (selection.ids.length === 0) {
    return selection
  }

  if (selection.ids.length === 1) {
    return singleOk(selection.ids[0]) ? selection : EMPTY_SELECTION
  }

  const ids = selection.ids.filter(selectable)

  return ids.length === selection.ids.length ? selection : make(ids, selection.primary)
}

/** The rectangle spanned by two corners, in any order. */
export function boxOf(a: Point, b: Point): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) }
}

/** The blocks whose rectangle lies fully inside `box` (edges included); a partly covered one is not. */
export function fullyInside(rects: ReadonlyMap<string, Rect>, box: Rect): string[] {
  const right = box.x + box.width
  const bottom = box.y + box.height
  const out: string[] = []

  for (const [id, rect] of rects) {
    if (rect.x >= box.x && rect.y >= box.y && rect.x + rect.width <= right && rect.y + rect.height <= bottom) {
      out.push(id)
    }
  }

  return out
}

/** React Flow's `snapPosition`: the nearest grid point. */
export function snapPoint(point: Point, grid: number): Point {
  return { x: grid * Math.round(point.x / grid), y: grid * Math.round(point.y / grid) }
}

/**
 * Where each dragged block is, from the drag-start spots and the grabbed block's unsnapped spot
 * now. Every block moves by the grabbed block's offset (spacing kept); with Snap the grabbed block
 * snaps and the others follow by the same offset, so a group that starts on the grid stays on it.
 * One block is the same as React Flow's own `snapToGrid`.
 */
export function groupPositions(starts: ReadonlyMap<string, Point>, grabbedId: string, grabbedNow: Point, snap: boolean, grid: number): Map<string, Point> {
  const origin = starts.get(grabbedId) ?? grabbedNow
  const target = snap ? snapPoint(grabbedNow, grid) : grabbedNow
  const dx = target.x - origin.x
  const dy = target.y - origin.y
  const out = new Map<string, Point>()

  for (const [id, start] of starts) {
    out.set(id, id === grabbedId ? { x: target.x, y: target.y } : { x: start.x + dx, y: start.y + dy })
  }

  return out
}
