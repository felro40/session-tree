/**
 * e2e — Session Tree card 10: one shared layout per style; the scope chips only dim and frame,
 * against the isolated test Hermes. It moves blocks and rewrites the layout store, so it runs in
 * its own fresh test home of the role (`c<card>-<role>-shared`, the role's port block), the older
 * one moved to the e2e trash.
 *
 *   node scripts/e2e-shared.ts    (part of `npm run test:e2e`)
 *   KEEP_RUNNING=1 …              leaves the test gateway up afterwards
 *
 * 1. Migration (A2): the test Hermes starts on a home holding a copy of the user's real store
 *    (the card's attachment, `SESSION_TREE_REAL_STATE`; its block ids mapped onto this home's
 *    seeded sessions, its coordinates and per-project layouts kept) plus a `backups.json` with a
 *    backup of another scope. Afterwards the files hold only `all` (byte-identical entries), and
 *    in Dense, Subway and Rich every scope chip shows the `all` arrangement.
 * 2. In each of Dense, Subway and Rich: Re-arrange in All resets every block; two blocks dragged
 *    in All stay exactly where they are (screen and store, ±0.5) through a project scope and
 *    back; the first visit to a project scope frames that project's blocks (the others dimmed
 *    around them), and Fit frames it again; a block dragged in the scope shows at its new spot in
 *    All and in a second browser context; a scoped Re-arrange (the confirm names the project)
 *    moves only that project's blocks (every other entry byte-identical), Undo puts back exactly
 *    those, Layout history lists "Before Re-arrange · <project>", and Restore brings back the
 *    whole layout.
 *
 * Input is real (page.mouse / page.keyboard → CDP Input.*). Everything is read back from the
 * DOM (React Flow's node transforms and boxes), the backend (`/state`, `/state/backups`) and the
 * store files. Screenshots go to <test root>/shots/.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Page } from 'playwright-core'

import type { SessionRow } from '../src/model/sessions.ts'
import { addContext, close, enableDesktopHalf, launch, signIn } from './e2e/browser.ts'
import type { Session } from './e2e/browser.ts'
import {
  api,
  assert,
  backendLog,
  backToTree,
  BLOCK,
  box,
  fit,
  flowPos,
  freshHome,
  ITEM,
  MENU,
  openTree,
  PAGE,
  portsFree,
  positionWrites,
  rowOf,
  rowsOf,
  setProfile,
  sleep,
  stored,
  suite,
  switchStyle,
  waitFor
} from './e2e/common.ts'
import { buildTestPackage, setup, signInLink, stopGateway, stopRoleHomes, testHermes, webappBase } from './e2e/harness.ts'
import { diffSnapshots, snapshotRealHermes } from './e2e/real-hermes-guard.ts'

const t = testHermes(undefined, { variant: 'shared' })
const shots = join(t.root, 'shots')
const { results, facts, check, onFailure } = suite()

const CANVAS = '[data-testid="session-tree-canvas"]'
const STYLES = ['dense', 'subway', 'rich'] as const
type SharedStyle = (typeof STYLES)[number]
const LABEL: Record<SharedStyle, string> = { dense: 'Dense + inspector', subway: 'Subway map', rich: 'Rich cards' }
const PROJECT = 'mdesign'
const REAL_STATE = process.env.SESSION_TREE_REAL_STATE ?? '/home/david/.hermes/kanban/attachments/t_7773fc8c/real-state-2026-11-12.json'

type Point = { x: number; y: number }
type Entry = { x: number; y: number; updated_at: number }
type Entries = Record<string, Entry>

interface NodeBox {
  id: string
  x: number
  y: number
  w: number
  h: number
  project: string
  dimmed: boolean
  editable: boolean
}

const inside = (r: NodeBox, pane: { x: number; y: number; width: number; height: number }) =>
  r.x >= pane.x - 1 && r.y >= pane.y - 1 && r.x + r.w <= pane.x + pane.width + 1 && r.y + r.h <= pane.y + pane.height + 1
const close5 = (a: null | Point | undefined, b: null | Point | undefined) => Boolean(a && b && Math.abs(a.x - b.x) <= 0.5 && Math.abs(a.y - b.y) <= 0.5)

/** Every session block and stand-in on the canvas: its screen box and what it is. */
async function nodeBoxes(page: Page): Promise<NodeBox[]> {
  return page.$$eval('.react-flow__node', elements =>
    elements.flatMap(element => {
      const block = element.querySelector('[data-testid="session-tree-block"], [data-testid="session-tree-standin"]') as HTMLElement | null

      if (!block) {
        return []
      }

      const r = block.getBoundingClientRect()

      return [
        {
          id: element.getAttribute('data-id')!,
          x: r.x,
          y: r.y,
          w: r.width,
          h: r.height,
          project: block.getAttribute('data-project-id') ?? '',
          dimmed: block.getAttribute('data-out-of-scope') === 'true',
          editable: block.getAttribute('data-testid') === 'session-tree-block' && element.classList.contains('draggable')
        }
      ]
    })
  )
}

