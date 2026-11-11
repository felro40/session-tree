/**
 * Card 7 (Subway map): the track plan, the metro auto-layout, the octilinear router (live and on
 * drop), the label placement and the merge — through the production routing chain
 * (`createCanvasRouting`) where links are concerned.
 *
 * The layout and router acceptance: in the auto-layout and after every on-drop re-route, every
 * segment is horizontal, vertical or 45° (± 0.5°); no station overlaps another station or a label;
 * no label overlaps a label; the auto-layout has no shared corridors; the output is deterministic.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { ALL_PROJECTS, buildGraph } from '../../src/model/graph.ts'
import type { GraphModel } from '../../src/model/graph.ts'
import { GROUP_PREFIX, LABEL_WIDTH, groupKey, labelGroup, laidOutFamilies, overlaps } from '../../src/model/layout.ts'
import type { GroupLabel, LayoutSpec, Point, Rect } from '../../src/model/layout.ts'
import { chamferPolyline, insideRect, octilinearRouter, samplePath } from '../../src/model/route.ts'
import type { LinkRouter, Path } from '../../src/model/route.ts'
import type { SessionRow } from '../../src/model/sessions.ts'
import { createCanvasRouting } from '../../src/page/canvas-routing.ts'
import type { Routing } from '../../src/page/canvas-routing.ts'
import { labelRect, placeLabels } from '../../src/styles/subway/labels.ts'
import { familyGrid, layoutSubway } from '../../src/styles/subway/layout.ts'
import { subwayPlan, subwaySlots } from '../../src/styles/subway/plan.ts'
import { COLUMN, GROUP_LABEL_H, LABEL_SPOTS, STATION_H, STATION_W, SUBWAY_GRID, splitOffset, subwayLayoutSpec, subwayPorts } from '../../src/styles/subway/spec.ts'
import { loadFixture, row } from './fixtures.ts'

const fixture = loadFixture('default')
const scale = loadFixture('scale')
const graph = (rows: readonly SessionRow[], scope = ALL_PROJECTS): GraphModel => buildGraph(rows, fixture.projects, { profile: 'default', showArchived: false, scope })
const bigGraph = (): GraphModel => buildGraph(scale.rows, scale.projects, { profile: 'scale', showArchived: false, scope: ALL_PROJECTS })

function counting(base: LinkRouter): LinkRouter & { calls: number } {
  const router = { calls: 0, shape: base.shape, live: base.live, route(input: Parameters<LinkRouter['route']>[0]) { router.calls += 1; return base.route(input) } }

  return router
}

/** Every straight segment of a path (a Subway path is straight segments only). */
function segments(path: Path): [Point, Point][] {
  const out: [Point, Point][] = []
  let from = path.start

  for (const seg of path.segs) {
    assert.equal(seg.kind, 'L', 'a Subway route has a curve in it')
    out.push([from, seg.to])
    from = seg.to
  }

  return out
}

/** Degrees off the nearest multiple of 45°. */
function offOctilinear([a, b]: [Point, Point]): number {
  const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI

  return Math.abs(angle - Math.round(angle / 45) * 45)
}

/** Two segments that run along the same line and overlap for more than `eps` px. */
function shareCorridor([a, b]: [Point, Point], [c, d]: [Point, Point], eps = 0.5): boolean {
  const ux = b.x - a.x
  const uy = b.y - a.y
  const len = Math.hypot(ux, uy)

  if (len < 1e-9 || Math.hypot(d.x - c.x, d.y - c.y) < 1e-9) {
    return false
  }

  const cross = (p: Point) => (ux * (p.y - a.y) - uy * (p.x - a.x)) / len

  if (Math.abs(cross(c)) > 0.5 || Math.abs(cross(d)) > 0.5) {
    return false
  }

  const t = (p: Point) => (ux * (p.x - a.x) + uy * (p.y - a.y)) / len
  const lo = Math.max(0, Math.min(t(c), t(d)))
  const hi = Math.min(len, Math.max(t(c), t(d)))

  return hi - lo > eps
}

