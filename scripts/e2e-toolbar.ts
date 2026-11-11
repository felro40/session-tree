/**
 * e2e — Session Tree: the toolbar at narrow widths (a split view), against the isolated test
 * Hermes. It seeds six more projects (`seed-fixtures.py --more-projects`, nine in all, like a
 * real PROJECTS pane), so it runs in its own fresh test home of the role (`c<card>-<role>-toolbar`,
 * the role's port block), the older one moved to the e2e trash. It installs the repo itself: the
 * committed `desktop/plugin.js`.
 *
 *   node scripts/e2e-toolbar.ts    (part of `npm run test:e2e`)
 *   KEEP_RUNNING=1 …               leaves the test gateway up afterwards
 *
 * For every style and every window width from 1600 px down to 360 px it reads the toolbar's
 * DOM geometry back: no two controls overlap, no control (and no project chip) is squeezed
 * below its own content, every control lies inside the bar (nothing clipped), and the canvas
 * starts below the bar. The scope strip, when longer than its room, scrolls: a plain wheel over
 * it scrolls it sideways (the canvas zoom stays), and the selected project stays in view when
 * the window narrows. Input is real (page.mouse → CDP Input.*). Screenshots go to
 * <test root>/shots/.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Page } from 'playwright-core'

import { close, enableDesktopHalf, launch, signIn } from './e2e/browser.ts'
import { assert, freshHome, openTree, PAGE, portsFree, sleep, suite, switchStyle, viewport } from './e2e/common.ts'
import { seedFixtures, setup, signInLink, stopGateway, testHermes, webappBase } from './e2e/harness.ts'
import { diffSnapshots, snapshotRealHermes } from './e2e/real-hermes-guard.ts'

const t = testHermes(undefined, { variant: 'toolbar' })
const shots = join(t.root, 'shots')
const { results, facts, check, onFailure } = suite()

const WIDTHS = [1600, 1440, 1280, 1135, 1024, 900, 800, 700, 600, 500, 420, 360]
const STYLES = ['dense', 'swimlanes', 'rich', 'subway']
const SCOPE = '[data-testid="session-tree-scope"]'
const BAR = '[data-testid="session-tree-toolbar"]'

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

interface BarGeometry {
  bar: Rect
  canvasTop: number
  canvasHeight: number
  scope: Rect & { scrollWidth: number; clientWidth: number; scrollLeft: number }
  controls: { name: string; rect: Rect; overflow: number }[]
  chips: { name: string; rect: Rect; overflow: number }[]
  selects: { name: string; text: string; room: number; needed: number }[]
}

/** The toolbar's geometry: its controls (brand, selects, buttons), the scope strip and its chips. */
async function barGeometry(page: Page): Promise<BarGeometry> {
  return page.evaluate(([barSelector, scopeSelector]) => {
    const bar = document.querySelector(barSelector) as HTMLElement
    const scope = bar.querySelector(scopeSelector) as HTMLElement
    const rect = (el: Element) => {
      const b = el.getBoundingClientRect()

      return { x: b.x, y: b.y, w: b.width, h: b.height }
    }
    const visible = (el: Element) => (el as HTMLElement).offsetParent !== null && el.getBoundingClientRect().width > 0
    const name = (el: Element) => el.getAttribute('data-testid') ?? el.querySelector('[data-testid]')?.getAttribute('data-testid') ?? el.className
    const canvas = document.querySelector('[data-testid="session-tree-canvas"]')?.getBoundingClientRect()
    const measure = document.createElement('canvas').getContext('2d')!

    return {
      bar: rect(bar),
      canvasTop: canvas?.top ?? NaN,
      canvasHeight: canvas?.height ?? NaN,
      scope: { ...rect(scope), scrollWidth: scope.scrollWidth, clientWidth: scope.clientWidth, scrollLeft: scope.scrollLeft },
      controls: [...bar.querySelectorAll('.st-brand, .st-profile, .st-tb')]
        .filter(el => visible(el) && !scope.contains(el))
        .map(el => ({ name: name(el), rect: rect(el), overflow: el.scrollWidth - el.clientWidth })),
      chips: [...scope.querySelectorAll('button')].map(el => ({
        name: el.getAttribute('data-scope') ?? '?',
        rect: rect(el),
        overflow: el.scrollWidth - el.clientWidth
      })),
      selects: [...bar.querySelectorAll('select')].filter(visible).map(el => {
        const select = el as HTMLSelectElement
        const style = getComputedStyle(select)
        const text = select.selectedOptions[0]?.textContent ?? ''

        measure.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`

        return { name: name(select), text, room: select.clientWidth, needed: Math.ceil(measure.measureText(text).width) }
      })
    }
  }, [BAR, SCOPE] as const)
}

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5
const inside = (inner: Rect, outer: Rect) =>
  inner.x >= outer.x - 0.5 && inner.y >= outer.y - 0.5 && inner.x + inner.w <= outer.x + outer.w + 0.5 && inner.y + inner.h <= outer.y + outer.h + 0.5

/** What is wrong with the toolbar at this width (empty: nothing). */
function problems(g: BarGeometry): string[] {
  const out: string[] = []
  const boxes = [...g.controls, { name: 'scope strip', rect: g.scope, overflow: 0 }]

  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      if (overlaps(boxes[i].rect, boxes[j].rect)) {
        out.push(`${boxes[i].name} overlaps ${boxes[j].name}`)
      }
    }
  }

  for (const each of [...g.controls, ...g.chips]) {
    if (each.overflow > 1) {
      out.push(`${each.name} is squeezed: its content is ${each.overflow}px wider than its box`)
    }
  }

  for (let i = 1; i < g.chips.length; i += 1) {
    if (overlaps(g.chips[i - 1].rect, g.chips[i].rect)) {
      out.push(`chip ${g.chips[i - 1].name} overlaps chip ${g.chips[i].name}`)
    }
  }

  for (const each of boxes) {
    if (!inside(each.rect, g.bar)) {
      out.push(`${each.name} is clipped by the bar (${JSON.stringify(each.rect)} in ${JSON.stringify(g.bar)})`)
    }
  }

  for (const select of g.selects) {
    // The native arrow takes ~16 px of the select's box.
    if (select.needed + 14 > select.room) {
      out.push(`${select.name} cuts "${select.text}" (${select.needed}px text in a ${select.room}px select)`)
    }
  }

  if (g.scope.w < 60) {
    out.push(`the scope strip is only ${g.scope.w}px wide`)
  }

  if (!(g.canvasTop >= g.bar.y + g.bar.h - 0.5)) {
    out.push(`the canvas (top ${g.canvasTop}) starts above the bar's bottom ${g.bar.y + g.bar.h}`)
  }

  return out
}

/** The bar's rows: distinct vertical centres of its controls and the strip (items are centred in
 *  their line, so one line has one centre whatever their heights). */
const rowsOf = (g: BarGeometry) => {
  const centres = [...g.controls.map(each => each.rect), g.scope].map(rect => rect.y + rect.h / 2).sort((a, b) => a - b)

  return centres.filter((centre, i) => i === 0 || centre - centres[i - 1] > 4).length
}

/** The applied layout: lines, plus `-brand` / `-tools` when their text is given up. */
const layoutOf = (page: Page) =>
  page.$eval(BAR, bar => {
    const el = bar as HTMLElement

    return `${el.dataset.layout}${el.dataset.brand ? '-brand' : ''}${el.dataset.tools ? '-tools' : ''}`
  })

async function resize(page: Page, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 900 })
  await page.waitForTimeout(450)
}

// --- the suite ---------------------------------------------------------------------------------

async function main(): Promise<void> {
  const realBefore = snapshotRealHermes()

  // The role's other homes use the same ports: make sure they are not running.
  for (const variant of [undefined, 'actions', 'sync', 'swim', 'rich', 'subway', 'final']) {
    stopGateway(testHermes(undefined, variant ? { variant } : {}))
  }

  freshHome(t)
  console.log(`e2e toolbar — role ${t.role}, home ${t.home}`)
  const manifest = setup(t) as { seeded?: boolean }
  const more = seedFixtures(t, ['--more-projects']) as { created?: boolean }

  assert(manifest.seeded === true && more.created === true, 'the toolbar home was not freshly seeded')

  mkdirSync(shots, { recursive: true })
  const s = await launch({ colorScheme: 'dark' })
  const { page } = s
  let failures = 0

  onFailure(async () => {
    failures += 1
    await page.screenshot({ path: join(shots, `failure-${failures}.png`) }).catch(() => undefined)

    return `${await page.evaluate(selector => JSON.stringify({ hash: location.hash, style: document.querySelector(selector)?.getAttribute('data-style'), width: innerWidth }), PAGE)} (failure-${failures}.png)`
  })

  try {
    await check('sign in, enable the desktop half, open the page; the scope lists All + nine projects', async () => {
      await signIn(t, page)
      await enableDesktopHalf(t, page)
      await openTree(t, s)
      const scope = await page.$$eval(`${SCOPE} button[data-scope]`, buttons => buttons.map(b => b.textContent?.trim()))

      assert(scope.length >= 10, `scope: ${JSON.stringify(scope)}`)

      return { scope }
    })

    const table: Record<string, Record<number, { bar: string; layout: string; rows: number; scopeOverflows: boolean }>> = {}

    for (const style of STYLES) {
      await check(`${style}: at every width from 1600 to 360 px nothing in the toolbar overlaps, is squeezed or clipped, and the canvas starts below it`, async () => {
        await resize(page, 1440)
        await switchStyle(page, style)
        table[style] = {}
        const bad: string[] = []

        for (const width of WIDTHS) {
          await resize(page, width)
          const g = await barGeometry(page)

          table[style][width] = {
            bar: `${Math.round(g.bar.w)}×${Math.round(g.bar.h)}`,
            layout: await layoutOf(page),
            rows: rowsOf(g),
            scopeOverflows: g.scope.scrollWidth > g.scope.clientWidth + 1
          }

          for (const problem of problems(g)) {
            bad.push(`${width}px (bar ${Math.round(g.bar.w)}px): ${problem}`)
          }

          if ([1135, 900, 800, 500, 360].includes(width)) {
            await page.screenshot({ path: join(shots, `toolbar-${style}-${width}-dark.png`), clip: { x: 0, y: 0, width, height: 260 } })
          }
        }

        assert(bad.length === 0, bad.slice(0, 12).join('\n') + (bad.length > 12 ? `\n… ${bad.length - 12} more` : ''))

        return table[style]
      })
    }

    facts.widths = table

    await check('one row while everything fits (a 2400 px window); in a 1135 px split view (your screenshot) the strip gets its own row with every chip shown; the canvas keeps most of the window at every width', async () => {
      await resize(page, 2400)
      await switchStyle(page, 'dense')
      const wide = await barGeometry(page)
      const wideLayout = await layoutOf(page)

      // The page 1135 px wide: the window plus the app's sidebar.
      await resize(page, 1440)
      await resize(page, 1135 + 1440 - Math.round((await barGeometry(page)).bar.w))
      const split = await barGeometry(page)
      const splitLayout = await layoutOf(page)
      const heights: Record<number, number> = {}

      await page.screenshot({ path: join(shots, 'toolbar-dense-split-1135-dark.png'), clip: { x: 0, y: 0, width: page.viewportSize()!.width, height: 200 } })

      for (const width of WIDTHS) {
        await resize(page, width)
        heights[width] = Math.round((await barGeometry(page)).canvasHeight)
      }

      assert(wideLayout === 'row' && rowsOf(wide) === 1 && wide.bar.h <= 36, `2400 px: ${wideLayout}, ${rowsOf(wide)} rows, bar ${wide.bar.h}px`)
      assert(wide.scope.scrollWidth <= wide.scope.clientWidth + 1, 'at 2400 px the strip still scrolls')
      assert(Math.round(split.bar.w) === 1135, `the split page is ${split.bar.w}px`)
      assert(splitLayout === 'stacked' && rowsOf(split) === 2, `1135 px page: ${splitLayout}, ${rowsOf(split)} rows`)
      assert(split.chips.every(chip => inside(chip.rect, split.scope)), '1135 px page: a chip is hidden in the stacked strip')
      assert(Object.values(heights).every(h => h >= 600), `canvas heights ${JSON.stringify(heights)}`)

      return { wide: `${wideLayout} ${Math.round(wide.bar.h)}px`, split: `${splitLayout} ${Math.round(split.bar.h)}px`, canvasHeights: heights }
    })

    await check('a plain wheel over an overflowing scope strip scrolls it sideways; the canvas zoom stays', async () => {
      await resize(page, 700)
      const before = await barGeometry(page)

      assert(before.scope.scrollWidth > before.scope.clientWidth + 1, `the strip does not overflow at 700 px: ${before.scope.scrollWidth} / ${before.scope.clientWidth}`)
      const zoom = (await viewport(page)).zoom

      await page.mouse.move(before.scope.x + before.scope.w / 2, before.scope.y + before.scope.h / 2)
      await page.mouse.wheel(0, 240)
      await sleep(400)
      const after = await barGeometry(page)
      const zoomAfter = (await viewport(page)).zoom

      assert(after.scope.scrollLeft > before.scope.scrollLeft + 50, `scrollLeft ${before.scope.scrollLeft} → ${after.scope.scrollLeft}`)
      assert(Math.abs(zoomAfter - zoom) < 1e-6, `zoom ${zoom} → ${zoomAfter}`)
      await page.mouse.wheel(0, -2000)
      await sleep(300)

      return { scrollLeft: [before.scope.scrollLeft, after.scope.scrollLeft], zoom }
    })

    await check('the selected project stays in view: select the last chip, narrow the window, it is still inside the strip', async () => {
      await resize(page, 1600)
      const last = (await barGeometry(page)).chips.at(-1)!

      await page.locator(`${SCOPE} button[data-scope="${last.name}"]`).click()
      await page.waitForFunction(([selector, scope]) => document.querySelector(selector)?.getAttribute('data-scope') === scope, [PAGE, last.name] as const)
      const seen: Record<number, boolean> = {}

      for (const width of [1024, 800, 600, 420]) {
        await resize(page, width)
        const g = await barGeometry(page)
        const chip = g.chips.find(each => each.name === last.name)!

        seen[width] = inside(chip.rect, g.scope)
      }

      await page.locator(`${SCOPE} button[data-scope="all"]`).click()
      assert(Object.values(seen).every(Boolean), `selected chip ${last.name} in view: ${JSON.stringify(seen)}`)

      return { chip: last.name, seen }
    })

    await check('screenshots: light theme at 1135, 800 and 500 px', async () => {
      await page.emulateMedia({ colorScheme: 'light' })

      for (const width of [1135, 800, 500]) {
        await resize(page, width)
        await page.screenshot({ path: join(shots, `toolbar-dense-${width}-light.png`), clip: { x: 0, y: 0, width, height: 260 } })
      }

      await page.emulateMedia({ colorScheme: 'dark' })
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

    const { pids, busy } = portsFree(t)

    assert(pids.length === 0, `left running: ${pids}`)
    assert(busy.length === 0, `ports still bound: ${busy}`)
  })

  await check("the user's real Hermes is untouched (checkout status, dist-webapp mtimes, config/plugins sha)", () => {
    const changes = diffSnapshots(realBefore, snapshotRealHermes())

    assert(changes.length === 0, changes.join('; '))
  })

  writeFileSync(join(t.root, 'e2e-toolbar-facts.json'), `${JSON.stringify({ results, facts, base: webappBase(t) }, null, 2)}\n`)
  const failed = results.filter(r => !r.ok)

  console.log(`\ne2e-toolbar: ${results.length - failed.length} passed, ${failed.length} failed (screenshots: ${shots})`)
  process.exitCode = failed.length === 0 ? 0 : 1
}

await main()