/** Every node's flow position (React Flow's transform), group labels included. */
async function flowPositions(page: Page): Promise<Record<string, Point>> {
  return page.$$eval('.react-flow__node', elements =>
    Object.fromEntries(
      elements.flatMap(element => {
        const m = /translate\(\s*([-\d.e]+)px,\s*([-\d.e]+)px\)/.exec((element as HTMLElement).style.transform)

        return m ? [[element.getAttribute('data-id')!, { x: Number(m[1]), y: Number(m[2]) }]] : []
      })
    )
  )
}

async function entries(s: Session, style: string): Promise<Entries> {
  return ((await stored(s)).layouts[style]?.all ?? {}) as Entries
}

async function setScope(page: Page, label: null | string): Promise<void> {
  const button = label ? page.locator(`[data-testid="session-tree-scope"] button[title="Project: ${label}"]`) : page.locator('[data-testid="session-tree-scope"] button').first()

  await button.click()
  await page.waitForFunction(
    ([p, want]) => (want === null ? document.querySelector(p)?.getAttribute('data-scope') === 'all' : document.querySelector(p)?.getAttribute('data-scope') !== 'all'),
    [PAGE, label] as const,
    { timeout: 10_000 }
  )
  await page.waitForTimeout(700)
}

async function scopeIdOf(page: Page, label: string): Promise<string> {
  const id = await page.getAttribute(`[data-testid="session-tree-scope"] button[title="Project: ${label}"]`, 'data-scope')

  assert(id, `no scope chip for ${label}`)

  return id
}

async function grabPoint(page: Page, style: string, id: string): Promise<Point> {
  if (style === 'subway') {
    const b = await box(page, `${BLOCK(id)} [data-testid="session-tree-station"]`)

    return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
  }

  const b = await box(page, BLOCK(id))

  return { x: b.x + Math.min(24, b.width * 0.2), y: b.y + b.height / 2 }
}

/** A real left-drag of one block by a screen offset. */
async function dragBlock(page: Page, style: string, id: string, by: Point): Promise<void> {
  const from = await grabPoint(page, style, id)

  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + by.x / 2, from.y + by.y / 2, { steps: 8 })
  await page.mouse.move(from.x + by.x, from.y + by.y, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(600)
}

/** Removes this device's remembered views of one style + scope (a first visit). */
async function forgetView(page: Page, style: string, scope: string): Promise<void> {
  await page.evaluate(
    ([st, sc]) => {
      for (const key of Object.keys(localStorage)) {
        if (key.includes('viewport.v2') && key.endsWith(`${st}|default|${sc}`)) {
          localStorage.removeItem(key)
        }
      }
    },
    [style, scope] as const
  )
}

async function dismissToast(page: Page): Promise<void> {
  const toast = page.locator('[data-testid="session-tree-toast"]')

  if (await toast.count()) {
    await toast.locator('button[aria-label="Dismiss"]').click()
    await toast.waitFor({ state: 'detached', timeout: 5000 })
  }
}

async function confirmRearrange(page: Page): Promise<string> {
  const dialog = page.locator('[role="dialog"][data-testid="session-tree-rearrange-dialog"]')

  await dismissToast(page)
  await page.locator('[data-testid="session-tree-rearrange"]').click()
  await dialog.waitFor({ timeout: 5000 })
  const text = (await page.locator('[data-testid="session-tree-rearrange-text"]').innerText()).trim()

  await dialog.locator('[data-testid="session-tree-rearrange-confirm"]').click()
  await dialog.waitFor({ state: 'detached', timeout: 5000 })
  await page.locator('[data-testid="session-tree-toast"]').waitFor({ timeout: 5000 })

  return text
}

async function shotBoth(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: join(shots, `${name}-light.png`) })
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.waitForTimeout(700)
  await page.screenshot({ path: join(shots, `${name}-dark.png`) })
  await page.emulateMedia({ colorScheme: 'light' })
  await page.waitForTimeout(400)
}

/** Block id (what the canvas draws) → layout key (what the store keys it by: the lineage root). */
function keysOf(rows: readonly SessionRow[]): Record<string, string> {
  return Object.fromEntries(rows.map(row => [row.id, row._lineage_root_id?.trim() || row.id]))
}

/**
 * The migration fixture: a copy of the real store with its session keys mapped onto this home's
 * seeded layout keys (the same real id → the same seeded key in every layout), coordinates,
 * labels, stand-ins and per-project layouts as they were. `backups.json`: schema 1, one backup of
 * another scope and one of `all`.
 */
type RealState = { layouts: Record<string, Record<string, Record<string, Entries>>> } & Record<string, unknown>

