import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { LayoutResult, Point } from '../../src/model/layout.ts'
import { CACHE_KEY, isRefusal, LayoutSync, PENDING_KEY } from '../../src/model/layout-sync.ts'
import type { LayoutRef, PositionsBody, StateAnswer, StateSnapshot, StoredLayouts, SyncedSettings, SyncTransport } from '../../src/model/layout-sync.ts'

/** An in-memory backend with the store's semantics (set / if_absent / delete / put / forget). */
class FakeServer implements SyncTransport {
  rev = 0
  settings: SyncedSettings = { style: null, snap: false }
  layouts: Record<string, StoredLayouts> = {}
  down = false
  refuse = false
  calls: string[] = []
  gate?: Promise<void>

  private async enter(name: string): Promise<void> {
    this.calls.push(name)

    if (this.gate) {
      await this.gate
    }

    if (this.down) {
      throw new Error('fetch failed')
    }

    if (this.refuse && name !== 'get') {
      throw new Error('413: {"detail":"too many"}')
    }
  }

  private blocks(profile: string, style: string, scope: string) {
    const styles = (this.layouts[profile] ??= {})
    const scopes = (styles[style] ??= {})

    return (scopes[scope] ??= {})
  }

  async getState(profile: string, sinceRev?: number): Promise<StateAnswer> {
    await this.enter('get')

    if (sinceRev === this.rev) {
      return { schema: 1, rev: this.rev, unchanged: true }
    }

    return structuredClone({ schema: 1, rev: this.rev, settings: this.settings, layouts: this.layouts[profile] ?? {} })
  }

  async patchPositions(profile: string, body: PositionsBody) {
    await this.enter(`patch:${body.mode}:${body.positions.length}`)
    const blocks = this.blocks(profile, body.style, body.scope)
    let changed = false

    for (const entry of body.positions) {
      if (body.mode === 'if_absent' && blocks[entry.id]) {
        continue
      }

      blocks[entry.id] = { x: entry.x, y: entry.y, updated_at: this.rev + 1 }
      changed = true
    }

    if (changed) {
      this.rev += 1
    }

    return { rev: this.rev, changed }
  }

  async patchSettings(_profile: string, patch: Partial<SyncedSettings>) {
    await this.enter('settings')
    this.settings = { ...this.settings, ...patch }
    this.rev += 1

    return { rev: this.rev, changed: true, settings: this.settings }
  }

  async deleteLayout(profile: string, style: string, scope: string) {
    await this.enter('delete')
    delete this.layouts[profile]?.[style]?.[scope]
    this.rev += 1

    return { rev: this.rev, changed: true }
  }

  async putLayout(profile: string, body: { style: string; scope: string; positions: { id: string; x: number; y: number }[] }) {
    await this.enter('put')
    const blocks = this.blocks(profile, body.style, body.scope)

    for (const key of Object.keys(blocks)) {
      delete blocks[key]
    }

    for (const entry of body.positions) {
      blocks[entry.id] = { x: entry.x, y: entry.y, updated_at: this.rev + 1 }
    }

    this.rev += 1

    return { rev: this.rev, changed: true }
  }

  async forgetBlocks(profile: string, ids: string[]) {
    await this.enter('forget')

    for (const scopes of Object.values(this.layouts[profile] ?? {})) {
      for (const blocks of Object.values(scopes)) {
        for (const id of ids) {
          delete blocks[id]
        }
      }
    }

    this.rev += 1

    return { rev: this.rev, changed: true }
  }

  stored(profile: string, style: string, scope: string): Record<string, [number, number]> {
    return Object.fromEntries(Object.entries(this.layouts[profile]?.[style]?.[scope] ?? {}).map(([id, entry]) => [id, [entry.x, entry.y]]))
  }
}

/** Manual timers: `run()` fires what is due; `advance(ms)` moves the clock. */
class FakeTimers {
  now = 0
  private next = 0
  private readonly queue = new Map<number, { at: number; fn: () => void }>()

