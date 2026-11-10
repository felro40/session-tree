/**
 * B1-r2 (card-5 review r2): the canvas's routing chain (`src/page/canvas-routing.ts`, the object
 * `graph-canvas.tsx` asks for its shown set, rectangles and routes on every render) keys on the
 * structural link ends and the rectangles, never on the model object. A refetch that changes only
 * block content routes nothing; a structural change routes once; Dense still re-routes on drop.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { ALL_PROJECTS, buildGraph } from '../../src/model/graph.ts'
import type { GraphModel } from '../../src/model/graph.ts'
import { layoutGraph } from '../../src/model/layout.ts'
import type { Point } from '../../src/model/layout.ts'
import { curveRouter, orthogonalRouter } from '../../src/model/route.ts'
import type { LinkRouter } from '../../src/model/route.ts'
import type { SessionRow } from '../../src/model/sessions.ts'
import { createCanvasRouting } from '../../src/page/canvas-routing.ts'
import { createFrameCache } from '../../src/page/frame-cache.ts'
import type { OffsetAt } from '../../src/page/frame-cache.ts'
import { densePorts, denseLayoutSpec } from '../../src/styles/dense/spec.ts'
import { fitSwimlanes, layoutSwimlanes } from '../../src/styles/swimlanes/layout.ts'
import { swimLayoutSpec, swimPorts } from '../../src/styles/swimlanes/spec.ts'
import type { FrameLayout, StyleFrame } from '../../src/styles/types.ts'
import { loadFixture } from './fixtures.ts'

const UTC: OffsetAt = () => 0
const MINUTE = 60_000

/** A router of the given shape that counts its `route` calls (one per link on drop). */
function counting(base: LinkRouter): LinkRouter & { calls: number } {
  const router = {
    calls: 0,
    shape: base.shape,
    live: base.live,
    route(input: Parameters<LinkRouter['route']>[0]) {
      router.calls += 1

      return base.route(input)
    }
  }

  return router
}

/** The Swimlanes frame without its React layers (the page's `frame.compute`). */
const swimFrame: StyleFrame = {
  compute(input) {
    const layout = layoutSwimlanes(input)

    return Object.assign(layout, { fit: (width: number, height: number, minZoom: number) => fitSwimlanes(layout, width, height, minZoom) }) as FrameLayout
  },
  extraNodes: () => [],
  Under: () => null,
  Over: () => null
}

const fixture = loadFixture('default')
const graph = (rows: SessionRow[]): GraphModel => buildGraph(rows, fixture.projects, { profile: 'default', showArchived: false, scope: ALL_PROJECTS })
const morning = Date.UTC(2026, 10, 10, 9, 0, 0)

