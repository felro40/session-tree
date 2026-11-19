/**
 * Card 12: the context figure (`contextFigure`, every style's one rule), its labels and tooltip,
 * the cache state, the Rich context bar, the Swimlanes lane header's lifetime label, and the
 * estimate store (batched, per profile, refetched on a new signature, failures shown as `—`).
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { ALL_PROJECTS, buildGraph } from '../../src/model/graph.ts'
import {
  BATCH_MS,
  ContextStore,
  INVALID_REASONS,
  MAX_BATCH,
  RETRY_AFTER_MS,
  cacheState,
  clockLabel,
  contextFigure,
  contextSignature,
  contextTooltip,
  fullNumber,
  lifetimeLine,
  needsEstimate,
  usableMeasurement,
  usedLabel,
  wantedOf
} from '../../src/model/context.ts'
import type { ContextAnswer, ContextEntry } from '../../src/model/context.ts'
import { dateTimeLabel } from '../../src/model/format.ts'
import type { SessionRow } from '../../src/model/sessions.ts'
import { TOKEN_BAR, contextBar, maxContextInScope } from '../../src/styles/rich/spec.ts'
import { laneTotalsLabel } from '../../src/styles/swimlanes/spec.ts'
import { row } from './fixtures.ts'

const SENT = 1_800_000_000
/** A row from a card-12 backend: the three fields present (null with no clock). */
const ctxRow = (id: string, extra: Partial<SessionRow> = {}): SessionRow =>
  row(id, { context_measured: null, context_invalid_reason: null, cache_window: null, input_tokens: 26000, output_tokens: 500, ...extra })
const clock = (tokens: number, confidence = 'proven') => ({ tokens, sent_at: SENT, confidence })
const loaded = (total: null | number, window: null | number = null): ContextEntry => ({
  status: 'loaded',
  sig: 's',
  estimate: total === null ? null : { total, categories: [{ id: 'conversation', label: 'Conversation', tokens: total }] },
  window
})

