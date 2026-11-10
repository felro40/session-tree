/**
 * e2e — Session Tree 4/7: the synced layout store, the settings page and style switching, against
 * the isolated test Hermes. It mutates its store and fixtures, so it runs in its own fresh test
 * home of the role (`c<card>-<role>-sync`, the role's port block), moved to the e2e trash first.
 *
 *   node scripts/e2e-sync.ts      (part of `npm run test:e2e`)
 *   KEEP_RUNNING=1 …               leaves the test gateway up afterwards
 *
 * The package installed there is `<root>/package/`: the checkout's agent half and backend, with a
 * desktop/plugin.js built `--test-styles` (the test-only `e2e-alt` style for the switcher checks;
 * the committed bundle cannot register it, tests/js/guards.test.ts).
 *
 * Two browser contexts (A and B) stand in for two devices. Every effect is read back: the
 * backend's own `/state`, the blocks' positions in the DOM, the network log of each page, the
 * state file on disk. Input is real (page.mouse / page.keyboard → CDP Input.*).
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Page, Request } from 'playwright-core'

import type { StateSnapshot } from '../src/model/layout-sync.ts'
import { addContext, close, enableDesktopHalf, goto, launch, signIn } from './e2e/browser.ts'
import type { Session } from './e2e/browser.ts'
import { buildTestPackage, E2E_ROOT, seedFixtures, setup, signInLink, stopGateway, testHermes, testHermesPids, webappBase } from './e2e/harness.ts'
import { diffSnapshots, snapshotRealHermes } from './e2e/real-hermes-guard.ts'

const t = testHermes(undefined, { variant: 'sync' })
const shots = join(t.root, 'shots')
const stateFile = join(t.home, 'session-tree', 'state.json')
const results: { name: string; ok: boolean; detail?: string }[] = []
const facts: Record<string, unknown> = {}

async function check(name: string, fn: () => Promise<unknown> | unknown): Promise<void> {
  try {
    const detail = await fn()

    results.push({ name, ok: true, detail: detail === undefined ? undefined : JSON.stringify(detail) })
    console.log(`  ✔ ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`)
  } catch (error) {
    const state = await diagnose().catch(diagError => String(diagError))

    results.push({ name, ok: false, detail: `${String(error instanceof Error ? error.message : error)} | ${state}` })
    console.log(`  ✖ ${name} — ${error instanceof Error ? error.message : error}\n      page state: ${state}`)
  }
}

let diagnose: () => Promise<string> = async () => ''

/** What each page shows (for a failed check): its state element, sync status, projects. */
async function pageState(page: Page): Promise<string> {
  return page.evaluate(() => {
    const root = document.querySelector('[data-testid="session-tree-page"]')
    const state = ['session-tree-loading', 'session-tree-error', 'session-tree-empty', 'session-tree-backend-off', 'session-tree-canvas', 'session-tree-settings'].find(id =>
      document.querySelector(`[data-testid="${id}"]`)
    )

    return JSON.stringify({ url: location.hash, state, sync: root?.getAttribute('data-sync'), projects: root?.getAttribute('data-projects'), title: root?.getAttribute('title') })
  })
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

// --- helpers -----------------------------------------------------------------------------------

const BLOCK = (id: string) => `[data-testid="session-tree-block"][data-session-id="${id}"]`
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function api<T>(s: Session, path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  return s.page.evaluate(
    async ([p, i]) => {
      const bridge = (window as unknown as { hermesDesktop: { api(req: { path: string; method?: string; body?: unknown }): Promise<unknown> } }).hermesDesktop

      return (await bridge.api({ path: p as string, ...(i as object) })) as never
    },
    [path, init] as const
  )
}

async function stored(s: Session, profile = 'default'): Promise<StateSnapshot> {
  return api<StateSnapshot>(s, `/api/plugins/session-tree/state?session_profile=${profile}`)
}

function layoutOf(state: StateSnapshot, style = 'dense', scope = 'all'): Record<string, { x: number; y: number }> {
  return Object.fromEntries(Object.entries(state.layouts[style]?.[scope] ?? {}).map(([id, entry]) => [id, { x: entry.x, y: entry.y }]))
}

/**
 * The layout key the store keeps a block under (card-4 review B2): a compacted conversation's
 * lineage root, else the block's own id (the fixture's two compacted blocks).
 */
const LAYOUT_KEY: Record<string, string> = { 'st-sys-tip': 'st-sys-root', 'st-sys-seg5': 'st-sys-root', 'st-md-tip': 'st-md-root' }
const key = (id: string) => LAYOUT_KEY[id] ?? id
/** The block a stored key draws (the live tip of a compacted conversation). */
let blockOfKey: Record<string, string> = { 'st-sys-root': 'st-sys-tip', 'st-md-root': 'st-md-tip' }
const blockOf = (stored: string) => blockOfKey[stored] ?? stored

/** Ops queued in this page's device queue (every window's slot, `layoutPending.v2`). */
async function queuedOps(page: Page): Promise<number> {
  return page.evaluate(() => {
    const name = Object.keys(localStorage).find(each => each.includes('session-tree') && each.includes('layoutPending.v2'))
    const raw = name ? (JSON.parse(localStorage.getItem(name) ?? 'null') as { slots?: Record<string, { ops: unknown[] }> } | null) : null

    return raw?.slots ? Object.values(raw.slots).reduce((sum, slot) => sum + slot.ops.length, 0) : -1
  })
}

/** Records every `host.notify` the page makes (wraps the SDK's `host` before any plugin loads). */
async function recordNotices(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __stNotices: unknown[]; __HERMES_PLUGIN_SDK__?: unknown }
    let sdk: unknown

    w.__stNotices = []
    Object.defineProperty(window, '__HERMES_PLUGIN_SDK__', {
      configurable: true,
      get: () => sdk,
      set(value: { host?: { notify?: (...args: unknown[]) => unknown; __stWrapped?: boolean } }) {
        sdk = value
        const host = value?.host

        if (host?.notify && !host.__stWrapped) {
          const original = host.notify

          host.notify = function (...args: unknown[]) {
            w.__stNotices.push(args[0])

            return original.apply(this, args)
          }
          host.__stWrapped = true
        }
      }
    })
  })
}

