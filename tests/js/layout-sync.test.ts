import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { LayoutResult, Point } from '../../src/model/layout.ts'
import { CACHE_KEY, DROPS_KEY, isRefusal, LayoutSync, LEGACY_PENDING_KEY, NEWER_SCHEMA, ORPHAN_MS, PENDING_KEY, refusalKind } from '../../src/model/layout-sync.ts'
import type { KnownState, LayoutRef, PositionsBody, StateAnswer, StateSnapshot, StoredLayouts, SyncedSettings, SyncOptions, SyncTransport } from '../../src/model/layout-sync.ts'

/** An in-memory backend with the store's semantics (set / if_absent / delete / put / forget). */
class FakeServer implements SyncTransport {
  rev = 0
  epoch = 'e1'
  settings: SyncedSettings = { style: null, snap: false }
  layouts: Record<string, StoredLayouts> = {}
  down = false
  /** Refuse every write with this error (default: a 413 cap). */
  refuse: false | true | string = false
  /** Serve `read_only` (a newer-schema file). */
  readOnly = false
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
      throw new Error(this.refuse === true ? '413: {"detail":"too many"}' : this.refuse)
    }
  }

  private blocks(profile: string, style: string, scope: string) {
    const styles = (this.layouts[profile] ??= {})
    const scopes = (styles[style] ??= {})

    return (scopes[scope] ??= {})
  }

  async getState(profile: string, since?: KnownState): Promise<StateAnswer> {
    await this.enter('get')

    if (since?.rev === this.rev && since.epoch === this.epoch) {
      return { schema: 1, epoch: this.epoch, rev: this.rev, unchanged: true }
    }

    return structuredClone({ schema: 1, epoch: this.epoch, rev: this.rev, settings: this.settings, layouts: this.layouts[profile] ?? {}, ...(this.readOnly ? { read_only: true, store_schema: 2 } : {}) })
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

  async putLayout(profile: string, body: { style: string; scope: string; positions: { id: string; x: number; y: number }[]; backup?: boolean }) {
    await this.enter(body.backup ? 'put:backup' : 'put')
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

function setup({ server = new FakeServer() as SyncTransport, storage = new MemoryStorage(), timers = new FakeTimers(), options = {} as SyncOptions } = {}) {
  const refused: unknown[] = []
  const kinds: string[] = []
  const sync = new LayoutSync(server, storage, timers, {
    onRefused: (error, kind) => {
      refused.push(error)
      kinds.push(kind)
    },
    ...options
  })

  return { server: server as FakeServer, storage, timers, sync, refused, kinds }
}

/** The ops queued on this device, over every window's slot. */
function queuedOps(storage: MemoryStorage): number {
  const raw = JSON.parse(storage.data.get(PENDING_KEY) ?? '{"slots":{}}') as { slots: Record<string, { ops: unknown[] }> }

  return Object.values(raw.slots).reduce((sum, slot) => sum + slot.ops.length, 0)
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

    two.sync.onRemoteChange({ epoch: server.epoch, rev: server.rev, profile: 'default' })
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
    assert.equal(queuedOps(storage), 1)
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

  it('a restore from Layout history replaces the layout (PUT with backup: true); its Undo is a plain PUT', async () => {
    const { server, timers, sync } = setup()

    sync.watch('default')
    await settle()
    sync.place(REF, autoLayout(['a', 'b']))
    sync.drop(REF, new Map([['a', { x: 7, y: 8 }]]))
    await timers.advance(300)
    const shown = sync.restoreBackup(
      REF,
      new Map([
        ['a', { x: 333, y: 444 }],
        ['gone', { x: 1, y: 1 }]
      ])
    )

    assert.deepEqual(pointsOf(shown), { a: [7, 8], b: [100, 0] })
    // Shown at once, before the server answers; a block the backup lacks is placed anew.
    assert.deepEqual(pointsOf(sync.positions(REF)), { a: [333, 444], gone: [1, 1] })
    await timers.advance(300)
    assert.deepEqual(server.stored('default', 'dense', 'all'), { a: [333, 444], gone: [1, 1] })
    assert.equal(server.calls.filter(call => call === 'put:backup').length, 1)
    sync.restore(REF, shown)
    await timers.advance(300)
    assert.deepEqual(server.stored('default', 'dense', 'all'), { a: [7, 8], b: [100, 0] })
    assert.equal(server.calls.at(-1), 'put')
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

// --- card-4 review r1 fixes -----------------------------------------------------------------

const NEWER_409 = '409: {"detail":"newer_schema: state.json has schema 2; this Session Tree writes schema 1"}'
const writesOf = (server: FakeServer) => server.calls.filter(call => call !== 'get')

/** The page: every visible change re-runs the layout memo, i.e. `place()` (the r1 probe's loop). */
function renderLoop(sync: LayoutSync, ids: () => string[]): { renders: number } {
  const counter = { renders: 0 }

  sync.subscribe(() => {
    counter.renders += 1
    sync.place(REF, autoLayout(ids()))
  })

  return counter
}

describe('LayoutSync: a refused save never loops (B1)', () => {
  it('409 newer schema on a write: one request, then read-only: 0 requests over 300 re-renders, drops, Re-arrange and settings; one notice; the canvas still moves locally', async () => {
    const { server, timers, sync, kinds } = setup()
    const ids = ['a', 'b']

    renderLoop(sync, () => ids)
    sync.watch('default')
    await settle()
    // The file turns newer after the first fetch (what the backend serves from now on).
    server.refuse = NEWER_409
    server.readOnly = true
    server.epoch = 'newer'

    for (let i = 0; i < 150; i += 1) {
      sync.place(REF, autoLayout(ids))
      await timers.advance(50)
    }

    assert.equal(writesOf(server).length, 1, `writes: ${writesOf(server).join(', ')}`)
    assert.equal(sync.storeReadOnly, true)
    const before = writesOf(server).length

    sync.drop(REF, new Map([['a', { x: 5, y: 6 }]]))
    sync.setSettings('default', { snap: true })
    sync.forget('default', 'b')
    const shown = sync.rearrange({ ...REF, scope: 'p1' })

    sync.restore({ ...REF, scope: 'p1' }, shown)

    for (let i = 0; i < 150; i += 1) {
      sync.place(REF, autoLayout(ids))
      await timers.advance(100)
      sync.poll()
      await settle()
    }

    assert.equal(writesOf(server).length - before, 0, `sent while read-only: ${writesOf(server).slice(before).join(', ')}`)
    assert.deepEqual(pointsOf(sync.positions(REF)).a, [5, 6])
    assert.equal(sync.settings('default').snap, true)
    assert.deepEqual(kinds, [NEWER_SCHEMA])
  })

  it('a GET answering read_only: no write at all, one notice; a later GET with a supported schema resumes saving', async () => {
    const server = new FakeServer()

    server.readOnly = true
    server.epoch = 'newer'
    server.refuse = NEWER_409
    const { sync, timers, kinds } = setup({ server })

    renderLoop(sync, () => ['a', 'b'])
    sync.watch('default')
    await settle()
    assert.equal(sync.storeReadOnly, true)

    for (let i = 0; i < 120; i += 1) {
      sync.place(REF, autoLayout(['a', 'b']))
      await timers.advance(100)
    }

    sync.drop(REF, new Map([['a', { x: 1, y: 1 }]]))
    await timers.advance(2000)
    assert.deepEqual(writesOf(server), [])
    assert.deepEqual(kinds, [NEWER_SCHEMA])
    // A valid file again (a new epoch): saves resume.
    server.readOnly = false
    server.refuse = false
    server.epoch = 'e2'
    server.rev = 0
    sync.poll()
    await settle()
    assert.equal(sync.storeReadOnly, false)
    sync.place(REF, autoLayout(['a', 'b']))
    await timers.advance(300)
    assert.deepEqual(writesOf(server), ['patch:if_absent:2'])
    assert.deepEqual(kinds, [NEWER_SCHEMA])
  })

  it('413 (a cap): ≤ 1 request per distinct op over ≥ 100 re-renders each, refused placements never re-queued, one notice per kind, never offline', async () => {
    const { server, timers, sync, kinds } = setup()
    let ids = ['a', 'b']

    renderLoop(sync, () => ids)
    sync.watch('default')
    await settle()
    server.refuse = true // 413

    for (let i = 0; i < 120; i += 1) {
      sync.place(REF, autoLayout(ids))
      await timers.advance(50)
    }

    assert.deepEqual(writesOf(server), ['patch:if_absent:2'])
    // A new block is a new op: one more request, then quiet again.
    ids = ['a', 'b', 'c']

    for (let i = 0; i < 120; i += 1) {
      sync.place(REF, autoLayout(ids))
      await timers.advance(50)
    }

    assert.deepEqual(writesOf(server), ['patch:if_absent:2', 'patch:if_absent:1'])
    sync.drop(REF, new Map([['a', { x: 9, y: 9 }]]))
    await timers.advance(5000)
    assert.deepEqual(writesOf(server), ['patch:if_absent:2', 'patch:if_absent:1', 'patch:set:1'])
    assert.deepEqual(kinds, ['413'])
    assert.equal(sync.offline('default'), false)
    assert.equal(sync.storeReadOnly, false)
    assert.equal(sync.pendingCount, 0)
  })

  it('classifies failures: transient (no answer, timeout, 5xx, 408, 429) retry; any other 4xx is a refusal; 409 newer_schema is its own kind', () => {
    for (const transient of ['fetch failed', 'Request timed out after 15000 ms', '500: x', '502: x', '503: {}', '408: x', '429: x', '401: x', '403: {"detail":"signed out"}']) {
      assert.equal(refusalKind(new Error(transient)), null, transient)
      assert.equal(isRefusal(new Error(transient)), false, transient)
    }

    for (const status of ['400', '404', '409', '413', '422']) {
      assert.equal(refusalKind(new Error(`${status}: {"detail":"no"}`)), status)
    }

    assert.equal(refusalKind(new Error(NEWER_409)), NEWER_SCHEMA)
  })

  it('a transient failure retries with a backoff and notifies nothing', async () => {
    const { server, timers, sync, kinds } = setup()

    sync.watch('default')
    await settle()
    server.refuse = '503: {"detail":"busy"}'
    sync.drop(REF, new Map([['a', { x: 1, y: 1 }]]))
    await timers.advance(300 + 1000 + 2000 + 5000)
    const tries = writesOf(server).length

    assert.ok(tries >= 3 && tries <= 5, `tries ${tries}`)
    assert.deepEqual(kinds, [])
    assert.equal(sync.offline('default'), true)
    server.refuse = false
    await timers.advance(10_000)
    assert.deepEqual(server.stored('default', 'dense', 'all'), { a: [1, 1] })
  })

  it('carry-forward 2: a 401 / 403 (signed out) keeps the drop queued and retries it after sign-in; no "could not save" notice', async () => {
    for (const status of ['401: {"detail":"Not authenticated"}', '403: {"detail":"Forbidden"}']) {
      const { server, timers, sync, kinds } = setup()

      sync.watch('default')
      await settle()
      server.refuse = status
      sync.drop(REF, new Map([['a', { x: 4, y: 2 }]]))
      await timers.advance(300 + 1000 + 2000)
      assert.ok(writesOf(server).length >= 2, `${status}: not retried (${writesOf(server).length})`)
      assert.equal(sync.pendingCount, 1, `${status}: the drop was dropped`)
      assert.deepEqual(kinds, [], `${status}: notified`)
      // Signed in again: the queued drop goes out.
      server.refuse = false
      await timers.advance(10_000)
      assert.deepEqual(server.stored('default', 'dense', 'all'), { a: [4, 2] }, status)
      assert.equal(sync.pendingCount, 0)
    }
  })

  it('carry-forward 3: placements a cap refused are stored again after a Re-arrange (and after a stored PUT)', async () => {
    const { server, timers, sync } = setup()
    const ids = ['a', 'b']

    sync.watch('default')
    await settle()
    server.refuse = true // 413
    sync.place(REF, autoLayout(ids))
    await timers.advance(300)
    assert.deepEqual(writesOf(server), ['patch:if_absent:2'])
    // The cap clears; without a Re-arrange the refused placements stay unqueued (B1).
    server.refuse = false
    sync.place(REF, autoLayout(ids))
    await timers.advance(300)
    assert.deepEqual(writesOf(server), ['patch:if_absent:2'])
    // Re-arrange: the layout is fresh, its placements may be stored now.
    const shown = sync.rearrange(REF)

    await timers.advance(300)
    sync.place(REF, autoLayout(ids))
    await timers.advance(300)
    assert.deepEqual(writesOf(server), ['patch:if_absent:2', 'delete', 'patch:if_absent:2'])
    assert.deepEqual(server.stored('default', 'dense', 'all'), { a: [0, 0], b: [100, 0] })

    // A refused placement again, then a successful PUT (Undo) of that layout: placeable again.
    server.refuse = true
    sync.place(REF, autoLayout(['a', 'b', 'c']))
    await timers.advance(300)
    server.refuse = false
    sync.restore(REF, shown)
    await timers.advance(300)
    sync.place(REF, autoLayout(['a', 'b', 'c']))
    await timers.advance(300)
    assert.deepEqual(writesOf(server).slice(3), ['patch:if_absent:1', 'put', 'patch:if_absent:3'])
  })
})

describe('LayoutSync: layout keys (B2)', () => {
  const keysFor = (tip: string) => ({ toStore: (id: string) => (id === tip ? 'root' : id), fromStore: (key: string) => (key === 'root' ? tip : key) })

  it('a compacted block is stored under its lineage root, so a new tip id (another compaction) keeps the dragged spot', async () => {
    const { server, timers, sync } = setup()

    sync.watch('default')
    await settle()
    sync.place(REF, autoLayout(['tip1', 'b']), { keys: keysFor('tip1') })
    await timers.advance(300)
    assert.deepEqual(server.stored('default', 'dense', 'all'), { root: [0, 0], b: [100, 0] })
    sync.drop(REF, new Map([['root', { x: 125.6, y: 2.4 }]]))
    await timers.advance(300)
    const calls = server.calls.length
    // Compacted again: the block's id is now tip2.
    const result = sync.place(REF, autoLayout(['tip2', 'b']), { keys: keysFor('tip2') })

    assert.deepEqual(pointsOf(result.positions), { tip2: [125.6, 2.4], b: [100, 0] })
    await timers.advance(300)
    assert.equal(server.calls.length, calls, 'nothing new to save')
    assert.deepEqual(server.stored('default', 'dense', 'all'), { root: [125.6, 2.4], b: [100, 0] })
  })
})

describe('LayoutSync: windows on one device (NB1)', () => {
  /** A per-window view of one server whose writes can be held back (A's blocked saves). */
  function gated(server: FakeServer, blocked: { on: boolean }): SyncTransport {
    const guard = async <T>(run: () => Promise<T>) => {
      if (blocked.on) {
        throw new Error('fetch failed')
      }

      return run()
    }

    return {
      getState: (profile, since) => server.getState(profile, since),
      patchPositions: (profile, body) => guard(() => server.patchPositions(profile, body)),
      patchSettings: (profile, patch) => guard(() => server.patchSettings(profile, patch)),
      deleteLayout: (profile, style, scope) => guard(() => server.deleteLayout(profile, style, scope)),
      putLayout: (profile, body) => guard(() => server.putLayout(profile, body)),
      forgetBlocks: (profile, ids) => guard(() => server.forgetBlocks(profile, ids))
    }
  }

  it('P5: A\'s saves are blocked and it drops at p1; A2 opens (does not replay p1) and drops at p2; A unblocked: the store ends at p2', async () => {
    const server = new FakeServer()
    const storage = new MemoryStorage()
    const clock = { now: 1_000_000 }
    const now = () => clock.now
    const blockedA = { on: true }
    const a = setup({ server: gated(server, blockedA), storage, options: { windowId: 'A', now } })

    a.sync.watch('default')
    await settle()
    a.sync.drop(REF, new Map([['st-md-katex', { x: 10, y: 10 }]]))
    await a.timers.advance(300)
    assert.equal(a.sync.pendingCount, 1)
    clock.now += 2000
    // Window A2 opens on the same device while A is alive (its slot is fresh).
    const a2 = setup({ server: gated(server, { on: false }), storage, options: { windowId: 'A2', now } })

    a2.sync.watch('default')
    await a2.timers.advance(1000)
    assert.ok(!server.calls.some(call => call.startsWith('patch')), `A2 replayed A's queue: ${server.calls.join(', ')}`)
    assert.equal(queuedOps(storage), 1, "A's queued drop is still A's")
    clock.now += 2000
    a2.sync.drop(REF, new Map([['st-md-katex', { x: 20, y: 20 }]]))
    await a2.timers.advance(300)
    assert.deepEqual(server.stored('default', 'dense', 'all'), { 'st-md-katex': [20, 20] })
    // A's backend comes back: its older drop is superseded by A2's newer one, never sent.
    blockedA.on = false
    clock.now += 2000
    await a.timers.advance(15_000)
    assert.deepEqual(server.stored('default', 'dense', 'all'), { 'st-md-katex': [20, 20] })
    assert.equal(a.sync.pendingCount, 0)
    assert.equal(queuedOps(storage), 0)
    assert.ok(JSON.parse(storage.data.get(DROPS_KEY) ?? '{}'))
  })

  it('a window rewrites only its own slot: two windows queueing offline keep both queues, and both land', async () => {
    const server = new FakeServer()
    const storage = new MemoryStorage()
    const blocked = { on: true }
    const one = setup({ server: gated(server, blocked), storage, options: { windowId: 'one' } })
    const two = setup({ server: gated(server, blocked), storage, options: { windowId: 'two' } })

    one.sync.watch('default')
    two.sync.watch('default')
    await settle()
    one.sync.drop(REF, new Map([['a', { x: 1, y: 1 }]]))
    two.sync.drop(REF, new Map([['b', { x: 2, y: 2 }]]))
    one.sync.drop(REF, new Map([['c', { x: 3, y: 3 }]]))
    await one.timers.advance(300)
    await two.timers.advance(300)
    assert.equal(queuedOps(storage), 3)
    blocked.on = false
    await one.timers.advance(15_000)
    await two.timers.advance(15_000)
    assert.deepEqual(server.stored('default', 'dense', 'all'), { a: [1, 1], b: [2, 2], c: [3, 3] })
  })

  it('a closed window\'s queue (no heartbeat for ORPHAN_MS) and the card-4 shared queue are adopted and sent once', async () => {
    const server = new FakeServer()
    const storage = new MemoryStorage()
    const clock = { now: 5_000_000 }
    const blocked = { on: true }
    const closed = setup({ server: gated(server, blocked), storage, options: { windowId: 'closed', now: () => clock.now } })

    closed.sync.watch('default')
    await settle()
    closed.sync.drop(REF, new Map([['a', { x: 4, y: 4 }]]))
    // The tab is closed (no dispose); a card-4 window left the old shared queue too.
    storage.set(LEGACY_PENDING_KEY, [{ kind: 'upsert', ref: REF, mode: 'set', entries: [['z', { x: 8, y: 8 }]] }])
    clock.now += ORPHAN_MS + 1
    const next = setup({ server, storage, options: { windowId: 'next', now: () => clock.now } })

    next.sync.watch('default')
    await next.timers.advance(300)
    assert.deepEqual(server.stored('default', 'dense', 'all'), { a: [4, 4], z: [8, 8] })
    assert.equal(storage.data.get(LEGACY_PENDING_KEY), 'null')
    assert.equal(queuedOps(storage), 0)
  })

  it('a reload (pagehide → release) hands the unsent queue to the reloaded page at once, not after ORPHAN_MS', async () => {
    const server = new FakeServer()
    const storage = new MemoryStorage()
    const clock = { now: 9_000_000 }
    const blocked = { on: true }
    const before = setup({ server: gated(server, blocked), storage, options: { windowId: 'before', now: () => clock.now } })

    before.sync.watch('default')
    await settle()
    before.sync.drop(REF, new Map([['a', { x: 6, y: 7 }]]))
    before.sync.release()
    clock.now += 1000 // well inside ORPHAN_MS
    const after = setup({ server, storage, options: { windowId: 'after', now: () => clock.now } })

    after.sync.watch('default')
    await after.timers.advance(10)
    assert.deepEqual(server.stored('default', 'dense', 'all'), { a: [6, 7] })
  })
})

describe('LayoutSync: the store epoch (NB2)', () => {
  it('a recreated store file (new epoch, its rev back at the same number) is never taken for the one this window has: push and poll both refresh', async () => {
    const server = new FakeServer()

    server.rev = 3
    server.layouts.default = { dense: { all: { a: { x: 1, y: 1, updated_at: 1 } } } }
    const { sync } = setup({ server })

    sync.watch('default')
    await settle()
    assert.deepEqual(pointsOf(sync.positions(REF)), { a: [1, 1] })
    // state.json deleted, recreated, and written three times: rev 3 again, other content.
    server.epoch = 'e2'
    server.layouts.default = { dense: { all: { a: { x: 9, y: 9, updated_at: 2 } } } }
    sync.onRemoteChange({ epoch: 'e2', rev: 3, profile: 'default', kind: 'positions' })
    await settle()
    assert.deepEqual(pointsOf(sync.positions(REF)), { a: [9, 9] })
    // And by the poll alone (a missed push): the old (epoch, rev) is not "unchanged".
    server.epoch = 'e3'
    server.layouts.default = { dense: { all: { a: { x: 7, y: 7, updated_at: 3 } } } }
    sync.poll()
    await settle()
    assert.deepEqual(pointsOf(sync.positions(REF)), { a: [7, 7] })
  })
})