describe('contextFigure: the one rule', () => {
  it('a valid measurement with a known confidence is measured: the exact figure, `155k ctx`', () => {
    const figure = contextFigure(ctxRow('a', { context_measured: clock(154789) }), undefined)

    assert.equal(figure.kind, 'measured')
    assert.equal(figure.tokens, 154789)
    assert.equal(figure.label, '155k ctx')
    assert.equal(figure.value, '155k')
    assert.equal(figure.notMeasured, null)
    assert.deepEqual(figure.lines, [
      `Context: 154,789 tokens, measured at the last call (${dateTimeLabel(SENT)})`,
      "Leaves out that call's uncached input and its reply."
    ])
  })

  it('the measurement wins over a loaded estimate; a window adds the share', () => {
    const figure = contextFigure(ctxRow('a', { context_measured: clock(150000) }), loaded(90000, 200000))

    assert.equal(figure.kind, 'measured')
    assert.equal(figure.tokens, 150000)
    assert.equal(figure.window, 200000)
    assert.equal(figure.percent, 75)
    assert.equal(figure.lines.at(-1), 'Window: 150,000 / 200,000 (75%)')
  })

  it('a measured 0 is a measurement (`0 ctx`), not a missing one', () => {
    const figure = contextFigure(ctxRow('a', { context_measured: clock(0) }), undefined)

    assert.equal(figure.kind, 'measured')
    assert.equal(figure.tokens, 0)
    assert.equal(figure.label, '0 ctx')
  })

  for (const reason of ['compacted', 'route_changed', 'session_rotated', 'storage_unavailable']) {
    it(`an invalid reason (${reason}) makes it the estimate, with the reason named`, () => {
      const r = ctxRow('a', { context_measured: clock(154789), context_invalid_reason: reason })

      assert.equal(usableMeasurement(r), undefined)
      assert.equal(needsEstimate(r), true)
      const figure = contextFigure(r, loaded(107998))

      assert.equal(figure.kind, 'estimated')
      assert.equal(figure.tokens, 107998)
      assert.equal(figure.label, '~108k ctx')
      assert.equal(figure.notMeasured, `the last call's measurement no longer holds: ${INVALID_REASONS[reason]}`)
      assert.deepEqual(figure.lines, [
        'Context: ~107,998 tokens, estimated from the stored prompt, tools and transcript',
        `Not measured: the last call's measurement no longer holds: ${INVALID_REASONS[reason]}.`
      ])
    })
  }

  it('an unknown reason string is still named, verbatim', () => {
    assert.match(contextFigure(ctxRow('a', { context_measured: clock(5), context_invalid_reason: 'brand_new' }), loaded(9)).notMeasured ?? '', /brand_new$/)
  })

  it('confidence unknown (an implicit cache) is not used: the estimate', () => {
    const r = ctxRow('a', { context_measured: clock(83456, 'unknown') })
    const figure = contextFigure(r, loaded(101702))

    assert.equal(needsEstimate(r), true)
    assert.equal(figure.kind, 'estimated')
    assert.equal(figure.label, '~102k ctx')
    assert.match(figure.lines[1], /cache confidence is unknown/)
  })

  it('no clock: the estimate, "no prompt-cache call is stored"', () => {
    const figure = contextFigure(ctxRow('a'), loaded(4142))

    assert.equal(figure.kind, 'estimated')
    assert.equal(figure.label, '~4k ctx')
    assert.equal(figure.lines[1], 'Not measured: no prompt-cache call is stored for this session.')
  })

  it('no stored prompt (never ran): `— ctx`', () => {
    const figure = contextFigure(ctxRow('a'), loaded(null))

    assert.equal(figure.kind, 'none')
    assert.equal(figure.tokens, null)
    assert.equal(figure.label, '— ctx')
    assert.deepEqual(figure.lines, ['Context: none yet — the session has no stored system prompt (it never ran)'])
  })

  it('the estimate loading: `… ctx`; failed: `— ctx` with the failure in the tooltip', () => {
    const loading = contextFigure(ctxRow('a'), undefined)

    assert.equal(loading.kind, 'loading')
    assert.equal(loading.label, '… ctx')
    assert.equal(loading.lines[0], 'Context: estimating…')
    const failed = contextFigure(ctxRow('a'), { status: 'failed', sig: 's' })

    assert.equal(failed.kind, 'none')
    assert.equal(failed.label, '— ctx')
    assert.equal(failed.lines[0], 'Context: the estimate could not be loaded')
  })

  it('an older backend\'s row (no context fields): `— ctx`, never fetched, never throws', () => {
    const old = row('a', { input_tokens: 10, output_tokens: 5 })

    assert.equal(needsEstimate(old), false)
    const figure = contextFigure(old, undefined)

    assert.equal(figure.kind, 'none')
    assert.equal(figure.label, '— ctx')
    assert.deepEqual(figure.lines, ['Context: not reported by this Hermes backend'])
    assert.deepEqual(contextTooltip(old, undefined, SENT * 1000), [
      'Context: not reported by this Hermes backend',
      '15 tokens used (lifetime: input + output)',
      'Cache: no prompt-cache call stored'
    ])
  })

  it('a malformed measurement (negative, NaN) is not used', () => {
    assert.equal(usableMeasurement(ctxRow('a', { context_measured: clock(-1) })), undefined)
    assert.equal(usableMeasurement(ctxRow('a', { context_measured: clock(Number.NaN) })), undefined)
  })
})

describe('labels and the tooltip', () => {
  it('lifetime figures: `26k used`, full numbers in the tooltip', () => {
    assert.equal(usedLabel(26500), '27k used')
    assert.equal(fullNumber(154789), '154,789')
    assert.equal(fullNumber(null), '0')
    assert.equal(lifetimeLine(ctxRow('a')), '26,500 tokens used (lifetime: input + output)')
  })

  it('every block tooltip: the context lines, the lifetime line, the cache line', () => {
    const now = (SENT + 120) * 1000
    const r = ctxRow('a', {
      context_measured: clock(154789),
      cache_window: { state: 'warm', guaranteed_until: SENT + 3600, estimated_until: SENT + 3600, reason: 'r' }
    })

    assert.deepEqual(contextTooltip(r, undefined, now), [
      `Context: 154,789 tokens, measured at the last call (${dateTimeLabel(SENT)})`,
      "Leaves out that call's uncached input and its reply.",
      '26,500 tokens used (lifetime: input + output)',
      `Cache: warm until ${clockLabel(SENT + 3600, now)}`
    ])
  })

  it('the lane header keeps the lifetime sum, labelled used', () => {
    assert.equal(laneTotalsLabel(3, 41000), '3 sessions · 41k used')
    assert.equal(laneTotalsLabel(1, 0), '1 session · 0 used')
  })
})

