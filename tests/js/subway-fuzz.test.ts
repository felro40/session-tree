/**
 * Card 7 fix r1 (review r1 finding 3): a Subway track never runs through its own end stations or
 * their labels — after a reversed drag (the child above or left of its parent), or after a later
 * `/new` re-slots a station's branch links onto its bottom port.
 *
 * Through the production routing chain (`createCanvasRouting` + `octilinearRouter` + the Subway
 * ports and slots), with the labels placed as the Subway layer places them (`placeLabels` over the
 * shown stations, the project labels blocked). Started from the reviewer's probes
 * (`c7-reviewer-shots/fuzz-subway.ts`, `reslot.ts`); the link ends come from the chain's own
 * `links` (the reviewer's probe split the edge id on ':' and so misread the stand-in's links).
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { ALL_PROJECTS, buildGraph } from '../../src/model/graph.ts'
import type { GraphModel } from '../../src/model/graph.ts'
import { GROUP_PREFIX, LABEL_WIDTH } from '../../src/model/layout.ts'
import type { Point, Rect } from '../../src/model/layout.ts'
import { insideRect, octilinearRouter, samplePath } from '../../src/model/route.ts'
import type { Path } from '../../src/model/route.ts'
import type { SessionRow } from '../../src/model/sessions.ts'
import { createCanvasRouting } from '../../src/page/canvas-routing.ts'
import type { CanvasRouting, Routing } from '../../src/page/canvas-routing.ts'
import { labelRect, placeLabels } from '../../src/styles/subway/labels.ts'
import type { PlacedLabel } from '../../src/styles/subway/labels.ts'
import { layoutSubway } from '../../src/styles/subway/layout.ts'
import { subwaySlots } from '../../src/styles/subway/plan.ts'
import { GROUP_LABEL_H, LABEL_SPOTS, STATION_H, STATION_W, subwayLayoutSpec, subwayPorts } from '../../src/styles/subway/spec.ts'
import { loadFixture, row } from './fixtures.ts'

const fixture = loadFixture('default')
const graph = (rows: readonly SessionRow[]): GraphModel => buildGraph(rows, fixture.projects, { profile: 'default', showArchived: false, scope: ALL_PROJECTS })
const spec = subwayLayoutSpec({ showAll: false })
const model = graph(fixture.rows)
const base = layoutSubway(model, undefined, spec).positions

function routeAll(m: GraphModel, positions: ReadonlyMap<string, Point>, chain: CanvasRouting = createCanvasRouting()): Routing {
  return chain.get({ model: m, spec, positions, ports: subwayPorts, router: octilinearRouter, slots: subwaySlots })
}

/** The labels as the Subway layer places them (layer.tsx `useLabelDriver`). */
function labelsOf(positions: ReadonlyMap<string, Point>, shown: ReadonlySet<string>): Map<string, PlacedLabel> {
  const stations = new Map<string, Point>()
  const blocked: Rect[] = []

  for (const [id, point] of positions) {
    if (id.startsWith(GROUP_PREFIX)) {
      blocked.push({ x: point.x, y: point.y, width: LABEL_WIDTH, height: GROUP_LABEL_H })
    } else if (shown.has(id)) {
      stations.set(id, point)
    }
  }

  return placeLabels(stations, blocked)
}

function offOctilinear(a: Point, b: Point): number {
  const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI

  return Math.abs(angle - Math.round(angle / 45) * 45)
}

function segmentsOf(path: Path): [Point, Point][] {
  const out: [Point, Point][] = []
  let from = path.start

  for (const seg of path.segs) {
    assert.equal(seg.kind, 'L', 'a Subway route has a curve in it')
    out.push([from, seg.to])
    from = seg.to
  }

  return out
}