async function notices(page: Page): Promise<{ kind?: string; title?: string; message?: string }[]> {
  return page.evaluate(() => (window as unknown as { __stNotices?: unknown[] }).__stNotices ?? []) as never
}

async function waitFor<T>(what: string, probe: () => Promise<T>, ok: (value: T) => boolean, timeoutMs = 20_000, everyMs = 200): Promise<T> {
  const deadline = Date.now() + timeoutMs
  let last: T = await probe()

  while (!ok(last)) {
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for ${what}; last ${JSON.stringify(last)}`)
    }

    await sleep(everyMs)
    last = await probe()
  }

  return last
}

async function openTree(s: Session): Promise<void> {
  await goto(t, s.page, '/session-tree')
  await settled(s.page)
}

/** A real page reload on the Session Tree route (the app may land on `#/` after a reload). */
async function reloadTree(s: Session, { settle = true }: { settle?: boolean } = {}): Promise<string> {
  if (!s.page.url().includes('#/session-tree')) {
    await goto(t, s.page, '/session-tree')
  }

  await s.page.reload()
  await s.page.waitForTimeout(1500)
  const landed = new URL(s.page.url()).hash

  if (!landed.startsWith('#/session-tree')) {
    await goto(t, s.page, '/session-tree')
  }

  if (settle) {
    await settled(s.page)
  }

  return landed
}

async function settled(page: Page): Promise<void> {
  await page.locator('[data-testid="session-tree-canvas"]').waitFor({ timeout: 30_000 })
  await page.locator('[data-testid="session-tree-block"]').first().waitFor({ timeout: 30_000 })
  await page.waitForFunction(() => document.querySelector('[data-testid="session-tree-page"]')?.getAttribute('data-projects') !== 'loading', undefined, { timeout: 30_000 })
  await page.waitForTimeout(600)
}

/** A block's top-left in flow coordinates, as React Flow draws it. */
async function flowPos(page: Page, id: string): Promise<null | { x: number; y: number }> {
  return page.evaluate(nodeId => {
    const el = document.querySelector(`.react-flow__node[data-id="${nodeId}"]`) as HTMLElement | null
    const m = el ? /translate\(\s*([-\d.]+)px,\s*([-\d.]+)px\)/.exec(el.style.transform) : null

    return m ? { x: Number(m[1]), y: Number(m[2]) } : null
  }, id)
}

async function viewport(page: Page): Promise<{ x: number; y: number; zoom: number }> {
  return page.$eval('.react-flow__viewport', el => {
    const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)\s*scale\(([-\d.]+)\)/.exec((el as HTMLElement).style.transform)

    return m ? { x: Number(m[1]), y: Number(m[2]), zoom: Number(m[3]) } : { x: NaN, y: NaN, zoom: NaN }
  })
}

const near = (a: null | { x: number; y: number }, b: null | { x: number; y: number } | undefined, tolerance = 0.6) =>
  Boolean(a && b && Math.abs(a.x - b.x) <= tolerance && Math.abs(a.y - b.y) <= tolerance)

async function fit(page: Page): Promise<void> {
  await page.locator('[data-testid="session-tree-fit"]').click()
  await page.waitForTimeout(300)
}

/** Real mouse drag of a block by (dx, dy) screen pixels; `hold` runs mid-drag. */
async function dragBlock(page: Page, id: string, by: { x: number; y: number }, hold?: () => Promise<void>): Promise<void> {
  const box = await page.locator(BLOCK(id)).boundingBox()

  assert(box, `no box for ${id}`)
  const from = { x: box.x + 40, y: box.y + box.height / 2 }

  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + by.x / 2, from.y + by.y / 2, { steps: 10 })
  await hold?.()
  await page.mouse.move(from.x + by.x, from.y + by.y, { steps: 10 })
  await page.mouse.up()
}

interface Logged {
  at: number
  method: string
  path: string
  body?: string
}

/** Every request a page makes to the layout store. */
function stateLog(page: Page): Logged[] {
  const log: Logged[] = []

  page.on('request', (request: Request) => {
    const url = new URL(request.url())

    if (/\/api\/plugins\/session-tree\/(state|settings)/.test(url.pathname)) {
      log.push({ at: Date.now(), method: request.method(), path: `${url.pathname.replace('/api/plugins/session-tree', '')}${url.search}`, body: request.postData() ?? undefined })
    }
  })

  return log
}

const saves = (log: Logged[], from = 0, to = Infinity) => log.filter(entry => entry.method !== 'GET' && entry.at >= from && entry.at <= to)

async function chooseSegment(page: Page, testId: string, label: string): Promise<void> {
  await page.locator(`[data-testid="${testId}"] button`, { hasText: label }).click()
  await page.waitForTimeout(300)
}

async function openSettings(s: Session): Promise<void> {
  await goto(t, s.page, '/settings?tab=plugins&plugin=session-tree')
  await s.page.locator('[data-testid="session-tree-settings"]').waitFor({ timeout: 20_000 })
  await s.page.waitForTimeout(500)
}

/** Picks a toolbar style with the keyboard on the focused select (real key events). */
async function switchStyle(page: Page, to: string): Promise<void> {
  const select = page.locator('[data-testid="session-tree-style"]')
  const options = await select.locator('option').evaluateAll(list => list.map(option => (option as HTMLOptionElement).value))
  const current = await select.inputValue()
  const steps = options.indexOf(to) - options.indexOf(current)

  assert(options.includes(to), `no style ${to} in ${options.join(', ')}`)

  // One option per key press: the select hands the keyboard back (blurs) after every change, so
  // it is focused again before each press (card 5: a third style sits between Dense and E2E alt).
  for (let i = 0; i < Math.abs(steps); i += 1) {
    await select.focus()
    await page.keyboard.press(steps > 0 ? 'ArrowDown' : 'ArrowUp')
    await page.waitForTimeout(250)
  }

  await page.waitForTimeout(400)
}

