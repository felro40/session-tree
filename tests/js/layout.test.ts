import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { BLOCK_HEIGHT, BLOCK_WIDTH, layoutForest } from '../../src/model/layout.ts'
import { graphLinks } from '../../src/model/sessions.ts'
import type { SessionRow } from '../../src/model/sessions.ts'

const row = (id: string, last: number, extra: Partial<SessionRow> = {}): SessionRow => ({
  id,
  title: id,
  message_count: 2,
  started_at: last - 10,
  last_active: last,
  ...extra
})

function overlaps(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return Math.abs(a.x - b.x) < BLOCK_WIDTH && Math.abs(a.y - b.y) < BLOCK_HEIGHT
}

describe('layoutForest (temporary foundation layout)', () => {
  const rows = [
    row('root', 100),
    row('kid1', 90, { _branched_from: 'root' }),
    row('kid2', 95, { _branched_from: 'root' }),
    row('grand', 80, { _branched_from: 'kid1' }),
    row('next', 70, { _reset_from: 'root', parent_session_id: 'root' }),
    row('single-a', 60),
    row('single-b', 50)
  ]
  const positions = layoutForest(rows, graphLinks(rows))

  it('places every row', () => {
    assert.deepEqual([...positions.keys()].sort(), rows.map(r => r.id).sort())
  })

  it('puts children one column right of their parent', () => {
    assert.equal(positions.get('kid1')!.x, positions.get('root')!.x + BLOCK_WIDTH + 60)
    assert.equal(positions.get('grand')!.x, positions.get('kid1')!.x + BLOCK_WIDTH + 60)
  })

  it('stacks a reset successor under its predecessor family, same column', () => {
    assert.equal(positions.get('next')!.x, positions.get('root')!.x)
    assert.ok(positions.get('next')!.y > positions.get('kid1')!.y)
  })

  it('never overlaps two blocks', () => {
    const list = [...positions.entries()]

    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        assert.ok(!overlaps(list[i][1], list[j][1]), `${list[i][0]} overlaps ${list[j][0]}`)
      }
    }
  })

  it('is deterministic', () => {
    assert.deepEqual([...layoutForest(rows, graphLinks(rows))], [...positions])
  })

  it('survives a lineage cycle', () => {
    const cyclic = [row('a', 10, { _branched_from: 'b' }), row('b', 9, { _branched_from: 'a' })]
    const placed = layoutForest(cyclic, graphLinks(cyclic))

    assert.equal(placed.size, 2)
  })

  it('lays out 500 sessions quickly without overlap', () => {
    const many = Array.from({ length: 500 }, (_, i) =>
      row(`s${i}`, 10_000 - i, i % 10 && i < 100 ? { _branched_from: `s${i - 1}` } : {})
    )
    const started = performance.now()
    const placed = layoutForest(many, graphLinks(many))

    assert.equal(placed.size, 500)
    assert.ok(performance.now() - started < 500)
    const seen = new Set([...placed.values()].map(p => `${p.x},${p.y}`))

    assert.equal(seen.size, 500)
  })
})