interface Problems {
  offOctilinear: string[]
  /** Tracks through one of their own two stations. */
  throughOwnStation: string[]
  /** Tracks through an own end's label at its first-choice spot (above: where every auto-layout
   *  label is, and the room the router keeps clear). */
  throughOwnLabel: string[]
  /** Tracks through an own end's label that the label placement moved off its first-choice spot
   *  after the drop (below, beside…): the placement avoids stations and labels, not tracks
   *  (docs/subway.md § Limits). Counted, pinned below. */
  throughOwnMovedLabel: string[]
  /** Tracks through another station (each counted once). */
  throughOther: string[]
  /** Through another station only because the dropped station sits on (covers) that track's end. */
  throughDroppedOnEnd: string[]
}

const emptyProblems = (): Problems => ({ offOctilinear: [], throughOwnStation: [], throughOwnLabel: [], throughOwnMovedLabel: [], throughOther: [], throughDroppedOnEnd: [] })

/** Every routed track of `routing`, checked (each track at most once per kind); `dropped` is the station just moved, if any. */
function inspect(routing: Routing, positions: ReadonlyMap<string, Point>, problems: Problems, tag: string, dropped?: string): void {
  const labels = labelsOf(positions, routing.shown)

  for (const link of routing.links) {
    const routed = routing.routes.get(link.id)

    if (!routed) {
      continue
    }

    const path = routed.route.path
    const samples = samplePath(path)
    const what = `${tag} ${link.id} ${routed.route.svg}`

    if (segmentsOf(path).some(([a, b]) => offOctilinear(a, b) > 0.5)) {
      problems.offOctilinear.push(what)
    }

    // Own ends: inside the box by more than 0.5 px (a track touches its stations at the ports,
    // on the edge), or inside an own end's label.
    const ownStations = [link.source, link.target].filter(end => samples.some(q => insideRect(q, routing.rects.get(end)!, 0.5)))
    const ownLabels = [link.source, link.target].filter(end => {
      const label = labels.get(end)

      return label && samples.some(q => insideRect(q, label.rect, 0.5))
    })
    const firstSpot = ownLabels.filter(end => labels.get(end)!.spot === 'above')
    const moved = ownLabels.filter(end => labels.get(end)!.spot !== 'above')

    if (ownStations.length > 0) {
      problems.throughOwnStation.push(`${what} (through ${ownStations.join(', ')})`)
    }

    if (firstSpot.length > 0) {
      problems.throughOwnLabel.push(`${what} (through the label of ${firstSpot.join(', ')})`)
    }

    if (moved.length > 0) {
      problems.throughOwnMovedLabel.push(`${what} (through the label of ${moved.map(end => `${end} (${labels.get(end)!.spot})`).join(', ')})`)
    }

    const others: string[] = []
    let onEnd = true

    for (const [id, rect] of routing.rects) {
      if (id === link.source || id === link.target || !samples.some(q => insideRect(q, rect, 0.5))) {
        continue
      }

      // The dropped station covers this track's end (closer than the track's 12 px clearance to a
      // port): no route can leave or enter there without touching it.
      const ends = [link.source, link.target].map(end => routing.rects.get(end)!)

      others.push(id)
      onEnd &&= id === dropped && ends.some(end => rect.x < end.x + end.width + 12 && end.x - 12 < rect.x + rect.width && rect.y < end.y + end.height + 12 && end.y - 12 < rect.y + rect.height)
    }

    if (others.length > 0) {
      ;(onEnd ? problems.throughDroppedOnEnd : problems.throughOther).push(`${what} (through ${others.join(', ')})`)
    }
  }
}

