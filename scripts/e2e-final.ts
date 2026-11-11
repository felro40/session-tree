/**
 * e2e — Session Tree 7/7, the whole-plugin final check, against the isolated test Hermes with the
 * committed desktop/plugin.js (the package linked as it ships: no test style, no test hooks). Its
 * own fresh test home of the role (`c<card>-<role>-final`), the older one moved to the e2e trash.
 *
 *   node scripts/e2e-final.ts     (part of `npm run test:e2e`)
 *
 * - For each of the four styles: open the page in it, run Rename, Branch, Archive (then Unarchive)
 *   and Delete-confirm (cancelled) from the block's menu, read every result back from the backend;
 *   switch style; the other styles' stored positions are unchanged (and drawn there).
 * - Two-context sync in Dense and in Subway: a drop in one browser context shows in the other.
 * - A light and a dark screenshot per style.
 * - The 500-session fixture in every style: first render and a scripted 2 s middle-drag pan.
 * Input is real (page.mouse / page.keyboard → CDP Input.*). Screenshots go to <test root>/shots/.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Page } from 'playwright-core'

import type { StateSnapshot } from '../src/model/layout-sync.ts'
import { addContext, close, enableDesktopHalf, launch, signIn } from './e2e/browser.ts'
import type { Session } from './e2e/browser.ts'
import {
  assert,
  backToTree,
  BLOCK,
  clickToolbar,
  fit,
  flowPos,
  freshHome,
  ITEM,
  layoutOf,
  MENU,
  near,
  openTree,
  PAGE,
  panFps,
  portsFree,
  rowOf,
  rowsOf,
  setProfile,
  sleep,
  stored,
  suite,
  switchStyle,
  viewport,
  waitFor
} from './e2e/common.ts'
import { setup, signInLink, stopGateway, stopRoleHomes, testHermes, webappBase } from './e2e/harness.ts'
import { diffSnapshots, snapshotRealHermes } from './e2e/real-hermes-guard.ts'

const t = testHermes(undefined, { variant: 'final' })
const shots = join(t.root, 'shots')
const { results, facts, check, onFailure } = suite()

const STYLES = ['dense', 'swimlanes', 'subway', 'rich'] as const
type StyleId = (typeof STYLES)[number]
/** Swimlanes keeps no positions (R12). */
const SAVES: Record<StyleId, boolean> = { dense: true, swimlanes: false, subway: true, rich: true }
/** The fixture sessions each style acts on (disjoint, so the styles do not disturb each other). */
const TARGETS: Record<StyleId, { rename: string; branch: string; archive: string }> = {
  dense: { rename: 'st-sys-reply', branch: 'st-hp-mockup', archive: 'st-split-child' },
  swimlanes: { rename: 'st-hp-root', branch: 'st-md-redline', archive: 'st-md-v2' },
  subway: { rename: 'st-md-katex', branch: 'st-sys-mcp', archive: 'st-hp-routing' },
  rich: { rename: 'st-md-tip', branch: 'st-orphan-child', archive: 'st-sys-comments' }
}
/** The 500-session pan bar per style (the card's table). */
const FPS_BAR: Record<StyleId, number> = { dense: 45, swimlanes: 45, subway: 45, rich: 30 }

/** A point on the block that a right-click or a drag grabs: a Subway station's ring, else the block. */
async function grabPoint(page: Page, id: string): Promise<{ x: number; y: number }> {
  const ring = page.locator(`${BLOCK(id)} [data-testid="session-tree-station"]`)
  const target = (await ring.count()) > 0 ? ring : page.locator(BLOCK(id))
  const b = await target.first().boundingBox()

  assert(b, `no box for ${id}`)

  return { x: b.x + Math.min(b.width / 2, 30), y: b.y + b.height / 2 }
}

async function openMenu(page: Page, id: string): Promise<void> {
  await fit(page)
  await page.locator(BLOCK(id)).waitFor({ timeout: 15_000 })
  const at = await grabPoint(page, id)

  await page.mouse.click(at.x, at.y, { button: 'right' })
  await page.locator(`${MENU}[data-node-id="${id}"]`).waitFor({ timeout: 5000 })
  await page.waitForTimeout(150)
}

async function choose(page: Page, action: string): Promise<void> {
  await page.locator(ITEM(action)).click()
  await page.waitForTimeout(250)
}

/** Every style's stored layout (Swimlanes has none). */
function layouts(state: StateSnapshot): Record<string, Record<string, { x: number; y: number }>> {
  return Object.fromEntries(STYLES.map(style => [style, layoutOf(state, style)]))
}

