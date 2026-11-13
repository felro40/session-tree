/**
 * e2e — Session Tree card 11: a new session from a right-click on the canvas, in the project you
 * clicked in, against the isolated test Hermes. It creates (and deletes) sessions, so it runs in
 * its own fresh test home of the role (`c<card>-<role>-create`, the role's port block), the older
 * one moved to the e2e trash. The test home names a model (`model.default: test-model`, ruling
 * R5): the canonical gateway refuses `session.create` without one. No provider: no prompt is sent.
 *
 *   node scripts/e2e-create.ts    (part of `npm run test:e2e`)
 *   KEEP_RUNNING=1 …              leaves the test gateway up afterwards
 *
 * In each of Dense, Subway and Rich cards: a right-click on empty canvas in project X's area
 * offers "New session in ● X…" (the dot in X's colour as the canvas draws it) with the ghost at
 * the spot; Create with the default name makes the row (that title, X's root as cwd, 0 messages,
 * ended and not active: the runtime was released) and the block, centred on the click (Snap off;
 * Snap on: on the grid), selected, in X, every other block's position and store entry unchanged,
 * the same after a reload and in a second browser context. Show all off: the block stays on the
 * canvas in all four styles and in no singles container. Swimlanes: lane Y offers Y; the block
 * lands in lane Y at "now". A project scope offers the scoped project over a dimmed area. The
 * dialog: another project, a name the page knows is taken (inline, Create disabled), a name only
 * the server refuses (the dialog stays open, no row is left), Escape / Cancel (nothing, the ghost
 * goes), Enter, a double click on Create (one session), No project (no cwd). The block menu is
 * unchanged on a block; a dimmed block or a stand-in still gets no menu. D6: the core's
 * `DELETE /api/sessions/empty` removes an unused created session; its block and marker go.
 *
 * Input is real (page.mouse, right button included; page.keyboard). Screenshots: <root>/shots/.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Page } from 'playwright-core'

import { addContext, close, enableDesktopHalf, launch, signIn } from './e2e/browser.ts'
import type { Session } from './e2e/browser.ts'
import {
  api,
  assert,
  backToTree,
  BLOCK,
  clickToolbar,
  fit,
  flowPos,
  freshHome,
  MENU,
  openTree,
  PAGE,
  portsFree,
  reloadTree,
  rowsOf,
  sleep,
  stored,
  suite,
  switchStyle,
  viewport,
  waitFor
} from './e2e/common.ts'
import { buildTestPackage, hermes, isolatedEnv, REPO, setup, signInLink, stopGateway, stopRoleHomes, testHermes, webappBase } from './e2e/harness.ts'
import { diffSnapshots, snapshotRealHermes } from './e2e/real-hermes-guard.ts'
import type { SessionRow } from '../src/model/sessions.ts'

const t = testHermes(undefined, { variant: 'create' })
const shots = join(t.root, 'shots')
const { results, facts, check, onFailure } = suite()

const CANVAS = '[data-testid="session-tree-canvas"]'
const CANVAS_MENU = '[data-testid="session-tree-canvas-menu"]'
const NEW_ITEM = `${CANVAS_MENU} [data-action="new-session"]`
const DIALOG = '[data-testid="session-tree-create-dialog"]'
const NAME = '[data-testid="session-tree-create-name"]'
const PROJECT = '[data-testid="session-tree-create-project"]'
const SUBMIT = '[data-testid="session-tree-create-submit"]'
const GHOST = '[data-testid="session-tree-create-ghost"]'
const NO_PROJECT_ID = '__no_project__'
const MENU_ORDER = ['Rename…', 'Pin', 'Mark as unread', 'Appearance', 'Copy ID', '—', 'Branch', 'Export', 'Move to project', '—', 'Archive', 'Delete']
const STYLES = ['dense', 'subway', 'rich'] as const

type Point = { x: number; y: number }
type Box = { x: number; y: number; width: number; height: number }

interface ProjectNode {
  id: string
  label: string
  path: null | string
  isNoProject: boolean
}

const centre = (b: Box): Point => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 })

/** `projects.tree` as the page reads it (the PROJECTS pane's projects, their roots). */
async function projectsTree(page: Page): Promise<ProjectNode[]> {
  return page.evaluate(async () => {
    const host = (globalThis as unknown as { __HERMES_PLUGIN_SDK__: { host: { request<T>(m: string, p: unknown): Promise<T> } } }).__HERMES_PLUGIN_SDK__.host
    const tree = await host.request<{ projects: { id: string; label: string; path?: null | string; isNoProject?: boolean }[] }>('projects.tree', { profile: 'default', preview_limit: 0 })

    return tree.projects.map(each => ({ id: each.id, label: each.label, path: each.path ?? null, isNoProject: each.isNoProject === true || each.id === '__no_project__' }))
  })
}

/** The group labels on screen: their project and screen box. */
async function labels(page: Page): Promise<(Box & { projectId: string; dimmed: boolean })[]> {
  return page.$$eval('[data-testid="session-tree-group-label"]', elements =>
    elements.map(element => {
      const r = element.getBoundingClientRect()

      return { projectId: element.getAttribute('data-project-id') || '__no_project__', dimmed: element.classList.contains('is-dimmed'), x: r.x, y: r.y, width: r.width, height: r.height }
    })
  )
}

/** The first point of `region` (screen) where the canvas pane itself is under the cursor, with a margin clear. */
async function emptyIn(page: Page, region: Box, margin = 6): Promise<null | Point> {
  return page.evaluate(
    ([r, m]) => {
      const pane = document.querySelector('.react-flow__pane')!.getBoundingClientRect()
      const free = (x: number, y: number) => document.elementFromPoint(x, y)?.classList.contains('react-flow__pane') === true

      // Whole pixels strictly inside the region (a rounded point must not leave it: a pixel above
      // a label's top edge is in the band above).
      for (let y = Math.ceil(Math.max(r.y + 1, pane.top + 12)); y <= Math.floor(Math.min(r.y + r.height - 1, pane.bottom - 12)); y += 2) {
        for (let x = Math.ceil(Math.max(r.x + 1, pane.left + 12)); x <= Math.floor(Math.min(r.x + r.width - 1, pane.right - 12)); x += 6) {
          if ([[0, 0], [m, 0], [-m, 0], [0, m], [0, -m]].every(([dx, dy]) => free(x + dx, y + dy))) {
            return { x, y }
          }
        }
      }

      return null
    },
    [region, margin] as const
  )
}

/** A point in project `projectId`'s own area: right of its group label, on the label's row. */
async function pointInProject(page: Page, projectId: string, style: string): Promise<Point> {
  const label = (await labels(page)).find(each => each.projectId === projectId)

  assert(label, `no label of ${projectId} on screen`)
  // Rich cards: stay inside the label's shelf segment (the next label on the row is at least a
  // card's width further right); the band styles: anywhere right of the label, on the middle of
  // its row (well inside the band: the band starts at the label's top edge).
  const middle = label.y + label.height / 2
  const region = style === 'rich' ? { x: label.x + label.width + 4, y: middle - 2, width: 18, height: 4 } : { x: label.x + label.width + 30, y: middle - 2, width: 600, height: 4 }
  const spot = await emptyIn(page, region, 2)

  assert(spot, `no empty spot right of ${projectId}'s label`)

  return spot
}