function migrationFixture(real: RealState, seeded: string[]) {
  const sessionKey = (key: string) => !key.startsWith('group:') && !key.startsWith('missing:')
  const realKeys = [...new Set(Object.values(real.layouts.default ?? {}).flatMap(scopes => Object.values(scopes).flatMap(blocks => Object.keys(blocks))))].filter(sessionKey).sort()
  const map = new Map(realKeys.slice(0, seeded.length).map((key, index) => [key, seeded[index]]))
  const mapped = structuredClone(real)

  for (const scopes of Object.values(mapped.layouts.default ?? {})) {
    for (const [scope, blocks] of Object.entries(scopes)) {
      scopes[scope] = Object.fromEntries(Object.entries(blocks).map(([key, entry]) => [map.get(key) ?? key, entry]))
    }
  }

  const retired = Object.keys(mapped.layouts.default.dense).find(scope => scope !== 'all')!
  const positions = (blocks: Entries) => Object.fromEntries(Object.entries(blocks).slice(0, 5).map(([key, entry]) => [key, { x: entry.x, y: entry.y }]))
  const backups = {
    schema: 1,
    backups: [
      { id: '0123456789abcdef', profile: 'default', style: 'dense', scope: retired, created_at: 1.0, reason: 'rearrange', positions: positions(mapped.layouts.default.dense[retired]) },
      { id: 'fedcba9876543210', profile: 'default', style: 'dense', scope: 'all', created_at: 2.0, reason: 'rearrange', positions: positions(mapped.layouts.default.dense.all) }
    ]
  }

  return { state: mapped, backups, mappedKeys: [...map.values()], retired }
}

