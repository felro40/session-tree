/**
 * Mirror of the Hermes desktop's `apps/desktop/src/lib/session-branch-tree.test.ts` against the
 * ported rules in `src/model/branch-tree.ts` (forkParentId, compression collapse, nesting), one
 * test per upstream case, same inputs and expectations.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { flattenSessionsWithBranches } from '../../src/model/branch-tree.ts'
import { forkParentId } from '../../src/model/sessions.ts'
import type { SessionRow } from '../../src/model/sessions.ts'

// Upstream `makeSessionInfo({ id, message_count: 1, source: 'cli', title: id, ...overrides })`.
const session = (id: string, overrides: Partial<SessionRow> = {}): SessionRow => ({
  id,
  message_count: 1,
  source: 'cli',
  title: id,
  started_at: 0,
  last_active: 0,
  ...overrides
})

const fork = (id: string, parentId: string, overrides: Partial<SessionRow> = {}): SessionRow =>
  session(id, { _branched_from: parentId, parent_session_id: parentId, ...overrides })

const reset = (id: string, parentId: string, overrides: Partial<SessionRow> = {}): SessionRow =>
  session(id, { _reset_from: parentId, parent_session_id: parentId, ...overrides })

describe('forkParentId (mirrored)', () => {
  it('returns undefined for /new and idle/daily reset lineage', () => {
    assert.equal(forkParentId(reset('next', 'prev')), undefined)
  })

  it('returns the branch parent for a genuine /branch fork', () => {
    assert.equal(forkParentId(fork('branch', 'parent')), 'parent')
  })

  it('falls back to parent_session_id for legacy/optimistic forks without the marker', () => {
    assert.equal(forkParentId(session('branch', { parent_session_id: 'parent' })), 'parent')
  })
})

describe('flattenSessionsWithBranches (mirrored)', () => {
  it('nests branch rows under their parent with tree stems', () => {
    const parent = session('parent', { last_active: 20 })
    const branchA = fork('branch-a', 'parent', { last_active: 15 })
    const branchB = fork('branch-b', 'parent', { last_active: 10 })

    assert.deepEqual(flattenSessionsWithBranches([parent, branchA, branchB]), [
      { session: parent },
      { branchStem: '├─ ', session: branchA },
      { branchStem: '└─ ', session: branchB }
    ])
  })

  it('follows a compressed parent via lineage root id', () => {
    const tip = session('tip', { _lineage_root_id: 'root', last_active: 30 })
    const branch = fork('branch', 'root', { last_active: 10 })

    assert.deepEqual(flattenSessionsWithBranches([tip, branch]), [{ session: tip }, { branchStem: '└─ ', session: branch }])
  })

  it('collapses a stale compression tip into its continuation instead of nesting it (#82290)', () => {
    const oldTip = session('old-tip', { _lineage_root_id: 'root', last_active: 100, started_at: 50 })
    const continuation = session('continuation', {
      _lineage_root_id: 'root',
      last_active: 100,
      parent_session_id: 'old-tip',
      started_at: 100
    })

    assert.deepEqual(flattenSessionsWithBranches([oldTip, continuation]), [{ session: continuation }])
    assert.deepEqual(flattenSessionsWithBranches([continuation, oldTip], { preserveOrder: true }), [{ session: continuation }])
  })

  it('collapses the lineage root row once its continuation carries the root id', () => {
    const root = session('root', { last_active: 40 })
    const continuation = session('continuation', { _lineage_root_id: 'root', last_active: 60, parent_session_id: 'root' })
    const branch = session('branch', { last_active: 50, parent_session_id: 'root' })

    assert.deepEqual(flattenSessionsWithBranches([root, continuation, branch]), [
      { session: continuation },
      { branchStem: '└─ ', session: branch }
    ])
  })

  it('nests a branch of a collapsed stale tip under the live tip', () => {
    const oldTip = session('old-tip', { _lineage_root_id: 'root', last_active: 30 })
    const tip = session('tip', { _lineage_root_id: 'root', last_active: 90, parent_session_id: 'old-tip' })
    const branch = session('branch', { last_active: 70, parent_session_id: 'old-tip' })

    assert.deepEqual(flattenSessionsWithBranches([oldTip, tip, branch]), [{ session: tip }, { branchStem: '└─ ', session: branch }])
  })

  it('keeps same-lineage ids from different profiles apart', () => {
    const work = session('tip', { _lineage_root_id: 'root', last_active: 20, profile: 'work' })
    const home = session('tip-home', { _lineage_root_id: 'root', last_active: 10, profile: 'home' })

    assert.deepEqual(
      flattenSessionsWithBranches([work, home]).map(e => e.session.id),
      ['tip', 'tip-home']
    )
  })

  it('still nests a real branch of a compressed conversation under the live tip', () => {
    const oldTip = session('old-tip', { _lineage_root_id: 'root', last_active: 30 })
    const tip = session('tip', { _lineage_root_id: 'root', last_active: 90, parent_session_id: 'old-tip' })
    const branch = session('branch', { last_active: 70, parent_session_id: 'tip' })

    assert.deepEqual(flattenSessionsWithBranches([oldTip, tip, branch]), [{ session: tip }, { branchStem: '└─ ', session: branch }])
  })

  it('keeps orphan branches at the top level when the parent is missing', () => {
    const branch = fork('branch', 'missing')

    assert.deepEqual(flattenSessionsWithBranches([branch]), [{ session: branch }])
  })

  it('re-sorts roots by group recency by default (pinned-style jumps without preserveOrder)', () => {
    const important = session('important', { last_active: 10 })
    const background = session('background', { last_active: 99 })

    assert.deepEqual(
      flattenSessionsWithBranches([important, background]).map(e => e.session.id),
      ['background', 'important']
    )
  })

  it("preserveOrder keeps the caller's root order even when activity is newer lower down", () => {
    const important = session('important', { last_active: 10 })
    const background = session('background', { last_active: 99 })
    const branch = fork('branch', 'important', { last_active: 50 })

    assert.deepEqual(
      flattenSessionsWithBranches([important, background, branch], { preserveOrder: true }).map(e => ({
        id: e.session.id,
        stem: e.branchStem
      })),
      [
        { id: 'important', stem: undefined },
        { id: 'branch', stem: '└─ ' },
        { id: 'background', stem: undefined }
      ]
    )
  })

  it('renders /new and idle/daily resets as siblings, not nested branches', () => {
    const first = session('first', { last_active: 10 })
    const second = reset('second', 'first', { last_active: 20 })
    const third = reset('third', 'second', { last_active: 30 })

    assert.deepEqual(
      flattenSessionsWithBranches([first, second, third]).map(e => ({ id: e.session.id, stem: e.branchStem })),
      [
        { id: 'third', stem: undefined },
        { id: 'second', stem: undefined },
        { id: 'first', stem: undefined }
      ]
    )
  })

  it('still nests a genuine fork when a reset sibling shares the same parent_session_id', () => {
    const parent = session('parent', { last_active: 10 })
    const branch = fork('branch', 'parent', { last_active: 15 })
    const nextTopic = reset('next', 'parent', { last_active: 20 })

    assert.deepEqual(
      flattenSessionsWithBranches([parent, branch, nextTopic]).map(e => ({ id: e.session.id, stem: e.branchStem })),
      [
        { id: 'next', stem: undefined },
        { id: 'parent', stem: undefined },
        { id: 'branch', stem: '└─ ' }
      ]
    )
  })

  it('nests a parent_session_id-only row (optimistic / legacy fork) when _reset_from is absent', () => {
    const parent = session('parent', { last_active: 20 })
    const branch = session('branch', { last_active: 10, parent_session_id: 'parent' })

    assert.deepEqual(flattenSessionsWithBranches([parent, branch]), [{ session: parent }, { branchStem: '└─ ', session: branch }])
  })
})
