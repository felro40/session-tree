import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { ALL_PROFILES, ALL_PROJECTS, buildGraph, filterRows, layoutKeysOf, lineageOf, singlesInScope, STANDIN_PREFIX } from '../../src/model/graph.ts'
import type { GraphOptions } from '../../src/model/graph.ts'
import { mergeProjects, NO_PROJECT_ID, parseProjectsTree, projectIndex } from '../../src/model/projects.ts'
import { loadFixture, project, row } from './fixtures.ts'

const ALL: GraphOptions = { profile: 'default', showArchived: false, scope: ALL_PROJECTS }
const fixture = loadFixture('default')
const SYSCANVAS = fixture.projects.find(p => p.label === 'syscanvas')!.id
const MDESIGN = fixture.projects.find(p => p.label === 'mdesign')!.id

const edgeIds = (model: ReturnType<typeof buildGraph>) => model.edges.map(edge => edge.id).sort()

describe('buildGraph on the seeded fixture', () => {
  const model = buildGraph(fixture.rows, fixture.projects, ALL)

  it('folds the 4-segment conversation into one block with compacted ×3 (and ×1 for mdesign)', () => {
    const tip = model.nodeById.get('st-sys-tip')!

    assert.equal(tip.compacted, 3)
    assert.equal(model.nodeById.get('st-md-tip')!.compacted, 1)
    assert.equal(model.nodeById.get('st-hp-root')!.compacted, 0)

    for (const segment of ['st-sys-root', 'st-sys-seg2', 'st-sys-seg3']) {
      assert.ok(!model.nodeById.has(segment), `${segment} drawn`)
    }
  })

  it('B2 (card-4 review): a compacted block\'s layout key is its lineage root, every other block keeps its id', () => {
    assert.equal(model.nodeById.get('st-sys-tip')!.layoutKey, 'st-sys-root')
    assert.equal(model.nodeById.get('st-md-tip')!.layoutKey, 'st-md-root')
    assert.equal(model.nodeById.get('st-hp-root')!.layoutKey, 'st-hp-root')
    assert.equal(model.nodeById.get('st-sys-comments')!.layoutKey, 'st-sys-comments')

    for (const node of model.nodes.filter(each => each.kind === 'standin')) {
      assert.equal(node.layoutKey, node.id)
    }

    const keys = layoutKeysOf(model)

    assert.equal(keys.toStore('st-sys-tip'), 'st-sys-root')
    assert.equal(keys.fromStore('st-sys-root'), 'st-sys-tip')
    assert.equal(keys.toStore('group:x'), 'group:x')
    // Another compaction: a new tip row with the same lineage root keeps the key.
    const compacted = fixture.rows.map(each => (each.id === 'st-sys-tip' ? { ...each, id: 'st-sys-seg5', _lineage_ids: [...(each._lineage_ids ?? []), 'st-sys-seg5'] } : each))
    const after = buildGraph(compacted, fixture.projects, ALL)

    assert.equal(after.nodeById.get('st-sys-seg5')!.layoutKey, 'st-sys-root')
    assert.equal(layoutKeysOf(after).fromStore('st-sys-root'), 'st-sys-seg5')
  })

  it('nests /branch children by forkParentId, a middle-segment branch under the visible tip', () => {
    assert.equal(model.parentOf.get('st-sys-comments'), 'st-sys-tip')
    assert.equal(model.parentOf.get('st-sys-reply'), 'st-sys-comments')
    assert.equal(model.parentOf.get('st-sys-mcp'), 'st-sys-tip')
    assert.deepEqual(model.childrenOf.get('st-hp-root'), ['st-hp-routing', 'st-hp-mockup'])
  })

  it('draws the /new reset as a "continued as" edge, not a branch', () => {
    assert.ok(model.edges.some(edge => edge.id === 'reset:st-md-tip->st-md-v2' && edge.kind === 'reset'))
    assert.equal(model.parentOf.get('st-md-v2'), undefined)
    assert.equal(model.continuedFrom.get('st-md-v2'), 'st-md-tip')
    assert.deepEqual(model.continuedAs.get('st-md-tip'), ['st-md-v2'])
  })

  it('gives the deleted parent a stand-in linked to its branch child', () => {
    const standinId = `${STANDIN_PREFIX}default/st-orphan-parent`
    const standin = model.nodeById.get(standinId)!

    assert.equal(standin.kind, 'standin')
    assert.equal(standin.readOnly, true)
    assert.equal(standin.missingId, 'st-orphan-parent')
    assert.deepEqual(model.childrenOf.get(standinId), ['st-orphan-child'])
    assert.ok(model.edges.some(edge => edge.source === standinId && edge.target === 'st-orphan-child' && edge.fromStandin))
    assert.equal(model.nodeById.get('st-orphan-child')!.single, false)
  })

  it('keeps no compression-ancestry stand-in (the projected tip has no foreign parent)', () => {
    assert.deepEqual(
      model.nodes.filter(node => node.kind === 'standin').map(node => node.missingId),
      ['st-orphan-parent']
    )
  })

  it('classifies the 24 singles and nothing else as singles', () => {
    const singles = model.singles.map(node => node.id).sort()

    assert.equal(singles.length, 24)
    assert.ok(singles.every(id => id.startsWith('st-single-')))
  })

  it('leaves out the hidden kinds (cron, kanban, tool) and the archived rows by default', () => {
    for (const id of ['st-hidden-cron', 'st-hidden-kanban', 'st-hidden-tool', 'st-archived-0', 'st-archived-1']) {
      assert.ok(!model.nodeById.has(id), `${id} drawn`)
    }
  })

  it('every edge joins two drawn nodes, and the expected edge set is exact', () => {
    assert.deepEqual(edgeIds(model), [
      'branch:missing:default/st-orphan-parent->st-orphan-child',
      'branch:st-hp-root->st-hp-mockup',
      'branch:st-hp-root->st-hp-routing',
      'branch:st-md-tip->st-md-katex',
      'branch:st-md-tip->st-md-redline',
      'branch:st-split-root->st-split-child',
      'branch:st-sys-comments->st-sys-reply',
      'branch:st-sys-tip->st-sys-comments',
      'branch:st-sys-tip->st-sys-mcp',
      'branch:st-sys-tip->st-sys-pairing',
      'reset:st-md-tip->st-md-v2'
    ])

    for (const edge of model.edges) {
      assert.ok(model.nodeById.has(edge.source) && model.nodeById.has(edge.target), edge.id)
    }
  })

  it('assigns projects from projects.tree sessionIds', () => {
    assert.equal(model.nodeById.get('st-sys-tip')!.projectId, SYSCANVAS)
    assert.equal(model.nodeById.get('st-split-child')!.projectId, MDESIGN)
    assert.equal(model.nodeById.get('st-orphan-child')!.projectId, NO_PROJECT_ID)
  })
})

