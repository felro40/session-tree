import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { ALL_PROJECTS, buildGraph } from '../../src/model/graph.ts'
import type { GraphModel } from '../../src/model/graph.ts'
import { LayoutMemory } from '../../src/model/layout-memory.ts'
import { GROUP_PREFIX, groupKey, labelGroup, laidOutFamilies, layoutGraph, mergeLayout, overlaps, rectOf } from '../../src/model/layout.ts'
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

  it('places a whole new family in its (here: the only, open) group band, clear of everything', () => {
    const next = buildGraph([...base, row('q', { started_at: 5 }), row('q1', { _branched_from: 'q', started_at: 6 })], [], options)
    const merged = mergeLayout(dragged, next, spec()).positions
    const label = merged.get(groupKey(undefined))!

    for (const [id, point] of dragged) {
      assert.deepEqual(merged.get(id), point, `${id} moved`)
    }

    assert.ok(merged.get('q')!.y >= label.y + spec().labelHeight)
    assert.ok(merged.get('q1')!.y >= label.y + spec().labelHeight)
    assertNoOverlap(next, merged, spec())
  })

  it('a fresh layout when nothing is placed yet', () => {
    assert.deepEqual([...mergeLayout(undefined, first, spec()).positions], [...placed])
  })
})

describe('mergeLayout on the default fixture (live refresh stays in its project band, B1)', () => {
  const fixture = loadFixture('default')
  const first = buildGraph(fixture.rows, fixture.projects, options)
  const placed = layoutGraph(first, spec()).positions
  const column = spec().nodeWidth + spec().columnGap
  const projectOf = (label: string) => fixture.projects.find(project => project.label === label)!.id

  /** The band of `projectId`'s group: under its label, above the next group's label. */
  const bandOf = (positions: ReadonlyMap<string, Point>, projectId: string | undefined) => {
    const labels = [...positions].filter(([id]) => id.startsWith(GROUP_PREFIX)).sort(([, a], [, b]) => a.y - b.y)
    const index = labels.findIndex(([id]) => id === groupKey(projectId))
    const next = labels[index + 1]

    return { top: labels[index][1].y + spec().labelHeight, bottom: next ? next[1].y : Infinity, nextLabel: next?.[0] }
  }

  const childOf = (parent: string, id = `new-${parent}`, started = 9e9) => {
    const tip = fixture.rows.find(item => item.id === parent)!

    return row(id, { started_at: started, last_active: started, _branched_from: parent, parent_session_id: parent, git_repo_root: tip.git_repo_root, cwd: tip.cwd })
  }

  const assertInBand = (positions: ReadonlyMap<string, Point>, id: string, projectId: string | undefined) => {
    const band = bandOf(positions, projectId)
    const point = positions.get(id)!

    assert.ok(point.y >= band.top, `${id} at y ${point.y} is above its group's band (${band.top})`)
    assert.ok(point.y + spec().nodeHeight <= band.bottom, `${id} at y ${point.y} reaches under the next label ${band.nextLabel} (y ${band.bottom})`)
  }

  const assertKept = (positions: ReadonlyMap<string, Point>) => {
    for (const [id, point] of placed) {
      assert.deepEqual(positions.get(id), point, `${id} moved`)
    }
  }

  it('a new child of st-sys-tip and of st-hp-root each stay in their own band, overlap nothing, move nothing', () => {
    for (const [parent, label] of [['st-sys-tip', 'syscanvas'], ['st-hp-root', 'hermes-plugins']] as const) {
      const child = childOf(parent)
      const next = buildGraph([...fixture.rows, child], fixture.projects, options)
      const merged = mergeLayout(placed, next, spec()).positions

      assert.equal(next.nodeById.get(child.id)!.projectId, projectOf(label))
      assertInBand(merged, child.id, projectOf(label))
      assert.ok(merged.get(child.id)!.x > placed.get(parent)!.x, 'right of its parent')
      assertNoOverlap(next, merged, spec())
      assertKept(merged)
    }
  })

  it('uses the parent\'s column when it has a free row in the band', () => {
    // The no-project group is the lowest: its band is open below.
    const child = childOf('st-orphan-child')
    const next = buildGraph([...fixture.rows, child], fixture.projects, options)
    const merged = mergeLayout(placed, next, spec()).positions

    assert.equal(merged.get(child.id)!.x, placed.get('st-orphan-child')!.x + column)
    assertInBand(merged, child.id, undefined)
    assertNoOverlap(next, merged, spec())
    assertKept(merged)
  })

  it('falls back to the next free column to the right when the parent\'s column is full in the band', () => {
    for (const [parent, label] of [['st-sys-tip', 'syscanvas'], ['st-hp-root', 'hermes-plugins']] as const) {
      const projectId = projectOf(label)
      const band = bandOf(placed, projectId)
      const x = placed.get(parent)!.x + column
      // The parent's column really is full inside the band (every row slot, keeping a row gap
      // to the next label, hits a block).
      const blocks = [...placed].filter(([id]) => !id.startsWith(GROUP_PREFIX)).map(([id, point]) => rectOf(id, point, spec()))

      for (let y = band.top; y + spec().nodeHeight <= band.bottom - spec().rowGap; y += 1) {
        assert.ok(
          blocks.some(rect => overlaps(rect, { x, y: y - spec().rowGap / 2, width: spec().nodeWidth, height: spec().nodeHeight + spec().rowGap })),
          `${label}: row ${y} of the parent's column is free`
        )
      }

      // Two new children: both land further right, inside the band, clear of each other.
      const kids = [childOf(parent, `${parent}-a`, 9e9), childOf(parent, `${parent}-b`, 9e9 + 1)]
      const next = buildGraph([...fixture.rows, ...kids], fixture.projects, options)
      const merged = mergeLayout(placed, next, spec()).positions

      for (const kid of kids) {
        assert.ok(merged.get(kid.id)!.x >= x + column, `${kid.id} is not in a column right of the full one`)
        assertInBand(merged, kid.id, projectId)
      }

      assertNoOverlap(next, merged, spec())
      assertKept(merged)
    }
  })

  it('a brand-new family lands in its own project band; one taller than the band gets a continuation label under everything', () => {
    const tip = fixture.rows.find(item => item.id === 'st-sys-tip')!
    const at = { git_repo_root: tip.git_repo_root, cwd: tip.cwd }
    const small = [row('fam-root', { ...at, started_at: 9e9 }), row('fam-kid', { ...at, started_at: 9e9 + 1, _branched_from: 'fam-root' })]
    const next = buildGraph([...fixture.rows, ...small], fixture.projects, options)
    const merged = mergeLayout(placed, next, spec()).positions

    for (const id of ['fam-root', 'fam-kid']) {
      assertInBand(merged, id, projectOf('syscanvas'))
    }

    assertNoOverlap(next, merged, spec())
    assertKept(merged)

    // Ten children: taller than the syscanvas band (168 px).
    const tall = [row('tall-root', { ...at, started_at: 9e9 }), ...Array.from({ length: 10 }, (_, i) => row(`tall-${i}`, { ...at, started_at: 9e9 + 1 + i, _branched_from: 'tall-root' }))]
    const nextTall = buildGraph([...fixture.rows, ...tall], fixture.projects, options)
    const result = mergeLayout(placed, nextTall, spec())
    const continuation = result.labels.find(item => item.id !== groupKey(projectOf('syscanvas')) && labelGroup(item.id) === groupKey(projectOf('syscanvas')))!
    const bottom = Math.max(...[...placed.values()].map(point => point.y + spec().nodeHeight))

    assert.ok(continuation, 'a continuation label for syscanvas')
    assert.equal(continuation.projectId, projectOf('syscanvas'))
    const labelY = result.positions.get(continuation.id)!.y

    assert.ok(labelY >= bottom)

    for (const item of tall) {
      assert.ok(result.positions.get(item.id)!.y >= labelY + spec().labelHeight, `${item.id} is under its continuation label`)
    }

    assertNoOverlap(nextTall, result.positions, spec())
    assertKept(result.positions)
  })

  it('Show all: new singles land in their own project bands, clear of everything, deterministically', () => {
    const merged = mergeLayout(placed, first, spec(true))

    assertNoOverlap(first, merged.positions, spec(true))
    assertKept(merged.positions)

    for (const single of first.singles) {
      const family = first.families.find(item => item.nodeIds.includes(single.id))!

      if (merged.positions.has(groupKey(family.projectId))) {
        const label = [...merged.positions.keys()].filter(id => labelGroup(id) === groupKey(family.projectId))

        // In its band, or under a continuation label of its own project.
        const inSome = label.some(id => {
          const labels = [...merged.positions].filter(([key]) => key.startsWith(GROUP_PREFIX)).sort(([, a], [, b]) => a.y - b.y)
          const index = labels.findIndex(([key]) => key === id)
          const top = labels[index][1].y + spec().labelHeight
          const bottom = labels[index + 1]?.[1].y ?? Infinity
          const y = merged.positions.get(single.id)!.y

          return y >= top && y + spec().nodeHeight <= bottom
        })

        assert.ok(inSome, `${single.id} is outside its project's band`)
      }
    }

    assert.deepEqual([...mergeLayout(placed, first, spec(true)).positions], [...merged.positions])
  })

  it('Show all on → off → a new child → on: the child never lands on a remembered (hidden) single (card-2 r2 NB1)', () => {
    // The page keeps one memory per layout key across Show all toggles (LayoutMemory.place).
    const memory = new LayoutMemory()
    const key = 'dense|default|all'
    const place = (model: GraphModel, showAll: boolean) => memory.place(key, previous => mergeLayout(previous, model, spec(showAll))).positions

    place(first, false)
    place(first, true) // Show all on: every single gets a remembered spot
    place(first, false) // off again: the singles are hidden, their spots stay remembered
    const child = childOf('st-sys-tip')
    const next = buildGraph([...fixture.rows, child], fixture.projects, options)
    const withChild = place(next, false)
    const childRect = rectOf(child.id, withChild.get(child.id)!, spec())
    const onTop = [...withChild]
      .filter(([id]) => id !== child.id && !id.startsWith(GROUP_PREFIX))
      .filter(([id, point]) => overlaps(rectOf(id, point, spec()), childRect))
      .map(([id]) => id)

    assert.deepEqual(onTop, [], `the new child overlaps remembered blocks ${onTop.join(', ')}`)
    assertInBand(withChild, child.id, projectOf('syscanvas'))
    // Show all on again: everything (the child and every single) is clear of everything.
    assertNoOverlap(next, place(next, true), spec(true))
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

  it('forget drops one block from every layout (a session moved to another project is placed anew)', () => {
    const memory = new LayoutMemory()

    memory.move('dense|default|all', new Map([['a', { x: 1, y: 1 }], ['b', { x: 2, y: 2 }]]))
    memory.move('dense|default|p1', new Map([['a', { x: 3, y: 3 }]]))
    memory.forget('a')
    assert.deepEqual([...memory.get('dense|default|all')!.keys()], ['b'])
    assert.deepEqual([...memory.get('dense|default|p1')!.keys()], [])
  })
})
