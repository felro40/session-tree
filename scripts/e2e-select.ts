/**
 * e2e — Session Tree card 9: box selection and moving several blocks at once, against the
 * isolated test Hermes. It renames sessions and moves blocks, so it runs in its own fresh test
 * home of the role (`c<card>-<role>-select`, the role's port block), the older one moved to the
 * e2e trash.
 *
 *   node scripts/e2e-select.ts    (part of `npm run test:e2e`)
 *   KEEP_RUNNING=1 …              leaves the test gateway up afterwards
 *
 * In each of Dense, Subway and Rich cards: a box around 3 blocks selects exactly those 3 (a 4th it
 * only partly covers stays out); Shift+click toggles; Shift + a box adds; Esc clears; Ctrl+A
 * selects every editable block shown; in a project scope neither the box nor Ctrl+A selects a
 * dimmed block; dragging one selected block moves all of them by the same offset; the drop
 * re-routes once (the canvas's routing-pass counter), saves once (network log) and comes back
 * after a reload and in a second browser context; with Snap every moved block lands on the grid
 * with the spacing kept; a right-click with 3 selected, then Rename, renames only that session;
 * Delete / Backspace delete nothing; middle-drag and Space + left-drag still pan. Then: Swimlanes
 * has no box; Ctrl+A in the Rename field selects its text; the Dense inspector's "N selected";
 * the 500-session fixture (about 100 blocks boxed and dragged: frame rate and the drop's longest
 * task, next to a single-block drop).
 *
 * Everything is read back from the DOM (React Flow's node transforms and boxes, the canvas's
 * `data-selected` / `data-route-passes`), the backend (`/sessions`, `/state`) and the network log.
 * Input is real (page.mouse / page.keyboard → CDP Input.*). Screenshots go to <test root>/shots/.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Page } from 'playwright-core'

import { addContext, close, enableDesktopHalf, launch, signIn } from './e2e/browser.ts'
import type { Session } from './e2e/browser.ts'
import {
  assert,
  backendLog,
  backToTree,
  BLOCK,
  box,
  clickToolbar,
  drag,
  emptySpot,
  fit,
  flowPos,
  freshHome,
  ITEM,
  layoutOf,
  MENU,
  openTree,
  PAGE,
  portsFree,
  positionWrites,
  reloadTree,
  rowsOf,
  setProfile,
  sleep,
  stored,
  suite,
  switchStyle,
  viewport,
  waitFor
} from './e2e/common.ts'
import { buildTestPackage, setup, signInLink, stopGateway, stopRoleHomes, testHermes, webappBase } from './e2e/harness.ts'
import { diffSnapshots, snapshotRealHermes } from './e2e/real-hermes-guard.ts'

const t = testHermes(undefined, { variant: 'select' })
const shots = join(t.root, 'shots')
const { results, facts, check, onFailure } = suite()

const CANVAS = '[data-testid="session-tree-canvas"]'
const STYLES = ['dense', 'subway', 'rich'] as const
type BoxStyle = (typeof STYLES)[number]
const FPS_BAR: Record<BoxStyle, number> = { dense: 45, subway: 45, rich: 30 }
/** `SESSION_TREE_SELECT_ONLY=scale`: only the 500-session check (a quick re-measure). */
const SCALE_ONLY = process.env.SESSION_TREE_SELECT_ONLY === 'scale'
const SCOPE_PROJECT = 'mdesign'

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

interface NodeRect extends Rect {
  id: string
  /** React Flow's `selectable` class: an editable block (not read-only, not a stand-in or a label). */
  selectable: boolean
  block: boolean
  dimmed: boolean
}

type Point = { x: number; y: number }

const right = (r: Rect) => r.x + r.w
const bottom = (r: Rect) => r.y + r.h
const inside = (r: Rect, b: Rect) => r.x >= b.x && r.y >= b.y && right(r) <= right(b) && bottom(r) <= bottom(b)
const overlaps = (r: Rect, b: Rect) => r.x < right(b) && b.x < right(r) && r.y < bottom(b) && b.y < bottom(r)
const centre = (r: Rect): Point => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })
const union = (rects: Rect[]): Rect => {
  const x = Math.min(...rects.map(r => r.x))
  const y = Math.min(...rects.map(r => r.y))

  return { x, y, w: Math.max(...rects.map(right)) - x, h: Math.max(...rects.map(bottom)) - y }
}
const grow = (r: Rect, by: number): Rect => ({ x: r.x - by, y: r.y - by, w: r.w + 2 * by, h: r.h + 2 * by })
const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && [...a].sort().join(' ') === [...b].sort().join(' ')

async function selected(page: Page): Promise<string[]> {
  const raw = (await page.getAttribute(CANVAS, 'data-selected')) ?? ''

  return raw ? raw.split(' ') : []
}

async function routePasses(page: Page): Promise<number> {
  return Number(await page.getAttribute(CANVAS, 'data-route-passes'))
}

/** Every React Flow node's screen box, and what it is. */
async function nodeRects(page: Page): Promise<NodeRect[]> {
  return page.$$eval('.react-flow__node', elements =>
    elements.map(element => {
      const r = element.getBoundingClientRect()

      return {
        id: element.getAttribute('data-id')!,
        x: r.x,
        y: r.y,
        w: r.width,
        h: r.height,
        selectable: element.classList.contains('selectable'),
        block: Boolean(element.querySelector('[data-testid="session-tree-block"]')),
        dimmed: Boolean(element.querySelector('[data-out-of-scope="true"]'))
      }
    })
  )
}