  setTimeout(fn: () => void, ms: number): () => void {
    const id = (this.next += 1)

    this.queue.set(id, { at: this.now + ms, fn })

    return () => this.queue.delete(id)
  }

  get pending(): number[] {
    return [...this.queue.values()].map(entry => entry.at - this.now)
  }

  async advance(ms: number): Promise<void> {
    const until = this.now + ms

    for (;;) {
      const due = [...this.queue].filter(([, entry]) => entry.at <= until).sort((a, b) => a[1].at - b[1].at)[0]

      if (!due) {
        break
      }

      this.queue.delete(due[0])
      this.now = Math.max(this.now, due[1].at)
      due[1].fn()
      await settle()
    }

    this.now = until
    await settle()
  }
}

class MemoryStorage {
  readonly data = new Map<string, string>()

  get<T>(key: string, fallback: T): T {
    const raw = this.data.get(key)

    return raw === undefined ? fallback : (JSON.parse(raw) as T)
  }

  set(key: string, value: unknown): void {
    this.data.set(key, JSON.stringify(value))
  }
}

async function settle(): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    await Promise.resolve()
  }
}

const REF: LayoutRef = { profile: 'default', style: 'dense', scope: 'all' }

function setup({ server = new FakeServer(), storage = new MemoryStorage(), timers = new FakeTimers() } = {}) {
  const refused: unknown[] = []
  const sync = new LayoutSync(server, storage, timers, { onRefused: error => refused.push(error) })

  return { server, storage, timers, sync, refused }
}

/** A stand-in auto-layout: everything not in `previous` goes to (index·100, 0). */
const autoLayout =
  (ids: string[]) =>
  (previous: ReadonlyMap<string, Point> | undefined): LayoutResult => {
    const positions = new Map(previous ?? [])

    ids.forEach((id, index) => {
      if (!positions.has(id)) {
        positions.set(id, { x: index * 100, y: 0 })
      }
    })

    return { positions, labels: [] }
  }

const pointsOf = (map: ReadonlyMap<string, Point>) => Object.fromEntries([...map].map(([id, point]) => [id, [point.x, point.y]]))

