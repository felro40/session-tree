/**
 * e2e — Session Tree 7/7: the Subway map style, against the isolated test Hermes. It mutates its
 * fixtures (activate, mark unread), so it runs in its own fresh test home of the role
 * (`c<card>-<role>-subway`, the role's port block), the older one moved to the e2e trash.
 *
 *   node scripts/e2e-subway.ts    (part of `npm run test:e2e`)
 *   KEEP_RUNNING=1 …              leaves the test gateway up afterwards
 *
 * It installs the e2e's own build (`scripts/build.mjs --test-styles`): the only way to show "needs
 * input" is its test-only hook (the SDK has no such source, card 1 pre-check 10); "running" is the
 * real backend `is_active` heuristic (seed-fixtures --activate). Everything is read back: the
 * backend's `/sessions` and `/state`, the DOM geometry of stations, labels and track paths, the
 * network log of layout-store writes, device storage after a reload. Input is real (page.mouse /
 * page.keyboard → CDP Input.*). Screenshots go to <test root>/shots/.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Page } from 'playwright-core'

import { ALL_PROJECTS, buildGraph } from '../src/model/graph.ts'
import type { SessionRow } from '../src/model/sessions.ts'
import { addContext, close, enableDesktopHalf, launch, signIn } from './e2e/browser.ts'
import {
  assert,
  backendLog,
  backToTree,
  BLOCK,
  box,
  clickToolbar,
  fit,
  flowPos,
  focusedStored,
  freshHome,
  layoutOf,
  MENU,
  near,
  octilinearOff,
  openTree,
  PAGE,
  pathPoints,
  portsFree,
  positionWrites,
  reloadTree,
  rowsOf,
  sleep,
  stored,
  suite,
  switchStyle,
  themeProbe,
  viewport,
  waitFor
} from './e2e/common.ts'
import { buildTestPackage, seedFixtures, setup, signInLink, stopGateway, testHermes, webappBase } from './e2e/harness.ts'
import { diffSnapshots, snapshotRealHermes } from './e2e/real-hermes-guard.ts'

const t = testHermes(undefined, { variant: 'subway' })
const shots = join(t.root, 'shots')
const { results, facts, check, onFailure } = suite()

const STATION_W = 40
const STATION_H = 20
const GRID = 25
const LINK = (source: string, target: string) => `[data-testid="session-tree-link"][data-source="${source}"][data-target="${target}"]`

/** The station's visible ring / capsule centre on screen. */
async function stationCentre(page: Page, id: string): Promise<{ x: number; y: number }> {
  const b = await box(page, `${BLOCK(id)} [data-testid="session-tree-station"]`)

  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}

/** Drags a station by its ring so that its box's top-left lands on `to` (flow coordinates); a
 *  second real drag takes up what the first missed (React Flow's auto-pan near an edge). */
async function dragStationTo(page: Page, id: string, to: { x: number; y: number }, during?: () => Promise<void>): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const from = (await flowPos(page, id))!

    if (attempt > 0 && Math.abs(from.x - to.x) < 2 && Math.abs(from.y - to.y) < 2) {
      return
    }

    const v = await viewport(page)
    const grab = await stationCentre(page, id)
    const by = { x: (to.x - from.x) * v.zoom, y: (to.y - from.y) * v.zoom }

    await page.mouse.move(grab.x, grab.y)
    await page.mouse.down()
    await page.mouse.move(grab.x + by.x / 2, grab.y + by.y / 2, { steps: 12 })

    if (attempt === 0) {
      await during?.()
    }

    await page.mouse.move(grab.x + by.x, grab.y + by.y, { steps: 12 })
    await page.mouse.up()
    await page.waitForTimeout(400)
  }
}

async function linkD(page: Page, selector: string): Promise<string> {
  return (await page.locator(`${selector} path.react-flow__edge-path`).getAttribute('d')) ?? ''
}

/** Every drawn track: its ends, kind, slot, whether it detoured, and how far each segment is off octilinear. */
async function tracks(page: Page) {
  const raw = await page.$$eval('[data-testid="session-tree-link"]', elements =>
    elements.map(element => ({
      source: element.getAttribute('data-source')!,
      target: element.getAttribute('data-target')!,
      kind: element.getAttribute('data-kind'),
      slot: Number(element.getAttribute('data-slot')),
      track: element.getAttribute('data-track'),
      detoured: element.getAttribute('data-detoured') === 'true',
      routed: element.getAttribute('data-routed') === 'true',
      d: element.querySelector('path.react-flow__edge-path')?.getAttribute('d') ?? '',
      casing: Boolean(element.querySelector('[data-testid="session-tree-track-casing"]'))
    }))
  )

  return raw.map(each => ({ ...each, off: Math.max(0, ...octilinearOff(pathPoints(each.d))) }))
}