describe('hidden kinds (R6)', () => {
  const rows = [
    row('keep'),
    row('delegate', { is_internal_child: true, parent_session_id: 'keep' }),
    row('cron', { source: 'cron' }),
    row('kanban', { source: 'kanban' }),
    row('tool', { source: 'tool' }),
    row('subagent', { source: 'subagent' }),
    row('stub', { message_count: 0 })
  ]

  it('drops each hidden kind', () => {
    assert.deepEqual(filterRows(rows, ALL).map(r => r.id), ['keep'])
  })

  it('a branch of a hidden parent gets a stand-in (the parent is not loaded as a block)', () => {
    const model = buildGraph([...rows, row('kid', { _branched_from: 'cron' })], [], ALL)

    assert.equal(model.parentOf.get('kid'), `${STANDIN_PREFIX}default/cron`)
  })
})

describe('archived (R9)', () => {
  const rows = [row('live'), row('old', { archived: true }), row('kid', { _branched_from: 'old' })]

  it('off: archived rows are not blocks; their branch child links to a stand-in', () => {
    const model = buildGraph(rows, [], ALL)

    assert.ok(!model.nodeById.has('old'))
    assert.equal(model.parentOf.get('kid'), `${STANDIN_PREFIX}default/old`)
  })

  it('on: archived rows are blocks marked archived, linked normally', () => {
    const model = buildGraph(rows, [], { ...ALL, showArchived: true })

    assert.equal(model.nodeById.get('old')!.archived, true)
    assert.equal(model.parentOf.get('kid'), 'old')
  })
})

describe('profiles (R10)', () => {
  const rows = [row('a', { profile: 'default' }), row('b', { profile: 'work' }), row('c', { profile: undefined })]

  it('one profile keeps only its rows (a row without a profile is "default")', () => {
    assert.deepEqual(buildGraph(rows, [], ALL).nodes.map(n => n.id).sort(), ['a', 'c'])
    assert.deepEqual(buildGraph(rows, [], { ...ALL, profile: 'work' }).nodes.map(n => n.id), ['b'])
  })

  it('"*" keeps every profile; a shared id is qualified by profile', () => {
    const model = buildGraph([...rows, row('a', { profile: 'work' })], [], { ...ALL, profile: ALL_PROFILES })

    assert.deepEqual(model.nodes.map(n => n.id).sort(), ['b', 'c', 'default/a', 'work/a'])
  })
})

