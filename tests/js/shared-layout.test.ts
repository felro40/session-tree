/**
 * Card 10: one shared layout per style. The auto-layout of a project scope equals All's, byte
 * for byte, in Dense, Subway and Rich (A4); what a scoped Re-arrange resets (A5); the camera of a
 * scope (A9: `viewport.v2`, the first visit frames the project); Layout history labels (A8); the
 * Re-arrange confirm text (review t_5e9be878 N4); what an Undo puts back (review t_5e9be878 N1).
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { scopeFrameIds, viewOnArrival } from '../../src/model/camera.ts'
import { DevicePrefs, LEGACY_VIEWPORT_KEY, VIEWPORT_KEY, viewportKey } from '../../src/model/device-prefs.ts'
import { ALL_PROJECTS, buildGraph, layoutKeysOf } from '../../src/model/graph.ts'
import type { GraphModel } from '../../src/model/graph.ts'
import { GROUP_PREFIX, groupKey, mergeLayout } from '../../src/model/layout.ts'
import type { LayoutResult, LayoutSpec, Point } from '../../src/model/layout.ts'
import { projectReset, scopeGroupKey } from '../../src/model/project-rearrange.ts'
import { NO_PROJECT_ID } from '../../src/model/projects.ts'
import { blockProjects, undoPositions, undoProject } from '../../src/model/layout-undo.ts'
import { backupLabel, rearrangeText, REMOVED_PROJECT } from '../../src/page/history-labels.ts'
import { denseLayoutSpec } from '../../src/styles/dense/spec.ts'
import { layoutRich } from '../../src/styles/rich/layout.ts'
import { richLayoutSpec } from '../../src/styles/rich/spec.ts'
import { layoutSubway } from '../../src/styles/subway/layout.ts'
import { subwayLayoutSpec } from '../../src/styles/subway/spec.ts'
import { loadFixture } from './fixtures.ts'
import type { Fixture } from './fixtures.ts'

type Layout = (model: GraphModel, previous: ReadonlyMap<string, Point> | undefined, spec: LayoutSpec) => LayoutResult

const STYLES: { id: string; layout: Layout; spec: (showAll: boolean) => LayoutSpec }[] = [
  { id: 'dense', layout: (model, previous, spec) => mergeLayout(previous, model, spec), spec: showAll => denseLayoutSpec({ showAll }) },
  { id: 'subway', layout: layoutSubway, spec: showAll => subwayLayoutSpec({ showAll }) },
  { id: 'rich', layout: layoutRich, spec: showAll => richLayoutSpec({ showAll }) }
]

const FIXTURES: [string, Fixture, string][] = [
  ['default', loadFixture('default'), 'default'],
  ['scale', loadFixture('scale'), 'scale']
]

const graph = (fixture: Fixture, profile: string, scope: string) => buildGraph(fixture.rows, fixture.projects, { profile, showArchived: false, scope })

/** Every scope the toolbar offers: All, each project with a session, and the no-project group. */
function scopesOf(model: GraphModel): string[] {
  return [ALL_PROJECTS, ...new Set(model.nodes.map(node => node.projectId ?? NO_PROJECT_ID))]
}

const bytes = (result: LayoutResult) => JSON.stringify({ positions: [...result.positions], labels: result.labels })

describe('card 10 (A4): a project scope lays out exactly like All projects', () => {
  for (const style of STYLES) {
    for (const [name, fixture, profile] of FIXTURES) {
      for (const showAll of [false, true]) {
        it(`${style.id}, ${name} fixture, Show all ${showAll ? 'on' : 'off'}: the fresh auto-layout of every scope is byte-identical to All's`, () => {
          const spec = style.spec(showAll)
          const all = graph(fixture, profile, ALL_PROJECTS)
          const expected = bytes(style.layout(all, undefined, spec))
          const scopes = scopesOf(all)

          assert.ok(scopes.length > 2, 'the fixture has projects to scope to')

          for (const scope of scopes) {
            assert.equal(bytes(style.layout(graph(fixture, profile, scope), undefined, spec)), expected, `scope ${scope}`)
          }
        })
      }
    }

    it(`${style.id}: merging new sessions into a stored layout places them the same in every scope`, () => {
      const [, fixture, profile] = FIXTURES[0]
      const spec = style.spec(false)
      const all = graph(fixture, profile, ALL_PROJECTS)
      const full = style.layout(all, undefined, spec).positions
      // Half the blocks are stored (the rest are "new sessions"), the stored ones moved about.
      const previous = new Map([...full].filter((_entry, index) => index % 2 === 0).map(([id, point]) => [id, { x: point.x + 37, y: point.y + 11 }]))
      const expected = bytes(style.layout(all, previous, spec))

      for (const scope of scopesOf(all)) {
        assert.equal(bytes(style.layout(graph(fixture, profile, scope), previous, spec)), expected, `scope ${scope}`)
      }
    })
  }
})

