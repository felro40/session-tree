/**
 * Card 11: a new session from a right-click on the canvas. Which project (`projectAt`, per style,
 * from each style's own laid-out geometry), the name (default, Hermes' title rules), the spot,
 * the kept-on-canvas marker in the graph (an empty marked row shows; a kept single stays on the
 * canvas with Show all off in all four styles, under its layout key after a compaction), the
 * synced marker op, and the create's calls (order, one submit = one create, a refused title).
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  areaAt,
  createAttempts,
  CreateFailure,
  createSession,
  defaultSessionName,
  nameProblem,
  projectAt,
  releaseRuntime,
  sanitizeTitle,
  spotFor
} from '../../src/model/create.ts'
import type { CreateDeps } from '../../src/model/create.ts'
import { ALL_PROFILES, ALL_PROJECTS, buildGraph, isKept, layoutKeysOf } from '../../src/model/graph.ts'
import type { GraphModel } from '../../src/model/graph.ts'
import { laidOutFamilies, labelSpans, mergeLayout } from '../../src/model/layout.ts'
import type { LayoutResult, LayoutSpec, Point } from '../../src/model/layout.ts'
import { LayoutSync } from '../../src/model/layout-sync.ts'
import type { StateAnswer, SyncTransport } from '../../src/model/layout-sync.ts'
import { NO_PROJECT_ID, projectIndex } from '../../src/model/projects.ts'
import { isHiddenRow, keptKey } from '../../src/model/sessions.ts'
import type { SessionRow } from '../../src/model/sessions.ts'
import { canvasAreas, onPanelRect, projectLabelOf } from '../../src/page/canvas-areas.ts'
import { denseLayoutSpec } from '../../src/styles/dense/spec.ts'
import { layoutRich, shelfSegments } from '../../src/styles/rich/layout.ts'
import { richLayoutSpec } from '../../src/styles/rich/spec.ts'
import { layoutSubway } from '../../src/styles/subway/layout.ts'
import { subwayLayoutSpec } from '../../src/styles/subway/spec.ts'

import { layoutSwimlanes, swimAreas } from '../../src/styles/swimlanes/layout.ts'
import type { FrameLayout } from '../../src/styles/types.ts'
import { loadFixture, project, row } from './fixtures.ts'

type Layout = (model: GraphModel, previous: ReadonlyMap<string, Point> | undefined, spec: LayoutSpec) => LayoutResult

const STYLES: { id: string; areas?: 'shelves'; layout: Layout; spec: (showAll: boolean) => LayoutSpec }[] = [
  { id: 'dense', layout: (model, previous, spec) => mergeLayout(previous, model, spec), spec: showAll => denseLayoutSpec({ showAll }) },
  { id: 'subway', layout: layoutSubway, spec: showAll => subwayLayoutSpec({ showAll }) },
  { id: 'rich', areas: 'shelves', layout: layoutRich, spec: showAll => richLayoutSpec({ showAll }) }
]

const fixture = loadFixture('default')
const all = (rows: readonly SessionRow[] = fixture.rows, extra: { kept?: ReadonlySet<string>; scope?: string } = {}) =>
  buildGraph(rows, fixture.projects, { profile: 'default', showArchived: false, scope: extra.scope ?? ALL_PROJECTS, kept: extra.kept })
const projectOfLabel = (id: string) => {
  const key = id.split('\u001f')[0].slice('group:'.length)

  return key || NO_PROJECT_ID
}

function blocksOf(model: GraphModel, layout: LayoutResult, spec: LayoutSpec) {
  const shown = new Set(laidOutFamilies(model, spec).flatMap(family => family.nodeIds))

  return [...layout.positions]
    .filter(([id]) => shown.has(id))
    .map(([id, point]) => ({ projectId: model.nodeById.get(id)?.projectId, rect: { x: point.x, y: point.y, width: spec.nodeWidth, height: spec.nodeHeight } }))
}

describe('projectAt: the project under the cursor, from each style\u2019s own laid-out geometry (D4/D5)', () => {
  for (const style of STYLES) {
    const model = all()
    const spec = style.spec(false)
    const layout = style.layout(model, undefined, spec)
    const areas = canvasAreas({ areas: style.areas }, layout.positions, layout.labels)
    const blocks = blocksOf(model, layout, spec)
    const drawn = layout.labels.map(label => ({ id: label.id, ...layout.positions.get(label.id)! }))

    it(`${style.id}: inside each project's area (just under its label) is that project; at least two areas`, () => {
      assert.ok(drawn.length >= 2, `only ${drawn.length} labels`)

      for (const label of drawn) {
        assert.equal(projectAt({ areas, point: { x: label.x + 10, y: label.y + 5 }, blocks, scope: ALL_PROJECTS }), projectOfLabel(label.id), label.id)
      }
    })

    it(`${style.id}: a block's own spot is in its group's area (a family sits in its root's project group)`, () => {
      const groupOf = new Map(model.families.flatMap(family => family.nodeIds.map(id => [id, family.projectId] as const)))
      const shown = new Set(laidOutFamilies(model, spec).flatMap(family => family.nodeIds))
      let checked = 0

      for (const [id, point] of layout.positions) {
        if (!shown.has(id)) {
          continue
        }

        const at = areaAt(areas, { x: point.x + spec.nodeWidth / 2, y: point.y + spec.nodeHeight / 2 })

        assert.equal(at, groupOf.get(id) ?? NO_PROJECT_ID, id)
        checked += 1
      }

      assert.ok(checked >= 10)
    })

    it(`${style.id}: above the first label there is no area, and the nearest block decides`, () => {
      const top = Math.min(...drawn.map(label => label.y))
      const point = { x: 30, y: top - 400 }
      const nearest = [...blocks].sort((a, b) => Math.hypot(Math.max(a.rect.x - point.x, 0, point.x - a.rect.x - a.rect.width), a.rect.y - point.y) - Math.hypot(Math.max(b.rect.x - point.x, 0, point.x - b.rect.x - b.rect.width), b.rect.y - point.y))[0]

      assert.equal(areaAt(areas, point), undefined)
      assert.equal(projectAt({ areas, point, blocks, scope: ALL_PROJECTS }), nearest.projectId ?? NO_PROJECT_ID)
    })

    it(`${style.id}: a project scope always wins (D4), also over another project's area`, () => {
      const other = drawn.find(label => projectOfLabel(label.id) !== 'st-mdesign' && projectOfLabel(label.id) !== NO_PROJECT_ID)!

      assert.equal(projectAt({ areas, point: { x: other.x + 10, y: other.y + 5 }, blocks, scope: 'scoped-project' }), 'scoped-project')
    })
  }

  it('dense / subway bands: a boundary belongs to the band below; the lowest band reaches on down', () => {
    const spans = labelSpans([
      ['group:a', { x: 0, y: 0 }],
      ['group:b', { x: 0, y: 300 }],
      ['group:a\u001f1', { x: 0, y: 900 }],
      ['group:__no_project__', { x: 0, y: 600 }]
    ])
    const areas = { kind: 'bands' as const, spans }

    assert.equal(areaAt(areas, { x: 5, y: 299.9 }), 'a')
    assert.equal(areaAt(areas, { x: 5, y: 300 }), 'b')
    assert.equal(areaAt(areas, { x: 5000, y: 650 }), NO_PROJECT_ID)
    assert.equal(areaAt(areas, { x: 5, y: 905 }), 'a', 'a continuation label is its group\u2019s')
    assert.equal(areaAt(areas, { x: 5, y: 1e6 }), 'a')
    assert.equal(areaAt(areas, { x: 5, y: -1 }), undefined)
  })

  it('rich shelves: right of the last shelf of a row is that shelf\u2019s; above every shelf is a gap', () => {
    const segments = shelfSegments([
      ['group:a', { x: 0, y: 0 }],
      ['group:b', { x: 700, y: 0 }],
      ['group:c', { x: 0, y: 500 }]
    ])
    const areas = { kind: 'shelves' as const, segments }

    assert.equal(areaAt(areas, { x: 650, y: 100 }), 'a')
    assert.equal(areaAt(areas, { x: 700, y: 100 }), 'b', 'on the boundary')
    assert.equal(areaAt(areas, { x: 99_999, y: 100 }), 'b', 'right of the last shelf')
    assert.equal(areaAt(areas, { x: -300, y: 100 }), 'a', 'the first segment of a row owns the room left of it')
    assert.equal(areaAt(areas, { x: 99_999, y: 800 }), 'c')
    assert.equal(areaAt(areas, { x: 10, y: -20 }), undefined, 'above every label: nobody\u2019s')
  })

  it('swimlanes: the lane under the cursor (its key), a lane boundary belongs to the lower lane, outside every lane none', () => {
    const model = all()
    const layout = Object.assign(layoutSwimlanes({ model, showAll: false, collapsed: new Set(), nowMs: 1_800_000_000_000, tzOffsetMinutes: 0 }), { fit: () => ({ x: 0, y: 0, zoom: 1 }) })
    const frame = { lanes: (each: FrameLayout) => swimAreas(each as unknown as typeof layout) } as unknown as NonNullable<Parameters<typeof canvasAreas>[0]['frame']>
    const areas = canvasAreas({ frame }, layout.positions, layout.labels, layout as FrameLayout)

    assert.equal(areas.kind, 'lanes')
    assert.ok(layout.lanes.length >= 3)

    for (const [index, lane] of layout.lanes.entries()) {
      assert.equal(areaAt(areas, { x: 0, y: lane.top + lane.height / 2 }), lane.key)
      assert.equal(areaAt(areas, { x: 0, y: lane.top }), lane.key, 'its top edge')

      if (index > 0) {
        assert.equal(areaAt(areas, { x: 0, y: lane.top - 0.5 }), layout.lanes[index - 1].key, 'just above: the lane before')
      }
    }

    const last = layout.lanes[layout.lanes.length - 1]

    assert.equal(areaAt(areas, { x: 0, y: last.top + last.height + 5 }), undefined)
    assert.equal(areaAt(areas, { x: 0, y: -5 }), undefined)
    assert.ok(Number.isFinite(swimAreas(layout).nowX))
  })

  it('the nearest block decides outside every area; no block at all: No project', () => {
    const areas = { kind: 'bands' as const, spans: [] }
    const blocks = [
      { projectId: 'far', rect: { x: 1000, y: 0, width: 100, height: 40 } },
      { projectId: 'near', rect: { x: 0, y: 0, width: 100, height: 40 } },
      { projectId: undefined, rect: { x: 0, y: 500, width: 100, height: 40 } }
    ]

    assert.equal(projectAt({ areas, point: { x: 150, y: 20 }, blocks, scope: ALL_PROJECTS }), 'near')
    assert.equal(projectAt({ areas, point: { x: 50, y: 20 }, blocks, scope: ALL_PROJECTS }), 'near', 'inside a block')
    assert.equal(projectAt({ areas, point: { x: 50, y: 520 }, blocks, scope: ALL_PROJECTS }), NO_PROJECT_ID, 'a block with no project')
    assert.equal(projectAt({ areas, point: { x: 50, y: 520 }, blocks: [], scope: ALL_PROJECTS }), NO_PROJECT_ID)
    assert.equal(projectAt({ areas, point: { x: 50, y: 520 }, blocks: [], scope: 'p' }), 'p')
  })

  it('the menu names the project as the canvas does (No project: the bucket\u2019s own label; Swimlanes falls back to Home)', () => {
    const model = all()
    const noProject = fixture.projects.find(each => each.isNoProject)

    assert.equal(projectLabelOf(model, fixture.projects.find(each => !each.isNoProject)!.id, false), fixture.projects.find(each => !each.isNoProject)!.label)
    assert.equal(projectLabelOf(model, NO_PROJECT_ID, true), noProject?.label ?? 'Home')
    const bare = buildGraph([], [], { profile: 'default', showArchived: false, scope: ALL_PROJECTS })

    assert.equal(projectLabelOf(bare, NO_PROJECT_ID, false), 'No project')
    assert.equal(projectLabelOf(bare, NO_PROJECT_ID, true), 'Home')
  })

  it('a pass-through panel (the Subway map key): a point inside a drawn panel\u2019s rect (edges included) is on it; outside, or a panel not drawn (empty rect), is not', () => {
    const key = { left: 900, top: 600, right: 1000, bottom: 680 }

    assert.equal(onPanelRect({ x: 950, y: 640 }, [key]), true)
    assert.equal(onPanelRect({ x: 900, y: 600 }, [key]), true, 'the top-left edge')
    assert.equal(onPanelRect({ x: 1000, y: 680 }, [key]), true, 'the bottom-right edge')
    assert.equal(onPanelRect({ x: 899, y: 640 }, [key]), false, 'just left of it')
    assert.equal(onPanelRect({ x: 950, y: 681 }, [key]), false, 'just below it')
    assert.equal(onPanelRect({ x: 950, y: 640 }, [{ left: 950, top: 640, right: 950, bottom: 640 }]), false, 'a panel not drawn')
    assert.equal(onPanelRect({ x: 950, y: 640 }, []), false)
  })
})

describe('the name (A2, R3a: Hermes\u2019 title rules)', () => {
  const rows = [row('a', { title: 'New session' }), row('b', { title: 'New session 2' }), row('w', { title: 'New session 3', profile: 'work' })]

  it('the default is the first free "New session", "New session 2", … among the loaded rows of that profile', () => {
    assert.equal(defaultSessionName([], 'default'), 'New session')
    assert.equal(defaultSessionName(rows, 'default'), 'New session 3')
    assert.equal(defaultSessionName(rows, 'work'), 'New session')
  })

  it('trimmed and sanitised as Hermes stores it; empty disables Create', () => {
    assert.equal(sanitizeTitle('  My   new\tsession \n'), 'My new session')
    assert.equal(sanitizeTitle('a\u200bb\u0007c'), 'abc')
    assert.deepEqual(nameProblem('   ', rows, 'default'), { kind: 'empty' })
    assert.deepEqual(nameProblem('\u200b', rows, 'default'), { kind: 'empty' })
    assert.equal(nameProblem('  fresh  ', rows, 'default'), null)
  })

  it('at most 100 characters (code points, after the trim)', () => {
    assert.equal(nameProblem('x'.repeat(100), rows, 'default'), null)
    assert.equal(nameProblem(` ${'x'.repeat(100)} `, rows, 'default'), null)
    assert.deepEqual(nameProblem('x'.repeat(101), rows, 'default'), { kind: 'long', length: 101 })
    assert.equal(nameProblem('\u{1F600}'.repeat(100), rows, 'default'), null, 'an emoji is one character')
  })

  it('a name another session of the profile holds is taken, unless that one is an ended, empty, unarchived ghost (it yields)', () => {
    assert.equal(nameProblem('New session', rows, 'default')?.kind, 'taken')
    assert.equal(nameProblem(' New  session ', rows, 'default')?.kind, 'taken', 'compared after the sanitise')
    assert.equal(nameProblem('New session 3', rows, 'default'), null, 'another profile\u2019s')
    assert.equal(nameProblem('new session', rows, 'default'), null, 'case-sensitive, as Hermes')
    const ghost = row('g', { title: 'Ghost', message_count: 0, ended_at: 5 })

    assert.equal(nameProblem('Ghost', [ghost], 'default'), null)
    assert.equal(nameProblem('Ghost', [{ ...ghost, ended_at: null }], 'default')?.kind, 'taken', 'a live empty one holds it')
    assert.equal(nameProblem('Ghost', [{ ...ghost, archived: true }], 'default')?.kind, 'taken', 'an archived one holds it')
  })
})

describe('the spot (A3)', () => {
  it('the block is centred on the click; with Snap its top-left is on the grid', () => {
    assert.deepEqual(spotFor({ x: 500, y: 300 }, { width: 200, height: 60 }, false, 20), { x: 400, y: 270 })
    assert.deepEqual(spotFor({ x: 507, y: 303 }, { width: 200, height: 60 }, true, 20), { x: 400, y: 280 })
    assert.deepEqual(spotFor({ x: 513, y: 291 }, { width: 200, height: 60 }, true, 20), { x: 420, y: 260 })
  })
})

describe('the kept-on-canvas marker in the graph (D3)', () => {
  const empty = row('st-new-empty', { title: 'New session', message_count: 0, ended_at: 10, cwd: '/repos/p1' })
  const kept = new Set([keptKey('default', 'st-new-empty')])

  it('isHiddenRow: a marked empty row shows, an unmarked one stays hidden', () => {
    assert.equal(isHiddenRow(empty), true)
    assert.equal(isHiddenRow(empty, () => true), false)
    assert.equal(isHiddenRow({ ...empty, source: 'cron' }, () => true), true, 'a machine source stays hidden')
    assert.equal(isKept(kept, empty), true)
    assert.equal(isKept(kept, { ...empty, profile: 'work' }), false, 'another profile\u2019s session of that id')
  })

  it('in every style a kept single is on the canvas with Show all off, and not in the singles container', () => {
    const rows = [...fixture.rows, empty]
    const plain = all(rows)
    const marked = all(rows, { kept })

    assert.equal(plain.nodeById.has('st-new-empty'), false)
    assert.equal(marked.nodeById.get('st-new-empty')?.kept, true)
    assert.ok(!marked.singles.some(node => node.id === 'st-new-empty'))
    assert.equal(marked.singles.length, all(fixture.rows).singles.length)

    for (const style of STYLES) {
      const spec = style.spec(false)

      assert.ok(laidOutFamilies(marked, spec).some(family => family.nodeIds.includes('st-new-empty')), style.id)
      assert.ok(style.layout(marked, undefined, spec).positions.has('st-new-empty'), `${style.id}: fresh`)
      const previous = style.layout(all(), undefined, spec).positions

      assert.ok(style.layout(marked, previous, spec).positions.has('st-new-empty'), `${style.id}: merged`)
    }

    const swim = layoutSwimlanes({ model: marked, showAll: false, collapsed: new Set(), nowMs: 1_800_000_000_000, tzOffsetMinutes: 0 })

    assert.ok(swim.shown.has('st-new-empty'), 'swimlanes: on the axis')
    assert.ok(!swim.lanes.some(lane => lane.singleIds.includes('st-new-empty')), 'swimlanes: not in a lane chip')
  })

  it('a kept session keeps its spot under its layout key after a compaction (the marker names the lineage root)', () => {
    const root = row('st-kept-root', { title: 'Kept', started_at: 100, last_active: 200 })
    const tip = row('st-kept-tip', { title: 'Kept', started_at: 300, last_active: 400, _lineage_root_id: 'st-kept-root', _lineage_ids: ['st-kept-root', 'st-kept-tip'], continuation_kind: 'compression', compacted_segments: 1 })
    const marker = new Set([keptKey('default', 'st-kept-root')])
    const before = all([...fixture.rows, root], { kept: marker })
    const after = all([...fixture.rows, tip], { kept: marker })
    const spec = denseLayoutSpec({ showAll: false })
    const keysBefore = layoutKeysOf(before)
    const keysAfter = layoutKeysOf(after)
    const placed = mergeLayout(undefined, before, spec).positions
    const stored = new Map([...placed].map(([id, point]) => [keysBefore.toStore(id), point]))
    const again = mergeLayout(new Map([...stored].map(([key, point]) => [keysAfter.fromStore(key), point])), after, spec)

    assert.equal(after.nodeById.get('st-kept-tip')?.kept, true)
    assert.equal(keysAfter.toStore('st-kept-tip'), 'st-kept-root')
    assert.deepEqual(again.positions.get('st-kept-tip'), placed.get('st-kept-root'))
  })

  it('All profiles: a marker shows the owner\u2019s session there too', () => {
    const work = row('st-work-new', { profile: 'work', message_count: 0, ended_at: 1 })
    const model = buildGraph([work], [], { profile: ALL_PROFILES, showArchived: false, scope: ALL_PROJECTS, kept: new Set([keptKey('work', 'st-work-new')]) })

    assert.equal(model.nodeById.get('st-work-new')?.kept, true)
  })

  it('R4: created without a cwd the row lands in the gateway\u2019s home, which no project holds: No project', () => {
    const projects = [project('p1', []), { ...project(NO_PROJECT_ID, []), isNoProject: true, path: null, repoPaths: [] }]

    assert.equal(projectIndex(projects).projectOf(row('h', { cwd: '/home/u/.cache/e2e/userhome', message_count: 0 })), NO_PROJECT_ID)
    assert.equal(projectIndex(projects).projectOf(row('h', { cwd: '/repos/p1', message_count: 0 })), 'p1', 'with the root as cwd: the cwd fallback (git_repo_root stays NULL)')
  })
})

describe('the marker syncs through LayoutSync (keep op)', () => {
  function transport() {
    const sent: { owner: string; ids: string[] }[] = []
    let kept: Record<string, string[]> = {}
    const t: SyncTransport = {
      getState: async (): Promise<StateAnswer> => ({ schema: 1, epoch: 'e', rev: 1, settings: { style: null, snap: false }, layouts: {}, ...(Object.keys(kept).length ? { kept } : {}) }),
      patchPositions: async () => ({ rev: 1, changed: true }),
      patchSettings: async () => ({ rev: 1, changed: true, settings: { style: null, snap: false } }),
      deleteLayout: async () => ({ rev: 1, changed: true }),
      putLayout: async () => ({ rev: 1, changed: true }),
      putProjectBlocks: async () => ({ rev: 1, changed: true }),
      forgetBlocks: async () => ({ rev: 1, changed: true }),
      keepSessions: async (owner, ids) => {
        sent.push({ owner, ids })
        kept = { ...kept, [owner]: [...new Set([...(kept[owner] ?? []), ...ids])] }

        return { rev: 2, changed: true }
      }
    }

    return { t, sent }
  }

  const storage = () => {
    const data = new Map<string, unknown>()

    return { get: <T,>(key: string, fallback: T) => (data.has(key) ? (data.get(key) as T) : fallback), set: (key: string, value: unknown) => void data.set(key, value) }
  }

  it('a keep shows at once, is sent with its owner profile, and stays after the server answers', async () => {
    const { t, sent } = transport()
    const sync = new LayoutSync(t, storage(), { setTimeout: (fn: () => void) => (queueMicrotask(fn), () => undefined) }, { debounceMs: 0 })

    await sync.refresh('*')
    sync.keep('*', 'work', ['s1'])
    assert.deepEqual([...sync.kept('*')], [keptKey('work', 's1')])
    assert.deepEqual([...sync.kept('default')], [], 'another view does not see this window\u2019s unsent keep')
    await sync.flush()
    assert.deepEqual(sent, [{ owner: 'work', ids: ['s1'] }])
    await sync.refresh('*')
    assert.deepEqual([...sync.kept('*')], [keptKey('work', 's1')])
    sync.dispose()
  })

  it('a transport that predates the marker refuses the keep (400) without breaking the queue', async () => {
    const { t } = transport()
    const refused: string[] = []
    const old = { ...t, keepSessions: undefined }
    const sync = new LayoutSync(old, storage(), { setTimeout: (fn: () => void) => (queueMicrotask(fn), () => undefined) }, { debounceMs: 0, onRefused: (_error, kind) => refused.push(kind) })

    sync.keep('default', 'default', ['s1'])
    sync.setSettings('default', { snap: true })
    await sync.flush()
    assert.deepEqual(refused, ['400'])
    assert.equal(sync.pendingCount, 0)
    sync.dispose()
  })
})

describe('the create (D1 as ruled after P1: create → title → release)', () => {
  function deps(script: Partial<Record<string, (params: Record<string, unknown>) => unknown>> = {}) {
    const calls: { method: string; params: Record<string, unknown> }[] = []
    const removed: string[] = []
    let n = 0
    const d: CreateDeps = {
      request: async <T,>(method: string, params: Record<string, unknown>) => {
        calls.push({ method, params })
        const step = script[method]

        if (step) {
          return (await step(params)) as T
        }

        if (method === 'session.create') {
          return { session_id: 'local-1', stored_session_id: 'local-1', subscription_id: 'sub-1' } as T
        }

        return { ok: true } as T
      },
      mintId: () => `rid-${++n}`,
      removeIfUntouched: async (_profile, id) => {
        removed.push(id)

        return null
      }
    }

    return { d, calls, removed }
  }

  it('the order of the calls: create (fresh request_id, the root as an explicit cwd, never idempotency_key or title) → title → detach', async () => {
    const { d, calls } = deps()
    const outcome = await createSession(d, { profile: 'work', cwd: '/repos/p1', title: 'Plan' })

    assert.deepEqual(outcome, { sessionId: 'local-1', release: 'detach' })
    assert.deepEqual(calls.map(call => call.method), ['session.create', 'session.title', 'session.detach'])
    assert.deepEqual(calls[0].params, { profile: 'work', cwd: '/repos/p1', cwd_explicit: true, source: 'desktop', request_id: 'rid-1' })
    assert.ok(!('idempotency_key' in calls[0].params) && !('title' in calls[0].params))
    assert.deepEqual(calls[1].params, { session_id: 'local-1', title: 'Plan', profile: 'work' })
    assert.deepEqual(calls[2].params, { session_id: 'local-1', subscription_id: 'sub-1', end_reason: 'cli_close', profile: 'work' })
  })

  it('No project: no cwd at all (R4)', async () => {
    const { d, calls } = deps()

    await createSession(d, { profile: 'default', title: 'Loose' })
    assert.ok(!('cwd' in calls[0].params) && !('cwd_explicit' in calls[0].params))
  })

  it('a refused title releases the runtime, deletes only the untitled row it left, and the dialog gets a readable message', async () => {
    const { d, calls, removed } = deps({
      'session.title': () => {
        throw Object.assign(new Error('internal error'), { code: -32603 })
      }
    })
    const error = await createSession(d, { profile: 'default', cwd: '/repos/p1', title: 'Taken' }).catch((caught: unknown) => caught)

    assert.ok(error instanceof CreateFailure)
    assert.equal(error.stage, 'title')
    assert.equal(error.cleanup, 'deleted')
    assert.equal(error.release, 'detach')
    assert.match(error.message, /Taken/)
    assert.deepEqual(calls.map(call => call.method), ['session.create', 'session.title', 'session.detach'])
    assert.deepEqual(removed, ['local-1'])
  })

  it('a title that lands but answers an error (the re-check keeps the titled row): created, with a warning; the runtime is still released', async () => {
    const { d, calls } = deps({
      'session.title': () => {
        throw Object.assign(new Error('internal error'), { code: -32603 })
      }
    })
    const kept: string[] = []

    d.removeIfUntouched = async (_profile, id) => {
      kept.push(id)

      return { title: 'Plan', message_count: 0 }
    }
    const outcome = await createSession(d, { profile: 'work', cwd: '/repos/p1', title: 'Plan' })

    assert.deepEqual(outcome, { sessionId: 'local-1', release: 'detach', titleWarning: { reason: 'internal error', storedTitle: 'Plan' } })
    assert.deepEqual(calls.map(call => call.method), ['session.create', 'session.title', 'session.detach'])
    assert.deepEqual(kept, ['local-1'])
  })

  it('a title error on a row the re-check keeps because it has messages: created, and the warning names the title the row has (none here)', async () => {
    const { d } = deps({
      'session.title': () => {
        throw Object.assign(new Error('storage busy'), { code: -32603 })
      }
    })

    d.removeIfUntouched = async () => ({ title: null, message_count: 2 })
    const outcome = await createSession(d, { profile: 'default', title: 'Wanted' })

    assert.deepEqual(outcome.titleWarning, { reason: 'storage busy', storedTitle: null })
    assert.equal(outcome.release, 'detach')
  })

  it('a title error on a row still untitled and empty: a refusal (CreateFailure, cleanup deleted), as before', async () => {
    const { d, removed } = deps({
      'session.title': () => {
        throw Object.assign(new Error('internal error'), { code: -32603 })
      }
    })

    d.removeIfUntouched = async (_profile, id) => {
      removed.push(id)

      return null
    }
    const error = await createSession(d, { profile: 'default', title: 'Refused' }).catch((caught: unknown) => caught)

    assert.ok(error instanceof CreateFailure)
    assert.equal(error.stage, 'title')
    assert.equal(error.cleanup, 'deleted')
    assert.deepEqual(removed, ['local-1'])
  })

  it('a cleanup that fails is reported (never retried)', async () => {
    const { d } = deps({
      'session.title': () => {
        throw Object.assign(new Error("Title 'x' is already in use by session y"), { code: 4022 })
      }
    })
    let attempts = 0

    d.removeIfUntouched = async () => {
      attempts += 1
      throw new Error('503: storage')
    }
    const error = (await createSession(d, { profile: 'default', title: 'x' }).catch((caught: unknown) => caught)) as CreateFailure

    assert.equal(error.cleanup, 'failed')
    assert.equal(attempts, 1)
    assert.match(error.message, /already the name of another session/)
  })

  it('a refused create throws at the create stage and touches nothing else', async () => {
    const { d, calls, removed } = deps({
      'session.create': () => {
        throw Object.assign(new Error('storage_unavailable'), { code: 4001 })
      }
    })
    const error = (await createSession(d, { profile: 'default', title: 'x' }).catch((caught: unknown) => caught)) as CreateFailure

    assert.equal(error.stage, 'create')
    assert.deepEqual(calls.map(call => call.method), ['session.create'])
    assert.deepEqual(removed, [])
  })

  it('release (R2): detach when the create answered a subscription, else close; a -32601 falls back to the other once', async () => {
    const unknown = () => {
      throw Object.assign(new Error('unknown method: session.close'), { code: -32601 })
    }
    const noClose = deps({ 'session.close': unknown })

    assert.equal(await releaseRuntime(noClose.d.request, { sessionId: 's', profile: 'default' }), 'detach')
    assert.deepEqual(noClose.calls.map(call => call.method), ['session.close', 'session.detach'])
    const noDetach = deps({ 'session.detach': unknown })

    assert.equal(await releaseRuntime(noDetach.d.request, { sessionId: 's', subscriptionId: 'x', profile: 'default' }), 'close')
    assert.deepEqual(noDetach.calls.map(call => call.method), ['session.detach', 'session.close'])
    const neither = deps({ 'session.detach': unknown, 'session.close': unknown })

    assert.equal(await releaseRuntime(neither.d.request, { sessionId: 's', subscriptionId: 'x', profile: 'default' }), 'failed')
    assert.equal(neither.calls.length, 2, 'once each')
    const refused = deps({
      'session.detach': () => {
        throw new Error('permission_denied')
      }
    })

    assert.equal(await releaseRuntime(refused.d.request, { sessionId: 's', subscriptionId: 'x', profile: 'default' }), 'failed')
    assert.equal(refused.calls.length, 1, 'only a -32601 falls back')
  })

  it('one submit is one create: a double click or an Enter repeat while it is in flight joins it; the next one is a new attempt with a new request_id', async () => {
    let release!: () => void
    const gate = new Promise<void>(resolve => (release = resolve))
    const { d, calls } = deps({
      'session.create': async () => {
        await gate

        return { session_id: 'local-1', stored_session_id: 'local-1', subscription_id: 'sub-1' }
      }
    })
    const attempts = createAttempts<unknown>()
    const first = attempts.run(() => createSession(d, { profile: 'default', title: 'Once' }))
    const second = attempts.run(() => createSession(d, { profile: 'default', title: 'Once' }))

    assert.equal(first.joined, false)
    assert.equal(second.joined, true)
    assert.equal(second.flight, first.flight)
    assert.equal(attempts.busy, true)
    release()
    await first.flight
    assert.equal(calls.filter(call => call.method === 'session.create').length, 1)
    assert.equal(attempts.busy, false)
    const third = attempts.run(() => createSession(d, { profile: 'default', title: 'Again' }))

    await third.flight
    const creates = calls.filter(call => call.method === 'session.create')

    assert.equal(creates.length, 2)
    assert.notEqual(creates[0].params.request_id, creates[1].params.request_id)
  })
})