/** Proper crossing of two segments (not at a shared end). */
function crosses([a, b]: [Point, Point], [c, d]: [Point, Point]): boolean {
  const o = (p: Point, q: Point, r: Point) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)
  const d1 = o(c, d, a)
  const d2 = o(c, d, b)
  const d3 = o(a, b, c)
  const d4 = o(a, b, d)

  return ((d1 > 1e-6 && d2 < -1e-6) || (d1 < -1e-6 && d2 > 1e-6)) && ((d3 > 1e-6 && d4 < -1e-6) || (d3 < -1e-6 && d4 > 1e-6))
}

function route(model: GraphModel, positions: ReadonlyMap<string, Point>, showAll = false, router: LinkRouter = octilinearRouter, routing = createCanvasRouting()): Routing {
  return routing.get({ model, spec: subwayLayoutSpec({ showAll }), positions, ports: subwayPorts, router, slots: subwaySlots })
}

function stationsOf(model: GraphModel, positions: ReadonlyMap<string, Point>): Map<string, Point> {
  return new Map([...positions].filter(([id]) => !id.startsWith(GROUP_PREFIX) && model.nodeById.has(id)))
}

/** The shown stations' groups (`group:<project>`). */
function shownGroups(model: GraphModel, spec: LayoutSpec): Map<string, string> {
  return new Map(laidOutFamilies(model, spec).flatMap(family => family.nodeIds.map(id => [id, groupKey(family.projectId)] as const)))
}

/** The drawn labels whose band (down to the next stored label) holds no shown station of their group. */
function emptyBands(model: GraphModel, positions: ReadonlyMap<string, Point>, labels: readonly GroupLabel[], spec: LayoutSpec): string[] {
  const groups = shownGroups(model, spec)
  const labelYs = [...positions].filter(([id]) => id.startsWith(GROUP_PREFIX)).map(([, point]) => point.y)

  return labels
    .filter(label => {
      const top = positions.get(label.id)!.y
      const bottom = Math.min(Infinity, ...labelYs.filter(y => y > top))

      return ![...groups].some(([id, group]) => group === labelGroup(label.id) && positions.get(id)!.y >= top && positions.get(id)!.y < bottom)
    })
    .map(label => label.id)
}

function groupLabelRects(positions: ReadonlyMap<string, Point>): Rect[] {
  return [...positions].filter(([id]) => id.startsWith(GROUP_PREFIX)).map(([, p]) => ({ x: p.x, y: p.y, width: LABEL_WIDTH, height: GROUP_LABEL_H }))
}

/** The acceptance checks on one laid-out, routed canvas. */
function assertMetro(model: GraphModel, positions: ReadonlyMap<string, Point>, routing: Routing, { corridors = true, crossings = true } = {}) {
  const all: { link: string; seg: [Point, Point] }[] = []

  for (const [id, routed] of routing.routes) {
    for (const seg of segments(routed.route.path)) {
      const off = offOctilinear(seg)

      assert.ok(off <= 0.5, `${id}: a segment ${JSON.stringify(seg)} is ${off.toFixed(2)}° off octilinear`)
      all.push({ link: id, seg })
    }
  }

  if (corridors || crossings) {
    for (let i = 0; i < all.length; i += 1) {
      for (let j = i + 1; j < all.length; j += 1) {
        if (all[i].link === all[j].link) {
          continue
        }

        if (corridors) {
          assert.ok(!shareCorridor(all[i].seg, all[j].seg), `${all[i].link} and ${all[j].link} share a corridor: ${JSON.stringify([all[i].seg, all[j].seg])}`)
        }

        if (crossings) {
          assert.ok(!crosses(all[i].seg, all[j].seg), `${all[i].link} crosses ${all[j].link}`)
        }
      }
    }
  }

  const stations = stationsOf(model, positions)
  const boxes = [...stations].filter(([id]) => routing.shown.has(id)).map(([id, p]) => ({ id, x: p.x, y: p.y, width: STATION_W, height: STATION_H }))
  const labels = placeLabels(new Map([...stations].filter(([id]) => routing.shown.has(id))), groupLabelRects(positions))
  const labelList = [...labels]

  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      assert.ok(!overlaps(boxes[i], boxes[j]), `stations ${boxes[i].id} and ${boxes[j].id} overlap`)
    }

    for (const [id, label] of labelList) {
      assert.ok(!overlaps(boxes[i], label.rect), `station ${boxes[i].id} overlaps ${id}'s label`)
    }
  }

  for (let i = 0; i < labelList.length; i += 1) {
    for (let j = i + 1; j < labelList.length; j += 1) {
      assert.ok(!overlaps(labelList[i][1].rect, labelList[j][1].rect), `labels of ${labelList[i][0]} and ${labelList[j][0]} overlap`)
    }
  }

  return { segments: all.length, labels }
}