/** Screen rectangles of every station ring and label (the overlap checks). */
async function stationGeometry(page: Page) {
  return page.$$eval('[data-testid="session-tree-block"], [data-testid="session-tree-standin"]', elements =>
    elements.map(element => {
      const ring = element.querySelector('[data-testid="session-tree-station"]')!.getBoundingClientRect()
      const label = element.querySelector('[data-testid="session-tree-station-label"]')!.getBoundingClientRect()

      return {
        id: element.getAttribute('data-node-id')!,
        spot: element.getAttribute('data-label-spot'),
        clear: element.getAttribute('data-label-clear'),
        ring: { x: ring.x, y: ring.y, w: ring.width, h: ring.height },
        label: { x: label.x, y: label.y, w: label.width, h: label.height }
      }
    })
  )
}

const hit = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5

/** Tracks the model says there are: families plus their splits plus successor trees (plan.ts). */
function expectedTracks(rows: SessionRow[]) {
  const model = buildGraph(rows, [], { profile: 'default', showArchived: false, scope: ALL_PROJECTS })
  const families = model.families.filter(family => family.nodeIds.length > 1).length
  const branches = model.edges.filter(edge => edge.kind === 'branch').length
  const resets = model.edges.filter(edge => edge.kind === 'reset').length
  const continuing = [...model.childrenOf.keys()].filter(id => (model.continuedAs.get(id) ?? []).length === 0).length

  return { families, branches, resets, splits: branches - continuing, expected: families + resets + branches - continuing, edges: model.edges.length }
}

// --- the suite ---------------------------------------------------------------------------------

