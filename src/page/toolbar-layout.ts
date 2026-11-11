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
 * with every chip at its own width), so a layout never flips back and forth.
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
  /** The bar's content width, inside its padding. */
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

/** Sub-pixel slack: measured widths are fractional. */
const EPSILON = 0.5

export function barLayout({ room, gap, brand, pickers, tools, scope }: BarMeasure): BarLayout {
  const fits = (width: number) => width <= room + EPSILON
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
 * sideways; a sideways gesture (a touchpad, Shift + wheel) already scrolls it natively, so 0.
 */
export function wheelScroll(deltaX: number, deltaY: number, deltaMode: number, pageWidth: number): number {
  if (Math.abs(deltaX) >= Math.abs(deltaY)) {
    return 0
  }

  return deltaY * (deltaMode === 1 ? LINE_PX : deltaMode === 2 ? pageWidth : 1)
}
