import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { ALL_PROJECTS, buildGraph } from '../../src/model/graph.ts'
import type { GraphModel } from '../../src/model/graph.ts'
import { LayoutMemory } from '../../src/model/layout-memory.ts'
import { GROUP_PREFIX, laidOutFamilies, layoutGraph, mergeLayout, overlaps, rectOf } from '../../src/model/layout.ts'
import type { LayoutSpec, Point } from '../../src/model/layout.ts'
import { denseLayoutSpec } from '../../src/styles/dense/spec.ts'
import { loadFixture, row } from './fixtures.ts'

const spec = (showAll = false): LayoutSpec => denseLayoutSpec({ showAll })
const options = { profile: 'default', showArchived: false, scope: ALL_PROJECTS }

function assertNoOverlap(model: GraphModel, positions: ReadonlyMap<string, Point>, layoutSpec: LayoutSpec): number {
  const shown = new Set(laidOutFamilies(model, layoutSpec).flatMap(family => family.nodeIds))
  const rects = [...positions]
    .filter(([id]) => shown.has(id) || id.startsWith(GROUP_PREFIX))
    .map(([id, point]) => ({ id, rect: rectOf(id, point, layoutSpec) }))

  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) {
      assert.ok(!overlaps(rects[i].rect, rects[j].rect), `${rects[i].id} overlaps ${rects[j].id}`)
    }
  }

  return rects.length
}

describe('layoutGraph (tidy tree, Dense: left to right)', () => {
  const fixture = loadFixture('default')
  const model = buildGraph(fixture.rows, fixture.projects, options)

  it('places every branched node, and singles only with Show all', () => {
    const branched = laidOutFamilies(model, spec()).flatMap(family => family.nodeIds)
    const positions = layoutGraph(model, spec()).positions

    assert.ok(branched.every(id => positions.has(id)))
    assert.ok(model.singles.every(node => !positions.has(node.id)))

    const all = layoutGraph(model, spec(true)).positions

    assert.ok(model.nodes.every(node => all.has(node.id)))
  })

  it('puts children one column right of their parent, depth by depth', () => {
    const { positions } = layoutGraph(model, spec())
    const column = spec().nodeWidth + spec().columnGap

    assert.equal(positions.get('st-sys-comments')!.x, positions.get('st-sys-tip')!.x + column)
    assert.equal(positions.get('st-sys-reply')!.x, positions.get('st-sys-comments')!.x + column)
  })

  it('stacks a "continued as" successor under its predecessor, same column', () => {
    const { positions } = layoutGraph(model, spec())

    assert.equal(positions.get('st-md-v2')!.x, positions.get('st-md-tip')!.x)
    assert.ok(positions.get('st-md-v2')!.y > positions.get('st-md-redline')!.y)
  })

  it('orders siblings by creation time (top to bottom)', () => {
    const { positions } = layoutGraph(model, spec())
    const kids = model.childrenOf.get('st-sys-tip')!
    const created = kids.map(id => model.nodeById.get(id)!.createdAt)

    assert.deepEqual(created, [...created].sort((a, b) => a - b))
    const ys = kids.map(id => positions.get(id)!.y)

    assert.deepEqual(ys, [...ys].sort((a, b) => a - b))
    assert.ok(ys[0] < ys[ys.length - 1])
  })

  it('centres a parent on its children', () => {
    const { positions } = layoutGraph(model, spec())
    const kids = model.childrenOf.get('st-hp-root')!.map(id => positions.get(id)!.y)

    assert.equal(positions.get('st-hp-root')!.y, (kids[0] + kids[kids.length - 1]) / 2)
  })

  it('groups families by project under a label each', () => {
    const { labels, positions } = layoutGraph(model, spec())
    const sysLabel = labels.find(label => label.projectId && fixture.projects.find(p => p.id === label.projectId)?.label === 'syscanvas')!

    assert.ok(sysLabel)
    assert.ok(positions.get(sysLabel.id)!.y < positions.get('st-sys-tip')!.y)
    assert.equal(new Set(labels.map(label => label.id)).size, labels.length)
  })

  it('never overlaps two rectangles (blocks and labels), with and without singles', () => {
    assertNoOverlap(model, layoutGraph(model, spec()).positions, spec())
    assertNoOverlap(model, layoutGraph(model, spec(true)).positions, spec(true))
  })

  it('is deterministic', () => {
    assert.deepEqual([...layoutGraph(model, spec(true)).positions], [...layoutGraph(model, spec(true)).positions])
    const again = buildGraph([...fixture.rows].reverse(), fixture.projects, options)

    assert.deepEqual(
      [...layoutGraph(again, spec(true)).positions].sort(([a], [b]) => a.localeCompare(b)),
      [...layoutGraph(model, spec(true)).positions].sort(([a], [b]) => a.localeCompare(b))
    )
  })

  it('survives a lineage cycle', () => {
    const cyclic = buildGraph([row('a', { _branched_from: 'b' }), row('b', { _branched_from: 'a' })], [], options)

    assert.equal(layoutGraph(cyclic, spec()).positions.size >= 2, true)
  })
})