describe('LayoutSync: load, place, drop', () => {
  it('waits for the first fetch, then places and saves the auto-layout once (if_absent)', async () => {
    const { server, timers, sync } = setup()

    assert.equal(sync.settled('default'), false)
    sync.watch('default')
    await settle()
    assert.equal(sync.settled('default'), true)
    assert.equal(sync.status('default'), 'online')

    sync.place(REF, autoLayout(['a', 'b']))
    sync.place(REF, autoLayout(['a', 'b'])) // a re-render: nothing new
    assert.deepEqual(server.calls, ['get'])
    await timers.advance(300)
    assert.deepEqual(server.calls, ['get', 'patch:if_absent:2'])
    assert.deepEqual(server.stored('default', 'dense', 'all'), { a: [0, 0], b: [100, 0] })
  })

  it('debounces and batches drops: several drops within 300 ms are one request', async () => {
    const { server, timers, sync } = setup()

    sync.watch('default')
    await settle()
    sync.drop(REF, new Map([['a', { x: 1, y: 1 }]]))
    await timers.advance(200)
    sync.drop(REF, new Map([['b', { x: 2, y: 2 }]]))
    await timers.advance(200)
    sync.drop(REF, new Map([['a', { x: 3, y: 3 }]]))
    assert.deepEqual(server.calls, ['get'])
    await timers.advance(300)
    assert.deepEqual(server.calls, ['get', 'patch:set:2'])
    assert.deepEqual(server.stored('default', 'dense', 'all'), { a: [3, 3], b: [2, 2] })
  })

  it('a poll or push that answers right after a drop does not flush it before the debounce', async () => {
    const { server, timers, sync } = setup()

    sync.watch('default')
    await settle()
    sync.drop(REF, new Map([['a', { x: 1, y: 1 }]]))
    await timers.advance(100)
    sync.poll()
    sync.onRemoteChange({ rev: 99, profile: 'default' })
    await settle()
    await timers.advance(100)
    assert.ok(!server.calls.some(call => call.startsWith('patch')), `flushed early: ${server.calls.join(', ')}`)
    await timers.advance(150)
    assert.ok(server.calls.includes('patch:set:1'))
  })

  it('sends nothing while a block is dragged; the drop goes out after the drag ends', async () => {
    const { server, timers, sync } = setup()

    sync.watch('default')
    await settle()
    sync.place(REF, autoLayout(['a']))
    sync.setDragging(['a'])
    await timers.advance(5000)
    assert.deepEqual(server.calls, ['get'])
    sync.drop(REF, new Map([['a', { x: 40, y: 50 }]]))
    await timers.advance(5000)
    assert.deepEqual(server.calls, ['get'])
    sync.setDragging(null)
    await timers.advance(300)
    assert.deepEqual(server.calls.slice(1), ['patch:if_absent:1', 'patch:set:1'])
    assert.deepEqual(server.stored('default', 'dense', 'all'), { a: [40, 50] })
  })

  it('a stored position wins over the auto-layout, and new blocks are placed around it', async () => {
    const server = new FakeServer()

    server.layouts.default = { dense: { all: { a: { x: 500, y: 500, updated_at: 1 } } } }
    server.rev = 1
    const { sync, timers } = setup({ server })

    sync.watch('default')
    await settle()
    const result = sync.place(REF, autoLayout(['a', 'b']))

    assert.deepEqual(pointsOf(result.positions), { a: [500, 500], b: [100, 0] })
    await timers.advance(300)
    assert.deepEqual(server.stored('default', 'dense', 'all'), { a: [500, 500], b: [100, 0] })
  })

  it('a late if_absent save never overwrites another window\'s drop', async () => {
    const server = new FakeServer()
    const one = setup({ server })
    const two = setup({ server })

    one.sync.watch('default')
    two.sync.watch('default')
    await settle()
    two.sync.place(REF, autoLayout(['a', 'b']))
    one.sync.drop(REF, new Map([['a', { x: 900, y: 900 }]]))
    await one.timers.advance(300)
    await two.timers.advance(300)
    assert.deepEqual(server.stored('default', 'dense', 'all'), { a: [900, 900], b: [100, 0] })
  })
})

describe('LayoutSync: other windows', () => {
  it('a push refreshes; the poll checks cheaply with since_rev', async () => {
    const server = new FakeServer()
    const one = setup({ server })
    const two = setup({ server })
    let notified = 0

    one.sync.watch('default')
    two.sync.watch('default')
    await settle()
    two.sync.subscribe(() => (notified += 1))
    one.sync.drop(REF, new Map([['a', { x: 7, y: 8 }]]))
    await one.timers.advance(300)
    two.sync.onRemoteChange({ rev: server.rev, profile: 'default', kind: 'positions' })
    await settle()
    assert.deepEqual(pointsOf(two.sync.positions(REF)), { a: [7, 8] })
    assert.ok(notified > 0)
    // Nothing new: the poll's answer is `unchanged` and nobody is notified.
    const before = notified

    two.sync.poll()
    await settle()
    assert.equal(notified, before)
    // A push for a revision this window already has is ignored.
    const calls = server.calls.length

    two.sync.onRemoteChange({ rev: server.rev, profile: 'default' })
    await settle()
    assert.equal(server.calls.length, calls)
  })

  it('a refresh keeps this window\'s unsent drop on top of the server state', async () => {
    const server = new FakeServer()
    const { sync } = setup({ server })

    sync.watch('default')
    await settle()
    sync.drop(REF, new Map([['a', { x: 1, y: 2 }]]))
    server.layouts.default = { dense: { all: { a: { x: 50, y: 50, updated_at: 1 }, b: { x: 3, y: 3, updated_at: 1 } } } }
    server.rev = 5
    sync.poll()
    await settle()
    assert.deepEqual(pointsOf(sync.positions(REF)), { a: [1, 2], b: [3, 3] })
  })

  it('a fetch answered while an own write was acknowledged is discarded and repeated', async () => {
    const server = new FakeServer()
    const { sync, timers } = setup({ server })

    sync.watch('default')
    await settle()
    sync.drop(REF, new Map([['a', { x: 1, y: 2 }]]))
    // A poll starts before the drop is acknowledged and answers the old state afterwards.
    let release!: () => void

    server.gate = new Promise(resolve => (release = resolve))
    sync.poll()
    const flushed = timers.advance(300)

    server.gate = undefined
    release()
    await flushed
    await settle()
    assert.deepEqual(pointsOf(sync.positions(REF)), { a: [1, 2] })
    assert.deepEqual(server.stored('default', 'dense', 'all'), { a: [1, 2] })
  })
})