async function main(): Promise<void> {
  const realBefore = snapshotRealHermes()

  // The role's other homes use the same ports: make sure they are not running.
  for (const variant of [undefined, 'actions', 'sync', 'swim', 'rich', 'final']) {
    stopGateway(testHermes(undefined, variant ? { variant } : {}))
  }

  freshHome(t)
  console.log(`e2e subway — role ${t.role}, home ${t.home}`)
  const packageDir = buildTestPackage(t)
  const manifest = setup(t, { packageDir }) as { seeded?: boolean }

  assert(manifest.seeded === true, 'the subway home was not freshly seeded')

  mkdirSync(shots, { recursive: true })
  const s = await launch({ colorScheme: 'light' })
  const { page } = s
  const log = backendLog(page)
  const stacks: string[] = []
  let failures = 0

  page.on('pageerror', error => stacks.push(`${error.message}\n${error.stack ?? ''}`))
  onFailure(
    async () => {
      failures += 1
      await page.screenshot({ path: join(shots, `failure-${failures}.png`) }).catch(() => undefined)

      return `${await page.evaluate(selector => JSON.stringify({ hash: location.hash, style: document.querySelector(selector)?.getAttribute('data-style') }), PAGE)} (failure-${failures}.png)`
    },
    async () => {
      await page.mouse.up().catch(() => undefined)
      await page.keyboard.press('Escape')
      await page.keyboard.press('Escape')
      await page.waitForTimeout(300)

      if (!(await page.locator('[data-testid="session-tree-canvas"]').count())) {
        await backToTree(page).catch(() => undefined)
      }
    }
  )

  let rows: SessionRow[] = []
  let denseBefore: Record<string, { x: number; y: number }> = {}
  let subwayFrom = 0

  try {
    await check('sign in, enable the desktop half, open the page (Dense, the default); Dense saves its auto-layout', async () => {
      await signIn(t, page)
      await enableDesktopHalf(t, page)
      await openTree(t, s)
      rows = await rowsOf(s)
      await waitFor('the Dense auto-layout stored', () => stored(s), value => Object.keys(layoutOf(value, 'dense')).length > 10)
      await sleep(1500)
      denseBefore = layoutOf(await stored(s), 'dense')

      return { rows: rows.length, denseStored: Object.keys(denseBefore).length }
    })

    await check('select Subway map (toolbar switcher, synced style stored); its auto-layout is stored; it opens at Fit with every station inside the canvas; stations are 40 × 20', async () => {
      subwayFrom = Date.now()
      await switchStyle(page, 'subway')
      await waitFor('the synced style stored', () => stored(s), value => value.settings.style === 'subway')
      const onCanvas = Number(await page.getAttribute(PAGE, 'data-canvas-count'))

      await waitFor('the Subway auto-layout stored', () => stored(s), value => Object.keys(layoutOf(value, 'subway')).filter(id => !id.startsWith('group:')).length >= onCanvas)
      await sleep(800)
      await page.evaluate(() => {
        for (const key of Object.keys(localStorage)) {
          if (key.includes('viewport.v1') && key.includes('subway|')) {
            localStorage.removeItem(key)
          }
        }
      })
      await reloadTree(t, s)
      const pane = await box(page, '.react-flow__pane')
      const v = await viewport(page)
      const boxes = await page.$$eval('[data-testid="session-tree-block"], [data-testid="session-tree-standin"]', els => els.map(el => { const r = el.getBoundingClientRect(); return { id: el.getAttribute('data-node-id'), x: r.x, y: r.y, w: r.width, h: r.height } }))
      const outside = boxes.filter(r => r.x < pane.x - 1 || r.y < pane.y - 1 || r.x + r.w > pane.x + pane.width + 1 || r.y + r.h > pane.y + pane.height + 1)
      const sizes = boxes.map(r => [Math.round(r.w / v.zoom), Math.round(r.h / v.zoom)])

      assert((await page.getAttribute('[data-testid="session-tree-canvas"]', 'data-style')) === 'subway', 'the canvas is not Subway')
      assert(outside.length === 0, `stations outside the canvas at open: ${outside.map(r => r.id).join(', ')}`)
      assert(sizes.every(([w, h]) => w === STATION_W && h === STATION_H), `station sizes ${JSON.stringify(sizes.slice(0, 5))}`)
      assert(boxes.length === onCanvas, `${boxes.length} stations for ${onCanvas} on the canvas`)
      await page.screenshot({ path: join(shots, 'subway-all-light.png') })
      facts.open = { zoom: v.zoom, stations: boxes.length }

      return facts.open
    })

    await check('tracks: as many lines as families plus their splits (and successor trees) — independent of the page, from the backend rows; every link drawn in its line\'s colour over a casing (the halo)', async () => {
      const want = expectedTracks(rows)
      const stations = await page.$$eval('[data-testid="session-tree-block"], [data-testid="session-tree-standin"]', els => els.map(el => ({ id: el.getAttribute('data-node-id')!, track: el.getAttribute('data-track') })))
      const drawn = new Set(stations.map(station => station.track))
      const links = await tracks(page)
      const trackOf = new Map(stations.map(station => [station.id, station.track]))
      // A branch is drawn in its child's line; "continued as" in its predecessor's.
      const wrong = links.filter(link => link.track !== trackOf.get(link.kind === 'reset' ? link.source : link.target))
      const colours = await page.$$eval('[data-testid="session-tree-link"] path.react-flow__edge-path', els => new Set(els.map(el => getComputedStyle(el).stroke)).size)
      const casing = await page.$eval('[data-testid="session-tree-track-casing"]', el => ({ width: parseFloat(getComputedStyle(el).strokeWidth), stroke: getComputedStyle(el).stroke }))
      const canvasBg = await page.$eval('[data-testid="session-tree-canvas"]', el => getComputedStyle(el).backgroundColor)
      const trackWidth = await page.$eval('[data-testid="session-tree-link"] path.react-flow__edge-path', el => parseFloat(getComputedStyle(el).strokeWidth))

      assert(drawn.size === want.expected && want.expected === 11, `${drawn.size} tracks drawn, ${want.expected} expected (${JSON.stringify(want)})`)
      assert(links.length === want.edges, `${links.length} links for ${want.edges} edges`)
      assert(wrong.length === 0, `links not in their line's colour: ${JSON.stringify(wrong.slice(0, 3))}`)
      assert(links.every(link => link.casing) && casing.width > trackWidth && casing.stroke === canvasBg, `casing ${JSON.stringify(casing)} vs track ${trackWidth}, canvas ${canvasBg}`)
      assert(colours >= 3, `only ${colours} track colours`)
      facts.tracks = { ...want, drawn: drawn.size, colours, casing, trackWidth }

      return facts.tracks
    })

    await check('the auto-layout: every track segment octilinear (± 0.5°), nothing detoured, no two tracks share a corridor; labels (title ≤ 2 lines + meta) overlap no station and no other label', async () => {
      const links = await tracks(page)
      const bad = links.filter(link => link.off > 0.5)
      const geometry = await stationGeometry(page)
      const clashes: string[] = []

      for (const a of geometry) {
        for (const b of geometry) {
          if (a.id < b.id && hit(a.label, b.label)) {
            clashes.push(`label ${a.id} × label ${b.id}`)
          }

          if (a.id !== b.id && hit(a.label, b.ring)) {
            clashes.push(`label ${a.id} × station ${b.id}`)
          }

          if (a.id < b.id && hit(a.ring, b.ring)) {
            clashes.push(`station ${a.id} × station ${b.id}`)
          }
        }
      }

      // Shared corridor: two links with a collinear overlap of more than 1 px (flow coordinates).
      const segs = links.flatMap(link => {
        const p = pathPoints(link.d)

        return p.slice(1).map((to, i) => ({ link: `${link.source}->${link.target}`, a: p[i], b: to }))
      })
      const shared: string[] = []

      for (let i = 0; i < segs.length; i += 1) {
        for (let j = i + 1; j < segs.length; j += 1) {
          const [s1, s2] = [segs[i], segs[j]]

          if (s1.link === s2.link) {
            continue
          }

          const ux = s1.b.x - s1.a.x
          const uy = s1.b.y - s1.a.y
          const len = Math.hypot(ux, uy)
          const cross = (p: { x: number; y: number }) => (ux * (p.y - s1.a.y) - uy * (p.x - s1.a.x)) / len
          const along = (p: { x: number; y: number }) => (ux * (p.x - s1.a.x) + uy * (p.y - s1.a.y)) / len

          if (len > 0 && Math.abs(cross(s2.a)) < 0.5 && Math.abs(cross(s2.b)) < 0.5) {
            const lo = Math.max(0, Math.min(along(s2.a), along(s2.b)))
            const hi = Math.min(len, Math.max(along(s2.a), along(s2.b)))

            if (hi - lo > 1) {
              shared.push(`${s1.link} & ${s2.link}`)
            }
          }
        }
      }

      const titleLines = await page.$$eval('[data-testid="session-tree-station-label"] [data-field="title"]', els => Math.max(...els.map(el => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight || '15')))))

      assert(bad.length === 0, `segments off octilinear: ${JSON.stringify(bad.slice(0, 2))}`)
      assert(links.every(link => !link.detoured), 'a link detours in the auto-layout')
      assert(shared.length === 0, `shared corridors: ${shared.slice(0, 4).join('; ')}`)
      assert(clashes.length === 0, `overlaps: ${clashes.slice(0, 6).join('; ')}`)
      assert(geometry.every(each => each.spot === 'above' && each.clear === 'true'), `a label left its place above: ${JSON.stringify(geometry.filter(each => each.spot !== 'above').map(each => each.id))}`)
      assert(titleLines <= 2, `a title takes ${titleLines} lines`)
      facts.autoLayout = { links: links.length, segments: segs.length, stations: geometry.length, titleLinesMax: titleLines }

      return facts.autoLayout
    })

    await check('×3 is a capsule station with "×3" inside and the folded-segments tooltip; "continued as" a dotted planned line labelled "continued as ›"; the stand-in a hollow dashed station "not loaded" at the start of a dashed grey line', async () => {
      const capsule = await page.$eval(`${BLOCK('st-sys-tip')} [data-testid="session-tree-station"]`, el => ({ shape: el.getAttribute('data-shape'), text: el.textContent, title: el.getAttribute('title'), radius: getComputedStyle(el).borderTopLeftRadius, w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height }))
      const ring = await page.$eval(`${BLOCK('st-hp-root')} [data-testid="session-tree-station"]`, el => ({ shape: el.getAttribute('data-shape'), radius: getComputedStyle(el).borderTopLeftRadius }))
      const reset = page.locator('[data-testid="session-tree-link"][data-kind="reset"]').first()
      const resetStyle = await reset.locator('path.react-flow__edge-path').evaluate(el => ({ dash: getComputedStyle(el).strokeDasharray, cap: getComputedStyle(el).strokeLinecap }))
      const pill = (await page.locator('[data-testid="session-tree-link-label"]').first().innerText()).trim()
      const standin = await page.$eval('[data-testid="session-tree-standin"]', el => {
        const station = el.querySelector('[data-testid="session-tree-station"]')!
        const cs = getComputedStyle(station)

        return { shape: station.getAttribute('data-shape'), border: cs.borderTopStyle, fill: cs.backgroundColor, label: el.querySelector('[data-field="title"]')?.textContent?.trim(), id: el.getAttribute('data-node-id') }
      })
      const standinLink = page.locator(`[data-testid="session-tree-link"][data-source="${standin.id}"]`)
      const standinStyle = await standinLink.locator('path.react-flow__edge-path').evaluate(el => ({ dash: getComputedStyle(el).strokeDasharray, stroke: getComputedStyle(el).stroke }))
      const grey = await themeProbe(page, '[data-testid="session-tree-canvas"]', 'color', 'var(--ui-text-tertiary)')
      const v = await viewport(page)

      assert(capsule.shape === 'capsule' && capsule.text?.trim() === '×3' && /Compacted ×3: 3 earlier segments/.test(capsule.title ?? '') && capsule.w / v.zoom > capsule.h / v.zoom * 1.6, `capsule ${JSON.stringify(capsule)}`)
      assert(ring.shape === 'ring' && ring.radius === '50%', `ring ${JSON.stringify(ring)}`)
      assert(resetStyle.dash !== 'none' && /^2(px)?,? 9/.test(resetStyle.dash) && pill === 'continued as ›', `planned line ${JSON.stringify(resetStyle)}, label ${pill}`)
      assert(standin.shape === 'hollow' && standin.border === 'dashed' && standin.label === 'not loaded' && /rgba\(0, 0, 0, 0\)|transparent/.test(standin.fill), `stand-in ${JSON.stringify(standin)}`)
      assert(standinStyle.dash !== 'none' && standinStyle.stroke === grey.expected, `stand-in line ${JSON.stringify(standinStyle)} vs grey ${grey.expected}`)

      return { capsule, resetStyle, pill, standin, standinStyle }
    })

    await check('status: running pulses (real is_active), needs input is an amber ring (test hook), unread an accent dot after the title (the real Mark as unread), pinned a pin glyph', async () => {
      seedFixtures(t, ['--activate', 'st-sys-pairing'])
      await page.waitForFunction(selector => document.querySelector(selector)?.getAttribute('data-running') === 'true', BLOCK('st-sys-pairing'), { timeout: 30_000 })
      const running = await page.$eval(`${BLOCK('st-sys-pairing')} [data-testid="session-tree-station"]`, el => {
        const after = getComputedStyle(el, '::after')

        return { animation: after.animationName, duration: after.animationDuration, iterations: after.animationIterationCount, border: after.borderTopColor }
      })
      const green = await themeProbe(page, BLOCK('st-sys-pairing'), 'color', 'var(--ui-green)')

      await page.evaluate(() => window.dispatchEvent(new CustomEvent('session-tree:test-needs-input', { detail: ['st-hp-mockup'] })))
      await page.locator(`${BLOCK('st-hp-mockup')} [data-testid="session-tree-needs-input"]`).waitFor({ timeout: 5000 })
      await page.waitForTimeout(400) // the ring's 0.12 s transition
      const asking = await page.$eval(`${BLOCK('st-hp-mockup')} [data-testid="session-tree-station"]`, el => ({ border: getComputedStyle(el).borderTopColor, shadow: getComputedStyle(el).boxShadow }))
      const yellow = await themeProbe(page, BLOCK('st-hp-mockup'), 'color', 'var(--ui-yellow)')

      await page.screenshot({ path: join(shots, 'subway-status-light.png') })
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('session-tree:test-needs-input', { detail: [] })))
      await fit(page)
      const at = await stationCentre(page, 'st-hp-routing')

      await page.mouse.click(at.x, at.y, { button: 'right' })
      await page.locator(`${MENU}[data-node-id="st-hp-routing"] [data-action="read"]`).click()
      await page.waitForFunction(selector => document.querySelector(selector)?.getAttribute('data-unread') === 'true', BLOCK('st-hp-routing'), { timeout: 15_000 })
      const unread = await page.$eval(BLOCK('st-hp-routing'), el => {
        const title = el.querySelector('.st-sw-title-text')!.getBoundingClientRect()
        const dot = el.querySelector('[data-testid="session-tree-unread-dot"]')?.getBoundingClientRect()

        return { dot: Boolean(dot), after: dot ? dot.left >= title.right - 1 || dot.top > title.top + 2 : false, bg: dot ? getComputedStyle(el.querySelector('[data-testid="session-tree-unread-dot"]')!).backgroundColor : null }
      })
      const accent = await themeProbe(page, BLOCK('st-hp-routing'), 'color', 'var(--ui-accent)')
      const pinned = await page.$eval(BLOCK('st-hp-root'), el => ({ attr: el.getAttribute('data-pinned'), glyph: Boolean(el.querySelector('[data-testid="session-tree-station-label"] .st-pin')) }))

      assert(running.animation === 'st-sw-ping' && running.iterations === 'infinite' && running.border === green.expected, `running ${JSON.stringify(running)} vs ${green.expected}`)
      assert(asking.border === yellow.expected && / 3px/.test(asking.shadow), `needs input ${JSON.stringify(asking)} vs ${yellow.expected}`)
      assert(unread.dot && unread.after && unread.bg === accent.expected, `unread ${JSON.stringify(unread)} vs ${accent.expected}`)
      assert(pinned.attr === 'true' && pinned.glyph, `pinned ${JSON.stringify(pinned)}`)
      facts.status = { running, asking, unread, pinned, simulated: { needsInput: 'test-only window event (--test-styles build)', running: 'real is_active via seed-fixtures --activate' } }

      return facts.status
    })

    await check('"you are here": double-click opens the station\'s session in a new tab; back on the page that station has the marker under it', async () => {
      await fit(page)
      const tabsBefore = await page.getByRole('tab').count()
      const at = await stationCentre(page, 'st-md-katex')

      await page.mouse.dblclick(at.x, at.y)
      await page.waitForFunction(before => document.querySelectorAll('[role="tab"]').length > before, tabsBefore, { timeout: 20_000 })
      const focused = await focusedStored(page)

      // The session tab is focused (the page stays mounted beside it): its station shows the marker.
      await page.locator(`${BLOCK('st-md-katex')} [data-testid="session-tree-you-are-here"]`).waitFor({ state: 'attached', timeout: 10_000 })
      const marker = await page.$eval(BLOCK('st-md-katex'), el => {
        const ring = el.querySelector('[data-testid="session-tree-station"]')!.getBoundingClientRect()
        const here = el.querySelector('[data-testid="session-tree-you-are-here"]')!
        const r = here.getBoundingClientRect()

        return { text: here.textContent?.trim(), shown: r.width > 0, below: r.width === 0 || r.top >= ring.bottom - 1, others: document.querySelectorAll('[data-testid="session-tree-you-are-here"]').length }
      })

      await page.screenshot({ path: join(shots, 'subway-here-light.png') })

      if (!(await page.locator('[data-testid="session-tree-canvas"]').isVisible().catch(() => false))) {
        await backToTree(page)
      }

      assert(focused === 'st-md-katex', `focused ${focused}`)
      assert(marker.text === '◉ you are here' && marker.below && marker.others === 1, `marker ${JSON.stringify(marker)}`)

      return { focused, marker }
    })

    await check('the map key in the corner (6 entries); the depot: a bottom strip of the 24 singles on a dotted track, open per device (kept over a reload, not on another device), double-click opens a row, right-click gives the session menu', async () => {
      const key = await page.$eval('[data-testid="session-tree-map-key"]', el => ({ entries: el.querySelectorAll('[data-key]').length, text: el.textContent }))
      const pane = await box(page, '.react-flow__pane')
      const keyBox = await box(page, '[data-testid="session-tree-map-key"]')
      const depot = page.locator('[data-testid="session-tree-depot"]')
      const depotBox = await box(page, '[data-testid="session-tree-depot"]')
      const count = Number(await page.locator('[data-testid="session-tree-depot-count"]').innerText())
      const rowIds = await page.locator('[data-testid="session-tree-depot-row"]').evaluateAll(els => els.map(el => el.getAttribute('data-session-id')))

      assert(key.entries === 6 && /Map key/.test(key.text ?? ''), `map key ${JSON.stringify(key)}`)
      assert(keyBox.x + keyBox.width <= pane.x + pane.width + 1 && keyBox.y + keyBox.height <= depotBox.y + 1, `key ${JSON.stringify(keyBox)} vs depot ${JSON.stringify(depotBox)}`)
      assert((await depot.getAttribute('data-open')) === 'true' && Math.abs(depotBox.y + depotBox.height - (pane.y + pane.height)) <= 1 && depotBox.width >= pane.width - 1, `depot ${JSON.stringify(depotBox)}`)
      assert(count === 24 && rowIds.length === 24 && rowIds.every(id => id?.startsWith('st-single-')), `depot count ${count}, rows ${rowIds.length}`)
      // Right-click: the session menu; double-click: opens in a tab.
      const target = rowIds[0]!
      const rowBox = await box(page, `[data-testid="session-tree-depot-row"][data-session-id="${target}"]`)

      await page.mouse.click(rowBox.x + 20, rowBox.y + rowBox.height / 2, { button: 'right' })
      await page.locator(`${MENU}[data-node-id="${target}"]`).waitFor({ timeout: 5000 })
      const menu = await page.locator(`${MENU} [data-action]`).evaluateAll(els => els.map(el => el.getAttribute('data-action')))

      await page.keyboard.press('Escape')
      await page.locator(MENU).waitFor({ state: 'detached', timeout: 5000 })
      const tabsBefore = await page.getByRole('tab').count()

      await page.mouse.dblclick(rowBox.x + 20, rowBox.y + rowBox.height / 2)
      await page.waitForFunction(before => document.querySelectorAll('[role="tab"]').length > before, tabsBefore, { timeout: 20_000 })
      const focused = await focusedStored(page)

      if (!(await page.locator('[data-testid="session-tree-canvas"]').isVisible().catch(() => false))) {
        await backToTree(page)
      }

      // Fold it: kept over a reload, open on another device.
      await page.locator('[data-testid="session-tree-depot-toggle"]').click()
      await page.waitForTimeout(400)
      const folded = await depot.getAttribute('data-open')

      await reloadTree(t, s)
      const afterReload = await page.getAttribute('[data-testid="session-tree-depot"]', 'data-open')
      const other = await addContext(s)
      let otherDevice: null | string

      try {
        await signIn(t, other.page)
        await enableDesktopHalf(t, other.page, { via: 'detail' })
        await openTree(t, other)
        otherDevice = await other.page.getAttribute('[data-testid="session-tree-depot"]', 'data-open')
      } finally {
        await other.context.close()
      }

      await page.locator('[data-testid="session-tree-depot-toggle"]').click()
      await page.waitForTimeout(400)
      assert(['rename', 'archive', 'move', 'branch', 'delete'].every(action => menu.includes(action)), `menu ${JSON.stringify(menu)}`)
      assert(focused === target, `focused ${focused}, wanted ${target}`)
      assert(folded === 'false' && afterReload === 'false' && otherDevice === 'true', `folded ${folded}, after reload ${afterReload}, another device ${otherDevice}`)
      await page.screenshot({ path: join(shots, 'subway-depot-light.png') })
      facts.depot = { count, menu: menu.length, opened: target, folded, afterReload, otherDevice, key: key.entries }

      return facts.depot
    })

    await check('drag a station: while dragged its tracks are straight segments (one segment each, live); after the drop they are octilinear again; every track stays octilinear', async () => {
      await fit(page)
      const id = 'st-sys-pairing'
      const before = (await flowPos(page, id))!
      const incoming = LINK('st-sys-tip', id)
      let during = ''
      let duringRouted: null | string = null

      await dragStationTo(page, id, { x: before.x + 130, y: before.y + 70 }, async () => {
        await page.waitForTimeout(150)
        during = await linkD(page, incoming)
        duringRouted = await page.getAttribute(incoming, 'data-routed')
      })
      const after = (await flowPos(page, id))!
      const dropped = await linkD(page, incoming)
      const all = await tracks(page)
      const duringPoints = pathPoints(during)
      const droppedPoints = pathPoints(dropped)

      assert(Math.abs(after.x - before.x - 130) < 6 && Math.abs(after.y - before.y - 70) < 6, `the drop landed at ${JSON.stringify(after)} from ${JSON.stringify(before)}`)
      assert(duringPoints.length === 2 && duringRouted === 'false', `during the drag: ${during} (routed ${duringRouted})`)
      // The straight live segment is not octilinear here (a 130 × 70 move), so the drop really re-routed.
      assert(Math.max(...octilinearOff(duringPoints)) > 5, `the live segment happens to be octilinear: ${during}`)
      assert(droppedPoints.length >= 3 && Math.max(...octilinearOff(droppedPoints)) <= 0.5, `after the drop: ${dropped}`)
      assert(all.every(link => link.off <= 0.5 && link.routed), `tracks off octilinear or unrouted: ${JSON.stringify(all.filter(link => link.off > 0.5 || !link.routed).slice(0, 2))}`)
      facts.drag = { before, after, during, dropped }

      return facts.drag
    })

    await check('R13 on drop: a station dropped onto a track makes it detour around the station (octilinear, no path point inside it); the dropped station\'s own tracks re-route too; positions are saved for Subway alone and restored after a reload', async () => {
      await fit(page)
      const writesFrom = Date.now()
      const tip = (await flowPos(page, 'st-sys-tip'))!
      const comments = (await flowPos(page, 'st-sys-comments'))!
      const blockerTo = { x: (tip.x + STATION_W + comments.x) / 2 - STATION_W / 2, y: tip.y }

      await dragStationTo(page, 'st-hp-mockup', blockerTo)
      const blocker = (await flowPos(page, 'st-hp-mockup'))!
      const trunk = LINK('st-sys-tip', 'st-sys-comments')
      const crosses = Math.abs(blocker.y - tip.y) < STATION_H / 2 && blocker.x > tip.x + STATION_W && blocker.x + STATION_W < comments.x

      assert(crosses, `the drop did not land on the track: ${JSON.stringify({ tip, comments, blocker })}`)
      await page.waitForFunction(selector => document.querySelector(selector)?.getAttribute('data-detoured') === 'true', trunk, { timeout: 5000 })
      const inside = await page.locator(`${trunk} path.react-flow__edge-path`).evaluate((path, rect) => {
        const p = path as SVGPathElement
        const length = p.getTotalLength()
        let hits = 0

        for (let i = 0; i <= 300; i += 1) {
          const point = p.getPointAtLength((length * i) / 300)

          if (point.x > rect.x + 0.5 && point.x < rect.x + rect.w - 0.5 && point.y > rect.y + 0.5 && point.y < rect.y + rect.h - 0.5) {
            hits += 1
          }
        }

        return hits
      }, { x: blocker.x, y: blocker.y, w: STATION_W, h: STATION_H })
      const detour = pathPoints(await linkD(page, trunk))
      const own = await page.getAttribute(LINK('st-hp-root', 'st-hp-mockup'), 'data-routed')
      const all = await tracks(page)

      assert(inside === 0, `${inside} path points inside the dropped station`)
      assert(Math.max(...octilinearOff(detour)) <= 0.5 && detour.length >= 4, `the detour ${JSON.stringify(detour)}`)
      assert(own === 'true', 'the dropped station\'s own track did not re-route')
      assert(all.every(link => link.off <= 0.5), 'a track is off octilinear after the drop')
      await page.screenshot({ path: join(shots, 'subway-detour-light.png') })
      const state = await waitFor('the Subway drops stored', () => stored(s), value => near(layoutOf(value, 'subway')['st-hp-mockup'], blocker, 0.5))
      const dense = layoutOf(state, 'dense')
      const denseChanged = Object.keys(denseBefore).filter(key => !near(dense[key], denseBefore[key], 0.01))
      const writes = positionWrites(log, writesFrom).map(entry => `${entry.method} ${entry.path.split('?')[0]}`)
      const bodies = positionWrites(log, writesFrom).map(entry => JSON.parse(entry.body ?? '{}') as { style?: string })

      assert(denseChanged.length === 0, `Dense positions changed: ${denseChanged.join(', ')}`)
      assert(writes.every(entry => entry === 'PATCH /state/positions') && writes.length >= 1 && writes.length <= 4 && bodies.every(body => body.style === 'subway'), `writes ${JSON.stringify(writes)} ${JSON.stringify(bodies.map(body => body.style))}`)
      await reloadTree(t, s)
      const restored = await flowPos(page, 'st-hp-mockup')

      assert(near(restored, blocker, 0.5), `restored ${JSON.stringify(restored)}`)
      assert((await page.getAttribute(trunk, 'data-detoured')) === 'true', 'the detour is gone after the reload')
      await switchStyle(page, 'dense')
      const densePos = await flowPos(page, 'st-hp-mockup')

      await switchStyle(page, 'subway')
      assert(near(densePos, denseBefore['st-hp-mockup'], 0.5), `Dense draws ${JSON.stringify(densePos)} not ${JSON.stringify(denseBefore['st-hp-mockup'])}`)
      facts.detour = { blocker, inside, detour: detour.length, writes, subwayStored: Object.keys(layoutOf(state, 'subway')).length }

      return facts.detour
    })

    await check('Snap on: a dot grid at the 25 px pitch; a dragged station lands on the grid and its tracks re-route octilinear; Snap off again', async () => {
      await fit(page)
      await clickToolbar(page, 'session-tree-snap')
      await page.waitForFunction(() => document.querySelector('[data-testid="session-tree-canvas"]')?.getAttribute('data-snap') === 'on', undefined, { timeout: 10_000 })
      const grid = await page.$eval('[data-testid="session-tree-canvas"]', el => ({ grid: el.getAttribute('data-grid'), dots: Boolean(el.querySelector('.react-flow__background')) }))
      const id = 'st-md-redline'
      const before = (await flowPos(page, id))!

      await dragStationTo(page, id, { x: before.x + 113, y: before.y + 61 })
      const after = (await flowPos(page, id))!
      const incoming = pathPoints(await linkD(page, LINK('st-md-tip', id)))

      await clickToolbar(page, 'session-tree-snap')
      await page.waitForFunction(() => document.querySelector('[data-testid="session-tree-canvas"]')?.getAttribute('data-snap') === 'off', undefined, { timeout: 10_000 })
      assert(grid.grid === String(GRID) && grid.dots, `grid ${JSON.stringify(grid)}`)
      assert(after.x % GRID === 0 && after.y % GRID === 0 && (after.x !== before.x || after.y !== before.y), `not on the grid: ${JSON.stringify(after)}`)
      assert(Math.max(...octilinearOff(incoming)) <= 0.5, `the track after a snapped drop: ${JSON.stringify(incoming)}`)

      return { before, after, grid }
    })

    await check('light / dark: stations and tracks paint from the theme variables; screenshots', async () => {
      await fit(page)
      const light = await themeProbe(page, `${BLOCK('st-hp-root')} [data-testid="session-tree-station"]`, 'backgroundColor', 'var(--ui-bg-editor)')

      await page.emulateMedia({ colorScheme: 'dark' })
      await page.waitForTimeout(800)
      const dark = await themeProbe(page, `${BLOCK('st-hp-root')} [data-testid="session-tree-station"]`, 'backgroundColor', 'var(--ui-bg-editor)')

      await page.screenshot({ path: join(shots, 'subway-all-dark.png') })
      await page.emulateMedia({ colorScheme: 'light' })
      await page.waitForTimeout(500)
      assert(light.actual === light.expected && dark.actual === dark.expected && dark.actual !== light.actual, `theme ${JSON.stringify({ light, dark })}`)

      return { light: light.actual, dark: dark.actual }
    })

    await check('no page errors from the plugin; the only Subway writes are position saves', () => {
      const fromPlugin = stacks.filter(stack => /blob:|session-tree|desktop-plugins/.test(stack))
      const writes = positionWrites(log, subwayFrom).map(entry => `${entry.method} ${entry.path.split('?')[0]}`)

      assert(fromPlugin.length === 0, fromPlugin.join('\n'))
      assert(s.errors.length === 0, s.errors.join('\n'))
      assert(writes.every(entry => entry === 'PATCH /state/positions'), `writes: ${JSON.stringify(writes)}`)
      facts.requests = { total: log.length, writes: writes.length }

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

    const { pids, busy } = portsFree(t)

    assert(pids.length === 0, `left running: ${pids}`)
    assert(busy.length === 0, `ports still bound: ${busy}`)
  })

  await check("the user's real Hermes is untouched (checkout status, dist-webapp mtimes, config/plugins sha)", () => {
    const changes = diffSnapshots(realBefore, snapshotRealHermes())

    assert(changes.length === 0, changes.join('; '))
  })

  writeFileSync(join(t.root, 'e2e-subway-facts.json'), `${JSON.stringify({ results, facts, base: webappBase(t) }, null, 2)}\n`)
  const failed = results.filter(r => !r.ok)

  console.log(`\ne2e-subway: ${results.length - failed.length} passed, ${failed.length} failed (screenshots: ${shots})`)
  process.exitCode = failed.length === 0 ? 0 : 1
}

await main()