/** Ids of `before` whose stored position changed in `after` (a removed entry counts as changed). */
const movedIn = (before: Record<string, { x: number; y: number }>, after: Record<string, { x: number; y: number }>) => Object.keys(before).filter(id => !near(after[id], before[id], 0.01))

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: join(shots, name) })
}

async function main(): Promise<void> {
  const realBefore = snapshotRealHermes()

  // The role's other homes use the same ports: make sure they are not running.
  stopRoleHomes(t)

  freshHome(t)
  console.log(`e2e final — role ${t.role}, home ${t.home} (the committed desktop/plugin.js)`)
  const manifest = setup(t) as { seeded?: boolean }

  assert(manifest.seeded === true, 'the final home was not freshly seeded')
  mkdirSync(shots, { recursive: true })
  const s = await launch({ colorScheme: 'light' })
  const { page } = s
  const stacks: string[] = []
  let b: Session | undefined
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

  let baseline: Record<string, Record<string, { x: number; y: number }>> = {}

  try {
    await check('sign in, enable the desktop half, open the page: the four styles are in the switcher, in R1\'s order, and nothing else (the shipped bundle)', async () => {
      await signIn(t, page)
      await enableDesktopHalf(t, page)
      await openTree(t, s)
      const options = await page.locator('[data-testid="session-tree-style"] option').evaluateAll(list => list.map(option => [(option as HTMLOptionElement).value, (option as HTMLOptionElement).text]))

      assert(JSON.stringify(options.map(([value]) => value)) === JSON.stringify(STYLES), `styles ${JSON.stringify(options)}`)

      return { options }
    })

    await check('every style is switchable and lays itself out on first view; each style that saves positions stores its own layout (Swimlanes none)', async () => {
      for (const style of STYLES) {
        await switchStyle(page, style)
        await page.locator('[data-testid="session-tree-block"]').first().waitFor({ timeout: 20_000 })
        assert((await page.getAttribute('[data-testid="session-tree-canvas"]', 'data-style')) === style, `the canvas is not ${style}`)
      }

      const onCanvas = Number(await page.getAttribute(PAGE, 'data-canvas-count'))
      const state = await waitFor('every saving style stored', () => stored(s), value => STYLES.every(style => !SAVES[style] || Object.keys(layoutOf(value, style)).filter(id => !id.startsWith('group:')).length >= onCanvas))

      await sleep(1500)
      baseline = layouts(await stored(s))
      const counts = Object.fromEntries(STYLES.map(style => [style, Object.keys(baseline[style]).length]))

      assert(Object.keys(layoutOf(state, 'swimlanes')).length === 0, 'Swimlanes stored positions')
      // Each style keeps its own positions: the same block sits elsewhere in each.
      const spots = STYLES.filter(style => SAVES[style]).map(style => JSON.stringify(baseline[style]['st-hp-root']))

      assert(new Set(spots).size === spots.length, `the styles share positions: ${spots.join(' ')}`)
      facts.baseline = counts

      return counts
    })

    for (const style of STYLES) {
      const target = TARGETS[style]

      await check(`${style}: Rename, Branch, Archive (then Unarchive) and Delete-confirm (cancelled) from the block menu, read back from the backend; switching away leaves the other styles' positions unchanged`, async () => {
        await switchStyle(page, style)
        await fit(page)
        const before = layouts(await stored(s))
        const renamed = `Renamed in ${style}`

        // Rename…
        await openMenu(page, target.rename)
        await choose(page, 'rename')
        const dialog = page.locator(`[data-testid="session-tree-rename-dialog"][data-node-id="${target.rename}"]`)

        await dialog.waitFor({ timeout: 5000 })
        await page.locator('[data-testid="session-tree-rename-input"]').press('Control+A')
        await page.keyboard.type(renamed)
        await page.keyboard.press('Enter')
        await dialog.waitFor({ state: 'detached', timeout: 10_000 })
        await waitFor('the renamed row', () => rowOf(s, target.rename), value => value?.title === renamed)
        await page.waitForFunction(([selector, text]) => document.querySelector(selector)?.textContent?.includes(text), [BLOCK(target.rename), renamed] as const, { timeout: 15_000 })

        // Branch: a child of the parent, placed and drawn, the graph stays.
        const known = new Set((await rowsOf(s)).map(row => row.id))

        await openMenu(page, target.branch)
        await choose(page, 'branch')
        const after = await waitFor('a new child row', () => rowsOf(s), value => value.some(row => !known.has(row.id) && row._branched_from === target.branch), 30_000)
        const child = after.find(row => !known.has(row.id) && row._branched_from === target.branch)!

        await page.locator(BLOCK(child.id)).waitFor({ timeout: 20_000 })
        const link = await page.locator(`[data-testid="session-tree-link"][data-source="${target.branch}"][data-target="${child.id}"]`).count()

        assert(link === 1, `no link from ${target.branch} to the new child`)

        // Archive, then Unarchive through Show archived (the menu offers it, R9).
        await openMenu(page, target.archive)
        await choose(page, 'archive')
        await waitFor('archived', () => rowOf(s, target.archive), value => value?.archived === true)
        await page.locator(BLOCK(target.archive)).waitFor({ state: 'detached', timeout: 15_000 })
        await clickToolbar(page, 'session-tree-show-archived')
        await page.waitForFunction(selector => document.querySelector(selector)?.getAttribute('data-archived') === 'true', BLOCK(target.archive), { timeout: 15_000 })
        await openMenu(page, target.archive)
        const unarchive = (await page.locator(ITEM('archive')).innerText()).trim()

        await choose(page, 'archive')
        await waitFor('unarchived', () => rowOf(s, target.archive), value => value?.archived === false)
        await clickToolbar(page, 'session-tree-show-archived')
        await page.locator(BLOCK(target.archive)).waitFor({ timeout: 15_000 })

        // Delete: the confirm (with the branches note when it has some), cancelled; nothing deleted.
        await openMenu(page, target.branch)
        await choose(page, 'delete')
        const text = page.locator('[data-testid="session-tree-delete-text"]')

        await text.waitFor({ timeout: 5000 })
        const said = (await text.innerText()).trim()

        await shot(page, `final-${style}-delete-confirm.png`)
        await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click()
        await text.waitFor({ state: 'detached', timeout: 10_000 })
        await sleep(800)
        const still = await rowOf(s, target.branch)

        assert(unarchive === 'Unarchive', `the archived block's menu says ${unarchive}`)
        assert(/branch/i.test(said) && Boolean(still), `delete confirm "${said}", row kept ${Boolean(still)}`)

        // Switch away (to the next style); the others' stored positions are those from before.
        const next = STYLES[(STYLES.indexOf(style) + 1) % STYLES.length]

        await switchStyle(page, next)
        await sleep(1500)
        const now = layouts(await stored(s))
        const changed = STYLES.filter(other => other !== style).flatMap(other => movedIn(before[other], now[other]).map(id => `${other}:${id}`))

        assert(changed.length === 0, `other styles' positions changed: ${changed.slice(0, 6).join(', ')}`)
        assert(!SAVES[style] || Boolean(now[style][child.id] ?? now[style][child._lineage_root_id ?? '']), `the new child is not stored for ${style}`)
        facts[`actions_${style}`] = { renamed, child: child.id, unarchive, deleteText: said.slice(0, 120), otherStylesChecked: STYLES.length - 1 }

        return facts[`actions_${style}`]
      })
    }

    await check('each style draws its blocks where its stored layout says (the four styles\' positions are independent)', async () => {
      const state = layouts(await stored(s))
      const rows = await rowsOf(s)
      // A compacted conversation is stored under its lineage root (card-4 B2).
      const keyOf = (id: string) => rows.find(row => row.id === id)?._lineage_root_id || id
      const off: string[] = []

      for (const style of STYLES.filter(each => SAVES[each])) {
        await switchStyle(page, style)

        for (const id of ['st-hp-root', 'st-sys-tip', 'st-md-tip']) {
          const drawn = await flowPos(page, id)

          if (!near(drawn, state[style][keyOf(id)], 0.5)) {
            off.push(`${style}:${id} drawn ${JSON.stringify(drawn)}, stored ${JSON.stringify(state[style][keyOf(id)])}`)
          }
        }
      }

      assert(off.length === 0, off.join('; '))

      return { checked: 3 * 3 }
    })

    for (const style of ['dense', 'subway'] as const) {
      await check(`two-context sync (${style}): a drop in one browser context shows in the other (push, else the poll); the synced style follows`, async () => {
        await switchStyle(page, style)
        await fit(page)

        if (!b) {
          b = await addContext(s)
          await signIn(t, b.page)
          await enableDesktopHalf(t, b.page, { via: 'detail' })
          await openTree(t, b)
        }

        await b.page.waitForFunction(([selector, id]) => document.querySelector(selector)?.getAttribute('data-style') === id, [PAGE, style] as const, { timeout: 20_000 })
        const id = 'st-hp-root'
        const from = (await flowPos(page, id))!
        const v = await viewport(page)
        const grab = await grabPoint(page, id)
        const by = { x: 60, y: style === 'subway' ? 50 : 40 }

        await page.mouse.move(grab.x, grab.y)
        await page.mouse.down()
        await page.mouse.move(grab.x + by.x / 2, grab.y + by.y / 2, { steps: 8 })
        await page.mouse.move(grab.x + by.x, grab.y + by.y, { steps: 8 })
        await page.mouse.up()
        await sleep(400)
        const dropped = (await flowPos(page, id))!
        const started = Date.now()

        await waitFor('the drop stored', () => stored(s), value => near(layoutOf(value, style)[id], dropped, 0.5))
        const shown = await waitFor('the other context shows it', () => flowPos(b!.page, id), pos => near(pos, dropped, 0.5), 15_000)
        const ms = Date.now() - started

        assert(Math.hypot(dropped.x - from.x, dropped.y - from.y) > 5, `the drag did not move ${id}: ${JSON.stringify({ from, dropped, zoom: v.zoom })}`)
        facts[`sync_${style}`] = { from, dropped, shown, ms }

        return facts[`sync_${style}`]
      })
    }

    await check('light and dark: a screenshot per style; the canvas paints from the theme in both', async () => {
      const backgrounds: Record<string, string[]> = {}

      for (const style of STYLES) {
        await switchStyle(page, style)
        await fit(page)
        backgrounds[style] = []

        for (const scheme of ['light', 'dark'] as const) {
          await page.emulateMedia({ colorScheme: scheme })
          await page.waitForTimeout(700)
          backgrounds[style].push(await page.$eval('[data-testid="session-tree-canvas"]', el => getComputedStyle(el).backgroundColor))
          await shot(page, `final-${style}-${scheme}.png`)
        }
      }

      await page.emulateMedia({ colorScheme: 'light' })
      await page.waitForTimeout(400)
      assert(STYLES.every(style => backgrounds[style][0] !== backgrounds[style][1]), `light and dark look the same: ${JSON.stringify(backgrounds)}`)

      return backgrounds
    })

    await check('the 500-session fixture in every style (Show all): first render and a scripted 2 s middle-drag pan (Dense ≥ 45, Swimlanes ≥ 45, Subway ≥ 45, Rich ≥ 30 fps)', async () => {
      const table: Record<string, { firstRenderMs: number; fps: number; frames: number; zoom: number }> = {}

      await clickToolbar(page, 'session-tree-show-all')

      for (const style of STYLES) {
        await setProfile(page, 'default')
        await page.waitForFunction(selector => document.querySelector(selector)?.getAttribute('data-profile') === 'default', PAGE, { timeout: 20_000 })
        await switchStyle(page, style)
        await sleep(500)
        const started = Date.now()

        await setProfile(page, 'scale')
        await page.waitForFunction(selector => document.querySelector(selector)?.getAttribute('data-canvas-count') === '500', PAGE, { timeout: 60_000 })
        await page.locator('[data-testid="session-tree-block"][data-session-id^="st-scale-"]').first().waitFor({ timeout: 60_000 })
        const firstRenderMs = Date.now() - started

        await sleep(1500)
        const pan = await panFps(page)
        const v = await viewport(page)

        assert(pan.moved, `${style}: the pan did not move the view`)
        table[style] = { firstRenderMs, fps: pan.fps, frames: pan.frames, zoom: Math.round(v.zoom * 100) / 100 }
        await shot(page, `final-${style}-scale.png`)
      }

      await setProfile(page, 'default')
      await clickToolbar(page, 'session-tree-show-all')
      facts.scale = table
      const slow = STYLES.filter(style => table[style].fps < FPS_BAR[style])

      assert(slow.length === 0, `under the bar: ${slow.map(style => `${style} ${table[style].fps} fps`).join(', ')}`)

      return table
    })

    await check('no page errors from the plugin in either context', () => {
      const fromPlugin = stacks.filter(stack => /blob:|session-tree|desktop-plugins/.test(stack))

      assert(fromPlugin.length === 0, fromPlugin.join('\n'))
      assert(s.errors.length === 0 && (b?.errors.length ?? 0) === 0, [...s.errors, ...(b?.errors ?? [])].join('\n'))
    })

  } finally {
    await b?.context.close().catch(() => undefined)
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

  writeFileSync(join(t.root, 'e2e-final-facts.json'), `${JSON.stringify({ results, facts, base: webappBase(t) }, null, 2)}\n`)
  const failed = results.filter(r => !r.ok)

  console.log(`\ne2e-final: ${results.length - failed.length} passed, ${failed.length} failed (screenshots: ${shots})`)
  process.exitCode = failed.length === 0 ? 0 : 1
}

await main()