describe('the cache state', () => {
  const window = { state: 'warm' as const, guaranteed_until: SENT + 300, estimated_until: SENT + 3600, reason: 'r' }

  it('warm until, may be warm until, expired (and how long ago), moving on with the clock', () => {
    assert.deepEqual(cacheState(window, (SENT + 10) * 1000), { state: 'warm', text: `warm until ${clockLabel(SENT + 300, (SENT + 10) * 1000)}` })
    assert.deepEqual(cacheState(window, (SENT + 400) * 1000), { state: 'may_be_warm', text: `may be warm until ${clockLabel(SENT + 3600, (SENT + 400) * 1000)}` })
    assert.deepEqual(cacheState(window, (SENT + 3600 + 7200) * 1000), { state: 'expired', text: 'expired 2h ago' })
    assert.deepEqual(cacheState({ ...window, state: 'may_be_warm' }, (SENT + 400) * 1000).state, 'may_be_warm')
    assert.deepEqual(cacheState({ ...window, state: 'expired' }, (SENT + 10) * 1000).state, 'expired')
  })

  it('unknown names the invalid reason, or says the confidence is unknown; none without a clock', () => {
    assert.deepEqual(cacheState({ state: 'unknown', guaranteed_until: null, estimated_until: null, reason: 'compacted' }, 0), {
      state: 'unknown',
      text: `unknown (${INVALID_REASONS.compacted})`
    })
    assert.equal(cacheState({ state: 'unknown', guaranteed_until: null, estimated_until: null, reason: 'implicit_cache_unobserved' }, 0).text, 'unknown (confidence unknown)')
    assert.deepEqual(cacheState(null, 0), { state: 'none', text: 'no prompt-cache call stored' })
  })

  it('a time on another day carries its date', () => {
    assert.equal(clockLabel(SENT, SENT * 1000 + 3 * 86_400_000), dateTimeLabel(SENT))
    assert.match(clockLabel(SENT, SENT * 1000), /^\d\d:\d\d$/)
  })
})

describe('the Rich context bar', () => {
  it('against the context window when it is known', () => {
    assert.deepEqual(contextBar(100000, 200000, 999999), { width: TOKEN_BAR / 2, scale: 'window', of: 200000 })
    assert.equal(contextBar(300000, 200000, 0).width, TOKEN_BAR)
  })

  it('else against the largest context in the scope; nothing for none / loading', () => {
    assert.deepEqual(contextBar(50, null, 200), { width: TOKEN_BAR / 4, scale: 'scope', of: 200 })
    assert.equal(contextBar(null, null, 200).width, 0)
    assert.equal(contextBar(10, null, 0).width, 0)
  })

  it('the scope max reads each in-scope session\'s figure', () => {
    const model = buildGraph([ctxRow('a'), ctxRow('b'), ctxRow('c')], [], { profile: 'default', showArchived: false, scope: ALL_PROJECTS })
    const figures: Record<string, null | number> = { a: 10, b: 30, c: null }

    assert.equal(maxContextInScope(model, node => figures[node.id] ?? null), 30)
  })
})

// --- the estimate store ---------------------------------------------------------------------------