describe('Subway: tracks never run through their own ends (review r1 finding 3)', () => {
  const orig = routeAll(model, base)

  it('the auto-layout is clean (and is what the other Subway tests pin byte for byte)', () => {
    const problems = emptyProblems()

    inspect(orig, base, problems, 'auto')
    assert.deepEqual(problems, emptyProblems())
    assert.ok([...orig.routes.values()].every(each => !each.route.detoured), 'an auto-layout track detours')
  })

  it('the reviewer\'s repro: st-sys-pairing dragged above-left of st-sys-tip goes down out of the split, round, and into the station from the left', () => {
    const tip = base.get('st-sys-tip')!
    const at = { x: tip.x - 123.65, y: tip.y - 147.11 }
    const moved = new Map(base).set('st-sys-pairing', at)
    const chain = createCanvasRouting()

    routeAll(model, base, chain)
    const routing = routeAll(model, moved, chain)
    const link = routing.links.find(each => each.source === 'st-sys-tip' && each.target === 'st-sys-pairing')!
    const routed = routing.routes.get(link.id)!
    const problems = emptyProblems()

    // ff5475c drew `M28 120 L28 -12.11 L3 -37.11 L-123.65 -37.11` here (tip at 0,100): straight up
    // through the ×3 capsule, its label and the group label, then across the pairing ring.
    assert.equal(tip.x, 0)
    assert.equal(tip.y, 100)
    assert.notEqual(routed.route.svg, 'M28 120 L28 -12.11 L3 -37.11 L-123.65 -37.11')
    inspect(routing, moved, problems, 'repro', 'st-sys-pairing')
    assert.deepEqual(problems, emptyProblems(), JSON.stringify(problems, null, 1))
    const first = routed.route.path.segs[0].to

    assert.ok(first.y > routed.route.path.start.y && Math.abs(first.x - routed.route.path.start.x) < 1e-9, `the split does not leave downwards: ${routed.route.svg}`)
    // Dragging back gives the auto-layout's tracks again.
    const back = routeAll(model, new Map(base), chain)

    for (const [id, each] of orig.routes) {
      assert.equal(back.routes.get(id)?.route.svg, each.route.svg, id)
    }
  })

  it('a later /new on a station with branch children re-slots them; the re-slotted split does not run through its own parent', () => {
    const parent = fixture.rows.find(each => each.id === 'st-hp-root')!
    const next = row('st-rv-next', { ...parent, id: 'st-rv-next', _reset_from: 'st-hp-root', _branched_from: undefined, parent_session_id: undefined, _lineage_root_id: undefined, title: 'Next day', started_at: (parent.last_active ?? 0) + 100, last_active: (parent.last_active ?? 0) + 200 })
    const m1 = graph([...fixture.rows, next])
    const l1 = layoutSubway(m1, base, spec).positions
    const before = orig.links.find(each => each.source === 'st-hp-root' && each.target === 'st-hp-routing')!
    const after = routeAll(m1, l1)
    const link = after.links.find(each => each.source === 'st-hp-root' && each.target === 'st-hp-routing')!
    const problems = emptyProblems()

    assert.equal(before.slot, 0)
    assert.equal(link.slot, 1, 'the successor no longer takes slot 0 (the case this test is about is gone)')
    assert.equal(l1.get('st-hp-routing'), base.get('st-hp-routing'), 'a placed station moved')
    inspect(after, l1, problems, 'reslot')
    assert.deepEqual(problems, emptyProblems(), JSON.stringify(problems, null, 1))
  })

  it('a seeded fuzz of 400+ drops (random, next to a neighbour, onto a track): octilinear, never through its own ends or labels, never through another station, and dragging back restores every route', t => {
    const stations = [...orig.shown].filter(id => base.has(id)).sort()
    let seed = 7
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
    const xs = stations.map(id => base.get(id)!.x)
    const ys = stations.map(id => base.get(id)!.y)
    const box = { x0: Math.min(...xs) - 100, x1: Math.max(...xs) + 100, y0: Math.min(...ys) - 100, y1: Math.max(...ys) + 100 }
    const routes = [...orig.routes.values()]
    const problems = emptyProblems()
    let drops = 0
    let skipped = 0
    let backMismatch = 0

    for (const id of stations) {
      for (let k = 0; k < 30; k += 1) {
        const mode = k % 3 === 0 ? 'random' : k % 3 === 1 ? 'near-neighbour' : 'on-track'
        let at: Point

        if (mode === 'random') {
          at = { x: box.x0 + rnd() * (box.x1 - box.x0), y: box.y0 + rnd() * (box.y1 - box.y0) }
        } else if (mode === 'near-neighbour') {
          const n = base.get(stations[Math.floor(rnd() * stations.length)])!
          const gap = 4 + rnd() * 3
          const side = Math.floor(rnd() * 4)

          at = side === 0 ? { x: n.x + STATION_W + gap, y: n.y } : side === 1 ? { x: n.x - STATION_W - gap, y: n.y } : side === 2 ? { x: n.x, y: n.y + STATION_H + gap } : { x: n.x, y: n.y - STATION_H - gap }
        } else {
          const samples = samplePath(routes[Math.floor(rnd() * routes.length)].route.path)
          const q = samples[Math.floor(rnd() * samples.length)]

          at = { x: q.x - STATION_W / 2, y: q.y - STATION_H / 2 }
        }

        // A drop onto another station is a different question (the reviewer's probe skipped it too).
        if (stations.some(other => other !== id && Math.abs(base.get(other)!.x - at.x) < STATION_W + 2 && Math.abs(base.get(other)!.y - at.y) < STATION_H + 2)) {
          skipped += 1
          continue
        }

        const chain = createCanvasRouting()

        routeAll(model, base, chain)
        const moved = new Map(base).set(id, at)

        drops += 1
        inspect(routeAll(model, moved, chain), moved, problems, `${mode} ${id}@${at.x.toFixed(2)},${at.y.toFixed(2)}`, id)
        const back = routeAll(model, new Map(base), chain)

        if ([...orig.routes].some(([lid, each]) => back.routes.get(lid)?.route.svg !== each.route.svg)) {
          backMismatch += 1
        }
      }
    }

    const counts = Object.fromEntries(Object.entries(problems).map(([key, list]) => [key, list.length]))

    t.diagnostic(`subway fuzz: ${JSON.stringify({ drops, skipped, backMismatch, ...counts })}`)
    if (process.env.ST_FUZZ_DUMP) {
      console.log(JSON.stringify(problems, null, 1))
    }
    assert.ok(drops >= 400, `${drops} drops`)
    assert.equal(backMismatch, 0)
    assert.deepEqual(problems.offOctilinear, [])
    assert.deepEqual(problems.throughOwnStation, [], problems.throughOwnStation.slice(0, 5).join('\n'))
    assert.deepEqual(problems.throughOwnLabel, [], problems.throughOwnLabel.slice(0, 5).join('\n'))
    assert.deepEqual(problems.throughOther, [], problems.throughOther.slice(0, 5).join('\n'))
    // ff5475c on this fuzz: 108 tracks through an own station, 207 through an own label at its
    // first-choice spot, 111 through a moved own label, 1 through another station. The moved-label
    // cases are the label placement's (it avoids stations and labels, not tracks): a ratchet,
    // listed in docs/subway.md § Limits.
    assert.ok(problems.throughOwnMovedLabel.length <= 167, `${problems.throughOwnMovedLabel.length} tracks through a moved own label`)
  })

  it('the room kept clear for a station\'s label is the label\'s first-choice spot (LABEL_SPOTS[0], above)', () => {
    const station = { x: 100, y: 200, width: STATION_W, height: STATION_H }
    const above = labelRect({ x: station.x, y: station.y }, 'above')

    assert.equal(LABEL_SPOTS[0].key, 'above')
    // A track from a station to a target straight above-right would climb through that room; the
    // router goes round it instead (and through no part of it).
    const target = { x: 400, y: 0, width: STATION_W, height: STATION_H }
    const routed = octilinearRouter.route({ from: { x: 140, y: 210, dir: 'right' }, to: { x: 400, y: 10, dir: 'left' }, obstacles: [], ends: [station, target] })

    assert.ok(!samplePath(routed.path).some(q => insideRect(q, above, 0.5)), routed.svg)
    assert.ok(routed.detoured)
    // The plain shape (out 30 px, climb, run in) would have climbed through it.
    assert.ok(samplePath(octilinearRouter.route({ from: { x: 140, y: 210, dir: 'right' }, to: { x: 400, y: 10, dir: 'left' }, obstacles: [] }).path).some(q => insideRect(q, above, 0.5)))
    assert.deepEqual(above, { x: 102, y: 150, width: 168, height: 46 })
  })
})
