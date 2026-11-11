/**
 * Live status (R11) at the SDK boundary: `host.state` is injected as a snapshot, since the
 * isolated test Hermes has no model provider and cannot run a real turn (card 1 pre-check 10).
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { agoLabel, compactNumber, costLabel, dateTimeLabel, shortAge } from '../../src/model/format.ts'
import { EMPTY_HOST_STATUS, liveStatus } from '../../src/model/status.ts'
import { row } from './fixtures.ts'

describe('liveStatus (host.state injected)', () => {
  it('idle by default', () => {
    const status = liveStatus(row('a'), EMPTY_HOST_STATUS)

    assert.equal(status.tone, 'idle')
    assert.equal(status.running || status.needsInput || status.unread || status.open || status.pinned, false)
  })

  it('running from the backend activity heuristic (is_active)', () => {
    assert.equal(liveStatus(row('a', { is_active: true }), EMPTY_HOST_STATUS).tone, 'running')
  })

  it('running when the session open in this window is mid-turn (busyBySession by runtime id)', () => {
    const host = { ...EMPTY_HOST_STATUS, focusedStoredSessionId: 'a', focusedSessionId: 'rt-1', busyBySession: { 'rt-1': true } }
    const status = liveStatus(row('a'), host)

    assert.equal(status.running, true)
    assert.equal(status.open, true)
    assert.equal(liveStatus(row('b'), host).running, false)
  })

  it('running from host.state.busy only for the focused session', () => {
    const host = { ...EMPTY_HOST_STATUS, busy: true, focusedStoredSessionId: 'a' }

    assert.equal(liveStatus(row('a'), host).running, true)
    assert.equal(liveStatus(row('b'), host).running, false)
  })

  it('needs input from the injected set (no SDK source exists yet)', () => {
    const host = { ...EMPTY_HOST_STATUS, needsInput: new Set(['a']) }

    assert.equal(liveStatus(row('a'), host).tone, 'needs-input')
    assert.equal(liveStatus(row('a', { is_active: true }), host).tone, 'running')
  })

  it('unread and pinned from the row; open matches any compression segment id', () => {
    const status = liveStatus(row('tip', { unread: true, pinned: true, _lineage_ids: ['seg', 'tip'] }), {
      ...EMPTY_HOST_STATUS,
      focusedStoredSessionId: 'seg'
    })

    assert.equal(status.tone, 'unread')
    assert.equal(status.pinned, true)
    assert.equal(status.open, true)
  })
})

describe('format', () => {
  const now = 1_000_000_000_000

  it('short ages', () => {
    assert.equal(shortAge(now / 1000 - 10, now), 'now')
    assert.equal(shortAge(now / 1000 - 300, now), '5m')
    assert.equal(shortAge(now / 1000 - 3 * 3600, now), '3h')
    assert.equal(shortAge(now / 1000 - 2 * 86400, now), '2d')
    assert.equal(shortAge(now / 1000 - 21 * 86400, now), '3w')
    assert.equal(shortAge(null, now), '—')
    assert.equal(agoLabel(now / 1000 - 3 * 3600, now), '3h ago')
  })

  it('numbers, cost and dates', () => {
    assert.equal(compactNumber(412), '412')
    assert.equal(compactNumber(12_000), '12.0k')
    assert.equal(compactNumber(1_400_000), '1.40M')
    assert.equal(costLabel(null, 0.12), '$0.12')
    assert.equal(costLabel(2, 0.12), '$2.00')
    assert.equal(costLabel(null, null), '—')
    assert.match(dateTimeLabel(1_700_000_000), /^[A-Z][a-z]{2} \d{1,2}, \d{2}:\d{2}$/)
  })
})
