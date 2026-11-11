import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { barLayout, fadeEdges, revealBy, wheelScroll } from '../../src/page/toolbar-layout.ts'
import type { BarLayout, BarMeasure } from '../../src/page/toolbar-layout.ts'

// A Dense toolbar as measured in Chrome: the brand, the two pickers, the tools group and a
// nine-project scope strip.
const BAR: Omit<BarMeasure, 'room'> = {
  gap: 4,
  brand: { full: 104, icon: 22 },
  pickers: [112, 152],
  tools: { full: 466, icon: 311 },
  scope: 900
}
const at = (room: number, over: Partial<BarMeasure> = {}) => barLayout({ ...BAR, room, ...over })
const left = (brand: number) => brand + 4 + 112 + 4 + 152
const ROW = left(104) + 4 + 900 + 4 + 466
const STACKED = left(104) + 4 + 466
const NO_BRAND = left(22) + 4 + 466
const ICONS = left(22) + 4 + 311

describe('barLayout: the toolbar at the page width', () => {
  it('one row when the brand, pickers, the whole scope strip and the tools fit', () => {
    assert.deepEqual(at(ROW), { lines: 'row', brandText: true, toolText: true })
    assert.deepEqual(at(ROW + 400), { lines: 'row', brandText: true, toolText: true })
    assert.deepEqual(at(ROW - 0.3), { lines: 'row', brandText: true, toolText: true }, 'sub-pixel slack')
  })

  it('the scope strip gets its own line as soon as a chip would be hidden', () => {
    assert.deepEqual(at(ROW - 1), { lines: 'stacked', brandText: true, toolText: true })
    assert.deepEqual(at(STACKED), { lines: 'stacked', brandText: true, toolText: true })
    // Many projects: stacked even in a wide window, never squeezed into a scrolling sliver.
    assert.equal(at(2400, { scope: 2200 }).lines, 'stacked')
  })

  it('then gives up the brand text, then the tool text', () => {
    assert.deepEqual(at(STACKED - 1), { lines: 'stacked', brandText: false, toolText: true })
    assert.deepEqual(at(NO_BRAND), { lines: 'stacked', brandText: false, toolText: true })
    assert.deepEqual(at(NO_BRAND - 1), { lines: 'stacked', brandText: false, toolText: false })
    assert.deepEqual(at(ICONS), { lines: 'stacked', brandText: false, toolText: false })
  })

  it('then puts the tools on their own line, with their text again where it fits', () => {
    assert.deepEqual(at(ICONS - 1), { lines: 'wrapped', brandText: true, toolText: true })
    assert.deepEqual(at(466), { lines: 'wrapped', brandText: true, toolText: true })
    assert.deepEqual(at(465), { lines: 'wrapped', brandText: true, toolText: false })
    assert.deepEqual(at(left(104)), { lines: 'wrapped', brandText: true, toolText: false })
    assert.deepEqual(at(left(104) - 1), { lines: 'wrapped', brandText: false, toolText: false })
    assert.deepEqual(at(200), { lines: 'wrapped', brandText: false, toolText: false })
  })

  it('never puts more on one line than fits there', () => {
    const lineWidths = (layout: BarLayout) => {
      const brand = layout.brandText ? 104 : 22
      const tools = layout.toolText ? 466 : 311

      if (layout.lines === 'row') {
        return [left(brand) + 4 + 900 + 4 + tools]
      }

      return layout.lines === 'stacked' ? [left(brand) + 4 + tools] : [left(brand), tools]
    }

    // Below the narrower of the two (the brand icon and pickers, the tool icons) the CSS wraps
    // inside the line too.
    for (let room = 2000; room >= Math.max(left(22), 311); room -= 3) {
      const layout = at(room)

      for (const width of lineWidths(layout)) {
        assert.ok(width <= room + 0.5, `room ${room}: ${JSON.stringify(layout)} puts ${width} px on a line`)
      }
    }
  })

  it('goes from row to stacked to wrapped as the page narrows, never back', () => {
    const order = { row: 0, stacked: 1, wrapped: 2 }
    let last = 0

    for (let room = 2000; room >= 200; room -= 7) {
      const rank = order[at(room).lines]

      assert.ok(rank >= last, `room ${room}: ${rank} after ${last}`)
      last = rank
    }

    assert.equal(last, 2)
  })
})

describe('fadeEdges: which ends of the scope strip hide chips', () => {
  it('none when everything is visible', () => {
    assert.equal(fadeEdges(0, 500, 500), undefined)
    assert.equal(fadeEdges(0, 500, 500.4), undefined)
  })

  it('right at the start, left at the end, both in between', () => {
    assert.equal(fadeEdges(0, 300, 900), 'right')
    assert.equal(fadeEdges(600, 300, 900), 'left')
    assert.equal(fadeEdges(599.7, 300, 900), 'left')
    assert.equal(fadeEdges(200, 300, 900), 'both')
  })
})

describe('revealBy: scroll the selected chip into view', () => {
  const view = { left: 100, right: 400 }

  it('0 when the chip is already clear of the fades', () => {
    assert.equal(revealBy(view, { left: 150, right: 250 }, 12), 0)
    assert.equal(revealBy(view, { left: 112, right: 388 }, 12), 0)
  })

  it('scrolls right for a chip past the right end, left for one before the left end', () => {
    assert.equal(revealBy(view, { left: 420, right: 500 }, 12), 112)
    assert.equal(revealBy(view, { left: 380, right: 420 }, 12), 32)
    assert.equal(revealBy(view, { left: 20, right: 90 }, 12), -92)
  })

  it('a chip wider than the view shows its start', () => {
    assert.equal(revealBy(view, { left: 150, right: 600 }, 12), 38)
  })
})

describe('wheelScroll: a plain wheel over the scope strip scrolls it sideways', () => {
  it('a vertical wheel turn becomes a sideways scroll, in pixels', () => {
    assert.equal(wheelScroll(0, 100, 0, 800), 100)
    assert.equal(wheelScroll(0, -3, 1, 800), -48)
    assert.equal(wheelScroll(0, 1, 2, 800), 800)
  })

  it('a sideways gesture is left to the browser', () => {
    assert.equal(wheelScroll(40, 10, 0, 800), 0)
    assert.equal(wheelScroll(-5, 5, 0, 800), 0)
    assert.equal(wheelScroll(0, 0, 0, 800), 0)
  })
})
