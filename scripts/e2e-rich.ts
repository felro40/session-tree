/**
 * e2e — Session Tree 6/7: the Rich cards style, against the isolated test Hermes. It mutates its
 * fixtures (activate, mark unread, append a turn), so it runs in its own fresh test home of the
 * role (`c<card>-<role>-rich`, the role's port block), the older one moved to the e2e trash.
 *
 *   node scripts/e2e-rich.ts      (part of `npm run test:e2e`)
 *   KEEP_RUNNING=1 …              leaves the test gateway up afterwards
 *
 * It installs the e2e's own build (`scripts/build.mjs --test-styles`): the only way to show
 * "needs input" is its test-only hook (the SDK has no such source, card 1 pre-check 10).
 * Everything is read back: the backend's own `/sessions`, `/sessions/details` and `/state`, the
 * DOM geometry of cards, bars, ghosts, banners, links and the drawer, the network log of every
 * details and layout-store request, device storage after a reload. Input is real (page.mouse /
 * page.keyboard → CDP Input.*), the middle button and the wheel included. Screenshots go to
 * <test root>/shots/.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Page, Request } from 'playwright-core'

import type { StateSnapshot } from '../src/model/layout-sync.ts'
import type { SessionRow, SessionsResponse } from '../src/model/sessions.ts'
import { addContext, close, enableDesktopHalf, goto, launch, signIn } from './e2e/browser.ts'
import type { Session } from './e2e/browser.ts'
import { buildTestPackage, seedFixtures, setup, signInLink, stopGateway, stopRoleHomes, testHermes, testHermesPids, webappBase } from './e2e/harness.ts'
import { diffSnapshots, snapshotRealHermes } from './e2e/real-hermes-guard.ts'
import { moveAside } from './e2e/trash.ts'
import { compositedContrast, parseColor, rgbText } from './e2e/contrast.ts'
import type { Kind, Layer } from './e2e/contrast.ts'

const t = testHermes(undefined, { variant: 'rich' })
const shots = join(t.root, 'shots')
const results: { name: string; ok: boolean; detail?: string }[] = []
const facts: Record<string, unknown> = {}

const HIDDEN_SOURCES = new Set(['acp', 'cron', 'kanban', 'oneshot', 'subagent', 'tool'])
const CARD_W = 280
const CARD_H = 164
const TOKEN_BAR = 54
/** The page asks for the cards within half a viewport of the view (layer.tsx / details.ts). */
const NEAR_MARGIN = 0.5

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

const CARD = (id: string) => `[data-testid="session-tree-block"][data-session-id="${id}"]`
const MENU = '[data-testid="session-tree-menu"]'
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

async function rowsOf(s: Session, profile = 'default'): Promise<SessionRow[]> {
  return (await api<SessionsResponse>(s, `/api/plugins/session-tree/sessions?session_profile=${profile}&include_archived=false&limit=2000`)).sessions
}

interface Details {
  days: string[]
  details: Record<string, { excerpt: null | string; excerpt_role: null | string; activity: number[] }>
}

async function backendDetails(s: Session, ids: string[], profile = 'default'): Promise<Details> {
  const tz = await s.page.evaluate(() => -new Date().getTimezoneOffset())
  const out: Details = { days: [], details: {} }

  for (let i = 0; i < ids.length; i += 100) {
    const part = await api<Details>(s, '/api/plugins/session-tree/sessions/details', {
      method: 'POST',
      body: { profile, ids: ids.slice(i, i + 100), tz_offset_minutes: tz }
    })

    out.days = part.days
    Object.assign(out.details, part.details)
  }

  return out
}

async function stored(s: Session): Promise<StateSnapshot> {
  return api<StateSnapshot>(s, '/api/plugins/session-tree/state?session_profile=default')
}

/** A style's stored layout: one per style, under scope `all`, whatever the page's scope (card 10). */
const layoutOf = (state: StateSnapshot, style: string) =>
  Object.fromEntries(Object.entries(state.layouts[style]?.all ?? {}).map(([id, entry]) => [id, { x: entry.x, y: entry.y }]))

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

  if (!(await s.page.locator('[data-testid="session-tree-canvas"]').waitFor({ timeout: 6000 }).then(() => true, () => false))) {
    await s.page.getByText('Session Tree', { exact: true }).first().click()
  }

  await settled(s.page)
}

async function backToTree(page: Page): Promise<void> {
  await page.getByText('Session Tree', { exact: true }).first().click()
  await settled(page)
}