describe('Subway track plan', () => {
  const model = graph(fixture.rows)
  const plan = subwayPlan(model)

  it('a station\'s row children are its successors, then its branch children; their slots in that order', () => {
    assert.deepEqual(plan.rowKids.get('st-md-tip'), ['st-md-v2', 'st-md-katex', 'st-md-redline'])
    assert.equal(plan.slots.get('reset:st-md-tip->st-md-v2'), 0)
    assert.equal(plan.slots.get('branch:st-md-tip->st-md-katex'), 1)
    assert.equal(plan.slots.get('branch:st-md-tip->st-md-redline'), 2)
    assert.equal(plan.slots.get('branch:st-sys-tip->st-sys-comments'), 0)
    assert.equal(subwayPlan(model), plan, 'the plan is computed once per model')
  })

  it('tracks: the first branch child continues its parent\'s line; every other child and every successor tree is a new one', () => {
    const track = (id: string) => plan.track.get(id)!.id

    assert.equal(track('st-sys-comments'), track('st-sys-tip'))
    assert.equal(track('st-sys-reply'), track('st-sys-comments'))
    assert.notEqual(track('st-sys-mcp'), track('st-sys-tip'))
    assert.notEqual(track('st-sys-pairing'), track('st-sys-mcp'))
    // A successor is a line of its own (joined by the dotted planned line), so is md-tip's first split.
    assert.notEqual(track('st-md-v2'), track('st-md-tip'))
    assert.notEqual(track('st-md-katex'), track('st-md-tip'))
    // The stand-in starts the line its orphan continues.
    assert.equal(track('st-orphan-child'), track('missing:default/st-orphan-parent'))
  })

  it('the track count is families plus their splits (and successor trees): 11 on the default fixture, independent of the model', () => {
    const families = model.families.filter(family => family.nodeIds.length > 1)
    const branchEdges = model.edges.filter(edge => edge.kind === 'branch').length
    const resetEdges = model.edges.filter(edge => edge.kind === 'reset').length
    // A parent whose first row child is a branch child keeps that child on its line.
    const continuing = [...model.childrenOf.keys()].filter(id => (model.continuedAs.get(id) ?? []).length === 0).length
    const expected = families.length + resetEdges + branchEdges - continuing

    assert.equal(plan.trackCount, expected)
    assert.equal(plan.trackCount, 11)
    assert.equal(new Set(families.flatMap(family => family.nodeIds).map(id => plan.track.get(id)!.id)).size, 11)
  })
})

describe('Subway ports', () => {
  const a = { x: 0, y: 0, width: STATION_W, height: STATION_H }
  const b = { x: 250, y: 300, width: STATION_W, height: STATION_H }

  it('slot 0 leaves the right edge, a split its own spot of the bottom edge; every link enters the left edge', () => {
    assert.deepEqual(subwayPorts('branch', a, b, 0), { from: { x: 40, y: 10, dir: 'right' }, to: { x: 250, y: 310, dir: 'left' } })
    assert.deepEqual(subwayPorts('reset', a, b, 2), { from: { x: 28, y: 20, dir: 'down' }, to: { x: 250, y: 310, dir: 'left' } })
    const xs = [1, 2, 3, 4, 5, 6, 7, 8].map(splitOffset)

    assert.deepEqual(xs.slice(0, 5), [16, 8, 0, -8, -16])
    assert.ok(xs.every((x, i) => i === 0 || x < xs[i - 1]), 'later splits leave further left')
    assert.ok(xs.every(x => Math.abs(x) < STATION_W / 2), 'every split leaves the station\'s own bottom edge')
  })
})