describe('canvas routing chain (B1-r2: no re-route on a content-only refetch)', () => {
  for (const showAll of [false, true]) {
    it(`Swimlanes, Show all ${showAll ? 'on' : 'off'}: a new model with one changed message_count, last_active and tokens makes 0 router calls and keeps routes ===; the new count reaches the block`, () => {
      const spec = swimLayoutSpec({ showAll })
      const cache = createFrameCache()
      const routing = createCanvasRouting()
      const router = counting(orthogonalRouter)
      const collapsed = new Set<string>()
      const view = (model: GraphModel, nowMs: number) => {
        const layout = cache.get({ frame: swimFrame, model, showAll, collapsed, nowMs, offsetAt: UTC })

        return routing.get({ model, spec, frameShown: layout.shown, positions: layout.positions, ports: swimPorts, router })
      }
      const first = view(graph(fixture.rows), morning)
      const routedOnce = router.calls

      assert.ok(first.routes.size > 5, `only ${first.routes.size} links`)
      assert.ok(routedOnce >= first.routes.size)
      assert.equal(routing.routed, 1)

      // One chat turn elsewhere: a refetch gives new row objects and a new model.
      const target = fixture.rows.find(row => row.id === 'st-hp-root')!
      const bumped = fixture.rows.map(row =>
        row.id === target.id
          ? { ...row, message_count: (row.message_count ?? 0) + 2, last_active: (row.last_active ?? 0) + 30, input_tokens: (row.input_tokens ?? 0) + 500, output_tokens: (row.output_tokens ?? 0) + 120 }
          : { ...row }
      )
      const model = graph(bumped)
      const second = view(model, morning + MINUTE)

      assert.equal(router.calls, routedOnce, 'the router ran on a content-only refetch')
      assert.equal(routing.routed, 1)
      assert.equal(second.routes, first.routes)
      assert.equal(second.links, first.links)
      assert.equal(second.rects, first.rects)
      assert.equal(second.shown, first.shown)
      // The canvas draws each block from the model it is given (`data.node`): the new count.
      assert.equal(model.nodeById.get(target.id)?.row?.message_count, (target.message_count ?? 0) + 2)
      assert.ok(second.shown.has(target.id))
    })
  }

  it('Swimlanes: a structural change (a new /branch child) routes again, once', () => {
    const spec = swimLayoutSpec({ showAll: false })
    const cache = createFrameCache()
    const routing = createCanvasRouting()
    const router = counting(orthogonalRouter)
    const collapsed = new Set<string>()
    const view = (model: GraphModel, nowMs: number) => {
      const layout = cache.get({ frame: swimFrame, model, showAll: false, collapsed, nowMs, offsetAt: UTC })

      return routing.get({ model, spec, frameShown: layout.shown, positions: layout.positions, ports: swimPorts, router })
    }
    const first = view(graph(fixture.rows), morning)
    const parent = fixture.rows.find(row => row.id === 'st-hp-root')!
    const child: SessionRow = {
      ...parent,
      id: 'st-hp-new-child',
      title: 'New branch',
      _branched_from: parent.id,
      parent_session_id: parent.id,
      started_at: (parent.started_at ?? 0) + 600,
      last_active: (parent.started_at ?? 0) + 900
    }
    const rows = [...fixture.rows, child]
    const second = view(graph(rows), morning + MINUTE)

    assert.equal(routing.routed, 2)
    assert.notEqual(second.routes, first.routes)
    assert.ok(second.links.some(link => link.target === child.id && link.source === parent.id))
    // The same rows again: nothing more.
    view(graph(rows.map(row => ({ ...row }))), morning + 2 * MINUTE)
    assert.equal(routing.routed, 2)
  })

  it('Dense: a content-only refetch keeps its routes; a drop (a moved block) re-routes once, against the new rectangles', () => {
    const spec = denseLayoutSpec({ showAll: false })
    const routing = createCanvasRouting()
    const router = counting(curveRouter)
    const model = graph(fixture.rows)
    const positions = layoutGraph(model, spec).positions
    const first = routing.get({ model, spec, positions, ports: densePorts, router })

    assert.ok(first.routes.size > 5)
    assert.equal(routing.routed, 1)

    // A refetch: a new model and an equal (new) positions map, as the page's place() gives.
    const again = graph(fixture.rows.map(row => (row.id === 'st-hp-root' ? { ...row, message_count: (row.message_count ?? 0) + 2 } : { ...row })))
    const second = routing.get({ model: again, spec, positions: new Map(positions), ports: densePorts, router })

    assert.equal(routing.routed, 1)
    assert.equal(second.routes, first.routes)

    // A drop: the dragged block's committed position changes (R13: every link re-routed on drop).
    const link = first.links[0]
    const moved = new Map<string, Point>(positions)
    const at = positions.get(link.target)!

    moved.set(link.target, { x: at.x + 160, y: at.y + 48 })
    const calls = router.calls
    const third = routing.get({ model: again, spec, positions: moved, ports: densePorts, router })

    assert.equal(routing.routed, 2)
    assert.ok(router.calls > calls)
    assert.notEqual(third.routes, first.routes)
    assert.notDeepEqual(third.routes.get(link.id)!.to, first.routes.get(link.id)!.to, 'the moved block\'s link end did not follow the drop')
    assert.equal(third.rects.get(link.target)!.x, at.x + 160)
  })
})