interface Offer {
  projectId: string
  project: string
  dot: string
  /** The project's colour as the canvas draws it (its group label's `--st-pc`, resolved). */
  colour: null | string
  ghost: Box | null
}

/** A real right-click at `at`; the canvas menu's offer, the dot's colour and the ghost. */
async function rightClick(page: Page, at: Point): Promise<Offer> {
  await page.mouse.click(at.x, at.y, { button: 'right' })
  await page.locator(NEW_ITEM).waitFor({ timeout: 5000 })
  await page.waitForTimeout(150)
  const offer = await page.evaluate(
    ([item]) => {
      const element = document.querySelector(item)!
      const projectId = element.getAttribute('data-project-id')!
      const dot = getComputedStyle(element.querySelector('[data-testid="session-tree-new-session-dot"]')!).backgroundColor
      const label = document.querySelector(`[data-testid="session-tree-group-label"][data-project-id="${projectId === '__no_project__' ? '' : projectId}"], [data-testid="session-tree-lane-header"][data-lane="${projectId}"]`)
      let colour: null | string = null

      if (label) {
        const probe = document.createElement('span')

        probe.style.backgroundColor = 'var(--st-pc)'
        label.appendChild(probe)
        colour = getComputedStyle(probe).backgroundColor
        probe.remove()
      }

      return { projectId, project: element.querySelector('[data-testid="session-tree-new-session-project"]')!.textContent ?? '', dot, colour }
    },
    [NEW_ITEM] as const
  )

  return { ...offer, ghost: await page.locator(GHOST).boundingBox() }
}

/** Opens the dialog from the canvas menu (the item, by real click). */
async function openDialog(page: Page): Promise<void> {
  await page.locator(NEW_ITEM).click()
  await page.locator(DIALOG).waitFor({ timeout: 5000 })
  await page.waitForTimeout(200)
}

async function dialogClosed(page: Page): Promise<void> {
  await page.locator(DIALOG).waitFor({ state: 'detached', timeout: 30_000 })
  await page.waitForTimeout(300)
}

async function rowTitled(s: Session, title: string, archived = false): Promise<SessionRow | undefined> {
  return (await rowsOf(s, 'default', archived)).find(row => row.title === title)
}

async function selected(page: Page): Promise<string> {
  return (await page.getAttribute(CANVAS, 'data-selected')) ?? ''
}

async function blockBox(page: Page, id: string): Promise<Box | null> {
  return page.locator(`.react-flow__node[data-id="${id}"]`).boundingBox()
}

async function menuItemTexts(page: Page): Promise<string[]> {
  return page.$$eval(`${MENU} > *`, elements =>
    elements.map(element =>
      element.getAttribute('role') === 'separator' || element.getAttribute('data-slot')?.includes('separator') ? '—' : ((element as HTMLElement).innerText ?? '').trim()
    )
  )
}

async function setScope(page: Page, projectLabel: null | string): Promise<void> {
  const button = projectLabel ? page.locator(`[data-testid="session-tree-scope"] button[title="Project: ${projectLabel}"]`) : page.locator('[data-testid="session-tree-scope"] button').first()

  await button.click()
  await page.waitForTimeout(600)
}

/** The counts each style's singles container shows (the kept sessions are never in them). */
async function containerCount(page: Page, style: string): Promise<number> {
  if (style === 'dense') {
    return Number(await page.locator('[data-testid="session-tree-singles-count"]').innerText())
  }

  if (style === 'subway') {
    return Number(await page.locator('[data-testid="session-tree-depot-count"]').innerText())
  }

  if (style === 'rich') {
    return Number(await page.locator('[data-testid="session-tree-drawer-count"]').first().innerText())
  }

  return page.$$eval('[data-testid="session-tree-lane-chip"]', chips => chips.reduce((sum, chip) => sum + Number(chip.getAttribute('data-count') ?? 0), 0))
}

async function storedEntries(s: Session, style: string, skip: readonly string[]): Promise<Record<string, unknown>> {
  const layout = (await stored(s)).layouts[style]?.all ?? {}

  return Object.fromEntries(Object.entries(layout).filter(([id]) => !skip.includes(id)))
}

interface Probe {
  /** `method` → the error the call answers after it ran (it lands, then answers an error). */
  mode: Record<string, { code: number; message: string }>
  calls: string[]
  notices: { kind?: string; title?: string; message?: string }[]
  /** The last right-click: was its default prevented once every handler ran. */
  context: null | { prevented: boolean }
}

/**
 * Wraps the SDK host's `request` and `notify` on this page load (idempotent): every call and
 * notice is recorded, and `mode` makes a call answer an error after it ran. Also records whether
 * the last right-click's default was prevented (a window listener, after React's).
 */
async function instrument(page: Page): Promise<void> {
  await page.evaluate(() => {
    type Host = { request(method: string, params: unknown): Promise<unknown>; notify(input: Probe['notices'][number]): string }
    const w = globalThis as unknown as { __stE2e?: Probe; __HERMES_PLUGIN_SDK__: { host: Host } }

    if (w.__stE2e) {
      return
    }

    const host = w.__HERMES_PLUGIN_SDK__.host
    const state: Probe = { mode: {}, calls: [], notices: [], context: null }
    const request = host.request
    const notify = host.notify

    host.request = async function (this: Host, method: string, params: unknown) {
      state.calls.push(method)
      const answer = await request.call(this, method, params)
      const after = state.mode[method]

      if (after) {
        throw Object.assign(new Error(after.message), { code: after.code })
      }

      return answer
    }
    host.notify = function (this: Host, input: Probe['notices'][number]) {
      state.notices.push({ kind: input.kind, title: input.title, message: input.message })

      return notify.call(this, input)
    }
    window.addEventListener('contextmenu', event => {
      state.context = { prevented: event.defaultPrevented }
    })
    w.__stE2e = state
  })
}

async function probe(page: Page): Promise<Probe> {
  return page.evaluate(() => (globalThis as unknown as { __stE2e: Probe }).__stE2e)
}

async function setMode(page: Page, mode: Probe['mode']): Promise<void> {
  await page.evaluate(next => {
    ;(globalThis as unknown as { __stE2e: Probe }).__stE2e.mode = next
  }, mode)
}

/** The focused element (its test id) and the selected part of its value. */
async function focusState(page: Page): Promise<{ testId: null | string; tag: string; value: string; selected: string }> {
  return page.evaluate(() => {
    const element = document.activeElement as HTMLInputElement | null

    return {
      testId: element?.getAttribute('data-testid') ?? null,
      tag: element?.tagName ?? '',
      value: element?.value ?? '',
      selected: element && typeof element.selectionStart === 'number' ? element.value.slice(element.selectionStart, element.selectionEnd ?? 0) : ''
    }
  })
}