describe('Subway auto-layout (default fixture)', () => {
  const spec = subwayLayoutSpec({ showAll: false })
  const model = graph(fixture.rows)
  const { positions, labels } = layoutSubway(model, undefined, spec)
  const routing = createCanvasRouting()
  const routed = route(model, positions, false, octilinearRouter, routing)

  it('stations sit on the metro grid: depth → column, one track per row; the first row child stays on its parent\'s row', () => {
    for (const [, point] of positions) {
      assert.equal(point.x % SUBWAY_GRID, 0)
      assert.equal(point.y % SUBWAY_GRID, 0)
    }

    const at = (id: string) => positions.get(id)!

    assert.equal(at('st-sys-comments').y, at('st-sys-tip').y)
    assert.equal(at('st-sys-comments').x, at('st-sys-tip').x + COLUMN)
    assert.equal(at('st-sys-reply').y, at('st-sys-tip').y)
    assert.ok(at('st-sys-mcp').y > at('st-sys-tip').y && at('st-sys-pairing').y > at('st-sys-mcp').y)
    assert.equal(at('st-md-v2').y, at('st-md-tip').y, 'a successor continues its predecessor\'s row (the planned line)')
    assert.ok(labels.length >= 3)
  })

  it('every segment is octilinear; no two tracks share a corridor or cross; nothing detours; no station overlaps a station or a label; no labels overlap', () => {
    const { segments: count, labels: placed } = assertMetro(model, positions, routed)

    assert.ok(count > 20, `only ${count} segments`)
    assert.ok([...routed.routes.values()].every(each => !each.route.detoured), 'a link detours in the auto-layout')
    assert.ok([...placed.values()].every(label => label.clear && label.spot === 'above'), 'a label left its place above the station')
    // The splits of one station really do bend (they are not all straight lines).
    assert.ok(segments(routed.routes.get('branch:st-sys-tip->st-sys-pairing')!.route.path).some(seg => offOctilinear(seg) === 0 && Math.abs(seg[1].x - seg[0].x) > 0 && Math.abs(seg[1].y - seg[0].y) > 0), 'no 45° segment')
  })

  it('is deterministic: the same rows in another order give the same positions, slots and routes', () => {
    const reversed = graph([...fixture.rows].reverse())
    const again = layoutSubway(reversed, undefined, spec)

    assert.deepEqual([...again.positions].sort(), [...positions].sort())
    assert.deepEqual([...subwayPlan(reversed).slots].sort(), [...subwayPlan(model).slots].sort())
    const svg = (r: Routing) => [...r.routes].map(([id, each]) => [id, each.route.svg]).sort()

    assert.deepEqual(svg(route(reversed, again.positions)), svg(routed))
  })

  it('a content-only refetch routes nothing (the slots come from the structure)', () => {
    const router = counting(octilinearRouter)
    const chain = createCanvasRouting()
    const first = route(model, positions, false, router, chain)
    const calls = router.calls
    const bumped = graph(fixture.rows.map(each => (each.id === 'st-sys-pairing' ? { ...each, message_count: (each.message_count ?? 0) + 2, last_active: (each.last_active ?? 0) + 60 } : { ...each })))

    assert.equal(route(bumped, positions, false, router, chain).routes, first.routes)
    assert.equal(router.calls, calls)
  })

  it('every family\'s grid: one row per track, rows contiguous', () => {
    const plan = subwayPlan(model)

    for (const family of model.families.filter(each => each.nodeIds.length > 1)) {
      const grid = familyGrid(model, family)
      const tracks = new Set(family.nodeIds.map(id => plan.track.get(id)!.id))
      const rows = new Set([...grid.cells.values()].map(cell => cell.row))

      assert.equal(rows.size, grid.rows)
      assert.ok(grid.rows <= tracks.size, `${family.id}: ${grid.rows} rows for ${tracks.size} tracks`)
    }
  })
})

describe('Subway auto-layout at scale (500 sessions)', () => {
  it('Show all off and on: octilinear, no shared corridors, no overlaps, quickly', () => {
    const model = bigGraph()

    for (const showAll of [false, true]) {
      const started = performance.now()
      const { positions } = layoutSubway(model, undefined, subwayLayoutSpec({ showAll }))
      const routed = route(model, positions, showAll)
      const ms = performance.now() - started

      assert.equal(routed.shown.size, showAll ? 500 : 100)
      assertMetro(model, positions, routed, { corridors: !showAll, crossings: !showAll })
      assert.ok(ms < 3000, `${ms.toFixed(0)} ms`)
    }
  })
})

