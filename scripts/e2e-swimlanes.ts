/**
 * e2e — Session Tree 5/7: the Project swimlanes style, against the isolated test Hermes. It
 * mutates its fixtures (rename, move, archive), so it runs in its own fresh test home of the
 * role (`c<card>-<role>-swim`, the role's port block), moved to the e2e trash first.
 *
 *   node scripts/e2e-swimlanes.ts      (part of `npm run test:e2e`)
 *   KEEP_RUNNING=1 …                    leaves the test gateway up afterwards
 *
 * Every effect is read back: the backend's own `/sessions` and `/state`, the DOM geometry of
 * blocks, lane headers and axis ticks, the network log of every layout-store request, device
 * storage after a reload. Input is real (page.mouse / page.keyboard → CDP Input.*), the middle
 * button and the wheel included. Screenshots go to <test root>/shots/.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Page, Request } from 'playwright-core'

import type { StateSnapshot } from '../src/model/layout-sync.ts'
import type { SessionRow, SessionsResponse } from '../src/model/sessions.ts'
import { close, enableDesktopHalf, goto, launch, signIn } from './e2e/browser.ts'
import type { Session } from './e2e/browser.ts'
import { E2E_ROOT, seedFixtures, setup, signInLink, stopGateway, testHermes, testHermesPids, webappBase } from './e2e/harness.ts'
import { diffSnapshots, snapshotRealHermes } from './e2e/real-hermes-guard.ts'

const t = testHermes(undefined, { variant: 'swim' })
const shots = join(t.root, 'shots')
const results: { name: string; ok: boolean; detail?: string }[] = []
const facts: Record<string, unknown> = {}

const OUT_OF_SCOPE_TIP = 'Outside this project — switch to All projects to edit'
const NO_DRAG_TIP = 'Swimlanes has no dragging'
const HIDDEN_SOURCES = new Set(['acp', 'cron', 'kanban', 'oneshot', 'subagent', 'tool'])

let afterFailure: (() => Promise<void>) | undefined
let diagnose: () => Promise<string> = async () => ''

async function check(name: string, fn: () => Promise<unknown> | unknown): Promise<void> {
  try {
    const detail = await fn()

    results.push({ name, ok: true, detail: detail === undefined ? undefined : JSON.stringify(detail) })
    console.log(`  ✔ ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`)
  } catch (error) {
    const state = await diagnose().catch(diagError => String(diagError))

    results.push({ name, ok: false, detail: `${String(error instanceof Error ? error.message : error)} | ${state}` })
    console.log(`  ✖ ${name} — ${error instanceof Error ? error.message : error}\n      page state: ${state}`)
    await afterFailure?.().catch(() => undefined)
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

// --- helpers -----------------------------------------------------------------------------------

const BLOCK = (id: string) => `[data-testid="session-tree-block"][data-session-id="${id}"]`
const NODE = (id: string) => `.react-flow__node[data-id="${id}"]`
const HEADER = (label: string) => `[data-testid="session-tree-lane-header"][data-label="${label}"]`
const MENU = '[data-testid="session-tree-menu"]'
const ITEM = (action: string) => `${MENU} [data-action="${action}"]`
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/** The fixed lane order the user ruled (2026-11-09), written out independently of `orderLanes`. */
const alphabetical = (labels: readonly string[]) => [...labels].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'accent' }))

async function api<T>(s: Session, path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  return s.page.evaluate(
    async ([p, i]) => {
      const bridge = (window as unknown as { hermesDesktop: { api(req: { path: string; method?: string; body?: unknown }): Promise<unknown> } }).hermesDesktop

      return (await bridge.api({ path: p as string, ...(i as object) })) as never
    },
    [path, init] as const
  )
}

async function rowsOf(s: Session, archived = false, profile = 'default'): Promise<SessionRow[]> {
  return (await api<SessionsResponse>(s, `/api/plugins/session-tree/sessions?session_profile=${profile}&include_archived=${archived}&limit=2000`)).sessions
}

async function stored(s: Session): Promise<StateSnapshot> {
  return api<StateSnapshot>(s, '/api/plugins/session-tree/state?session_profile=default')
}

const layoutOf = (state: StateSnapshot, style = 'dense', scope = 'all') =>
  Object.fromEntries(Object.entries(state.layouts[style]?.[scope] ?? {}).map(([id, entry]) => [id, { x: entry.x, y: entry.y }]))

