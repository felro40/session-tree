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
 * below its own content, every control lies inside the bar (nothing clipped), the canvas starts
 * below the bar, and the bar shows the layout it applied (row: one row with every chip shown,
 * stacked: two rows, wrapped: three). The same at fractional page widths (a sweep, then every
 * layout change again in 0.05 px steps) and under Hermes' UI scale (Settings → text size, CSS
 * `zoom` on <html>) at 80 / 90 / 110 / 125 %, where a page as wide in CSS px gets the layout it
 * gets at 100 % (review t_899e3936 B1, N1). The scope strip, when longer than its room, scrolls:
 * a plain wheel over it scrolls it sideways (Shift + wheel as far, N2; nothing else scrolls), and
 * the selected project stays in view when the window narrows. Input is real (page.mouse → CDP
 * Input.*). Screenshots go to <test root>/shots/.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Page } from 'playwright-core'

import { close, enableDesktopHalf, launch, signIn } from './e2e/browser.ts'
import { assert, freshHome, openTree, PAGE, portsFree, sleep, suite, switchStyle } from './e2e/common.ts'
import { seedFixtures, setup, signInLink, stopGateway, stopRoleHomes, testHermes, webappBase } from './e2e/harness.ts'
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

/** Below this page width (CSS px) a tool group wraps inside its own line, by design. */
const GROUP_WRAP_BELOW = 340
const LINES: Record<string, number> = { row: 1, stacked: 2, wrapped: 3 }

/** Whether the bar shows the layout it applied (empty: it does): its rows, and in one row every chip. */
function layoutProblems(g: BarGeometry, layout: string, pageWidth: number): string[] {
  const lines = layout.split('-')[0]
  const expected = LINES[lines]
  const rows = rowsOf(g)
  const out: string[] = []

  if (expected === undefined) {
    return [`no layout applied (${layout})`]
  }

  if (pageWidth >= GROUP_WRAP_BELOW ? rows !== expected : rows < expected) {
    out.push(`${layout} shows ${rows} rows, not ${expected}`)
  }

  if (lines === 'row' && g.scope.scrollWidth > g.scope.clientWidth + 1) {
    out.push(`one row with ${g.scope.scrollWidth - g.scope.clientWidth}px of chips hidden in the strip`)
  }

  return out
}

/** A layout's step as the page narrows: its lines, then the text it gives up. Never goes down. */
const stepOf = (layout: string) => LINES[layout.split('-')[0]] * 10 + (layout.includes('-brand') ? 1 : 0) + (layout.includes('-tools') ? 2 : 0)

/** Sets the plugin page to `width` CSS px (fractional too: a split view, the app's own zoom), or
 *  back to its own width (`null`), and waits two frames for the toolbar to lay itself out. */
async function setPageWidth(page: Page, width: null | number): Promise<void> {
  await page.evaluate(
    async ([selector, to]) => {
      const root = document.querySelector(selector) as HTMLElement

      if (to === null) {
        for (const property of ['flex', 'width', 'max-width']) {
          root.style.removeProperty(property)
        }
      } else {
        root.style.flex = 'none'
        root.style.width = `${to}px`
        root.style.maxWidth = `${to}px`
      }

      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(null))))
    },
    [PAGE, width] as const
  )
}

interface Sample {
  width: number
  layout: string
  problems: string[]
}

/** The applied layout and what is wrong with the bar at one page width (CSS px). */
async function sampleAt(page: Page, width: number): Promise<Sample> {
  await setPageWidth(page, width)
  const g = await barGeometry(page)
  const layout = await layoutOf(page)

  return { width, layout, problems: [...problems(g), ...layoutProblems(g, layout, width)] }
}

/** Steps that go back (a wider layout at a narrower width) in samples sorted widest first. */
function stepsBack(samples: readonly Sample[]): string[] {
  const out: string[] = []

  for (let i = 1; i < samples.length; i += 1) {
    if (stepOf(samples[i].layout) < stepOf(samples[i - 1].layout)) {
      out.push(`${samples[i].width}px: ${samples[i].layout} after ${samples[i - 1].layout} at ${samples[i - 1].width}px`)
    }
  }

  return out
}

/** Hermes' UI scale (Settings → text size): CSS `zoom` on <html>, through the app's own bridge. */
async function setUiScale(page: Page, percent: number): Promise<void> {
  await page.evaluate(to => (window as unknown as { hermesDesktop: { zoom: { setPercent(p: number): void } } }).hermesDesktop.zoom.setPercent(to), percent)
  await sleep(300)
}

// --- the suite ---------------------------------------------------------------------------------