async function main(): Promise<void> {
  const realBefore = snapshotRealHermes()

  // The role's other homes use the same ports: make sure they are not running.
  stopRoleHomes(t)

  freshHome(t)
  console.log(`e2e shared — role ${t.role}, home ${t.home}`)
  const packageDir = buildTestPackage(t)
  const manifest = setup(t, { packageDir }) as { seeded?: boolean }

  assert(manifest.seeded === true, 'the shared home was not freshly seeded')
  assert(existsSync(REAL_STATE), `no migration fixture at ${REAL_STATE}`)
  mkdirSync(shots, { recursive: true })
  const s = await launch({ colorScheme: 'light' })
  const { page } = s
  const log = backendLog(page)
  const stacks: string[] = []
  let other: Session | undefined
  let failures = 0
  let keyOf: Record<string, string> = {}
  let fixture: ReturnType<typeof migrationFixture> | undefined

  page.on('pageerror', error => stacks.push(`${error.message}\n${error.stack ?? ''}`))
  onFailure(
    async () => {
      failures += 1
      await page.screenshot({ path: join(shots, `failure-${failures}.png`) }).catch(() => undefined)

      return `${await page.evaluate(p => JSON.stringify({ hash: location.hash, style: document.querySelector(p)?.getAttribute('data-style'), scope: document.querySelector(p)?.getAttribute('data-scope') }), PAGE)} (failure-${failures}.png)`
    },
    async () => {
      await page.mouse.up().catch(() => undefined)
      await page.keyboard.press('Escape')
      await page.keyboard.press('Escape')
      await page.waitForTimeout(300)

      if (!(await page.locator(CANVAS).count())) {
        await backToTree(page).catch(() => undefined)
      }
    }
  )

  const storeDir = join(t.home, 'session-tree')
  const key = (id: string) => keyOf[id] ?? id

  try {
    await check('migration fixture: a copy of the real store (ids mapped onto this home\u2019s sessions) and a backups.json with another scope\u2019s backup, in place before the gateway starts', async () => {
      await signIn(t, page)
      const rows = await rowsOf(s, 'default', true)

      keyOf = keysOf(rows)
      stopGateway(t)
      const real = JSON.parse(readFileSync(REAL_STATE, 'utf8'))
      const seeded = [...new Set(Object.values(keyOf))].sort()

      fixture = migrationFixture(real, seeded)
      mkdirSync(storeDir, { recursive: true })
      writeFileSync(join(storeDir, 'state.json'), JSON.stringify(fixture.state))
      writeFileSync(join(storeDir, 'backups.json'), JSON.stringify(fixture.backups))
      const layouts = Object.entries(fixture.state.layouts.default).map(([style, scopes]) => `${style}:${Object.keys(scopes).length}`)

      return { layouts, mapped: fixture.mappedKeys.length, retiredBackupScope: fixture.retired }
    })

    await check('migration: the first load leaves only `all` per style in state.json (each entry byte-identical) and drops the other scope\u2019s backup', async () => {
      await signIn(t, page)
      await stored(s)
      const after = JSON.parse(readFileSync(join(storeDir, 'state.json'), 'utf8')) as { layouts: Record<string, Record<string, Record<string, Entries>>> }
      const scopes = Object.fromEntries(Object.entries(after.layouts).flatMap(([profile, styles]) => Object.entries(styles).map(([style, byScope]) => [`${profile}/${style}`, Object.keys(byScope)])))

      assert(Object.values(scopes).every(keys => keys.length === 1 && keys[0] === 'all'), `scopes after: ${JSON.stringify(scopes)}`)
      const changed: string[] = []

      for (const [profile, styles] of Object.entries(after.layouts)) {
        for (const [style, byScope] of Object.entries(styles)) {
          const was = fixture!.state.layouts[profile]?.[style]?.all ?? {}

          for (const [id, entry] of Object.entries(byScope.all)) {
            if (JSON.stringify(entry) !== JSON.stringify(was[id])) {
              changed.push(`${profile}/${style}/${id}`)
            }
          }
        }
      }

      assert(changed.length === 0, `'all' entries changed: ${changed.slice(0, 5).join(', ')}`)
      const backups = JSON.parse(readFileSync(join(storeDir, 'backups.json'), 'utf8')) as { schema: number; backups: { id: string; scope: string }[] }

      assert(backups.backups.every(each => each.scope === 'all') && backups.backups.map(each => each.id).join() === 'fedcba9876543210', `backups after: ${JSON.stringify(backups.backups.map(each => [each.id, each.scope]))}`)
      const listed = await api<{ backups: { id: string }[] }>(s, '/api/plugins/session-tree/state/backups?session_profile=default&style=dense&scope=' + encodeURIComponent(fixture!.retired))

      assert(listed.backups.map(each => each.id).join() === 'fedcba9876543210', `listed: ${JSON.stringify(listed)}`)

      return { scopes: Object.keys(scopes).length, backups: backups.backups.length, schema: backups.schema }
    })

    await check('migration: in Dense, Subway and Rich every scope chip shows the `all` arrangement (every stored block at its `all` spot, ±0.5)', async () => {
      await enableDesktopHalf(t, page)
      await openTree(t, s)
      const table: Record<string, Record<string, number>> = {}

      for (const style of STYLES) {
        if ((await page.getAttribute(PAGE, 'data-style')) !== style) {
          await switchStyle(page, style)
        }

        const all = fixture!.state.layouts.default[style]?.all ?? {}
        const scopes = await page.$$eval('[data-testid="session-tree-scope"] button', buttons => buttons.map(button => button.getAttribute('title')))

        table[style] = {}

        for (const title of scopes) {
          await setScope(page, title === 'All projects' ? null : title!.replace(/^Project: /, ''))
          const shown = await flowPositions(page)
          const compared = Object.entries(shown).filter(([id]) => all[key(id)])
          const off = compared.filter(([id, point]) => !close5(point, all[key(id)]))

          assert(compared.length >= 5, `${style} ${title}: only ${compared.length} stored blocks shown`)
          assert(off.length === 0, `${style} ${title}: not at the 'all' spot: ${JSON.stringify(off.slice(0, 3).map(([id, p]) => [id, p, all[key(id)]]))}`)
          table[style][title!] = compared.length
        }

        await setScope(page, null)
      }

      facts.migration = table

      return table
    })

    await check('a second browser context (another device) opens the page', async () => {
      other = await addContext(s)
      await signIn(t, other.page)
      await enableDesktopHalf(t, other.page, { via: 'detail' })
      await openTree(t, other)

      return { style: await other.page.getAttribute(PAGE, 'data-style') }
    })

    for (const style of STYLES) {
      let projectId = ''
      let fresh: Entries = {}
      let dragged: string[] = []

      await check(`${style}: Re-arrange in All projects resets every block (every stored entry rewritten, no dragged spot kept)`, async () => {
        if ((await page.getAttribute(PAGE, 'data-style')) !== style) {
          await switchStyle(page, style)
          await waitFor('the synced style stored', () => stored(s), value => value.settings.style === style)
        }

        await setScope(page, null)
        projectId = await scopeIdOf(page, PROJECT)
        const before = await entries(s, style)
        const newest = Math.max(...Object.values(before).map(entry => entry.updated_at))
        const text = await confirmRearrange(page)

        assert(text.startsWith(`Every block in ${LABEL[style]} · All projects goes back to the automatic layout.`), `confirm text: ${text}`)
        const onCanvas = Number(await page.getAttribute(PAGE, 'data-canvas-count'))

        fresh = (await waitFor('the fresh layout stored', () => entries(s, style), value => Object.keys(value).filter(id => !id.startsWith('group:')).length >= onCanvas && Object.values(value).every(entry => entry.updated_at > newest))) as Entries
        await dismissToast(page)
        await sleep(800)
        fresh = await entries(s, style)
        assert(Object.values(fresh).every(entry => entry.updated_at > newest), 'an entry survived the Re-arrange')

        return { entries: Object.keys(fresh).length, text }
      })

      await check(`${style}: two blocks dragged in All stay exactly where they are (screen and store, ±0.5) through the ${PROJECT} scope and back; the first visit to the scope frames ${PROJECT}\u2019s blocks with the others dimmed around them`, async () => {
        await fit(page)
        const pane = await box(page, '.react-flow__pane')
        const boxes = (await nodeBoxes(page)).filter(r => r.editable && inside(r, { x: pane.x + 80, y: pane.y + 80, width: pane.width - 160, height: pane.height - 160 }))
        const mine = boxes.find(r => r.project === projectId)
        const theirs = boxes.find(r => r.project !== projectId)

        assert(mine && theirs, `no draggable blocks of both kinds in view: ${boxes.length}`)
        dragged = [mine.id, theirs.id]
        await dragBlock(page, style, mine.id, { x: 50, y: 38 })
        await dragBlock(page, style, theirs.id, { x: -44, y: 30 })
        await waitFor('both drops stored', () => entries(s, style), value => dragged.every(id => !close5(value[key(id)], fresh[key(id)])))
        await sleep(600)
        const storeBefore = await entries(s, style)
        const screenBefore = await flowPositions(page)

        await forgetView(page, style, projectId)
        await setScope(page, PROJECT)
        const screenScoped = await flowPositions(page)
        const pane2 = await box(page, '.react-flow__pane')
        const scopedBoxes = await nodeBoxes(page)
        const own = scopedBoxes.filter(r => !r.dimmed)
        const outside = own.filter(r => !inside(r, pane2))
        const dimmed = scopedBoxes.filter(r => r.dimmed)

        await shotBoth(page, `shared-${style}-scope-framed`)
        await setScope(page, null)
        const screenAfter = await flowPositions(page)
        const storeAfter = await entries(s, style)
        const movedScoped = Object.keys(screenBefore).filter(id => screenScoped[id] && !close5(screenScoped[id], screenBefore[id]))
        const movedBack = Object.keys(screenBefore).filter(id => screenAfter[id] && !close5(screenAfter[id], screenBefore[id]))
        const storeMoved = Object.keys(storeBefore).filter(id => !close5(storeAfter[id], storeBefore[id]))

        assert(movedScoped.length === 0, `the scope moved blocks on screen: ${movedScoped.slice(0, 5).join(', ')}`)
        assert(movedBack.length === 0, `back in All, blocks moved: ${movedBack.slice(0, 5).join(', ')}`)
        assert(storeMoved.length === 0, `stored positions changed: ${storeMoved.slice(0, 5).join(', ')}`)
        assert(own.length > 0 && outside.length === 0, `${PROJECT}'s blocks outside the pane on the first visit: ${outside.map(r => r.id).join(', ')}`)
        assert(dimmed.length > 0, 'no dimmed blocks of other projects')
        assert(Object.keys((await stored(s)).layouts[style] ?? {}).join() === 'all', 'a per-scope layout was stored')

        return { dragged, compared: Object.keys(screenBefore).length, own: own.length, dimmed: dimmed.length }
      })

      await check(`${style}: Fit in the ${PROJECT} scope frames the project; a block dragged there shows at its new spot in All and in the second browser context`, async () => {
        await setScope(page, PROJECT)
        const pane = await box(page, '.react-flow__pane')

        // Pan away with the middle button (real input), then Fit.
        await page.mouse.move(pane.x + pane.width / 2, pane.y + pane.height / 2)
        await page.mouse.down({ button: 'middle' })
        await page.mouse.move(pane.x + pane.width / 2 + 600, pane.y + pane.height / 2 + 400, { steps: 10 })
        await page.mouse.up({ button: 'middle' })
        await page.waitForTimeout(300)
        await fit(page)
        const own = (await nodeBoxes(page)).filter(r => !r.dimmed)
        const outside = own.filter(r => !inside(r, pane))
        const spanX = Math.max(...own.map(r => r.x + r.w)) - Math.min(...own.map(r => r.x))
        const spanY = Math.max(...own.map(r => r.y + r.h)) - Math.min(...own.map(r => r.y))

        assert(outside.length === 0, `after Fit, ${PROJECT}'s blocks outside the pane: ${outside.map(r => r.id).join(', ')}`)
        assert(spanX >= pane.width * 0.4 || spanY >= pane.height * 0.4, `Fit did not frame the project (span ${Math.round(spanX)}×${Math.round(spanY)} of ${Math.round(pane.width)}×${Math.round(pane.height)})`)
        const target = own.find(r => r.editable && r.id !== dragged[0] && inside(r, { x: pane.x + 80, y: pane.y + 80, width: pane.width - 160, height: pane.height - 160 }))

        assert(target, 'no draggable project block in view')
        const was = await flowPos(page, target.id)

        await dragBlock(page, style, target.id, { x: 36, y: 48 })
        const now = await flowPos(page, target.id)

        assert(now && was && !close5(now, was), 'the block did not move')
        const state = await waitFor('the scoped drop stored', () => entries(s, style), value => close5(value[key(target.id)], now))

        await setScope(page, null)
        assert(close5(await flowPos(page, target.id), now), `in All the block is at ${JSON.stringify(await flowPos(page, target.id))}, not ${JSON.stringify(now)}`)
        await other!.page.waitForFunction(([p, id]) => document.querySelector(p)?.getAttribute('data-style') === id, [PAGE, style] as const, { timeout: 20_000 })
        const seen = await waitFor('the other context shows it', () => flowPos(other!.page, target.id), pos => close5(pos, now), 15_000)

        dragged.push(target.id)

        return { target: target.id, now, stored: state[key(target.id)], seen }
      })

      await check(`${style}: a scoped Re-arrange (the confirm names ${PROJECT}) moves only ${PROJECT}\u2019s blocks, every other entry byte-identical; Undo puts back exactly those; Layout history lists "Before Re-arrange · ${PROJECT}" and Restore brings back the whole layout`, async () => {
        await setScope(page, PROJECT)
        await fit(page)
        const own = (await nodeBoxes(page)).filter(r => !r.dimmed)
        const ownKeys = new Set(own.map(r => key(r.id)))
        const before = await entries(s, style)
        const writesFrom = Date.now()

        await shotBoth(page, `shared-${style}-before-scoped-rearrange`)
        const text = await confirmRearrange(page)
        const count = Number(/^The (\d+) blocks? of /.exec(text)?.[1])

        assert(text.startsWith(`The ${count} block`) && text.includes(` of ${PROJECT} go back to their automatic spots; other projects stay where they are.`) && /Layout history/.test(text), `confirm text: ${text}`)
        assert(count === own.length, `the confirm counts ${count}, the canvas shows ${own.length} ${PROJECT} blocks`)
        const ownDragged = dragged.filter(id => ownKeys.has(key(id)))
        const after = await waitFor('the scoped Re-arrange stored', () => entries(s, style), value => ownDragged.every(id => close5(value[key(id)], fresh[key(id)])))
        const changedOthers = Object.keys(before).filter(id => !ownKeys.has(id) && !id.startsWith(`group:${projectId}`) && JSON.stringify(after[id]) !== JSON.stringify(before[id]))
        const theirs = dragged.find(id => !ownKeys.has(key(id)))!

        assert(changedOthers.length === 0, `other entries changed: ${changedOthers.slice(0, 5).join(', ')}`)
        assert(!close5(after[key(theirs)], fresh[key(theirs)]), 'the other project\u2019s dragged block went back too')
        assert(ownDragged.length >= 1, 'no dragged project block to check')
        const writes = positionWrites(log, writesFrom).map(entry => `${entry.method} ${entry.path.split('?')[0]}`)

        assert(writes.includes('PUT /state/layout/project') && !writes.includes('DELETE /state/layout'), `writes: ${writes.join(', ')}`)
        await page.waitForTimeout(500)
        await shotBoth(page, `shared-${style}-after-scoped-rearrange`)
        // Undo: exactly the project's entries come back; nothing else is touched.
        await page.locator('[data-testid="session-tree-undo"]').click()
        const undone = await waitFor('Undo stored', () => entries(s, style), value => ownDragged.every(id => close5(value[key(id)], before[key(id)])))
        const notBack = Object.keys(before).filter(id => !close5(undone[id], before[id]))
        const extra = Object.keys(undone).filter(id => !before[id])

        assert(notBack.length === 0 && extra.length === 0, `after Undo: not back ${notBack.slice(0, 5).join(', ')}, extra ${extra.join(', ')}`)
        for (const id of Object.keys(before).filter(id => !ownKeys.has(id) && !id.startsWith(`group:${projectId}`))) {
          assert(JSON.stringify(undone[id]) === JSON.stringify(before[id]), `Undo touched ${id}`)
        }

        // Again, then Layout history from the toast: the entry names the project; Restore.
        await confirmRearrange(page)
        await waitFor('re-arranged again', () => entries(s, style), value => ownDragged.every(id => close5(value[key(id)], fresh[key(id)])))
        await page.locator('[data-testid="session-tree-toast-history"]').click()
        const dialog = page.locator('[role="dialog"][data-testid="session-tree-history-dialog"]')

        await dialog.locator('[data-testid="session-tree-history-row"]').first().waitFor({ timeout: 10_000 })
        const top = dialog.locator('[data-testid="session-tree-history-row"]').first()
        const what = (await top.locator('[data-testid="session-tree-history-what"]').innerText()).trim()
        const note = (await dialog.locator('[data-testid="session-tree-history-scope-note"]').innerText()).trim()
        const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? null)

        assert(what.endsWith(`Before Re-arrange · ${PROJECT}`) && (await top.getAttribute('data-project')) === projectId, `top entry: ${what}`)
        assert(/Restoring replaces the whole layout, every project/.test(note), `scope note: ${note}`)
        assert(focused === 'session-tree-history-close', `the history opens with focus on ${focused}`)
        await shotBoth(page, `shared-${style}-history`)
        await top.locator('[data-testid="session-tree-history-restore"]').click()
        await dialog.waitFor({ state: 'detached', timeout: 10_000 })
        const restored = await waitFor('restored', () => entries(s, style), value => Object.keys(before).every(id => close5(value[id], before[id])))

        await dismissToast(page)
        await setScope(page, null)

        return { count, ownDragged, what, restored: Object.keys(restored).length, writes }
      })
    }

    // Review t_5e9be878 N1: an Undo never puts back the old spot of a block moved to another
    // project since (Dense). `st-split-child` (mdesign) is a branch of a syscanvas root, so its
    // family's band is syscanvas's before and after the move.
    const MOVED = 'st-split-child'
    let syscanvasId = ''

    /** Its family's band (`group:<project>` and its continuation labels), as drawn. */
    const inBand = (shown: Record<string, Point>, project: string, point: Point) => {
      const labels = Object.entries(shown).filter(([id]) => id.startsWith('group:'))
      const tops = labels.map(([, p]) => p.y)

      return labels.some(([id, p]) => {
        const bottom = Math.min(Infinity, ...tops.filter(y => y > p.y))

        return id.split('\u001f')[0] === `group:${project}` && point.y >= p.y && point.y < bottom
      })
    }

    /** Move to project ▸ <label> from the block menu (real right-click and clicks). */
    const moveTo = async (id: string, label: string) => {
      const target = await scopeIdOf(page, label)

      await fit(page)
      const b = await box(page, BLOCK(id))

      await page.mouse.click(b.x + Math.min(30, b.width * 0.2), b.y + b.height / 2, { button: 'right' })
      await page.locator(`${MENU}[data-node-id="${id}"]`).waitFor({ timeout: 5000 })
      await page.locator(ITEM('move')).hover()
      await page.locator('[data-testid="session-tree-menu-move"]').waitFor({ timeout: 5000 })
      await page.locator(`[data-testid="session-tree-menu-move"] [data-project-id="${target}"]`).click()
      await waitFor('the moved row', () => rowOf(s, id), row => Boolean(row?.cwd?.endsWith(`/${label}`)))
      await page.waitForFunction(([i, p]) => document.querySelector(`[data-session-id="${i}"]`)?.getAttribute('data-project-id') === p, [id, target] as const, { timeout: 20_000 })
    }

    /**
     * Drag `MOVED` off its spot (P0), Re-arrange (`scopeLabel`: a project scope, else All), move
     * `MOVED` to `toLabel` with the menu, Undo inside the toast's 10 s. Answers what to compare.
     */
    const rearrangeMoveUndo = async (scopeLabel: null | string, toLabel: string, by: Point) => {
      await setScope(page, scopeLabel)
      await fit(page)
      const was = await entries(s, 'dense')

      await dragBlock(page, 'dense', MOVED, by)
      const dragged = await waitFor('the drag stored', () => entries(s, 'dense'), value => !close5(value[key(MOVED)], was[key(MOVED)]))
      const p0 = dragged[key(MOVED)]

      await sleep(600)
      const before = await entries(s, 'dense')
      const text = await confirmRearrange(page)
      const started = Date.now()

      await waitFor('the Re-arrange stored', () => entries(s, 'dense'), value => !close5(value[key(MOVED)], p0))
      const moving = Date.now()

      await moveTo(MOVED, toLabel)
      // The move's forget reached the store; then the auto-layout placed the block anew.
      await waitFor('the forget sent', async () => positionWrites(log, moving).filter(entry => entry.path.startsWith('/state/forget')).length, n => n > 0)
      await sleep(1200)
      const placed = await waitFor('the moved block placed anew', () => entries(s, 'dense'), value => Boolean(value[key(MOVED)]))
      const elapsed = Date.now() - started

      assert(elapsed < 9000 && (await page.locator('[data-testid="session-tree-undo"]').count()) === 1, `the Undo toast is gone (${elapsed} ms)`)
      await page.locator('[data-testid="session-tree-undo"]').click()
      const others = Object.keys(before).filter(id => id !== key(MOVED))

      await waitFor('Undo stored', () => entries(s, 'dense'), value => others.every(id => close5(value[id], before[id])) && Boolean(value[key(MOVED)]))
      await sleep(1500)
      const after = await entries(s, 'dense')
      const shown = await flowPositions(page)
      const notBack = others.filter(id => !close5(after[id], before[id]))
      const shownOff = Object.keys(shown).filter(id => id !== MOVED && before[key(id)] && !close5(shown[id], before[key(id)]))
      const extra = Object.keys(after).filter(id => !before[id])
      const spot = after[key(MOVED)]

      assert(spot && !close5(spot, p0), `Undo put back ${MOVED}'s pre-Re-arrange spot ${JSON.stringify(p0)}: stored ${JSON.stringify(spot)}`)
      assert(close5(shown[MOVED], spot), `${MOVED} shows at ${JSON.stringify(shown[MOVED])}, stored ${JSON.stringify(spot)}`)
      // A project Undo sends nothing for the moved block: it keeps the spot it was placed at.
      assert(scopeLabel === null || close5(spot, placed[key(MOVED)]), `the project Undo moved ${MOVED}: placed ${JSON.stringify(placed[key(MOVED)])}, now ${JSON.stringify(spot)}`)
      assert(inBand(shown, syscanvasId, spot), `${MOVED} at ${JSON.stringify(spot)} is outside its band (syscanvas)`)
      assert(notBack.length === 0 && shownOff.length === 0 && extra.length === 0, `after Undo: not back ${notBack.slice(0, 5).join(', ')}, shown off ${shownOff.slice(0, 5).join(', ')}, extra ${extra.join(', ')}`)
      await setScope(page, null)

      return { text: text.split('.')[0], p0, placed: placed[key(MOVED)], undone: spot, restored: others.length, elapsed }
    }

    await check(`dense (review t_5e9be878 N1): Re-arrange in the ${PROJECT} scope, move ${MOVED} to syscanvas (block menu), Undo: ${MOVED} keeps its new auto spot in its band (not its pre-Re-arrange spot); every other entry is back exactly (±0.5, store and screen)`, async () => {
      await switchStyle(page, 'dense')
      await waitFor('the synced style stored', () => stored(s), value => value.settings.style === 'dense')
      await setScope(page, null)
      syscanvasId = await scopeIdOf(page, 'syscanvas')
      assert((await rowOf(s, MOVED))?.cwd?.endsWith(`/${PROJECT}`), `${MOVED} is not in ${PROJECT}`)

      return rearrangeMoveUndo(PROJECT, 'syscanvas', { x: 46, y: 26 })
    })

    await check(`dense (review t_5e9be878 N1): the same for Re-arrange in All projects (${MOVED} moved back to ${PROJECT})`, async () => rearrangeMoveUndo(null, PROJECT, { x: -42, y: 24 }))

    await check('dense (review t_5e9be878 N4): each project\u2019s Re-arrange confirm counts exactly its undimmed blocks on the canvas; Cancel sends nothing', async () => {
      await setScope(page, null)
      const titles = (await page.$$eval('[data-testid="session-tree-scope"] button', buttons => buttons.map(button => button.getAttribute('title') ?? ''))).filter(title => title.startsWith('Project: '))
      const counts: Record<string, [number, number]> = {}
      const from = Date.now()

      for (const title of titles) {
        const label = title.replace(/^Project: /, '')

        await setScope(page, label)
        await fit(page)
        const own = (await nodeBoxes(page)).filter(r => !r.dimmed).length

        await dismissToast(page)
        await page.locator('[data-testid="session-tree-rearrange"]').click()
        const dialog = page.locator('[role="dialog"][data-testid="session-tree-rearrange-dialog"]')

        await dialog.waitFor({ timeout: 5000 })
        const text = (await page.locator('[data-testid="session-tree-rearrange-text"]').innerText()).trim()
        const count = Number(/^The (\d+) blocks? of /.exec(text)?.[1] ?? (text.startsWith('No block of') ? 0 : NaN))

        await dialog.locator('[data-testid="session-tree-rearrange-cancel"]').click()
        await dialog.waitFor({ state: 'detached', timeout: 5000 })
        counts[label] = [count, own]
        assert(count === own, `${label}: the confirm counts ${count}, the canvas shows ${own} (${text})`)
        assert(own === 0 || text.startsWith(own === 1 ? `The 1 block of ${label} goes back` : `The ${own} blocks of ${label} go back`), `${label}: ${text}`)
      }

      await setScope(page, null)
      const writes = positionWrites(log, from).filter(entry => entry.path.startsWith('/state/layout'))

      assert(writes.length === 0, `Cancel wrote: ${writes.map(entry => entry.path).join(', ')}`)

      return counts
    })

    await check(`dense (review t_5e9be878 N4): a project with no block on the canvas (profile work: singles only, Show all off) says there is nothing to re-arrange; Re-arrange is disabled, Cancel has the focus, Layout history\u2026 still opens`, async () => {
      await setProfile(page, 'work')
      await page.waitForFunction(p => document.querySelector(p)?.getAttribute('data-canvas-count') === '0', PAGE, { timeout: 20_000 })
      await setScope(page, PROJECT)
      const from = Date.now()

      await dismissToast(page)
      await page.locator('[data-testid="session-tree-rearrange"]').click()
      const dialog = page.locator('[role="dialog"][data-testid="session-tree-rearrange-dialog"]')

      await dialog.waitFor({ timeout: 5000 })
      const text = (await page.locator('[data-testid="session-tree-rearrange-text"]').innerText()).trim()
      const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? null)
      const disabled = await dialog.locator('[data-testid="session-tree-rearrange-confirm"]').isDisabled()

      await page.keyboard.press('Enter') // on Cancel: closes, never confirms
      await dialog.waitFor({ state: 'detached', timeout: 5000 })
      await page.locator('[data-testid="session-tree-rearrange"]').click()
      await dialog.waitFor({ timeout: 5000 })
      await dialog.locator('[data-testid="session-tree-rearrange-history"]').click()
      const history = page.locator('[role="dialog"][data-testid="session-tree-history-dialog"]')

      await history.waitFor({ timeout: 10_000 })
      await history.locator('[data-testid="session-tree-history-close"]').click()
      await history.waitFor({ state: 'detached', timeout: 5000 })
      await sleep(800)
      const writes = positionWrites(log, from).filter(entry => entry.path.startsWith('/state/layout'))

      await setScope(page, null)
      await setProfile(page, 'default')
      await page.locator(BLOCK('st-md-tip')).waitFor({ timeout: 20_000 })
      assert(text === `No block of ${PROJECT} is on the canvas, so there is nothing to re-arrange.`, `confirm text: ${text}`)
      assert(disabled, 'the Re-arrange button is enabled')
      assert(focused === 'session-tree-rearrange-cancel', `the confirm opens with focus on ${focused}`)
      assert(writes.length === 0, `writes: ${writes.map(entry => `${entry.method} ${entry.path}`).join(', ')}`)

      return { text, disabled, focused }
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

  writeFileSync(join(t.root, 'e2e-shared-facts.json'), `${JSON.stringify({ results, facts, base: webappBase(t) }, null, 2)}\n`)
  const failed = results.filter(r => !r.ok)

  console.log(`\ne2e-shared: ${results.length - failed.length} passed, ${failed.length} failed (screenshots: ${shots})`)
  process.exitCode = failed.length === 0 ? 0 : 1
}

await main()
