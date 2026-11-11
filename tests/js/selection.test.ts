/**
 * Card 9: box selection and moving several blocks at once (`src/model/selection.ts`).
 *
 * - the selection rules: a plain click, Shift toggle, Shift + box adds, Esc, Ctrl/⌘+A, and the
 *   never-selectable blocks (dimmed out-of-scope blocks, "Parent not loaded" stand-ins, singles
 *   that sit in a style's list or drawer rather than on the canvas);
 * - full-containment hit testing (a block the box only partly covers is not selected);
 * - the group offset with and without Snap: spacing is kept, every block lands on the grid;
 * - the drop of N blocks makes one routing pass and one save with N entries;
 * - a live refresh keeps the selection for the blocks still shown.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { ALL_PROJECTS, buildGraph } from '../../src/model/graph.ts'
import type { GraphModel } from '../../src/model/graph.ts'
import { laidOutFamilies, layoutGraph } from '../../src/model/layout.ts'
import type { Point, Rect } from '../../src/model/layout.ts'
import { LayoutSync } from '../../src/model/layout-sync.ts'
import type { SyncTransport } from '../../src/model/layout-sync.ts'
import { curveRouter } from '../../src/model/route.ts'
import {
  EMPTY_SELECTION,
  boxOf,
  canvasSelectable,
  fullyInside,
  groupPositions,
  keepShown,
  reduceSelection,
  selectedSet,
  singleSelected
} from '../../src/model/selection.ts'
import type { Selection, SelectionAction } from '../../src/model/selection.ts'
import { createCanvasRouting } from '../../src/page/canvas-routing.ts'
import { densePorts, denseLayoutSpec } from '../../src/styles/dense/spec.ts'
import { loadFixture } from './fixtures.ts'

const fixture = loadFixture('default')
const graph = (scope = ALL_PROJECTS): GraphModel => buildGraph(fixture.rows, fixture.projects, { profile: 'default', showArchived: false, scope })
const spec = denseLayoutSpec({ showAll: false })
const onCanvas = (model: GraphModel) => new Set(laidOutFamilies(model, spec).flatMap(family => family.nodeIds))
const ALWAYS = () => true

function run(actions: SelectionAction[], selectable: (id: string) => boolean = ALWAYS, start: Selection = EMPTY_SELECTION): Selection {
  return actions.reduce((selection, action) => reduceSelection(selection, action, selectable), start)
}

describe('selection rules (card 9)', () => {
  it('a plain click selects only that block; it becomes the primary', () => {
    const selection = run([{ type: 'only', id: 'a' }, { type: 'only', id: 'b' }])

    assert.deepEqual(selection.ids, ['b'])
    assert.equal(selection.primary, 'b')
    assert.equal(singleSelected(selection), 'b')
  })

  it('Shift+click adds a block, and removes it again', () => {
    const added = run([{ type: 'only', id: 'a' }, { type: 'toggle', id: 'b' }, { type: 'toggle', id: 'c' }])

    assert.deepEqual([...selectedSet(added)].sort(), ['a', 'b', 'c'])
    assert.equal(added.primary, 'c')
    assert.equal(singleSelected(added), null, 'no single block with 3 selected')

    const removed = run([{ type: 'toggle', id: 'b' }], ALWAYS, added)

    assert.deepEqual([...selectedSet(removed)].sort(), ['a', 'c'])
    assert.ok(removed.primary === 'a' || removed.primary === 'c')

    const last = run([{ type: 'toggle', id: 'a' }, { type: 'toggle', id: 'c' }], ALWAYS, removed)

    assert.deepEqual(last, EMPTY_SELECTION)
  })

  it('a box replaces the selection; Shift + a box adds to it', () => {
    const boxed = run([{ type: 'only', id: 'x' }, { type: 'box', ids: ['a', 'b'], additive: false }])

    assert.deepEqual([...selectedSet(boxed)].sort(), ['a', 'b'])

    const added = run([{ type: 'box', ids: ['b', 'c'], additive: true }], ALWAYS, boxed)

    assert.deepEqual([...selectedSet(added)].sort(), ['a', 'b', 'c'])

    const empty = run([{ type: 'box', ids: [], additive: true }], ALWAYS, added)

    assert.deepEqual([...selectedSet(empty)].sort(), ['a', 'b', 'c'], 'an empty Shift box keeps the selection')
    assert.deepEqual(run([{ type: 'box', ids: [], additive: false }], ALWAYS, added), EMPTY_SELECTION)
  })

  it('Esc (clear) empties it', () => {
    assert.deepEqual(run([{ type: 'box', ids: ['a', 'b'], additive: false }, { type: 'clear' }]), EMPTY_SELECTION)
  })

  it('Ctrl/⌘+A selects every editable block shown on the canvas, never a dimmed block, a stand-in or a single', () => {
    const model = graph()
    const shown = onCanvas(model)
    const selectable = (id: string) => canvasSelectable(model, shown, id)
    const all = run([{ type: 'all', ids: [...shown] }], selectable)
    const expected = [...shown].filter(id => {
      const node = model.nodeById.get(id)!

      return node.kind === 'session' && !node.readOnly
    })

    assert.ok(model.nodes.some(node => node.kind === 'standin' && shown.has(node.id)), 'the fixture has a stand-in on the canvas')
    assert.ok(model.singles.length > 0, 'the fixture has singles')
    assert.deepEqual([...selectedSet(all)].sort(), expected.sort())

    for (const node of model.nodes) {
      if (node.kind === 'standin') {
        assert.ok(!selectedSet(all).has(node.id), `stand-in ${node.id} selected`)
      }
    }

    for (const single of model.singles) {
      assert.ok(!selectedSet(all).has(single.id), `single ${single.id} selected`)
    }
  })

  it('in a project scope, neither the box, Shift+click nor Ctrl/⌘+A selects a dimmed block', () => {
    const scoped = fixture.projects.find(project => !project.isNoProject && project.sessionIds.length > 0)!
    const model = graph(scoped.id)
    const shown = onCanvas(model)
    const selectable = (id: string) => canvasSelectable(model, shown, id)
    const dimmed = [...shown].filter(id => model.nodeById.get(id)?.outOfScope)
    const editable = [...shown].filter(id => model.nodeById.get(id)?.kind === 'session' && !model.nodeById.get(id)?.readOnly)

    assert.ok(dimmed.length > 0 && editable.length > 0, `dimmed ${dimmed.length}, editable ${editable.length}`)

    const all = run([{ type: 'all', ids: [...shown] }], selectable)
    const boxed = run([{ type: 'box', ids: [...shown], additive: false }], selectable)
    const toggled = run([{ type: 'toggle', id: dimmed[0] }], selectable)
    const clicked = run([{ type: 'only', id: dimmed[0] }], selectable)

    assert.deepEqual([...selectedSet(all)].sort(), [...editable].sort())
    assert.deepEqual([...selectedSet(boxed)].sort(), [...editable].sort())
    assert.deepEqual(toggled, EMPTY_SELECTION)
    assert.deepEqual(clicked, EMPTY_SELECTION)
  })

  it('a plain click may still select a single from its list (the one-block selection, as before), but Shift+click and boxes never add one', () => {
    const model = graph()
    const shown = onCanvas(model)
    const single = model.singles.find(node => !node.readOnly)!
    const selectable = (id: string) => canvasSelectable(model, shown, id)
    const editable = [...shown].find(id => selectable(id))!

    assert.deepEqual(reduceSelection(EMPTY_SELECTION, { type: 'only', id: single.id }, selectable, (id: string) => !model.nodeById.get(id)?.readOnly).ids, [single.id])
    assert.deepEqual(run([{ type: 'only', id: editable }, { type: 'toggle', id: single.id }], selectable).ids, [editable])
    assert.deepEqual(run([{ type: 'box', ids: [single.id, editable], additive: false }], selectable).ids, [editable])
  })
})

describe('full-containment hit testing (card 9)', () => {
  const rect = (x: number, y: number, width = 100, height = 20): Rect => ({ x, y, width, height })

  it('boxOf normalises any two corners', () => {
    assert.deepEqual(boxOf({ x: 50, y: 80 }, { x: 10, y: 20 }), { x: 10, y: 20, width: 40, height: 60 })
  })

  it('a block fully inside is hit; one the box only partly covers is not', () => {
    const rects = new Map([
      ['inside', rect(10, 10)],
      ['edge', rect(0, 0)],
      ['partial-right', rect(150, 10)],
      ['partial-bottom', rect(10, 190)],
      ['outside', rect(400, 400)]
    ])
    const box = { x: 0, y: 0, width: 200, height: 200 }

    assert.deepEqual(fullyInside(rects, box).sort(), ['edge', 'inside'])
  })

  it('a box smaller than a block hits nothing, even over its middle', () => {
    assert.deepEqual(fullyInside(new Map([['big', rect(0, 0, 300, 300)]]), { x: 100, y: 100, width: 10, height: 10 }), [])
  })
})

describe('the group offset (card 9)', () => {
  const starts = new Map<string, Point>([
    ['grab', { x: 32, y: 48 }],
    ['b', { x: 112, y: 16 }],
    ['c', { x: -64, y: 160 }]
  ])

  const spacing = (positions: ReadonlyMap<string, Point>) =>
    [...positions].map(([id, point]) => [id, point.x - positions.get('grab')!.x, point.y - positions.get('grab')!.y])

  it('without Snap: every block moves by the grabbed block\'s offset, spacing kept', () => {
    const moved = groupPositions(starts, 'grab', { x: 32 + 37.3, y: 48 - 11.6 }, false, 16)
    const want = spacing(starts)

    spacing(moved).forEach(([id, dx, dy], i) => {
      assert.equal(id, want[i][0])
      assert.ok(Math.abs((dx as number) - (want[i][1] as number)) < 1e-9 && Math.abs((dy as number) - (want[i][2] as number)) < 1e-9, `${id} spacing`)
    })

    for (const [id, start] of starts) {
      assert.ok(Math.abs(moved.get(id)!.x - (start.x + 37.3)) < 1e-9 && Math.abs(moved.get(id)!.y - (start.y - 11.6)) < 1e-9, id)
    }
  })

  it('with Snap: the offset comes from the grabbed block\'s snapped spot; spacing kept and every block (starting on the grid) lands on it', () => {
    const moved = groupPositions(starts, 'grab', { x: 32 + 37.3, y: 48 - 11.6 }, true, 16)

    assert.deepEqual(moved.get('grab'), { x: 64, y: 32 })
    assert.deepEqual(spacing(moved), spacing(starts))

    for (const point of moved.values()) {
      assert.ok(point.x % 16 === 0 && point.y % 16 === 0, `${point.x},${point.y} off the grid`)
    }
  })

  it('with Snap, a group that starts off the grid keeps its spacing; the grabbed block lands on the grid', () => {
    const offGrid = new Map<string, Point>([
      ['grab', { x: 3, y: 5 }],
      ['b', { x: 50, y: 41 }]
    ])
    const moved = groupPositions(offGrid, 'grab', { x: 40, y: 40 }, true, 25)

    assert.deepEqual(moved.get('grab'), { x: 50, y: 50 })
    assert.deepEqual(moved.get('b'), { x: 97, y: 86 })
  })

  it('a single block snaps exactly as React Flow\'s snapToGrid did (snapPosition)', () => {
    const moved = groupPositions(new Map([['grab', { x: 7, y: 9 }]]), 'grab', { x: 123.4, y: -18.2 }, true, 20)

    assert.deepEqual(moved.get('grab'), { x: 20 * Math.round(123.4 / 20), y: 20 * Math.round(-18.2 / 20) })
  })
})

describe('the drop of N blocks (card 9)', () => {
  it('makes one routing pass for all moved blocks and one save with N entries', async () => {
    const model = graph()
    const routing = createCanvasRouting()
    const layout = layoutGraph(model, spec)
    const first = routing.get({ model, spec, positions: layout.positions, ports: densePorts, router: curveRouter })
    const before = routing.routed
    const moved = [...first.shown].filter(id => canvasSelectable(model, first.shown, id)).slice(0, 4)
    const next = new Map(layout.positions)

    assert.equal(moved.length, 4)

    for (const id of moved) {
      const point = layout.positions.get(id)!

      next.set(id, { x: point.x + 400, y: point.y + 30 })
    }

    const after = routing.get({ model, spec, positions: next, ports: densePorts, router: curveRouter })

    assert.equal(routing.routed - before, 1, 'one routing pass for the whole group')
    assert.notEqual(after.routes, first.routes)
    assert.equal(routing.get({ model, spec, positions: next, ports: densePorts, router: curveRouter }).routes, after.routes, 'no second pass')

    // One save with N entries: a fake transport counts the requests.
    const calls: string[] = []
    let timer: undefined | (() => void)
    const transport: SyncTransport = {
      async getState() {
        return { schema: 1, epoch: 'e', rev: 0, settings: { style: null, snap: false }, layouts: {} }
      },
      async patchPositions(_profile, body) {
        calls.push(`patch:${body.mode}:${body.positions.length}`)

        return { rev: 1, changed: true }
      },
      async patchSettings() {
        return { rev: 1, changed: true, settings: { style: null, snap: false } }
      },
      async deleteLayout() {
        return { rev: 1, changed: true }
      },
      async putLayout() {
        return { rev: 1, changed: true }
      },
      async forgetBlocks() {
        return { rev: 1, changed: true }
      }
    }
    const store = new Map<string, string>()
    const sync = new LayoutSync(
      transport,
      {
        get: <T,>(key: string, fallback: T): T => (store.has(key) ? (JSON.parse(store.get(key)!) as T) : fallback),
        set: (key: string, value: unknown) => void store.set(key, JSON.stringify(value))
      },
      {
        setTimeout: (fn: () => void) => {
          timer = fn

          return () => (timer = undefined)
        }
      }
    )
    const ref = { profile: 'default', style: 'dense', scope: ALL_PROJECTS }

    sync.watch('default')
    await new Promise(resolve => setTimeout(resolve, 0))
    sync.setDragging(moved)
    sync.drop(ref, new Map(moved.map(id => [id, next.get(id)!])))
    assert.deepEqual(calls, [], 'nothing is sent while dragging')
    sync.setDragging(null)
    timer?.()
    await new Promise(resolve => setTimeout(resolve, 0))
    assert.deepEqual(calls, [`patch:set:${moved.length}`])
    sync.dispose()
  })
})

describe('a live refresh (card 9)', () => {
  it('keeps the selected blocks still shown and drops the others', () => {
    const model = graph()
    const shown = onCanvas(model)
    const ids = [...shown].filter(id => canvasSelectable(model, shown, id)).slice(0, 3)
    const selection = run([{ type: 'box', ids, additive: false }], id => canvasSelectable(model, shown, id))
    const fewer = new Set([...shown].filter(id => id !== ids[1]))
    const kept = keepShown(selection, (id: string) => canvasSelectable(model, fewer, id))

    assert.deepEqual(kept.ids, [ids[0], ids[2]])
    assert.ok(kept.primary === ids[0] || kept.primary === ids[2])
    assert.equal(keepShown(selection, (id: string) => canvasSelectable(model, shown, id)), selection, 'nothing lost: the same object')
  })

  it('a single selection survives as long as its block exists and is editable', () => {
    const selection = run([{ type: 'only', id: 'gone' }])

    assert.deepEqual(keepShown(selection, () => false, () => true), selection)
    assert.deepEqual(keepShown(selection, () => false, () => false), EMPTY_SELECTION)
  })
})
