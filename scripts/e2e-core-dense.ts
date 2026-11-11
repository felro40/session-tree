/**
 * e2e — Session Tree 2/7: graph core + the Dense + inspector style, against the isolated test
 * Hermes (the role's port block; card 2: coder 19320-19324, reviewer 19325-19329).
 *
 *   node scripts/e2e-core-dense.ts      (part of `npm run test:e2e`)
 *   KEEP_RUNNING=1 …                     leaves the test gateway up afterwards
 *
 * Every check is DOM-, geometry- or assertion-based. Mouse and keyboard input is real
 * (page.mouse / page.keyboard → CDP Input.*), including the middle button and the wheel.
 * Screenshots go to <test root>/shots/ (never into the repo).
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Page } from 'playwright-core'

import { compactNumber, costLabel } from '../src/model/format.ts'
import type { SessionRow, SessionsResponse } from '../src/model/sessions.ts'
import { close, enableDesktopHalf, goto, launch, signIn } from './e2e/browser.ts'
import type { Session } from './e2e/browser.ts'
import { seedFixtures, setup, signInLink, stopGateway, testHermes, testHermesPids } from './e2e/harness.ts'
import { diffSnapshots, snapshotRealHermes } from './e2e/real-hermes-guard.ts'

const OUT_OF_SCOPE_TIP = 'Outside this project — switch to All projects to edit'
const GRID = 16

const t = testHermes()
const shots = join(t.root, 'shots')
const results: { name: string; ok: boolean; detail?: string }[] = []
const facts: Record<string, unknown> = {}

async function check(name: string, fn: () => Promise<unknown> | unknown): Promise<void> {
  try {
    const detail = await fn()

    results.push({ name, ok: true, detail: detail === undefined ? undefined : JSON.stringify(detail) })
    console.log(`  ✔ ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`)
  } catch (error) {
    results.push({ name, ok: false, detail: String(error instanceof Error ? error.message : error) })
    console.log(`  ✖ ${name} — ${error instanceof Error ? error.message : error}`)
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

const near = (a: number, b: number, tolerance: number) => Math.abs(a - b) <= tolerance

// --- page helpers ------------------------------------------------------------------------------

const BLOCK = (id: string) => `[data-testid="session-tree-block"][data-session-id="${id}"]`
const NODE = (id: string) => `.react-flow__node[data-id="${id}"]`

interface Viewport {
  x: number
  y: number
  zoom: number
}

async function viewport(page: Page): Promise<Viewport> {
  return page.$eval('.react-flow__viewport', element => {
    const match = /translate\(([-\d.e]+)px,\s*([-\d.e]+)px\)\s*scale\(([-\d.e]+)\)/.exec((element as HTMLElement).style.transform)

    return match ? { x: Number(match[1]), y: Number(match[2]), zoom: Number(match[3]) } : { x: NaN, y: NaN, zoom: NaN }
  })
}

/** A node's flow-space position, from React Flow's own transform. */
async function flowPosition(page: Page, id: string): Promise<{ x: number; y: number }> {
  return page.$eval(NODE(id), element => {
    const match = /translate\(([-\d.e]+)px,\s*([-\d.e]+)px\)/.exec((element as HTMLElement).style.transform)

    return match ? { x: Number(match[1]), y: Number(match[2]) } : { x: NaN, y: NaN }
  })
}

async function allFlowPositions(page: Page): Promise<Record<string, { x: number; y: number } | null>> {
  return page.$$eval('.react-flow__node', elements =>
    Object.fromEntries(
      elements.map(element => {
        const match = /translate\(([-\d.e]+)px,\s*([-\d.e]+)px\)/.exec((element as HTMLElement).style.transform)

        return [element.getAttribute('data-id') ?? '', match ? { x: Number(match[1]), y: Number(match[2]) } : null]
      })
    )
  )
}

async function box(page: Page, selector: string) {
  const found = await page.locator(selector).first().boundingBox()

  assert(found, `no box for ${selector}`)

  return found
}

async function zoomPercent(page: Page): Promise<number> {
  return Number((await page.locator('[data-testid="session-tree-zoom"]').innerText()).replace('%', ''))
}