describe('card 10 (A5): what a Re-arrange in a project scope resets', () => {
  const fixture = loadFixture('default')
  const spec = denseLayoutSpec({ showAll: false })

  it('the project\u2019s undimmed blocks and its group labels (continuations too), at their fresh spots; nothing of another project', () => {
    const all = graph(fixture, 'default', ALL_PROJECTS)
    const project = all.nodes.find(node => node.projectId)!.projectId!
    const model = graph(fixture, 'default', project)
    const keys = layoutKeysOf(model)
    const fresh = mergeLayout(undefined, model, spec)
    const group = groupKey(project)
    const stored = new Map<string, Point>([...fresh.positions].map(([id, point]) => [id.startsWith(GROUP_PREFIX) ? id : keys.toStore(id), point]))

    stored.set(`${group}\u001f1`, { x: 0, y: 9000 })
    stored.set('group:other', { x: 0, y: 9500 })
    const reset = projectReset(model, project, fresh, stored, keys)
    const own = model.nodes.filter(node => !node.outOfScope).map(node => keys.toStore(node.id))
    const others = model.nodes.filter(node => node.outOfScope).map(node => keys.toStore(node.id))

    assert.ok(own.length > 0 && others.length > 0)
    assert.deepEqual(new Set(reset.keys), new Set([...own, group, `${group}\u001f1`]))
    assert.ok(others.every(key => !reset.keys.includes(key)))
    // A continuation label is not placed by a fresh layout: it is forgotten (no spot).
    assert.equal(reset.spots.has(`${group}\u001f1`), false)
    for (const [key, point] of reset.spots) {
      assert.deepEqual(point, stored.get(key))
    }
    assert.equal(reset.blocks, model.nodes.filter(node => !node.outOfScope && fresh.positions.has(node.id)).length)
  })

  it('the no-project scope resets the no-project group label', () => {
    assert.equal(scopeGroupKey(NO_PROJECT_ID), groupKey(undefined))
    assert.equal(scopeGroupKey('/repos/a'), 'group:/repos/a')
  })
})