describe('LayoutSync: offline', () => {
  it('serves the cached layout when the backend is unreachable, queues, and recovers', async () => {
    const storage = new MemoryStorage()
    const cached: StateSnapshot = { schema: 1, rev: 3, settings: { style: 'dense', snap: true }, layouts: { dense: { all: { a: { x: 11, y: 12, updated_at: 1 } } } } }

    storage.set(`${CACHE_KEY}:default`, cached)
    const server = new FakeServer()

    server.down = true
    const { sync, timers } = setup({ server, storage })

    sync.watch('default')
    await settle()
    assert.equal(sync.settled('default'), true)
    assert.equal(sync.offline('default'), true)
    assert.deepEqual(pointsOf(sync.positions(REF)), { a: [11, 12] })
    assert.deepEqual(sync.settings('default'), { style: 'dense', snap: true })
    // Keep working: a drop is queued (and kept in storage across a reload).
    sync.drop(REF, new Map([['a', { x: 99, y: 98 }]]))
    await timers.advance(300)
    assert.equal(sync.pendingCount, 1)
    assert.equal(JSON.parse(storage.data.get(PENDING_KEY) ?? '[]').length, 1)
    assert.deepEqual(pointsOf(sync.positions(REF)), { a: [99, 98] })
    // The backend comes back: the retry sends the drop, the profile is online again.
    server.down = false
    server.layouts.default = structuredClone(cached.layouts)
    server.rev = 3
    await timers.advance(15_000)
    assert.equal(sync.offline('default'), false)
    assert.equal(sync.pendingCount, 0)
    assert.deepEqual(server.stored('default', 'dense', 'all'), { a: [99, 98] })
  })

  it('a reload while offline still has the queued drop', async () => {
    const storage = new MemoryStorage()
    const server = new FakeServer()

    server.down = true
    const first = setup({ server, storage })

    first.sync.watch('default')
    await settle()
    first.sync.drop(REF, new Map([['a', { x: 5, y: 6 }]]))
    first.sync.dispose()
    server.down = false
    const second = setup({ server, storage })

    second.sync.watch('default')
    await second.timers.advance(10)
    assert.deepEqual(server.stored('default', 'dense', 'all'), { a: [5, 6] })
  })

  it('a refusal (4xx) is dropped and reported, not retried forever', async () => {
    const server = new FakeServer()
    const { sync, timers, refused } = setup({ server })

    sync.watch('default')
    await settle()
    server.refuse = true
    sync.drop(REF, new Map([['a', { x: 1, y: 1 }]]))
    await timers.advance(300)
    assert.equal(sync.pendingCount, 0)
    assert.equal(refused.length, 1)
    assert.equal(sync.offline('default'), false)
    assert.equal(isRefusal(new Error('413: x')), true)
    assert.equal(isRefusal(new Error('502: x')), false)
    assert.equal(isRefusal(new Error('fetch failed')), false)
  })
})

