import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { withTimeout } from '../../src/model/timeout.ts'

/** Manual timer: `fire()` runs the pending callback; `cancelled` tells whether it was cleared. */
function manualTimer() {
  let pending: (() => void) | undefined
  const timer = {
    cancelled: false,
    set(fn: () => void): () => void {
      pending = fn

      return () => {
        timer.cancelled = true
        pending = undefined
      }
    },
    fire() {
      pending?.()
    }
  }

  return timer
}

describe('withTimeout (carry-forward 4: no endless "Loading sessions…")', () => {
  it('an answer that never comes rejects after the timeout', async () => {
    const timer = manualTimer()
    const never = new Promise<never>(() => undefined)
    const bounded = withTimeout(never, 8000, fn => timer.set(fn), 'projects.tree did not answer in 8 s')

    timer.fire()
    await assert.rejects(bounded, /did not answer in 8 s/)
  })

  it('an answer in time resolves and clears the timer; a failure passes through', async () => {
    const ok = manualTimer()

    assert.equal(await withTimeout(Promise.resolve(42), 8000, fn => ok.set(fn), 'late'), 42)
    assert.equal(ok.cancelled, true)
    const failed = manualTimer()

    await assert.rejects(withTimeout(Promise.reject(new Error('boom')), 8000, fn => failed.set(fn), 'late'), /boom/)
    assert.equal(failed.cancelled, true)
  })
})