const RING_PROPS = ['borderTopColor', 'borderRightColor', 'borderBottomColor', 'outlineStyle', 'outlineWidth', 'outlineColor', 'outlineOffset', 'boxShadow'] as const

/** A control's focus-ring styles: the Name input itself; the Project select's box (`.st-create-project`). */
async function ringStyle(page: Page, selector: string): Promise<Record<string, string>> {
  return page.evaluate(
    ([sel, props]) => {
      const element = document.querySelector(sel)!
      const box = element.closest('.st-create-project') ?? element
      const style = getComputedStyle(box) as unknown as Record<string, string>

      return Object.fromEntries(props.map(prop => [prop, style[prop]]))
    },
    [selector, RING_PROPS] as const
  )
}

/** Dismisses the app's toasts (they stay until dismissed and can cover the toolbar). */
async function dismissToasts(page: Page): Promise<number> {
  const dismiss = page.getByRole('button', { name: 'Dismiss notification' })
  let n = 0

  for (; n < 10 && (await dismiss.count()) > 0; n += 1) {
    await dismiss.first().click()
    await page.waitForTimeout(300)
  }

  return n
}

async function main(): Promise<void> {
  const realBefore = snapshotRealHermes()

  // The role's other homes use the same ports: make sure they are not running.
  stopRoleHomes(t)

  freshHome(t)
  console.log(`e2e create — role ${t.role}, home ${t.home}`)
  const packageDir = buildTestPackage(t)
  const manifest = setup(t, { packageDir }) as { seeded?: boolean }

  assert(manifest.seeded === true, 'the create home was not freshly seeded')
  // R5: a model name, so `session.create` works; no provider (no prompt is ever sent).
  const configured = hermes(t, ['config', 'set', 'model.default', 'test-model'])

  assert(configured.status === 0, `config set model.default: ${configured.stderr || configured.stdout}`)

  mkdirSync(shots, { recursive: true })
  const s = await launch({ colorScheme: 'light' })
  const { page } = s
  const stacks: string[] = []
  let other: Session | undefined
  let failures = 0
  let projects: ProjectNode[] = []
  const created: { id: string; title: string; style: string; used?: boolean }[] = []
  const root = (projectId: string) => projects.find(each => each.id === projectId)?.path ?? projectId

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
      await page.keyboard.press('Escape')
      await page.keyboard.press('Escape')
      await page.waitForTimeout(300)

      if (!(await page.locator(CANVAS).count())) {
        await backToTree(page).catch(() => undefined)
      }
    }
  )

  /**
   * One create in the style on screen: a right-click in `projectId`'s area, the item, Enter with
   * the default name. Checks the offer, the ghost, the row, the block and the selection.
   */
  const createIn = async (style: string, projectId: string, { snap = false } = {}) => {
    await fit(page)
    const at = await pointInProject(page, projectId, style)
    const before = await storedEntries(s, style, [])
    const zoom = (await viewport(page)).zoom
    const offer = await rightClick(page, at)

    assert(offer.projectId === projectId, `offered ${offer.projectId}, wanted ${projectId}`)
    assert(offer.project === projects.find(each => each.id === projectId)?.label, `the menu names "${offer.project}"`)
    assert(offer.colour && offer.dot === offer.colour, `dot ${offer.dot} vs the project's colour ${offer.colour}`)
    assert(offer.ghost, 'no ghost while the menu is open')

    if (!snap) {
      const ghostCentre = centre(offer.ghost)

      assert(Math.abs(ghostCentre.x - at.x) <= 1.5 && Math.abs(ghostCentre.y - at.y) <= 1.5, `ghost centre ${JSON.stringify(ghostCentre)} vs the click ${JSON.stringify(at)}`)
    }

    await openDialog(page)
    assert((await page.locator(GHOST).count()) === 1, 'the ghost went when the dialog opened')
    const focus = await page.evaluate(() => (document.activeElement as HTMLInputElement | null)?.getAttribute('data-testid'))
    const name = await page.locator(NAME).inputValue()
    const selectedText = await page.evaluate(() => {
      const input = document.activeElement as HTMLInputElement

      return input.value.slice(input.selectionStart ?? 0, input.selectionEnd ?? 0)
    })

    assert(focus === 'session-tree-create-name', `focus in ${focus}`)
    assert(/^New session( \d+)?$/.test(name) && selectedText === name, `name "${name}", selected "${selectedText}"`)
    assert((await page.locator(PROJECT).inputValue()) === projectId, 'the dialog presets the detected project')
    await page.keyboard.press('Enter')
    await dialogClosed(page)
    const row = await waitFor('the created row', () => rowTitled(s, name), value => Boolean(value), 20_000)

    assert(row, 'no row')
    created.push({ id: row.id, title: name, style })
    const id = row.id

    await page.locator(BLOCK(id)).waitFor({ timeout: 20_000 })
    await waitFor('the new block selected', () => selected(page), value => value === id, 10_000)
    const block = (await blockBox(page, id))!
    const flow = (await flowPos(page, id))!

    if (snap) {
      const grid = Number(await page.getAttribute(CANVAS, 'data-grid'))

      assert(flow.x % grid === 0 && flow.y % grid === 0, `snapped spot ${JSON.stringify(flow)} on a ${grid} grid`)
      assert(Math.abs(centre(block).x - at.x) <= (grid / 2) * zoom + 1 && Math.abs(centre(block).y - at.y) <= (grid / 2) * zoom + 1, 'the snapped block is near the click')
    } else {
      assert(Math.abs(centre(block).x - at.x) <= 1 && Math.abs(centre(block).y - at.y) <= 1, `block centre ${JSON.stringify(centre(block))} vs the click ${JSON.stringify(at)}`)
    }

    assert((await page.getAttribute(BLOCK(id), 'data-project-id')) === projectId, `the block's project ${await page.getAttribute(BLOCK(id), 'data-project-id')}`)
    assert(row.cwd === root(projectId), `cwd ${row.cwd}, wanted ${root(projectId)}`)
    assert(row.message_count === 0, `message_count ${row.message_count}`)
    const after = await waitFor('the spot stored', () => storedEntries(s, style, []), value => id in value, 15_000)

    for (const [key, entry] of Object.entries(before)) {
      assert(JSON.stringify(after[key]) === JSON.stringify(entry), `${key} changed: ${JSON.stringify(entry)} → ${JSON.stringify(after[key])}`)
    }

    const kept = await waitFor('the marker stored', () => stored(s), value => (value.kept?.default ?? []).includes(id), 15_000)

    return { id, name, at, flow, offer: { project: offer.project, dot: offer.dot }, kept: kept.kept?.default?.length, unchanged: Object.keys(before).length }
  }

  try {
    await check('sign in two browser contexts (the second dark: another device), enable the desktop half, open the page in both', async () => {
      await signIn(t, page)
      await enableDesktopHalf(t, page)
      await openTree(t, s)
      other = await addContext(s, { colorScheme: 'dark' })
      await signIn(t, other.page)
      await enableDesktopHalf(t, other.page, { via: 'detail' })
      await openTree(t, other)
      projects = await projectsTree(page)
      facts.projects = projects

      return { style: await page.getAttribute(PAGE, 'data-style'), projects: projects.map(each => each.label) }
    })

    const baseline: Record<string, number> = {}

    await check('baseline: the singles containers of all four styles, Show all off', async () => {
      for (const style of [...STYLES, 'swimlanes']) {
        await switchStyle(page, style)
        baseline[style] = await containerCount(page, style)
      }

      await switchStyle(page, 'dense')

      return baseline
    })

    const pick = (style: string) => projects.find(each => !each.isNoProject && each.label === (style === 'subway' ? 'mdesign' : style === 'rich' ? 'hermes-plugins' : 'syscanvas'))!.id

    for (const style of STYLES) {
      await check(`${style}: a right-click on empty canvas in project X's area offers "New session in ● X…" (the dot in X's colour) with the ghost at the spot; Create with the default name makes the row (X's root, 0 messages) and the block centred on the click, selected, in X; every other stored entry unchanged`, async () => {
        await switchStyle(page, style)
        await waitFor('the synced style stored', () => stored(s), value => value.settings.style === style)

        if (style === 'dense') {
          // Screenshots: the menu with the ghost, then the dialog (light).
          await fit(page)
          const at = await pointInProject(page, pick(style), style)

          await rightClick(page, at)
          await page.screenshot({ path: join(shots, 'create-menu-ghost-light.png') })
          await openDialog(page)
          await page.screenshot({ path: join(shots, 'create-dialog-light.png') })
          await page.keyboard.press('Escape')
          await dialogClosed(page)
        }

        const result = await createIn(style, pick(style))

        await page.screenshot({ path: join(shots, `create-${style}-selected-light.png`) })

        return result
      })

      await check(`${style}: the block comes back at the same spot after a reload and in the second browser context`, async () => {
        const mine = created.filter(each => each.style === style).at(-1)!
        const before = await flowPos(page, mine.id)

        await reloadTree(t, s)
        await page.locator(BLOCK(mine.id)).waitFor({ timeout: 20_000 })
        const reloaded = await flowPos(page, mine.id)

        await other!.page.waitForFunction(([p, id]) => document.querySelector(p)?.getAttribute('data-style') === id, [PAGE, style] as const, { timeout: 20_000 })
        await other!.page.locator(BLOCK(mine.id)).waitFor({ timeout: 30_000 })
        const there = await flowPos(other!.page, mine.id)

        assert(JSON.stringify(reloaded) === JSON.stringify(before), `after a reload ${JSON.stringify(reloaded)} vs ${JSON.stringify(before)}`)
        assert(JSON.stringify(there) === JSON.stringify(before), `in the other context ${JSON.stringify(there)} vs ${JSON.stringify(before)}`)

        return { before, reloaded, there }
      })
    }

    await check('Snap on (Dense): the new block\u2019s top-left is on the grid, near the click', async () => {
      await switchStyle(page, 'dense')
      await clickToolbar(page, 'session-tree-snap')
      await waitFor('snap stored', () => stored(s), value => value.settings.snap === true)
      const result = await createIn('dense', pick('dense'), { snap: true })

      await clickToolbar(page, 'session-tree-snap')
      await waitFor('snap off stored', () => stored(s), value => value.settings.snap === false)

      return result
    })

    await check('the created rows: ended and not active (the runtime was released, R2), and counted by Settings\u2019 "Delete empty sessions" while unused (D6)', async () => {
      const rows = await rowsOf(s, 'default', false)
      const mine = created.map(each => rows.find(row => row.id === each.id))
      const count = await api<{ count: number }>(s, '/api/sessions/empty/count')

      assert(mine.every(row => row && row.ended_at && row.is_active === false), JSON.stringify(mine.map(row => [row?.id, row?.ended_at, row?.is_active])))
      assert(count.count >= created.length, `empty count ${count.count} < ${created.length}`)

      return { created: created.length, emptyCount: count.count, source: mine[0]?.source }
    })

    await check('Show all off: every created block stays on the canvas in all four styles (also after Show all on and off), and is in no singles container', async () => {
      const seen: Record<string, unknown> = {}

      for (const style of ['dense', 'subway', 'rich', 'swimlanes']) {
        await switchStyle(page, style)

        for (const round of ['off', 'on', 'off']) {
          if (round === 'on' || (round === 'off' && seen[`${style}:on`])) {
            await clickToolbar(page, 'session-tree-show-all')
          }

          const onCanvas = await page.$$eval('.react-flow__node', (nodes, ids) => ids.filter(id => nodes.some(node => node.getAttribute('data-id') === id)), created.map(each => each.id))

          assert(onCanvas.length === created.length, `${style}, Show all ${round}: ${onCanvas.length} of ${created.length} on the canvas`)
          seen[`${style}:${round}`] = onCanvas.length
        }

        const count = await containerCount(page, style)

        assert(count === baseline[style], `${style}: the singles container shows ${count}, before ${baseline[style]}`)
        seen[`${style}:container`] = count
      }

      await switchStyle(page, 'dense')

      return seen
    })

    await check('Swimlanes: a right-click in lane Y offers Y (ghost in lane Y at "now"); the block lands in lane Y at "now"', async () => {
      await switchStyle(page, 'swimlanes')
      await fit(page)
      const lane = page.locator('[data-testid="session-tree-lane-band"]').nth(1)
      const laneKey = await lane.getAttribute('data-lane')
      const band = (await lane.boundingBox())!
      const now = (await page.locator('[data-testid="session-tree-now-line"]').boundingBox())!
      const at = await emptyIn(page, { x: band.x + 40, y: band.y + 4, width: Math.max(10, now.x - band.x - 120), height: band.height - 8 })

      assert(laneKey && at, `lane ${laneKey}, spot ${JSON.stringify(at)}`)
      const offer = await rightClick(page, at)

      assert(offer.projectId === laneKey, `offered ${offer.projectId} in lane ${laneKey}`)
      assert(offer.ghost && offer.ghost.y >= band.y - 1 && offer.ghost.y + offer.ghost.height <= band.y + band.height + 1, `ghost ${JSON.stringify(offer.ghost)} in lane ${JSON.stringify(band)}`)
      assert(Math.abs(offer.ghost.x - now.x) <= 3, `ghost x ${offer.ghost.x} vs now ${now.x}`)
      await openDialog(page)
      const name = await page.locator(NAME).inputValue()

      await page.locator(SUBMIT).click()
      await dialogClosed(page)
      const row = await waitFor('the created row', () => rowTitled(s, name), value => Boolean(value), 20_000)

      created.push({ id: row!.id, title: name, style: 'swimlanes' })
      await page.locator(BLOCK(row!.id)).waitFor({ timeout: 20_000 })
      await waitFor('the new block selected', () => selected(page), value => value === row!.id, 10_000)
      const block = (await blockBox(page, row!.id))!
      const bandAfter = (await page.locator(`[data-testid="session-tree-lane-band"][data-lane="${laneKey}"]`).boundingBox())!
      const nowAfter = (await page.locator('[data-testid="session-tree-now-line"]').boundingBox())!

      assert(block.y >= bandAfter.y - 1 && block.y + block.height <= bandAfter.y + bandAfter.height + 1, `block ${JSON.stringify(block)} not in lane ${JSON.stringify(bandAfter)}`)
      assert(Math.abs(block.x - nowAfter.x) <= 4, `block x ${block.x} vs now ${nowAfter.x}`)
      assert(row!.cwd === root(laneKey), `cwd ${row!.cwd}`)

      return { lane: laneKey, blockX: block.x, nowX: nowAfter.x }
    })

    await check('a project scope: a right-click over a dimmed project\u2019s area offers the scoped project, and creates in it', async () => {
      await switchStyle(page, 'dense')
      const scoped = projects.find(each => each.label === 'mdesign')!
      const dimmed = projects.find(each => each.label === 'syscanvas')!

      await setScope(page, scoped.label)
      await fit(page)
      const label = (await labels(page)).find(each => each.projectId === dimmed.id)

      assert(label?.dimmed, `the ${dimmed.label} label is not dimmed`)
      const at = await pointInProject(page, dimmed.id, 'dense')
      const offer = await rightClick(page, at)

      assert(offer.projectId === scoped.id, `offered ${offer.projectId} over ${dimmed.label}`)
      await openDialog(page)
      const name = await page.locator(NAME).inputValue()

      await page.keyboard.press('Enter')
      await dialogClosed(page)
      const row = await waitFor('the created row', () => rowTitled(s, name), value => Boolean(value), 20_000)

      created.push({ id: row!.id, title: name, style: 'dense' })
      await page.locator(BLOCK(row!.id)).waitFor({ timeout: 20_000 })
      await waitFor('the new block selected', () => selected(page), value => value === row!.id, 10_000)
      assert(row!.cwd === root(scoped.id), `cwd ${row!.cwd}`)
      assert((await page.getAttribute(BLOCK(row!.id), 'data-out-of-scope')) === null, 'the block is dimmed')
      await setScope(page, null)

      return { offered: offer.project, cwd: row!.cwd }
    })

    await check('the dialog: picking another project creates in that one (the ghost follows its colour; the spot stays)', async () => {
      await fit(page)
      const from = projects.find(each => each.label === 'syscanvas')!
      const to = projects.find(each => each.label === 'hermes-plugins')!
      const at = await pointInProject(page, from.id, 'dense')

      await rightClick(page, at)
      await openDialog(page)
      const ghostBefore = await page.locator(GHOST).boundingBox()

      await page.locator(PROJECT).selectOption(to.id)
      await page.waitForTimeout(200)
      const ghostAfter = await page.locator(GHOST).boundingBox()

      assert((await page.getAttribute(GHOST, 'data-project-id')) === to.id, 'the ghost did not follow the project')
      assert(JSON.stringify(ghostBefore) === JSON.stringify(ghostAfter), 'the ghost moved')
      await page.locator(NAME).fill('Picked another project')
      await page.locator(SUBMIT).click()
      await dialogClosed(page)
      const row = await waitFor('the created row', () => rowTitled(s, 'Picked another project'), value => Boolean(value), 20_000)

      created.push({ id: row!.id, title: row!.title!, style: 'dense' })
      await page.locator(BLOCK(row!.id)).waitFor({ timeout: 20_000 })
      const block = (await blockBox(page, row!.id))!

      assert(row!.cwd === root(to.id), `cwd ${row!.cwd}`)
      assert((await page.getAttribute(BLOCK(row!.id), 'data-project-id')) === to.id, 'the block is not in the picked project')
      assert(Math.abs(centre(block).x - at.x) <= 1 && Math.abs(centre(block).y - at.y) <= 1, 'the block is not at the click')

      return { cwd: row!.cwd }
    })

    await check('the dialog: a name another loaded session holds shows inline and keeps Create disabled (nothing is sent)', async () => {
      const ids = new Set((await rowsOf(s, 'default', true)).map(row => row.id))
      const taken = (await rowsOf(s, 'default', false)).find(row => (row.message_count ?? 0) > 0 && row.title)!.title!

      await fit(page)
      await rightClick(page, await pointInProject(page, projects.find(each => each.label === 'syscanvas')!.id, 'dense'))
      await openDialog(page)
      await page.locator(NAME).fill(`  ${taken} `)
      await page.waitForTimeout(150)
      const error = await page.locator('[data-testid="session-tree-create-error"]').getAttribute('data-kind')
      const disabled = await page.locator(SUBMIT).isDisabled()

      await page.keyboard.press('Enter')
      await page.waitForTimeout(1500)
      const after = (await rowsOf(s, 'default', true)).map(row => row.id).filter(id => !ids.has(id))

      assert(error === 'taken' && disabled, `error ${error}, disabled ${disabled}`)
      assert((await page.locator(DIALOG).count()) === 1, 'the dialog closed')
      assert(after.length === 0, `new rows ${after}`)
      // Too long, then empty.
      await page.locator(NAME).fill('x'.repeat(101))
      const long = await page.locator('[data-testid="session-tree-create-error"]').innerText()

      await page.locator(NAME).fill('   ')
      const empty = await page.locator(SUBMIT).isDisabled()

      assert(/max 100/.test(long) && empty, `long: ${long}; empty disabled: ${empty}`)
      await page.keyboard.press('Escape')
      await dialogClosed(page)

      return { taken, long }
    })

    await check('the dialog: a name only the server refuses (an archived session holds it) shows the error, keeps the dialog open and leaves no row', async () => {
      const all = await rowsOf(s, 'default', true)
      const archived = all.find(row => row.archived && row.title)

      assert(archived, 'no archived titled fixture')
      const ids = new Set(all.map(row => row.id))

      await fit(page)
      await rightClick(page, await pointInProject(page, projects.find(each => each.label === 'syscanvas')!.id, 'dense'))
      await openDialog(page)
      await page.locator(NAME).fill(archived.title!)
      await page.locator(SUBMIT).click()
      await page.locator('[data-testid="session-tree-create-error"][data-kind="server"]').waitFor({ timeout: 20_000 })
      const text = await page.locator('[data-testid="session-tree-create-error"]').innerText()

      assert((await page.locator(DIALOG).count()) === 1, 'the dialog closed')
      assert((await page.locator(GHOST).count()) === 1, 'the ghost went')
      const left = await waitFor(
        'no row left',
        async () => (await rowsOf(s, 'default', true)).filter(row => !ids.has(row.id)).map(row => [row.id, row.title, row.message_count]),
        value => value.length === 0,
        15_000
      )

      await page.keyboard.press('Escape')
      await dialogClosed(page)

      return { refused: archived.title, text, left }
    })

    await check('after a refusal the server answers, focus is back in Name with its text selected, and Enter retries without a click', async () => {
      await instrument(page)
      const all = await rowsOf(s, 'default', true)
      const archived = all.find(row => row.archived && row.title)!
      const ids = new Set(all.map(row => row.id))
      const ERROR = '[data-testid="session-tree-create-error"][data-kind="server"]'
      const creates = async () => (await probe(page)).calls.filter(method => method === 'session.create').length
      const settled = () => waitFor('the attempt settled', () => page.locator(SUBMIT).innerText(), text => text.trim() === 'Create', 20_000)

      await fit(page)
      await rightClick(page, await pointInProject(page, projects.find(each => each.label === 'syscanvas')!.id, 'dense'))
      await openDialog(page)
      await page.locator(NAME).fill(archived.title!)
      const before = await creates()

      await page.keyboard.press('Enter')
      await page.locator(ERROR).waitFor({ timeout: 20_000 })
      await settled()
      await page.waitForTimeout(300)
      const first = await focusState(page)

      assert(first.testId === 'session-tree-create-name', `focus after the refusal: ${first.tag} ${first.testId}`)
      assert(first.value === archived.title && first.selected === first.value, `value "${first.value}", selected "${first.selected}"`)
      // Enter, no click: the same name again is a second attempt (refused again).
      await page.keyboard.press('Enter')
      await waitFor('a second create', creates, count => count === before + 2, 20_000)
      await page.locator(ERROR).waitFor({ timeout: 20_000 })
      await settled()
      await page.waitForTimeout(300)
      const second = await focusState(page)

      assert(second.testId === 'session-tree-create-name' && second.selected === second.value, `focus after the retry: ${second.tag} ${second.testId}, selected "${second.selected}"`)
      const left = await waitFor('no row left', async () => (await rowsOf(s, 'default', true)).filter(row => !ids.has(row.id)).map(row => row.id), value => value.length === 0, 15_000)

      await page.keyboard.press('Escape')
      await dialogClosed(page)
      await dismissToasts(page)

      return { first, second, creates: (await creates()) - before, left }
    })

    await check('a title that lands but answers an error counts as created: the dialog closes, the block is at the spot, selected, kept with Show all off, and a warning toast says so', async () => {
      await instrument(page)
      await switchStyle(page, 'dense')
      await fit(page)
      const showAll = await page.getAttribute('[data-testid="session-tree-show-all"]', 'aria-pressed')
      const at = await pointInProject(page, pick('dense'), 'dense')
      const title = 'Landed with an error'

      await rightClick(page, at)
      await openDialog(page)
      await page.locator(NAME).fill(title)
      await setMode(page, { 'session.title': { code: -32603, message: 'internal error' } })

      try {
        await page.keyboard.press('Enter')
        await waitFor('the dialog closed', () => page.locator(DIALOG).count(), count => count === 0, 20_000)
      } finally {
        await setMode(page, {})
      }

      const row = await waitFor('the created row', () => rowTitled(s, title), value => Boolean(value), 20_000)

      created.push({ id: row!.id, title, style: 'dense' })
      const id = row!.id

      await page.locator(BLOCK(id)).waitFor({ timeout: 20_000 })
      await waitFor('the new block selected', () => selected(page), value => value === id, 10_000)
      const block = (await blockBox(page, id))!
      const kept = await waitFor('the marker stored', () => stored(s), value => (value.kept?.default ?? []).includes(id), 15_000)
      const notices = (await probe(page)).notices
      const warning = notices.find(each => each.kind === 'warning')
      const calls = (await probe(page)).calls

      assert(showAll !== 'true', `Show all is ${showAll}`)
      assert(Math.abs(centre(block).x - at.x) <= 1 && Math.abs(centre(block).y - at.y) <= 1, `block centre ${JSON.stringify(centre(block))} vs the click ${JSON.stringify(at)}`)
      assert(row!.message_count === 0 && row!.ended_at, `row ${JSON.stringify([row!.message_count, row!.ended_at])}`)
      assert(warning && /error while naming/i.test(warning.message ?? '') && /internal error/.test(warning.message ?? ''), `notices ${JSON.stringify(notices)}`)
      assert(calls.includes('session.title') && (calls.includes('session.detach') || calls.includes('session.close')), `calls ${calls}`)
      const toast = await page.getByText(/error while naming/i).first().waitFor({ timeout: 5000 }).then(() => true, () => false)

      assert(toast, 'no warning toast on screen')
      await dismissToasts(page)

      return { id, warning, kept: kept.kept?.default?.length, showAll }
    })

    await check('the dialog: Tab from Name to Project shows a keyboard focus ring on Project that matches Name\u2019s (light and dark)', async () => {
      const out: Record<string, unknown> = {}

      for (const [theme, p] of [['light', page], ['dark', other!.page]] as const) {
        await p.waitForFunction(([sel]) => document.querySelector(sel)?.getAttribute('data-style') === 'dense', [PAGE] as const, { timeout: 20_000 })
        await fit(p)
        await rightClick(p, await pointInProject(p, pick('dense'), 'dense'))
        await openDialog(p)
        await p.mouse.move(2, 2)
        await p.keyboard.press('Tab')
        await p.waitForTimeout(400)
        const onProject = await focusState(p)
        const projectFocused = await ringStyle(p, PROJECT)
        const nameUnfocused = await ringStyle(p, NAME)

        await p.keyboard.press('Shift+Tab')
        await p.waitForTimeout(400)
        const onName = await focusState(p)
        const nameFocused = await ringStyle(p, NAME)
        const projectUnfocused = await ringStyle(p, PROJECT)
        const ring = RING_PROPS.filter(prop => nameFocused[prop] !== nameUnfocused[prop])

        await p.keyboard.press('Tab')
        await p.waitForTimeout(400)
        await p.locator(DIALOG).screenshot({ path: join(shots, `create-project-focus-${theme}.png`) })
        await p.keyboard.press('Escape')
        await p.locator(DIALOG).waitFor({ state: 'detached', timeout: 30_000 })
        assert(onProject.testId === 'session-tree-create-project' && onName.testId === 'session-tree-create-name', `${theme}: focus ${onProject.testId} / ${onName.testId}`)
        assert(ring.length > 0, `${theme}: Name shows no focus change ${JSON.stringify({ nameFocused, nameUnfocused })}`)

        // Every property of Name's ring is the same on the focused Project; and Project's focus
        // is visible (at least one of them differs from Project unfocused).
        for (const prop of ring) {
          assert(projectFocused[prop] === nameFocused[prop], `${theme}: Project's focused ${prop} ${projectFocused[prop]} vs Name's ${nameFocused[prop]}`)
        }

        assert(
          ring.some(prop => projectFocused[prop] !== projectUnfocused[prop]),
          `${theme}: Project shows no focus change ${JSON.stringify({ projectFocused, projectUnfocused })}`
        )

        out[theme] = { ring: Object.fromEntries(ring.map(prop => [prop, nameFocused[prop]])), projectUnfocused: Object.fromEntries(ring.map(prop => [prop, projectUnfocused[prop]])) }
      }

      return out
    })

    await check('Subway: a right-click on the map key does what one on the depot does (no "New session", no ghost); just outside the key it is still offered', async () => {
      try {
        await switchStyle(page, 'subway')
        await fit(page)
        await instrument(page)
        const KEY = '[data-testid="session-tree-map-key"]'
        const key = (await page.locator(KEY).boundingBox())!
        const depot = (await page.locator('[data-testid="session-tree-depot"]').boundingBox())!
        const at = async (point: Point) => {
          await page.evaluate(() => {
            ;(globalThis as unknown as { __stE2e: Probe }).__stE2e.context = null
          })
          const under = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('[data-testid]')?.getAttribute('data-testid') ?? null, [point.x, point.y] as const)

          await page.mouse.click(point.x, point.y, { button: 'right' })
          await page.waitForTimeout(700)
          const result = {
            canvasMenu: await page.locator(CANVAS_MENU).count(),
            newSession: await page.locator(NEW_ITEM).count(),
            blockMenu: await page.locator(MENU).count(),
            ghost: await page.locator(GHOST).count(),
            prevented: (await probe(page)).context?.prevented ?? null
          }

          await page.keyboard.press('Escape')
          await page.keyboard.press('Escape')
          await page.waitForTimeout(300)

          return { under, result }
        }
        const onDepot = await at({ x: depot.x + depot.width / 2, y: depot.y + Math.min(10, depot.height / 2) })
        const onKey = await at(centre(key))
        const outside =
          (await emptyIn(page, { x: key.x - 60, y: key.y + 4, width: 50, height: key.height - 8 }, 2)) ?? (await emptyIn(page, { x: key.x + 4, y: key.y - 60, width: key.width - 8, height: 50 }, 2))

        assert(onKey.under !== 'session-tree-map-key', 'the key is hit-testable (pointer-events changed)')
        assert(onKey.result.newSession === 0 && onKey.result.ghost === 0, `on the key: ${JSON.stringify(onKey)}`)
        assert(JSON.stringify(onKey.result) === JSON.stringify(onDepot.result), `key ${JSON.stringify(onKey.result)} vs depot ${JSON.stringify(onDepot.result)}`)
        assert(outside, 'no empty spot next to the key')
        const offer = await rightClick(page, outside)

        await page.keyboard.press('Escape')
        await page.locator(CANVAS_MENU).waitFor({ state: 'detached', timeout: 5000 })
        const ghostAfter = await page.locator(GHOST).count()

        assert(offer.ghost && ghostAfter === 0, `outside: ghost ${JSON.stringify(offer.ghost)}, after Escape ${ghostAfter}`)

        return { key, onDepot, onKey, outside, offered: offer.project }
      } finally {
        await page.keyboard.press('Escape')
        await switchStyle(page, 'dense')
      }
    })

    await check('Escape (menu and dialog) and Cancel create nothing and remove the ghost', async () => {
      const ids = new Set((await rowsOf(s, 'default', true)).map(row => row.id))
      const at = await pointInProject(page, projects.find(each => each.label === 'syscanvas')!.id, 'dense')

      await rightClick(page, at)
      await page.keyboard.press('Escape')
      await page.locator(CANVAS_MENU).waitFor({ state: 'detached', timeout: 5000 })
      const afterMenu = await page.locator(GHOST).count()

      await rightClick(page, at)
      await openDialog(page)
      await page.keyboard.press('Escape')
      await dialogClosed(page)
      const afterEscape = await page.locator(GHOST).count()

      await rightClick(page, at)
      await openDialog(page)
      await page.locator('[data-testid="session-tree-create-cancel"]').click()
      await dialogClosed(page)
      const afterCancel = await page.locator(GHOST).count()

      await sleep(1500)
      const added = (await rowsOf(s, 'default', true)).filter(row => !ids.has(row.id))

      assert(afterMenu === 0 && afterEscape === 0 && afterCancel === 0, `ghosts: ${afterMenu}, ${afterEscape}, ${afterCancel}`)
      assert(added.length === 0, `rows added: ${added.map(row => row.id)}`)

      return { ghosts: [afterMenu, afterEscape, afterCancel] }
    })

    await check('Space in the Name field is typing, never a pan', async () => {
      await rightClick(page, await pointInProject(page, projects.find(each => each.label === 'syscanvas')!.id, 'dense'))
      await openDialog(page)
      const before = await viewport(page)

      await page.locator(NAME).fill('')
      await page.keyboard.type('two words')
      const value = await page.locator(NAME).inputValue()
      const after = await viewport(page)

      await page.keyboard.press('Escape')
      await dialogClosed(page)
      assert(value === 'two words', `typed "${value}"`)
      assert(JSON.stringify(before) === JSON.stringify(after), 'the canvas panned')

      return value
    })

    await check('a double click on Create makes exactly one session', async () => {
      await fit(page)
      await rightClick(page, await pointInProject(page, projects.find(each => each.label === 'syscanvas')!.id, 'dense'))
      await openDialog(page)
      await page.locator(NAME).fill('Double clicked once')
      await page.locator(SUBMIT).dblclick()
      await dialogClosed(page)
      await sleep(2500)
      const rows = (await rowsOf(s, 'default', true)).filter(row => row.title === 'Double clicked once')
      const untitled = (await rowsOf(s, 'default', true)).filter(row => !row.title && (row.message_count ?? 0) === 0 && (row.started_at ?? 0) > Date.now() / 1000 - 60)

      assert(rows.length === 1, `${rows.length} sessions`)
      assert(untitled.length === 0, `untitled empty rows: ${untitled.map(row => row.id)}`)
      created.push({ id: rows[0].id, title: rows[0].title!, style: 'dense' })

      return { id: rows[0].id }
    })

    await check('No project: created without a cwd (the gateway\u2019s home), in the no-project group', async () => {
      await fit(page)
      await rightClick(page, await pointInProject(page, projects.find(each => each.label === 'syscanvas')!.id, 'dense'))
      await openDialog(page)
      await page.locator(PROJECT).selectOption(NO_PROJECT_ID)
      await page.locator(NAME).fill('Loose thought')
      await page.locator(SUBMIT).click()
      await dialogClosed(page)
      const row = await waitFor('the created row', () => rowTitled(s, 'Loose thought'), value => Boolean(value), 20_000)

      created.push({ id: row!.id, title: 'Loose thought', style: 'dense' })
      await page.locator(BLOCK(row!.id)).waitFor({ timeout: 20_000 })
      const project = await page.getAttribute(BLOCK(row!.id), 'data-project-id')
      const roots = projects.map(each => each.path).filter((path): path is string => Boolean(path))

      assert(row!.cwd && !roots.some(path => row!.cwd === path || row!.cwd!.startsWith(`${path}/`)), `cwd ${row!.cwd} is a project's`)
      assert(project === NO_PROJECT_ID || project === '', `the block's project: ${project}`)

      return { cwd: row!.cwd, project }
    })

    await check('a right-click on a session block still opens the unchanged block menu; on a dimmed block or a stand-in, no menu at all', async () => {
      await fit(page)
      const target = (await rowsOf(s, 'default', false)).find(row => row.id === 'st-sys-comments') ? 'st-sys-comments' : created[0].id
      const block = (await blockBox(page, target))!

      await page.mouse.click(block.x + 30, block.y + block.height / 2, { button: 'right' })
      await page.locator(`${MENU}[data-node-id="${target}"]`).waitFor({ timeout: 5000 })
      const items = await menuItemTexts(page)

      await page.keyboard.press('Escape')
      await page.waitForTimeout(300)
      assert(JSON.stringify(items) === JSON.stringify(MENU_ORDER), `items ${JSON.stringify(items)}`)
      assert((await page.locator(CANVAS_MENU).count()) === 0, 'the canvas menu opened on a block')
      await setScope(page, 'syscanvas')
      await fit(page)
      const dim = (await page.locator(BLOCK('st-hp-root')).boundingBox())!

      await page.mouse.click(dim.x + 30, dim.y + dim.height / 2, { button: 'right' })
      await page.waitForTimeout(400)
      const onDimmed = (await page.locator(MENU).count()) + (await page.locator(CANVAS_MENU).count())

      await setScope(page, null)
      await fit(page)
      const standin = (await page.locator('[data-testid="session-tree-standin"]').first().boundingBox())!

      await page.mouse.click(standin.x + 20, standin.y + standin.height / 2, { button: 'right' })
      await page.waitForTimeout(400)
      const onStandin = (await page.locator(MENU).count()) + (await page.locator(CANVAS_MENU).count())

      assert(onDimmed === 0 && onStandin === 0, `menus: dimmed ${onDimmed}, stand-in ${onStandin}`)

      return { items: items.length, onDimmed, onStandin }
    })

    await check('screenshots in the dark context: the menu with the ghost, the dialog, the created block selected', async () => {
      const p = other!.page

      await p.waitForFunction(([sel]) => document.querySelector(sel)?.getAttribute('data-style') === 'dense', [PAGE] as const, { timeout: 20_000 })
      await fit(p)
      const label = (await labels(p)).find(each => each.projectId === pick('dense'))!
      const at = (await emptyIn(p, { x: label.x + label.width + 30, y: label.y + label.height / 2 - 2, width: 600, height: 4 }, 2))!

      await p.mouse.click(at.x, at.y, { button: 'right' })
      await p.locator(NEW_ITEM).waitFor({ timeout: 5000 })
      await p.waitForTimeout(200)
      await p.screenshot({ path: join(shots, 'create-menu-ghost-dark.png') })
      await p.locator(NEW_ITEM).click()
      await p.locator(DIALOG).waitFor({ timeout: 5000 })
      await p.waitForTimeout(250)
      await p.screenshot({ path: join(shots, 'create-dialog-dark.png') })
      await p.locator(NAME).fill('Made in the dark')
      await p.keyboard.press('Enter')
      await p.locator(DIALOG).waitFor({ state: 'detached', timeout: 30_000 })
      const row = await waitFor('the created row', () => rowTitled(s, 'Made in the dark'), value => Boolean(value), 20_000)

      created.push({ id: row!.id, title: 'Made in the dark', style: 'dense' })
      await p.locator(BLOCK(row!.id)).waitFor({ timeout: 20_000 })
      await p.waitForFunction(([c, id]) => document.querySelector(c)?.getAttribute('data-selected') === id, [CANVAS, row!.id] as const, { timeout: 10_000 })
      await p.waitForTimeout(300)
      await p.screenshot({ path: join(shots, 'create-dense-selected-dark.png') })
      // The first device follows (synced marker and spot).
      await page.locator(BLOCK(row!.id)).waitFor({ timeout: 30_000 })

      return { id: row!.id }
    })

    await check('D6: the core\u2019s DELETE /api/sessions/empty removes the unused created sessions; their blocks and markers go', async () => {
      const ids = created.map(each => each.id)
      const before = await api<{ count: number }>(s, '/api/sessions/empty/count?profile=default')
      // Measured: with the gateway running, the route is refused (the store's exclusive
      // maintenance is held by the gateway runtime), so the core handler runs with it stopped.
      const online = await api<unknown>(s, '/api/sessions/empty?profile=default', { method: 'DELETE' }).then(
        answer => JSON.stringify(answer),
        (error: unknown) => String(error).slice(0, 160)
      )

      await other?.context.close().catch(() => undefined)
      other = undefined
      await page.goto('about:blank')
      stopGateway(t)
      const offline = JSON.parse(
        execFileSync(t.launcher, ['--run-path', join(REPO, 'scripts', 'e2e', 'core-delete-empty.py'), 'default'], { cwd: t.root, env: isolatedEnv(t), encoding: 'utf8', timeout: 120_000 })
          .trim()
          .split('\n')
          .pop()!
      ) as { before: number; deleted: number; after: number }

      await signIn(t, page)
      await openTree(t, s).catch(async () => {
        await enableDesktopHalf(t, page)
        await openTree(t, s)
      })
      const left = (await rowsOf(s, 'default', true)).filter(row => ids.includes(row.id))

      assert(left.length === 0, `rows left: ${left.map(row => row.id)}`)
      await sleep(1500)
      const blocks = await page.$$eval('.react-flow__node', (nodes, wanted) => nodes.map(node => node.getAttribute('data-id')).filter(id => wanted.includes(id ?? '')), ids)
      const kept = await waitFor('the markers pruned', () => stored(s), value => !(value.kept?.default ?? []).some(id => ids.includes(id)), 15_000)

      assert(blocks.length === 0, `blocks left: ${blocks}`)
      assert(offline.deleted >= ids.length, `deleted ${offline.deleted} of ${ids.length}`)

      return { emptyBefore: before.count, online, offline, kept: kept.kept ?? null }
    })

    await check('no page errors from the plugin in either context', () => {
      const fromPlugin = stacks.filter(stack => /blob:|session-tree|desktop-plugins/.test(stack))

      assert(fromPlugin.length === 0, fromPlugin.join('\n'))
      assert(s.errors.length === 0 && (other?.errors.length ?? 0) === 0, [...s.errors, ...(other?.errors ?? [])].join('\n'))
    })
  } finally {
    facts.created = created
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

  writeFileSync(join(t.root, 'e2e-create-facts.json'), `${JSON.stringify({ results, facts, base: webappBase(t) }, null, 2)}\n`)
  const failed = results.filter(r => !r.ok)

  console.log(`\ne2e-create: ${results.length - failed.length} passed, ${failed.length} failed (screenshots: ${shots})`)
  process.exitCode = failed.length === 0 ? 0 : 1
}

await main()