async function pageStyle(page: Page): Promise<null | string> {
  return page.getAttribute('[data-testid="session-tree-page"]', 'data-style')
}

/** A fresh test home for this mutating suite: the previous one goes to the e2e trash. */
function freshHome(): void {
  stopGateway(t)

  if (existsSync(t.root)) {
    const trash = join(E2E_ROOT, 'trash')

    mkdirSync(trash, { recursive: true })
    renameSync(t.root, join(trash, `${t.root.split('/').pop()}-${Date.now()}`))
  }
}

// --- the suite ---------------------------------------------------------------------------------

async function main(): Promise<void> {
  const realBefore = snapshotRealHermes()

  // The role's other homes use the same ports: make sure they are not running.
  stopGateway(testHermes())
  stopGateway(testHermes(undefined, { variant: 'actions' }))
  freshHome()
  mkdirSync(shots, { recursive: true })
  console.log(`e2e sync — role ${t.role}, home ${t.home}`)
  const packageDir = buildTestPackage(t)
  const manifest = setup(t, { packageDir }) as { seeded?: boolean }

  assert(manifest.seeded === true, 'the sync home was not freshly seeded')
  const a = await launch({ colorScheme: 'light' })
  const b = await addContext(a)

  await recordNotices(a.page)
  const logA = stateLog(a.page)
  const logB = stateLog(b.page)
  const stacks: { page: string; stack: string }[] = []

  for (const [name, s] of [['A', a], ['B', b]] as const) {
    s.page.on('pageerror', error => stacks.push({ page: name, stack: `${error.message}\n${error.stack ?? ''}` }))
  }

  let failures = 0

  diagnose = async () => {
    failures += 1
    await a.page.screenshot({ path: join(shots, `failure-${failures}-a.png`) }).catch(() => undefined)
    await b.page.screenshot({ path: join(shots, `failure-${failures}-b.png`) }).catch(() => undefined)

    return `A ${await pageState(a.page)} B ${await pageState(b.page)} (failure-${failures}-*.png)`
  }

  try {
    await check('sign in two browser contexts (two devices), enable the desktop half in each, open the page', async () => {
      await signIn(t, a.page)
      await enableDesktopHalf(t, a.page)
      await signIn(t, b.page)
      // The package (agent half) is on already; B has its own per-browser desktop-half choice.
      await enableDesktopHalf(t, b.page, { via: 'detail' })
      await openTree(a)
      await openTree(b)
      const styles = await a.page.locator('[data-testid="session-tree-style"] option').allInnerTexts()

      assert(styles.includes('E2E alt (test only)'), `the test build has no test style: ${styles.join(', ')}`)

      return { syncA: await a.page.getAttribute('[data-testid="session-tree-page"]', 'data-sync'), styles }
    })

    await check('a fresh store: the first view saves its auto-layout once (if_absent), both windows agree, nothing is saved again while idle', async () => {
      const state = await waitFor('the auto-layout stored', () => stored(a), value => Object.keys(layoutOf(value)).length > 10)
      const layout = layoutOf(state)
      const first = saves(logA).concat(saves(logB))

      assert(first.every(entry => entry.path.startsWith('/state/positions') && entry.body?.includes('"mode":"if_absent"')), `unexpected saves ${JSON.stringify(first.map(e => e.path))}`)
      for (const id of ['st-sys-tip', 'st-hp-root', 'st-md-tip']) {
        assert(near(await flowPos(a.page, id), layout[key(id)]) && near(await flowPos(b.page, id), layout[key(id)]), `${id} differs from the store`)
      }

      assert(!('st-sys-tip' in layout) && !('st-md-tip' in layout), `a compacted block stored under its tip id: ${Object.keys(layout).join(', ')}`)

      const before = saves(logA).length + saves(logB).length

      await sleep(6000)
      assert(saves(logA).length + saves(logB).length === before, 'saves while idle')

      return { stored: Object.keys(layout).length, firstSaves: first.length, rev: state.rev }
    })

    await check('drag → nothing is saved during the drag (network log) → one debounced save after the drop → reload → same position', async () => {
      await fit(a.page)
      const before = await flowPos(a.page, 'st-sys-tip')
      const downAt = Date.now()

      await a.page.evaluate(() => {
        const w = window as unknown as { __stUp?: number }

        window.addEventListener('mouseup', () => (w.__stUp = Date.now()), { capture: true, once: true })
      })
      await dragBlock(a.page, 'st-sys-tip', { x: 150, y: 90 }, async () => {
        // A slow drag: 1.5 s of mouse moves, well past the 300 ms debounce.
        const box = await a.page.locator(BLOCK('st-sys-tip')).boundingBox()

        for (let i = 0; i < 15; i += 1) {
          await a.page.mouse.move(box!.x + 40 + (i % 2) * 3, box!.y + 13, { steps: 2 })
          await sleep(100)
        }
      })
      const upAt = await a.page.evaluate(() => (window as unknown as { __stUp?: number }).__stUp ?? Date.now())
      const dropped = await flowPos(a.page, 'st-sys-tip')
      const state = await waitFor('the drop stored', () => stored(a), value => near(layoutOf(value)[key('st-sys-tip')], dropped))
      const during = saves(logA, downAt, upAt)
      const after = saves(logA, upAt).filter(entry => entry.body?.includes(key('st-sys-tip')))

      assert(during.length === 0, `saved during the drag: ${JSON.stringify(during)}`)
      assert(after.length === 1 && after[0].body?.includes('"mode":"set"'), `saves after the drop: ${JSON.stringify(after)}`)
      assert(after[0].at - upAt >= 250, `the save was not debounced (${after[0].at - upAt} ms after the drop)`)
      facts.reloadLanded = [...((facts.reloadLanded as string[]) ?? []), await reloadTree(a, { settle: false })]
      await settled(a.page)
      const reloaded = await flowPos(a.page, 'st-sys-tip')

      assert(!near(before, dropped), 'the drag did not move the block')
      assert(near(reloaded, layoutOf(state)[key('st-sys-tip')]), `after reload ${JSON.stringify(reloaded)} vs stored ${JSON.stringify(layoutOf(state)[key('st-sys-tip')])}`)
      facts.dragSave = { debounceMs: after[0].at - upAt, duringDrag: during.length }

      return { before, dropped, reloaded, savedAfterMs: after[0].at - upAt, savesDuringDrag: during.length }
    })

    await check('two devices: B sees A\'s drop by push, well within the 5 s poll', async () => {
      await fit(a.page)
      const revBefore = (await stored(a)).rev

      await dragBlock(a.page, 'st-md-tip', { x: 120, y: -60 })
      const target = await flowPos(a.page, 'st-md-tip')
      // When the server has it (polled every 50 ms): the push goes out right then.
      await waitFor('A\'s drop stored', () => stored(a), value => value.rev > revBefore && near(layoutOf(value)[key('st-md-tip')], target), 10_000, 50)
      const savedAt = Date.now()
      const seen = await waitFor('B shows it', () => flowPos(b.page, 'st-md-tip'), pos => near(pos, target), 8000, 50)
      const latency = Date.now() - savedAt
      const timeline = logB.filter(entry => entry.at >= savedAt - 1000).map(entry => ({ dt: entry.at - savedAt, method: entry.method, path: entry.path }))

      facts.pushLatencyMs = latency
      facts.pushTimelineB = timeline
      assert(latency < 5000, `B took ${latency} ms; B's requests ${JSON.stringify(timeline)}`)

      return { target, seen, latencyMs: latency, bRequests: timeline.length }
    })

    await check('concurrent drags of different blocks on A and B both survive (store and both pages)', async () => {
      await fit(a.page)
      await fit(b.page)
      await Promise.all([dragBlock(a.page, 'st-hp-root', { x: 90, y: 70 }), dragBlock(b.page, 'st-sys-mcp', { x: -80, y: 60 })])
      const hp = await flowPos(a.page, 'st-hp-root')
      const mcp = await flowPos(b.page, 'st-sys-mcp')
      const state = await waitFor('both stored', () => stored(a), value => near(layoutOf(value)['st-hp-root'], hp) && near(layoutOf(value)['st-sys-mcp'], mcp))

      await waitFor('A shows B\'s drop', () => flowPos(a.page, 'st-sys-mcp'), pos => near(pos, mcp), 8000)
      await waitFor('B shows A\'s drop', () => flowPos(b.page, 'st-hp-root'), pos => near(pos, hp), 8000)

      return { 'st-hp-root': layoutOf(state)['st-hp-root'], 'st-sys-mcp': layoutOf(state)['st-sys-mcp'] }
    })

    await check('zoom and pan are per device: A zooms and pans, B keeps its view; A gets its own view back after a reload', async () => {
      const vb = await viewport(b.page)
      const box = await a.page.locator('[data-testid="session-tree-canvas"]').boundingBox()

      assert(box, 'no canvas')
      await a.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await a.page.mouse.wheel(0, -240)
      await sleep(300)
      await a.page.mouse.down({ button: 'middle' })
      await a.page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2 + 40, { steps: 8 })
      await a.page.mouse.up({ button: 'middle' })
      await sleep(500)
      const va = await viewport(a.page)

      await sleep(6000)
      const vbAfter = await viewport(b.page)

      assert(Math.abs(va.zoom - vb.zoom) > 0.05 || Math.abs(va.x - vb.x) > 20, 'A did not change its view')
      assert(near(vbAfter, vb, 0.01) && Math.abs(vbAfter.zoom - vb.zoom) < 1e-6, `B's view moved: ${JSON.stringify(vb)} → ${JSON.stringify(vbAfter)}`)
      assert(!saves(logA).some(entry => /viewport|zoom/.test(entry.body ?? '')), 'a viewport went to the backend')
      facts.reloadLanded = [...((facts.reloadLanded as string[]) ?? []), await reloadTree(a, { settle: false })]
      await settled(a.page)
      const vaReloaded = await viewport(a.page)

      assert(near(vaReloaded, va, 1) && Math.abs(vaReloaded.zoom - va.zoom) < 0.001, `A after reload ${JSON.stringify(vaReloaded)} vs ${JSON.stringify(va)}`)

      return { a: va, aAfterReload: vaReloaded, b: vbAfter }
    })

    await check('settings page: the synced View style round-trips (store, reload) and B follows by push; Snap default too', async () => {
      await openSettings(a)
      await a.page.screenshot({ path: join(shots, 'sync-settings-light.png') })
      await chooseSegment(a.page, 'session-tree-settings-style', 'E2E alt (test only)')
      const state = await waitFor('the synced style stored', () => stored(a), value => value.settings.style === 'e2e-alt')

      await waitFor('B follows', () => pageStyle(b.page), style => style === 'e2e-alt', 8000)
      await a.page.reload()
      await a.page.locator('[data-testid="session-tree-settings"]').waitFor({ timeout: 20_000 })
      const shown = await waitFor('the settings page shows it', () => a.page.getAttribute('[data-testid="session-tree-settings-style"]', 'data-value'), value => value === 'e2e-alt')
      const snapSwitch = a.page.getByRole('switch', { name: 'Snap grid default' })

      await snapSwitch.click()
      await waitFor('snap stored', () => stored(a), value => value.settings.snap === true)
      await waitFor('B snaps', () => b.page.getAttribute('[data-testid="session-tree-canvas"]', 'data-snap'), value => value === 'on', 8000)
      await snapSwitch.click()
      await waitFor('snap off stored', () => stored(a), value => value.settings.snap === false)
      await chooseSegment(a.page, 'session-tree-settings-style', 'Dense + inspector')
      await waitFor('dense stored', () => stored(a), value => value.settings.style === 'dense')
      await waitFor('B back on dense', () => pageStyle(b.page), style => style === 'dense', 8000)

      return { stored: state.settings, shownAfterReload: shown }
    })

    await check('the device override applies to one context only (A: E2E alt, B and the synced style stay Dense)', async () => {
      await openSettings(a)
      await chooseSegment(a.page, 'session-tree-settings-device', 'E2E alt (test only)')
      const deviceValue = await a.page.getAttribute('[data-testid="session-tree-settings-device"]', 'data-value')

      await openTree(a)
      const styleA = await pageStyle(a.page)
      const source = await a.page.getAttribute('[data-testid="session-tree-style"]', 'data-source')

      await sleep(6000)
      const styleB = await pageStyle(b.page)
      const state = await stored(a)

      assert(deviceValue === 'e2e-alt' && styleA === 'e2e-alt' && source === 'device', `A: ${deviceValue} ${styleA} ${source}`)
      assert(styleB === 'dense', `B shows ${styleB}`)
      assert(state.settings.style === 'dense', `the synced style changed: ${state.settings.style}`)
      await a.page.screenshot({ path: join(shots, 'sync-device-override.png') })

      return { a: styleA, b: styleB, synced: state.settings.style }
    })

    await check('toolbar switcher: with the override set it changes only this device; without it, the synced style (B follows)', async () => {
      // A has the override: the switcher changes the override, not the synced style.
      await switchStyle(a.page, 'dense')
      await waitFor('A on dense', () => pageStyle(a.page), style => style === 'dense')
      const overrideState = await stored(a)
      const overrideSaves = saves(logA).filter(entry => entry.path.startsWith('/settings') && Date.now() - entry.at < 3000)

      assert(overrideState.settings.style === 'dense' && overrideSaves.length === 0, 'the override switch touched the synced style')
      // Back to the synced style on A, then switch from B's toolbar.
      await openSettings(a)
      await chooseSegment(a.page, 'session-tree-settings-device', 'Use synced style')
      await openTree(a)
      await switchStyle(b.page, 'e2e-alt')
      await waitFor('synced e2e-alt', () => stored(b), value => value.settings.style === 'e2e-alt')
      await waitFor('A follows', () => pageStyle(a.page), style => style === 'e2e-alt', 8000)
      // Positions are per style: the e2e-alt layout is its own (wider spacing).
      const state = await waitFor('the e2e-alt layout stored', () => stored(b), value => Object.keys(layoutOf(value, 'e2e-alt')).length > 10)
      const dense = layoutOf(state, 'dense')[key('st-sys-tip')]
      const alt = layoutOf(state, 'e2e-alt')[key('st-sys-tip')]

      await switchStyle(b.page, 'dense')
      await waitFor('synced dense', () => stored(b), value => value.settings.style === 'dense')
      await waitFor('A back on dense', () => pageStyle(a.page), style => style === 'dense', 8000)
      await settled(a.page)
      assert(!near(dense, alt), 'the styles share positions')
      assert(near(await flowPos(a.page, 'st-sys-tip'), dense), 'A did not get its dense positions back')

      return { overrideKeptSynced: true, denseTip: dense, altTip: alt }
    })

    await check('Re-arrange resets this style + scope layout (store and B), the toast\'s Undo restores it', async () => {
      await fit(a.page)
      const before = layoutOf(await stored(a))
      const moved = before[key('st-sys-tip')]

      await a.page.locator('[data-testid="session-tree-rearrange"]').click()
      await a.page.locator('[data-testid="session-tree-toast"]').waitFor({ timeout: 5000 })
      await a.page.screenshot({ path: join(shots, 'sync-rearrange-toast.png') })
      const fresh = await waitFor('the fresh layout stored', () => stored(a), value => {
        const layout = layoutOf(value)

        return Boolean(layout[key('st-sys-tip')]) && !near(layout[key('st-sys-tip')], moved)
      })
      const freshTip = layoutOf(fresh)[key('st-sys-tip')]

      await waitFor('A re-arranged', () => flowPos(a.page, 'st-sys-tip'), pos => near(pos, freshTip))
      await waitFor('B re-arranged', () => flowPos(b.page, 'st-sys-tip'), pos => near(pos, freshTip), 8000)
      await a.page.locator('[data-testid="session-tree-undo"]').click()
      const restored = await waitFor('restored in the store', () => stored(a), value => near(layoutOf(value)[key('st-sys-tip')], moved))
      const restoredLayout = layoutOf(restored)

      await waitFor('A restored', () => flowPos(a.page, 'st-sys-tip'), pos => near(pos, moved))
      await waitFor('B restored', () => flowPos(b.page, 'st-sys-tip'), pos => near(pos, moved), 8000)
      const lost = Object.entries(before).filter(([id, point]) => !near(restoredLayout[id], point))

      assert(lost.length === 0, `not restored: ${JSON.stringify(lost.slice(0, 5))}`)
      assert(saves(logA).some(entry => entry.method === 'DELETE') && saves(logA).some(entry => entry.method === 'PUT'), 'no DELETE / PUT')

      return { dragged: moved, rearranged: freshTip, restored: restoredLayout[key('st-sys-tip')], entries: Object.keys(before).length }
    })

    await check('a new seeded session is placed without moving any stored block (every stored coordinate unchanged, in the store and on screen)', async () => {
      const before = layoutOf(await stored(a))
      const onScreen: Record<string, null | { x: number; y: number }> = {}

      for (const id of Object.keys(before).filter(id => !id.startsWith('group:'))) {
        onScreen[id] = await flowPos(a.page, blockOf(id))
      }

      seedFixtures(t, ['--branch', 'st-sync-new', 'st-sys-tip', 'Placed by the sync e2e'])
      await a.page.locator(BLOCK('st-sync-new')).waitFor({ timeout: 30_000 })
      const after = await waitFor('the new block stored', () => stored(a), value => Boolean(layoutOf(value)['st-sync-new']))
      const layout = layoutOf(after)
      const movedInStore = Object.entries(before).filter(([id, point]) => !near(layout[id], point, 0))
      const movedOnScreen = []

      for (const [id, point] of Object.entries(onScreen)) {
        if (point && !near(await flowPos(a.page, blockOf(id)), point, 0.01)) {
          movedOnScreen.push(id)
        }
      }

      assert(movedInStore.length === 0, `stored blocks moved: ${JSON.stringify(movedInStore)}`)
      assert(movedOnScreen.length === 0, `blocks moved on screen: ${movedOnScreen.join(', ')}`)

      return { checked: Object.keys(before).length, newBlock: layout['st-sync-new'] }
    })

    await check('backend unreachable on reload (the store route blocked by the browser): the cached layout, the banner, then recovery', async () => {
      const expected = layoutOf(await stored(a))

      await a.page.route('**/api/plugins/session-tree/state**', route => route.abort('connectionrefused'))
      facts.reloadLanded = [...((facts.reloadLanded as string[]) ?? []), await reloadTree(a, { settle: false })]
      await settled(a.page)
      await a.page.locator('[data-testid="session-tree-offline"]').waitFor({ timeout: 15_000 })
      const banner = (await a.page.locator('[data-testid="session-tree-offline"]').innerText()).trim()
      const cached = await flowPos(a.page, 'st-sys-tip')

      await a.page.screenshot({ path: join(shots, 'sync-offline-banner.png') })
      assert(banner === 'offline: showing last saved layout', `banner "${banner}"`)
      assert(near(cached, expected[key('st-sys-tip')]), `not the cached layout: ${JSON.stringify(cached)} vs ${JSON.stringify(expected[key('st-sys-tip')])}`)
      await a.page.unroute('**/api/plugins/session-tree/state**')
      await a.page.locator('[data-testid="session-tree-offline"]').waitFor({ state: 'detached', timeout: 20_000 })

      return { banner, cached }
    })

    await check('backend stopped for real (the gateway): A keeps working on its cached layout, shows the banner, and its drop is saved after the restart', async () => {
      await fit(a.page)
      stopGateway(t)

      try {
        return await gatewayDownChecks()
      } finally {
        if (testHermesPids(t).length === 0) {
          signInLink(t)
        }
      }
    })

    async function gatewayDownChecks() {
      await dragBlock(a.page, 'st-hp-root', { x: -70, y: 50 })
      const dropped = await flowPos(a.page, 'st-hp-root')
      const banner = await a.page.locator('[data-testid="session-tree-offline"]').waitFor({ timeout: 20_000 }).then(() => true, () => false)
      const stillThere = await flowPos(a.page, 'st-hp-root')
      const pending = await queuedOps(a.page)

      await a.page.screenshot({ path: join(shots, 'sync-gateway-down.png') })
      signInLink(t) // restarts the gateway (the link itself is not used yet)
      let route = 'same tab'
      const recovered = await a.page
        .locator('[data-testid="session-tree-offline"]')
        .waitFor({ state: 'detached', timeout: 40_000 })
        .then(() => true, () => false)

      if (!recovered) {
        // The tab's sign-in did not survive the restart: sign in again (a reload); the queued drop
        // is in localStorage and goes out on load.
        route = 'signed in again'
        await signIn(t, a.page)
        await openTree(a)
      }

      const state = await waitFor('the offline drop stored', () => stored(a), value => near(layoutOf(value)['st-hp-root'], dropped), 30_000)

      assert(banner, 'no offline banner while the gateway was down')
      assert(near(stillThere, dropped), 'the block moved while offline')
      assert(pending >= 1, `nothing queued in localStorage (${pending})`)
      await waitFor('B shows it', () => flowPos(b.page, 'st-hp-root'), pos => near(pos, dropped), 30_000).catch(async () => {
        await signIn(t, b.page)
        await openTree(b)
      })
      facts.gatewayRestart = { route }

      return { dropped, banner, queued: pending, recovery: route, stored: layoutOf(state)['st-hp-root'] }
    }

    await check('B2 migration: a conversation stored under its old tip key (as a card-4 page saved it) comes back at that spot, re-keyed to its lineage root on disk', async () => {
      await fit(a.page)
      const now = layoutOf(await stored(a))[key('st-sys-tip')]
      const spot = { x: Math.round(now.x + 240), y: Math.round(now.y + 160) }

      // The card-4 shape: the block keyed by its tip id, no root key.
      await api(a, '/api/plugins/session-tree/state/forget?session_profile=default', { method: 'POST', body: { ids: ['st-sys-root'] } })
      await api(a, '/api/plugins/session-tree/state/positions?session_profile=default', {
        method: 'PATCH',
        body: { style: 'dense', scope: 'all', mode: 'set', positions: [{ id: 'st-sys-tip', ...spot }] }
      })
      const old = JSON.parse(readFileSync(stateFile, 'utf8')).layouts.default.dense.all as Record<string, { x: number; y: number }>
      // The other windows' push-driven fetches may canonicalise it at once; either way the spot is kept.
      const oldShape = near(old['st-sys-tip'], spot) ? 'tip key on disk' : near(old['st-sys-root'], spot) ? 'already re-keyed by a fetch' : 'neither'

      assert(oldShape !== 'neither', `the tip key was not written: ${JSON.stringify({ tip: old['st-sys-tip'], root: old['st-sys-root'] })}`)
      await reloadTree(a)
      const shown = await waitFor('the block at its old spot', () => flowPos(a.page, 'st-sys-tip'), pos => near(pos, spot), 15_000)
      const disk = JSON.parse(readFileSync(stateFile, 'utf8')).layouts.default.dense.all as Record<string, { x: number; y: number }>

      assert(near(disk['st-sys-root'], spot), `root key on disk ${JSON.stringify(disk['st-sys-root'])}`)
      assert(!('st-sys-tip' in disk), 'the old tip key is still on disk')

      return { spot, shown, beforeReload: oldShape, onDisk: { root: disk['st-sys-root'], tipKey: 'st-sys-tip' in disk } }
    })

    await check('B2: drag the compacted block, compact it again through SessionDB (its tip id changes), reload: it stays at the dragged spot; state.json keys it by the lineage root only, no stale tip key', async () => {
      await fit(a.page)
      await dragBlock(a.page, 'st-sys-tip', { x: -120, y: 80 })
      const dragged = await flowPos(a.page, 'st-sys-tip')

      await waitFor('the drop stored', () => stored(a), value => near(layoutOf(value)['st-sys-root'], dragged))
      const compacted = seedFixtures(t, ['--compact', 'st-sys-tip', 'st-sys-seg5']) as { root: string; continuation: string; created: boolean; lineage: string[] }

      assert(compacted.created && compacted.root === 'st-sys-root' && compacted.continuation === 'st-sys-seg5', `compaction ${JSON.stringify(compacted)}`)
      blockOfKey = { ...blockOfKey, 'st-sys-root': 'st-sys-seg5' }
      const from = Date.now()

      await reloadTree(a)
      await a.page.locator(BLOCK('st-sys-seg5')).waitFor({ timeout: 30_000 })
      const after = await flowPos(a.page, 'st-sys-seg5')
      const text = await a.page.locator(BLOCK('st-sys-seg5')).innerText()
      const gone = await a.page.locator(BLOCK('st-sys-tip')).count()

      await a.page.locator(BLOCK('st-sys-seg5')).scrollIntoViewIfNeeded().catch(() => undefined)
      await a.page.screenshot({ path: join(shots, 'b2-compacted-block-stays.png') })
      const disk = JSON.parse(readFileSync(stateFile, 'utf8')).layouts.default.dense.all as Record<string, { x: number; y: number }>
      const savedTip = saves(logA, from).filter(entry => /st-sys-seg5|st-sys-tip/.test(entry.body ?? ''))

      assert(gone === 0, 'the old tip is still drawn as a block')
      assert(near(after, dragged), `after compaction + reload ${JSON.stringify(after)} vs dragged ${JSON.stringify(dragged)}`)
      assert(/×\s*4/.test(text), `the block does not say ×4: ${text.replace(/\s+/g, ' ')}`)
      assert(near(disk['st-sys-root'], dragged) && !('st-sys-tip' in disk) && !('st-sys-seg5' in disk), `on disk ${JSON.stringify({ root: disk['st-sys-root'], tip: disk['st-sys-tip'], seg5: disk['st-sys-seg5'] })}`)
      assert(savedTip.length === 0, `saved under a tip id: ${JSON.stringify(savedTip)}`)
      const bShows = await waitFor('B shows it', () => flowPos(b.page, 'st-sys-seg5'), pos => near(pos, dragged), 30_000).then(
        () => true,
        () => false
      )

      return { dragged, afterReload: after, compacted: compacted.lineage, onDiskRoot: disk['st-sys-root'], bShows }
    })

    await check('a corrupt state.json (by hand): the page does not crash, the backend serves an empty valid state, the file is kept as .bak', async () => {
      writeFileSync(stateFile, '{"schema": 1, "rev": 12, "layouts": {"default": {"dense": {"all": {"st-sys-tip": {"x": ')
      const state = await stored(a)

      facts.reloadLanded = [...((facts.reloadLanded as string[]) ?? []), await reloadTree(a, { settle: false })]
      await settled(a.page)
      const backups = readdirSync(join(t.home, 'session-tree')).filter(name => /^state\.json\.corrupt-.*\.bak$/.test(name))
      const kept = backups.map(name => readFileSync(join(t.home, 'session-tree', name), 'utf8'))
      const fresh = await waitFor('a new valid state file', () => Promise.resolve(existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : null), value => Boolean(value?.layouts))

      assert(state.rev === 0 && Object.keys(state.layouts).length === 0, `served ${JSON.stringify(state).slice(0, 120)}`)
      assert(backups.length === 1 && kept[0].startsWith('{"schema": 1, "rev": 12'), `backups ${JSON.stringify(backups)}`)
      assert((await a.page.locator('[data-testid="session-tree-block"]').count()) > 10, 'no blocks after the reload')

      return { served: { rev: state.rev, layouts: 0 }, backup: backups[0], newFileRev: fresh.rev }
    })

    await check('B1: a state.json of a newer schema (the r1 repro: gateway stopped, file written, restarted): over 10 s at most 1 PATCH and 1 notice, the read-only banner, the file untouched, no page errors; a valid file again: saves resume after a reload', async () => {
      const newer = '{"schema":2,"rev":3,"settings":{"style":"dense","snap":false},"layouts":{},"extra":{}}'
      const errorsBefore = stacks.length

      stopGateway(t)
      writeFileSync(stateFile, newer)
      const from = Date.now()

      await signIn(t, a.page)
      await openTree(a)
      const banner = a.page.locator('[data-testid="session-tree-read-only"]')

      await banner.waitFor({ timeout: 20_000 })
      const shownAt = Date.now()

      await sleep(10_000)
      const writes = saves(logA, from)
      const notified = (await notices(a.page)).filter(entry => /Session Tree/.test(`${entry.title ?? ''} ${entry.message ?? ''}`))
      const text = (await banner.innerText()).trim()
      const more = await a.page.evaluate(() => (document.body.innerText.match(/Show (\d+) more notifications/) ?? [])[1] ?? null)
      const pluginErrors = stacks.slice(errorsBefore).filter(entry => /blob:|session-tree|desktop-plugins/.test(entry.stack))

      await a.page.screenshot({ path: join(shots, 'b1-newer-schema-banner.png') })
      facts.newerSchema = { writes: writes.length, notices: notified, windowMs: Date.now() - from, bannerAfterMs: shownAt - from }
      assert(writes.length <= 1, `${writes.length} writes: ${JSON.stringify(writes.slice(0, 3).map(entry => `${entry.method} ${entry.path}`))}`)
      assert(notified.length <= 1, `${notified.length} notices: ${JSON.stringify(notified)}`)
      assert(text === 'Layout saved by a newer Session Tree version — changes here are not saved', `banner "${text}"`)
      assert(more === null, `"Show ${more} more notifications"`)
      assert(readFileSync(stateFile, 'utf8') === newer, 'state.json was changed')
      assert(pluginErrors.length === 0, pluginErrors.map(entry => entry.stack).join('\n'))
      // The canvas stays usable: a local drag moves the block (and is still not sent).
      await fit(a.page)
      const before = await flowPos(a.page, 'st-hp-root')

      await dragBlock(a.page, 'st-hp-root', { x: 60, y: 40 })
      await sleep(1500)
      const moved = await flowPos(a.page, 'st-hp-root')

      assert(!near(before, moved), 'the drag did not move the block locally')
      assert(saves(logA, from).length === writes.length, 'the local drag was sent')
      assert(readFileSync(stateFile, 'utf8') === newer, 'state.json was changed by the drag')
      // A valid file again (an older Session Tree's schema 1, no epoch): saves resume after a reload.
      writeFileSync(stateFile, '{"schema":1,"rev":0,"settings":{"style":"dense","snap":false},"layouts":{}}')
      const resumeFrom = Date.now()

      await reloadTree(a)
      const resumed = await waitFor('saves resumed', () => stored(a), value => Object.keys(layoutOf(value)).length > 10, 20_000)
      const bannerGone = (await banner.count()) === 0

      assert(bannerGone, 'the read-only banner is still shown')
      assert(saves(logA, resumeFrom).some(entry => entry.path.startsWith('/state/positions')), 'no save after the reload')

      return {
        writesIn10s: writes.length,
        notices: notified.length,
        banner: text,
        fileUntouched: true,
        localDrag: { before, moved },
        resumed: { entries: Object.keys(layoutOf(resumed)).length, epoch: resumed.epoch, rev: resumed.rev }
      }
    })

    await check('carry-forward 4: a failed session load ends in an error state with Retry (an infinite-cost row the core cannot serialise), and Retry recovers', async () => {
      seedFixtures(t, ['--inf-cost-branch', 'st-sync-inf', 'st-hp-root', 'Infinite cost'])
      await reloadTree(a, { settle: false })
      const ended = await waitFor(
        'an end state',
        () =>
          a.page.evaluate(() =>
            document.querySelector('[data-testid="session-tree-error"]') ? 'error' : document.querySelector('[data-testid="session-tree-loading"]') ? 'loading' : document.querySelector('[data-testid="session-tree-canvas"]') ? 'canvas' : 'none'
          ),
        value => value === 'error' || value === 'canvas',
        60_000,
        500
      )
      const text = ended === 'error' ? (await a.page.locator('[data-testid="session-tree-error"]').innerText()).trim() : ''

      await a.page.screenshot({ path: join(shots, 'sync-load-error.png') })
      assert(ended === 'error', `the page ended as ${ended}`)
      assert(/Could not load (sessions|projects)/.test(text) && (await a.page.locator('[data-testid="session-tree-retry"]').isVisible()), `error text ${text}`)
      const failedPart = await a.page.getAttribute('[data-testid="session-tree-error"]', 'data-failed')

      seedFixtures(t, ['--delete', 'st-sync-inf'])
      await a.page.locator('[data-testid="session-tree-retry"]').click()
      await settled(a.page)
      facts.loadError = { failed: failedPart, text }

      return { state: ended, failed: failedPart, text: text.split('\n')[0] }
    })

    await check('dark theme: the settings page and the banner use the theme (screenshots)', async () => {
      const dark = await addContext(a, { colorScheme: 'dark' })

      try {
        await signIn(t, dark.page)
        await enableDesktopHalf(t, dark.page, { via: 'detail' })
        await openSettings(dark)
        await dark.page.screenshot({ path: join(shots, 'sync-settings-dark.png') })
        const colors = await dark.page.$eval('[data-testid="session-tree-settings"]', el => getComputedStyle(el).color)

        return { text: colors }
      } finally {
        await dark.context.close().catch(() => undefined)
      }
    })

    await check('no page errors from the plugin (both contexts)', () => {
      // The infinite-cost check also makes the app's own session list fail (its /api/sessions
      // answers 500, the card-3 review's core serialisation bug): those errors come from the app's
      // bundle (/assets/…), not from the plugin (loaded as a blob: module), and are reported apart.
      const fromPlugin = stacks.filter(entry => /blob:|session-tree|desktop-plugins/.test(entry.stack))
      const fromApp = stacks.filter(entry => !fromPlugin.includes(entry))

      facts.appPageErrors = fromApp.map(entry => ({ ...entry, stack: entry.stack.split('\n').slice(0, 3).join(' | ') }))
      assert(fromPlugin.length === 0, fromPlugin.map(entry => `${entry.page}: ${entry.stack}`).join('\n'))
      assert(fromApp.every(entry => /500: Internal Server Error/.test(entry.stack)), `other app errors: ${JSON.stringify(facts.appPageErrors)}`)

      return { plugin: 0, app: fromApp.length }
    })
  } finally {
    facts.requestsA = logA.length
    facts.requestsB = logB.length
    await b.context.close().catch(() => undefined)
    await close(a)
    stopGateway(t)

    if (process.env.KEEP_RUNNING === '1') {
      signInLink(t)
    }
  }

  await check('cleanup: no test-Hermes process and no listener left in the port block', () => {
    if (process.env.KEEP_RUNNING === '1') {
      return 'kept running'
    }

    const pids = testHermesPids(t)
    const busy = spawnSync('ss', ['-ltnH'], { encoding: 'utf8' })
      .stdout.split('\n')
      .map(line => Number(line.trim().split(/\s+/)[3]?.split(':').pop()))
      .filter(port => port >= t.portBlock[0] && port <= t.portBlock[1])

    assert(pids.length === 0, `left running: ${pids}`)
    assert(busy.length === 0, `ports still bound: ${busy}`)
  })

  await check("the user's real Hermes is untouched (checkout status, dist-webapp mtimes, config/plugins sha)", () => {
    const changes = diffSnapshots(realBefore, snapshotRealHermes())

    assert(changes.length === 0, changes.join('; '))
  })

  writeFileSync(join(t.root, 'e2e-sync-facts.json'), `${JSON.stringify({ results, facts, base: webappBase(t) }, null, 2)}\n`)
  const failed = results.filter(r => !r.ok)

  console.log(`\ne2e-sync: ${results.length - failed.length} passed, ${failed.length} failed (screenshots: ${shots})`)
  process.exitCode = failed.length === 0 ? 0 : 1
}

await main()
