import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { ALL_PROJECTS, buildGraph } from '../../src/model/graph.ts'
import { compactedCount, displayTitle, forkParentId, HIDDEN_SOURCES, isHiddenRow, visibleRows } from '../../src/model/sessions.ts'
import type { SessionRow } from '../../src/model/sessions.ts'

const row = (id: string, extra: Partial<SessionRow> = {}): SessionRow => ({
  id,
  title: id,
  source: 'desktop',
  message_count: 4,
  started_at: 1000,
  last_active: 2000,
  ...extra
})

/** The graph model's links between drawn blocks (card 1's `graphLinks`, now `buildGraph`). */
const links = (rows: SessionRow[]) =>
  buildGraph(rows, [], { profile: 'default', showArchived: false, scope: ALL_PROJECTS }).edges.map(edge => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    kind: edge.kind
  }))

describe('forkParentId (the desktop sidebar rule)', () => {
  it('nests a /branch child under _branched_from', () => {
    assert.equal(forkParentId(row('c', { _branched_from: 'p', parent_session_id: 'p' })), 'p')
  })

  it('never nests a /new or idle reset, even with parent_session_id', () => {
    assert.equal(forkParentId(row('c', { _reset_from: 'p', parent_session_id: 'p' })), undefined)
  })

  it('falls back to parent_session_id for legacy / optimistic forks', () => {
    assert.equal(forkParentId(row('c', { parent_session_id: ' p ' })), 'p')
  })

  it('treats blank markers as absent', () => {
    assert.equal(forkParentId(row('c', { _reset_from: '  ', _branched_from: '', parent_session_id: null })), undefined)
  })
})

describe('isHiddenRow / visibleRows (R6)', () => {
  it('hides delegate_task children', () => {
    assert.equal(isHiddenRow(row('d', { is_internal_child: true })), true)
  })

  for (const source of ['cron', 'kanban', 'tool', 'subagent', 'acp', 'oneshot', 'CRON']) {
    it(`hides source=${source}`, () => {
      assert.equal(isHiddenRow(row('x', { source })), true)
    })
  }

  it('keeps desktop, cli and messaging sources', () => {
    for (const source of ['desktop', 'cli', 'tui', 'telegram', null]) {
      assert.equal(isHiddenRow(row('x', { source })), false, String(source))
    }
  })

  it('hides empty launch stubs (no messages), like the sidebar', () => {
    assert.equal(isHiddenRow(row('x', { message_count: 0 })), true)
  })

  it('filters a list, keeping order', () => {
    const rows = [row('a'), row('b', { source: 'cron' }), row('c')]

    assert.deepEqual(visibleRows(rows).map(r => r.id), ['a', 'c'])
    assert.ok(HIDDEN_SOURCES.has('tool'))
  })
})

describe('graph links', () => {
  it('links branch children to their parent and resets as "continued as"', () => {
    const rows = [
      row('root'),
      row('kid', { _branched_from: 'root', parent_session_id: 'root' }),
      row('next', { _reset_from: 'root', parent_session_id: 'root' })
    ]

    assert.deepEqual(links(rows), [
      { id: 'branch:root->kid', source: 'root', target: 'kid', kind: 'branch' },
      { id: 'reset:root->next', source: 'root', target: 'next', kind: 'reset' }
    ])
  })

  it('resolves a parent named by any compression segment to the visible tip', () => {
    const rows = [
      row('tip', { _lineage_root_id: 'seg1', _lineage_ids: ['seg1', 'seg2', 'tip'] }),
      row('a', { _branched_from: 'seg1' }),
      row('b', { _branched_from: 'seg2' })
    ]

    assert.deepEqual(
      links(rows).map(l => `${l.source}->${l.target}`),
      ['tip->a', 'tip->b']
    )
  })

  it('links a branch whose parent is not loaded to a "Parent not loaded" stand-in (R7)', () => {
    assert.deepEqual(
      links([row('orphan', { _branched_from: 'gone' })]).map(l => `${l.source}->${l.target}`),
      ['missing:default/gone->orphan']
    )
  })

  it('never links a block to itself', () => {
    const rows = [row('tip', { _lineage_ids: ['seg1', 'tip'], _branched_from: 'seg1' })]

    assert.deepEqual(links(rows), [])
  })

  it("prefers a block's own id over another block's alias", () => {
    const rows = [row('x', { _lineage_ids: ['y', 'x'] }), row('y'), row('k', { _branched_from: 'y' })]

    assert.deepEqual(links(rows).map(l => l.source), ['y'])
  })
})

describe('compactedCount and displayTitle', () => {
  it('reads the backend count, else the lineage length', () => {
    assert.equal(compactedCount(row('a', { compacted_segments: 3 })), 3)
    assert.equal(compactedCount(row('a', { _lineage_ids: ['r', 's', 'a'] })), 2)
    assert.equal(compactedCount(row('a')), 0)
  })

  it('falls back from title to preview to a placeholder', () => {
    assert.equal(displayTitle(row('a', { title: ' T ' })), 'T')
    assert.equal(displayTitle(row('a', { title: null, preview: 'first prompt' })), 'first prompt')
    assert.equal(displayTitle(row('a', { title: null, preview: null })), 'Untitled session')
  })
})