describe('card 10 (A9): the camera of a scope', () => {
  const fixture = loadFixture('default')
  const spec = denseLayoutSpec({ showAll: false })
  const all = graph(fixture, 'default', ALL_PROJECTS)
  const project = all.nodes.find(node => node.projectId)!.projectId!
  const model = graph(fixture, 'default', project)
  const positions = mergeLayout(undefined, model, spec).positions
  const size = { width: spec.nodeWidth, height: spec.nodeHeight }
  const pane = { width: 800, height: 600 }

  it('a project scope frames its own blocks on the canvas; All projects frames everything', () => {
    const ids = scopeFrameIds(model, spec, project)!

    assert.ok(ids.length > 0)
    assert.ok(ids.every(id => model.nodeById.get(id)?.outOfScope === false))
    assert.equal(scopeFrameIds(all, spec, ALL_PROJECTS), undefined)
    // A scope with nothing on the canvas frames everything.
    assert.equal(scopeFrameIds(graph(fixture, 'default', '/nowhere'), spec, '/nowhere'), undefined)
  })

  it('the first visit (no remembered view) frames; a remembered view showing the project comes back; one showing none of it is framed', () => {
    const ids = scopeFrameIds(model, spec, project)!
    const first = positions.get(ids[0])!

    assert.equal(viewOnArrival(undefined, ids, positions, size, pane), 'fit')
    const onIt = { x: -first.x + 10, y: -first.y + 10, zoom: 1 }

    assert.deepEqual(viewOnArrival(onIt, ids, positions, size, pane), onIt)
    assert.equal(viewOnArrival({ x: 1e6, y: 1e6, zoom: 1 }, ids, positions, size, pane), 'fit')
    // Showing only other projects' blocks is not enough in a project scope.
    const otherId = [...positions.keys()].find(id => model.nodeById.get(id)?.outOfScope && ids.every(own => {
      const a = positions.get(own)!
      const b = positions.get(id)!

      return Math.abs(a.y - b.y) > 2000 || Math.abs(a.x - b.x) > 2000
    }))

    if (otherId) {
      const other = positions.get(otherId)!

      assert.equal(viewOnArrival({ x: -other.x, y: -other.y, zoom: 2.5 }, ids, positions, size, { width: 100, height: 60 }), 'fit')
    }
  })

  it('viewport.v1 entries are never read, and are removed when their key is looked at or named', () => {
    const data = new Map<string, string>()
    const storage = {
      get<T>(key: string, fallback: T): T {
        const raw = data.get(key)

        return raw === undefined ? fallback : (JSON.parse(raw) as T)
      },
      set(key: string, value: unknown) {
        data.set(key, JSON.stringify(value))
      },
      remove(key: string) {
        data.delete(key)
      }
    }
    const key = viewportKey('dense', 'default', project)
    const named = viewportKey('subway', 'default', ALL_PROJECTS)

    assert.equal(VIEWPORT_KEY, 'viewport.v2')
    storage.set(`${LEGACY_VIEWPORT_KEY}:${key}`, { x: 1, y: 2, zoom: 1 })
    storage.set(`${LEGACY_VIEWPORT_KEY}:${named}`, { x: 3, y: 4, zoom: 1 })
    const prefs = new DevicePrefs(storage)

    assert.equal(prefs.viewport(key), undefined, 'a v1 view is not restored: the first visit frames')
    assert.equal(data.has(`${LEGACY_VIEWPORT_KEY}:${key}`), false)
    prefs.forgetLegacyViewports([named])
    assert.equal(data.has(`${LEGACY_VIEWPORT_KEY}:${named}`), false)
    prefs.setViewport(key, { x: 5, y: 6, zoom: 1.5 })
    assert.deepEqual(JSON.parse(data.get(`${VIEWPORT_KEY}:${key}`)!), { x: 5, y: 6, zoom: 1.5 })
    assert.deepEqual(new DevicePrefs(storage).viewport(key), { x: 5, y: 6, zoom: 1.5 })
  })
})

describe('card 10 (A8): Layout history labels', () => {
  const labels = new Map([['/repos/a', 'alpha']])
  const label = (id: string) => labels.get(id)

  it('says what each entry was taken before', () => {
    assert.equal(backupLabel({ reason: 'rearrange', project: null }, label), 'Before Re-arrange · All projects')
    assert.equal(backupLabel({ reason: 'rearrange' }, label), 'Before Re-arrange · All projects')
    assert.equal(backupLabel({ reason: 'rearrange', project: '/repos/a' }, label), 'Before Re-arrange · alpha')
    assert.equal(backupLabel({ reason: 'rearrange', project: '/repos/gone' }, label), `Before Re-arrange · ${REMOVED_PROJECT}`)
    assert.equal(backupLabel({ reason: 'restore', project: null }, label), 'Before a restore')
  })
})

