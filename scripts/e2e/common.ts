/**
 * Helpers shared by the card-7 e2e suites (e2e-subway, e2e-final): the check runner, backend reads
 * through the Webapp's bridge, page navigation, real-input drags and pans, the stored layout. The
 * earlier suites keep their own copies (unchanged); these are the same helpers, gathered.
 */
import { spawnSync } from 'node:child_process'

import type { Page, Request } from 'playwright-core'

import type { StateSnapshot } from '../../src/model/layout-sync.ts'
import type { SessionRow, SessionsResponse } from '../../src/model/sessions.ts'
import { goto } from './browser.ts'
import type { Session } from './browser.ts'
import { stopGateway, testHermesPids } from './harness.ts'
import type { TestHermes } from './harness.ts'
import { moveAside } from './trash.ts'

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
export const BLOCK = (id: string) => `[data-testid="session-tree-block"][data-session-id="${id}"]`
export const MENU = '[data-testid="session-tree-menu"]'
export const ITEM = (action: string) => `${MENU} [data-action="${action}"]`
export const PAGE = '[data-testid="session-tree-page"]'

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

export interface Suite {
  results: { name: string; ok: boolean; detail?: string }[]
  facts: Record<string, unknown>
  check(name: string, fn: () => Promise<unknown> | unknown): Promise<void>
  onFailure(diagnose: () => Promise<string>, after?: () => Promise<void>): void
}

export function suite(): Suite {
  const results: Suite['results'] = []
  let diagnose: () => Promise<string> = async () => ''
  let after: (() => Promise<void>) | undefined

  return {
    results,
    facts: {},
    onFailure(d, a) {
      diagnose = d
      after = a
    },
    async check(name, fn) {
      try {
        const detail = await fn()

        results.push({ name, ok: true, detail: detail === undefined ? undefined : JSON.stringify(detail) })
        console.log(`  ✔ ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`)
      } catch (error) {
        const state = await diagnose().catch(diagError => String(diagError))

        results.push({ name, ok: false, detail: `${String(error instanceof Error ? error.message : error)} | ${state}` })
        console.log(`  ✖ ${name} — ${error instanceof Error ? error.message : error}\n      page state: ${state}`)
        await after?.().catch(() => undefined)
      }
    }
  }
}

export async function api<T>(s: Session, path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  return s.page.evaluate(
    async ([p, i]) => {
      const bridge = (window as unknown as { hermesDesktop: { api(req: { path: string; method?: string; body?: unknown }): Promise<unknown> } }).hermesDesktop

      return (await bridge.api({ path: p as string, ...(i as object) })) as never
    },
    [path, init] as const
  )
}

export async function rowsOf(s: Session, profile = 'default', archived = false): Promise<SessionRow[]> {
  return (await api<SessionsResponse>(s, `/api/plugins/session-tree/sessions?session_profile=${profile}&include_archived=${archived}&limit=2000`)).sessions
}

export async function rowOf(s: Session, id: string, archived = true): Promise<SessionRow | undefined> {
  return (await rowsOf(s, 'default', archived)).find(row => row.id === id)
}

export async function stored(s: Session): Promise<StateSnapshot> {
  return api<StateSnapshot>(s, '/api/plugins/session-tree/state?session_profile=default')
}

/** A style's stored layout: one per style, under scope `all`, whatever the page's scope (card 10). */
export const layoutOf = (state: StateSnapshot, style: string) =>
  Object.fromEntries(Object.entries(state.layouts[style]?.all ?? {}).map(([id, entry]) => [id, { x: entry.x, y: entry.y }])) as Record<string, { x: number; y: number }>