describe('the 500-session scale fixture', () => {
  const fixture = loadFixture('scale')
  const model = buildGraph(fixture.rows, fixture.projects, { ...options, profile: 'scale' })

  it('builds and lays out 500 sessions quickly, without overlap', () => {
    assert.equal(model.nodes.filter(node => node.kind === 'session').length, 500)
    const started = performance.now()
    const all = layoutGraph(model, spec(true))
    const ms = performance.now() - started

    assert.ok(ms < 1000, `layout took ${ms} ms`)
    assert.ok(model.nodes.every(node => all.positions.has(node.id)))
    assert.ok(assertNoOverlap(model, all.positions, spec(true)) >= 500)
    assertNoOverlap(model, layoutGraph(model, spec()).positions, spec())
  })
})

describe('mergeLayout (new sessions never move placed blocks)', () => {
  const base = [row('p', { started_at: 1 }), row('a', { _branched_from: 'p', started_at: 2 }), row('b', { _branched_from: 'p', started_at: 3 })]
  const first = buildGraph(base, [], options)
  const placed = layoutGraph(first, spec()).positions
  // The user dragged `b` somewhere else.
  const dragged = new Map(placed).set('b', { x: 600, y: 300 })

  it('keeps every existing position and places a new branch next to its parent, without overlap', () => {
    const next = buildGraph([...base, row('c', { _branched_from: 'p', started_at: 4 })], [], options)
    const merged = mergeLayout(dragged, next, spec()).positions

    for (const [id, point] of dragged) {
      assert.deepEqual(merged.get(id), point, `${id} moved`)
    }

    const c = merged.get('c')!

    assert.equal(c.x, dragged.get('p')!.x + spec().nodeWidth + spec().columnGap)
    assertNoOverlap(next, merged, spec())
  })

  it('appends a whole new family below everything already placed', () => {
    const next = buildGraph([...base, row('q', { started_at: 5 }), row('q1', { _branched_from: 'q', started_at: 6 })], [], options)
    const merged = mergeLayout(dragged, next, spec()).positions
    const bottom = Math.max(...[...dragged.values()].map(point => point.y))

    assert.ok(merged.get('q')!.y > bottom)
    assertNoOverlap(next, merged, spec())
  })

  it('a fresh layout when nothing is placed yet', () => {
    assert.deepEqual([...mergeLayout(undefined, first, spec()).positions], [...placed])
  })
})

describe('LayoutMemory', () => {
  it('remembers what it placed, applies drops, forgets on reset', () => {
    const memory = new LayoutMemory()
    const model = buildGraph([row('p'), row('k', { _branched_from: 'p' })], [], options)
    const place = () => memory.place('dense|default|all', previous => mergeLayout(previous, model, spec()))
    const first = place()

    assert.deepEqual([...place().positions], [...first.positions])
    memory.move('dense|default|all', new Map([['k', { x: 999, y: 999 }]]))
    assert.deepEqual(place().positions.get('k'), { x: 999, y: 999 })
    memory.reset('dense|default|all')
    assert.deepEqual(place().positions.get('k'), first.positions.get('k'))
  })
})
