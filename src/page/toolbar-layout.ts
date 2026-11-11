/**
 * The toolbar's layout at the page's own width (a split view, a narrow window). Pure: the
 * toolbar measures its items and applies what this says. As the page narrows it gives up, in
 * this order (the cheapest first):
 *
 * 1. `row`: everything on one line, the project scope strip after the brand.
 * 2. `stacked`: the scope strip on its own line below the controls (every chip shown, or
 *    scrolling when there are more than fit) …
 * 3. … then the brand's text (its icon stays) …
 * 4. … then the tools' text (Show all, Archived, Snap, Fit: icons only, the name stays in the
 *    tooltip).
 * 5. `wrapped`: the tools on a line of their own between the controls and the scope strip,
 *    with their text again when it fits there (and the brand's text when it fits its line).
 *
 * Every input is the same in every layout (the items are measured with their text, the strip
 * with every chip at its own width), so a layout never flips back and forth. Every width is in
 * CSS px, also under Hermes' UI scale (CSS `zoom` on <html>, `cssScale`), so a page as wide in
 * CSS px gets the same layout at any text size.
 */

export type BarLines = 'row' | 'stacked' | 'wrapped'

export interface BarLayout {
  lines: BarLines
  brandText: boolean
  toolText: boolean
}

/** An item's width with its text and with its icon only. */
export interface Sized {
  full: number
  icon: number
}

export interface BarMeasure {
  /** The bar's content width, inside its border and padding (fractional, as laid out). */
  room: number
  /** The column gap between the bar's items. */
  gap: number
  brand: Sized
  /** The profile and style pickers. */
  pickers: readonly number[]
  /** The tools group: Show all … the panel toggle. */
  tools: Sized
  /** The scope strip with every chip at its own width. */
  scope: number
}

/** Sub-pixel slack for the strip's scroll ends. */
const EPSILON = 0.5

/**
 * The room a layout must leave spare (CSS px). Never added to the room: a layout is kept only
 * when it fits (review t_899e3936 N1: a rounded room plus slack kept one that did not, in a band
 * just above each change). It absorbs the float error of measuring through a UI scale.
 */
export const FIT_MARGIN = 0.05

export function barLayout({ room, gap, brand, pickers, tools, scope }: BarMeasure): BarLayout {
  const fits = (width: number) => width + FIT_MARGIN <= room
  // The brand and the pickers with the gaps between them.
  const left = (brandWidth: number) => brandWidth + pickers.reduce((sum, each) => sum + each + gap, 0)

  if (fits(left(brand.full) + gap + scope + gap + tools.full)) {
    return { lines: 'row', brandText: true, toolText: true }
  }

  if (fits(left(brand.full) + gap + tools.full)) {
    return { lines: 'stacked', brandText: true, toolText: true }
  }

  if (fits(left(brand.icon) + gap + tools.full)) {
    return { lines: 'stacked', brandText: false, toolText: true }
  }

  if (fits(left(brand.icon) + gap + tools.icon)) {
    return { lines: 'stacked', brandText: false, toolText: false }
  }

  return { lines: 'wrapped', brandText: fits(left(brand.full)), toolText: fits(tools.full) }
}

/** Which ends of a scrolling strip hide chips (they fade out there). */
export function fadeEdges(scrollLeft: number, clientWidth: number, scrollWidth: number): 'both' | 'left' | 'right' | undefined {
  const left = scrollLeft > EPSILON
  const right = scrollLeft + clientWidth < scrollWidth - EPSILON

  return left && right ? 'both' : left ? 'left' : right ? 'right' : undefined
}

/**
 * How far to scroll a strip (positive: to the right) so that `target` is inside `view`, `pad`
 * clear of its ends (the fades). 0 when it already is; a target wider than the view shows its
 * start.
 */
export function revealBy(view: { left: number; right: number }, target: { left: number; right: number }, pad: number): number {
  if (target.left < view.left + pad) {
    return target.left - (view.left + pad)
  }

  if (target.right > view.right - pad) {
    return Math.min(target.right - (view.right - pad), target.left - (view.left + pad))
  }

  return 0
}

const LINE_PX = 16

/**
 * The sideways scroll for a wheel turn over the scope strip: a plain (vertical) wheel scrolls it
 * sideways; a sideways gesture (a touchpad) and Shift + wheel (Chrome reports it as a vertical
 * delta with `shiftKey`, review t_899e3936 N2) already scroll it natively, so 0.
 */
export function wheelScroll(deltaX: number, deltaY: number, deltaMode: number, pageWidth: number, shiftKey = false): number {
  if (shiftKey || Math.abs(deltaX) >= Math.abs(deltaY)) {
    return 0
  }

  return deltaY * (deltaMode === 1 ? LINE_PX : deltaMode === 2 ? pageWidth : 1)
}

/**
 * The factor from CSS px to client-rect px for an element (review t_899e3936 B1). Under Hermes'
 * UI scale (Settings → text size: CSS `zoom` on <html>) getBoundingClientRect() is zoomed while
 * offsetWidth, clientWidth and computed lengths are not, so every rect width is divided by this.
 *
 * - `cssZoom`: the engine's effective zoom of the element (`currentCSSZoom`, else the product of
 *   the ancestors' computed `zoom`). Exact, so it is used when the measured ratio agrees.
 * - The measured ratio, `rectWidth / layoutWidth`: `layoutWidth` (offsetWidth) is rounded to a
 *   whole px, so it is good to about 0.5 px over the width. It decides whether this engine zooms
 *   its rects at all (1 when they are not), and is the factor when no zoom is known.
 */
export function cssScale(rectWidth: number, layoutWidth: number, cssZoom: number | undefined): number {
  if (!(rectWidth > 0) || !(layoutWidth > 0)) {
    return 1
  }

  const measured = rectWidth / layoutWidth
  const tolerance = 1 / layoutWidth + 0.002

  if (cssZoom !== undefined && cssZoom > 0 && Math.abs(measured - cssZoom) <= tolerance * Math.max(1, cssZoom)) {
    return cssZoom
  }

  return Math.abs(measured - 1) <= tolerance ? 1 : measured
}