describe('Subway router (R13)', () => {
  it('live: one straight segment from port to port (the drag)', () => {
    const live = octilinearRouter.live({ x: 0, y: 0, dir: 'down' }, { x: 300, y: 170, dir: 'left' })

    assert.equal(live.path.segs.length, 1)
    assert.deepEqual(live.path.segs[0], { kind: 'L', to: { x: 300, y: 170 } })
    assert.equal(live.svg, 'M0 0 L300 170')
  })

  it('the plain shape: a drop, a 45° cut, a run into the station; a side port runs out, turns, runs in', () => {
    const down = octilinearRouter.route({ from: { x: 36, y: 20, dir: 'down' }, to: { x: 250, y: 310, dir: 'left' }, obstacles: [] })

    assert.deepEqual(down.path.start, { x: 36, y: 20 })
    assert.deepEqual(down.path.segs.map(seg => seg.to), [{ x: 36, y: 285 }, { x: 61, y: 310 }, { x: 250, y: 310 }])
    const side = octilinearRouter.route({ from: { x: 40, y: 10, dir: 'right' }, to: { x: 400, y: 73.3, dir: 'left' }, obstacles: [] })

    assert.ok(segments(side.path).every(seg => offOctilinear(seg) < 1e-6))
    assert.ok(!side.detoured)
  })

  it('chamfered corners are exact 45° cuts, never more than half a segment', () => {
    const path = chamferPolyline([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 100 }, { x: 200, y: 100 }], 25)

    assert.deepEqual(path.segs.map(seg => seg.to), [{ x: 5, y: 0 }, { x: 10, y: 5 }, { x: 10, y: 75 }, { x: 35, y: 100 }, { x: 200, y: 100 }])
  })

  it('a station dropped onto a track makes it detour around it, octilinear; another track that now crosses the station re-routes too', () => {
    const spec = subwayLayoutSpec({ showAll: false })
    const model = graph(fixture.rows)
    const { positions } = layoutSubway(model, undefined, spec)
    const router = counting(octilinearRouter)
    const chain = createCanvasRouting()

    route(model, positions, false, router, chain)
    const tip = positions.get('st-sys-tip')!
    // st-hp-mockup (another family) dropped onto st-sys-tip → st-sys-comments' straight track.
    const blocker = { x: tip.x + COLUMN / 2 - STATION_W / 2, y: tip.y }
    const moved = new Map(positions).set('st-hp-mockup', blocker)
    const after = route(model, moved, false, router, chain)
    const box = { x: blocker.x, y: blocker.y, width: STATION_W, height: STATION_H }
    const trunk = after.routes.get('branch:st-sys-tip->st-sys-comments')!
    // The dropped station's own track (from st-hp-root) runs far across the canvas now.
    const own = after.routes.get('branch:st-hp-root->st-hp-mockup')!

    assert.equal(chain.routed, 2, 'the drop routed once')
    assert.equal(trunk.route.detoured, true, 'the crossed track detours')
    assert.ok(samplePath(trunk.route.path).every(point => !insideRect(point, box, 0.5)), 'the detour enters the dropped station')
    assert.ok([...after.routes.values()].every(each => segments(each.route.path).every(seg => offOctilinear(seg) <= 0.5)), 'a re-routed track is not octilinear')

    for (const [id, each] of after.routes) {
      const others = [...after.rects].filter(([rid]) => rid !== id.split('->')[1] && !id.includes(`:${rid}->`)).map(([, rect]) => rect)

      assert.ok(samplePath(each.route.path).every(point => !others.some(rect => insideRect(point, rect, 0.5))), `${id} crosses a station after the drop`)
    }

    assert.ok(own, 'the dropped station keeps its track')
  })

  it('snapped drops (multiples of the grid) and fractional drops both re-route octilinear', () => {
    const spec = subwayLayoutSpec({ showAll: false })
    const model = graph(fixture.rows)
    const { positions } = layoutSubway(model, undefined, spec)

    for (const shift of [{ x: SUBWAY_GRID * 3, y: SUBWAY_GRID * 2 }, { x: 37.31, y: -12.77 }]) {
      const pairing = positions.get('st-sys-pairing')!
      const moved = new Map(positions).set('st-sys-pairing', { x: pairing.x + shift.x, y: pairing.y + shift.y })

      assertMetro(model, moved, route(model, moved), { corridors: false, crossings: false })
    }
  })
})