async function main(): Promise<void> {
  const realBefore = snapshotRealHermes()

  // The role's other homes use the same ports: make sure they are not running.
  stopRoleHomes(t)

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

          for (const problem of [...problems(g), ...layoutProblems(g, table[style][width].layout, g.bar.w)]) {
            bad.push(`${width}px (bar ${Math.round(g.bar.w)}px): ${problem}`)
          }

          if ([1135, 900, 800, 500, 360].includes(width)) {
            await page.screenshot({ path: join(shots, `toolbar-${style}-${width}-dark.png`), clip: { x: 0, y: 0, width, height: 260 } })
          }
        }

        // In the bar's own width: below ~640 px the app hides its sidebar, so the page gets wider.
        bad.push(...stepsBack(WIDTHS.map(width => ({ width: Number(table[style][width].bar.split('×')[0]), layout: table[style][width].layout, problems: [] })).sort((a, b) => b.width - a.width)))
        assert(bad.length === 0, bad.slice(0, 12).join('\n') + (bad.length > 12 ? `\n… ${bad.length - 12} more` : ''))

        return table[style]
      })
    }

    facts.widths = table

    // Review t_899e3936 N1: a page width is often fractional (the app's zoom, a percentage split).
    const sweeps: Record<string, Sample[]> = {}

    for (const style of STYLES) {
      await check(`${style}: page widths 1400 → 340 px every 2 px, and every layout change again every 0.05 px: the bar shows the layout it applied (row: one row, every chip shown; stacked: 2 rows; wrapped: 3), nothing overlaps, is squeezed or clipped, and it only ever steps on as the page narrows`, async () => {
        await resize(page, 2400)
        await switchStyle(page, style)
        const coarse: Sample[] = []
        const fine: Sample[] = []

        try {
          for (let width = 1400; width >= 340; width -= 2) {
            coarse.push(await sampleAt(page, width))
          }

          for (let i = 1; i < coarse.length; i += 1) {
            if (coarse[i].layout !== coarse[i - 1].layout) {
              for (let n = 1; n < 40; n += 1) {
                fine.push(await sampleAt(page, Math.round((coarse[i - 1].width - n * 0.05) * 100) / 100))
              }
            }
          }
        } finally {
          await setPageWidth(page, null)
        }

        sweeps[style] = coarse
        const all = [...coarse, ...fine].sort((a, b) => b.width - a.width)
        const bad = [...all.flatMap(one => one.problems.map(problem => `${one.width}px: ${problem}`)), ...stepsBack(all)]
        const changes = all.filter((one, i) => i > 0 && one.layout !== all[i - 1].layout).map(one => `${one.width}px ${one.layout}`)

        assert(bad.length === 0, bad.slice(0, 12).join('\n') + (bad.length > 12 ? `\n… ${bad.length - 12} more` : ''))

        return { samples: all.length, changes }
      })
    }

    // Review t_899e3936 B1: the Webapp's UI scale is CSS zoom on <html>; the layout is decided in CSS px.
    await check('Hermes UI scale 80 / 90 / 110 / 125 % (Settings → text size): a page as wide in CSS px gets the layout it gets at 100 % (16 px or more from a layout change), and the bar shows it with nothing overlapping, squeezed or clipped (Dense, Swimlanes)', async () => {
      await resize(page, 2400)
      assert(await page.evaluate(() => typeof (window as unknown as { hermesDesktop?: { zoom?: { setPercent?: unknown } } }).hermesDesktop?.zoom?.setPercent === 'function'), 'the Webapp has no hermesDesktop.zoom bridge')
      const bad: string[] = []
      const compared: Record<string, number> = {}

      try {
        for (const style of ['dense', 'swimlanes']) {
          await switchStyle(page, style)
          const base = sweeps[style]
          // Widths 16 px clear of a layout change at 100 %, every third. Not closer: Chrome draws
          // the native selects up to ~7 px wider (CSS px) at 80 %, so a change point moves that
          // far; mixing zoomed and unzoomed px (the bug) moved it 85–250 px.
          const clear = 8
          const stable = base
            .filter((one, i) => i >= clear && i < base.length - clear && base.slice(i - clear, i + clear + 1).every(other => other.layout === one.layout))
            .filter((_, i) => i % 3 === 0)

          for (const percent of [80, 90, 110, 125]) {
            await setUiScale(page, percent)

            for (const one of stable) {
              const at = await sampleAt(page, one.width)

              if (at.layout !== one.layout) {
                bad.push(`${style} at ${percent} %, page ${one.width}px: ${at.layout}, at 100 % ${one.layout}`)
              }

              bad.push(...at.problems.map(problem => `${style} at ${percent} %, page ${one.width}px: ${problem}`))
            }

            if (style === 'dense') {
              await setPageWidth(page, 1200)
              const box = (await barGeometry(page)).bar

              await page.screenshot({ path: join(shots, `toolbar-dense-1200-scale${percent}-dark.png`), clip: { x: box.x, y: box.y, width: Math.ceil(box.w), height: Math.ceil(box.h) + 4 } })
            }

            compared[`${style} ${percent} %`] = stable.length
          }

          await setUiScale(page, 100)
        }
      } finally {
        await setUiScale(page, 100)
        await setPageWidth(page, null)
      }

      assert(bad.length === 0, bad.slice(0, 12).join('\n') + (bad.length > 12 ? `\n… ${bad.length - 12} more` : ''))

      return compared
    })

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

    await check('a plain wheel over an overflowing scope strip scrolls it sideways, Shift + wheel as far (not twice as far), and nothing else on the page scrolls', async () => {
      await resize(page, 700)
      const before = await barGeometry(page)

      assert(before.scope.scrollWidth > before.scope.clientWidth + 1, `the strip does not overflow at 700 px: ${before.scope.scrollWidth} / ${before.scope.clientWidth}`)
      const stripAt = (to?: number) =>
        page.$eval(
          SCOPE,
          (el, x) => {
            if (x !== null) {
              el.scrollLeft = x
            }

            return el.scrollLeft
          },
          to ?? null
        )
      // Everything else that is scrolled (the page, an ancestor of the bar), by element.
      const othersScrolled = () =>
        page.evaluate(selector => {
          const strip = document.querySelector(selector)
          const scrolled = [...document.querySelectorAll('*')].filter(el => el !== strip && (el.scrollTop !== 0 || el.scrollLeft !== 0)).map(el => `${el.tagName}.${el.className}:${el.scrollLeft},${el.scrollTop}`)

          return [...scrolled, `window:${scrollX},${scrollY}`]
        }, SCOPE)
      const othersBefore = await othersScrolled()

      await stripAt(0)
      await page.mouse.move(before.scope.x + before.scope.w / 2, before.scope.y + before.scope.h / 2)
      await page.mouse.wheel(0, 120)
      await sleep(600)
      const plain = await stripAt()

      await stripAt(0)
      await sleep(100)
      await page.keyboard.down('Shift')
      await page.mouse.wheel(0, 120)
      await sleep(600)
      await page.keyboard.up('Shift')
      const shifted = await stripAt()
      const othersAfter = await othersScrolled()

      await stripAt(0)
      assert(plain >= 100, `a plain wheel (120) scrolled the strip ${plain}px`)
      assert(Math.abs(shifted - plain) <= 2, `Shift + wheel scrolled ${shifted}px, a plain wheel ${plain}px`)
      assert(JSON.stringify(othersAfter) === JSON.stringify(othersBefore), `something else scrolled: ${JSON.stringify(othersBefore)} → ${JSON.stringify(othersAfter)}`)

      return { plain, shifted }
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

    await check('light theme at 1135, 800 and 500 px: the layout it has in dark, nothing overlaps, is squeezed or clipped, the bar shows its layout, and a strip that hides chips fades; screenshots', async () => {
      await page.emulateMedia({ colorScheme: 'light' })
      await switchStyle(page, 'dense')
      const bad: string[] = []
      const seen: Record<number, { layout: string; fade: null | string }> = {}

      try {
        for (const width of [1135, 800, 500]) {
          await resize(page, width)
          const g = await barGeometry(page)
          const layout = await layoutOf(page)
          const fade = await page.$eval(SCOPE, el => (el as HTMLElement).dataset.fade ?? null)
          const hides = g.scope.scrollWidth > g.scope.clientWidth + 1

          seen[width] = { layout, fade }

          if (layout !== table.dense[width].layout) {
            bad.push(`${width}px: ${layout} in light, ${table.dense[width].layout} in dark`)
          }

          if (hides !== (fade !== null)) {
            bad.push(`${width}px: the strip ${hides ? 'hides chips' : 'shows every chip'}, data-fade ${fade}`)
          }

          bad.push(...[...problems(g), ...layoutProblems(g, layout, g.bar.w)].map(problem => `${width}px: ${problem}`))
          await page.screenshot({ path: join(shots, `toolbar-dense-${width}-light.png`), clip: { x: 0, y: 0, width, height: 260 } })
        }
      } finally {
        await page.emulateMedia({ colorScheme: 'dark' })
      }

      assert(bad.length === 0, bad.join('\n'))

      return seen
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
