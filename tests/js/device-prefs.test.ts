import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { DEVICE_KEY, DevicePrefs, MAX_COLLAPSED_LANES, MAX_SCOPES } from '../../src/model/device-prefs.ts'
import { READ_ONLY_MESSAGE, SETTINGS_OFFLINE_NOTE, settingsNotes } from '../../src/settings/notes.ts'

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

describe('DevicePrefs: Swimlanes lane collapse (card 5)', () => {
  it('one per-device map of lane keys: toggling collapses and expands, survives a new instance (a reload)', () => {
    const storage = new MemoryStorage()
    const prefs = new DevicePrefs(storage)
    let changes = 0

    prefs.subscribe(() => (changes += 1))
    assert.equal(prefs.laneCollapsed('/repos/a'), false)
    prefs.toggleLane('/repos/a')
    prefs.toggleLane('__no_project__')
    assert.equal(prefs.laneCollapsed('/repos/a'), true)
    assert.equal(changes, 2)

    const reloaded = new DevicePrefs(storage)

    assert.deepEqual(reloaded.get().collapsedLanes, ['/repos/a', '__no_project__'])
    reloaded.toggleLane('/repos/a')
    assert.deepEqual(new DevicePrefs(storage).get().collapsedLanes, ['__no_project__'])
  })

  it('the map is independent of profile and scope, and the other toggles keep their values', () => {
    const storage = new MemoryStorage()
    const prefs = new DevicePrefs(storage)

    prefs.set({ profile: 'work', showAll: true })
    prefs.toggleLane('p1')
    prefs.set({ profile: null })
    assert.deepEqual(prefs.get().collapsedLanes, ['p1'])
    assert.equal(prefs.get().showAll, true)
  })

  it('sanitizes untrusted storage: non-strings, empties, duplicates dropped; capped', () => {
    const storage = new MemoryStorage()

    storage.set(DEVICE_KEY, { collapsedLanes: ['a', 'a', '', 7, null, 'b', 'x'.repeat(5000)] })
    assert.deepEqual(new DevicePrefs(storage).get().collapsedLanes, ['a', 'b'])
    storage.set(DEVICE_KEY, { collapsedLanes: 'nope' })
    assert.deepEqual(new DevicePrefs(storage).get().collapsedLanes, [])
    storage.set(DEVICE_KEY, { collapsedLanes: Array.from({ length: MAX_COLLAPSED_LANES + 50 }, (_, i) => `k${i}`) })
    const capped = new DevicePrefs(storage).get().collapsedLanes

    assert.equal(capped.length, MAX_COLLAPSED_LANES)
    assert.equal(capped.at(-1), `k${MAX_COLLAPSED_LANES + 49}`)
  })
})

describe('DevicePrefs: the project scope per profile filter (remembered when the page reopens)', () => {
  it('a chosen scope survives a new instance (a closed and reopened page); each profile filter has its own', () => {
    const storage = new MemoryStorage()
    const prefs = new DevicePrefs(storage)
    let changes = 0

    prefs.subscribe(() => (changes += 1))
    assert.equal(prefs.scope('default'), 'all')
    prefs.setScope('default', '/repos/a')
    prefs.setScope('*', '/repos/b')
    prefs.setScope('default', '/repos/a') // the same scope again: no change
    assert.equal(changes, 2)

    const reopened = new DevicePrefs(storage)

    assert.equal(reopened.scope('default'), '/repos/a')
    assert.equal(reopened.scope('*'), '/repos/b')
    assert.equal(reopened.scope('work'), 'all')
    // All projects is the default: choosing it again forgets the entry.
    reopened.setScope('default', 'all')
    assert.deepEqual(new DevicePrefs(storage).get().scopes, { '*': '/repos/b' })
  })

  it('sanitizes untrusted storage and keeps the newest choices within the cap', () => {
    const storage = new MemoryStorage()

    storage.set(DEVICE_KEY, { scopes: { default: '/a', work: 7, x: '', '': '/b', y: 'all', long: 'z'.repeat(5000) } })
    assert.deepEqual(new DevicePrefs(storage).get().scopes, { default: '/a' })
    storage.set(DEVICE_KEY, { scopes: ['nope'] })
    assert.deepEqual(new DevicePrefs(storage).get().scopes, {})

    const prefs = new DevicePrefs(new MemoryStorage())

    for (let i = 0; i < MAX_SCOPES + 5; i += 1) {
      prefs.setScope(`p${i}`, `/s${i}`)
    }

    // A re-chosen profile moves to the newest end, so it is kept.
    prefs.setScope('p0', '/again')
    const kept = prefs.get().scopes

    assert.equal(Object.keys(kept).length, MAX_SCOPES)
    assert.equal(kept.p0, '/again')
    assert.equal(kept.p1, undefined)
    assert.equal(kept[`p${MAX_SCOPES + 4}`], `/s${MAX_SCOPES + 4}`)
  })

  it('a panel section (the Dense inspector Singles) is remembered per style, open by default', () => {
    const storage = new MemoryStorage()
    const prefs = new DevicePrefs(storage)

    assert.equal(prefs.sectionOpen('dense', 'singles'), true)
    prefs.setSectionOpen('dense', 'singles', false)
    assert.equal(new DevicePrefs(storage).sectionOpen('dense', 'singles'), false)
    assert.equal(new DevicePrefs(storage).sectionOpen('rich', 'singles'), true)
    storage.set(DEVICE_KEY, { sectionsOpen: { 'dense:singles': 'no', 'x:y': false } })
    assert.deepEqual(new DevicePrefs(storage).get().sectionsOpen, { 'x:y': false })
  })
})

describe('settings page notes (card-4 review carry-forward 1)', () => {
  it('read-only (a newer-schema state.json): the same message as the page banner, saying changes stay in this window', () => {
    const notes = settingsNotes({ offline: false, readOnly: true })

    assert.equal(notes.length, 1)
    assert.equal(notes[0].id, 'read-only')
    assert.ok(notes[0].text.startsWith(READ_ONLY_MESSAGE))
    assert.match(notes[0].text, /this window only/)
  })

  it('offline: the offline note; neither: none', () => {
    assert.deepEqual(settingsNotes({ offline: true, readOnly: false }), [{ id: 'offline', text: SETTINGS_OFFLINE_NOTE }])
    assert.deepEqual(settingsNotes({ offline: false, readOnly: false }), [])
    assert.deepEqual(settingsNotes({ offline: true, readOnly: true }).map(note => note.id), ['read-only'])
  })
})