async function paneRect(page: Page): Promise<Rect> {
  const b = await box(page, '.react-flow__pane')

  return { x: b.x, y: b.y, w: b.width, h: b.height }
}

/** Which screen points are empty canvas (the pane itself is the topmost element there). */
async function onPane(page: Page, points: Point[]): Promise<boolean[]> {
  return page.evaluate(list => list.map(p => Boolean(document.elementFromPoint(p.x, p.y)?.classList.contains('react-flow__pane'))), points)
}

/**
 * A real left-drag from `from` to `to` (Shift held when asked). Answers whether React Flow drew
 * its selection box during the drag.
 */
async function boxDrag(page: Page, from: Point, to: Point, { shift = false } = {}): Promise<boolean> {
  await page.mouse.move(from.x, from.y)

  if (shift) {
    await page.keyboard.down('Shift')
  }

  await page.mouse.down()
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 8 })
  await page.mouse.move(to.x, to.y, { steps: 8 })
  const drawn = await page.evaluate(() => {
    const el = document.querySelector('.react-flow__selection') as HTMLElement | null

    return Boolean(el && el.getBoundingClientRect().width > 2)
  })

  await page.mouse.up()

  if (shift) {
    await page.keyboard.up('Shift')
  }

  await page.waitForTimeout(250)

  return drawn
}

/** The corners of `b`, tried as the drag start in turn (the start must be empty canvas). */
async function boxCorners(page: Page, b: Rect): Promise<null | { from: Point; to: Point }> {
  const corners: Point[] = [
    { x: b.x, y: b.y },
    { x: right(b), y: bottom(b) },
    { x: right(b), y: b.y },
    { x: b.x, y: bottom(b) }
  ]
  const free = await onPane(page, corners)
  const opposite = [1, 0, 3, 2]

  for (let i = 0; i < 4; i += 1) {
    if (free[i]) {
      return { from: corners[i], to: corners[opposite[i]] }
    }
  }

  return null
}

/**
 * A box around exactly three editable blocks that also partly covers a fourth: three blocks close
 * together, no other editable block fully inside, a fourth cut by one side of the box.
 */
async function planThree(page: Page) {
  const pane = grow(await paneRect(page), -6)
  const rects = (await nodeRects(page)).filter(r => r.selectable && r.block && inside(r, pane))

  for (const seed of rects) {
    const near = rects
      .filter(r => r.id !== seed.id)
      .sort((a, b) => Math.hypot(centre(a).x - centre(seed).x, centre(a).y - centre(seed).y) - Math.hypot(centre(b).x - centre(seed).x, centre(b).y - centre(seed).y))
    const three = [seed, near[0], near[1]]

    if (!near[1]) {
      continue
    }

    const core = grow(union(three), 4)
    const others = rects.filter(r => !three.includes(r))

    if (others.some(r => inside(r, core))) {
      continue
    }

    for (const fourth of others.filter(r => !overlaps(r, core)).slice(0, 12)) {
      const whole = union([core, fourth])
      const cuts: Rect[] = []

      if (right(fourth) > right(core)) {
        cuts.push({ ...whole, w: Math.max(right(core), fourth.x + fourth.w / 2) - whole.x })
      }

      if (fourth.x < core.x) {
        const left = Math.min(core.x, fourth.x + fourth.w / 2)

        cuts.push({ ...whole, x: left, w: right(whole) - left })
      }

      if (bottom(fourth) > bottom(core)) {
        cuts.push({ ...whole, h: Math.max(bottom(core), fourth.y + fourth.h / 2) - whole.y })
      }

      if (fourth.y < core.y) {
        const top = Math.min(core.y, fourth.y + fourth.h / 2)

        cuts.push({ ...whole, y: top, h: bottom(whole) - top })
      }

      for (const cut of cuts) {
        const ok =
          inside(core, cut) &&
          overlaps(fourth, cut) &&
          !inside(fourth, cut) &&
          inside(cut, pane) &&
          !others.some(r => r !== fourth && inside(r, cut)) &&
          !rects.some(r => !three.includes(r) && inside(r, cut))

        if (ok) {
          const corners = await boxCorners(page, cut)

          if (corners) {
            return { ids: three.map(r => r.id), fourth: fourth.id, box: cut, ...corners }
          }
        }
      }
    }
  }

  throw new Error('no box around 3 blocks that cuts a 4th was found')
}

/** A box around one editable block (and no other), not in `skip`. */
async function planOne(page: Page, skip: readonly string[]) {
  const pane = grow(await paneRect(page), -6)
  const rects = (await nodeRects(page)).filter(r => r.selectable && r.block && inside(r, pane))

  for (const one of rects.filter(r => !skip.includes(r.id))) {
    for (const margin of [6, 10, 3]) {
      const b = grow(one, margin)

      if (inside(b, pane) && !rects.some(r => r !== one && inside(r, b))) {
        const corners = await boxCorners(page, b)

        if (corners) {
          return { id: one.id, ...corners }
        }
      }
    }
  }

  throw new Error('no box around a single block was found')
}