/** An empty spot of the canvas: the pane at a point no node, label or edge covers. */
async function emptySpot(page: Page): Promise<{ x: number; y: number }> {
  const spot = await page.evaluate(() => {
    const pane = document.querySelector('.react-flow__pane')!.getBoundingClientRect()

    for (let y = pane.top + 20; y < pane.bottom - 20; y += 23) {
      for (let x = pane.left + 20; x < pane.right - 20; x += 29) {
        const hit = document.elementFromPoint(x, y)

        if (hit?.classList.contains('react-flow__pane')) {
          // Keep a margin from anything else, so a short drag stays on empty canvas.
          const clear = [
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
    }

    return null
  })

  assert(spot, 'no empty canvas spot found')

  return spot
}

async function drag(page: Page, from: { x: number; y: number }, by: { x: number; y: number }, { button = 'left' as 'left' | 'middle', steps = 12, hold }: { button?: 'left' | 'middle'; steps?: number; hold?: () => Promise<void> } = {}) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down({ button })
  await page.mouse.move(from.x + by.x / 2, from.y + by.y / 2, { steps })
  await hold?.()
  await page.mouse.move(from.x + by.x, from.y + by.y, { steps })
  await page.mouse.up({ button })
}

async function linkPath(page: Page, source: string, target: string): Promise<string> {
  return page.$eval(`[data-testid="session-tree-link"][data-source="${source}"][data-target="${target}"] path.react-flow__edge-path`, path =>
    path.getAttribute('d') ?? ''
  )
}

/** Screen-space sample points of a link path, and which block rectangles they enter. */
async function linkIntrusions(page: Page, source: string, target: string) {
  return page.evaluate(
    ([src, tgt]) => {
      const path = document.querySelector(
        `[data-testid="session-tree-link"][data-source="${src}"][data-target="${tgt}"] path.react-flow__edge-path`
      ) as SVGPathElement
      const ctm = path.getScreenCTM()!
      const total = path.getTotalLength()
      const points: { x: number; y: number }[] = []

      for (let i = 0; i <= 120; i += 1) {
        const p = path.getPointAtLength((total * i) / 120)

        points.push({ x: ctm.a * p.x + ctm.c * p.y + ctm.e, y: ctm.b * p.x + ctm.d * p.y + ctm.f })
      }

      const hits: string[] = []

      for (const node of document.querySelectorAll('.react-flow__node')) {
        const id = node.getAttribute('data-id') ?? ''

        if (id === src || id === tgt || id.startsWith('group:')) {
          continue
        }

        const r = node.getBoundingClientRect()
        const inside = points.find(p => p.x > r.left + 0.5 && p.x < r.right - 0.5 && p.y > r.top + 0.5 && p.y < r.bottom - 0.5)

        if (inside) {
          hits.push(`${id}@${Math.round(inside.x)},${Math.round(inside.y)}`)
        }
      }

      return { hits, samples: points.length }
    },
    [source, target]
  )
}

async function backendRows(s: Session, query: string): Promise<SessionsResponse> {
  return s.page.evaluate(async q => {
    const bridge = (window as unknown as { hermesDesktop: { api(req: { path: string }): Promise<unknown> } }).hermesDesktop

    return (await bridge.api({ path: `/api/plugins/session-tree/sessions?${q}` })) as SessionsResponse
  }, query)
}

async function openTree(s: Session): Promise<void> {
  await goto(t, s.page, '/session-tree')
  await s.page.locator('[data-testid="session-tree-canvas"]').waitFor({ timeout: 30_000 })
  await s.page.locator('[data-testid="session-tree-block"]').first().waitFor({ timeout: 30_000 })
  await s.page.waitForTimeout(400)
}

async function clickToolbar(page: Page, testId: string): Promise<void> {
  await page.locator(`[data-testid="${testId}"]`).click()
  await page.waitForTimeout(250)
}

async function setScope(page: Page, label: string): Promise<void> {
  await page.locator('[data-testid="session-tree-scope"] button', { hasText: label }).first().click()
  await page.waitForTimeout(400)
}

async function setProfile(page: Page, value: string): Promise<void> {
  await page.locator('[data-testid="session-tree-profile"]').selectOption(value)
  await page.waitForTimeout(300)
}

async function waitCanvasCount(page: Page, count: number, timeout = 30_000): Promise<void> {
  await page.waitForFunction(
    expected => document.querySelector('[data-testid="session-tree-page"]')?.getAttribute('data-canvas-count') === String(expected),
    count,
    { timeout }
  )
}

interface BandPlacement {
  block: { x: number; y: number; w: number; h: number }
  project: string
  label: null | string
  top: null | number
  nextLabel: null | string
  bottom: null | number
  overlaps: string[]
}

/**
 * Where block `id` sits relative to its project group (B1), in flow coordinates from React
 * Flow's own transforms: its group label (the lowest label of its project at or above it), the
 * band under that label down to the next group's label, and every node rectangle it overlaps.
 */
async function bandPlacement(page: Page, id: string): Promise<BandPlacement> {
  return page.evaluate(target => {
    const nodes = [...document.querySelectorAll('.react-flow__node')].map(element => {
      const match = /translate\(([-\d.e]+)px,\s*([-\d.e]+)px\)/.exec((element as HTMLElement).style.transform)

      return {
        id: element.getAttribute('data-id') ?? '',
        x: Number(match?.[1]),
        y: Number(match?.[2]),
        w: (element as HTMLElement).offsetWidth,
        h: (element as HTMLElement).offsetHeight
      }
    })
    const labels = nodes.filter(node => node.id.startsWith('group:')).sort((a, b) => a.y - b.y)
    const block = nodes.find(node => node.id === target)!
    const project = document.querySelector(`[data-session-id="${target}"]`)?.getAttribute('data-project-id') || '__no_project__'
    // A continuation label of a group is `group:<project>` + U+001F + n.
    const own = labels.filter(label => label.id.split('\u001f')[0] === `group:${project}`)
    const label = own.filter(item => item.y <= block.y).pop()
    const next = label ? labels.find(item => item.y > label.y) : undefined
    const overlaps = nodes
      .filter(node => node.id !== target && node.x < block.x + block.w && block.x < node.x + node.w && node.y < block.y + block.h && block.y < node.y + node.h)
      .map(node => node.id)

    return {
      block: { x: block.x, y: block.y, w: block.w, h: block.h },
      project,
      label: label?.id ?? null,
      top: label ? label.y + label.h : null,
      nextLabel: next?.id ?? null,
      bottom: next ? next.y : null,
      overlaps
    }
  }, id)
}

function assertInBand(placement: BandPlacement, id: string): void {
  assert(placement.label && placement.top !== null, `${id}: no group label of its project (${placement.project}) above it`)
  assert(placement.block.y >= placement.top, `${id} at y ${placement.block.y} is above its band (${placement.top})`)
  assert(
    placement.bottom === null || placement.block.y + placement.block.h <= placement.bottom,
    `${id} (y ${placement.block.y}..${placement.block.y + placement.block.h}) reaches under the next label ${placement.nextLabel} (y ${placement.bottom})`
  )
  assert(placement.overlaps.length === 0, `${id} overlaps ${placement.overlaps.join(', ')}`)
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

    return { actual: getComputedStyle(block).backgroundColor, expected }
  })
}

// --- the suite ---------------------------------------------------------------------------------