function harness(answer: (profile: string, ids: string[]) => ContextAnswer | Error = (_p, ids) => ({ contexts: Object.fromEntries(ids.map(id => [id, { estimate: { total: 100, categories: [] }, context_window: null }])) })) {
  let now = 1_000_000
  const timers: { at: number; fn: () => void; live: boolean }[] = []
  const calls: { profile: string; ids: string[] }[] = []
  const resolvers: (() => void)[] = []
  const store = new ContextStore(
    (profile, ids) => {
      calls.push({ profile, ids })

      return new Promise<ContextAnswer>((resolve, reject) => {
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
    }
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

describe('the context estimate store', () => {
  it('batches one window into requests of at most 100 ids per profile', async () => {
    const h = harness()

    h.store.want(Array.from({ length: 150 }, (_, i) => want(`a${i}`)))
    h.store.want([want('w1', 's1', 'work'), undefined])
    assert.equal(h.calls.length, 0)
    h.advance(BATCH_MS)
    assert.deepEqual(
      h.calls.map(call => [call.profile, call.ids.length]),
      [
        ['default', MAX_BATCH],
        ['default', 50],
        ['work', 1]
      ]
    )
    await h.answerAll()
    assert.equal(h.store.size, 151)
    assert.deepEqual(h.store.get('a0'), { status: 'loaded', sig: 's1', estimate: { total: 100, categories: [] }, window: null })
  })

  it('asks again only for a new signature; an id the backend omits is a loaded `null` estimate', async () => {
    const h = harness((_p, ids) => ({ contexts: Object.fromEntries(ids.filter(id => id !== 'gone').map(id => [id, { estimate: null, context_window: 200000 }])) }))
    let notified = 0
    let every = 0

    h.store.subscribe('a', () => (notified += 1))
    h.store.subscribeAll(() => (every += 1))
    h.store.want([want('a'), want('gone')])
    h.advance(BATCH_MS)
    await h.answerAll()
    assert.equal(notified, 1)
    assert.equal(every, 2)
    assert.deepEqual(h.store.get('a'), { status: 'loaded', sig: 's1', estimate: null, window: 200000 })
    assert.deepEqual(h.store.get('gone'), { status: 'loaded', sig: 's1', estimate: null, window: null })
    h.store.want([want('a')])
    h.advance(BATCH_MS)
    assert.equal(h.calls.length, 1, 'current: not asked again')
    h.store.want([want('a', 's2')])
    h.advance(BATCH_MS)
    assert.deepEqual(h.calls[1].ids, ['a'])
  })

  it('a failure shows as failed (`—`) and is retried only after RETRY_AFTER_MS', async () => {
    const h = harness(() => new Error('404'))

    h.store.want([want('a')])
    h.advance(BATCH_MS)
    await h.answerAll()
    assert.deepEqual(h.store.get('a'), { status: 'failed', sig: 's1' })
    assert.equal(contextFigure(ctxRow('a'), h.store.get('a')).label, '— ctx')
    h.store.want([want('a')])
    h.advance(BATCH_MS)
    assert.equal(h.calls.length, 1)
    h.advance(RETRY_AFTER_MS)
    h.store.want([want('a')])
    h.advance(BATCH_MS)
    assert.equal(h.calls.length, 2)
  })

  it('malformed answers are cleaned; retain forgets other blocks; dispose stops requests', async () => {
    const h = harness(() => ({ contexts: { a: { estimate: { total: 50, categories: [{ id: 'x', label: 'X', tokens: 5 }, { id: 'bad', label: 'B', tokens: -1 } as never] }, context_window: -3 } } }))

    h.store.want([want('a'), want('b')])
    h.advance(BATCH_MS)
    await h.answerAll()
    assert.deepEqual(h.store.get('a'), { status: 'loaded', sig: 's1', estimate: { total: 50, categories: [{ id: 'x', label: 'X', tokens: 5 }] }, window: null })
    h.store.retain(['a'])
    assert.equal(h.store.get('b'), undefined)
    h.store.dispose()
    h.store.want([want('c')])
    h.advance(BATCH_MS)
    assert.equal(h.calls.length, 1)
  })

  it('the signature follows last activity, message count, transcript revision and the clock\'s validity', () => {
    const base = ctxRow('a', { last_active: 5, message_count: 3, transcript_revision: 1 })
    const sig = contextSignature(base)

    for (const change of [{ last_active: 6 }, { message_count: 4 }, { transcript_revision: 2 }, { context_invalid_reason: 'compacted' }, { context_measured: clock(1) }]) {
      assert.notEqual(contextSignature({ ...base, ...change }), sig, JSON.stringify(change))
    }

    assert.deepEqual(wantedOf({ id: 'node-a', profile: 'work', row: base }), { key: 'node-a', id: 'a', profile: 'work', sig })
    assert.equal(wantedOf({ id: 'x', profile: 'p' }), undefined)
  })
})