/** Where to grab a block: a Subway station's ring, else the block's left part (clear of its ⋯ button). */
async function grabPoint(page: Page, style: string, id: string): Promise<Point> {
  if (style === 'subway') {
    const b = await box(page, `${BLOCK(id)} [data-testid="session-tree-station"]`)

    return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
  }

  const b = await box(page, BLOCK(id))

  return { x: b.x + Math.min(24, b.width * 0.2), y: b.y + b.height / 2 }
}

async function clickBlock(page: Page, style: string, id: string, { shift = false, button = 'left' as 'left' | 'right' } = {}): Promise<void> {
  const at = await grabPoint(page, style, id)

  if (shift) {
    await page.keyboard.down('Shift')
  }

  await page.mouse.click(at.x, at.y, { button })

  if (shift) {
    await page.keyboard.up('Shift')
  }

  await page.waitForTimeout(200)
}

async function selectThese(page: Page, style: string, ids: readonly string[]): Promise<void> {
  await clickBlock(page, style, ids[0])

  for (const id of ids.slice(1)) {
    await clickBlock(page, style, id, { shift: true })
  }

  const now = await selected(page)

  assert(sameSet(now, ids), `selected ${now.join(',')}, wanted ${ids.join(',')}`)
}

/** Clicks an empty canvas spot: the selection clears, the keyboard is on the page. */
async function clearByClick(page: Page): Promise<void> {
  const spot = await emptySpot(page)

  await page.mouse.click(spot.x, spot.y)
  await page.waitForTimeout(200)
}

async function setScope(page: Page, projectLabel: null | string): Promise<void> {
  const button = projectLabel ? page.locator(`[data-testid="session-tree-scope"] button[title="Project: ${projectLabel}"]`) : page.locator('[data-testid="session-tree-scope"] button').first()

  await button.click()
  await page.waitForTimeout(600)
}

async function positionsOf(page: Page, ids: readonly string[]): Promise<Record<string, Point>> {
  const out: Record<string, Point> = {}

  for (const id of ids) {
    out[id] = (await flowPos(page, id))!
  }

  return out
}

/** A real drag of a block by a screen offset, in two legs of steps. */
async function dragBlock(page: Page, style: string, id: string, by: Point): Promise<void> {
  const from = await grabPoint(page, style, id)

  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + by.x / 2, from.y + by.y / 2, { steps: 10 })
  await page.mouse.move(from.x + by.x, from.y + by.y, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(500)
}

/**
 * The 500-session fixture: a scripted 2 s drag of a block (frame rate while dragging), then the
 * drop's cost: the longest task (PerformanceObserver `longtask`, ≥ 50 ms reported) and the time
 * from the release to the second frame after it.
 */
async function dragCost(page: Page, style: string, id: string) {
  const from = await grabPoint(page, style, id)

  await page.evaluate(() => {
    const w = window as unknown as { __stFrames: number; __stCounting: boolean; __stLong: number[]; __stObs?: PerformanceObserver }

    w.__stFrames = 0
    w.__stCounting = true
    w.__stLong = []
    w.__stObs?.disconnect()
    w.__stObs = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        w.__stLong.push(entry.duration)
      }
    })
    w.__stObs.observe({ type: 'longtask' })
    const tick = () => {
      if (w.__stCounting) {
        w.__stFrames += 1
        requestAnimationFrame(tick)
      }
    }

    requestAnimationFrame(tick)
  })
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + 10, from.y + 6, { steps: 3 })
  const t0 = Date.now()
  let moves = 0

  while (Date.now() - t0 < 2000) {
    moves += 1
    await page.mouse.move(from.x + 40 + Math.sin(moves / 8) * 120, from.y + 30 + Math.cos(moves / 11) * 80)
  }

  const elapsed = Date.now() - t0
  const frames = await page.evaluate(() => {
    const w = window as unknown as { __stFrames: number; __stCounting: boolean; __stLong: number[] }

    w.__stCounting = false
    const counted = w.__stFrames

    w.__stLong = []

    return counted
  })

  await page.mouse.move(from.x + 60, from.y + 40, { steps: 2 })
  const released = await page.evaluate(() => performance.now())

  await page.mouse.up()
  const settledAt = await page.evaluate(() => new Promise<number>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now())))))

  await page.waitForTimeout(2000)
  const longest = await page.evaluate(() => {
    const w = window as unknown as { __stLong: number[]; __stObs?: PerformanceObserver }

    w.__stObs?.disconnect()

    return Math.max(0, ...w.__stLong)
  })

  return { fps: Math.round((frames / elapsed) * 1000 * 10) / 10, frames, moves, dropToSecondFrameMs: Math.round(settledAt - released), longestTaskMs: Math.round(longest) }
}

// --- the suite ---------------------------------------------------------------------------------