describe('LayoutSync: Re-arrange, Undo, forget, settings', () => {
  it('Re-arrange clears the layout and Undo restores exactly what was shown', async () => {
    const { server, timers, sync } = setup()

    sync.watch('default')
    await settle()
    sync.place(REF, autoLayout(['a', 'b']))
    sync.drop(REF, new Map([['a', { x: 333, y: 444 }]]))
    await timers.advance(300)
    const previous = sync.rearrange(REF)

    assert.deepEqual(pointsOf(previous), { a: [333, 444], b: [100, 0] })
    assert.equal(sync.positions(REF).size, 0)
    // The fresh layout is placed (and saved) …
    sync.place(REF, autoLayout(['a', 'b']))
    await timers.advance(300)
    assert.deepEqual(server.stored('default', 'dense', 'all'), { a: [0, 0], b: [100, 0] })
    // … and Undo puts the old one back, here and on the server.
    sync.restore(REF, previous)
    assert.deepEqual(pointsOf(sync.positions(REF)), { a: [333, 444], b: [100, 0] })
    await timers.advance(300)
    assert.deepEqual(server.stored('default', 'dense', 'all'), { a: [333, 444], b: [100, 0] })
    assert.ok(server.calls.includes('delete') && server.calls.includes('put'))
  })

  it('forget drops a block from every layout of the profile, so the next layout re-places it', async () => {
    const server = new FakeServer()

    server.layouts.default = { dense: { all: { a: { x: 9, y: 9, updated_at: 1 } }, p1: { a: { x: 8, y: 8, updated_at: 1 } } } }
    server.rev = 1
    const { sync, timers } = setup({ server })

    sync.watch('default')
    await settle()
    sync.forget('default', 'a')
    assert.equal(sync.positions(REF).size, 0)
    await timers.advance(300)
    assert.deepEqual(server.stored('default', 'dense', 'p1'), {})
    const result = sync.place(REF, autoLayout(['a']))

    assert.deepEqual(pointsOf(result.positions), { a: [0, 0] })
  })

  it('settings: the synced style and snap, this window\'s change shown at once', async () => {
    const { server, timers, sync } = setup()

    sync.watch('default')
    await settle()
    assert.deepEqual(sync.settings('default'), { style: null, snap: false })
    sync.setSettings('default', { style: 'e2e-alt' })
    assert.equal(sync.settings('default').style, 'e2e-alt')
    await timers.advance(300)
    assert.deepEqual(server.settings, { style: 'e2e-alt', snap: false })
    assert.equal(sync.settings('work').style, 'e2e-alt')
  })

  it('layouts are per profile, style and scope', async () => {
    const { server, timers, sync } = setup()

    sync.watch('default')
    sync.watch('work')
    await settle()
    sync.drop(REF, new Map([['a', { x: 1, y: 1 }]]))
    sync.drop({ ...REF, scope: 'p1' }, new Map([['a', { x: 2, y: 2 }]]))
    sync.drop({ ...REF, style: 'e2e-alt' }, new Map([['a', { x: 3, y: 3 }]]))
    sync.drop({ ...REF, profile: 'work' }, new Map([['a', { x: 4, y: 4 }]]))
    await timers.advance(300)
    assert.deepEqual(server.stored('default', 'dense', 'all'), { a: [1, 1] })
    assert.deepEqual(server.stored('default', 'dense', 'p1'), { a: [2, 2] })
    assert.deepEqual(server.stored('default', 'e2e-alt', 'all'), { a: [3, 3] })
    assert.deepEqual(server.stored('work', 'dense', 'all'), { a: [4, 4] })
  })

  it('a style that saves nothing (Swimlanes) never queues placements', async () => {
    const { server, timers, sync } = setup()

    sync.watch('default')
    await settle()
    sync.place({ ...REF, style: 'swimlanes' }, autoLayout(['a']), { save: false })
    await timers.advance(1000)
    assert.deepEqual(server.calls, ['get'])
  })
})
