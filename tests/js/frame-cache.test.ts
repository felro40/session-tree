import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { ALL_PROJECTS, buildGraph } from '../../src/model/graph.ts'
import type { GraphModel } from '../../src/model/graph.ts'
import { rectOf } from '../../src/model/layout.ts'
import type { Rect } from '../../src/model/layout.ts'
import { orthogonalRouter, routeLinks } from '../../src/model/route.ts'
import type { LinkRouter } from '../../src/model/route.ts'
import { clockKey, createFrameCache } from '../../src/page/frame-cache.ts'
import type { OffsetAt } from '../../src/page/frame-cache.ts'
import { fitSwimlanes, layoutSwimlanes, swimNowX } from '../../src/styles/swimlanes/layout.ts'
import type { SwimFrameLayout } from '../../src/styles/swimlanes/layout.ts'
import { DAY_WIDTH, swimLayoutSpec, swimPorts } from '../../src/styles/swimlanes/spec.ts'
import type { FrameLayout, StyleFrame } from '../../src/styles/types.ts'
import { loadFixture } from './fixtures.ts'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const UTC: OffsetAt = () => 0

/** The Swimlanes frame without its React layers (the page's `frame.compute`), counting calls. */
function countingFrame(): StyleFrame & { calls: number } {
  const frame = {
    calls: 0,
    compute(input: Parameters<StyleFrame['compute']>[0]): FrameLayout {
      frame.calls += 1
      const layout = layoutSwimlanes(input)

      return Object.assign(layout, { fit: (width: number, height: number, minZoom: number) => fitSwimlanes(layout, width, height, minZoom) })
    },
    extraNodes: () => [],
    Under: () => null,
    Over: () => null
  }

  return frame
}

/**
 * The canvas shell's memo chain (graph-canvas.tsx): rectangles from the shown blocks' positions,
 * then every link through the router, rebuilt only when the model, the shown set or the
 * positions map is a new object. The router counts its calls.
 */
function canvas() {
  let deps: unknown[] | undefined
  let routed = 0
  const spec = swimLayoutSpec({ showAll: false })
  const router: LinkRouter = {
    shape: 'orthogonal',
    live: orthogonalRouter.live,
    route(input) {
      routed += 1

      return orthogonalRouter.route(input)
    }
  }

  return {
    get routed() {
      return routed
    },
    render(model: GraphModel, layout: FrameLayout) {
      const next = [model, layout.shown, layout.positions]

      if (deps && next.every((value, i) => value === deps![i])) {
        return
      }

      deps = next
      const rects = new Map<string, Rect>()

      for (const id of layout.shown) {
        const point = layout.positions.get(id)

        if (point) {
          rects.set(id, rectOf(id, point, spec))
        }
      }

      const ends = model.edges
        .filter(edge => rects.has(edge.source) && rects.has(edge.target))
        .map(edge => ({ id: edge.id, source: edge.source, target: edge.target, ...swimPorts(edge.kind, rects.get(edge.source)!, rects.get(edge.target)!) }))

      routeLinks(ends, rects, router)
    }
  }
}