describe('Subway labels', () => {
  it('a label that would cover a station or another label moves to the next free spot; the result is deterministic', () => {
    const stations = new Map<string, Point>([
      ['a', { x: 0, y: 100 }],
      ['b', { x: 0, y: 40 }],
      ['c', { x: 60, y: 100 }]
    ])
    const placed = placeLabels(stations)
    const rects = [...placed.values()].map(label => label.rect)

    assert.equal(placed.get('b')!.spot, 'above')
    assert.notEqual(placed.get('a')!.spot, 'above', 'a cannot go above: b is there')
    assert.ok([...placed.values()].every(label => label.clear))

    for (let i = 0; i < rects.length; i += 1) {
      for (let j = i + 1; j < rects.length; j += 1) {
        assert.ok(!overlaps(rects[i], rects[j]))
      }

      for (const point of stations.values()) {
        assert.ok(!overlaps(rects[i], { x: point.x, y: point.y, width: STATION_W, height: STATION_H }))
      }
    }

    assert.deepEqual([...placeLabels(new Map([...stations].reverse()))].sort(), [...placed].sort())
    assert.deepEqual(labelRect({ x: 10, y: 10 }, 'above'), { x: 10 + LABEL_SPOTS[0].x, y: 10 + LABEL_SPOTS[0].y, width: 168, height: 46 })
  })
})

