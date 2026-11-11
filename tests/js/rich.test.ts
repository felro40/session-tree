/**
 * Card 6 (Rich cards): the details store (batched, viewport-near, cached per session, refetched
 * when a session changes), the top-down layout (the shared tidy layout transposed), the ports and
 * the routing chain with the soft-curve router, and the card's pure figures (token bar, model
 * chip, sparkline, tooltip).
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { ALL_PROJECTS, buildGraph } from '../../src/model/graph.ts'
import type { GraphModel } from '../../src/model/graph.ts'
import { GROUP_PREFIX, overlaps, rectOf } from '../../src/model/layout.ts'
import type { Point } from '../../src/model/layout.ts'
import { curveRouter } from '../../src/model/route.ts'
import type { LinkRouter } from '../../src/model/route.ts'
import type { SessionRow } from '../../src/model/sessions.ts'
import { createCanvasRouting } from '../../src/page/canvas-routing.ts'
import { BATCH_MS, DetailsStore, MAX_BATCH, MAX_ENTRIES, RETRY_AFTER_MS, detailsSignature, nearIds } from '../../src/styles/rich/details.ts'
import type { DetailsAnswer } from '../../src/styles/rich/details.ts'
import { layoutRich, transposedSpec } from '../../src/styles/rich/layout.ts'
import {
  LABEL_BAND,
  RICH_HEIGHT,
  RICH_WIDTH,
  TOKEN_BAR,
  activityTooltip,
  maxTokensInScope,
  richLayoutSpec,
  richPorts,
  shortModel,
  sparkPoints,
  tokenBarWidth
} from '../../src/styles/rich/spec.ts'
import { loadFixture, row } from './fixtures.ts'

// --- a fake clock + fetch for the store ---------------------------------------------------------

function harness(answer: (profile: string, ids: string[]) => DetailsAnswer | Error = (_p, ids) => ({ days: ['d'], details: Object.fromEntries(ids.map(id => [id, { excerpt: `x ${id}`, excerpt_role: 'assistant', activity: [0, 0, 0, 0, 0, 1, 2] }])) })) {
  let now = 1_000_000
  const timers: { at: number; fn: () => void; live: boolean }[] = []
  const calls: { profile: string; ids: string[]; tz: number }[] = []
  const resolvers: (() => void)[] = []
  const store = new DetailsStore(
    (profile, ids, tz) => {
      calls.push({ profile, ids, tz })

      return new Promise<DetailsAnswer>((resolve, reject) => {
        resolvers.push(() => {
          const value = answer(profile, ids)

          if (value instanceof Error) {
            reject(value)
          } else {
            resolve(value)
          }
        })
      })
    },
    {
      setTimeout(fn, ms) {
        const timer = { at: now + ms, fn, live: true }

        timers.push(timer)

        return () => {
          timer.live = false
        }
      },
      now: () => now
    },
    () => 120
  )

  return {
    store,
    calls,
    advance(ms: number) {
      now += ms

      for (const timer of timers.filter(each => each.live && each.at <= now)) {
        timer.live = false
        timer.fn()
      }
    },
    async answerAll() {
      for (const resolve of resolvers.splice(0)) {
        resolve()
      }

      await new Promise(resolve => setImmediate(resolve))
    }
  }
}

const want = (id: string, sig = 's1', profile = 'default') => ({ key: id, id, profile, sig })

describe('Rich details store', () => {
  it('batches the wants of one window into one request per profile, at most 100 ids each', async () => {
    const h = harness()

    h.store.want(Array.from({ length: 250 }, (_, i) => want(`a${i}`)))
    h.store.want([want('w1', 's1', 'work')])
    assert.equal(h.calls.length, 0, 'nothing goes out before the batch window')
    h.advance(BATCH_MS)
    assert.deepEqual(
      h.calls.map(call => [call.profile, call.ids.length, call.tz]),
      [
        ['default', MAX_BATCH, 120],
        ['default', MAX_BATCH, 120],
        ['default', 50, 120],
        ['work', 1, 120]
      ]
    )
    await h.answerAll()
    assert.equal(h.store.get('a7')?.details?.excerpt, 'x a7')
    assert.deepEqual(h.store.get('w1')?.details?.activity, [0, 0, 0, 0, 0, 1, 2])
  })

  it('a current entry is never asked for again; a new signature is, and the old details stay shown until the answer', async () => {
    const h = harness()

    h.store.want([want('a', 's1'), want('b', 's1')])
    h.advance(BATCH_MS)
    await h.answerAll()
    const first = h.store.get('a')

    h.store.want([want('a', 's1'), want('b', 's1')])
    h.advance(BATCH_MS)
    assert.equal(h.calls.length, 1, 'current entries were asked for again')

    // `a` changed (sessions.changed → a refetched row with a new count): only `a` goes out.
    h.store.want([want('a', 's2'), want('b', 's1')])
    h.advance(BATCH_MS)
    assert.deepEqual(h.calls[1].ids, ['a'])
    assert.equal(h.store.get('a'), first, 'the old entry is kept while the new one loads (no skeleton flash)')
    // Asked again while in flight: no second request.
    h.store.want([want('a', 's2')])
    h.advance(BATCH_MS)
    assert.equal(h.calls.length, 2)
    await h.answerAll()
    assert.equal(h.store.get('a')?.sig, 's2')
  })

  it('an unknown id gets a null entry; a failure is not retried for a while, then is', async () => {
    let fail = true
    const h = harness((_p, ids) => (fail ? new Error('down') : { days: [], details: Object.fromEntries(ids.filter(id => id !== 'gone').map(id => [id, { excerpt: null, excerpt_role: null, activity: [1, 2, 3, 4, 5, 6, 7] }])) }))

    h.store.want([want('a'), want('gone')])
    h.advance(BATCH_MS)
    await h.answerAll()
    assert.equal(h.store.get('a'), undefined)
    h.store.want([want('a'), want('gone')])
    h.advance(BATCH_MS)
    assert.equal(h.calls.length, 1, 'a failed id was retried at once')
    fail = false
    h.advance(RETRY_AFTER_MS)
    h.store.want([want('a'), want('gone')])
    h.advance(BATCH_MS)
    await h.answerAll()
    assert.equal(h.calls.length, 2)
    assert.equal(h.store.get('a')?.details?.excerpt, null)
    assert.equal(h.store.get('gone')?.details, null)
  })

  it('an answer notifies only the cards it is for; a superseded answer is dropped', async () => {
    const h = harness()
    const seen: string[] = []

    h.store.subscribe('a', () => seen.push('a'))
    h.store.subscribe('b', () => seen.push('b'))
    h.store.want([want('a', 's1')])
    h.advance(BATCH_MS)
    // A newer signature goes out before the first answer lands.
    h.store.want([want('a', 's2')])
    h.advance(BATCH_MS)
    await h.answerAll()
    assert.deepEqual(seen, ['a'], 'only the current answer notifies, and only card a')
    assert.equal(h.store.get('a')?.sig, 's2')
  })

  it('card-6 review r1 N5: retain drops the entries, failure marks, wants and answers in flight of every card not in the loaded data, and bounds the cache', async () => {
    const h = harness()

    h.store.want([want('keep'), want('gone')])
    h.advance(BATCH_MS)
    await h.answerAll()
    assert.equal(h.store.size, 2)
    // A want queued and an answer in flight for a session that then leaves the data.
    h.store.want([want('late', 's1')])
    h.advance(BATCH_MS)
    h.store.want([want('queued', 's1')])
    h.store.retain(['keep'])
    h.advance(BATCH_MS)
    await h.answerAll()
    assert.equal(h.store.get('gone'), undefined, 'a session no longer loaded is still cached')
    assert.equal(h.store.get('late'), undefined, 'an answer for a dropped session was kept')
    assert.ok(h.store.get('keep'))
    assert.equal(h.store.size, 1)
    assert.ok(!h.calls.some(call => call.ids.includes('queued')), 'a dropped want still went out')
    // Asked for again later, a dropped session is fetched again (nothing stale remains).
    h.store.want([want('gone')])
    h.advance(BATCH_MS)
    assert.deepEqual(h.calls[h.calls.length - 1].ids, ['gone'])
    // The bound: never more than MAX_ENTRIES, whatever the caller retains.
    const many = Array.from({ length: MAX_ENTRIES + 50 }, (_, i) => want(`m${i}`))

    h.store.want(many)
    h.advance(BATCH_MS)
    await h.answerAll()
    h.store.retain(many.map(each => each.key))
    assert.equal(h.store.size, MAX_ENTRIES)
    assert.ok(h.store.get(`m${MAX_ENTRIES + 49}`) && !h.store.get('m0'), 'the oldest entries go first')
  })

  it('keys entries by the card (node id), asking the backend for the stored id', async () => {
    const h = harness()

    h.store.want([{ key: 'work/st-1', id: 'st-1', profile: 'work', sig: 's' }])
    h.advance(BATCH_MS)
    await h.answerAll()
    assert.deepEqual(h.calls[0].ids, ['st-1'])
    assert.equal(h.store.get('work/st-1')?.details?.excerpt, 'x st-1')
    assert.equal(h.store.get('st-1'), undefined)
  })

  it('the signature follows the row, the local day and the offset', () => {
    const base = { last_active: 100, message_count: 4 }
    const noon = Date.UTC(2026, 10, 10, 12)

    assert.equal(detailsSignature(base, noon, 0), detailsSignature({ ...base }, noon + 3600_000, 0))
    assert.notEqual(detailsSignature(base, noon, 0), detailsSignature({ ...base, message_count: 6 }, noon, 0))
    assert.notEqual(detailsSignature(base, noon, 0), detailsSignature(base, noon + 13 * 3600_000, 0), 'a new local day')
    assert.notEqual(detailsSignature(base, noon, 0), detailsSignature(base, noon, 60))
  })
})

describe('nearIds (the cards in or near the viewport)', () => {
  const rects: [string, { x: number; y: number; width: number; height: number }][] = [
    ['in', { x: 100, y: 100, width: 280, height: 164 }],
    ['near', { x: 1300, y: 100, width: 280, height: 164 }],
    ['far', { x: 4000, y: 100, width: 280, height: 164 }],
    ['above', { x: 100, y: -1000, width: 280, height: 164 }]
  ]

  it('takes the viewport grown by half its size on each side', () => {
    // A 1000 × 800 canvas at zoom 1, no pan: flow [0,1000] × [0,800], grown to [-500,1500] × [-400,1200].
    assert.deepEqual(nearIds(rects, { x: 0, y: 0, zoom: 1 }, 1000, 800), ['in', 'near'])
    assert.deepEqual(nearIds(rects, { x: 0, y: 0, zoom: 1 }, 1000, 800, 0), ['in'])
  })

  it('follows pan and zoom', () => {
    // Panned 3600 px left at zoom 1: flow [3600,4600] (grown [3100,5100]).
    assert.deepEqual(nearIds(rects, { x: -3600, y: 0, zoom: 1 }, 1000, 800), ['far'])
    // Zoomed out to 0.3: flow [0,3333] × [0,2667] grown by half: everything but nothing missed.
    assert.deepEqual(nearIds(rects, { x: 0, y: 0, zoom: 0.3 }, 1000, 800), ['in', 'near', 'far', 'above'])
    assert.deepEqual(nearIds(rects, { x: 0, y: 0, zoom: 0 }, 1000, 800), [])
  })
})

// --- layout ------------------------------------------------------------------------------------

const fixture = loadFixture('default')
const graph = (rows: SessionRow[], scope = ALL_PROJECTS): GraphModel => buildGraph(rows, fixture.projects, { profile: 'default', showArchived: false, scope })

function blockRects(model: GraphModel, positions: ReadonlyMap<string, Point>) {
  return [...positions].filter(([id]) => !id.startsWith(GROUP_PREFIX) && model.nodeById.has(id)).map(([id, point]) => ({ id, ...rectOf(id, point, richLayoutSpec({ showAll: false })) }))
}

describe('Rich layout (the tidy layout, top-down)', () => {
  const spec = richLayoutSpec({ showAll: false })
  const model = graph(fixture.rows)
  const { positions, labels } = layoutRich(model, undefined, spec)

  it('a parent sits above its children, siblings on one row, children centred under it', () => {
    let checked = 0

    for (const [child, parent] of model.parentOf) {
      const p = positions.get(parent)
      const c = positions.get(child)

      if (!p || !c) {
        continue
      }

      assert.ok(c.y >= p.y + RICH_HEIGHT + spec.rowGap - 0.01, `${child} is not below ${parent}`)
      checked += 1
    }

    assert.ok(checked >= 5, `only ${checked} parent/child pairs`)
    const kids = (model.childrenOf.get('st-hp-root') ?? []).map(id => positions.get(id)!)

    assert.ok(kids.length >= 2 && kids.every(kid => kid.y === kids[0].y), 'siblings share a row')
    const centre = (kids[0].x + kids[kids.length - 1].x) / 2

    assert.ok(Math.abs(positions.get('st-hp-root')!.x - centre) < 0.01, 'the parent is centred on its children')
  })

  it('no two cards overlap; each project label sits above its group\'s cards; the canvas is packed near 16:10, not one long row', () => {
    const rects = blockRects(model, positions)

    for (let i = 0; i < rects.length; i += 1) {
      for (let j = i + 1; j < rects.length; j += 1) {
        assert.ok(!overlaps(rects[i], rects[j]), `${rects[i].id} overlaps ${rects[j].id}`)
      }
    }

    assert.ok(rects.every(rect => rect.y >= LABEL_BAND))
    assert.ok(labels.length >= 3)

    for (const label of labels) {
      const at = positions.get(label.id)!
      // A family is grouped under its first root's project (a family split across two projects too).
      const ids = new Set(model.families.filter(family => (family.projectId ?? '__no_project__') === (label.projectId ?? '__no_project__')).flatMap(family => family.nodeIds))
      const group = rects.filter(rect => ids.has(rect.id))

      assert.ok(group.length > 0 && group.every(rect => rect.y >= at.y + LABEL_BAND - 0.01), `label ${label.id} is not above its cards`)
    }

    const width = Math.max(...rects.map(rect => rect.x + rect.width))
    const height = Math.max(...rects.map(rect => rect.y + rect.height))

    assert.ok(width / height > 0.8 && width / height < 3, `canvas ${width} × ${height}`)
  })

  it('a "continued as" successor stands to the right of its predecessor', () => {
    const [from, to] = ['st-md-tip', 'st-md-v2'].map(id => positions.get(id)!)

    assert.ok(to.x >= from.x + RICH_WIDTH, `successor at ${to.x}, predecessor at ${from.x}`)
  })

  it('a merge keeps every placed card (the same objects) and places a new child under its parent', () => {
    const dragged = new Map(positions)

    dragged.set('st-hp-routing', { x: positions.get('st-hp-routing')!.x + 37.3, y: positions.get('st-hp-routing')!.y + 11.7 })
    const parent = fixture.rows.find(r => r.id === 'st-hp-root')!
    const child = row('st-hp-new', { ...parent, id: 'st-hp-new', _branched_from: parent.id, parent_session_id: parent.id, started_at: (parent.started_at ?? 0) + 9000, last_active: (parent.started_at ?? 0) + 9500 })
    const next = graph([...fixture.rows, child])
    const merged = layoutRich(next, dragged, spec)

    for (const [id, point] of dragged) {
      assert.equal(merged.positions.get(id), point, `${id} moved or was copied`)
    }

    const placed = merged.positions.get('st-hp-new')!
    const p = merged.positions.get('st-hp-root')!

    assert.ok(placed.y >= p.y + RICH_HEIGHT, 'the new child is not below its parent')
    const rects = blockRects(next, merged.positions)

    assert.ok(rects.filter(rect => rect.id !== 'st-hp-new').every(rect => !overlaps(rect, rects.find(each => each.id === 'st-hp-new')!)), 'the new child overlaps a card')
  })

  it('Show all on the 500-session fixture after a saved layout without singles: all 400 singles placed, no overlap, quickly', () => {
    const scale = loadFixture('scale')
    const off = richLayoutSpec({ showAll: false })
    const on = richLayoutSpec({ showAll: true })
    const big = buildGraph(scale.rows, scale.projects, { profile: 'scale', showArchived: false, scope: ALL_PROJECTS })
    const saved = layoutRich(big, undefined, off).positions
    const started = performance.now()
    const merged = layoutRich(big, saved, on)
    const ms = performance.now() - started
    const rects = blockRects(big, merged.positions)

    assert.equal(rects.length, big.nodes.length)

    for (let i = 0; i < rects.length; i += 1) {
      for (let j = i + 1; j < rects.length; j += 1) {
        assert.ok(!overlaps(rects[i], rects[j]), `${rects[i].id} overlaps ${rects[j].id}`)
      }
    }

    assert.ok(ms < 1500, `${ms} ms`)
  })

  it('card-6 review r1 N1: a new card stays inside its own group — never in another group\'s shelf segment; when its group has no room there, under a continuation label of its group', () => {
    const base = layoutRich(graph(fixture.rows), undefined, spec)
    const cases: Record<string, { x: number; y: number }> = {}

    for (const parentId of ['st-hp-root', 'st-sys-reply', 'st-md-redline', 'st-orphan-child', 'st-split-child', 'st-sys-pairing']) {
      const parent = fixture.rows.find(r => r.id === parentId)!
      const child = row('st-new', { ...parent, id: 'st-new', _branched_from: parent.id, parent_session_id: parent.id, _reset_from: undefined, _lineage_root_id: undefined, started_at: (parent.started_at ?? 0) + 9000, last_active: (parent.started_at ?? 0) + 9500 })
      const next = graph([...fixture.rows, child])
      const merged = layoutRich(next, base.positions, spec)
      const at = merged.positions.get('st-new')!
      const cx = at.x + RICH_WIDTH / 2
      const cy = at.y + RICH_HEIGHT / 2
      // The label that owns the card's spot: on the lowest shelf row at or above it, the last label left of it (the row's first owns its left).
      const labels = [...merged.positions].filter(([id]) => id.startsWith(GROUP_PREFIX)).map(([id, p]) => ({ id, ...p }))
      const rowY = Math.max(...labels.filter(label => label.y <= cy).map(label => label.y))
      const shelf = labels.filter(label => label.y === rowY).sort((a, b) => a.x - b.x)
      const owner = [...shelf].reverse().find(label => label.x <= cx) ?? shelf[0]
      const family = next.families.find(each => each.nodeIds.includes('st-new'))!

      for (const [id, point] of base.positions) {
        assert.equal(merged.positions.get(id), point, `${id} moved`)
      }

      assert.equal(owner.id.split('\u001f')[0], `${GROUP_PREFIX}${family.projectId ?? '__no_project__'}`, `the new child of ${parentId} at ${JSON.stringify(at)} is in ${owner.id}'s segment`)
      cases[parentId] = at
    }

    // The review's probe: st-hp-root's new child used to land 1553 px away, in mdesign's shelf.
    assert.ok(cases['st-hp-root'].x + RICH_WIDTH / 2 < base.positions.get('group:/e2e/projects/mdesign')!.x, `hp child at ${JSON.stringify(cases['st-hp-root'])}`)
  })

  it('card-7 review r1 finding 4: a branch of a parent on its group\'s last shelf row stays in its group, next to the parent — not under a continuation label', () => {
    const base = layoutRich(graph(fixture.rows), undefined, spec)
    const labels = [...base.positions].filter(([id]) => id.startsWith(GROUP_PREFIX)).map(([id, p]) => ({ id, ...p }))
    const ownerOf = (at: { x: number; y: number }) => {
      const cx = at.x + RICH_WIDTH / 2
      const cy = at.y + RICH_HEIGHT / 2
      const rowY = Math.max(...labels.filter(label => label.y <= cy).map(label => label.y))
      const shelf = labels.filter(label => label.y === rowY).sort((a, b) => a.x - b.x)

      return ([...shelf].reverse().find(label => label.x <= cx) ?? shelf[0]).id.split('\u001f')[0]
    }
    // 4892ca9 (before the N1 fix) put these children 430 px and 264 px from the parent, ff5475c
    // 1,392 and 1,381 px (under a continuation label). The bound is the 4892ca9 distance, except
    // where that spot was in another group's segment: st-md-redline's 264 px spot is directly
    // below it, in the no-project group's segment (asserted below); the nearest spot in mdesign's
    // own segment is one column right on the parent's own row, 340 px (a card is 280 wide + 60 gap).
    const bounds: Record<string, number> = { 'st-sys-reply': 430, 'st-md-redline': 340 }

    for (const [parentId, bound] of Object.entries(bounds)) {
      const parent = fixture.rows.find(r => r.id === parentId)!
      const child = row('st-new', { ...parent, id: 'st-new', _branched_from: parent.id, parent_session_id: parent.id, _reset_from: undefined, _lineage_root_id: undefined, started_at: (parent.started_at ?? 0) + 9000, last_active: (parent.started_at ?? 0) + 9500 })
      const next = graph([...fixture.rows, child])
      const merged = layoutRich(next, base.positions, spec)
      const at = merged.positions.get('st-new')!
      const p = merged.positions.get(parentId)!
      const family = next.families.find(each => each.nodeIds.includes('st-new'))!
      const distance = Math.hypot(at.x - p.x, at.y - p.y)

      for (const [id, point] of base.positions) {
        assert.equal(merged.positions.get(id), point, `${id} moved`)
      }

      assert.ok(![...merged.positions.keys()].some(id => id.includes('\u001f')), `a continuation label for ${parentId}'s child`)
      assert.equal(ownerOf(at), `${GROUP_PREFIX}${family.projectId ?? '__no_project__'}`, `${parentId}'s child at ${JSON.stringify(at)} is in another group's segment`)
      assert.ok(distance <= bound, `${parentId}'s child at ${JSON.stringify(at)}, ${Math.round(distance)} px from the parent (bound ${bound})`)
    }

    const redline = base.positions.get('st-md-redline')!

    assert.equal(ownerOf({ x: redline.x, y: redline.y + RICH_HEIGHT + spec.rowGap }), `${GROUP_PREFIX}__no_project__`, 'the spot below st-md-redline is not in another group')
  })

  it('the transposed spec swaps sizes and gaps', () => {
    const t = transposedSpec(spec)

    assert.deepEqual([t.nodeWidth, t.nodeHeight, t.columnGap, t.rowGap, t.labelHeight], [RICH_HEIGHT, RICH_WIDTH, spec.rowGap, spec.columnGap, 0])
  })
})

// --- ports + routing ---------------------------------------------------------------------------

function counting(base: LinkRouter): LinkRouter & { calls: number } {
  const router = { calls: 0, shape: base.shape, live: base.live, route(input: Parameters<LinkRouter['route']>[0]) { router.calls += 1; return base.route(input) } }

  return router
}

describe('Rich ports and routing (R13)', () => {
  const a = { x: 0, y: 0, width: RICH_WIDTH, height: RICH_HEIGHT }
  const b = { x: 400, y: 300, width: RICH_WIDTH, height: RICH_HEIGHT }

  it('branch: bottom centre → top centre; continued as: right edge → left edge', () => {
    assert.deepEqual(richPorts('branch', a, b), { from: { x: 140, y: 164, dir: 'down' }, to: { x: 540, y: 300, dir: 'up' } })
    assert.deepEqual(richPorts('reset', a, b), { from: { x: 280, y: 82, dir: 'right' }, to: { x: 400, y: 382, dir: 'left' } })
  })

  it('a content-only refetch routes nothing; a drop across a link detours it, once', () => {
    const spec = richLayoutSpec({ showAll: false })
    const routing = createCanvasRouting()
    const router = counting(curveRouter)
    const model = graph(fixture.rows)
    const { positions } = layoutRich(model, undefined, spec)
    const view = (m: GraphModel, p: ReadonlyMap<string, Point>) => routing.get({ model: m, spec, positions: p, ports: richPorts, router })
    const first = view(model, positions)
    const calls = router.calls

    // Details and a chat turn: new row objects, same structure.
    const bumped = graph(fixture.rows.map(each => (each.id === 'st-hp-root' ? { ...each, message_count: (each.message_count ?? 0) + 2 } : { ...each })))

    assert.equal(view(bumped, positions).routes, first.routes)
    assert.equal(router.calls, calls)

    // Drop st-hp-routing further down, then a card right between it and its parent st-hp-root.
    const p = positions.get('st-hp-root')!
    const c = { x: positions.get('st-hp-routing')!.x, y: positions.get('st-hp-routing')!.y + 500 }
    const blocker = [...positions.keys()].find(id => !id.startsWith(GROUP_PREFIX) && model.nodeById.get(id)?.single === false && !['st-hp-root', 'st-hp-routing', 'st-hp-mockup'].includes(id))!
    const moved = new Map(positions)
    const midX = (p.x + c.x) / 2
    const midY = (p.y + RICH_HEIGHT + c.y) / 2

    moved.set('st-hp-routing', c)
    moved.set(blocker, { x: midX, y: midY - RICH_HEIGHT / 2 })
    const dropped = view(bumped, moved)
    const link = model.edges.find(edge => edge.source === 'st-hp-root' && edge.target === 'st-hp-routing')!

    assert.equal(routing.routed, 2, 'the drop routed once')
    assert.equal(dropped.routes.get(link.id)?.route.detoured, true, 'the crossed link detours')
  })
})

// --- the card's figures --------------------------------------------------------------------------

describe('Rich card figures', () => {
  it('the token bar is tokens / max of its width; the scale is the largest session in scope', () => {
    assert.equal(tokenBarWidth(50, 200), TOKEN_BAR / 4)
    assert.equal(tokenBarWidth(200, 200), TOKEN_BAR)
    assert.equal(tokenBarWidth(10, 0), 0)
    const all = graph(fixture.rows)
    const sizes = all.nodes.filter(node => node.kind === 'session').map(node => (node.row?.input_tokens ?? 0) + (node.row?.output_tokens ?? 0))

    assert.equal(maxTokensInScope(all), Math.max(...sizes))
    const scoped = graph(fixture.rows, all.projects.find(project => project.label === 'mdesign')!.id)
    const inScope = scoped.nodes.filter(node => node.kind === 'session' && !node.outOfScope).map(node => (node.row?.input_tokens ?? 0) + (node.row?.output_tokens ?? 0))

    assert.equal(maxTokensInScope(scoped), Math.max(...inScope))
    assert.ok(maxTokensInScope(scoped) < maxTokensInScope(all), 'the scope did not narrow the scale')
  })

  it('model chip, sparkline points and the per-day tooltip', () => {
    assert.equal(shortModel('claude-opus-4.1'), 'opus-4.1')
    assert.equal(shortModel('anthropic/claude-sonnet-5'), 'sonnet-5')
    assert.equal(shortModel(null), '—')
    const points = sparkPoints([0, 1, 2, 3, 4, 5, 6])

    assert.equal(points.length, 7)
    assert.equal(points[0].x, 2)
    assert.equal(points[6].x, 48)
    assert.equal(points[6].y, 3, 'the top value reaches the top margin')
    assert.equal(points[0].y, 16)
    const tip = activityTooltip([0, 1, 0, 0, 0, 0, 3], ['2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10'])

    assert.match(tip, /^Last 7 days\nWed 11-04: 0 msgs\nThu 11-05: 1 msg\n/)
    assert.match(tip, /Tue 11-10: 3 msgs$/)
  })
})