async function main(): Promise<void> {
  mkdirSync(shots, { recursive: true })
  const realBefore = snapshotRealHermes()

  console.log(`e2e core + Dense — role ${t.role}, home ${t.home}`)
  setup(t)
  const s = await launch({ colorScheme: 'light' })
  const { page } = s
  let rows: SessionRow[] = []

  try {
    await check('sign in, enable the desktop half, open the page', async () => {
      await signIn(t, page)
      await enableDesktopHalf(t, page)
      await openTree(s)
      rows = (await backendRows(s, 'session_profile=default&include_archived=false&limit=2000')).sessions

      return { rows: rows.length }
    })

    await check('toolbar: scope lists All + the projects from projects.tree, with glyphs; profile filter and toggles present', async () => {
      const scope = await page.$$eval('[data-testid="session-tree-scope"] button', buttons =>
        buttons.map(b => ({ text: b.textContent?.trim(), glyph: Boolean(b.querySelector('.codicon, .session-tree__glyph-dot')) }))
      )
      const labels = scope.map(entry => entry.text)

      for (const name of ['All', 'syscanvas', 'mdesign', 'hermes-plugins']) {
        assert(labels.includes(name), `scope lacks ${name}: ${JSON.stringify(labels)}`)
      }

      assert(scope.filter(entry => entry.text !== 'All').every(entry => entry.glyph), 'a project button has no glyph')
      const options = await page.$$eval('[data-testid="session-tree-profile"] option', opts => opts.map(o => (o as HTMLOptionElement).value))

      assert(['default', 'work', 'scale', '*'].every(value => options.includes(value)), `profile options ${options}`)

      for (const id of ['show-all', 'show-archived', 'snap', 'zoom-out', 'zoom-level', 'zoom-in', 'fit', 'rearrange']) {
        assert(await page.locator(`[data-testid="session-tree-${id}"]`).count(), `no ${id}`)
      }

      return { scope: labels, options }
    })

    await check('R6/R7: stand-in for the deleted parent, compacted ×3, dashed "continued as", hidden kinds absent', async () => {
      const standin = page.locator('[data-testid="session-tree-standin"][data-missing-id="st-orphan-parent"]')

      assert((await standin.innerText()).includes('Parent not loaded'), 'stand-in text')
      const standinLink = page.locator('[data-testid="session-tree-link"][data-target="st-orphan-child"]')

      assert((await standinLink.getAttribute('data-standin')) === 'true', 'orphan link is not from the stand-in')
      assert((await standinLink.locator('path.react-flow__edge-path').evaluate(p => getComputedStyle(p).strokeDasharray)) !== 'none', 'stand-in link not dashed')
      const tip = await page.locator(BLOCK('st-sys-tip')).innerText()

      assert(tip.includes('×3'), `tip text ${tip}`)
      assert((await page.locator(BLOCK('st-md-tip')).innerText()).includes('×1'), 'mdesign ×1')
      const reset = page.locator('[data-testid="session-tree-link"][data-kind="reset"][data-source="st-md-tip"][data-target="st-md-v2"]')
      const dash = await reset.locator('path.react-flow__edge-path').evaluate(p => getComputedStyle(p).strokeDasharray)

      assert(dash !== 'none', 'continued-as link is not dashed')
      assert((await page.locator('[data-testid="session-tree-link-label"]').first().innerText()).trim() === 'continued as', 'label')
      const ends = await page.$eval('[data-testid="session-tree-link"][data-kind="reset"] path.react-flow__edge-path', element => {
        const path = element as SVGPathElement
        const ctm = path.getScreenCTM()!
        const at = (length: number) => {
          const p = path.getPointAtLength(length)

          return { x: ctm.a * p.x + ctm.c * p.y + ctm.e, y: ctm.b * p.x + ctm.d * p.y + ctm.f }
        }

        return { start: at(0), end: at(path.getTotalLength()) }
      })
      const fromBox = await box(page, BLOCK('st-md-tip'))
      const toBox = await box(page, BLOCK('st-md-v2'))

      assert(
        near(ends.start.y, fromBox.y + fromBox.height, 1.5) && near(ends.end.y, toBox.y, 1.5) && ends.end.y > ends.start.y,
        `continued-as does not run down from the predecessor's bottom to the successor's top: ${JSON.stringify({ ends, fromBox, toBox })}`
      )
      const html = await page.locator('[data-testid="session-tree-page"]').innerHTML()

      for (const id of ['st-hidden-delegate', 'st-hidden-cron', 'st-hidden-kanban', 'st-hidden-tool', 'st-sys-root', 'st-sys-seg2', 'st-sys-seg3']) {
        assert(!html.includes(`"${id}"`), `${id} appears in the page`)
      }

      return { tip, dash }
    })

    await check('R3: plain wheel zooms toward the cursor (point under it fixed ±2 px), clamped 30–250%', async () => {
      const target = await box(page, BLOCK('st-hp-root'))
      const cursor = { x: target.x + target.width * 0.3, y: target.y + target.height * 0.5 }
      const before = await viewport(page)
      const zoomBefore = await zoomPercent(page)
      const flowPoint = { x: (cursor.x - (await box(page, '.react-flow')).x - before.x) / before.zoom, y: (cursor.y - (await box(page, '.react-flow')).y - before.y) / before.zoom }

      await page.mouse.move(cursor.x, cursor.y)
      await page.mouse.wheel(0, -240)
      await page.waitForTimeout(400)
      const after = await viewport(page)
      const flowBox = await box(page, '.react-flow')
      const screen = { x: flowBox.x + after.x + flowPoint.x * after.zoom, y: flowBox.y + after.y + flowPoint.y * after.zoom }
      const zoomAfter = await zoomPercent(page)
      const block = await box(page, BLOCK('st-hp-root'))
      const blockPoint = { x: block.x + block.width * 0.3, y: block.y + block.height * 0.5 }

      assert(zoomAfter > zoomBefore, `zoom ${zoomBefore}% → ${zoomAfter}%`)
      assert(near(screen.x, cursor.x, 2) && near(screen.y, cursor.y, 2), `flow point drifted to ${screen.x},${screen.y} (cursor ${cursor.x},${cursor.y})`)
      assert(near(blockPoint.x, cursor.x, 2) && near(blockPoint.y, cursor.y, 2), `block point drifted to ${blockPoint.x},${blockPoint.y}`)

      for (let i = 0; i < 12; i += 1) {
        await page.mouse.wheel(0, -400)
      }

      await page.waitForTimeout(300)
      const max = await zoomPercent(page)

      for (let i = 0; i < 20; i += 1) {
        await page.mouse.wheel(0, 400)
      }

      await page.waitForTimeout(300)
      const min = await zoomPercent(page)

      assert(max === 250 && min === 30, `clamp ${min}%..${max}%`)
      facts.wheel = { zoomBefore, zoomAfter, drift: { x: screen.x - cursor.x, y: screen.y - cursor.y }, clamp: [min, max] }
      await clickToolbar(page, 'session-tree-fit')

      return facts.wheel
    })

    await check('toolbar −, %, + and Fit change the zoom', async () => {
      await clickToolbar(page, 'session-tree-zoom-level')
      assert((await zoomPercent(page)) === 100, '% resets to 100')
      await clickToolbar(page, 'session-tree-zoom-in')
      const zin = await zoomPercent(page)
      await clickToolbar(page, 'session-tree-zoom-out')
      await clickToolbar(page, 'session-tree-zoom-out')
      const zout = await zoomPercent(page)

      assert(zin === 120 && zout === 83, `+ ${zin}%, −− ${zout}%`)
      await clickToolbar(page, 'session-tree-fit')

      return { zin, zout, fit: await zoomPercent(page) }
    })

    await check('R3: middle-drag pans; no autoscroll or paste (mousedown/mouseup/auxclick default prevented)', async () => {
      await page.evaluate(() => {
        const w = window as unknown as { __stMiddle: string[]; __stPaste: number }

        w.__stMiddle = []
        w.__stPaste = 0

        for (const type of ['mousedown', 'mouseup', 'auxclick']) {
          window.addEventListener(
            type,
            event => {
              if ((event as MouseEvent).button === 1) {
                // Read after every listener (ours runs in the canvas capture phase) has run.
                window.setTimeout(() => w.__stMiddle.push(`${type}:${event.defaultPrevented}`), 0)
              }
            },
            true
          )
        }

        document.addEventListener('paste', () => (w.__stPaste += 1), true)
      })
      const spot = await emptySpot(page)
      const before = await viewport(page)
      const scrollBefore = await page.evaluate(() => [document.scrollingElement?.scrollTop ?? 0, document.querySelector('.react-flow')!.scrollTop])

      await drag(page, spot, { x: 140, y: 90 }, { button: 'middle' })
      await page.waitForTimeout(300)
      const after = await viewport(page)
      const scrollAfter = await page.evaluate(() => [document.scrollingElement?.scrollTop ?? 0, document.querySelector('.react-flow')!.scrollTop])
      const middle = await page.evaluate(() => (window as unknown as { __stMiddle: string[] }).__stMiddle)
      const pastes = await page.evaluate(() => (window as unknown as { __stPaste: number }).__stPaste)

      assert(near(after.x - before.x, 140, 3) && near(after.y - before.y, 90, 3), `pan ${after.x - before.x},${after.y - before.y}`)
      assert(middle.includes('mousedown:true') && middle.includes('mouseup:true'), `middle events ${middle}`)
      assert(!middle.some(entry => entry.endsWith(':false')), `a middle event was not prevented: ${middle}`)
      assert(pastes === 0, `${pastes} paste events`)
      assert(JSON.stringify(scrollBefore) === JSON.stringify(scrollAfter), `scroll ${scrollBefore} → ${scrollAfter}`)

      return { pan: { x: after.x - before.x, y: after.y - before.y }, middle }
    })

    await check('R3 + card 9: a left-drag on empty canvas does not pan; it draws a selection box, and a box around no block leaves nothing selected', async () => {
      await page.locator(BLOCK('st-hp-root')).click()
      await page.locator('[data-testid="session-tree-inspector"][data-selected-id="st-hp-root"]').waitFor({ timeout: 5000 })
      const spot = await emptySpot(page)
      const before = await viewport(page)

      await page.mouse.move(spot.x, spot.y)
      await page.mouse.down()
      await page.mouse.move(spot.x + 60, spot.y + 35, { steps: 10 })
      await page.mouse.move(spot.x + 120, spot.y + 70, { steps: 10 })
      const drawn = await page.evaluate(() => (document.querySelector('.react-flow__selection')?.getBoundingClientRect().width ?? 0) > 2)

      await page.mouse.up()
      await page.waitForTimeout(300)
      const after = await viewport(page)
      const selected = await page.getAttribute('[data-testid="session-tree-inspector"]', 'data-selected-id')
      const count = await page.getAttribute('[data-testid="session-tree-canvas"]', 'data-selected-count')

      assert(after.x === before.x && after.y === before.y, `viewport moved ${after.x - before.x},${after.y - before.y}`)
      assert(drawn, 'no selection box was drawn')
      assert(selected === '' && count === '0', `selection kept: ${selected} (${count})`)

      return { selected, drawn }
    })

    await check('R3: Space + left-drag pans (trackpad fallback)', async () => {
      const spot = await emptySpot(page)
      const before = await viewport(page)

      await page.mouse.move(spot.x, spot.y)
      await page.keyboard.down('Space')
      await page.waitForTimeout(100)
      await drag(page, spot, { x: -110, y: 60 })
      await page.keyboard.up('Space')
      await page.waitForTimeout(300)
      const after = await viewport(page)

      assert(near(after.x - before.x, -110, 3) && near(after.y - before.y, 60, 3), `pan ${after.x - before.x},${after.y - before.y}`)
      await clickToolbar(page, 'session-tree-fit')

      return { pan: { x: after.x - before.x, y: after.y - before.y } }
    })

    await check('R3: Space + left-drag that starts on a block pans; the block does not move (NB2)', async () => {
      const block = await box(page, BLOCK('st-sys-tip'))
      const start = { x: block.x + 40, y: block.y + block.height / 2 }
      const before = await viewport(page)
      const position = await flowPosition(page, 'st-sys-tip')

      await page.mouse.move(start.x, start.y)
      await page.keyboard.down('Space')
      await page.waitForTimeout(100)
      await drag(page, start, { x: 100, y: 60 })
      await page.keyboard.up('Space')
      await page.waitForTimeout(300)
      const after = await viewport(page)
      const moved = await flowPosition(page, 'st-sys-tip')

      assert(near(after.x - before.x, 100, 3) && near(after.y - before.y, 60, 3), `pan ${after.x - before.x},${after.y - before.y}`)
      assert(moved.x === position.x && moved.y === position.y, `block moved ${moved.x - position.x},${moved.y - position.y}`)
      // Space released: the block drags again.
      const again = await box(page, BLOCK('st-sys-tip'))

      await drag(page, { x: again.x + 40, y: again.y + again.height / 2 }, { x: 0, y: 64 })
      await page.waitForTimeout(300)
      const dragged = await flowPosition(page, 'st-sys-tip')

      assert(dragged.y > position.y + 30, `no block drag after Space: ${dragged.y - position.y}`)
      await clickToolbar(page, 'session-tree-rearrange')
      await page.waitForTimeout(300)

      return { pan: { x: after.x - before.x, y: after.y - before.y }, blockMoved: { x: moved.x - position.x, y: moved.y - position.y } }
    })

    await check('R3: Alt + left-drag pans (a laptop touchpad has no middle button); the selection stays', async () => {
      await page.locator(BLOCK('st-hp-root')).click()
      await page.locator('[data-testid="session-tree-inspector"][data-selected-id="st-hp-root"]').waitFor({ timeout: 5000 })
      const spot = await emptySpot(page)
      const before = await viewport(page)

      await page.mouse.move(spot.x, spot.y)
      await page.keyboard.down('Alt')
      await page.waitForTimeout(100)
      await drag(page, spot, { x: 120, y: -70 })
      await page.keyboard.up('Alt')
      await page.waitForTimeout(300)
      const after = await viewport(page)
      const selected = await page.getAttribute('[data-testid="session-tree-inspector"]', 'data-selected-id')

      assert(near(after.x - before.x, 120, 3) && near(after.y - before.y, -70, 3), `pan ${after.x - before.x},${after.y - before.y}`)
      assert(selected === 'st-hp-root', `the selection changed: ${selected}`)

      // Alt released: a plain left-drag on empty canvas does not pan.
      const plain = await emptySpot(page)

      await drag(page, plain, { x: 90, y: 40 })
      await page.waitForTimeout(300)
      const still = await viewport(page)

      assert(still.x === after.x && still.y === after.y, `a plain left-drag panned ${still.x - after.x},${still.y - after.y}`)
      await clickToolbar(page, 'session-tree-fit')

      return { pan: { x: after.x - before.x, y: after.y - before.y }, selected }
    })

    await check('R3: Alt + left-drag that starts on a block pans; the block does not move; with Alt released it drags again', async () => {
      const block = await box(page, BLOCK('st-sys-tip'))
      const start = { x: block.x + 40, y: block.y + block.height / 2 }
      const before = await viewport(page)
      const position = await flowPosition(page, 'st-sys-tip')

      await page.mouse.move(start.x, start.y)
      await page.keyboard.down('Alt')
      await page.waitForTimeout(100)
      await drag(page, start, { x: -90, y: 50 })
      await page.keyboard.up('Alt')
      await page.waitForTimeout(300)
      const after = await viewport(page)
      const moved = await flowPosition(page, 'st-sys-tip')

      assert(near(after.x - before.x, -90, 3) && near(after.y - before.y, 50, 3), `pan ${after.x - before.x},${after.y - before.y}`)
      assert(moved.x === position.x && moved.y === position.y, `block moved ${moved.x - position.x},${moved.y - position.y}`)
      const again = await box(page, BLOCK('st-sys-tip'))

      await drag(page, { x: again.x + 40, y: again.y + again.height / 2 }, { x: 0, y: 64 })
      await page.waitForTimeout(300)
      const dragged = await flowPosition(page, 'st-sys-tip')

      assert(dragged.y > position.y + 30, `no block drag after Alt: ${dragged.y - position.y}`)
      await clickToolbar(page, 'session-tree-rearrange')
      await page.waitForTimeout(300)

      return { pan: { x: after.x - before.x, y: after.y - before.y }, blockMoved: { x: moved.x - position.x, y: moved.y - position.y } }
    })

    await check('R4: snap on — a visible dot grid, the dropped position is a multiple of the grid; snap off — free', async () => {
      await clickToolbar(page, 'session-tree-snap')
      assert((await page.getAttribute('[data-testid="session-tree-snap"]', 'aria-pressed')) === 'true', 'snap not pressed')
      assert((await page.locator('.react-flow__background').count()) === 1, 'no dot grid with snap on')
      const grid = await page.$eval('.react-flow__background pattern', pattern => Number(pattern.getAttribute('width')))
      const zoom = (await viewport(page)).zoom

      assert(near(grid, GRID * zoom, 0.5), `grid pattern ${grid} ≠ ${GRID} × zoom ${zoom}`)
      const block = await box(page, BLOCK('st-sys-reply'))

      await drag(page, { x: block.x + 40, y: block.y + 10 }, { x: 37, y: 23 })
      await page.waitForTimeout(300)
      const snapped = await flowPosition(page, 'st-sys-reply')

      assert(snapped.x % GRID === 0 && snapped.y % GRID === 0, `snapped to ${snapped.x},${snapped.y}`)
      await clickToolbar(page, 'session-tree-snap')
      assert((await page.locator('.react-flow__background').count()) === 0, 'grid still shown with snap off')
      const again = await box(page, BLOCK('st-sys-reply'))
      const delta = { x: 13 * zoom, y: 7 * zoom }

      await drag(page, { x: again.x + 40, y: again.y + 10 }, delta)
      await page.waitForTimeout(300)
      const free = await flowPosition(page, 'st-sys-reply')

      assert(near(free.x - snapped.x, 13, 1.5) && near(free.y - snapped.y, 7, 1.5), `free drag moved ${free.x - snapped.x},${free.y - snapped.y}`)
      assert(free.x % GRID !== 0 || free.y % GRID !== 0, 'free drop landed on the grid')
      facts.snap = { snapped, free }

      return facts.snap
    })

    await check('R13: links redraw live while dragging; a drop onto another link triggers a detour around the block', async () => {
      // Make a clean link long: the cross-project family's child, far right on its own row.
      const child = await box(page, BLOCK('st-split-child'))

      await drag(page, { x: child.x + 30, y: child.y + 10 }, { x: 460, y: 0 })
      await page.waitForTimeout(400)
      const routed = await page.getAttribute('[data-testid="session-tree-link"][data-source="st-split-root"][data-target="st-split-child"]', 'data-detoured')

      assert(routed === 'false', 'the long link detours before anything is in its way')
      const parent = await box(page, BLOCK('st-split-root'))
      const far = await box(page, BLOCK('st-split-child'))
      const mover = await box(page, BLOCK('st-md-redline'))
      const before = await linkPath(page, 'st-md-tip', 'st-md-redline')
      let during = ''
      // Drop st-md-redline in the middle of the long link.
      const target = { x: (parent.x + parent.width + far.x) / 2 - mover.width / 2, y: (parent.y + far.y) / 2 }

      await drag(page, { x: mover.x + 30, y: mover.y + mover.height / 2 }, { x: target.x - mover.x, y: target.y - mover.y }, {
        hold: async () => {
          during = await linkPath(page, 'st-md-tip', 'st-md-redline')
        }
      })
      await page.waitForTimeout(500)
      const afterDrop = await linkPath(page, 'st-md-tip', 'st-md-redline')
      const detoured = await page.getAttribute('[data-testid="session-tree-link"][data-source="st-split-root"][data-target="st-split-child"]', 'data-detoured')
      const intrusions = await linkIntrusions(page, 'st-split-root', 'st-split-child')
      const all = await page.$$eval('[data-testid="session-tree-link"]', links => links.map(l => [l.getAttribute('data-source'), l.getAttribute('data-target')]))
      const everyLink: string[] = []

      for (const [source, target2] of all) {
        everyLink.push(...(await linkIntrusions(page, source!, target2!)).hits.map(hit => `${source}->${target2}: ${hit}`))
      }

      assert(during !== before, 'the dragged block\'s link did not redraw during the drag')
      assert(afterDrop !== before, 'link did not move with the block')
      assert(detoured === 'true', 'the crossed link did not detour')
      assert(intrusions.hits.length === 0, `detour enters ${intrusions.hits}`)
      assert(everyLink.length === 0, `links enter blocks: ${everyLink.join('; ')}`)
      await page.screenshot({ path: join(shots, 'core-dense-detour.png') })

      return { detoured, samples: intrusions.samples, links: all.length }
    })

    await check('Re-arrange recomputes the auto-layout', async () => {
      await clickToolbar(page, 'session-tree-rearrange')
      await page.waitForTimeout(400)
      const routing = await flowPosition(page, 'st-hp-routing')
      const root = await flowPosition(page, 'st-hp-root')

      assert(near(routing.x - root.x, 168 + 54, 0.5), `routing not back one column right: ${routing.x - root.x}`)
      assert((await page.getAttribute('[data-testid="session-tree-link"][data-source="st-hp-root"][data-target="st-hp-routing"]', 'data-detoured')) === 'false', 'still detoured')

      return { root, routing }
    })

    await check('the inspector shows the backend row values (st-sys-tip)', async () => {
      await page.locator(BLOCK('st-sys-tip')).click()
      const inspector = page.locator('[data-testid="session-tree-inspector"][data-selected-id="st-sys-tip"]')

      await inspector.waitFor({ timeout: 5000 })
      const row = rows.find(r => r.id === 'st-sys-tip')!
      const field = async (name: string) => (await inspector.locator(`[data-field="${name}"]`).innerText()).trim()
      const title = async (name: string) => inspector.locator(`[data-field="${name}"]`).getAttribute('title')

      assert((await field('id')) === row.id, 'id')
      assert((await field('title')) === row.title, 'title')
      assert((await field('project')) === 'syscanvas', `project ${await field('project')}`)
      assert((await field('messages')) === String(row.message_count), 'messages')
      assert((await field('tool-calls')) === String(row.tool_call_count ?? 0), 'tool calls')
      assert((await title('tokens-in')) === String(row.input_tokens) && (await field('tokens-in')) === compactNumber(row.input_tokens), 'tokens in')
      assert((await title('tokens-out')) === String(row.output_tokens) && (await field('tokens-out')) === compactNumber(row.output_tokens), 'tokens out')
      assert((await field('cost')) === costLabel(row.actual_cost_usd, row.estimated_cost_usd), 'cost')
      assert((await field('model')) === row.model, 'model')
      assert((await field('compression')).includes(`×${row.compacted_segments}`), 'compression')
      assert((await field('children-count')) === '3', 'children')
      const tags = await inspector.locator('[data-testid="session-tree-inspector-tags"] [data-tag]').evaluateAll(els => els.map(e => e.getAttribute('data-tag')))

      assert(tags.includes('compacted'), `tags ${tags}`)
      const segments = await inspector.locator('.st-seglist .st-mono').allInnerTexts()

      assert(JSON.stringify(segments) === JSON.stringify(row._lineage_ids), `segments ${segments}`)
      const enabled = await inspector.locator('[data-testid="session-tree-inspector-actions"] button').evaluateAll(els => els.every(e => !(e as HTMLButtonElement).disabled))

      // Card 3 wired the actions (scripts/e2e-actions.ts exercises them).
      assert(enabled, 'action buttons are disabled on an in-scope session')

      return { id: row.id, messages: row.message_count, tokensIn: row.input_tokens, cost: row.estimated_cost_usd, segments }
    })

    await check('selection highlights the ancestor and descendant paths', async () => {
      await page.locator(BLOCK('st-sys-comments')).click()
      await page.waitForTimeout(200)
      const lit = await page.$$eval('[data-testid="session-tree-link"][data-highlighted="true"]', links =>
        links.map(l => `${l.getAttribute('data-source')}->${l.getAttribute('data-target')}`).sort()
      )
      const lineage = await page.$$eval('[data-testid="session-tree-block"][data-lineage="true"]', els => els.map(e => e.getAttribute('data-session-id')).sort())
      const stroke = await page.$eval(
        '[data-testid="session-tree-link"][data-highlighted="true"] path.react-flow__edge-path',
        p => getComputedStyle(p).strokeWidth
      )

      assert(JSON.stringify(lit) === JSON.stringify(['st-sys-comments->st-sys-reply', 'st-sys-tip->st-sys-comments']), `lit ${lit}`)
      assert(JSON.stringify(lineage) === JSON.stringify(['st-sys-reply', 'st-sys-tip']), `lineage ${lineage}`)
      assert(stroke === '1.6px', `highlight stroke ${stroke}`)

      return { lit, lineage }
    })

    await check('singles live in the inspector list (R8); Show all puts them on the canvas', async () => {
      const singles = await page.$$eval('[data-testid="session-tree-singles"] [data-node-id]', els => els.map(e => e.getAttribute('data-node-id')))

      assert(singles.length === 24 && singles.every(id => id?.startsWith('st-single-')), `singles ${singles.length}`)
      assert((await page.locator(BLOCK('st-single-00')).count()) === 0, 'a single is on the canvas')
      await clickToolbar(page, 'session-tree-show-all')
      await page.locator(BLOCK('st-single-00')).waitFor({ timeout: 5000 })
      const count = await page.getAttribute('[data-testid="session-tree-page"]', 'data-canvas-count')

      await clickToolbar(page, 'session-tree-show-all')
      await page.locator(BLOCK('st-single-00')).waitFor({ state: 'detached', timeout: 5000 })

      return { singles: singles.length, canvasWithAll: count }
    })

    // Card-2 r2 carry-forward 3: this check runs before any other Show archived toggle, so the
    // archived query is not cached yet (a cached query would hide a remount and a re-fit).
    await check('R9: toggling Show archived keeps the canvas mounted — viewport, selection and inspector persist, no "Loading sessions…" (NB4)', async () => {
      await page.locator(BLOCK('st-sys-tip')).click()
      await page.locator('[data-testid="session-tree-inspector"][data-selected-id="st-sys-tip"]').waitFor({ timeout: 5000 })
      const spot = await emptySpot(page)

      await drag(page, spot, { x: 90, y: 50 }, { button: 'middle' })
      await page.waitForTimeout(300)
      const before = await viewport(page)

      // Record any appearance of the loading state, however brief.
      await page.evaluate(() => {
        const w = window as unknown as { __stLoadingSeen: number; __stObserver?: MutationObserver }

        w.__stLoadingSeen = document.querySelector('[data-testid="session-tree-loading"]') ? 1 : 0
        w.__stObserver = new MutationObserver(() => {
          if (document.querySelector('[data-testid="session-tree-loading"]')) {
            w.__stLoadingSeen += 1
          }
        })
        w.__stObserver.observe(document.body, { childList: true, subtree: true })
      })
      await clickToolbar(page, 'session-tree-show-archived')
      await page.locator('[data-testid="session-tree-singles"] [data-node-id="st-archived-0"]').waitFor({ timeout: 15_000 })
      const during = await viewport(page)

      await clickToolbar(page, 'session-tree-show-archived')
      await page.locator('[data-testid="session-tree-singles"] [data-node-id="st-archived-0"]').waitFor({ state: 'detached', timeout: 15_000 })
      await page.waitForTimeout(300)
      const after = await viewport(page)
      const seen = await page.evaluate(() => {
        const w = window as unknown as { __stLoadingSeen: number; __stObserver?: MutationObserver }

        w.__stObserver?.disconnect()

        return w.__stLoadingSeen
      })
      const selected = await page.getAttribute('[data-testid="session-tree-inspector"]', 'data-selected-id')

      for (const [name, view] of [['archived on', during], ['archived off', after]] as const) {
        assert(near(view.x, before.x, 1) && near(view.y, before.y, 1) && near(view.zoom, before.zoom, 0.001), `${name}: viewport ${JSON.stringify(before)} → ${JSON.stringify(view)}`)
      }

      assert(seen === 0, `"Loading sessions…" appeared ${seen} time(s)`)
      assert(selected === 'st-sys-tip', `selection lost: ${selected}`)
      assert(await page.locator('[data-testid="session-tree-inspector"]').isVisible(), 'inspector hidden')
      await clickToolbar(page, 'session-tree-fit')

      return { viewport: before, after, loadingSeen: seen, selected }
    })

    await check('R9: Show archived adds the archived sessions greyed out; off hides them again', async () => {
      await clickToolbar(page, 'session-tree-show-archived')
      await page.locator('[data-testid="session-tree-singles"] [data-node-id="st-archived-0"]').waitFor({ timeout: 15_000 })
      await clickToolbar(page, 'session-tree-show-all')
      const archived = page.locator(BLOCK('st-archived-0'))

      await archived.waitFor({ timeout: 5000 })
      const look = await archived.evaluate(el => ({ archived: el.getAttribute('data-archived'), opacity: getComputedStyle(el).opacity, border: getComputedStyle(el).borderStyle }))

      assert(look.archived === 'true' && Number(look.opacity) < 1 && look.border === 'dashed', `archived look ${JSON.stringify(look)}`)
      await clickToolbar(page, 'session-tree-show-all')
      await clickToolbar(page, 'session-tree-show-archived')
      await page.locator('[data-testid="session-tree-singles"] [data-node-id="st-archived-0"]').waitFor({ state: 'detached', timeout: 15_000 })

      return look
    })

    await check('R10: the profile filter switches to another profile and to All profiles', async () => {
      await setProfile(page, 'work')
      await page.locator('[data-testid="session-tree-singles"] [data-node-id="st-work-0000"]').waitFor({ timeout: 20_000 })
      const work = await page.$$eval('[data-testid="session-tree-singles"] [data-node-id]', els => els.map(e => e.getAttribute('data-node-id')).sort())

      assert(JSON.stringify(work) === JSON.stringify(['st-work-0000', 'st-work-0001', 'st-work-0002']), `work ${work}`)
      assert((await page.locator('[data-testid="session-tree-block"]').count()) === 0, 'default blocks shown for work')
      await setProfile(page, '*')
      await page.locator(BLOCK('st-sys-tip')).waitFor({ timeout: 20_000 })
      const both = await page.$$eval('[data-testid="session-tree-singles"] [data-node-id]', els => els.map(e => e.getAttribute('data-node-id')))

      assert(both.includes('st-work-0001') && both.includes('st-single-00'), 'All profiles lacks a profile')
      await setProfile(page, 'default')
      await page.locator(BLOCK('st-sys-tip')).waitFor({ timeout: 20_000 })

      return { work, all: both.length }
    })

    // Card-2 r2 carry-forward 2/3: real input only (a real click on the select, then the keyboard);
    // `selectOption` never focuses the select, so it could not catch the bug.
    await check('R3: the profile select gives Space back — closed with Escape (no change) and after a keyboard change, Space + left-drag pans (NB5)', async () => {
      const select = page.locator('[data-testid="session-tree-profile"]')
      const active = () => page.evaluate(() => document.activeElement?.tagName ?? '')

      const spacePan = async (by: { x: number; y: number }) => {
        const spot = await emptySpot(page)
        const before = await viewport(page)

        await page.mouse.move(spot.x, spot.y)
        await page.keyboard.down('Space')
        await page.waitForTimeout(100)
        await drag(page, spot, by)
        await page.keyboard.up('Space')
        await page.waitForTimeout(300)
        const after = await viewport(page)

        return { x: after.x - before.x, y: after.y - before.y }
      }

      // 1. A real click opens the list; Escape closes it with no change: the select keeps the focus.
      await select.click()
      await page.waitForTimeout(300)
      await page.keyboard.press('Escape')
      await page.waitForTimeout(300)
      const afterEscape = await active()
      const unchanged = await select.inputValue()
      const pan1 = await spacePan({ x: 80, y: -50 })

      assert(unchanged === 'default', `Escape changed the profile to ${unchanged}`)
      assert(near(pan1.x, 80, 3) && near(pan1.y, -50, 3), `after Escape (focus ${afterEscape}): pan ${pan1.x},${pan1.y}`)
      await clickToolbar(page, 'session-tree-fit')

      // 2. A keyboard change on the focused select (click, Escape, then type "w" → work), and back.
      await select.click()
      await page.waitForTimeout(300)
      await page.keyboard.press('Escape')
      await page.keyboard.press('w')
      await page.locator('[data-testid="session-tree-singles"] [data-node-id="st-work-0000"]').waitFor({ timeout: 20_000 })
      const afterChange = await active()

      await select.click()
      await page.waitForTimeout(300)
      await page.keyboard.press('Escape')
      await page.keyboard.press('d')
      await page.locator(BLOCK('st-sys-tip')).waitFor({ timeout: 20_000 })
      await page.waitForTimeout(300)
      const pan2 = await spacePan({ x: -60, y: 40 })

      assert(afterChange !== 'SELECT', 'the select kept the focus after a change')
      assert(near(pan2.x, -60, 3) && near(pan2.y, 40, 3), `after a keyboard change: pan ${pan2.x},${pan2.y}`)
      await clickToolbar(page, 'session-tree-fit')

      return { afterEscape, pan1, afterChange, pan2 }
    })

    await check('R5: in a project scope other projects are dimmed and read-only (no drag, menu, select, open) with the tooltip', async () => {
      await setScope(page, 'syscanvas')
      const dim = page.locator(BLOCK('st-hp-root'))

      assert((await dim.getAttribute('data-out-of-scope')) === 'true', 'st-hp-root not out of scope')
      assert(Number(await dim.evaluate(el => getComputedStyle(el).opacity)) < 0.5, 'not dimmed')
      // A family split across projects: the foreign member is a real, dimmed block.
      assert((await page.getAttribute(BLOCK('st-split-child'), 'data-out-of-scope')) === 'true', 'split child not dimmed')
      assert((await page.getAttribute(BLOCK('st-split-root'), 'data-out-of-scope')) === null, 'split root dimmed')
      const before = await flowPosition(page, 'st-hp-root')
      const dimBox = await box(page, BLOCK('st-hp-root'))

      await drag(page, { x: dimBox.x + 30, y: dimBox.y + 10 }, { x: 90, y: 60 })
      await page.waitForTimeout(300)
      const after = await flowPosition(page, 'st-hp-root')

      assert(after.x === before.x && after.y === before.y, `dimmed block moved ${after.x - before.x},${after.y - before.y}`)
      await page.mouse.click(dimBox.x + 30, dimBox.y + 10, { button: 'right' })
      await page.waitForTimeout(300)
      assert((await page.locator('[data-testid="session-tree-menu"]').count()) === 0, 'menu opened on a dimmed block')
      await page.mouse.click(dimBox.x + 30, dimBox.y + 10)
      await page.waitForTimeout(200)
      assert((await page.getAttribute('[data-testid="session-tree-inspector"]', 'data-selected-id')) === '', 'dimmed block selected')
      const tabsBefore = await page.getByRole('tab').count()
      const hashBefore = await page.evaluate(() => location.hash)

      await page.mouse.dblclick(dimBox.x + 30, dimBox.y + 10)
      await page.waitForTimeout(1500)
      assert((await page.getByRole('tab').count()) === tabsBefore && (await page.evaluate(() => location.hash)) === hashBefore, 'double-click opened something')
      // Hover anew (the pointer is already inside the block after the clicks): leave, then enter.
      await page.mouse.move(dimBox.x + dimBox.width + 120, dimBox.y - 60)
      await page.waitForTimeout(200)
      await page.mouse.move(dimBox.x + 40, dimBox.y + 12, { steps: 4 })
      const tooltip = page.locator('[data-testid="session-tree-tooltip"][data-node-id="st-hp-root"]')

      await tooltip.waitFor({ timeout: 5000 })
      const tip = (await tooltip.innerText()).trim()

      assert(tip === OUT_OF_SCOPE_TIP, `tooltip "${tip}"`)
      // An in-scope block still opens the (card-3) menu.
      const live = await box(page, BLOCK('st-sys-tip'))

      await page.mouse.click(live.x + 30, live.y + 10, { button: 'right' })
      await page.locator('[data-testid="session-tree-menu"][data-node-id="st-sys-tip"]').waitFor({ timeout: 5000 })
      await page.keyboard.press('Escape')
      await page.screenshot({ path: join(shots, 'core-dense-scope-light.png') })
      await setScope(page, 'All')

      return { tooltip: tip }
    })

    await check('R11: running status from the backend activity heuristic; the session open in the app is highlighted', async () => {
      seedFixtures(t, ['--activate', 'st-sys-pairing'])
      await page.waitForFunction(
        () => document.querySelector('[data-session-id="st-sys-pairing"]')?.getAttribute('data-status') === 'running',
        undefined,
        { timeout: 30_000 }
      )
      const dot = await page.$eval('[data-session-id="st-sys-pairing"] .st-dot', el => getComputedStyle(el).backgroundColor)

      return { status: 'running', dot }
    })

    await check('live refresh: seeded branches appear inside their own project band, overlap nothing; existing blocks keep their positions (B1)', async () => {
      // A user-placed block first, so "keeps positions" covers a dragged block too.
      const moved = await box(page, BLOCK('st-md-katex'))

      await drag(page, { x: moved.x + 30, y: moved.y + 10 }, { x: 60, y: 40 })
      await page.waitForTimeout(300)
      const before = await allFlowPositions(page)
      const stamp = Date.now()
      const liveId = `st-live-${stamp}`
      const sysLiveId = `st-live-sys-${stamp}`
      const seeded = seedFixtures(t, ['--branch', liveId, 'st-hp-root', 'Live refresh probe']) as { created: boolean }
      const started = Date.now()

      await page.locator(BLOCK(liveId)).waitFor({ timeout: 30_000 })
      const ms = Date.now() - started

      await page.waitForTimeout(300)
      const after = await allFlowPositions(page)
      const moves = Object.entries(before).filter(([id, point]) => point && after[id] && (after[id].x !== point.x || after[id].y !== point.y))

      assert(seeded.created, 'the live branch already existed')
      assert(!(liveId in before), 'the live branch was drawn before it was seeded')
      assert(moves.length === 0, `blocks moved: ${JSON.stringify(moves)}`)
      assert((await page.getAttribute(`[data-testid="session-tree-link"][data-target="${liveId}"]`, 'data-source')) === 'st-hp-root', 'new branch not linked')
      const hp = await bandPlacement(page, liveId)

      assert(hp.project === (await page.getAttribute(BLOCK('st-hp-root'), 'data-project-id')), `project ${hp.project}`)
      assertInBand(hp, liveId)

      // A second one, under the syscanvas tip (its column has no free row in the band).
      const sysSeeded = seedFixtures(t, ['--branch', sysLiveId, 'st-sys-tip', 'Live refresh probe (syscanvas)']) as { created: boolean }

      await page.locator(BLOCK(sysLiveId)).waitFor({ timeout: 30_000 })
      await page.waitForTimeout(300)
      const afterSys = await allFlowPositions(page)
      const movesSys = Object.entries(after).filter(([id, point]) => point && afterSys[id] && (afterSys[id].x !== point.x || afterSys[id].y !== point.y))
      const sys = await bandPlacement(page, sysLiveId)

      assert(sysSeeded.created, 'the syscanvas live branch already existed')
      assert(movesSys.length === 0, `blocks moved: ${JSON.stringify(movesSys)}`)
      assert(sys.project === (await page.getAttribute(BLOCK('st-sys-tip'), 'data-project-id')), `project ${sys.project}`)
      assertInBand(sys, sysLiveId)
      await clickToolbar(page, 'session-tree-fit')
      await page.screenshot({ path: join(shots, 'live-placement-all-light.png') })

      // The syscanvas scope has its own layout: the new blocks land in its bands too.
      await setScope(page, 'syscanvas')
      const scoped = { hp: await bandPlacement(page, liveId), sys: await bandPlacement(page, sysLiveId) }

      assertInBand(scoped.hp, `${liveId} (syscanvas scope)`)
      assertInBand(scoped.sys, `${sysLiveId} (syscanvas scope)`)
      await page.screenshot({ path: join(shots, 'live-placement-scope-light.png') })
      await page.emulateMedia({ colorScheme: 'dark' })
      await page.waitForTimeout(600)
      await page.screenshot({ path: join(shots, 'live-placement-scope-dark.png') })
      await setScope(page, 'All')
      await page.screenshot({ path: join(shots, 'live-placement-all-dark.png') })
      await page.emulateMedia({ colorScheme: 'light' })
      await page.waitForTimeout(500)
      facts.liveRefreshMs = ms
      facts.livePlacement = { hp, sys, scoped }

      return {
        created: seeded.created,
        appearedAfterMs: ms,
        unchanged: Object.keys(before).length,
        hp: { at: hp.block, band: [hp.top, hp.bottom], label: hp.label },
        sys: { at: sys.block, band: [sys.top, sys.bottom], label: sys.label }
      }
    })

    await check('light/dark: blocks paint from the theme variables; screenshots of all projects and one project', async () => {
      await clickToolbar(page, 'session-tree-fit')
      const light = await themeProbe(page)

      assert(light.actual === light.expected, `light ${JSON.stringify(light)}`)
      await page.screenshot({ path: join(shots, 'core-dense-all-light.png') })
      await page.emulateMedia({ colorScheme: 'dark' })
      await page.waitForTimeout(800)
      const dark = await themeProbe(page)

      assert(dark.actual === dark.expected && dark.actual !== light.actual, `dark ${JSON.stringify(dark)}`)
      await page.locator(BLOCK('st-sys-reply')).click()
      await page.screenshot({ path: join(shots, 'core-dense-all-dark.png') })
      await setScope(page, 'mdesign')
      await page.screenshot({ path: join(shots, 'core-dense-scope-dark.png') })
      await setScope(page, 'All')
      await page.emulateMedia({ colorScheme: 'light' })
      await page.waitForTimeout(500)

      return { light: light.actual, dark: dark.actual }
    })

    await check('500-session fixture: time to first render, and a scripted 2 s middle-drag pan at ≥ 45 fps', async () => {
      await openTree(s)
      await clickToolbar(page, 'session-tree-show-all')
      const started = Date.now()

      await setProfile(page, 'scale')
      await waitCanvasCount(page, 500, 60_000)
      await page.locator('[data-testid="session-tree-block"][data-session-id^="st-scale-"]').first().waitFor({ timeout: 60_000 })
      const firstRenderMs = Date.now() - started
      const rendered = await page.locator('[data-testid="session-tree-block"]').count()

      await page.screenshot({ path: join(shots, 'core-dense-scale.png') })
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
      const vpBefore = await viewport(page)

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
      const vpAfter = await viewport(page)
      const fps = Math.round((frames / elapsed) * 1000 * 10) / 10

      assert(vpAfter.x !== vpBefore.x || vpAfter.y !== vpBefore.y, 'the pan did not move the view')
      assert(fps >= 45, `${fps} fps`)
      facts.scale = { firstRenderMs, renderedInDom: rendered, panMs: elapsed, frames, fps, moves: i }
      await setProfile(page, 'default')
      await clickToolbar(page, 'session-tree-show-all')

      return facts.scale
    })

    await check('R2/R11: double-click opens the session in a new tab (tab, focused session route) and its block shows as open', async () => {
      if ((await page.locator('[data-testid="session-tree-profile"]').inputValue()) !== 'default') {
        await setProfile(page, 'default')
      }

      await page.locator(BLOCK('st-hp-routing')).waitFor({ timeout: 20_000 })
      const tabsBefore = await page.getByRole('tab').count()
      const hashBefore = await page.evaluate(() => location.hash)

      await page.locator(BLOCK('st-hp-routing')).dblclick()
      await page.waitForFunction(before => document.querySelectorAll('[role="tab"]').length > before, tabsBefore, { timeout: 20_000 })
      await page.waitForTimeout(800)
      const tabs = await page.getByRole('tab').allInnerTexts()
      const state = await page.evaluate(() => {
        const host = (globalThis as unknown as { __HERMES_PLUGIN_SDK__: { host: { state: Record<string, { get(): unknown }> } } }).__HERMES_PLUGIN_SDK__.host

        return { focusedStoredSessionId: host.state.focusedStoredSessionId.get(), hash: location.hash }
      })

      assert(tabs.some(text => /edge routing/i.test(text)), `no tab for the session: ${JSON.stringify(tabs)}`)
      // A `tab` open stacks a session tab beside the page (the page keeps the main route) and
      // focuses it: the app's focused stored session is the opened one.
      assert(state.focusedStoredSessionId === 'st-hp-routing', `focused ${state.focusedStoredSessionId}`)
      assert(state.hash === hashBefore, `the page route changed to ${state.hash}`)
      await page.waitForFunction(() => document.querySelector('[data-session-id="st-hp-routing"]')?.getAttribute('data-open') === 'true', undefined, {
        timeout: 10_000
      })
      const ring = await page.$eval(BLOCK('st-hp-routing'), el => getComputedStyle(el).boxShadow)

      assert(ring !== 'none', 'the open block has no highlight')
      facts.openTab = { tabsBefore, tabs, ...state }

      return facts.openTab
    })

    await check('no page errors from the plugin', () => {
      assert(s.errors.length === 0, s.errors.join('\n'))
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

  writeFileSync(join(t.root, 'e2e-core-dense-facts.json'), `${JSON.stringify({ results, facts }, null, 2)}\n`)
  const failed = results.filter(r => !r.ok)

  console.log(`\ne2e-core-dense: ${results.length - failed.length} passed, ${failed.length} failed (screenshots: ${shots})`)
  process.exitCode = failed.length === 0 ? 0 : 1
}

await main()