describe('scope (R5)', () => {
  const projects = [project('p1', ['root', 'kid']), project('p2', ['other', 'cross']), project(NO_PROJECT_ID, ['loose'], { isNoProject: true, label: 'Home' })]
  const rows = [
    row('root'),
    row('kid', { _branched_from: 'root' }),
    row('cross', { _branched_from: 'root' }),
    row('other'),
    row('loose'),
    row('archived', { archived: true, git_repo_root: '/repos/p2' })
  ]

  it('all projects: nothing is out of scope', () => {
    const model = buildGraph(rows, projects, ALL)

    assert.ok(model.nodes.every(node => !node.outOfScope))
  })

  it('one project: other projects are out of scope and read-only; a split family keeps its foreign member as a real node', () => {
    const model = buildGraph(rows, projects, { ...ALL, scope: 'p1' })
    const cross = model.nodeById.get('cross')!

    assert.equal(model.nodeById.get('root')!.outOfScope, false)
    assert.equal(cross.kind, 'session')
    assert.equal(cross.outOfScope, true)
    assert.equal(cross.readOnly, true)
    assert.equal(model.nodeById.get('other')!.outOfScope, true)
    assert.equal(model.families.find(f => f.nodeIds.includes('cross'))!.inScope, true)
    assert.equal(model.families.find(f => f.nodeIds.includes('other'))!.inScope, false)
  })

  it('the "no project" scope holds the unclaimed rows', () => {
    const model = buildGraph(rows, projects, { ...ALL, scope: NO_PROJECT_ID })

    assert.equal(model.nodeById.get('loose')!.outOfScope, false)
    assert.equal(model.nodeById.get('root')!.outOfScope, true)
  })

  it('an archived row the tree does not list falls back to the project holding its repo', () => {
    const model = buildGraph(rows, projects, { ...ALL, showArchived: true, scope: 'p2' })

    assert.equal(model.nodeById.get('archived')!.projectId, 'p2')
    assert.equal(model.nodeById.get('archived')!.outOfScope, false)
  })

  it('membership also matches a compression root or segment id', () => {
    const index = projectIndex([project('p', ['seg1'])])

    assert.equal(index.projectOf(row('tip', { _lineage_root_id: 'seg1', _lineage_ids: ['seg1', 'tip'] })), 'p')
  })

  it('a stand-in is out of scope only when all its children are', () => {
    const graph = buildGraph([row('orphan', { _branched_from: 'gone' })], [project('p1', ['orphan'])], { ...ALL, scope: 'p2' })
    const standin = graph.nodes.find(node => node.kind === 'standin')!

    assert.equal(standin.outOfScope, true)
    assert.equal(standin.readOnly, true)
  })

  it('singles in scope only', () => {
    const model = buildGraph(rows, projects, { ...ALL, scope: 'p2' })

    assert.deepEqual(singlesInScope(model).map(n => n.id), ['other'])
  })
})

describe('compression and lineage edge cases', () => {
  it('two rows of one compression lineage collapse to one block (the live tip)', () => {
    const model = buildGraph(
      [row('old-tip', { _lineage_root_id: 'r', last_active: 30 }), row('tip', { _lineage_root_id: 'r', last_active: 90, parent_session_id: 'old-tip' })],
      [],
      ALL
    )

    assert.deepEqual(model.nodes.map(n => n.id), ['tip'])
    assert.equal(model.edges.length, 0)
  })

  it('a continuation whose earlier segment is not loaded gets no stand-in', () => {
    const model = buildGraph([row('tip', { _lineage_root_id: 'r', parent_session_id: 'seg3' })], [], ALL)

    assert.equal(model.nodes.length, 1)
  })

  it('siblings sharing a missing parent share one stand-in', () => {
    const model = buildGraph([row('a', { _branched_from: 'gone', started_at: 1 }), row('b', { _branched_from: 'gone', started_at: 2 })], [], ALL)
    const standins = model.nodes.filter(n => n.kind === 'standin')

    assert.equal(standins.length, 1)
    assert.deepEqual(model.childrenOf.get(standins[0].id), ['a', 'b'])
  })

  it('children are ordered by creation time', () => {
    const model = buildGraph(
      [row('p'), row('late', { _branched_from: 'p', started_at: 300 }), row('early', { _branched_from: 'p', started_at: 100 })],
      [],
      ALL
    )

    assert.deepEqual(model.childrenOf.get('p'), ['early', 'late'])
  })

  it('lineageOf: ancestors (branch + continued from) and descendants', () => {
    const model = buildGraph(fixture.rows, fixture.projects, ALL)

    assert.deepEqual([...lineageOf(model, 'st-sys-comments')].sort(), ['st-sys-comments', 'st-sys-reply', 'st-sys-tip'])
    assert.deepEqual([...lineageOf(model, 'st-md-v2')].sort(), ['st-md-tip', 'st-md-v2'])
    assert.equal(lineageOf(model, null).size, 0)
  })
})

describe('projects.tree parsing', () => {
  it('drops malformed nodes and merges profiles by id', () => {
    const a = parseProjectsTree({ projects: [{ id: 'p', label: 'P', sessionIds: ['x', 7] }, { label: 'no id' }, null] })
    const b = parseProjectsTree({ projects: [{ id: 'p', color: '#fff', sessionIds: ['y'] }] })

    assert.deepEqual(a.map(p => p.sessionIds), [['x']])
    assert.deepEqual(mergeProjects([a, b])[0].sessionIds, ['x', 'y'])
    assert.equal(mergeProjects([a, b])[0].color, '#fff')
    assert.deepEqual(parseProjectsTree(null), [])
  })
})