describe('review t_5e9be878 N4: the Re-arrange confirm text', () => {
  const kept = 'The current arrangement is kept in Layout history, so you can bring it back.'

  it('a project scope: 0 (nothing to re-arrange, no confirm), 1 (singular) and N blocks', () => {
    assert.deepEqual(rearrangeText('Dense', { label: 'mdesign', count: 0 }), {
      text: 'No block of mdesign is on the canvas, so there is nothing to re-arrange.',
      canConfirm: false
    })
    assert.deepEqual(rearrangeText('Dense', { label: 'mdesign', count: 1 }), {
      text: `The 1 block of mdesign goes back to its automatic spot; other projects stay where they are. ${kept}`,
      canConfirm: true
    })
    assert.deepEqual(rearrangeText('Dense', { label: 'mdesign', count: 7 }), {
      text: `The 7 blocks of mdesign go back to their automatic spots; other projects stay where they are. ${kept}`,
      canConfirm: true
    })
  })

  it('All projects: unchanged', () => {
    assert.deepEqual(rearrangeText('Dense + inspector · All projects'), {
      text: `Every block in Dense + inspector · All projects goes back to the automatic layout. ${kept}`,
      canConfirm: true
    })
  })

  it('the count is the project\u2019s blocks the fresh layout places (Show all off: no singles), labels aside', () => {
    const fixture = loadFixture('default')
    const model = graph(fixture, 'default', '/e2e/projects/mdesign')
    const fresh = mergeLayout(undefined, model, denseLayoutSpec({ showAll: false }))
    const reset = projectReset(model, '/e2e/projects/mdesign', fresh, new Map(), layoutKeysOf(model))
    const own = [...fresh.positions.keys()].filter(id => !id.startsWith(GROUP_PREFIX) && model.nodeById.get(id)?.outOfScope === false)

    assert.equal(reset.blocks, own.length)
    assert.ok(reset.blocks > 0 && reset.blocks < model.nodes.filter(node => !node.outOfScope).length, 'the singles are not counted')
  })
})

describe('review t_5e9be878 N1: an Undo skips blocks moved to another project since', () => {
  const fixture = loadFixture('default')
  const MDESIGN = '/e2e/projects/mdesign'
  const SYSCANVAS = '/e2e/projects/syscanvas'
  /** The fixture after "Move to project": `id` belongs to `to` (the tree's `sessionIds` and its cwd). */
  const moved = (id: string, to: string): Fixture => ({
    rows: fixture.rows.map(row => (row.id === id ? { ...row, cwd: to, git_repo_root: to } : row)),
    projects: fixture.projects.map(project => ({
      ...project,
      sessionIds: project.id === to ? [...project.sessionIds, id] : project.sessionIds.filter(sid => sid !== id)
    }))
  })

  it('blockProjects: every block by layout key, the no-project group named', () => {
    const projects = blockProjects(graph(fixture, 'default', ALL_PROJECTS))

    assert.equal(projects.get('st-split-child'), MDESIGN)
    assert.equal(projects.get('st-split-root'), SYSCANVAS)
    assert.equal(projects.get('st-orphan-child'), NO_PROJECT_ID)
  })

  it('a moved block is skipped; every other entry (group labels too) comes back exactly', () => {
    const then = blockProjects(graph(fixture, 'default', MDESIGN))
    const now = blockProjects(graph(moved('st-split-child', SYSCANVAS), 'default', MDESIGN))
    const previous = new Map<string, Point>([
      ['st-split-child', { x: 295.76, y: 229.82 }],
      ['st-md-katex', { x: 10.25, y: -3.5 }],
      [groupKey(MDESIGN), { x: 0, y: 40 }],
      [`${groupKey(MDESIGN)}\u001f1`, { x: 0, y: 900 }],
      ['st-gone', { x: 7, y: 7 }]
    ])
    const undo = undoPositions(previous, then, now)

    assert.equal(now.get('st-split-child'), SYSCANVAS)
    assert.deepEqual([...undo], [...previous].filter(([key]) => key !== 'st-split-child'))
    // Nothing moved: everything comes back.
    assert.deepEqual([...undoPositions(previous, then, then)], [...previous])
  })

  it('the project Undo: a moved block gets neither an entry nor a remove', () => {
    const then = blockProjects(graph(fixture, 'default', MDESIGN))
    const now = blockProjects(graph(moved('st-split-child', SYSCANVAS), 'default', MDESIGN))
    const undo = undoProject(
      { project: MDESIGN, previous: new Map([['st-split-child', { x: 1, y: 2 }], ['st-md-katex', { x: 3, y: 4 }]]), touched: ['st-split-child', 'st-md-katex', 'st-md-redline', groupKey(MDESIGN)] },
      then,
      now
    )

    assert.deepEqual(undo, { project: MDESIGN, previous: new Map([['st-md-katex', { x: 3, y: 4 }]]), touched: ['st-md-katex', 'st-md-redline', groupKey(MDESIGN)] })
  })
})