export async function waitFor<T>(what: string, probe: () => Promise<T>, ok: (value: T) => boolean, timeoutMs = 20_000, everyMs = 250): Promise<T> {
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

export async function settled(page: Page): Promise<void> {
  await page.locator('[data-testid="session-tree-canvas"]').waitFor({ timeout: 30_000 })
  await page.locator('[data-testid="session-tree-block"]').first().waitFor({ timeout: 30_000 })
  await page.waitForFunction(selector => document.querySelector(selector)?.getAttribute('data-projects') !== 'loading', PAGE, { timeout: 30_000 })
  await page.waitForTimeout(600)
}

export async function openTree(t: TestHermes, s: Session): Promise<void> {
  await goto(t, s.page, '/session-tree')

  if (!(await s.page.locator('[data-testid="session-tree-canvas"]').waitFor({ timeout: 6000 }).then(() => true, () => false))) {
    await s.page.getByText('Session Tree', { exact: true }).first().click()
  }

  await settled(s.page)
}

export async function backToTree(page: Page): Promise<void> {
  await page.getByText('Session Tree', { exact: true }).first().click()
  await settled(page)
}

export async function reloadTree(t: TestHermes, s: Session): Promise<void> {
  if (!s.page.url().includes('#/session-tree')) {
    await goto(t, s.page, '/session-tree')
  }

  await s.page.reload()
  await s.page.waitForTimeout(1500)

  if (!new URL(s.page.url()).hash.startsWith('#/session-tree')) {
    await goto(t, s.page, '/session-tree')
  }

  await settled(s.page)
}

/** Picks a toolbar style with the keyboard on the focused select (real key events). */
export async function switchStyle(page: Page, to: string): Promise<void> {
  const select = page.locator('[data-testid="session-tree-style"]')
  const options = await select.locator('option').evaluateAll(list => list.map(option => (option as HTMLOptionElement).value))
  const current = await select.inputValue()
  const steps = options.indexOf(to) - options.indexOf(current)

  assert(options.includes(to), `no style ${to} in ${options.join(', ')}`)

  for (let i = 0; i < Math.abs(steps); i += 1) {
    await select.focus()
    await page.keyboard.press(steps > 0 ? 'ArrowDown' : 'ArrowUp')
    await page.waitForTimeout(250)
  }

  await page.waitForFunction(([selector, id]) => document.querySelector(selector)?.getAttribute('data-style') === id, [PAGE, to] as const, { timeout: 20_000 })
  await page.waitForTimeout(500)
}

export async function clickToolbar(page: Page, testId: string): Promise<void> {
  await page.locator(`[data-testid="${testId}"]`).click()
  await page.waitForTimeout(350)
}

export async function setProfile(page: Page, value: string): Promise<void> {
  await page.locator('[data-testid="session-tree-profile"]').selectOption(value)
  await page.waitForTimeout(300)
}

export async function fit(page: Page): Promise<void> {
  await clickToolbar(page, 'session-tree-fit')
}

/** A block's top-left in flow coordinates, as React Flow draws it. */
export async function flowPos(page: Page, id: string): Promise<null | { x: number; y: number }> {
  return page.evaluate(nodeId => {
    const el = document.querySelector(`.react-flow__node[data-id="${nodeId}"]`) as HTMLElement | null
    const m = el ? /translate\(\s*([-\d.e]+)px,\s*([-\d.e]+)px\)/.exec(el.style.transform) : null

    return m ? { x: Number(m[1]), y: Number(m[2]) } : null
  }, id)
}

export async function viewport(page: Page): Promise<{ x: number; y: number; zoom: number }> {
  return page.$eval('.react-flow__viewport', el => {
    const m = /translate\(([-\d.e]+)px,\s*([-\d.e]+)px\)\s*scale\(([-\d.e]+)\)/.exec((el as HTMLElement).style.transform)

    return m ? { x: Number(m[1]), y: Number(m[2]), zoom: Number(m[3]) } : { x: NaN, y: NaN, zoom: NaN }
  })
}

export async function box(page: Page, selector: string) {
  const found = await page.locator(selector).first().boundingBox()

  assert(found, `no box for ${selector}`)

  return found
}

export const near = (a: null | { x: number; y: number } | undefined, b: null | { x: number; y: number } | undefined, tolerance = 0.6) =>
  Boolean(a && b && Math.abs(a.x - b.x) <= tolerance && Math.abs(a.y - b.y) <= tolerance)

/** An empty spot of the flow pane. */
export async function emptySpot(page: Page): Promise<{ x: number; y: number }> {
  const spot = await page.evaluate(() => {
    const pane = document.querySelector('.react-flow__pane')!.getBoundingClientRect()

    for (let y = pane.top + 60; y < pane.bottom - 30; y += 23) {
      for (let x = pane.left + 60; x < pane.right - 80; x += 29) {
        const clear = [
          [x, y],
          [x - 40, y],
          [x + 40, y],
          [x, y - 30],
          [x, y + 30]
        ].every(([px, py]) => document.elementFromPoint(px, py)?.classList.contains('react-flow__pane'))

        if (clear) {
          return { x, y }
        }
      }
    }

    return null
  })

  assert(spot, 'no empty canvas spot found')

  return spot
}

export async function drag(page: Page, from: { x: number; y: number }, by: { x: number; y: number }, button: 'left' | 'middle' = 'left') {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down({ button })
  await page.mouse.move(from.x + by.x / 2, from.y + by.y / 2, { steps: 10 })
  await page.mouse.move(from.x + by.x, from.y + by.y, { steps: 10 })
  await page.mouse.up({ button })
  await page.waitForTimeout(300)
}

export interface Logged {
  at: number
  method: string
  path: string
  body?: string
}

/** Every request a page makes to the plugin backend. */
export function backendLog(page: Page): Logged[] {
  const log: Logged[] = []

  page.on('request', (request: Request) => {
    const url = new URL(request.url())

    if (url.pathname.startsWith('/api/plugins/session-tree/')) {
      log.push({ at: Date.now(), method: request.method(), path: `${url.pathname.replace('/api/plugins/session-tree', '')}${url.search}`, body: request.postData() ?? undefined })
    }
  })

  return log
}

export const positionWrites = (log: Logged[], from = 0) => log.filter(entry => entry.at >= from && entry.method !== 'GET' && entry.path.startsWith('/state'))

export async function focusedStored(page: Page): Promise<unknown> {
  return page.evaluate(() => (globalThis as unknown as { __HERMES_PLUGIN_SDK__: { host: { state: { focusedStoredSessionId: { get(): unknown } } } } }).__HERMES_PLUGIN_SDK__.host.state.focusedStoredSessionId.get())
}

/** A scripted 2 s middle-drag pan, counting animation frames. */
export async function panFps(page: Page) {
  const spot = await emptySpot(page).catch(async () => {
    const pane = await box(page, '.react-flow__pane')

    return { x: pane.x + pane.width / 2, y: pane.y + pane.height / 2 }
  })

  await page.evaluate(() => {
    const w = window as unknown as { __stFrames: number; __stCounting: boolean }

    w.__stFrames = 0
    w.__stCounting = true
    const tick = () => {
      if (w.__stCounting) {
        w.__stFrames += 1
        requestAnimationFrame(tick)
      }
    }

    requestAnimationFrame(tick)
  })
  const before = await viewport(page)

  await page.mouse.move(spot.x, spot.y)
  await page.mouse.down({ button: 'middle' })
  const t0 = Date.now()
  let moves = 0

  while (Date.now() - t0 < 2000) {
    moves += 1
    await page.mouse.move(spot.x + Math.sin(moves / 8) * 220, spot.y + Math.cos(moves / 11) * 140)
  }

  const elapsed = Date.now() - t0

  await page.mouse.up({ button: 'middle' })
  const frames = await page.evaluate(() => {
    const w = window as unknown as { __stFrames: number; __stCounting: boolean }

    w.__stCounting = false

    return w.__stFrames
  })
  const after = await viewport(page)

  return { fps: Math.round((frames / elapsed) * 1000 * 10) / 10, frames, elapsed, moves, moved: after.x !== before.x || after.y !== before.y }
}

/** A background colour vs the theme variable it must come from, resolved in place. */
export async function themeProbe(page: Page, selector: string, property: 'backgroundColor' | 'borderTopColor' | 'color', variable: string) {
  return page.evaluate(
    ([sel, prop, v]) => {
      const el = document.querySelector(sel) as HTMLElement
      const probe = document.createElement('div')

      probe.style.setProperty(prop === 'borderTopColor' ? 'border-top' : prop === 'color' ? 'color' : 'background', prop === 'borderTopColor' ? `1px solid ${v}` : v)
      el.parentElement!.appendChild(probe)
      const expected = getComputedStyle(probe)[prop as 'color']

      probe.remove()

      return { actual: getComputedStyle(el)[prop as 'color'], expected }
    },
    [selector, property, variable] as const
  )
}

/** Moves the test home aside, `<E2E_ROOT>/trash/<name>-<ms>`, then prunes the trash to the newest
 *  copy of each home name (card 8, F5: `scripts/e2e/trash.ts`, the one guarded delete). */
export function freshHome(t: TestHermes): void {
  stopGateway(t)
  moveAside(t.root, { log: line => console.log(`  trash: ${line}`) })
}

/** No test-Hermes process and no listener left in the role's port block. */
export function portsFree(t: TestHermes): { pids: number[]; busy: number[] } {
  const busy = spawnSync('ss', ['-ltnH'], { encoding: 'utf8' })
    .stdout.split('\n')
    .map(line => Number(line.trim().split(/\s+/)[3]?.split(':').pop()))
    .filter(port => port >= t.portBlock[0] && port <= t.portBlock[1])

  return { pids: testHermesPids(t), busy }
}

/** Every `M`/`L` point of an SVG path made of straight segments (the Subway tracks). */
export function pathPoints(d: string): { x: number; y: number }[] {
  assert(/^M[\d\s.LM-]+$/.test(d.trim()), `not a straight-segment path: ${d}`)

  return [...d.matchAll(/[ML]\s*([-\d.e]+)\s+([-\d.e]+)/g)].map(m => ({ x: Number(m[1]), y: Number(m[2]) }))
}

/** Degrees off the nearest multiple of 45° of each segment (segments under 2 px compared by their
 *  rounded coordinates: 0.01 px of rounding is more than 0.5° there). */
export function octilinearOff(points: readonly { x: number; y: number }[]): number[] {
  const out: number[] = []

  for (let i = 1; i < points.length; i += 1) {
    const dx = points[i].x - points[i - 1].x
    const dy = points[i].y - points[i - 1].y

    if (Math.hypot(dx, dy) < 2) {
      out.push(Math.abs(dx) < 0.03 || Math.abs(dy) < 0.03 || Math.abs(Math.abs(dx) - Math.abs(dy)) < 0.03 ? 0 : 90)
      continue
    }

    const angle = (Math.atan2(dy, dx) * 180) / Math.PI

    out.push(Math.abs(angle - Math.round(angle / 45) * 45))
  }

  return out
}