describe('Subway merge (R12)', () => {
  const spec = subwayLayoutSpec({ showAll: false })
  const model = graph(fixture.rows)
  const { positions } = layoutSubway(model, undefined, spec)

  it('keeps every placed station (the same objects); a new split goes right of its parent, under its placed siblings, inside its group', () => {
    const dragged = new Map(positions).set('st-hp-routing', { x: positions.get('st-hp-routing')!.x + 37.3, y: positions.get('st-hp-routing')!.y + 11.7 })
    const parent = fixture.rows.find(each => each.id === 'st-hp-root')!
    const child = row('st-hp-new', { ...parent, id: 'st-hp-new', _branched_from: parent.id, parent_session_id: parent.id, started_at: (parent.started_at ?? 0) + 9000, last_active: (parent.started_at ?? 0) + 9500 })
    const next = graph([...fixture.rows, child])
    const merged = layoutSubway(next, dragged, spec)

    for (const [id, point] of dragged) {
      assert.equal(merged.positions.get(id), point, `${id} moved or was copied`)
    }

    const placed = merged.positions.get('st-hp-new')!
    const p = merged.positions.get('st-hp-root')!

    // Right of its parent; this group's band is full under its last row (the next group's label
    // sits there), so the split takes the nearest free spot inside the band.
    assert.ok(placed.x >= p.x + COLUMN, 'a split goes right of its parent')
    assert.ok(placed.y > p.y, 'a split goes under its parent\'s row')
    // Inside its group's band: under its label, above the next group's label.
    const labels = [...merged.positions].filter(([id]) => id.startsWith(GROUP_PREFIX)).sort(([, a], [, b]) => a.y - b.y)
    const own = labels.findIndex(([id]) => labelGroup(id) === `${GROUP_PREFIX}${next.nodeById.get('st-hp-root')!.projectId}`)
    const nextLabel = labels[own + 1]

    assert.ok(placed.y > labels[own][1].y && (!nextLabel || placed.y + STATION_H < nextLabel[1].y), 'the new station left its group')
    assertMetro(next, merged.positions, route(next, merged.positions), { corridors: false, crossings: false })
  })

  it('Show all after a saved layout without singles: every single placed, inside its group, no overlaps', () => {
    const big = bigGraph()
    const saved = layoutSubway(big, undefined, subwayLayoutSpec({ showAll: false })).positions
    const started = performance.now()
    const merged = layoutSubway(big, saved, subwayLayoutSpec({ showAll: true }))
    const ms = performance.now() - started
    const stations = stationsOf(big, merged.positions)

    assert.equal(stations.size, 500)
    assertMetro(big, merged.positions, route(big, merged.positions, true), { corridors: false, crossings: false })
    assert.ok(ms < 3000, `${ms.toFixed(0)} ms`)
  })

  it('a new family goes to a free spot of its group\'s band in its own grid shape; nothing placed moves', () => {
    const root = row('st-new-root', { title: 'New family', cwd: fixture.rows.find(each => each.id === 'st-hp-root')!.cwd, started_at: 9e9, last_active: 9e9 + 10 })
    const kid = row('st-new-kid', { cwd: root.cwd, _branched_from: 'st-new-root', parent_session_id: 'st-new-root', started_at: 9e9 + 5, last_active: 9e9 + 20 })
    const next = graph([...fixture.rows, root, kid])
    const merged = layoutSubway(next, positions, spec)
    const at = merged.positions.get('st-new-root')!

    assert.equal(merged.positions.get('st-new-kid')!.y, at.y, 'the family keeps its own grid shape')
    assert.equal(merged.positions.get('st-new-kid')!.x, at.x + COLUMN)

    for (const [id, point] of positions) {
      assert.equal(merged.positions.get(id), point, `${id} moved`)
    }

    assertMetro(next, merged.positions, route(next, merged.positions), { corridors: false, crossings: false })
    const labels = [...merged.positions].filter(([id]) => id.startsWith(GROUP_PREFIX)).sort(([, a], [, b]) => a.y - b.y)
    const own = labels.findIndex(([id]) => labelGroup(id) === `${GROUP_PREFIX}${next.nodeById.get('st-new-root')!.projectId}`)

    assert.ok(own >= 0 && at.y > labels[own][1].y && (!labels[own + 1] || at.y + STATION_H < labels[own + 1][1].y), 'the new family left its group')
  })

  // The user's empty map: Show all on a saved layout gave every single that did not fit its
  // group's band a continuation label of its own (400 on this fixture); with Show all off again
  // the singles went back to the depot and the 400 labels stayed, over empty bands.
  it('Show all on a saved layout opens at most one continuation band per group, not one per single (500 sessions)', () => {
    const big = bigGraph()
    const saved = layoutSubway(big, undefined, subwayLayoutSpec({ showAll: false })).positions
    const merged = layoutSubway(big, saved, subwayLayoutSpec({ showAll: true }))
    const continuations = new Map<string, number>()

    for (const id of merged.positions.keys()) {
      if (id.startsWith(GROUP_PREFIX) && labelGroup(id) !== id) {
        continuations.set(labelGroup(id), (continuations.get(labelGroup(id)) ?? 0) + 1)
      }
    }

    assert.ok([...continuations.values()].every(n => n <= 1), `continuation labels per group: ${JSON.stringify(Object.fromEntries(continuations))}`)
    assert.equal(stationsOf(big, merged.positions).size, 500)
    assertMetro(big, merged.positions, route(big, merged.positions, true), { corridors: false, crossings: false })
  })

  it('a label is drawn only over a band that holds a shown station of its group (Show all on, then off)', () => {
    const big = bigGraph()
    const saved = layoutSubway(big, undefined, subwayLayoutSpec({ showAll: false })).positions
    const withAll = layoutSubway(big, saved, subwayLayoutSpec({ showAll: true })).positions
    const back = layoutSubway(big, withAll, subwayLayoutSpec({ showAll: false }))

    assert.deepEqual(emptyBands(big, back.positions, back.labels, subwayLayoutSpec({ showAll: false })), [])
    // The stored spots stay (Show all brings the singles back to them).
    assert.ok([...withAll.keys()].every(id => back.positions.has(id)), 'a stored spot was dropped')
    // Every group with a station on the canvas still has a label.
    const labelled = new Set(back.labels.map(label => labelGroup(label.id)))
    const groups = new Set(shownGroups(big, subwayLayoutSpec({ showAll: false })).values())

    assert.deepEqual([...groups].filter(group => !labelled.has(group)), [])
  })
})
