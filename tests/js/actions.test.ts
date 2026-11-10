import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  applyOverrides,
  branchNote,
  createFencedMutation,
  deleteBlockedReason,
  exportFilename,
  isActionable,
  moveTargets,
  projectRootCwd,
  renameRoute,
  restErrorText,
  settleOverrides
} from '../../src/model/actions.ts'
import { ALL_PROJECTS, buildGraph } from '../../src/model/graph.ts'
import { EMPTY_HOST_STATUS, liveStatus } from '../../src/model/status.ts'
import { project, row } from './fixtures.ts'

describe('exportFilename (mirrors apps/desktop/src/lib/session-export.ts)', () => {
  it('sanitised title + the first 8 id characters', () => {
    assert.equal(exportFilename('20261109_120000_abcdef', 'Edge routing: libavoid!'), 'edge-routing-libavoid-20261109.json')
    assert.equal(exportFilename('st-sys-tip', 'Hierarchical subsystems design'), 'hierarchical-subsystems-design-st-sys-t.json')
  })

  it('falls back to "session" for an empty or unusable title, and caps the title at 48', () => {
    assert.equal(exportFilename('abc', null), 'session-abc.json')
    assert.equal(exportFilename('abc', '!!!'), 'session-abc.json')
    assert.equal(exportFilename('x', 'a'.repeat(80)), `${'a'.repeat(48)}-x.json`)
  })
})

describe('moveTargets (MoveToProjectItems: not the current project, not folderless)', () => {
  const projects = [
    project('/p/syscanvas', ['s1'], { label: 'syscanvas', path: null, repoPaths: ['/p/syscanvas'] }),
    project('/p/mdesign', [], { label: 'mdesign', path: '/p/mdesign', repoPaths: [] }),
    project('__no_project__', ['s2'], { label: 'Home', isNoProject: true, path: '/home/u', repoPaths: [] }),
    project('folderless', [], { label: 'Folderless', path: null, repoPaths: [] })
  ]

  it('root cwd: the project path, else its first repo', () => {
    assert.equal(projectRootCwd(projects[0]), '/p/syscanvas')
    assert.equal(projectRootCwd(projects[1]), '/p/mdesign')
    assert.equal(projectRootCwd(projects[3]), '')
  })

  it('excludes the session\'s own project, the home bucket and folderless projects', () => {
    assert.deepEqual(moveTargets(projects, '/p/syscanvas').map(p => p.label), ['mdesign'])
    assert.deepEqual(moveTargets(projects, undefined).map(p => p.label), ['syscanvas', 'mdesign'])
  })
})

describe('delete gate and the branches note', () => {
  it('refused while the session runs, with the reason', () => {
    const running = liveStatus(row('a', { is_active: true }), EMPTY_HOST_STATUS)
    const idle = liveStatus(row('a'), EMPTY_HOST_STATUS)

    assert.match(deleteBlockedReason(running) ?? '', /running/i)
    assert.equal(deleteBlockedReason(idle), undefined)
    assert.equal(deleteBlockedReason(undefined), undefined)
  })

  it('names how many branches stay as separate sessions', () => {
    assert.equal(branchNote(0), '')
    assert.equal(branchNote(1), 'Its 1 branch stays as a separate session.')
    assert.equal(branchNote(3), 'Its 3 branches stay as separate sessions.')
  })
})

describe('isActionable (R5, R7: no actions on dimmed blocks and stand-ins)', () => {
  const rows = [
    row('root', { git_repo_root: '/p/a' }),
    row('kid', { _branched_from: 'root', git_repo_root: '/p/b' }),
    row('orphan', { _branched_from: 'gone', git_repo_root: '/p/a' })
  ]
  const projects = [project('/p/a', ['root', 'orphan'], { repoPaths: ['/p/a'] }), project('/p/b', ['kid'], { repoPaths: ['/p/b'] })]

  it('in-scope sessions only', () => {
    const all = buildGraph(rows, projects, { profile: 'default', showArchived: false, scope: ALL_PROJECTS })
    const scoped = buildGraph(rows, projects, { profile: 'default', showArchived: false, scope: '/p/a' })

    assert.equal(isActionable(all.nodeById.get('kid')), true)
    assert.equal(isActionable(scoped.nodeById.get('kid')), false)
    assert.equal(isActionable(scoped.nodeById.get('root')), true)
    assert.equal(isActionable(all.nodeById.get('missing:default/gone')), false)
    assert.equal(isActionable(undefined), false)
  })
})