async function waitFor<T>(what: string, probe: () => Promise<T>, ok: (value: T) => boolean, timeoutMs = 20_000, everyMs = 250): Promise<T> {
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

async function settled(page: Page): Promise<void> {
  await page.locator('[data-testid="session-tree-canvas"]').waitFor({ timeout: 30_000 })
  await page.locator('[data-testid="session-tree-block"]').first().waitFor({ timeout: 30_000 })
  await page.waitForFunction(() => document.querySelector('[data-testid="session-tree-page"]')?.getAttribute('data-projects') !== 'loading', undefined, { timeout: 30_000 })
  await page.waitForTimeout(600)
}

async function openTree(s: Session): Promise<void> {
  await goto(t, s.page, '/session-tree')

  // A session opened in a tab covers the page: the sidebar nav entry brings it back.
  if (!(await s.page.locator('[data-testid="session-tree-canvas"]').waitFor({ timeout: 6000 }).then(() => true, () => false))) {
    await s.page.getByText('Session Tree', { exact: true }).first().click()
  }

  await settled(s.page)
}

/** A real page reload on the Session Tree route (the app may land on `#/` after a reload). */
async function reloadTree(s: Session): Promise<string> {
  if (!s.page.url().includes('#/session-tree')) {
    await goto(t, s.page, '/session-tree')
  }

  await s.page.reload()
  await s.page.waitForTimeout(1500)
  const landed = new URL(s.page.url()).hash

  if (!landed.startsWith('#/session-tree')) {
    await goto(t, s.page, '/session-tree')
  }

  await settled(s.page)

  return landed
}

async function openSettings(s: Session): Promise<void> {
  await goto(t, s.page, '/settings?tab=plugins&plugin=session-tree')
  await s.page.locator('[data-testid="session-tree-settings"]').waitFor({ timeout: 20_000 })
  await s.page.waitForTimeout(500)
}

async function chooseSegment(page: Page, testId: string, label: string): Promise<void> {
  await page.locator(`[data-testid="${testId}"] button`, { hasText: label }).click()
  await page.waitForTimeout(300)
}

/** Picks a toolbar style with the keyboard on the focused select (real key events). */
async function switchStyle(page: Page, to: string): Promise<void> {
  const select = page.locator('[data-testid="session-tree-style"]')
  const options = await select.locator('option').evaluateAll(list => list.map(option => (option as HTMLOptionElement).value))
  const current = await select.inputValue()
  const steps = options.indexOf(to) - options.indexOf(current)

  assert(options.includes(to), `no style ${to} in ${options.join(', ')}`)

  // One option per key press: the select blurs after every change, so focus it before each press.
  for (let i = 0; i < Math.abs(steps); i += 1) {
    await select.focus()
    await page.keyboard.press(steps > 0 ? 'ArrowDown' : 'ArrowUp')
    await page.waitForTimeout(250)
  }

  await page.waitForTimeout(500)
}

async function pageStyle(page: Page): Promise<null | string> {
  return page.getAttribute('[data-testid="session-tree-page"]', 'data-style')
}

async function clickToolbar(page: Page, testId: string): Promise<void> {
  await page.locator(`[data-testid="${testId}"]`).click()
  await page.waitForTimeout(350)
}

async function setScope(page: Page, label: string): Promise<void> {
  await page.locator('[data-testid="session-tree-scope"] button', { hasText: label }).first().click()
  await page.waitForTimeout(500)
}

async function setProfile(page: Page, value: string): Promise<void> {
  await page.locator('[data-testid="session-tree-profile"]').selectOption(value)
  await page.waitForTimeout(300)
}

async function fit(page: Page): Promise<void> {
  await clickToolbar(page, 'session-tree-fit')
}

async function flowPos(page: Page, id: string): Promise<null | { x: number; y: number }> {
  return page.evaluate(nodeId => {
    const el = document.querySelector(`.react-flow__node[data-id="${nodeId}"]`) as HTMLElement | null
    const m = el ? /translate\(\s*([-\d.e]+)px,\s*([-\d.e]+)px\)/.exec(el.style.transform) : null

    return m ? { x: Number(m[1]), y: Number(m[2]) } : null
  }, id)
}

async function viewport(page: Page): Promise<{ x: number; y: number; zoom: number }> {
  return page.$eval('.react-flow__viewport', el => {
    const m = /translate\(([-\d.e]+)px,\s*([-\d.e]+)px\)\s*scale\(([-\d.e]+)\)/.exec((el as HTMLElement).style.transform)

    return m ? { x: Number(m[1]), y: Number(m[2]), zoom: Number(m[3]) } : { x: NaN, y: NaN, zoom: NaN }
  })
}

async function box(page: Page, selector: string) {
  const found = await page.locator(selector).first().boundingBox()

  assert(found, `no box for ${selector}`)

  return found
}

const near = (a: null | { x: number; y: number } | undefined, b: null | { x: number; y: number } | undefined, tolerance = 0.6) =>
  Boolean(a && b && Math.abs(a.x - b.x) <= tolerance && Math.abs(a.y - b.y) <= tolerance)

/** An empty spot of the flow pane (nothing over it that takes the pointer: no block, header or chip). */
async function emptySpot(page: Page): Promise<{ x: number; y: number }> {
  const spot = await page.evaluate(() => {
    const pane = document.querySelector('.react-flow__pane')!.getBoundingClientRect()

    for (let y = pane.top + 60; y < pane.bottom - 30; y += 23) {
      for (let x = pane.left + 220; x < pane.right - 30; x += 29) {
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

async function drag(page: Page, from: { x: number; y: number }, by: { x: number; y: number }, button: 'left' | 'middle' = 'left') {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down({ button })
  await page.mouse.move(from.x + by.x / 2, from.y + by.y / 2, { steps: 10 })
  await page.mouse.move(from.x + by.x, from.y + by.y, { steps: 10 })
  await page.mouse.up({ button })
  await page.waitForTimeout(250)
}

/** Right-click a block (real mouse) and wait for its menu. */
async function openMenu(page: Page, id: string): Promise<void> {
  await fit(page)
  const found = await box(page, BLOCK(id))

  await page.mouse.click(found.x + 30, found.y + found.height / 2, { button: 'right' })
  await page.locator(`${MENU}[data-node-id="${id}"]`).waitFor({ timeout: 5000 })
  await page.waitForTimeout(150)
}

interface Logged {
  at: number
  method: string
  path: string
  body?: string
}

/** Every request a page makes to the layout store and the synced settings. */
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

const writes = (log: Logged[], from = 0, to = Infinity) => log.filter(entry => entry.method !== 'GET' && entry.at >= from && entry.at <= to)
const positionWrites = (log: Logged[], from = 0, to = Infinity) => writes(log, from, to).filter(entry => !entry.path.startsWith('/settings'))

/** What a lane holds by the backend's own rows (the same filters as the page): count + tokens. */
function expectedLanes(rows: readonly SessionRow[]): Record<string, { sessions: number; tokens: number }> {
  const out: Record<string, { sessions: number; tokens: number }> = {}
  const seen = new Set<string>()

  for (const row of rows) {
    if (row.is_internal_child || row.message_count === 0 || HIDDEN_SOURCES.has((row.source ?? '').trim().toLowerCase()) || row.archived) {
      continue
    }

    const lineage = `${row.profile ?? 'default'}::${row._lineage_root_id || row.id}`

    if (seen.has(lineage)) {
      continue
    }

    seen.add(lineage)
    const label = row.git_repo_root ? row.git_repo_root.split('/').filter(Boolean).pop()! : 'Home'
    const lane = (out[label] ??= { sessions: 0, tokens: 0 })

    lane.sessions += 1
    lane.tokens += (row.input_tokens ?? 0) + (row.output_tokens ?? 0)
  }

  return out
}

async function headers(page: Page) {
  return page.$$eval('[data-testid="session-tree-lane-header"]', elements =>
    elements.map(element => {
      const rect = element.getBoundingClientRect()

      return {
        lane: element.getAttribute('data-lane') ?? '',
        label: element.getAttribute('data-label') ?? '',
        sessions: Number(element.getAttribute('data-sessions')),
        tokens: Number(element.getAttribute('data-tokens')),
        singles: Number(element.getAttribute('data-singles')),
        collapsed: element.getAttribute('data-collapsed') === 'true',
        scopeCollapsed: element.getAttribute('data-scope-collapsed') === 'true',
        text: (element as HTMLElement).innerText.replace(/\s+/g, ' ').trim(),
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        width: rect.width,
        height: rect.height
      }
    })
  )
}

/**
 * Watches the page idle for `windowMs` (B1): every long task (`PerformanceObserver('longtask')`,
 * tasks over 50 ms) and every move of the now marker (the minute tick re-renders it). Nothing
 * is input meanwhile.
 */
async function idleLongTasks(page: Page, windowMs: number) {
  await page.evaluate(() => {
    const w = window as unknown as { __stLong: { start: number; duration: number }[]; __stNow: string[]; __stObs: PerformanceObserver; __stMut: MutationObserver }
    const pill = document.querySelector('[data-testid="session-tree-now"]')!

    w.__stLong = []
    w.__stNow = [pill.getAttribute('data-now-x') ?? '']
    w.__stObs = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        w.__stLong.push({ start: Math.round(entry.startTime), duration: Math.round(entry.duration) })
      }
    })
    w.__stObs.observe({ type: 'longtask' })
    w.__stMut = new MutationObserver(() => w.__stNow.push(pill.getAttribute('data-now-x') ?? ''))
    w.__stMut.observe(pill, { attributes: true, attributeFilter: ['data-now-x'] })
  })
  const t0 = Date.now()

  await sleep(windowMs)
  const out = await page.evaluate(() => {
    const w = window as unknown as { __stLong: { start: number; duration: number }[]; __stNow: string[]; __stObs: PerformanceObserver; __stMut: MutationObserver }

    w.__stObs.disconnect()
    w.__stMut.disconnect()

    return { longTasks: w.__stLong, nowX: w.__stNow }
  })

  return { windowMs: Date.now() - t0, ticks: out.nowX.length - 1, nowX: out.nowX, longTasks: out.longTasks, maxMs: Math.max(0, ...out.longTasks.map(task => task.duration)) }
}

/** A scripted 2 s middle-drag pan, counting animation frames (the 500-session fixture). */
async function panFps(page: Page) {
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

/** Block background vs the theme variable it must come from, resolved in place. */
async function themeProbe(page: Page) {
  return page.evaluate(() => {
    const block = document.querySelector('[data-testid="session-tree-block"]') as HTMLElement
    const probe = document.createElement('div')

    probe.style.background = 'var(--ui-bg-elevated)'
    block.parentElement!.appendChild(probe)
    const expected = getComputedStyle(probe).backgroundColor

    probe.remove()

    return { actual: getComputedStyle(block).backgroundColor, expected, top: getComputedStyle(block).borderTopWidth }
  })
}

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
  for (const variant of [undefined, 'actions', 'sync']) {
    stopGateway(testHermes(undefined, variant ? { variant } : {}))
  }

  freshHome()
  mkdirSync(shots, { recursive: true })
  console.log(`e2e swimlanes — role ${t.role}, home ${t.home}`)
  const manifest = setup(t) as { seeded?: boolean }

  assert(manifest.seeded === true, 'the swimlanes home was not freshly seeded')
  const s = await launch({ colorScheme: 'light' })
  const { page } = s
  const log = stateLog(page)
  const stacks: string[] = []
  let failures = 0

  page.on('pageerror', error => stacks.push(`${error.message}\n${error.stack ?? ''}`))
  diagnose = async () => {
    failures += 1
    await page.screenshot({ path: join(shots, `failure-${failures}.png`) }).catch(() => undefined)

    return `${await page.evaluate(() => JSON.stringify({ hash: location.hash, style: document.querySelector('[data-testid="session-tree-page"]')?.getAttribute('data-style') }))} (failure-${failures}.png)`
  }
  afterFailure = async () => {
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    // Back to All projects with Show all / Show archived off, so one failed check does not leave
    // the next in another view.
    const all = page.locator('[data-testid="session-tree-scope"] button[data-scope="all"]')

    if ((await all.count()) > 0 && (await all.getAttribute('aria-checked')) !== 'true') {
      await all.click()
      await page.waitForTimeout(400)
    }

    for (const toggle of ['session-tree-show-all', 'session-tree-show-archived']) {
      const button = page.locator(`[data-testid="${toggle}"]`)

      if ((await button.count()) > 0 && (await button.getAttribute('aria-pressed')) === 'true') {
        await button.click()
        await page.waitForTimeout(400)
      }
    }
  }

  let rows: SessionRow[] = []
  let denseBefore: Record<string, { x: number; y: number }> = {}
  let swimFrom = 0
  let swimTo = 0

  try {
    await check('sign in, enable the desktop half, open the page (Dense, the default); Dense saves its auto-layout', async () => {
      await signIn(t, page)
      await enableDesktopHalf(t, page)
      await openTree(s)
      rows = await rowsOf(s)
      const state = await waitFor('the Dense auto-layout stored', () => stored(s), value => Object.keys(layoutOf(value)).length > 10)

      // Let the first saves settle: nothing more is queued once the layout is stored.
      await sleep(1500)
      denseBefore = layoutOf(await stored(s))

      assert((await pageStyle(page)) === 'dense', 'not on Dense first')

      return { rows: rows.length, denseStored: Object.keys(denseBefore).length, rev: state.rev }
    })

    await check('switch to Project swimlanes through Settings (synced style stored), the page draws it', async () => {
      await openSettings(s)
      const labels = await page.locator('[data-testid="session-tree-settings-style"] button').allInnerTexts()

      assert(labels.map(label => label.trim()).includes('Project swimlanes'), `settings styles ${JSON.stringify(labels)}`)
      swimFrom = Date.now()
      await chooseSegment(page, 'session-tree-settings-style', 'Project swimlanes')
      await waitFor('the synced style stored', () => stored(s), value => value.settings.style === 'swimlanes')
      await openTree(s)
      const canvasStyle = await page.getAttribute('[data-testid="session-tree-canvas"]', 'data-style')

      assert((await pageStyle(page)) === 'swimlanes' && canvasStyle === 'swimlanes', `page ${await pageStyle(page)} canvas ${canvasStyle}`)
      await page.locator('[data-testid="session-tree-lane-header"]').first().waitFor({ timeout: 10_000 })
      await page.screenshot({ path: join(shots, 'swim-all-light.png') })

      return { style: await pageStyle(page) }
    })

    await check('one lane per project in the fixed alphabetical order (user ruling 2026-11-09; the toolbar keeps projects.tree\'s order), plus the no-project lane (Home) last; header counts and tokens equal the backend\'s rows', async () => {
      const shown = await headers(page)
      const scopeLabels = await page.$$eval('[data-testid="session-tree-scope"] button[data-scope]', buttons =>
        buttons.filter(button => button.getAttribute('data-scope') !== 'all').map(button => (button as HTMLElement).innerText.trim())
      )
      const expected = expectedLanes(rows)
      const projectLabels = scopeLabels.filter(label => label !== 'Home')

      assert(JSON.stringify(shown.map(lane => lane.label)) === JSON.stringify([...alphabetical(projectLabels), 'Home']), `lanes ${JSON.stringify(shown.map(lane => lane.label))} vs toolbar ${JSON.stringify(scopeLabels)}`)
      // The toolbar's scope picker is not re-sorted: it still lists projects.tree's order.
      assert(JSON.stringify(projectLabels) !== JSON.stringify(alphabetical(projectLabels)), `the fixture's projects.tree order is already alphabetical (${JSON.stringify(projectLabels)}): the check proves nothing`)

      for (const lane of shown) {
        assert(expected[lane.label], `no backend rows for ${lane.label}`)
        assert(lane.sessions === expected[lane.label].sessions, `${lane.label}: ${lane.sessions} sessions vs backend ${expected[lane.label].sessions}`)
        assert(lane.tokens === expected[lane.label].tokens, `${lane.label}: ${lane.tokens} tokens vs backend ${expected[lane.label].tokens}`)
        assert(lane.text.includes(`${lane.sessions} session`), `${lane.label} header text: ${lane.text}`)
      }

      // Every block sits inside its lane's band (header rows match the band vertically).
      const outside = await page.evaluate(() => {
        const heads = [...document.querySelectorAll('[data-testid="session-tree-lane-header"]')].map(el => ({ lane: el.getAttribute('data-lane'), r: el.getBoundingClientRect() }))
        const bad: string[] = []

        for (const block of document.querySelectorAll('[data-testid="session-tree-block"]')) {
          const lane = block.getAttribute('data-project-id') || '__no_project__'
          const head = heads.find(each => each.lane === lane)
          const r = block.getBoundingClientRect()

          if (!head || r.top < head.r.top - 0.5 || r.bottom > head.r.bottom + 0.5) {
            bad.push(`${block.getAttribute('data-session-id')}@${lane}`)
          }
        }

        return bad
      })

      assert(outside.length === 0, `blocks outside their lane: ${outside.join(', ')}`)
      facts.lanes = shown.map(lane => ({ label: lane.label, sessions: lane.sessions, tokens: lane.tokens }))

      return facts.lanes
    })

    await check('compact blocks: 170 × 54, the project colour as a top border, a title and one meta line; ×N pill on the compacted conversation; stand-in and "continued as" drawn', async () => {
      const shape = await page.$eval(BLOCK('st-sys-tip'), el => {
        const style = getComputedStyle(el)

        return {
          w: (el as HTMLElement).offsetWidth,
          h: (el as HTMLElement).offsetHeight,
          top: style.borderTopWidth,
          title: el.querySelector('.st-title')?.textContent,
          meta: (el.querySelector('.st-swim-meta') as HTMLElement | null)?.innerText.replace(/\s+/g, ' ').trim(),
          pill: el.querySelector('[data-testid="session-tree-compacted"]')?.textContent
        }
      })

      assert(shape.w === 170 && shape.h === 54 && shape.top === '3px', `shape ${JSON.stringify(shape)}`)
      assert(/msgs/.test(shape.meta ?? '') && /ago|now|running/.test(shape.meta ?? ''), `meta ${shape.meta}`)
      assert(/compacted ×3/.test(shape.pill ?? ''), `pill ${shape.pill}`)
      assert((await page.locator('[data-testid="session-tree-standin"]').count()) === 1, 'no stand-in')
      assert((await page.locator('[data-testid="session-tree-link"][data-kind="reset"]').count()) === 1, 'no continued-as link')
      assert((await page.locator('[data-testid="session-tree-link-label"]').first().innerText()).includes('continued as'), 'no continued-as label')
      const path = await page.$eval('[data-testid="session-tree-link"][data-source="st-hp-root"][data-target="st-hp-mockup"] path.react-flow__edge-path', el => el.getAttribute('d') ?? '')

      assert(/Q/.test(path) || /^M[\d. -]+L[\d. -]+$/.test(path), `not an orthogonal path: ${path}`)

      return shape
    })

    await check('the lane headers stay put on a horizontal pan (middle drag) and follow the lanes on a vertical one; the axis stays put vertically and follows horizontally', async () => {
      await fit(page)
      const spot = await emptySpot(page)
      const before = await headers(page)
      const blockBefore = await box(page, BLOCK('st-hp-root'))
      const tickBefore = await box(page, '[data-testid="session-tree-axis-tick"]')

      await drag(page, spot, { x: 140, y: 0 }, 'middle')
      const after = await headers(page)
      const blockAfter = await box(page, BLOCK('st-hp-root'))
      const tickAfter = await box(page, '[data-testid="session-tree-axis-tick"]')

      assert(Math.abs(blockAfter.x - blockBefore.x - 140) < 2, `the block moved ${blockAfter.x - blockBefore.x}`)
      assert(after.every((lane, i) => Math.abs(lane.left - before[i].left) < 0.5 && Math.abs(lane.top - before[i].top) < 0.5), 'a header moved on a horizontal pan')
      assert(Math.abs(tickAfter.x - tickBefore.x - 140) < 2, `the axis did not follow horizontally (${tickAfter.x - tickBefore.x})`)
      const spot2 = await emptySpot(page)

      await drag(page, spot2, { x: 0, y: 60 }, 'middle')
      const vertical = await headers(page)
      const tickVertical = await box(page, '[data-testid="session-tree-axis-tick"]')

      assert(vertical.every((lane, i) => Math.abs(lane.top - after[i].top - 60) < 2 && Math.abs(lane.left - after[i].left) < 0.5), 'the headers did not follow the vertical pan')
      assert(Math.abs(tickVertical.y - tickAfter.y) < 0.5, 'the axis moved vertically')
      // Lane heights match at every zoom: header height = lane height × zoom (two zooms).
      const { zoom } = await viewport(page)
      const sizes = vertical.map(lane => lane.height / zoom)

      await page.mouse.move(spot2.x, spot2.y)
      await page.mouse.wheel(0, 300)
      await sleep(300)
      const zoomed = await headers(page)
      const zoom2 = (await viewport(page)).zoom

      assert(Math.abs(zoom2 - zoom) > 0.05, 'the wheel did not zoom')
      assert(zoomed.every((lane, i) => Math.abs(lane.height / zoom2 - sizes[i]) < 1 && Math.abs(lane.width - before[i].width) < 0.5), 'header heights do not track the zoom, or widths changed')
      await fit(page)

      return { headerLeft: after[0].left, laneHeights: sizes.map(Math.round), zooms: [zoom, zoom2] }
    })

    await check('the time axis: a block\'s x falls on its start day\'s tick (within one tick width); an old session sits in the "earlier" zone, never on a tick; the now marker is right of every block start', async () => {
      await clickToolbar(page, 'session-tree-show-all')
      await clickToolbar(page, 'session-tree-show-archived')
      await page.locator(BLOCK('st-archived-0')).waitFor({ timeout: 15_000 })
      await fit(page)
      const archivedRows = await rowsOf(s, true)
      const startOf = new Map(archivedRows.map(row => [row.id, row.started_at ?? 0]))
      const probe = ['st-sys-tip', 'st-md-tip', 'st-hp-root', 'st-split-root', 'st-single-02', 'st-single-09', 'st-single-15']
      const placed = await page.evaluate(
        ([ids, starts]) => {
          const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
          const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
          const ticks = [...document.querySelectorAll('[data-testid="session-tree-axis-tick"]')].map(el => ({ text: (el as HTMLElement).innerText.trim(), x: el.getBoundingClientRect().left }))
          const width = ticks[1].x - ticks[0].x

          return (ids as string[]).map(id => {
            const date = new Date((starts as Record<string, number>)[id] * 1000)
            const labels = [`${months[date.getMonth()]} ${date.getDate()}`, `${days[date.getDay()]} ${date.getDate()}`]
            const tick = ticks.find(each => labels.includes(each.text))
            const left = document.querySelector(`[data-session-id="${id}"]`)!.getBoundingClientRect().left

            return { id, labels, tick: tick?.text ?? null, offset: tick ? left - tick.x : null, width }
          })
        },
        [probe, Object.fromEntries(probe.map(id => [id, startOf.get(id) ?? 0]))] as const
      )
      const off = placed.filter(each => each.offset === null || each.offset < -0.5 || each.offset >= each.width + 0.5)

      assert(off.length === 0, `blocks off their day tick: ${JSON.stringify(off)}`)
      // 300 h old (12.5 days): before the 9-day window, so the earlier zone.
      const earlier = await page.evaluate(() => {
        const first = document.querySelector('[data-testid="session-tree-axis-tick"]')!.getBoundingClientRect().left
        const block = document.querySelector('[data-session-id="st-archived-0"]')!.getBoundingClientRect()
        const label = document.querySelector('[data-testid="session-tree-axis-earlier"]')!.getBoundingClientRect().left

        return { blockRight: block.right, first, label, blockLeft: block.left }
      })

      assert(earlier.blockRight <= earlier.first, `the 12-day-old block reaches the first day tick: ${JSON.stringify(earlier)}`)
      // The marker line (the pill moves aside when it would cover today's label, NB2). A
      // vertical line has no width: read its client rect directly.
      const nowBox = await page.$eval('[data-testid="session-tree-now-line"]', el => {
        const r = el.getBoundingClientRect()

        return { x: r.left, width: r.width }
      })
      const now = nowBox.x + nowBox.width / 2
      // A root's start is its time; a child pushed right of its parent (the documented clamp)
      // reads "after", not a time, and may sit right of the marker.
      const starts = await page.evaluate(() => {
        const targets = new Set([...document.querySelectorAll('[data-testid="session-tree-link"]')].map(el => el.getAttribute('data-target')))

        return [...document.querySelectorAll('[data-testid="session-tree-block"]')]
          .filter(el => !targets.has(el.getAttribute('data-node-id')))
          .map(el => ({ id: el.getAttribute('data-session-id'), x: el.getBoundingClientRect().left }))
      })
      const late = starts.filter(each => each.x > now + 1)

      assert(starts.length > 20 && late.length === 0, `roots right of the now marker: ${JSON.stringify(late)}`)
      await page.screenshot({ path: join(shots, 'swim-show-all-archived.png') })
      await clickToolbar(page, 'session-tree-show-archived')
      await clickToolbar(page, 'session-tree-show-all')
      facts.axis = { placed, earlier }

      return { placed: placed.map(each => `${each.id}→${each.tick}+${Math.round(each.offset ?? -1)}`), earlier }
    })

    await check('NB2 + NB3: the now pill never covers today\'s tick label, and every expanded lane header shows its count and tokens (fit zoom and the minimum zoom; bounding boxes)', async () => {
      await fit(page)
      const probe = () =>
        page.evaluate(() => {
          const ticks = [...document.querySelectorAll('[data-testid="session-tree-axis-tick"]')]
          const label = ticks.at(-1)!.querySelector('.st-swim-tick-label')!.getBoundingClientRect()
          const pillEl = document.querySelector('[data-testid="session-tree-now"]')!
          const pill = pillEl.getBoundingClientRect()
          const line = document.querySelector('[data-testid="session-tree-now-line"]')!.getBoundingClientRect().left
          const hit = pill.left < label.right && label.left < pill.right && pill.top < label.bottom && label.top < pill.bottom
          const heads = [...document.querySelectorAll('[data-testid="session-tree-lane-header"][data-collapsed="false"]')].map(el => {
            const head = el.getBoundingClientRect()
            const totals = el.querySelector('[data-field="totals"]')
            const r = totals?.getBoundingClientRect()

            return {
              label: el.getAttribute('data-label'),
              sessions: el.getAttribute('data-sessions'),
              height: Math.round(head.height),
              text: (totals as HTMLElement | null)?.innerText.trim() ?? null,
              compact: totals?.getAttribute('data-compact') === 'true',
              inside: Boolean(r && r.height > 0 && r.top >= head.top - 0.5 && r.bottom <= head.bottom + 0.5)
            }
          })

          return { hit, shifted: pillEl.getAttribute('data-shifted'), pill: [Math.round(pill.left), Math.round(pill.right)], label: [Math.round(label.left), Math.round(label.right)], line: Math.round(line), heads }
        })
      const atFit = { zoom: (await viewport(page)).zoom, ...(await probe()) }
      const spot = await emptySpot(page)

      await page.mouse.move(spot.x, spot.y)

      for (let i = 0; i < 12; i += 1) {
        await page.mouse.wheel(0, 400)
        await sleep(60)
      }

      await sleep(400)
      const atMin = { zoom: (await viewport(page)).zoom, ...(await probe()) }

      await fit(page)
      assert(Math.abs(atMin.zoom - 0.3) < 0.01 && atFit.zoom > atMin.zoom + 0.01, `zooms ${atFit.zoom} / ${atMin.zoom}`)

      for (const at of [atFit, atMin]) {
        assert(!at.hit, `the now pill covers today's label at zoom ${at.zoom}: pill ${at.pill}, label ${at.label}`)
        // It stays next to the line: at most just right of today's label.
        assert(at.pill[0] <= Math.max(at.line, at.label[1]) + 8, `the pill strayed from the line at zoom ${at.zoom}: ${JSON.stringify(at)}`)
        assert(at.heads.length >= 3 && at.heads.every(head => head.inside && head.text?.startsWith(`${head.sessions} session`) && / tok$/.test(head.text)), `headers at zoom ${at.zoom}: ${JSON.stringify(at.heads)}`)
      }

      // At the minimum zoom a day column (42 px) is narrower than the label and the pill: the
      // pill was moved aside (the path that fixes the overlap ran), and short lanes are compact.
      assert(atMin.shifted === 'true', `the pill was not moved aside at the minimum zoom: ${JSON.stringify(atMin)}`)
      assert(atMin.heads.some(head => head.compact), 'no compact header at the minimum zoom')
      facts.nb2nb3 = { atFit, atMin }

      return { fit: { zoom: atFit.zoom, shifted: atFit.shifted, compact: atFit.heads.filter(head => head.compact).length }, min: { zoom: atMin.zoom, shifted: atMin.shifted, compact: atMin.heads.filter(head => head.compact).length }, lanes: atMin.heads.length }
    })

    await check('no dragging: a real mouse drag does not move a block, and nothing is written to the position store (network log)', async () => {
      await fit(page)
      const before = await flowPos(page, 'st-hp-root')
      const from = Date.now()
      const found = await box(page, BLOCK('st-hp-root'))

      await drag(page, { x: found.x + 40, y: found.y + 27 }, { x: 160, y: 90 })
      await sleep(1500)
      const after = await flowPos(page, 'st-hp-root')
      const draggable = await page.$eval(NODE('st-hp-root'), el => el.classList.contains('draggable'))

      assert(near(before, after, 0.01), `the block moved: ${JSON.stringify(before)} → ${JSON.stringify(after)}`)
      assert(!draggable, 'the node is draggable')
      assert(positionWrites(log, from).length === 0, `writes: ${JSON.stringify(positionWrites(log, from))}`)

      return { before, after, writes: 0 }
    })

    await check('Snap is disabled with its tooltip ("Swimlanes has no dragging"), no grid; Re-arrange is hidden', async () => {
      const snap = page.locator('[data-testid="session-tree-snap"]')
      const state = await snap.evaluate(el => ({ disabled: (el as HTMLButtonElement).disabled, title: el.getAttribute('title'), wrap: el.parentElement?.getAttribute('title') }))
      const from = Date.now()

      await page.locator('[data-testid="session-tree-snap-wrap"]').click({ force: true })
      await sleep(600)
      const grid = await page.getAttribute('[data-testid="session-tree-canvas"]', 'data-snap')
      const dots = await page.locator('.react-flow__background').count()

      assert(state.disabled && state.title === NO_DRAG_TIP && state.wrap === NO_DRAG_TIP, `snap ${JSON.stringify(state)}`)
      assert(grid === 'off' && dots === 0, `grid ${grid}, background ${dots}`)
      assert(writes(log, from).length === 0, 'the click wrote something')
      assert((await page.locator('[data-testid="session-tree-rearrange"]').count()) === 0, 'Re-arrange is shown')

      return state
    })

    await check('navigation: the plain wheel zooms toward the cursor (the point under it stays), middle-drag pans, Space + left-drag pans; toolbar zoom works', async () => {
      await fit(page)
      const spot = await emptySpot(page)
      const canvas = await box(page, '[data-testid="session-tree-canvas"]')
      const v0 = await viewport(page)
      const worldBefore = { x: (spot.x - canvas.x - v0.x) / v0.zoom, y: (spot.y - canvas.y - v0.y) / v0.zoom }

      await page.mouse.move(spot.x, spot.y)
      await page.mouse.wheel(0, -240)
      await sleep(400)
      const v1 = await viewport(page)
      const screenAfter = { x: canvas.x + v1.x + worldBefore.x * v1.zoom, y: canvas.y + v1.y + worldBefore.y * v1.zoom }

      assert(v1.zoom > v0.zoom + 0.05, `zoom ${v0.zoom} → ${v1.zoom}`)
      assert(Math.abs(screenAfter.x - spot.x) <= 2 && Math.abs(screenAfter.y - spot.y) <= 2, `the point under the cursor moved to ${JSON.stringify(screenAfter)} from ${JSON.stringify(spot)}`)
      const spot2 = await emptySpot(page)

      await drag(page, spot2, { x: -90, y: 40 }, 'middle')
      const v2 = await viewport(page)

      assert(Math.abs(v2.x - v1.x + 90) < 2 && Math.abs(v2.y - v1.y - 40) < 2, `middle pan ${JSON.stringify(v1)} → ${JSON.stringify(v2)}`)
      const spot3 = await emptySpot(page)

      await page.keyboard.down('Space')
      await drag(page, spot3, { x: 70, y: -30 })
      await page.keyboard.up('Space')
      const v3 = await viewport(page)

      assert(Math.abs(v3.x - v2.x - 70) < 2 && Math.abs(v3.y - v2.y + 30) < 2, `space pan ${JSON.stringify(v2)} → ${JSON.stringify(v3)}`)
      const zoomBefore = (await viewport(page)).zoom

      await clickToolbar(page, 'session-tree-zoom-in')
      assert((await viewport(page)).zoom > zoomBefore, 'toolbar + did not zoom')
      await fit(page)

      return { wheel: [v0.zoom, v1.zoom], middle: [v2.x - v1.x, v2.y - v1.y], space: [v3.x - v2.x, v3.y - v2.y] }
    })

    await check('collapse / expand a lane from its header; the state is per device and survives a reload', async () => {
      const label = 'hermes-plugins'

      await page.locator(HEADER(label)).click()
      await page.waitForFunction(selector => document.querySelector(selector)?.getAttribute('data-collapsed') === 'true', HEADER(label), { timeout: 5000 })
      const collapsed = await headers(page)
      const lane = collapsed.find(each => each.label === label)!

      assert((await page.locator(BLOCK('st-hp-root')).count()) === 0, 'blocks of a collapsed lane still drawn')
      assert((await page.locator(`[data-testid="session-tree-lane-activity"][data-lane="${lane.lane}"]`).count()) >= 3, 'no activity bar on the collapsed lane')
      await reloadTree(s)
      await page.locator('[data-testid="session-tree-lane-header"]').first().waitFor({ timeout: 10_000 })
      const reloaded = (await headers(page)).find(each => each.label === label)!

      assert(reloaded.collapsed, 'the collapse did not survive a reload')
      assert((await page.locator(BLOCK('st-hp-root')).count()) === 0, 'blocks back after the reload')
      await page.locator(HEADER(label)).click()
      await page.locator(BLOCK('st-hp-root')).waitFor({ timeout: 5000 })
      await reloadTree(s)
      const expanded = (await headers(page)).find(each => each.label === label)!

      assert(!expanded.collapsed && (await page.locator(BLOCK('st-hp-root')).count()) === 1, 'the expand did not survive a reload')
      const stored = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.includes('session-tree') && key.includes('device.v1')).map(([, value]) => JSON.parse(value).collapsedLanes))

      return { collapsedHeight: Math.round(lane.height), afterReload: reloaded.collapsed, deviceStorage: stored }
    })

    await check('project scope: the other lanes collapse to thin headers with activity bars and the view re-fits; the cross-project parent is a dimmed, read-only ghost labelled with its project', async () => {
      await fit(page)
      const v0 = await viewport(page)
      const from = Date.now()

      await setScope(page, 'mdesign')
      const lanes = await headers(page)
      const v1 = await viewport(page)
      const ghost = page.locator(BLOCK('st-split-root'))

      await ghost.waitFor({ timeout: 5000 })
      const look = await ghost.evaluate(el => ({
        ghost: el.getAttribute('data-ghost'),
        opacity: Number(getComputedStyle(el).opacity),
        project: (el.querySelector('[data-testid="session-tree-ghost-project"]') as HTMLElement | null)?.innerText
      }))

      assert(lanes.filter(lane => lane.label !== 'mdesign').every(lane => lane.collapsed && lane.scopeCollapsed && lane.height < 40), `lanes ${JSON.stringify(lanes)}`)
      assert(!lanes.find(lane => lane.label === 'mdesign')!.collapsed, 'the scoped lane is collapsed')
      assert((await page.locator('[data-testid="session-tree-lane-activity"]').count()) > 5, 'no activity bars')
      assert(v1.x !== v0.x || v1.y !== v0.y || v1.zoom !== v0.zoom, 'the view did not re-fit')
      assert(look.ghost === 'true' && look.opacity < 1 && look.project === 'syscanvas', `ghost ${JSON.stringify(look)}`)
      // The ghost sits at the lane's left edge: left of every other block.
      const lefts = await page.$$eval('[data-testid="session-tree-block"]', els => els.map(el => ({ id: el.getAttribute('data-session-id'), x: el.getBoundingClientRect().left })))
      const ghostLeft = lefts.find(each => each.id === 'st-split-root')!.x

      assert(lefts.every(each => each.id === 'st-split-root' || each.x > ghostLeft), 'the ghost is not at the left edge')
      // NB1: just left of the lane's leftmost block (or of the day window), not a fixed far-left
      // column: the gap is GHOST_GAP (40) world px, and the ghost never reaches the first day.
      const firstTick = (await box(page, '[data-testid="session-tree-axis-tick"]')).x
      const ghostBox = await box(page, BLOCK('st-split-root'))
      const leftmost = Math.min(...lefts.filter(each => each.id !== 'st-split-root').map(each => each.x))
      const expectedRight = Math.min(leftmost, firstTick) - 40 * v1.zoom

      assert(Math.abs(ghostBox.x + ghostBox.width - expectedRight) < 2, `ghost right ${ghostBox.x + ghostBox.width}, expected ${expectedRight} (leftmost ${leftmost}, first tick ${firstTick}, zoom ${v1.zoom})`)
      assert(ghostBox.x + ghostBox.width <= firstTick + 0.5, 'the ghost reaches into the day window')
      facts.scopeFit = { zoom: v1.zoom, ghostRight: ghostBox.x + ghostBox.width, leftmost, firstTick }
      assert((await page.locator('[data-testid="session-tree-link"][data-source="st-split-root"][data-target="st-split-child"]').count()) === 1, 'no link from the ghost')
      // Read-only: tooltip, no menu, no selection, no drag, no open.
      const gbox = await box(page, BLOCK('st-split-root'))

      await page.mouse.move(gbox.x + 40, gbox.y + 20)
      await page.locator('[data-testid="session-tree-tooltip"]').waitFor({ timeout: 5000 })
      const tip = (await page.locator('[data-testid="session-tree-tooltip"]').innerText()).trim()

      await page.mouse.click(gbox.x + 40, gbox.y + 20, { button: 'right' })
      await sleep(600)
      const menus = await page.locator(MENU).count()

      await page.keyboard.press('Escape')
      await page.mouse.click(gbox.x + 40, gbox.y + 20)
      const selected = await page.$eval(BLOCK('st-split-root'), el => el.classList.contains('is-selected'))
      const tabs = await page.getByRole('tab').count()

      await page.mouse.dblclick(gbox.x + 40, gbox.y + 20)
      await sleep(1200)
      const tabsAfter = await page.getByRole('tab').count()
      const posBefore = await flowPos(page, 'st-split-root')

      await drag(page, { x: gbox.x + 40, y: gbox.y + 20 }, { x: 120, y: 40 })
      const posAfter = await flowPos(page, 'st-split-root')

      assert(tip === OUT_OF_SCOPE_TIP, `tooltip "${tip}"`)
      assert(menus === 0, 'a menu opened on the ghost')
      assert(!selected, 'the ghost got selected')
      assert(tabsAfter === tabs, 'a double-click on the ghost opened a tab')
      assert(near(posBefore, posAfter, 0.01), 'the ghost moved')
      // A header click in a scope changes nothing (the scope collapse is derived, the device map is untouched).
      const sysHeader = await box(page, HEADER('syscanvas'))

      await page.mouse.click(sysHeader.x + 40, sysHeader.y + sysHeader.height / 2)
      await sleep(300)
      assert((await headers(page)).find(lane => lane.label === 'syscanvas')!.scopeCollapsed, 'the scope collapse changed')
      await page.screenshot({ path: join(shots, 'swim-scope-light.png') })
      await setScope(page, 'All')
      const back = await headers(page)

      assert(back.every(lane => !lane.collapsed), `lanes still collapsed after All: ${JSON.stringify(back.filter(lane => lane.collapsed).map(lane => lane.label))}`)
      assert(positionWrites(log, from).length === 0, `writes in scope: ${JSON.stringify(positionWrites(log, from))}`)

      return { ghost: look, tip, menus, tabs: [tabs, tabsAfter], refit: [v0, v1] }
    })

    await check('the singles popover: the lane chip lists that lane\'s sessions without branches; double-click opens one in a tab; right-click gives the session menu', async () => {
      await fit(page)
      const lane = (await headers(page)).find(each => each.label === 'syscanvas')!
      const chip = page.locator(`[data-testid="session-tree-lane-chip"][data-lane="${lane.lane}"]`)
      const count = Number(await chip.getAttribute('data-count'))

      await chip.click()
      const pop = page.locator(`[data-testid="session-tree-lane-popover"][data-lane="${lane.lane}"]`)

      await pop.waitFor({ timeout: 5000 })
      const items = await pop.locator('[data-testid="session-tree-lane-single"]').evaluateAll(els => els.map(el => el.getAttribute('data-session-id')))

      assert(count === lane.singles && items.length === count && count > 0, `chip ${count}, header ${lane.singles}, popover ${items.length}`)
      assert(items.every(id => id?.startsWith('st-single-')), `popover items ${JSON.stringify(items)}`)
      await page.screenshot({ path: join(shots, 'swim-singles-popover.png') })
      const target = items[0]!
      const item = pop.locator(`[data-testid="session-tree-lane-single"][data-session-id="${target}"]`)
      const itemBox = (await item.boundingBox())!

      await page.mouse.click(itemBox.x + 40, itemBox.y + itemBox.height / 2, { button: 'right' })
      await page.locator(`${MENU}[data-node-id="${target}"]`).waitFor({ timeout: 5000 })
      const menuItems = await page.locator(`${MENU} [data-action]`).evaluateAll(els => els.map(el => el.getAttribute('data-action')))

      await page.keyboard.press('Escape')
      await page.locator(MENU).waitFor({ state: 'detached', timeout: 5000 })
      const tabsBefore = await page.getByRole('tab').count()
      const stillOpen = await pop.count()

      if (!stillOpen) {
        await chip.click()
        await pop.waitFor({ timeout: 5000 })
      }

      const again = (await pop.locator(`[data-testid="session-tree-lane-single"][data-session-id="${target}"]`).boundingBox())!

      await page.mouse.dblclick(again.x + 40, again.y + again.height / 2)
      await page.waitForFunction(before => document.querySelectorAll('[role="tab"]').length > before, tabsBefore, { timeout: 20_000 })
      const focused = await page.evaluate(() => (globalThis as unknown as { __HERMES_PLUGIN_SDK__: { host: { state: { focusedStoredSessionId: { get(): unknown } } } } }).__HERMES_PLUGIN_SDK__.host.state.focusedStoredSessionId.get())

      await page.keyboard.press('Escape')
      assert(['rename', 'archive', 'move', 'branch'].every(action => menuItems.includes(action)), `menu ${JSON.stringify(menuItems)}`)
      assert(focused === target, `focused ${focused}, wanted ${target}`)
      // The session tab now covers the page: back through the sidebar nav.
      await page.getByText('Session Tree', { exact: true }).first().click()
      await settled(page)

      return { lane: lane.label, count, opened: target, menu: menuItems.length }
    })

    await check('NB5: the singles popover opens below a chip high in the canvas and above a chip low in it, never clipped by the canvas (geometry)', async () => {
      await fit(page)
      const over = await box(page, '[data-testid="session-tree-swim-over"]')
      const lanes = (await headers(page)).filter(lane => !lane.collapsed && lane.singles > 0)
      const open = async (laneKey: string) => {
        const chipSel = `[data-testid="session-tree-lane-chip"][data-lane="${laneKey}"]`
        const chip = await box(page, chipSel)

        await page.locator(chipSel).click()
        const pop = page.locator(`[data-testid="session-tree-lane-popover"][data-lane="${laneKey}"]`)

        await pop.waitFor({ timeout: 5000 })
        const p = (await pop.boundingBox())!
        const placement = await pop.getAttribute('data-placement')
        const clipped = await pop.evaluate(el => el.scrollHeight > el.clientHeight + 1)

        await page.keyboard.press('Escape')
        await pop.waitFor({ state: 'detached', timeout: 5000 })

        return { placement, chip: [Math.round(chip.y), Math.round(chip.y + chip.height)], pop: [Math.round(p.y), Math.round(p.y + p.height)], clipped, inside: p.y >= over.y - 0.5 && p.y + p.height <= over.y + over.height + 0.5 }
      }
      const high = await open(lanes[0].lane)
      // Pan the last lane's chip to ~40 px above the canvas bottom.
      const last = lanes.at(-1)!
      const chipBefore = await box(page, `[data-testid="session-tree-lane-chip"][data-lane="${last.lane}"]`)

      await drag(page, await emptySpot(page), { x: 0, y: Math.round(over.y + over.height - 40 - (chipBefore.y + chipBefore.height)) }, 'middle')
      const low = await open(last.lane)

      await fit(page)
      assert(high.placement === 'below' && high.pop[0] >= high.chip[1] && high.inside && !high.clipped, `high chip ${JSON.stringify(high)}`)
      assert(low.placement === 'above' && low.pop[1] <= low.chip[0] && low.inside && !low.clipped, `low chip ${JSON.stringify(low)}`)

      return { high, low }
    })

    await check('Dense → Swimlanes → Dense (toolbar switcher): every stored Dense position is unchanged, Dense draws them; Swimlanes wrote no position, layout or forget (network log, state.json)', async () => {
      await openTree(s)
      // The Swimlanes period ends when the switch back starts: Dense lays out after it.
      swimTo = Date.now()
      await switchStyle(page, 'dense')
      await waitFor('dense stored', () => stored(s), value => value.settings.style === 'dense')
      await settled(page)
      const state = await stored(s)
      const after = layoutOf(state)
      const changed = Object.entries(denseBefore).filter(([id, point]) => !near(after[id], point, 0))
      const extra = Object.keys(after).filter(id => !(id in denseBefore))
      const swimWrites = writes(log, swimFrom, swimTo).filter(entry => !entry.path.startsWith('/settings'))
      const onScreen = await flowPos(page, 'st-hp-root')

      assert(changed.length === 0 && extra.length === 0, `Dense positions changed: ${JSON.stringify(changed.slice(0, 5))} extra ${JSON.stringify(extra)}`)
      assert(swimWrites.length === 0, `Swimlanes wrote: ${JSON.stringify(swimWrites)}`)
      assert(!state.layouts.swimlanes, `a swimlanes layout was stored: ${JSON.stringify(Object.keys(state.layouts))}`)
      assert(near(onScreen, after['st-hp-root']), 'Dense does not draw its stored position')
      // And back to Swimlanes through the toolbar (the synced style).
      await switchStyle(page, 'swimlanes')
      await waitFor('swimlanes stored', () => stored(s), value => value.settings.style === 'swimlanes')
      await page.locator('[data-testid="session-tree-lane-header"]').first().waitFor({ timeout: 10_000 })
      swimFrom = Date.now()
      facts.denseInvariant = { compared: Object.keys(denseBefore).length, settingsWrites: writes(log, 0, swimTo).filter(entry => entry.path.startsWith('/settings')).length }

      return { compared: Object.keys(denseBefore).length, swimWrites: 0, style: await pageStyle(page) }
    })

    await check('Rename from a swimlane block\'s menu: the dialog saves, the block shows the new title (read back from the backend)', async () => {
      await openMenu(page, 'st-hp-mockup')
      await page.locator(ITEM('rename')).click()
      const input = page.locator('[data-testid="session-tree-rename-input"]')

      await input.waitFor({ timeout: 5000 })
      await input.press('Control+A')
      await page.keyboard.type('Mockup of the swimlanes')
      await page.keyboard.press('Enter')
      await waitFor('renamed', async () => (await rowsOf(s)).find(row => row.id === 'st-hp-mockup')?.title, title => title === 'Mockup of the swimlanes')
      await page.waitForFunction(id => document.querySelector(`[data-session-id="${id}"] .st-title`)?.textContent === 'Mockup of the swimlanes', 'st-hp-mockup', { timeout: 10_000 })

      return { title: 'Mockup of the swimlanes' }
    })

    await check('Move to project from a swimlane block: the block changes lane (its new lane\'s band); the only state write is the existing forget', async () => {
      const from = Date.now()
      const target = (await headers(page)).find(lane => lane.label === 'hermes-plugins')!

      await openMenu(page, 'st-md-katex')
      await page.locator(ITEM('move')).hover()
      await page.locator('[data-testid="session-tree-menu-move"]').waitFor({ timeout: 5000 })
      await page.waitForTimeout(250)
      await page.locator(`[data-testid="session-tree-menu-move"] [data-project-id="${target.lane}"]`).click()
      await page.waitForFunction(([id, lane]) => document.querySelector(`[data-session-id="${id}"]`)?.getAttribute('data-project-id') === lane, ['st-md-katex', target.lane] as const, { timeout: 20_000 })
      await sleep(800)
      await fit(page)
      const lanes = await headers(page)
      const lane = lanes.find(each => each.label === 'hermes-plugins')!
      const blockBox = await box(page, BLOCK('st-md-katex'))
      const moveWrites = positionWrites(log, from)

      assert(blockBox.y >= lane.top - 0.5 && blockBox.y + blockBox.height <= lane.bottom + 0.5, `the block (${blockBox.y}) is not in the hermes-plugins lane (${lane.top}..${lane.bottom})`)
      assert(moveWrites.every(entry => entry.method === 'POST' && entry.path.startsWith('/state/forget')), `writes: ${JSON.stringify(moveWrites)}`)
      assert(lanes.find(each => each.label === 'hermes-plugins')!.sessions === target.sessions + 1, 'the lane count did not follow')

      return { lane: lane.label, writes: moveWrites.map(entry => `${entry.method} ${entry.path}`) }
    })

    await check('Archive from a swimlane block: it leaves the lane; Show archived brings it back greyed with Unarchive, which restores it', async () => {
      await openMenu(page, 'st-sys-reply')
      await page.locator(ITEM('archive')).click()
      await page.locator(BLOCK('st-sys-reply')).waitFor({ state: 'detached', timeout: 15_000 })
      await clickToolbar(page, 'session-tree-show-archived')
      await page.locator(BLOCK('st-sys-reply')).waitFor({ timeout: 15_000 })
      const look = await page.locator(BLOCK('st-sys-reply')).evaluate(el => ({ archived: el.getAttribute('data-archived'), opacity: Number(getComputedStyle(el).opacity) }))

      await openMenu(page, 'st-sys-reply')
      const label = (await page.locator(ITEM('archive')).innerText()).trim()

      await page.locator(ITEM('archive')).click()
      await waitFor('unarchived', async () => (await rowsOf(s)).some(row => row.id === 'st-sys-reply'), value => value)
      await clickToolbar(page, 'session-tree-show-archived')
      await page.locator(BLOCK('st-sys-reply')).waitFor({ timeout: 15_000 })
      assert(look.archived === 'true' && look.opacity < 1, `archived look ${JSON.stringify(look)}`)
      assert(label === 'Unarchive', `label ${label}`)

      return { look, label }
    })

    await check('light / dark: blocks paint from the theme variables; screenshots of all projects and one project', async () => {
      await fit(page)
      const light = await themeProbe(page)

      await page.screenshot({ path: join(shots, 'swim-all-light-final.png') })
      await page.emulateMedia({ colorScheme: 'dark' })
      await page.waitForTimeout(800)
      const dark = await themeProbe(page)

      await page.screenshot({ path: join(shots, 'swim-all-dark.png') })
      await setScope(page, 'mdesign')
      await page.screenshot({ path: join(shots, 'swim-scope-dark.png') })
      await setScope(page, 'All')
      await page.emulateMedia({ colorScheme: 'light' })
      await page.waitForTimeout(500)
      assert(light.actual === light.expected && dark.actual === dark.expected && dark.actual !== light.actual, `theme ${JSON.stringify({ light, dark })}`)

      return { light: light.actual, dark: dark.actual }
    })

    await check('500-session fixture (Show all): time to first render, and a scripted 2 s middle-drag pan at ≥ 45 fps', async () => {
      await clickToolbar(page, 'session-tree-show-all')
      const started = Date.now()

      await setProfile(page, 'scale')
      await page.waitForFunction(() => document.querySelector('[data-testid="session-tree-page"]')?.getAttribute('data-canvas-count') === '500', undefined, { timeout: 60_000 })
      await page.locator('[data-testid="session-tree-block"][data-session-id^="st-scale-"]').first().waitFor({ timeout: 60_000 })
      const firstRenderMs = Date.now() - started

      await page.screenshot({ path: join(shots, 'swim-scale.png') })
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
      let i = 0

      while (Date.now() - t0 < 2000) {
        i += 1
        await page.mouse.move(spot.x + Math.sin(i / 8) * 220, spot.y + Math.cos(i / 11) * 140)
      }

      const elapsed = Date.now() - t0

      await page.mouse.up({ button: 'middle' })
      const frames = await page.evaluate(() => {
        const w = window as unknown as { __stFrames: number; __stCounting: boolean }

        w.__stCounting = false

        return w.__stFrames
      })
      const after = await viewport(page)
      const fps = Math.round((frames / elapsed) * 1000 * 10) / 10
      const lanes = (await headers(page)).map(lane => `${lane.label}:${lane.sessions}`)

      assert(after.x !== before.x || after.y !== before.y, 'the pan did not move the view')
      assert(fps >= 45, `${fps} fps`)
      facts.scale = { firstRenderMs, fps, frames, panMs: elapsed, moves: i, lanes, renderedInDom: await page.locator('[data-testid="session-tree-block"]').count() }
      await setProfile(page, 'default')
      await clickToolbar(page, 'session-tree-show-all')

      return facts.scale
    })

    await check('B1: idle across a real minute tick on the 500-session fixture (Show all off, then on): no long task ≥ 200 ms, and the clock did tick (the now marker moved)', async () => {
      await setProfile(page, 'scale')
      await page.locator('[data-testid="session-tree-block"][data-session-id^="st-scale-"]').first().waitFor({ timeout: 60_000 })
      const runs: Record<string, Awaited<ReturnType<typeof idleLongTasks>>> = {}

      for (const showAll of [false, true]) {
        if (showAll) {
          await clickToolbar(page, 'session-tree-show-all')
          await page.waitForFunction(() => document.querySelector('[data-testid="session-tree-page"]')?.getAttribute('data-canvas-count') === '500', undefined, { timeout: 60_000 })
        }

        // Let the first render (and its routing) settle before watching.
        await sleep(3000)
        runs[showAll ? 'showAll' : 'default'] = await idleLongTasks(page, 66_000)
      }

      await setProfile(page, 'default')
      await clickToolbar(page, 'session-tree-show-all')
      facts.idle = runs

      for (const [name, run] of Object.entries(runs)) {
        assert(run.ticks >= 1, `${name}: no minute tick in ${run.windowMs} ms (now marker ${JSON.stringify(run.nowX)})`)
        assert(run.longTasks.every(task => task.duration < 200), `${name}: long tasks ${JSON.stringify(run.longTasks)}`)
      }

      return runs
    })

    await check('B1-r2: one chat turn in a scale session (a message pair through SessionDB.append_message) on the 500-session fixture, Show all off then on: the block\'s count updates after the refetch, and no long task ≥ 200 ms (no re-route)', async () => {
      await setProfile(page, 'scale')
      await page.locator('[data-testid="session-tree-block"][data-session-id^="st-scale-"]').first().waitFor({ timeout: 60_000 })
      const runs: Record<string, unknown> = {}

      for (const showAll of [false, true]) {
        if (showAll) {
          await clickToolbar(page, 'session-tree-show-all')
          await page.waitForFunction(() => document.querySelector('[data-testid="session-tree-page"]')?.getAttribute('data-canvas-count') === '500', undefined, { timeout: 60_000 })
        }

        // Let the first render (and its routing) settle before watching.
        await sleep(3000)
        const block = page.locator('[data-testid="session-tree-block"][data-session-id^="st-scale-"]').first()
        const id = (await block.getAttribute('data-session-id'))!
        const shownBefore = await page.locator(`${BLOCK(id)} [data-field="messages"]`).textContent()
        const before = Number(/^(\d+)/.exec(shownBefore ?? '')?.[1])

        assert(Number.isFinite(before), `no message count on ${id}: ${shownBefore}`)
        await page.evaluate(() => {
          const w = window as unknown as { __stTurn: { start: number; duration: number }[]; __stTurnObs: PerformanceObserver }

          w.__stTurn = []
          w.__stTurnObs = new PerformanceObserver(list => {
            for (const entry of list.getEntries()) {
              w.__stTurn.push({ start: Math.round(entry.startTime), duration: Math.round(entry.duration) })
            }
          })
          w.__stTurnObs.observe({ type: 'longtask' })
        })
        const t0 = Date.now()
        const appended = seedFixtures(t, ['--append', id, 'scale']) as { before?: number; after?: number }

        assert(appended.after === (appended.before ?? 0) + 2, `append: ${JSON.stringify(appended)}`)
        // The page refetches on sessions.changed (or the 10 s poll) and redraws that block.
        await page.waitForFunction(
          ([selector, want]) => document.querySelector(selector)?.textContent === want,
          [`${BLOCK(id)} [data-field="messages"]`, `${before + 2} msgs`] as const,
          { timeout: 25_000 }
        )
        const refetchMs = Date.now() - t0

        // Anything the refetch set off (layout, routes, React commit) has finished by now.
        await sleep(2000)
        const longTasks = await page.evaluate(() => {
          const w = window as unknown as { __stTurn: { start: number; duration: number }[]; __stTurnObs: PerformanceObserver }

          w.__stTurnObs.disconnect()

          return w.__stTurn
        })

        runs[showAll ? 'showAll' : 'default'] = { id, messages: [before, before + 2], refetchMs, longTasks, maxMs: Math.max(0, ...longTasks.map(task => task.duration)) }
      }

      await setProfile(page, 'default')
      await clickToolbar(page, 'session-tree-show-all')
      facts.dataChange = runs

      for (const [name, run] of Object.entries(runs) as [string, { longTasks: { duration: number }[] }][]) {
        assert(run.longTasks.every(task => task.duration < 200), `${name}: long tasks ${JSON.stringify(run.longTasks)}`)
      }

      return runs
    })

    await check('B1-r3: one chat turn in a branched child that is NOT the newest row (st-scale-0003, Show all off; st-scale-0007, Show all on) on the 500-session fixture: the backend moves its row to the front, the block\'s count updates, and no long task ≥ 200 ms (no re-route)', async () => {
      await setProfile(page, 'scale')
      await page.locator('[data-testid="session-tree-block"][data-session-id^="st-scale-"]').first().waitFor({ timeout: 60_000 })
      const runs: Record<string, unknown> = {}

      for (const [showAll, id] of [[false, 'st-scale-0003'], [true, 'st-scale-0007']] as const) {
        if (showAll) {
          await clickToolbar(page, 'session-tree-show-all')
          await page.waitForFunction(() => document.querySelector('[data-testid="session-tree-page"]')?.getAttribute('data-canvas-count') === '500', undefined, { timeout: 60_000 })
        }

        // Proof the case is the r3 repro: a branched child, and not the newest row of the
        // backend's answer (so the turn moves its row, and its edge, to the front).
        const backend = await rowsOf(s, false, 'scale')
        const index = backend.findIndex(row => row.id === id)
        const row = backend[index]

        assert(row && row._branched_from, `${id} is not a branched child: ${JSON.stringify(row && { id: row.id, _branched_from: row._branched_from })}`)
        assert(index > 0, `${id} is already the newest row (index ${index})`)

        // Let the first render (and its routing) settle before watching.
        await sleep(3000)
        const field = `${BLOCK(id)} [data-field="messages"]`

        assert((await page.locator(field).count()) === 1, `${id} is not drawn at the default view`)
        const shownBefore = await page.locator(field).textContent()
        const before = Number(/^(\d+)/.exec(shownBefore ?? '')?.[1])

        assert(Number.isFinite(before), `no message count on ${id}: ${shownBefore}`)
        await page.evaluate(() => {
          const w = window as unknown as { __stTurn: { start: number; duration: number }[]; __stTurnObs: PerformanceObserver }

          w.__stTurn = []
          w.__stTurnObs = new PerformanceObserver(list => {
            for (const entry of list.getEntries()) {
              w.__stTurn.push({ start: Math.round(entry.startTime), duration: Math.round(entry.duration) })
            }
          })
          w.__stTurnObs.observe({ type: 'longtask' })
        })
        const t0 = Date.now()
        const appended = seedFixtures(t, ['--append', id, 'scale']) as { before?: number; after?: number }

        assert(appended.after === (appended.before ?? 0) + 2, `append: ${JSON.stringify(appended)}`)
        await page.waitForFunction(([selector, want]) => document.querySelector(selector)?.textContent === want, [field, `${before + 2} msgs`] as const, { timeout: 25_000 })
        const refetchMs = Date.now() - t0

        // Anything the refetch set off (layout, routes, React commit) has finished by now.
        await sleep(2000)
        const longTasks = await page.evaluate(() => {
          const w = window as unknown as { __stTurn: { start: number; duration: number }[]; __stTurnObs: PerformanceObserver }

          w.__stTurnObs.disconnect()

          return w.__stTurn
        })
        const after = await rowsOf(s, false, 'scale')

        runs[showAll ? 'showAll' : 'default'] = { id, rowIndexBefore: index, rowIndexAfter: after.findIndex(each => each.id === id), messages: [before, before + 2], refetchMs, longTasks, maxMs: Math.max(0, ...longTasks.map(task => task.duration)) }
      }

      await setProfile(page, 'default')
      await clickToolbar(page, 'session-tree-show-all')
      facts.branchedTurn = runs

      for (const [name, run] of Object.entries(runs) as [string, { rowIndexAfter: number; longTasks: { duration: number }[] }][]) {
        assert(run.rowIndexAfter === 0, `${name}: the turn did not make the row the newest (index ${run.rowIndexAfter})`)
        assert(run.longTasks.every(task => task.duration < 200), `${name}: long tasks ${JSON.stringify(run.longTasks)}`)
      }

      return runs
    })

    await check('lane order (user ruling 2026-11-09): a chat turn in a project that is not first in projects.tree\'s recency order (500-session fixture) leaves the lane headers in the same, alphabetical order, and no long task ≥ 200 ms', async () => {
      await setProfile(page, 'scale')
      await page.locator('[data-testid="session-tree-block"][data-session-id^="st-scale-"]').first().waitFor({ timeout: 60_000 })
      await sleep(3000)
      const toolbarOrder = () =>
        page.$$eval('[data-testid="session-tree-scope"] button[data-scope]', buttons =>
          buttons.filter(button => button.getAttribute('data-scope') !== 'all').map(button => (button as HTMLElement).innerText.trim()).filter(label => label !== 'Home')
        )
      const laneOrder = async () => (await headers(page)).sort((a, b) => a.top - b.top).map(lane => lane.label)
      const treeBefore = await toolbarOrder()
      const lanesBefore = await laneOrder()

      assert(treeBefore.length >= 2, `only ${treeBefore.length} projects on the scale profile`)
      // A root session (no branch: the row reorder alone is B1-r3's case) of the project
      // projects.tree lists last, i.e. not first: its turn makes that project the most recent.
      const label = treeBefore.at(-1)!
      const backend = await rowsOf(s, false, 'scale')
      const row = backend.find(each => !each._branched_from && !each.parent_session_id && (each.git_repo_root ?? '').split('/').filter(Boolean).pop() === label)

      assert(row, `no root session in ${label}`)
      await page.evaluate(() => {
        const w = window as unknown as { __stTurn: { start: number; duration: number }[]; __stTurnObs: PerformanceObserver }

        w.__stTurn = []
        w.__stTurnObs = new PerformanceObserver(list => {
          for (const entry of list.getEntries()) {
            w.__stTurn.push({ start: Math.round(entry.startTime), duration: Math.round(entry.duration) })
          }
        })
        w.__stTurnObs.observe({ type: 'longtask' })
      })
      const t0 = Date.now()
      const appended = seedFixtures(t, ['--append', row.id, 'scale']) as { before?: number; after?: number }

      assert(appended.after === (appended.before ?? 0) + 2, `append: ${JSON.stringify(appended)}`)
      // The page refetches projects.tree too: the toolbar (still in its order) shows the project first.
      const treeAfter = await waitFor('projects.tree lists the turned project first', toolbarOrder, order => order[0] === label, 25_000)
      const refetchMs = Date.now() - t0

      await sleep(3000)
      const longTasks = await page.evaluate(() => {
        const w = window as unknown as { __stTurn: { start: number; duration: number }[]; __stTurnObs: PerformanceObserver }

        w.__stTurnObs.disconnect()

        return w.__stTurn
      })
      const lanesAfter = await laneOrder()
      const projectLanes = lanesBefore.filter(each => each !== 'Home')

      await setProfile(page, 'default')
      facts.laneOrderTurn = { session: row.id, project: label, treeBefore, treeAfter, lanesBefore, lanesAfter, refetchMs, longTasks }

      assert(JSON.stringify(lanesAfter) === JSON.stringify(lanesBefore), `the lanes moved: ${JSON.stringify(lanesBefore)} → ${JSON.stringify(lanesAfter)}`)
      assert(JSON.stringify(projectLanes) === JSON.stringify(alphabetical(treeBefore)), `lanes ${JSON.stringify(lanesBefore)} are not alphabetical`)
      assert(longTasks.every(task => task.duration < 200), `long tasks ${JSON.stringify(longTasks)}`)

      return facts.laneOrderTurn
    })

    await check('no page errors from the plugin; no position write from Swimlanes over the whole run except the Move\'s forget', () => {
      const fromPlugin = stacks.filter(stack => /blob:|session-tree|desktop-plugins/.test(stack))
      const swimWrites = positionWrites(log, swimFrom).filter(entry => !entry.path.startsWith('/state/forget'))

      assert(fromPlugin.length === 0, fromPlugin.join('\n'))
      assert(s.errors.length === 0, s.errors.join('\n'))
      assert(swimWrites.length === 0, `writes: ${JSON.stringify(swimWrites)}`)
      facts.writes = writes(log).map(entry => `${entry.method} ${entry.path}`)

      return { requests: log.length, writes: facts.writes }
    })

    // Last: Dense saves its auto-layout for the scale profile, which the no-write check above
    // must not see.
    await check('500-session fixture in Dense (re-measured, Show all): time to first render, and a scripted 2 s middle-drag pan at ≥ 45 fps', async () => {
      await switchStyle(page, 'dense')
      await page.waitForFunction(() => document.querySelector('[data-testid="session-tree-page"]')?.getAttribute('data-style') === 'dense', undefined, { timeout: 20_000 })
      await settled(page)
      await clickToolbar(page, 'session-tree-show-all')
      const started = Date.now()

      await setProfile(page, 'scale')
      await page.waitForFunction(() => document.querySelector('[data-testid="session-tree-page"]')?.getAttribute('data-canvas-count') === '500', undefined, { timeout: 60_000 })
      await page.locator('[data-testid="session-tree-block"][data-session-id^="st-scale-"]').first().waitFor({ timeout: 60_000 })
      const firstRenderMs = Date.now() - started
      const pan = await panFps(page)

      await setProfile(page, 'default')
      await clickToolbar(page, 'session-tree-show-all')
      assert(pan.moved, 'the pan did not move the view')
      assert(pan.fps >= 45, `${pan.fps} fps`)
      facts.denseScale = { firstRenderMs, ...pan }

      return facts.denseScale
    })
  } finally {
    await close(s)
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

  writeFileSync(join(t.root, 'e2e-swimlanes-facts.json'), `${JSON.stringify({ results, facts, base: webappBase(t) }, null, 2)}\n`)
  const failed = results.filter(r => !r.ok)

  console.log(`\ne2e-swimlanes: ${results.length - failed.length} passed, ${failed.length} failed (screenshots: ${shots})`)
  process.exitCode = failed.length === 0 ? 0 : 1
}

await main()