async function reloadTree(s: Session): Promise<void> {
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
async function switchStyle(page: Page, to: string): Promise<void> {
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

  await page.waitForFunction(id => document.querySelector('[data-testid="session-tree-page"]')?.getAttribute('data-style') === id, to, { timeout: 20_000 })
  await page.waitForTimeout(500)
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

/** An empty spot of the flow pane. */
async function emptySpot(page: Page): Promise<{ x: number; y: number }> {
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

async function drag(page: Page, from: { x: number; y: number }, by: { x: number; y: number }, button: 'left' | 'middle' = 'left') {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down({ button })
  await page.mouse.move(from.x + by.x / 2, from.y + by.y / 2, { steps: 10 })
  await page.mouse.move(from.x + by.x, from.y + by.y, { steps: 10 })
  await page.mouse.up({ button })
  await page.waitForTimeout(300)
}

/** Drags a card by its title so that its top-left lands on `to` (flow coordinates). */
async function dragCardTo(page: Page, id: string, to: { x: number; y: number }): Promise<void> {
  const from = (await flowPos(page, id))!
  const v = await viewport(page)
  const title = await box(page, `${CARD(id)} [data-field="title"]`)
  const grab = { x: title.x + 30, y: title.y + title.height / 2 }

  await drag(page, grab, { x: (to.x - from.x) * v.zoom, y: (to.y - from.y) * v.zoom })
}

interface Logged {
  at: number
  method: string
  path: string
  body?: string
}

/** Every request a page makes to the plugin backend (details, layout store, settings). */
function backendLog(page: Page): Logged[] {
  const log: Logged[] = []

  page.on('request', (request: Request) => {
    const url = new URL(request.url())

    if (url.pathname.startsWith('/api/plugins/session-tree/')) {
      log.push({ at: Date.now(), method: request.method(), path: `${url.pathname.replace('/api/plugins/session-tree', '')}${url.search}`, body: request.postData() ?? undefined })
    }
  })

  return log
}

const detailsRequests = (log: Logged[], from = 0) =>
  log
    .filter(entry => entry.method === 'POST' && entry.path.startsWith('/sessions/details') && entry.at >= from)
    .map(entry => JSON.parse(entry.body ?? '{}') as { profile: string; ids: string[]; tz_offset_minutes: number })

const positionWrites = (log: Logged[], from = 0) => log.filter(entry => entry.at >= from && entry.method !== 'GET' && entry.path.startsWith('/state'))

/** The rows that become blocks (the same filters as the page), one per compression lineage. */
function visibleRows(rows: readonly SessionRow[]): SessionRow[] {
  const seen = new Set<string>()

  return rows.filter(row => {
    if (row.is_internal_child || row.message_count === 0 || HIDDEN_SOURCES.has((row.source ?? '').trim().toLowerCase()) || row.archived) {
      return false
    }

    const lineage = `${row.profile ?? 'default'}::${row._lineage_root_id || row.id}`

    if (seen.has(lineage)) {
      return false
    }

    seen.add(lineage)

    return true
  })
}

const tokensOf = (row: SessionRow) => Math.max(0, row.input_tokens ?? 0) + Math.max(0, row.output_tokens ?? 0)

/** Every card on the canvas: id, flow rect, details state. */
async function cards(page: Page) {
  return page.$$eval('[data-testid="session-tree-block"]', elements =>
    elements.map(element => {
      const node = element.closest('.react-flow__node') as HTMLElement | null
      const m = node ? /translate\(\s*([-\d.e]+)px,\s*([-\d.e]+)px\)/.exec(node.style.transform) : null

      return {
        id: element.getAttribute('data-session-id')!,
        node: element.getAttribute('data-node-id')!,
        x: m ? Number(m[1]) : NaN,
        y: m ? Number(m[2]) : NaN,
        details: element.getAttribute('data-details'),
        tokens: Number(element.getAttribute('data-tokens')),
        max: Number(element.getAttribute('data-token-max'))
      }
    })
  )
}

/** Screen boxes of every card (the "no layout jump" check). */
async function cardBoxes(page: Page): Promise<Record<string, { x: number; y: number; width: number; height: number }>> {
  return page.$$eval('[data-testid="session-tree-block"]', elements =>
    Object.fromEntries(
      elements.map(element => {
        const r = element.getBoundingClientRect()

        return [element.getAttribute('data-session-id')!, { x: r.x, y: r.y, width: r.width, height: r.height }]
      })
    )
  )
}

async function allLoaded(page: Page, timeout = 20_000): Promise<void> {
  await page.waitForFunction(
    () => [...document.querySelectorAll('[data-testid="session-tree-block"]')].every(el => el.getAttribute('data-details') !== 'loading'),
    undefined,
    { timeout }
  )
}

/** The ids whose flow rect meets the view grown by NEAR_MARGIN (independent of the page's code). */
async function nearByGeometry(page: Page): Promise<{ near: string[]; far: string[]; region: { left: number; top: number; right: number; bottom: number } }> {
  const v = await viewport(page)
  const pane = await box(page, '.react-flow__pane')
  const w = pane.width / v.zoom
  const h = pane.height / v.zoom
  const left = -v.x / v.zoom - w * NEAR_MARGIN
  const top = -v.y / v.zoom - h * NEAR_MARGIN
  const right = left + w * (1 + 2 * NEAR_MARGIN)
  const bottom = top + h * (1 + 2 * NEAR_MARGIN)
  const all = await cards(page)
  const near = all.filter(card => card.x < right && card.x + CARD_W > left && card.y < bottom && card.y + CARD_H > top).map(card => card.id)

  return { near, far: all.map(card => card.id).filter(id => !near.includes(id)), region: { left, top, right, bottom } }
}

async function focusedStored(page: Page): Promise<unknown> {
  return page.evaluate(() => (globalThis as unknown as { __HERMES_PLUGIN_SDK__: { host: { state: { focusedStoredSessionId: { get(): unknown } } } } }).__HERMES_PLUGIN_SDK__.host.state.focusedStoredSessionId.get())
}

/** A scripted 2 s middle-drag pan, counting animation frames. */
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

/** Card background vs the theme variable it must come from, resolved in place. */
async function themeProbe(page: Page) {
  return page.evaluate(() => {
    const card = document.querySelector('[data-testid="session-tree-block"]') as HTMLElement
    const probe = document.createElement('div')

    probe.style.background = 'var(--ui-bg-elevated)'
    card.parentElement!.appendChild(probe)
    const expected = getComputedStyle(probe).backgroundColor

    probe.remove()

    return { actual: getComputedStyle(card).backgroundColor, expected }
  })
}

interface ContrastTarget {
  name: string
  selector: string
  /** Which match (a card has 1–2 ghosts). */
  index?: number
  kind: Kind
}

/** Review r1 B2 (and N3): the elements whose composited contrast must be ≥ 3:1, light and dark. */
const CONTRAST_TARGETS: ContrastTarget[] = [
  { name: 'ghost border (1st)', selector: `${CARD('st-sys-tip')} [data-testid="session-tree-ghost"]`, index: 0, kind: 'border' },
  { name: 'ghost border (2nd)', selector: `${CARD('st-sys-tip')} [data-testid="session-tree-ghost"]`, index: 1, kind: 'border' },
  { name: 'stand-in title', selector: '[data-testid="session-tree-standin"] .st-rc-ttl', kind: 'text' },
  { name: 'stand-in border', selector: '[data-testid="session-tree-standin"]', kind: 'border' },
  { name: 'link stroke', selector: '[data-testid="session-tree-link"][data-source="st-hp-root"][data-target="st-hp-routing"] path.react-flow__edge-path', kind: 'stroke' }
]

/**
 * The composited contrast of one element where it is drawn: the colour (text colour, bottom
 * border colour or SVG stroke × stroke-opacity) at its alpha, inside every ancestor's opacity, over
 * the backgrounds of the ancestors whose box covers the probed point (scripts/e2e/contrast.ts).
 * Probe point: the bottom border's middle (border), the box centre (text), the path's midpoint.
 */
async function contrastOf(page: Page, target: ContrastTarget) {
  const raw = await page.evaluate(({ selector, index, kind }) => {
    const el = document.querySelectorAll(selector)[index ?? 0] as HTMLElement | SVGGraphicsElement | undefined

    if (!el) {
      return null
    }

    const rect = el.getBoundingClientRect()
    let point = { x: rect.left + rect.width / 2, y: kind === 'border' ? rect.bottom - 0.5 : rect.top + rect.height / 2 }

    if (kind === 'stroke') {
      const path = el as SVGPathElement
      const mid = path.getPointAtLength(path.getTotalLength() / 2)
      const m = path.getScreenCTM()!

      point = { x: m.a * mid.x + m.c * mid.y + m.e, y: m.b * mid.x + m.d * mid.y + m.f }
    }

    const chain: Element[] = []

    for (let node: Element | null = el; node; node = node.parentElement) {
      chain.unshift(node)
    }

    const cs = getComputedStyle(el)

    return {
      point,
      fg: kind === 'text' ? cs.color : kind === 'border' ? cs.borderBottomColor : cs.stroke,
      fgOpacity: kind === 'stroke' ? Number(cs.strokeOpacity) : 1,
      borderStyle: cs.borderBottomStyle,
      layers: chain.map(node => {
        const r = node.getBoundingClientRect()
        const style = getComputedStyle(node)
        const whole = node === document.documentElement || node === document.body

        return {
          tag: `${node.tagName.toLowerCase()}${node.classList.length ? `.${[...node.classList].slice(0, 2).join('.')}` : ''}`,
          background: style.backgroundColor,
          opacity: Number(style.opacity),
          covers: whole || (point.x >= r.left && point.x <= r.right && point.y >= r.top && point.y <= r.bottom)
        }
      })
    }
  }, target)

  assert(raw, `no element for ${target.name} (${target.selector})`)
  const layers: Layer[] = raw.layers.map(l => ({ background: parseColor(l.background), opacity: l.opacity, covers: l.covers }))
  const fg = parseColor(raw.fg)
  const result = compositedContrast(layers, { ...fg, a: fg.a * raw.fgOpacity }, target.kind)
  const alpha = fg.a * raw.fgOpacity * raw.layers.reduce((product, l) => product * l.opacity, 1)

  return {
    ratio: Math.round(result.ratio * 100) / 100,
    shown: rgbText(result.fg),
    against: result.against.map(rgbText),
    colour: raw.fg,
    alpha: Math.round(alpha * 1000) / 1000,
    behind: raw.layers.filter(l => l.covers && parseColor(l.background).a > 0).map(l => `${l.tag} ${l.background}`).slice(-2)
  }
}

interface Box {
  x: number
  y: number
  w: number
  h: number
}

const PAGE_SELECTOR = '[data-testid="session-tree-page"]'
const NOTE = '[data-testid="session-tree-refresh-failed"]'
const intersects = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
const within = (a: Box, b: Box) => a.x >= b.x - 0.5 && a.y >= b.y - 0.5 && a.x + a.w <= b.x + b.w + 0.5 && a.y + a.h <= b.y + b.h + 0.5

/** Card 8 (F1): the refresh-failed note, the Rich drawer (when on the page), the canvas and the stage, on screen. */
async function noteGeometry(page: Page) {
  return page.evaluate(([note, pageSelector]) => {
    const rect = (el: Element | null): Box => {
      const r = el ? el.getBoundingClientRect() : { x: NaN, y: NaN, width: NaN, height: NaN }

      return { x: r.x, y: r.y, w: r.width, h: r.height }
    }
    const drawer = document.querySelector('[data-testid="session-tree-drawer"]')
    const el = document.querySelector(note)

    return {
      note: rect(el),
      noteText: el?.textContent?.trim() ?? '',
      drawer: rect(drawer),
      drawerOpen: drawer?.getAttribute('data-open') === 'true',
      canvas: rect(document.querySelector(`${pageSelector} [data-testid="session-tree-canvas"]`)),
      stage: rect(el?.parentElement ?? null)
    }
  }, [NOTE, PAGE_SELECTOR] as const)
}

/** Where the note sits with no drawer open (src/styles.css, unchanged since 033096c): 8 px from the stage's top, 10 px from its right. */
const atCorner = (g: Awaited<ReturnType<typeof noteGeometry>>) => Math.abs(g.note.y - (g.stage.y + 8)) <= 1 && Math.abs(g.note.x + g.note.w - (g.stage.x + g.stage.w - 10)) <= 1

/** Opens or closes the Rich drawer with its grip (real click) and waits out its slide. */
async function setDrawer(page: Page, open: boolean): Promise<void> {
  if ((await page.getAttribute('[data-testid="session-tree-drawer"]', 'data-open')) !== String(open)) {
    await page.locator('[data-testid="session-tree-drawer-grip"]').click()
  }

  await page.waitForFunction(want => document.querySelector('[data-testid="session-tree-drawer"]')?.getAttribute('data-open') === want, String(open), { timeout: 5000 })
  await page.waitForTimeout(700)
}

/**
 * Card 8 (F4): the token bar's composited contrast (scripts/e2e/contrast.ts), measured where it is
 * drawn: the track's empty part (on the card with the smallest filled share) — its own fill and
 * its outline, each against the card behind the bar — and the filled part (on the card with the
 * largest share) against the track behind it.
 */
async function tokenBarContrast(page: Page) {
  const raw = await page.evaluate(() => {
    const bars = [...document.querySelectorAll('[data-testid="session-tree-block"]')]
      .filter(card => card.getAttribute('data-out-of-scope') !== 'true' && Number(card.getAttribute('data-tokens')) > 0)
      .map(card => {
        const fill = card.querySelector('[data-testid="session-tree-token-bar"]') as HTMLElement
        const track = fill.parentElement as HTMLElement

        return { card, fill, track, share: fill.getBoundingClientRect().width / track.getBoundingClientRect().width }
      })
      .sort((a, b) => a.share - b.share)
    const layersAt = (el: Element, point: { x: number; y: number }) => {
      const chain: Element[] = []

      for (let node: Element | null = el; node; node = node.parentElement) {
        chain.unshift(node)
      }

      return chain.map(node => {
        const r = node.getBoundingClientRect()
        const style = getComputedStyle(node)
        const whole = node === document.documentElement || node === document.body

        return { background: style.backgroundColor, opacity: Number(style.opacity), covers: whole || (point.x >= r.left && point.x <= r.right && point.y >= r.top && point.y <= r.bottom) }
      })
    }
    const empty = bars[0]
    const full = bars[bars.length - 1]
    const er = empty.track.getBoundingClientRect()
    const emptyPoint = { x: er.right - 1.5, y: er.top + er.height / 2 }
    const fr = full.fill.getBoundingClientRect()
    const fillPoint = { x: fr.left + fr.width / 2, y: fr.top + fr.height / 2 }
    const ts = getComputedStyle(empty.track)

    return {
      emptyCard: empty.card.getAttribute('data-session-id')!,
      emptyShare: Math.round(empty.share * 1000) / 1000,
      fullCard: full.card.getAttribute('data-session-id')!,
      fullShare: Math.round(full.share * 1000) / 1000,
      // The track's empty part: the bar itself and what is behind it.
      trackLayers: layersAt(empty.track, emptyPoint),
      outline: { color: ts.outlineColor, style: ts.outlineStyle, width: Number.parseFloat(ts.outlineWidth) },
      border: { color: ts.borderTopColor, style: ts.borderTopStyle, width: Number.parseFloat(ts.borderTopWidth) },
      cardBackground: getComputedStyle(empty.card).backgroundColor,
      // The filled part: the fill over its track.
      fillLayers: layersAt(full.fill, fillPoint),
      fill: getComputedStyle(full.fill).backgroundColor
    }
  })
  const toLayers = (list: typeof raw.trackLayers): Layer[] => list.map(l => ({ background: parseColor(l.background), opacity: l.opacity, covers: l.covers }))
  const track = toLayers(raw.trackLayers)
  const behindBar = track.slice(0, -1)
  const own = track[track.length - 1]
  const round = (value: number) => Math.round(value * 100) / 100
  // The track's own fill against the card behind it (alpha × the bar's opacity, over that backdrop).
  const trackFillVsCard = round(compositedContrast(behindBar, { ...own.background, a: own.background.a * own.opacity }, 'text').ratio)
  // The outline (or a border) is drawn around the bar, over the card.
  const line = raw.outline.style !== 'none' && raw.outline.width > 0 ? raw.outline : raw.border.style !== 'none' && raw.border.width > 0 ? raw.border : null
  const outlineVsCard = line ? round(compositedContrast(behindBar, parseColor(line.color), 'text').ratio) : 0
  const fillLayers = toLayers(raw.fillLayers)
  const fillVsTrack = round(compositedContrast(fillLayers.slice(0, -1), parseColor(raw.fill), 'text').ratio)

  return {
    emptyCard: raw.emptyCard,
    emptyShare: raw.emptyShare,
    fullCard: raw.fullCard,
    fullShare: raw.fullShare,
    card: raw.cardBackground,
    outline: line ? `${line.style} ${line.width}px ${line.color}` : 'none',
    track: raw.trackLayers[raw.trackLayers.length - 1].background,
    fill: raw.fill,
    trackFillVsCard,
    outlineVsCard,
    extent: Math.max(trackFillVsCard, outlineVsCard),
    fillVsTrack
  }
}

/** Bring an element to the canvas centre (a real middle-drag pan, R3), zoom in on it with the
 * real wheel (toward the cursor), clip a screenshot around it, then Fit again. */
async function zoomShot(page: Page, selector: string, file: string): Promise<void> {
  const target = page.locator(selector).first()
  const at = await target.boundingBox()
  const pane = await box(page, '.react-flow__pane')

  assert(at, `no box for ${selector}`)
  const centre = { x: pane.x + pane.width / 2, y: pane.y + pane.height / 2 }

  await drag(page, await emptySpot(page), { x: centre.x - (at.x + at.width / 2), y: centre.y - (at.y + at.height / 2) }, 'middle')
  await page.mouse.move(centre.x, centre.y)

  for (let i = 0; i < 4; i += 1) {
    await page.mouse.wheel(0, -240)
    await page.waitForTimeout(120)
  }

  await page.waitForTimeout(400)
  const zoomed = (await target.boundingBox())!
  const x = Math.max(pane.x, zoomed.x - 40)
  const y = Math.max(pane.y, zoomed.y - 40)

  await page.screenshot({ path: join(shots, file), clip: { x, y, width: Math.min(pane.x + pane.width - x, zoomed.width + 80), height: Math.min(pane.y + pane.height - y, zoomed.height + 90) } })
  await fit(page)
}

function freshHome(): void {
  stopGateway(t)
  // Card 8 (F5): into the trash, then the trash pruned to the newest copy of each home.
  moveAside(t.root, { log: line => console.log(`  trash: ${line}`) })
}

// --- the suite ---------------------------------------------------------------------------------

async function main(): Promise<void> {
  const realBefore = snapshotRealHermes()

  // The role's other homes use the same ports: make sure they are not running.
  stopRoleHomes(t)

  freshHome()
  mkdirSync(shots, { recursive: true })
  console.log(`e2e rich — role ${t.role}, home ${t.home}`)
  const packageDir = buildTestPackage(t)
  const manifest = setup(t, { packageDir }) as { seeded?: boolean }

  assert(manifest.seeded === true, 'the rich home was not freshly seeded')
  const rich = seedFixtures(t, ['--rich']) as { created?: boolean; tool_prompt?: string }

  assert(rich.created === true, `the Rich fixtures were not created: ${JSON.stringify(rich)}`)
  const s = await launch({ colorScheme: 'light' })
  const { page } = s
  const log = backendLog(page)
  const stacks: string[] = []
  let failures = 0

  page.on('pageerror', error => stacks.push(`${error.message}\n${error.stack ?? ''}`))
  diagnose = async () => {
    failures += 1
    await page.screenshot({ path: join(shots, `failure-${failures}.png`) }).catch(() => undefined)

    return `${await page.evaluate(() => JSON.stringify({ hash: location.hash, style: document.querySelector('[data-testid="session-tree-page"]')?.getAttribute('data-style') }))} (failure-${failures}.png)`
  }
  afterFailure = async () => {
    await page.unroute('**/api/plugins/session-tree/sessions/details**').catch(() => undefined)
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)

    if (!(await page.locator('[data-testid="session-tree-canvas"]').count())) {
      await backToTree(page).catch(() => undefined)
    }
  }

  let rows: SessionRow[] = []
  let denseBefore: Record<string, { x: number; y: number }> = {}
  let richFrom = 0

  try {
    await check('sign in, enable the desktop half, open the page (Dense, the default); Dense saves its auto-layout', async () => {
      await signIn(t, page)
      await enableDesktopHalf(t, page)
      await openTree(s)
      rows = await rowsOf(s)
      await waitFor('the Dense auto-layout stored', () => stored(s), value => Object.keys(layoutOf(value, 'dense')).length > 10)
      await sleep(1500)
      denseBefore = layoutOf(await stored(s), 'dense')

      return { rows: rows.length, denseStored: Object.keys(denseBefore).length }
    })

    await check('select Rich cards (toolbar switcher, synced style stored); the view opens at Fit: every card inside the canvas; cards are 280 × 164', async () => {
      richFrom = Date.now()
      await switchStyle(page, 'rich')
      await waitFor('the synced style stored', () => stored(s), value => value.settings.style === 'rich')
      // The auto-layout is stored (every card placed) before the reload: a fresh view of a style
      // is framed (no remembered zoom + pan yet), so the reload shows it open at Fit.
      const onCanvas = Number(await page.getAttribute('[data-testid="session-tree-page"]', 'data-canvas-count'))

      await waitFor('the Rich auto-layout stored', () => stored(s), value => Object.keys(layoutOf(value, 'rich')).filter(id => !id.startsWith('group:')).length >= onCanvas)
      await sleep(800)
      await page.evaluate(() => {
        for (const key of Object.keys(localStorage)) {
          if (key.includes('viewport.v2') && key.includes('rich|')) {
            localStorage.removeItem(key)
          }
        }
      })
      await reloadTree(s)
      await allLoaded(page)
      const pane = await box(page, '.react-flow__pane')
      const v = await viewport(page)
      const boxes = await cardBoxes(page)
      const outside = Object.entries(boxes).filter(([, r]) => r.x < pane.x - 1 || r.y < pane.y - 1 || r.x + r.width > pane.x + pane.width + 1 || r.y + r.height > pane.y + pane.height + 1)
      const sizes = Object.values(boxes).map(r => [Math.round(r.width / v.zoom), Math.round(r.height / v.zoom)])

      assert((await page.getAttribute('[data-testid="session-tree-canvas"]', 'data-style')) === 'rich', 'the canvas is not Rich cards')
      assert(outside.length === 0, `cards outside the canvas at open: ${outside.map(([id]) => id).join(', ')}`)
      assert(sizes.every(([w, h]) => w === CARD_W && h === CARD_H), `card sizes ${JSON.stringify(sizes.slice(0, 5))}`)
      await page.screenshot({ path: join(shots, 'rich-all-light.png') })
      facts.open = { zoom: v.zoom, cards: Object.keys(boxes).length }

      return facts.open
    })

    await check('top-down trees: a parent above its children (links from bottom centre to top centre); "continued as" a dashed curve with its pill; the stand-in a dashed skeleton card', async () => {
      const parent = (await flowPos(page, 'st-hp-root'))!
      const child = (await flowPos(page, 'st-hp-routing'))!
      const link = page.locator('[data-testid="session-tree-link"][data-source="st-hp-root"][data-target="st-hp-routing"]')
      const d = await link.locator('path.react-flow__edge-path').getAttribute('d')
      const start = /^M([-\d.]+) ([-\d.]+)/.exec(d ?? '')!
      const reset = page.locator('[data-testid="session-tree-link"][data-kind="reset"]').first()
      const resetDash = await reset.locator('path.react-flow__edge-path').evaluate(el => getComputedStyle(el).strokeDasharray)
      const pill = await page.locator('[data-testid="session-tree-link-label"]').first().innerText()
      const standin = page.locator('[data-testid="session-tree-standin"]').first()
      const standinStyle = await standin.evaluate(el => ({ border: getComputedStyle(el).borderTopStyle, title: el.textContent }))

      assert(child.y > parent.y + CARD_H, `child ${JSON.stringify(child)} not below parent ${JSON.stringify(parent)}`)
      assert(Math.abs(Number(start[1]) - (parent.x + CARD_W / 2)) < 1 && Math.abs(Number(start[2]) - (parent.y + CARD_H)) < 1, `link starts at ${start[0]}`)
      assert(resetDash !== 'none' && pill.trim() === 'continued as', `reset dash ${resetDash}, pill ${pill}`)
      assert(standinStyle.border === 'dashed' && /Parent not loaded/.test(standinStyle.title ?? ''), `stand-in ${JSON.stringify(standinStyle)}`)

      return { parent, child, resetDash, standin: standinStyle.border }
    })

    await check('the excerpt equals the backend\'s value (plain text, never markup); the "First prompt" fallback where there is no last message', async () => {
      const shown = await cards(page)
      const answer = await backendDetails(s, shown.map(card => card.id))
      const texts = await page.$$eval('[data-testid="session-tree-block"]', elements =>
        Object.fromEntries(
          elements.map(element => {
            const excerpt = element.querySelector('[data-testid="session-tree-excerpt"]')

            return [
              element.getAttribute('data-session-id')!,
              { kind: excerpt?.getAttribute('data-kind'), text: excerpt?.querySelector('[data-field="excerpt"]')?.textContent ?? null, label: excerpt?.querySelector('[data-field="excerpt-label"]')?.textContent ?? null, html: excerpt?.innerHTML ?? '' }
            ]
          })
        )
      )
      const mismatched = shown.filter(card => {
        const expected = answer.details[card.id]?.excerpt

        return expected ? texts[card.id].kind !== 'last' || texts[card.id].text !== expected : texts[card.id].kind === 'last'
      })
      const toolrun = texts['st-rich-toolrun']
      const preview = rows.find(row => row.id === 'st-rich-toolrun')?.preview

      assert(mismatched.length === 0, `excerpts differ from the backend for ${mismatched.map(card => card.id).join(', ')}`)
      assert(answer.details['st-rich-toolrun']?.excerpt === null, 'the tool run has a backend excerpt')
      assert(toolrun.kind === 'first-prompt' && toolrun.label === 'First prompt:' && toolrun.text === preview && preview === rich.tool_prompt, `fallback ${JSON.stringify(toolrun)} / ${preview}`)
      // Rendered as text: the HTML-looking fixture yields no element inside the excerpt.
      assert(!/<(?!\/?span|\/?b\b)/.test(texts['st-rich-html'].html), `markup in the excerpt: ${texts['st-rich-html'].html}`)
      facts.excerpts = { cards: shown.length, html: texts['st-rich-html'].text, markdown: texts['st-rich-markdown'].text, long: texts['st-rich-long'].text?.length }

      return facts.excerpts
    })

    await check('no layout jump when the details arrive: card rectangles before (skeletons) and after are identical (answers delayed 1.5 s)', async () => {
      await page.route('**/api/plugins/session-tree/sessions/details**', async route => {
        await sleep(1500)
        await route.continue()
      })
      await reloadTree(s)
      const loading = await page.$$eval('[data-testid="session-tree-block"][data-details="loading"]', els => els.length)
      const skeletons = await page.$$eval('[data-testid="session-tree-block"] .st-rc-pv.is-loading .st-rc-sk', els => els.length)
      const before = await cardBoxes(page)

      await allLoaded(page)
      await page.unroute('**/api/plugins/session-tree/sessions/details**')
      const after = await cardBoxes(page)
      const moved = Object.keys(before).filter(id => !after[id] || ['x', 'y', 'width', 'height'].some(key => Math.abs(before[id][key as 'x'] - after[id][key as 'x']) > 0.5))

      assert(loading >= 10 && skeletons >= 2 * loading, `only ${loading} cards were loading (${skeletons} skeleton lines)`)
      assert(moved.length === 0, `cards moved or resized when the details arrived: ${moved.join(', ')}`)
      facts.noJump = { loading, skeletons, cards: Object.keys(before).length }

      return facts.noJump
    })

    await check('the token bar width is tokens / the largest session in scope (± 2 px), labelled with the value; scoped to a project the scale is that project\'s', async () => {
      const visible = visibleRows(rows)
      const max = Math.max(...visible.map(tokensOf))
      const measure = async () => {
        const v = await viewport(page)

        return page.$$eval(
          '[data-testid="session-tree-block"]',
          (elements, zoom) =>
            elements
              .filter(element => element.getAttribute('data-out-of-scope') !== 'true')
              .map(element => ({
                id: element.getAttribute('data-session-id')!,
                tokens: Number(element.getAttribute('data-tokens')),
                max: Number(element.getAttribute('data-token-max')),
                width: element.querySelector('[data-testid="session-tree-token-bar"]')!.getBoundingClientRect().width / zoom,
                label: element.querySelector('[data-field="tokens"]')!.textContent
              })),
          v.zoom
        )
      }
      const all = await measure()
      const off = all.filter(bar => Math.abs(bar.width - (TOKEN_BAR * bar.tokens) / max) > 2 || bar.max !== max)
      const sample = all.find(bar => bar.id === 'st-sys-tip')!
      const tokensById = new Map(visible.map(row => [row.id, tokensOf(row)]))

      assert(all.length > 10 && off.length === 0, `bars off: ${JSON.stringify(off.slice(0, 3))} (max ${max})`)
      assert(all.every(bar => tokensById.get(bar.id) === bar.tokens), 'a card\'s tokens differ from its row')
      assert(sample.label === `${(sample.tokens / 1e6).toFixed(1)}M` || /k$|M$|^\d+$/.test(sample.label ?? ''), `label ${sample.label}`)
      await setScope(page, 'mdesign')
      const scoped = await measure()
      const scopedMax = Math.max(...scoped.map(bar => bar.tokens))
      const scopedOff = scoped.filter(bar => bar.max !== scopedMax || Math.abs(bar.width - (TOKEN_BAR * bar.tokens) / scopedMax) > 2)

      await setScope(page, 'All')
      assert(scopedMax < max && scopedOff.length === 0, `scoped scale ${scopedMax} vs ${max}: ${JSON.stringify(scopedOff.slice(0, 3))}`)
      facts.tokens = { max, bars: all.length, scopedMax, sample: { tokens: sample.tokens, width: sample.width, label: sample.label } }

      return facts.tokens
    })

    await check('the sparkline values equal the backend\'s 7-day activity; its tooltip lists the per-day message counts', async () => {
      await allLoaded(page)
      const shown = await cards(page)
      const answer = await backendDetails(s, shown.map(card => card.id))
      const sparks = await page.$$eval('[data-testid="session-tree-block"]', elements =>
        elements.map(element => {
          const spark = element.querySelector('[data-testid="session-tree-sparkline"]')

          return { id: element.getAttribute('data-session-id')!, values: spark?.getAttribute('data-activity') ?? null, title: spark?.getAttribute('title') ?? '', points: spark?.querySelector('polyline')?.getAttribute('points')?.split(' ').length ?? 0 }
        })
      )
      const wrong = sparks.filter(spark => spark.values !== answer.details[spark.id]?.activity.join(','))
      const busy = sparks.find(spark => (spark.values ?? '').split(',').some(value => Number(value) > 0))!
      const lines = busy.title.split('\n').slice(1)

      assert(wrong.length === 0, `sparklines differ: ${JSON.stringify(wrong.slice(0, 3))}`)
      assert(sparks.every(spark => spark.points === 7), 'a sparkline without 7 points')
      assert(lines.length === 7 && lines.every((line, index) => line.endsWith(`: ${busy.values!.split(',')[index]} msg${busy.values!.split(',')[index] === '1' ? '' : 's'}`)), `tooltip ${busy.title}`)
      assert(answer.days.every((day, index) => lines[index].includes(day.slice(5))), `tooltip days ${busy.title} vs ${answer.days}`)
      facts.sparkline = { cards: sparks.length, sample: { id: busy.id, values: busy.values }, days: answer.days }

      return facts.sparkline
    })

    await check('compacted ×N: stacked ghost cards behind the card (2 for ×3, 1 for ×1) below its bottom edge, and the "compacted ×3" tag', async () => {
      const ghosts = async (id: string) =>
        page.$eval(CARD(id), card => {
          const r = card.getBoundingClientRect()
          const list = [...card.querySelectorAll('[data-testid="session-tree-ghost"]')].map(ghost => ghost.getBoundingClientRect())

          const first = card.querySelector('[data-testid="session-tree-ghost"]')

          return { count: list.length, below: list.map(g => Math.round(g.bottom - r.bottom)), z: first ? getComputedStyle(first).zIndex : null, tag: card.querySelector('[data-testid="session-tree-compacted"]')?.textContent ?? null }
        })
      const three = await ghosts('st-sys-tip')
      const one = await ghosts('st-md-tip')
      const none = await ghosts('st-hp-root')

      assert(three.count === 2 && three.below.every(px => px > 0) && three.below[1] > three.below[0] && three.z === '-1', `×3 ghosts ${JSON.stringify(three)}`)
      assert(three.tag?.trim() === 'compacted ×3', `tag ${three.tag}`)
      assert(one.count === 1 && one.tag?.trim() === 'compacted ×1', `×1 ${JSON.stringify(one)}`)
      assert(none.count === 0 && none.tag === null, `plain card ${JSON.stringify(none)}`)

      return { three, one }
    })

    await check('status: running is an animated border, needs input an amber banner strip on top (test hook), unread a bold title with an accent dot, pinned a pin glyph', async () => {
      seedFixtures(t, ['--activate', 'st-sys-pairing'])
      await page.waitForFunction(() => document.querySelector('[data-testid="session-tree-block"][data-session-id="st-sys-pairing"]')?.getAttribute('data-running') === 'true', undefined, { timeout: 30_000 })
      const running = await page.$eval(CARD('st-sys-pairing'), el => {
        const after = getComputedStyle(el, '::after')

        return { animation: after.animationName, duration: after.animationDuration, label: el.querySelector('.st-rc-run')?.textContent }
      })

      // Needs input: no SDK source (pre-check 10); the e2e build's hook names the id.
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('session-tree:test-needs-input', { detail: ['st-hp-mockup'] })))
      await page.locator(`${CARD('st-hp-mockup')} [data-testid="session-tree-needs-input"]`).waitFor({ timeout: 5000 })
      const asking = await page.$eval(CARD('st-hp-mockup'), card => {
        const banner = card.querySelector('[data-testid="session-tree-needs-input"]') as HTMLElement
        const probe = document.createElement('div')

        probe.style.background = 'var(--ui-yellow)'
        card.appendChild(probe)
        const yellow = getComputedStyle(probe).backgroundColor

        probe.remove()

        return { text: banner.textContent, bg: getComputedStyle(banner).backgroundColor, yellow, gap: Math.round(card.getBoundingClientRect().top - banner.getBoundingClientRect().bottom) }
      })

      await page.evaluate(() => window.dispatchEvent(new CustomEvent('session-tree:test-needs-input', { detail: [] })))
      // Unread: the real Mark as unread from the card's menu.
      await fit(page)
      const target = await box(page, `${CARD('st-hp-routing')} [data-field="title"]`)

      await page.mouse.click(target.x + 30, target.y + target.height / 2, { button: 'right' })
      await page.locator(`${MENU}[data-node-id="st-hp-routing"] [data-action="read"]`).click()
      await page.waitForFunction(() => document.querySelector('[data-testid="session-tree-block"][data-session-id="st-hp-routing"]')?.getAttribute('data-unread') === 'true', undefined, { timeout: 15_000 })
      const unread = await page.$eval(CARD('st-hp-routing'), el => ({ weight: getComputedStyle(el.querySelector('[data-field="title"]')!).fontWeight, dot: Boolean(el.querySelector('[data-testid="session-tree-unread-dot"]')) }))
      const plainWeight = await page.$eval(CARD('st-hp-root'), el => getComputedStyle(el.querySelector('[data-field="title"]')!).fontWeight)
      const pinned = await page.$eval(CARD('st-hp-root'), el => ({ attr: el.getAttribute('data-pinned'), glyph: Boolean(el.querySelector('.st-pin')) }))

      assert(running.animation === 'st-rc-spin' && running.label === 'running', `running ${JSON.stringify(running)}`)
      assert(asking.bg === asking.yellow && /Needs input/.test(asking.text ?? '') && Math.abs(asking.gap) <= 1, `needs input ${JSON.stringify(asking)}`)
      assert(Number(unread.weight) >= 700 && Number(plainWeight) < 600 && unread.dot, `unread ${JSON.stringify(unread)} vs ${plainWeight}`)
      assert(pinned.attr === 'true' && pinned.glyph, `pinned ${JSON.stringify(pinned)}`)
      await page.screenshot({ path: join(shots, 'rich-status-light.png') })
      facts.status = { running, asking, unread, plainWeight, pinned }

      return facts.status
    })

    await check('open in the app: double-click opens the card\'s session in a new tab; back on the page its card has the accent glow', async () => {
      await fit(page)
      const tabsBefore = await page.getByRole('tab').count()
      const title = await box(page, `${CARD('st-md-katex')} [data-field="title"]`)

      await page.mouse.dblclick(title.x + 30, title.y + title.height / 2)
      await page.waitForFunction(before => document.querySelectorAll('[role="tab"]').length > before, tabsBefore, { timeout: 20_000 })
      const focused = await focusedStored(page)

      // The session tab is focused (the page stays mounted beside it): its card shows as open.
      await page.waitForFunction(() => document.querySelector('[data-testid="session-tree-block"][data-session-id="st-md-katex"]')?.getAttribute('data-open') === 'true', undefined, { timeout: 10_000 })
      await sleep(500) // the ring's 0.15 s box-shadow transition
      const glow = await page.$eval(CARD('st-md-katex'), el => getComputedStyle(el).boxShadow)

      if (!(await page.locator('[data-testid="session-tree-canvas"]').isVisible().catch(() => false))) {
        await backToTree(page)
      }

      assert(focused === 'st-md-katex', `focused ${focused}`)
      assert(/26px/.test(glow), `no glow: ${glow}`)

      return { focused, glow: glow.slice(0, 60) }
    })

    await check('the drawer: closed by default behind a grip "N unbranched" (N = the singles); opens; open state per device (kept over a reload, not on another device); double-click opens a row; right-click gives the session menu', async () => {
      const drawer = page.locator('[data-testid="session-tree-drawer"]')
      const count = Number(await page.locator('[data-testid="session-tree-drawer-count"]').innerText())
      const grip = await page.locator('[data-testid="session-tree-drawer-grip"]').innerText()
      const pane = await box(page, '.react-flow__pane')
      const closedBox = await box(page, '[data-testid="session-tree-drawer"]')
      const singles = (await page.getAttribute('[data-testid="session-tree-page"]', 'data-row-count')) ?? ''

      assert((await drawer.getAttribute('data-open')) === 'false' && closedBox.x >= pane.x + pane.width - 1, `drawer not closed at first (${JSON.stringify(closedBox)})`)
      await page.locator('[data-testid="session-tree-drawer-grip"]').click()
      await page.waitForTimeout(500)
      const openBox = await box(page, '[data-testid="session-tree-drawer"]')
      const rowsShown = await page.locator('[data-testid="session-tree-drawer-row"]').evaluateAll(els => els.map(el => el.getAttribute('data-session-id')))

      assert((await drawer.getAttribute('data-open')) === 'true' && openBox.x + openBox.width <= pane.x + pane.width + 1 && openBox.x < pane.x + pane.width - 250, `drawer not open (${JSON.stringify(openBox)})`)
      assert(count === 24 && rowsShown.length === count && rowsShown.every(id => id?.startsWith('st-single-')), `count ${count}, rows ${rowsShown.length}: ${JSON.stringify(rowsShown.slice(0, 4))}`)
      assert(/^24\s*unbranched/.test(grip.replace(/\n/g, ' ')), `grip "${grip}"`)
      // Only the rows scrolled into view are asked for: the first ones load.
      await page.waitForFunction(() => !document.querySelector('[data-testid="session-tree-drawer-row"] [data-loading="true"]') || !document.querySelector('[data-testid="session-tree-drawer-row"]:first-child [data-loading="true"]'), undefined, { timeout: 15_000 })
      const rowText = await page.$eval('[data-testid="session-tree-drawer-row"]', el => ({ title: el.querySelector('[data-field="title"]')?.textContent, excerpt: el.querySelector('[data-field="excerpt"]')?.textContent }))
      // Rows far below the drawer's scroll view were never asked for.
      const lastLoading = await page.$eval('[data-testid="session-tree-drawer-row"]:last-child', el => Boolean(el.querySelector('[data-loading="true"]')))

      assert(rowText.excerpt && lastLoading, `first row ${JSON.stringify(rowText)}, last row loading ${lastLoading}`)

      await page.screenshot({ path: join(shots, 'rich-drawer-light.png') })
      await reloadTree(s)
      const afterReload = await drawer.getAttribute('data-open')
      const other = await addContext(s)
      let otherDevice: null | string

      try {
        await signIn(t, other.page)
        await enableDesktopHalf(t, other.page, { via: 'detail' })
        await openTree(other)
        otherDevice = await other.page.getAttribute('[data-testid="session-tree-drawer"]', 'data-open')
      } finally {
        await other.context.close()
      }

      assert(afterReload === 'true' && otherDevice === 'false', `open after reload ${afterReload}, on another device ${otherDevice}`)
      const target = rowsShown[0]!
      const rowBox = await box(page, `[data-testid="session-tree-drawer-row"][data-session-id="${target}"]`)

      await page.mouse.click(rowBox.x + 60, rowBox.y + rowBox.height / 2, { button: 'right' })
      await page.locator(`${MENU}[data-node-id="${target}"]`).waitFor({ timeout: 5000 })
      const menu = await page.locator(`${MENU} [data-action]`).evaluateAll(els => els.map(el => el.getAttribute('data-action')))

      await page.keyboard.press('Escape')
      await page.locator(MENU).waitFor({ state: 'detached', timeout: 5000 })
      const tabsBefore = await page.getByRole('tab').count()

      await page.mouse.dblclick(rowBox.x + 60, rowBox.y + rowBox.height / 2)
      await page.waitForFunction(before => document.querySelectorAll('[role="tab"]').length > before, tabsBefore, { timeout: 20_000 })
      const focused = await focusedStored(page)

      if (!(await page.locator('[data-testid="session-tree-canvas"]').isVisible().catch(() => false))) {
        await backToTree(page)
      }

      assert(['rename', 'archive', 'move', 'branch'].every(action => menu.includes(action)), `menu ${JSON.stringify(menu)}`)
      assert(focused === target, `focused ${focused}, wanted ${target}`)
      // Leave it closed for the viewport check (closed rows are never asked for).
      await page.locator('[data-testid="session-tree-drawer-grip"]').click()
      await page.waitForTimeout(400)
      facts.drawer = { count, rows: rowsShown.length, rowText, afterReload, otherDevice, opened: target, singlesRowCount: singles }

      return facts.drawer
    })

    await check('R13 on drop: a card dropped across a link makes it detour (geometry: no path point inside the card); positions are saved for Rich separately from Dense and restored after a reload', async () => {
      await fit(page)
      const writesFrom = Date.now()
      const parent = (await flowPos(page, 'st-hp-root'))!
      const child = (await flowPos(page, 'st-hp-routing'))!
      const childTo = { x: child.x, y: child.y + 320 }

      await dragCardTo(page, 'st-hp-routing', childTo)
      const childAt = (await flowPos(page, 'st-hp-routing'))!
      const mid = { x: (parent.x + childAt.x) / 2 + CARD_W / 2, y: (parent.y + CARD_H + childAt.y) / 2 }
      const blockerTo = { x: mid.x - CARD_W / 2, y: mid.y - CARD_H / 2 }

      await dragCardTo(page, 'st-md-redline', blockerTo)
      const blocker = (await flowPos(page, 'st-md-redline'))!
      const link = page.locator('[data-testid="session-tree-link"][data-source="st-hp-root"][data-target="st-hp-routing"]')
      // The straight line between the two ports crosses the dropped card (the drop is real input, a
      // few px off at this zoom): its midpoint is inside the card.
      const midpoint = { x: (parent.x + CARD_W / 2 + childAt.x + CARD_W / 2) / 2, y: (parent.y + CARD_H + childAt.y) / 2 }
      const crosses = midpoint.x > blocker.x + 10 && midpoint.x < blocker.x + CARD_W - 10 && midpoint.y > blocker.y + 10 && midpoint.y < blocker.y + CARD_H - 10

      assert(childAt.y - child.y > 250 && crosses, `drops landed at ${JSON.stringify({ child, childAt, blocker, midpoint })}`)

      await page.waitForFunction(() => document.querySelector('[data-testid="session-tree-link"][data-source="st-hp-root"][data-target="st-hp-routing"]')?.getAttribute('data-detoured') === 'true', undefined, { timeout: 5000 })
      const inside = await link.locator('path.react-flow__edge-path').evaluate((path, rect) => {
        const p = path as SVGPathElement
        const length = p.getTotalLength()
        let hits = 0

        for (let i = 0; i <= 200; i += 1) {
          const point = p.getPointAtLength((length * i) / 200)

          if (point.x > rect.x + 1 && point.x < rect.x + rect.w - 1 && point.y > rect.y + 1 && point.y < rect.y + rect.h - 1) {
            hits += 1
          }
        }

        return hits
      }, { x: blocker.x, y: blocker.y, w: CARD_W, h: CARD_H })

      assert(inside === 0, `${inside} path points inside the dropped card`)
      await page.screenshot({ path: join(shots, 'rich-detour-light.png') })
      const state = await waitFor('the Rich drops stored', () => stored(s), value => {
        const layout = layoutOf(value, 'rich')

        return Math.abs((layout['st-md-redline']?.x ?? NaN) - blocker.x) < 0.5 && Math.abs((layout['st-hp-routing']?.y ?? NaN) - childAt.y) < 0.5
      })
      const dense = layoutOf(state, 'dense')
      const denseChanged = Object.keys(denseBefore).filter(id => !dense[id] || Math.abs(dense[id].x - denseBefore[id].x) > 0.01 || Math.abs(dense[id].y - denseBefore[id].y) > 0.01)
      const writes = positionWrites(log, writesFrom).map(entry => `${entry.method} ${entry.path.split('?')[0]}`)

      assert(denseChanged.length === 0, `Dense positions changed: ${denseChanged.join(', ')}`)
      assert(writes.every(entry => entry === 'PATCH /state/positions') && writes.length >= 1 && writes.length <= 4, `writes ${JSON.stringify(writes)}`)
      await reloadTree(s)
      const restored = { blocker: await flowPos(page, 'st-md-redline'), child: await flowPos(page, 'st-hp-routing') }

      assert(Math.abs(restored.blocker!.x - blocker.x) < 0.5 && Math.abs(restored.child!.y - childAt.y) < 0.5, `restored ${JSON.stringify(restored)}`)
      assert((await link.getAttribute('data-detoured')) === 'true', 'the detour is gone after the reload')
      // Dense still draws its own positions.
      await switchStyle(page, 'dense')
      await settled(page)
      const densePos = await flowPos(page, 'st-md-redline')

      await switchStyle(page, 'rich')
      await settled(page)
      assert(densePos && Math.abs(densePos.x - denseBefore['st-md-redline'].x) < 0.5 && Math.abs(densePos.y - denseBefore['st-md-redline'].y) < 0.5, `Dense draws ${JSON.stringify(densePos)} not ${JSON.stringify(denseBefore['st-md-redline'])}`)
      facts.detour = { parent, childAt, blocker, inside, writes, richStored: Object.keys(layoutOf(state, 'rich')).length }

      return facts.detour
    })

    await check('only cards in or near the viewport are asked for (network log): zoomed in on one corner, after a reload; a pan to far cards asks for those', async () => {
      await fit(page)
      const first = await box(page, `${CARD('st-sys-tip')} [data-field="title"]`)

      await page.mouse.move(first.x + 20, first.y + 10)

      for (let i = 0; i < 12; i += 1) {
        await page.mouse.wheel(0, -300)
        await sleep(60)
      }

      await sleep(800)
      const zoomed = await viewport(page)
      const from = Date.now()

      await reloadTree(s)
      await allLoaded(page).catch(() => undefined)
      await sleep(800)
      const v = await viewport(page)
      const asked = detailsRequests(log, from)
      const askedIds = new Set(asked.flatMap(request => request.ids))
      const geometry = await nearByGeometry(page)
      const extra = [...askedIds].filter(id => !geometry.near.includes(id))
      const missing = geometry.near.filter(id => !askedIds.has(id))

      assert(Math.abs(v.zoom - zoomed.zoom) < 0.01, `the zoomed view was not restored (${zoomed.zoom} → ${v.zoom})`)
      assert(geometry.far.length >= 5, `only ${geometry.far.length} cards are far from the view: zoom further`)
      assert(extra.length === 0, `asked for cards far from the view: ${extra.join(', ')}`)
      assert(missing.length === 0, `near cards never asked for: ${missing.join(', ')}`)
      assert(asked.every(request => request.ids.length <= 100 && request.profile === 'default'), 'a request over 100 ids')
      // Pan (middle drag) toward the far cards: they get asked for.
      const spot = await emptySpot(page)
      const farBefore = geometry.far.slice()
      const panFrom = Date.now()

      for (let i = 0; i < 4; i += 1) {
        await drag(page, spot, { x: -320, y: -160 }, 'middle')
      }

      await sleep(900)
      const after = await nearByGeometry(page)
      const panAsked = new Set(detailsRequests(log, panFrom).flatMap(request => request.ids))
      const newlyNear = after.near.filter(id => farBefore.includes(id))

      assert(newlyNear.length > 0 && newlyNear.every(id => panAsked.has(id)), `after the pan: near ${newlyNear.length}, asked ${[...panAsked].length}`)
      // The pan is one straight drag repeated: every view it passed lies in the box spanning the
      // grown views before and after it; nothing outside that box was asked for.
      const span = {
        left: Math.min(geometry.region.left, after.region.left),
        top: Math.min(geometry.region.top, after.region.top),
        right: Math.max(geometry.region.right, after.region.right),
        bottom: Math.max(geometry.region.bottom, after.region.bottom)
      }
      const positions = new Map((await cards(page)).map(card => [card.id, card]))
      const outside = [...panAsked].filter(id => {
        const card = positions.get(id)!

        return !(card.x < span.right && card.x + CARD_W > span.left && card.y < span.bottom && card.y + CARD_H > span.top)
      })

      assert(outside.length === 0, `the pan asked for cards it never came near: ${outside.join(', ')}`)
      facts.viewportOnly = { zoom: v.zoom, requests: asked.length, asked: askedIds.size, near: geometry.near.length, far: geometry.far.length, afterPan: { newlyNear: newlyNear.length, asked: panAsked.size } }
      await fit(page)

      return facts.viewportOnly
    })

    await check('a chat turn (sessions.changed) refetches the details of that session only; its sparkline today grows by 2; no re-layout (cards stay put)', async () => {
      await fit(page)
      await allLoaded(page)
      const before = await page.$eval(CARD('st-hp-mockup'), el => el.querySelector('[data-testid="session-tree-sparkline"]')?.getAttribute('data-activity') ?? '')
      const boxesBefore = await cardBoxes(page)
      const from = Date.now()

      seedFixtures(t, ['--append', 'st-hp-mockup'])
      await page.waitForFunction(
        previous => {
          const value = document.querySelector('[data-testid="session-tree-block"][data-session-id="st-hp-mockup"] [data-testid="session-tree-sparkline"]')?.getAttribute('data-activity')

          return Boolean(value) && value !== previous
        },
        before,
        { timeout: 30_000 }
      )
      await sleep(600)
      const after = await page.$eval(CARD('st-hp-mockup'), el => el.querySelector('[data-testid="session-tree-sparkline"]')?.getAttribute('data-activity') ?? '')
      const asked = detailsRequests(log, from).flatMap(request => request.ids)
      const today = (value: string) => Number(value.split(',').pop())
      const boxesAfter = await cardBoxes(page)
      const moved = Object.keys(boxesBefore).filter(id => Math.abs(boxesBefore[id].x - boxesAfter[id]?.x) > 0.5 || Math.abs(boxesBefore[id].y - boxesAfter[id]?.y) > 0.5)

      assert(today(after) === today(before) + 2, `today ${today(before)} → ${today(after)}`)
      assert(asked.length >= 1 && asked.every(id => id === 'st-hp-mockup'), `asked for ${JSON.stringify(asked)}`)
      assert(moved.length === 0, `cards moved: ${moved.join(', ')}`)
      facts.changed = { before, after, asked }

      return facts.changed
    })

    await check('light / dark: cards paint from the theme variables; screenshots of all projects, one project and the drawer open (dark)', async () => {
      await fit(page)
      const light = await themeProbe(page)

      await page.emulateMedia({ colorScheme: 'dark' })
      await page.waitForTimeout(800)
      const dark = await themeProbe(page)

      await page.screenshot({ path: join(shots, 'rich-all-dark.png') })
      await page.locator('[data-testid="session-tree-drawer-grip"]').click()
      await page.waitForTimeout(600)
      await page.screenshot({ path: join(shots, 'rich-drawer-dark.png') })
      await page.locator('[data-testid="session-tree-drawer-grip"]').click()
      await setScope(page, 'mdesign')
      await page.screenshot({ path: join(shots, 'rich-scope-dark.png') })
      await setScope(page, 'All')
      await page.emulateMedia({ colorScheme: 'light' })
      await page.waitForTimeout(500)
      assert(light.actual === light.expected && dark.actual === dark.expected && dark.actual !== light.actual, `theme ${JSON.stringify({ light, dark })}`)

      return { light: light.actual, dark: dark.actual }
    })

    await check('contrast ≥ 3:1 in light and dark (review r1 B2, N3), composited: colour alpha × every ancestor\'s opacity over the backdrop behind it — ghost borders, stand-in title, stand-in dashed border, link stroke; zoomed screenshots of the ghosts and the stand-in', async () => {
      const out: Record<string, Record<string, Awaited<ReturnType<typeof contrastOf>>>> = {}

      try {
        for (const scheme of ['light', 'dark'] as const) {
          await page.emulateMedia({ colorScheme: scheme })
          await fit(page)
          await page.waitForTimeout(800)
          out[scheme] = {}

          for (const target of CONTRAST_TARGETS) {
            out[scheme][target.name] = await contrastOf(page, target)
          }

          await zoomShot(page, CARD('st-sys-tip'), `rich-ghosts-${scheme}.png`)
          await zoomShot(page, '[data-testid="session-tree-standin"]', `rich-standin-${scheme}.png`)
        }
      } finally {
        await page.emulateMedia({ colorScheme: 'light' })
        await page.waitForTimeout(500)
      }

      const low = Object.entries(out).flatMap(([scheme, measured]) => Object.entries(measured).filter(([, m]) => m.ratio < 3).map(([name, m]) => `${scheme} ${name} ${m.ratio}:1 (${JSON.stringify(m)})`))

      const ratios = Object.fromEntries(Object.entries(out).map(([scheme, measured]) => [scheme, Object.fromEntries(Object.entries(measured).map(([name, m]) => [name, m.ratio]))]))

      facts.contrast = out
      assert(out.light['stand-in border'].against[0] !== out.dark['stand-in border'].against[0], 'light and dark measured the same backdrop')
      assert(low.length === 0, `below 3:1: ${low.join('; ')} | all: ${JSON.stringify(ratios)}`)

      return ratios
    })

    await check('card 8 (F4): the token bar — its full extent (track fill or outline) ≥ 3:1 against the card, its filled part ≥ 3:1 against the track, light and dark (composited); zoomed screenshots', async () => {
      const out: Record<string, Awaited<ReturnType<typeof tokenBarContrast>>> = {}

      try {
        for (const scheme of ['light', 'dark'] as const) {
          await page.emulateMedia({ colorScheme: scheme })
          await fit(page)
          await page.waitForTimeout(800)
          out[scheme] = await tokenBarContrast(page)
          await zoomShot(page, CARD(out[scheme].emptyCard), `rich-token-bar-${scheme}.png`)
        }
      } finally {
        await page.emulateMedia({ colorScheme: 'light' })
        await page.waitForTimeout(500)
      }

      facts.tokenBar = out
      const low = Object.entries(out).flatMap(([scheme, m]) => [m.extent < 3 ? `${scheme} extent ${m.extent}:1` : '', m.fillVsTrack < 3 ? `${scheme} fill vs track ${m.fillVsTrack}:1` : ''].filter(Boolean))

      assert(out.light.card !== out.dark.card, 'light and dark measured the same card colour')
      assert(low.length === 0, `below 3:1: ${low.join('; ')} | ${JSON.stringify(out)}`)

      return Object.fromEntries(Object.entries(out).map(([scheme, m]) => [scheme, { trackFillVsCard: m.trackFillVsCard, outlineVsCard: m.outlineVsCard, extent: m.extent, fillVsTrack: m.fillVsTrack }]))
    })

    await check('card 8 (F1): a failed background refresh with the Rich drawer open — the note sits clear of the drawer and inside the canvas (light and dark, 1440 × 900 and 1000 px wide); drawer closed and the other three styles: the note where it always was (top 8 px, right 10 px of the stage, ± 1 px)', async () => {
      // A background refresh that fails: the next poll (10 s) of the plugin's /sessions list is
      // refused by the browser (the details, the store and /health still answer).
      const sessionsList = (url: URL) => url.pathname === '/api/plugins/session-tree/sessions'

      await page.route(sessionsList, route => route.abort('connectionrefused'))
      const measured: Record<string, unknown> = {}
      const problems: string[] = []

      try {
        await waitFor('a background refresh to fail', () => page.getAttribute(PAGE_SELECTOR, 'data-refresh-failed'), value => value === 'true', 40_000)
        await page.locator(NOTE).waitFor({ timeout: 5000 })

        for (const width of [1440, 1000]) {
          await page.setViewportSize({ width, height: 900 })
          await page.waitForTimeout(600)

          for (const scheme of ['light', 'dark'] as const) {
            await page.emulateMedia({ colorScheme: scheme })
            await page.waitForTimeout(400)
            const closed = await noteGeometry(page)

            await setDrawer(page, true)
            const open = await noteGeometry(page)

            await page.screenshot({ path: join(shots, `rich-note-drawer-open-${scheme}-${width}.png`) })
            await setDrawer(page, false)
            const closedAgain = await noteGeometry(page)

            measured[`rich ${scheme} ${width}`] = { closed: closed.note, open: open.note, drawer: open.drawer, canvas: open.canvas }
            // Every case is measured first, the failures listed at the end (033096c's numbers are recorded the same way).
            if (!(open.drawerOpen && !closed.drawerOpen)) {
              problems.push(`${scheme} ${width}: drawer state ${JSON.stringify({ open: open.drawerOpen, closed: closed.drawerOpen })}`)
            }

            if (intersects(open.note, open.drawer)) {
              problems.push(`${scheme} ${width}: the note ${JSON.stringify(open.note)} overlaps the drawer ${JSON.stringify(open.drawer)}`)
            }

            if (!within(open.note, open.canvas)) {
              problems.push(`${scheme} ${width}: the note ${JSON.stringify(open.note)} is not inside the canvas ${JSON.stringify(open.canvas)}`)
            }

            if (open.noteText !== 'Couldn\u2019t refresh \u2014 showing the last data') {
              problems.push(`note ${open.noteText}`)
            }

            for (const [what, g] of [['closed', closed], ['closed again', closedAgain]] as const) {
              if (!atCorner(g)) {
                problems.push(`${scheme} ${width} drawer ${what}: the note ${JSON.stringify(g.note)} is not at top 8 / right 10 of the stage ${JSON.stringify(g.stage)}`)
              }
            }
          }
        }

        await page.emulateMedia({ colorScheme: 'light' })
        await page.setViewportSize({ width: 1440, height: 900 })
        await page.waitForTimeout(600)

        for (const other of ['dense', 'swimlanes', 'subway', 'rich']) {
          await switchStyle(page, other)
          const g = await noteGeometry(page)

          measured[other] = g.note

          if (!atCorner(g)) {
            problems.push(`${other}: the note ${JSON.stringify(g.note)} is not at top 8 / right 10 of the stage ${JSON.stringify(g.stage)}`)
          }
        }
      } finally {
        await page.emulateMedia({ colorScheme: 'light' })
        await page.setViewportSize({ width: 1440, height: 900 })
        await page.unroute(sessionsList)
      }

      const cleared = await page.locator(NOTE).waitFor({ state: 'detached', timeout: 30_000 }).then(() => true, () => false)

      await fit(page)
      facts.refreshNote = measured
      assert(problems.length === 0, `${problems.join('; ')} | ${JSON.stringify(measured)}`)
      assert(cleared, 'the note is still shown after the refresh works again')

      return measured
    })

    await check('review r1 B1 through the real API: 200 KB pathological last messages (the review\'s pasted code among them) answer fast, and a plugin /health sent meanwhile is not stalled', async () => {
      const seeded = seedFixtures(t, ['--pathological', 'work']) as { ids?: Record<string, string> }
      const ids = Object.keys(seeded.ids ?? {})

      assert(ids.length >= 20 && ids.includes('st-patho-pasted-code'), `seeded ${JSON.stringify(seeded)}`)
      const timing = await page.evaluate(async list => {
        const bridge = (window as unknown as { hermesDesktop: { api(req: { path: string; method?: string; body?: unknown }): Promise<unknown> } }).hermesDesktop
        const tz = -new Date().getTimezoneOffset()
        const timed = async (req: { path: string; method?: string; body?: unknown }) => {
          const started = performance.now()
          const out = (await bridge.api(req)) as { details?: Record<string, { excerpt: null | string }> }

          return { ms: performance.now() - started, out }
        }
        const details = (which: string[]) => timed({ path: '/api/plugins/session-tree/sessions/details', method: 'POST', body: { profile: 'work', ids: which, tz_offset_minutes: tz } })
        const pasted = await details(['st-patho-pasted-code'])
        const idle = await timed({ path: '/api/plugins/session-tree/health?session_profile=default' })
        const all = details(list)

        await new Promise(resolve => setTimeout(resolve, 15))
        const during = await timed({ path: '/api/plugins/session-tree/health?session_profile=default' })
        const done = await all

        return {
          pastedMs: Math.round(pasted.ms),
          pastedExcerpt: pasted.out.details?.['st-patho-pasted-code']?.excerpt?.slice(0, 60),
          allMs: Math.round(done.ms),
          allCount: Object.keys(done.out.details ?? {}).length,
          healthIdleMs: Math.round(idle.ms),
          healthDuringMs: Math.round(during.ms)
        }
      }, ids)

      assert(timing.allCount === ids.length, `answered ${timing.allCount} of ${ids.length}`)
      assert(timing.pastedExcerpt?.startsWith('value = self._cache.get(key_name, None)'), `excerpt ${timing.pastedExcerpt}`)
      // Wall times through the Webapp (bridge + HTTP + read-only open); the old code took 8,173 ms
      // for the pasted code alone and stalled /health for 7,882 ms.
      assert(timing.pastedMs < 500 && timing.allMs < 2000 && timing.healthDuringMs < 500, JSON.stringify(timing))
      facts.pathological = { ids: ids.length, ...timing }

      return facts.pathological
    })

    await check('500-session fixture (Show all): time to first render, a scripted 2 s middle-drag pan at ≥ 30 fps; only viewport-near ids asked for', async () => {
      await clickToolbar(page, 'session-tree-show-all')
      const started = Date.now()

      await setProfile(page, 'scale')
      await page.waitForFunction(() => document.querySelector('[data-testid="session-tree-page"]')?.getAttribute('data-canvas-count') === '500', undefined, { timeout: 60_000 })
      await page.locator('[data-testid="session-tree-block"][data-session-id^="st-scale-"]').first().waitFor({ timeout: 60_000 })
      const firstRenderMs = Date.now() - started

      await sleep(1500)
      const asked = new Set(detailsRequests(log, started).filter(request => request.profile === 'scale').flatMap(request => request.ids))
      const pan = await panFps(page)

      await page.screenshot({ path: join(shots, 'rich-scale.png') })
      const v = await viewport(page)

      await setProfile(page, 'default')
      await clickToolbar(page, 'session-tree-show-all')
      assert(pan.moved, 'the pan did not move the view')
      assert(pan.fps >= 30, `${pan.fps} fps`)
      assert(asked.size > 0 && asked.size < 500, `asked for ${asked.size} of 500 scale cards`)
      facts.scale = { firstRenderMs, ...pan, zoom: v.zoom, askedAtOpen: asked.size }

      return facts.scale
    })

    await check('no page errors from the plugin; the only Rich writes are position saves', () => {
      const fromPlugin = stacks.filter(stack => /blob:|session-tree|desktop-plugins/.test(stack))
      const writes = positionWrites(log, richFrom).map(entry => `${entry.method} ${entry.path.split('?')[0]}`)

      assert(fromPlugin.length === 0, fromPlugin.join('\n'))
      assert(s.errors.length === 0, s.errors.join('\n'))
      assert(writes.every(entry => entry === 'PATCH /state/positions'), `writes: ${JSON.stringify(writes)}`)
      facts.requests = { total: log.length, details: detailsRequests(log).length, writes: writes.length }

      return facts.requests
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

  writeFileSync(join(t.root, 'e2e-rich-facts.json'), `${JSON.stringify({ results, facts, base: webappBase(t) }, null, 2)}\n`)
  const failed = results.filter(r => !r.ok)

  console.log(`\ne2e-rich: ${results.length - failed.length} passed, ${failed.length} failed (screenshots: ${shots})`)
  process.exitCode = failed.length === 0 ? 0 : 1
}

await main()