describe('Swimlanes frame cache (B1, card-5 review: no re-layout or re-route on the minute tick)', () => {
  const fixture = loadFixture('default')
  const model = buildGraph(fixture.rows, fixture.projects, { profile: 'default', showArchived: false, scope: ALL_PROJECTS })
  // 2026-11-10 09:00 UTC, the fixture's sessions are older: the axis shows them in the window.
  const morning = Date.UTC(2026, 10, 10, 9, 0, 0)
  const collapsed = new Set<string>()

  it('a nowMs change inside the same local day and offset keeps the layout and its positions object (===), and the router is not called', () => {
    const frame = countingFrame()
    const cache = createFrameCache()
    const view = canvas()
    const first = cache.get({ frame, model, showAll: false, collapsed, nowMs: morning, offsetAt: UTC })

    view.render(model, first)
    const routedOnce = view.routed

    assert.ok(routedOnce > 5, `only ${routedOnce} links routed`)

    for (const later of [morning + MINUTE, morning + 2 * MINUTE, morning + 5 * HOUR, morning + 14 * HOUR + 59 * MINUTE]) {
      const next = cache.get({ frame, model, showAll: false, collapsed, nowMs: later, offsetAt: UTC })

      assert.equal(next, first, `a new layout at +${(later - morning) / MINUTE} min`)
      assert.equal(next.positions, first.positions)
      assert.equal(next.shown, first.shown)
      view.render(model, next)
    }

    assert.equal(frame.calls, 1, 'the layout was recomputed on a tick')
    assert.equal(cache.computed, 1)
    assert.equal(view.routed, routedOnce, 'the router ran again on a tick')
    // A collapsed set with the same lanes (a new Set object) is the same input.
    assert.equal(cache.get({ frame, model, showAll: false, collapsed: new Set(), nowMs: morning + 3 * MINUTE, offsetAt: UTC }), first)
  })

  it('the now marker follows the live clock without a new layout (the same piecewise mapping)', () => {
    const frame = countingFrame()
    const cache = createFrameCache()
    const layout = cache.get({ frame, model, showAll: false, collapsed, nowMs: morning, offsetAt: UTC }) as SwimFrameLayout

    assert.equal(swimNowX(layout, morning), layout.nowX)
    assert.ok(Math.abs(swimNowX(layout, morning + HOUR) - (layout.nowX + DAY_WIDTH / 24)) < 1e-9)
    // A fresh layout at that instant puts the marker at the same x.
    const fresh = layoutSwimlanes({ model, showAll: false, collapsed, nowMs: morning + HOUR, offsetAt: UTC })

    assert.ok(Math.abs(swimNowX(layout, morning + HOUR) - fresh.nowX) < 1e-9)
    // Never past today's column (a new day recomputes the layout instead).
    assert.ok(swimNowX(layout, morning + 30 * HOUR) <= layout.window.right)
    assert.equal(frame.calls, 1)
  })

  it('a change across local midnight recomputes (once); so does a new offset at now (DST) and a real input change', () => {
    const frame = countingFrame()
    const cache = createFrameCache()
    const late = Date.UTC(2026, 10, 10, 23, 59, 0)
    const before = cache.get({ frame, model, showAll: false, collapsed, nowMs: late, offsetAt: UTC }) as SwimFrameLayout
    const after = cache.get({ frame, model, showAll: false, collapsed, nowMs: late + 2 * MINUTE, offsetAt: UTC }) as SwimFrameLayout

    assert.notEqual(after, before)
    assert.equal(after.window.today, before.window.today + 1)
    assert.equal(frame.calls, 2)
    assert.equal(cache.get({ frame, model, showAll: false, collapsed, nowMs: late + 3 * MINUTE, offsetAt: UTC }), after, 'recomputed twice for one new day')

    // The offset at now changes (a DST switch at 06:00 UTC, the same local day).
    const dst: OffsetAt = ms => (ms < Date.UTC(2026, 10, 11, 6, 0, 0) ? -240 : -300)
    const atFive = cache.get({ frame, model, showAll: false, collapsed, nowMs: Date.UTC(2026, 10, 11, 5, 0, 0), offsetAt: dst })
    const atSeven = cache.get({ frame, model, showAll: false, collapsed, nowMs: Date.UTC(2026, 10, 11, 7, 0, 0), offsetAt: dst })

    assert.deepEqual(clockKey(Date.UTC(2026, 10, 11, 5, 0, 0), dst).day, clockKey(Date.UTC(2026, 10, 11, 7, 0, 0), dst).day)
    assert.notEqual(atSeven, atFive)
    assert.equal(frame.calls, 4)

    // Show all, the collapsed lanes and the model are inputs too.
    const showAll = cache.get({ frame, model, showAll: true, collapsed, nowMs: Date.UTC(2026, 10, 11, 7, 1, 0), offsetAt: dst })

    assert.notEqual(showAll, atSeven)
    assert.ok(showAll.shown.size > atSeven.shown.size)
    assert.equal(frame.calls, 5)
    const lane = (showAll as SwimFrameLayout).lanes[0].key

    assert.notEqual(cache.get({ frame, model, showAll: true, collapsed: new Set([lane]), nowMs: Date.UTC(2026, 10, 11, 7, 2, 0), offsetAt: dst }), showAll)
    assert.equal(frame.calls, 6)
  })

  it('a recompute with identical results reuses the previous positions map and shown set, so the canvas does not re-route for them', () => {
    const frame = countingFrame()
    const cache = createFrameCache()
    const first = cache.get({ frame, model, showAll: false, collapsed, nowMs: morning, offsetAt: UTC })
    // The same rows again: a new model object (as after a refetch without structural sharing).
    const again = buildGraph(fixture.rows, fixture.projects, { profile: 'default', showArchived: false, scope: ALL_PROJECTS })
    const second = cache.get({ frame, model: again, showAll: false, collapsed, nowMs: morning + MINUTE, offsetAt: UTC })

    assert.equal(frame.calls, 2)
    assert.notEqual(second, first)
    assert.equal(second.positions, first.positions, 'equal positions, new map')
    assert.equal(second.shown, first.shown, 'equal shown set, new set')

    // A change that moves a block gives a new map.
    const moved = buildGraph(
      fixture.rows.map(row => (row.id === 'st-hp-root' ? { ...row, started_at: (row.started_at ?? 0) - 3600 } : row)),
      fixture.projects,
      { profile: 'default', showArchived: false, scope: ALL_PROJECTS }
    )
    const third = cache.get({ frame, model: moved, showAll: false, collapsed, nowMs: morning + 2 * MINUTE, offsetAt: UTC })

    assert.notEqual(third.positions, first.positions)
  })

  it('control (the ddb396b behaviour): computing on every tick gives a new positions map and re-routes every link', () => {
    const frame = countingFrame()
    const view = canvas()
    const a = frame.compute({ model, showAll: false, collapsed, nowMs: morning, offsetAt: UTC })

    view.render(model, a)
    const once = view.routed
    const b = frame.compute({ model, showAll: false, collapsed, nowMs: morning + MINUTE, offsetAt: UTC })

    view.render(model, b)
    assert.notEqual(b.positions, a.positions)
    assert.equal(view.routed, 2 * once)
  })
})