async function main(): Promise<void> {
  const realBefore = snapshotRealHermes()

  // The role's other homes use the same ports: make sure they are not running.
  stopRoleHomes(t)

  freshHome(t)
  console.log(`e2e select — role ${t.role}, home ${t.home}`)
  const packageDir = buildTestPackage(t)
  const manifest = setup(t, { packageDir }) as { seeded?: boolean }

  assert(manifest.seeded === true, 'the select home was not freshly seeded')

  mkdirSync(shots, { recursive: true })
  const s = await launch({ colorScheme: 'light' })
  const { page } = s
  const log = backendLog(page)
  const stacks: string[] = []
  let other: Session | undefined
  let failures = 0

  page.on('pageerror', error => stacks.push(`${error.message}\n${error.stack ?? ''}`))
  onFailure(
    async () => {
      failures += 1
      await page.screenshot({ path: join(shots, `failure-${failures}.png`) }).catch(() => undefined)

      return `${await page.evaluate(
        ([p, c]) => JSON.stringify({ hash: location.hash, style: document.querySelector(p)?.getAttribute('data-style'), selected: document.querySelector(c)?.getAttribute('data-selected') }),
        [PAGE, CANVAS] as const
      )} (failure-${failures}.png)`
    },
    async () => {
      await page.mouse.up().catch(() => undefined)
      await page.keyboard.up('Shift').catch(() => undefined)
      await page.keyboard.up('Space').catch(() => undefined)
      await page.keyboard.press('Escape')
      await page.keyboard.press('Escape')
      await page.waitForTimeout(300)

      if (!(await page.locator(CANVAS).count())) {
        await backToTree(page).catch(() => undefined)
      }
    }
  )

  try {
    await check('sign in two browser contexts (two devices), enable the desktop half, open the page in both', async () => {
      await signIn(t, page)
      await enableDesktopHalf(t, page)
      await openTree(t, s)
      other = await addContext(s)
      await signIn(t, other.page)
      await enableDesktopHalf(t, other.page, { via: 'detail' })
      await openTree(t, other)
      await waitFor('the Dense auto-layout stored', () => stored(s), value => Object.keys(layoutOf(value, 'dense')).length > 10)

      return { style: await page.getAttribute(PAGE, 'data-style'), other: await other.page.getAttribute(PAGE, 'data-style') }
    })

    for (const style of SCALE_ONLY ? [] : STYLES) {
      let three: string[] = []

      await check(`${style}: a left-drag on empty canvas draws a box; the 3 blocks fully inside are selected, a 4th the box only partly covers is not; light and dark screenshots`, async () => {
        if ((await page.getAttribute(PAGE, 'data-style')) !== style) {
          await switchStyle(page, style)
          await waitFor('the synced style stored', () => stored(s), value => value.settings.style === style)
          await other!.page.waitForFunction(([p, id]) => document.querySelector(p)?.getAttribute('data-style') === id, [PAGE, style] as const, { timeout: 20_000 })
        }

        await fit(page)
        await clearByClick(page)
        const plan = await planThree(page)
        const before = await viewport(page)
        const drawn = await boxDrag(page, plan.from, plan.to)
        const now = await selected(page)
        const after = await viewport(page)

        assert(drawn, 'no selection box was drawn during the drag')
        assert(sameSet(now, plan.ids), `selected ${now.join(',')}, wanted ${plan.ids.join(',')}`)
        assert(!now.includes(plan.fourth), `the partly covered ${plan.fourth} was selected`)
        assert(after.x === before.x && after.y === before.y, 'the left-drag panned')
        const marked = await page.$$eval('.react-flow__node.selected', elements => elements.map(element => element.getAttribute('data-id')))

        assert(sameSet(marked as string[], plan.ids), `drawn selected: ${marked.join(',')}`)
        three = plan.ids
        await page.screenshot({ path: join(shots, `select-${style}-light.png`) })
        await page.emulateMedia({ colorScheme: 'dark' })
        await page.waitForTimeout(700)
        await page.screenshot({ path: join(shots, `select-${style}-dark.png`) })
        await page.emulateMedia({ colorScheme: 'light' })
        await page.waitForTimeout(400)

        return { selected: now, fourth: plan.fourth, box: { x: Math.round(plan.box.x), y: Math.round(plan.box.y), w: Math.round(plan.box.w), h: Math.round(plan.box.h) } }
      })

      await check(`${style}: Shift+click adds and removes a block; Shift + a box adds; Esc clears`, async () => {
        assert(three.length === 3, 'no 3-block selection from the step before')
        const rects = (await nodeRects(page)).filter(r => r.selectable && r.block && !three.includes(r.id))
        const extra = rects[0].id

        await clickBlock(page, style, extra, { shift: true })
        const added = await selected(page)

        await clickBlock(page, style, extra, { shift: true })
        const removed = await selected(page)
        const one = await planOne(page, three)
        const drawn = await boxDrag(page, one.from, one.to, { shift: true })
        const boxed = await selected(page)

        await page.keyboard.press('Escape')
        await page.waitForTimeout(200)
        const cleared = await selected(page)

        assert(sameSet(added, [...three, extra]), `Shift+click added: ${added.join(',')}`)
        assert(sameSet(removed, three), `Shift+click removed: ${removed.join(',')}`)
        assert(drawn && sameSet(boxed, [...three, one.id]), `Shift + box: ${boxed.join(',')} (drawn ${drawn})`)
        assert(cleared.length === 0, `Esc left ${cleared.join(',')}`)

        return { added: extra, boxedIn: one.id, cleared: cleared.length }
      })

      await check(`${style}: Ctrl+A selects every editable block shown (not the stand-ins), without selecting page text`, async () => {
        await clearByClick(page)
        await page.keyboard.press('Control+A')
        await page.waitForTimeout(250)
        const now = await selected(page)
        const nodes = await nodeRects(page)
        const editable = nodes.filter(r => r.selectable && r.block).map(r => r.id)
        const standins = await page.$$eval('[data-testid="session-tree-standin"]', elements => elements.length)
        const text = await page.evaluate(() => window.getSelection()?.toString() ?? '')

        await page.keyboard.press('Escape')
        assert(sameSet(now, editable), `Ctrl+A: ${now.length} selected, ${editable.length} editable shown`)
        assert(text === '', `page text selected: ${text.slice(0, 60)}`)

        return { selected: now.length, standinsShown: standins }
      })

      await check(`${style}: dragging one selected block moves all 3 by the same offset (± 1 px); one routing pass; one save request with 3 entries; back after a reload; the second browser context shows the group moved`, async () => {
        await fit(page)
        await selectThese(page, style, three)
        const all = (await nodeRects(page)).filter(r => r.block).map(r => r.id)
        const before = await positionsOf(page, all)
        const passes = await routePasses(page)
        const from = Date.now()
        const zoom = (await viewport(page)).zoom
        const by = { x: 61, y: 47 }

        await dragBlock(page, style, three[1], by)
        await sleep(900)
        const after = await positionsOf(page, all)
        const deltas = three.map(id => ({ x: after[id].x - before[id].x, y: after[id].y - before[id].y }))
        const unmoved = all.filter(id => !three.includes(id) && (after[id].x !== before[id].x || after[id].y !== before[id].y))
        const passed = (await routePasses(page)) - passes
        const writes = positionWrites(log, from)
        const body = JSON.parse(writes[0]?.body ?? '{}') as { positions?: { id: string; x: number; y: number }[] }

        // React Flow starts a drag once the pointer has moved past its 1 px threshold, so the
        // first mouse step (by / 20 here) is not part of the offset; CDP rounds the pointer to
        // whole pixels (± 1 px each end).
        const slack = { x: (by.x / 20 + 2) / zoom, y: (by.y / 20 + 2) / zoom }

        assert(deltas.every(d => Math.abs(d.x - deltas[0].x) <= 1 && Math.abs(d.y - deltas[0].y) <= 1), `offsets differ: ${JSON.stringify(deltas)}`)
        assert(Math.abs(deltas[0].x - by.x / zoom) <= slack.x && Math.abs(deltas[0].y - by.y / zoom) <= slack.y, `offset ${JSON.stringify(deltas[0])} vs drag ${by.x / zoom},${by.y / zoom}`)
        assert(unmoved.length === 0, `unselected blocks moved: ${unmoved.join(',')}`)
        assert(passed === 1, `${passed} routing passes on the drop`)
        assert(writes.length === 1 && writes[0].method === 'PATCH' && writes[0].path.startsWith('/state/positions'), `writes: ${JSON.stringify(writes.map(w => `${w.method} ${w.path}`))}`)
        assert(sameSet((body.positions ?? []).map(p => p.id), three), `saved ids ${JSON.stringify(body.positions)}`)
        const storedNow = layoutOf(await stored(s), style)

        assert(three.every(id => Math.abs(storedNow[id].x - after[id].x) < 0.01 && Math.abs(storedNow[id].y - after[id].y) < 0.01), 'the stored positions differ')

        const seen = await waitFor('the second context shows the group moved', () => positionsOf(other!.page, three), value => three.every(id => Math.abs(value[id].x - after[id].x) < 0.6 && Math.abs(value[id].y - after[id].y) < 0.6), 15_000)

        await reloadTree(t, s)
        const reloaded = await positionsOf(page, three)

        assert(three.every(id => Math.abs(reloaded[id].x - after[id].x) < 0.6 && Math.abs(reloaded[id].y - after[id].y) < 0.6), `after reload ${JSON.stringify(reloaded)}`)

        return { offset: deltas[0], routePasses: passed, saves: writes.length, saved: body.positions?.length, otherContext: seen[three[0]] }
      })

      await check(`${style}: with Snap on, a dragged group lands on the grid and keeps its spacing`, async () => {
        await fit(page)
        await clickToolbar(page, 'session-tree-snap')
        await page.waitForFunction(selector => document.querySelector(selector)?.getAttribute('data-snap') === 'on', CANVAS, { timeout: 10_000 })
        const grid = Number(await page.getAttribute(CANVAS, 'data-grid'))

        // Each block on the grid first (a single snapped drag), so the group starts on it.
        for (const id of three) {
          await clearByClick(page)
          await dragBlock(page, style, id, { x: 9, y: 7 })
        }

        const start = await positionsOf(page, three)

        assert(three.every(id => start[id].x % grid === 0 && start[id].y % grid === 0), `single drops off the grid: ${JSON.stringify(start)}`)
        await selectThese(page, style, three)
        await dragBlock(page, style, three[0], { x: 53, y: 38 })
        await sleep(600)
        const end = await positionsOf(page, three)
        const spacing = (p: Record<string, Point>) => three.map(id => [p[id].x - p[three[0]].x, p[id].y - p[three[0]].y].join(',')).join(' ')

        await clickToolbar(page, 'session-tree-snap')
        await page.waitForFunction(selector => document.querySelector(selector)?.getAttribute('data-snap') === 'off', CANVAS, { timeout: 10_000 })
        assert(three.every(id => end[id].x % grid === 0 && end[id].y % grid === 0), `off the grid: ${JSON.stringify(end)}`)
        assert(three.some(id => end[id].x !== start[id].x || end[id].y !== start[id].y), 'the group did not move')
        assert(spacing(end) === spacing(start), `spacing ${spacing(start)} → ${spacing(end)}`)

        return { grid, start: start[three[0]], end: end[three[0]], spacing: spacing(end) }
      })

      await check(`${style}: right-click on one of 3 selected blocks, Rename renames only that session; the selection stays`, async () => {
        await fit(page)
        await selectThese(page, style, three)
        const target = three[2]
        const before = Object.fromEntries((await rowsOf(s)).map(row => [row.id, row.title]))
        const title = `Renamed in ${style} (card 9)`

        await clickBlock(page, style, target, { button: 'right' })
        await page.locator(MENU).waitFor({ timeout: 5000 })
        const kept = await selected(page)

        await page.locator(ITEM('rename')).click()
        await page.locator(`[data-testid="session-tree-rename-dialog"][data-node-id="${target}"]`).waitFor({ timeout: 5000 })
        await page.locator('[data-testid="session-tree-rename-input"]').fill(title)
        await page.keyboard.press('Enter')
        await waitFor('the renamed row', () => rowsOf(s), rows => rows.find(row => row.id === target)?.title === title)
        const after = Object.fromEntries((await rowsOf(s)).map(row => [row.id, row.title]))
        const changed = Object.keys(after).filter(id => after[id] !== before[id])

        assert(sameSet(kept, three), `the right-click changed the selection: ${kept.join(',')}`)
        assert(sameSet(changed, [target]), `changed titles: ${changed.join(',')}`)

        return { renamed: target, changed, selectionDuringMenu: kept.length }
      })

      await check(`${style}: Delete and Backspace with 3 selected leave the backend's session list unchanged`, async () => {
        await fit(page)
        await selectThese(page, style, three)
        const before = (await rowsOf(s)).map(row => row.id).sort()

        await page.keyboard.press('Delete')
        await page.keyboard.press('Backspace')
        await sleep(1500)
        const after = (await rowsOf(s)).map(row => row.id).sort()
        const dialogs = await page.locator('[role="dialog"], [role="alertdialog"]').count()

        assert(JSON.stringify(after) === JSON.stringify(before), `rows ${before.length} → ${after.length}`)
        assert(dialogs === 0, `${dialogs} dialog(s) opened`)
        assert(sameSet(await selected(page), three), 'the selection changed')

        return { rows: after.length }
      })

      await check(`${style}: middle-drag and Space + left-drag still pan while 3 blocks are selected; the selection stays`, async () => {
        const v0 = await viewport(page)
        const spot = await emptySpot(page)

        await drag(page, spot, { x: 90, y: 50 }, 'middle')
        const v1 = await viewport(page)
        const afterMiddle = await selected(page)
        const spot2 = await emptySpot(page)

        await page.mouse.move(spot2.x, spot2.y)
        await page.keyboard.down('Space')
        await page.waitForTimeout(100)
        await drag(page, spot2, { x: -70, y: 40 })
        await page.keyboard.up('Space')
        await page.waitForTimeout(250)
        const v2 = await viewport(page)
        const afterSpace = await selected(page)

        assert(Math.abs(v1.x - v0.x - 90) <= 3 && Math.abs(v1.y - v0.y - 50) <= 3, `middle pan ${v1.x - v0.x},${v1.y - v0.y}`)
        assert(Math.abs(v2.x - v1.x + 70) <= 3 && Math.abs(v2.y - v1.y - 40) <= 3, `Space pan ${v2.x - v1.x},${v2.y - v1.y}`)
        assert(sameSet(afterMiddle, three) && sameSet(afterSpace, three), `selection after the pans: ${afterMiddle.join(',')} / ${afterSpace.join(',')}`)

        return { middle: { x: v1.x - v0.x, y: v1.y - v0.y }, space: { x: v2.x - v1.x, y: v2.y - v1.y } }
      })

      await check(`${style}: in a project scope neither a box over everything nor Ctrl+A selects a dimmed block`, async () => {
        await setScope(page, SCOPE_PROJECT)
        await fit(page)
        await clearByClick(page)
        const nodes = await nodeRects(page)
        const dimmed = nodes.filter(r => r.dimmed).map(r => r.id)
        const editable = nodes.filter(r => r.selectable && r.block).map(r => r.id)

        await page.keyboard.press('Control+A')
        await page.waitForTimeout(250)
        const all = await selected(page)

        await page.keyboard.press('Escape')
        const pane = grow(await paneRect(page), -3)
        const corners = await boxCorners(page, pane)

        assert(corners, 'no empty pane corner to start a box over everything')
        await boxDrag(page, corners.from, corners.to)
        const boxed = await selected(page)
        const covered = dimmed.filter(id => {
          const r = nodes.find(n => n.id === id)!

          return inside(r, pane)
        })

        await page.keyboard.press('Escape')
        await setScope(page, null)
        assert(dimmed.length > 0 && covered.length > 0, `no dimmed block to test (${dimmed.length}, covered ${covered.length})`)
        assert(all.length > 0 && sameSet(all, editable) && !all.some(id => dimmed.includes(id)), `Ctrl+A: ${all.join(',')}`)
        assert(boxed.length > 0 && !boxed.some(id => dimmed.includes(id)), `box: ${boxed.join(',')}`)

        return { dimmed: dimmed.length, dimmedInsideBox: covered.length, ctrlA: all.length, box: boxed.length }
      })
    }

    if (!SCALE_ONLY) {
      await check('Swimlanes: a left-drag on empty canvas draws no box and selects nothing (it only clears, as before)', async () => {
        await switchStyle(page, 'swimlanes')
        await page.locator(BLOCK('st-hp-root')).first().click()
        const before = await selected(page)
        const spot = await emptySpot(page)
        const drawn = await boxDrag(page, spot, { x: spot.x + 160, y: spot.y + 90 })
        const after = await selected(page)

        assert(before.length === 1, `the click did not select: ${before.join(',')}`)
        assert(!drawn, 'a selection box was drawn in Swimlanes')
        assert(after.length === 0, `selected after the drag: ${after.join(',')}`)
        assert((await page.getAttribute(CANVAS, 'data-box-select')) === 'false', 'box selection is on in Swimlanes')

        return { before, after, drawn }
      })

      await check('Dense inspector: with 3 selected it shows "3 selected" and their titles; clicking a title selects just that block', async () => {
        await switchStyle(page, 'dense')
        await fit(page)
        await clearByClick(page)
        const plan = await planThree(page)

        await boxDrag(page, plan.from, plan.to)
        const multi = page.locator('[data-testid="session-tree-inspector-multi"]')

        await multi.waitFor({ timeout: 5000 })
        const heading = (await multi.locator('[data-field="selected-count"]').textContent())?.trim()
        const listed = await multi.locator('[data-testid="session-tree-inspector-link"]').evaluateAll(elements => elements.map(element => ({ id: element.getAttribute('data-node-id')!, title: element.querySelector('.st-lk-title')?.textContent ?? '' })))
        const rows = await rowsOf(s)
        const highlighted = await page.$$eval('[data-testid="session-tree-block"][data-lineage="true"]', elements => elements.length)

        await multi.locator(`[data-testid="session-tree-inspector-link"][data-node-id="${plan.ids[1]}"]`).click()
        await page.waitForTimeout(250)
        const after = await selected(page)
        const inspector = await page.getAttribute('[data-testid="session-tree-inspector"]', 'data-selected-id')
        const lineageOne = await page.$$eval('[data-testid="session-tree-block"][data-lineage="true"]', elements => elements.length)

        assert(heading === '3 selected', `heading ${heading}`)
        assert(sameSet(listed.map(item => item.id), plan.ids), `listed ${JSON.stringify(listed)}`)
        assert(listed.every(item => item.title === rows.find(row => row.id === item.id)?.title), `titles ${JSON.stringify(listed)}`)
        assert(sameSet(after, [plan.ids[1]]) && inspector === plan.ids[1], `after the click: ${after.join(',')} / inspector ${inspector}`)
        assert(highlighted === 0 && lineageOne > 0, `lineage highlight: ${highlighted} with 3 selected, ${lineageOne} with one`)

        return { heading, listed: listed.map(item => item.title), lineageWhileSeveral: highlighted, lineageWithOne: lineageOne, picked: plan.ids[1] }
      })

      await check('with the focus in the Rename field, Ctrl+A selects the field\'s text, not blocks', async () => {
        await fit(page)
        const target = (await selected(page))[0]

        await clickBlock(page, 'dense', target, { button: 'right' })
        await page.locator(MENU).waitFor({ timeout: 5000 })
        await page.locator(ITEM('rename')).click()
        const input = page.locator('[data-testid="session-tree-rename-input"]')

        await input.waitFor({ timeout: 5000 })
        await input.focus()
        await page.keyboard.press('End')
        await page.keyboard.press('Control+A')
        const range = await input.evaluate(el => {
          const field = el as HTMLInputElement

          return { start: field.selectionStart, end: field.selectionEnd, length: field.value.length }
        })
        const blocks = await selected(page)

        await page.keyboard.press('Escape')
        await page.locator('[data-testid="session-tree-rename-dialog"]').waitFor({ state: 'detached', timeout: 5000 })
        assert(range.start === 0 && range.end === range.length && range.length > 0, `field selection ${JSON.stringify(range)}`)
        assert(sameSet(blocks, [target]), `blocks selected: ${blocks.length}`)

        return { range, blocks: blocks.length }
      })
    }

    await check('500-session fixture (Show all): box-select about 100 blocks and drag them — frame rate while dragging (Dense ≥ 45, Subway ≥ 45, Rich ≥ 30 fps) and the drop\'s longest task, next to a single-block drag', async () => {
      const table: Record<string, unknown> = {}
      const problems: string[] = []

      await clickToolbar(page, 'session-tree-show-all')

      for (const style of STYLES) {
        await setProfile(page, 'default')
        await page.waitForFunction(selector => document.querySelector(selector)?.getAttribute('data-profile') === 'default', PAGE, { timeout: 20_000 })
        await switchStyle(page, style)
        await setProfile(page, 'scale')
        await page.waitForFunction(selector => document.querySelector(selector)?.getAttribute('data-canvas-count') === '500', PAGE, { timeout: 60_000 })
        await page.locator('[data-testid="session-tree-block"][data-session-id^="st-scale-"]').first().waitFor({ timeout: 60_000 })
        await sleep(1500)
        await fit(page)
        await sleep(500)
        await clearByClick(page)

        // About 100 blocks: a box from near the pane's top-left, as large as it takes; where fewer
        // are drawn at once (Rich cards at the 30 % zoom floor), pan down and add with Shift + a box.
        const pane = grow(await paneRect(page), -4)
        let many: string[] = []
        let boxes = 0
        const rounds: { boxed: number; selected: number }[] = []
        let rects: NodeRect[] = []

        for (let round = 0; round < 5 && many.length < 95; round += 1) {
          if (round > 0) {
            const spot = await emptySpot(page)

            // The 500-session Rich layout is wide: pan left to bring the next columns in.
            await drag(page, spot, { x: -Math.round(pane.w * 0.45), y: 0 }, 'middle')
            await sleep(400)
          }

          rects = (await nodeRects(page)).filter(r => r.selectable && r.block && !many.includes(r.id))
          const want = 110 - many.length
          let chosen: null | { from: Point; to: Point; count: number } = null

          for (let oy = 0; oy <= 120; oy += 12) {
            for (let ox = 0; ox <= pane.w * 0.4; ox += 40) {
              for (let fw = 1; fw >= 0.2; fw -= 0.05) {
                for (let h = 40; h <= pane.h - oy; h += 6) {
                  const b = { x: pane.x + ox, y: pane.y + oy, w: Math.min(pane.w * fw, pane.w - ox), h }
                  const count = rects.filter(r => inside(r, b)).length

                  if (count > want) {
                    break
                  }

                  if (count > (chosen?.count ?? 0) && count >= Math.min(want, 15)) {
                    const corners = await boxCorners(page, b)

                    if (corners) {
                      chosen = { ...corners, count }
                    }
                  }
                }
              }
            }
          }

          if (!chosen) {
            break
          }

          await boxDrag(page, chosen.from, chosen.to, { shift: round > 0 })
          boxes += 1
          many = await selected(page)
          rounds.push({ boxed: chosen.count, selected: many.length })
          await page.screenshot({ path: join(shots, `select-${style}-scale-box${round + 1}.png`) })
        }

        if (many.length < 85) {
          problems.push(`${style}: only ${many.length} selected after ${boxes} box(es) ${JSON.stringify(rounds)}`)
          continue
        }

        rects = (await nodeRects(page)).filter(r => r.selectable && r.block)
        const grabbed = many.find(id => rects.some(r => r.id === id && inside(r, grow(pane, -40))))!
        const sample = many.filter(id => id !== grabbed && rects.some(r => r.id === id && inside(r, grow(pane, -80)))).slice(0, 5).concat(grabbed)
        const before = await positionsOf(page, sample)
        const group = await dragCost(page, style, grabbed)
        const after = await positionsOf(page, sample)
        const offsets = sample.filter(id => before[id] && after[id]).map(id => ({ x: Math.round((after[id].x - before[id].x) * 10) / 10, y: Math.round((after[id].y - before[id].y) * 10) / 10 }))
        const moved = await selected(page)

        await clearByClick(page)
        const single = await dragCost(page, style, grabbed)

        table[style] = { boxes: rounds, selected: many.length, group, single, stillSelected: moved.length, sampleOffsets: offsets }
        await page.screenshot({ path: join(shots, `select-${style}-scale.png`) })

        if (many.length < 85) {
          problems.push(`${style}: only ${many.length} selected`)
        }

        if (!offsets.every(o => Math.abs(o.x - offsets[0].x) <= 1 && Math.abs(o.y - offsets[0].y) <= 1) || (offsets[0].x === 0 && offsets[0].y === 0)) {
          problems.push(`${style}: the group did not move by one offset: ${JSON.stringify(offsets)}`)
        }

        if (group.fps < FPS_BAR[style]) {
          problems.push(`${style}: ${group.fps} fps while dragging ${many.length} blocks`)
        }
      }

      await setProfile(page, 'default')
      await clickToolbar(page, 'session-tree-show-all')
      facts.scale = table
      assert(problems.length === 0, `${problems.join('; ')} — ${JSON.stringify(table)}`)

      return table
    })

    await check('no page errors from the plugin in either context', () => {
      const fromPlugin = stacks.filter(stack => /blob:|session-tree|desktop-plugins/.test(stack))

      assert(fromPlugin.length === 0, fromPlugin.join('\n'))
      assert(s.errors.length === 0 && (other?.errors.length ?? 0) === 0, [...s.errors, ...(other?.errors ?? [])].join('\n'))
    })
  } finally {
    await other?.context.close().catch(() => undefined)
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

  writeFileSync(join(t.root, 'e2e-select-facts.json'), `${JSON.stringify({ results, facts, base: webappBase(t) }, null, 2)}\n`)
  const failed = results.filter(r => !r.ok)

  console.log(`\ne2e-select: ${results.length - failed.length} passed, ${failed.length} failed (screenshots: ${shots})`)
  process.exitCode = failed.length === 0 ? 0 : 1
}

await main()