describe('renameRoute (session-actions-menu.tsx renameSessionPreferringRpc)', () => {
  const host = { focusedStoredSessionId: 'tip', focusedSessionId: 'rt-1' }

  it('the session.title RPC for the session with a known live runtime and a non-empty title', () => {
    assert.deepEqual(renameRoute(row('tip'), host, 'New'), { kind: 'rpc', runtimeId: 'rt-1' })
    // A compression tip's earlier segment id is focused: the same conversation.
    assert.deepEqual(renameRoute(row('tip2', { _lineage_ids: ['tip', 'tip2'] }), host, 'New'), { kind: 'rpc', runtimeId: 'rt-1' })
  })

  it('the backend otherwise: no runtime known, another session, or a clear (the RPC rejects clears)', () => {
    assert.deepEqual(renameRoute(row('other'), host, 'New'), { kind: 'backend' })
    assert.deepEqual(renameRoute(row('tip'), { ...host, focusedSessionId: null }, 'New'), { kind: 'backend' })
    assert.deepEqual(renameRoute(row('tip'), host, '  '), { kind: 'backend' })
  })
})

describe('createFencedMutation (shared/src/session-http-mutations.ts behaviour)', () => {
  const snapshot = (revision: number) => async () => ({ session_id: 's', exists: true, runtime_revision: revision, runtime_generation: 2 })

  it('reads the snapshot once, sends request_id + expected revision/generation', async () => {
    const mutate = createFencedMutation(() => 'req-1')
    const sent: unknown[] = []
    const result = await mutate('k', snapshot(7), async identity => {
      sent.push(identity)

      return 'ok'
    })

    assert.equal(result, 'ok')
    assert.deepEqual(sent, [{ request_id: 'req-1', expected_revision: 7, expected_generation: 2 }])
  })

  it('an ambiguous failure keeps the identity for the retry; a definitive refusal drops it', async () => {
    let n = 0
    const mutate = createFencedMutation(() => `req-${++n}`)
    const identities: string[] = []
    const send = (error?: Error) => async (identity: { request_id: string }) => {
      identities.push(identity.request_id)

      if (error) {
        throw error
      }

      return 'ok'
    }

    await assert.rejects(mutate('k', snapshot(1), send(new Error('503: owner_unreachable'))))
    await mutate('k', snapshot(1), send())
    assert.deepEqual(identities, ['req-1', 'req-1'], 'the retry reuses the identity')
    await assert.rejects(mutate('k', snapshot(1), send(new Error('409: {"detail":"revision_conflict"}'))))
    await mutate('k', snapshot(2), send())
    assert.deepEqual(identities.slice(2), ['req-2', 'req-3'], 'a refusal reads a new snapshot')
  })

  it('refuses to send without a usable snapshot', async () => {
    const mutate = createFencedMutation(() => 'r')

    await assert.rejects(
      mutate('k', async () => ({ session_id: 's', exists: false, runtime_revision: 0, runtime_generation: null }), async () => 'sent'),
      /snapshot unavailable/
    )
  })
})

describe('restErrorText (ctx.rest refusals → words)', () => {
  it('reads FastAPI details and names the core refusal reasons', () => {
    assert.equal(restErrorText(new Error('404: {"detail":"Session not found"}')), 'Session not found')
    assert.equal(restErrorText(new Error('409: {"detail":"session_busy"}')), 'The session is running; try again when it is idle (session_busy)')
    assert.equal(restErrorText(new Error('409: {"detail":"revision_conflict"}')), 'The session changed elsewhere; refresh and try again (revision_conflict)')
    assert.equal(restErrorText(new Error('503: owner unavailable')), 'owner unavailable')
    assert.equal(restErrorText(new Error('Hermes gateway unavailable')), 'Hermes gateway unavailable')
  })
})

describe('optimistic overrides', () => {
  const rows = [row('a', { title: 'A', pinned: false }), row('b', { title: 'B' })]

  it('patch rows until the server agrees, drop removed rows', () => {
    const overrides = new Map([
      ['a', { title: 'A2', pinned: true }],
      ['b', { removed: true }]
    ])
    const shown = applyOverrides(rows, overrides)

    assert.deepEqual(shown.map(item => [item.id, item.title, item.pinned]), [['a', 'A2', true]])
  })

  it('settle: an override the rows confirm is retired, others stay', () => {
    const overrides = new Map([
      ['a', { title: 'A', pinned: true }],
      ['b', { removed: true }],
      ['c', { removed: true }]
    ])
    const next = settleOverrides([row('a', { title: 'A', pinned: true }), row('b')], overrides)

    assert.deepEqual([...next.keys()], ['b'])
  })
})
