/**
 * e2e — Session Tree 3/7: the session actions (R14) from the graph, against the isolated test
 * Hermes. It mutates its fixtures, so it runs in its own fresh test home of the role
 * (`c<card>-<role>-actions`, the role's port block), moved to the e2e trash first; the shared
 * home of the other suites is never written.
 *
 *   node scripts/e2e-actions.ts      (part of `npm run test:e2e`)
 *   KEEP_RUNNING=1 …                  leaves the test gateway up afterwards
 *
 * Every effect is read back: the backend's own `/sessions` and export, the core REST detail,
 * `host.sessions`' stores (localStorage), the clipboard, the downloaded file. Input is real
 * (page.mouse / page.keyboard → CDP Input.*). Screenshots go to <test root>/shots/.
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Locator, Page, Route } from 'playwright-core'

import type { SessionRow, SessionsResponse } from '../src/model/sessions.ts'
import { close, enableDesktopHalf, goto, launch, signIn } from './e2e/browser.ts'
import type { Session } from './e2e/browser.ts'
import { seedFixtures, setup, signInLink, stopGateway, stopRoleHomes, testHermes, testHermesPids, webappBase } from './e2e/harness.ts'
import { moveAside } from './e2e/trash.ts'
import { diffSnapshots, snapshotRealHermes } from './e2e/real-hermes-guard.ts'

const t = testHermes(undefined, { variant: 'actions' })
const shots = join(t.root, 'shots')
const results: { name: string; ok: boolean; detail?: string }[] = []
const facts: Record<string, unknown> = {}

/** The R14 items in the app's order (session-actions-menu.tsx, row surface, without the Open group). */
const MENU_ORDER = ['Rename…', 'Pin', 'Mark as unread', 'Appearance', 'Copy ID', '—', 'Branch', 'Export', 'Move to project', '—', 'Archive', 'Delete']

/** After a failed check: close whatever menu or dialog it left open, so the next one can run. */
let afterFailure: (() => Promise<void>) | undefined

async function check(name: string, fn: () => Promise<unknown> | unknown): Promise<void> {
  try {
    const detail = await fn()

    results.push({ name, ok: true, detail: detail === undefined ? undefined : JSON.stringify(detail) })
    console.log(`  ✔ ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`)
  } catch (error) {
    results.push({ name, ok: false, detail: String(error instanceof Error ? error.message : error) })
    console.log(`  ✖ ${name} — ${error instanceof Error ? error.message : error}`)
    await afterFailure?.().catch(() => undefined)
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

// --- page helpers ------------------------------------------------------------------------------

const BLOCK = (id: string) => `[data-testid="session-tree-block"][data-session-id="${id}"]`
const MENU = '[data-testid="session-tree-menu"]'
const ITEM = (action: string) => `${MENU} [data-action="${action}"]`

async function api<T>(s: Session, path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  return s.page.evaluate(
    async ([p, i]) => {
      const bridge = (window as unknown as { hermesDesktop: { api(req: { path: string; method?: string; body?: unknown }): Promise<unknown> } }).hermesDesktop

      return (await bridge.api({ path: p as string, ...(i as object) })) as never
    },
    [path, init] as const
  )
}

async function rowsOf(s: Session, archived = false): Promise<Map<string, SessionRow>> {
  const body = await api<SessionsResponse>(s, `/api/plugins/session-tree/sessions?session_profile=default&include_archived=${archived}&limit=2000`)

  return new Map(body.sessions.map(row => [row.id, row]))
}

async function rowOf(s: Session, id: string, archived = false): Promise<SessionRow | undefined> {
  return (await rowsOf(s, archived)).get(id)
}

async function waitFor<T>(what: string, probe: () => Promise<T>, ok: (value: T) => boolean, timeoutMs = 20_000): Promise<T> {
  const deadline = Date.now() + timeoutMs
  let last: T = await probe()

  while (!ok(last)) {
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for ${what}; last ${JSON.stringify(last)}`)
    }

    await new Promise(resolve => setTimeout(resolve, 400))
    last = await probe()
  }

  return last
}

async function openTree(s: Session): Promise<void> {
  await goto(t, s.page, '/session-tree')
  await s.page.locator('[data-testid="session-tree-canvas"]').waitFor({ timeout: 30_000 })
  await s.page.locator('[data-testid="session-tree-block"]').first().waitFor({ timeout: 30_000 })
  await s.page.waitForFunction(() => document.querySelector('[data-testid="session-tree-page"]')?.getAttribute('data-projects') !== 'loading', undefined, {
    timeout: 30_000
  })
  await s.page.waitForTimeout(500)
}

async function clickToolbar(page: Page, testId: string): Promise<void> {
  await page.locator(`[data-testid="${testId}"]`).click()
  await page.waitForTimeout(300)
}

async function setScope(page: Page, label: string): Promise<void> {
  await page.locator('[data-testid="session-tree-scope"] button', { hasText: label }).first().click()
  await page.waitForTimeout(400)
}

async function fit(page: Page): Promise<void> {
  await clickToolbar(page, 'session-tree-fit')
}

/** Right-click a block (real mouse), and wait for its menu. */
async function openMenu(page: Page, id: string): Promise<Locator> {
  await fit(page)
  const block = page.locator(BLOCK(id))

  await block.scrollIntoViewIfNeeded().catch(() => undefined)
  const box = await block.boundingBox()

  assert(box, `no box for ${id}`)
  await page.mouse.click(box.x + 30, box.y + box.height / 2, { button: 'right' })
  const menu = page.locator(`${MENU}[data-node-id="${id}"]`)

  await menu.waitFor({ timeout: 5000 })
  await page.waitForTimeout(150)

  return menu
}

async function menuItemTexts(page: Page): Promise<string[]> {
  return page.$$eval(`${MENU} > *`, elements =>
    elements.map(element =>
      element.getAttribute('role') === 'separator' || element.getAttribute('data-slot')?.includes('separator') ? '—' : ((element as HTMLElement).innerText ?? '').trim()
    )
  )
}

async function choose(page: Page, action: string): Promise<void> {
  await page.locator(ITEM(action)).click()
  await page.waitForTimeout(250)
}

async function closedMenu(page: Page): Promise<void> {
  await page.locator(MENU).waitFor({ state: 'detached', timeout: 5000 })
}

async function select(page: Page, id: string): Promise<void> {
  await fit(page)
  const box = await page.locator(BLOCK(id)).boundingBox()

  assert(box, `no box for ${id}`)
  await page.mouse.click(box.x + 30, box.y + box.height / 2)
  await page.locator(`[data-testid="session-tree-inspector"][data-selected-id="${id}"]`).waitFor({ timeout: 5000 })
}

async function blockTitle(page: Page, id: string): Promise<string> {
  return ((await page.locator(`${BLOCK(id)} .st-title`).innerText()) ?? '').trim()
}

async function storage(page: Page, key: string): Promise<unknown> {
  return page.evaluate(k => {
    const raw = localStorage.getItem(k)

    try {
      return raw ? JSON.parse(raw) : null
    } catch {
      return raw
    }
  }, key)
}

/** Every localStorage entry whose key starts with `prefix` (connection-scoped stores add a suffix). */
async function storageMatching(page: Page, prefix: string): Promise<Record<string, unknown>> {
  return page.evaluate(p => {
    const out: Record<string, unknown> = {}

    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i) ?? ''

      if (key.startsWith(p)) {
        const raw = localStorage.getItem(key)

        try {
          out[key] = raw ? JSON.parse(raw) : null
        } catch {
          out[key] = raw
        }
      }
    }

    return out
  }, prefix)
}

async function overlapsOf(page: Page, id: string): Promise<string[]> {
  return page.evaluate(target => {
    const rect = (element: Element) => element.getBoundingClientRect()
    const mine = document.querySelector(`.react-flow__node[data-id="${target}"]`)

    if (!mine) {
      return ['(not rendered)']
    }

    const a = rect(mine)

    return [...document.querySelectorAll('.react-flow__node')]
      .filter(node => node !== mine && !(node.getAttribute('data-id') ?? '').startsWith('group:'))
      .filter(node => {
        const b = rect(node)

        return a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5
      })
      .map(node => node.getAttribute('data-id') ?? '')
  }, id)
}

/**
 * A core endpoint's exact response bytes, fetched by the signed-in page (no JSON parse). The
 * request carries this tab's Webapp grant the way the app's own transport does
 * (`lib/browser-transport.ts` `browserFetch`: `X-Hermes-Session-Token` from the tab's
 * `hermes.webapp.session.v1:[origin, basePath]` sessionStorage entry).
 */
async function rawBytes(s: Session, path: string): Promise<Buffer> {
  const base64 = await s.page.evaluate(async p => {
    const key = Object.keys(sessionStorage).find(name => name.startsWith('hermes.webapp.session.v1:'))
    const token = key ? sessionStorage.getItem(key) : null
    const response = await fetch(p, { credentials: 'same-origin', headers: token ? { 'X-Hermes-Session-Token': token } : {} })

    if (!response.ok) {
      throw new Error(`${p}: ${response.status} ${await response.text()}`)
    }

    const bytes = new Uint8Array(await response.arrayBuffer())
    let binary = ''

    for (const byte of bytes) {
      binary += String.fromCharCode(byte)
    }

    return btoa(binary)
  }, path)

  return Buffer.from(base64, 'base64')
}

const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')

/**
 * Export *id* through the real menu (right-click → Export), save the download, and compare it
 * byte for byte with the core `GET /api/sessions/{id}/export` (and the backend envelope's sha256).
 */
async function exportBytes(s: Session, id: string, filename: string): Promise<{ file: Buffer; core: Buffer; facts: Record<string, unknown> }> {
  const { page } = s

  await openMenu(page, id)
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 20_000 }), choose(page, 'export')])
  const path = join(t.root, 'tmp', download.suggestedFilename())

  await download.saveAs(path)
  const file = readFileSync(path)
  const core = await rawBytes(s, `/api/sessions/${encodeURIComponent(id)}/export?profile=default`)
  const envelope = await api<{ bytes: number; sha256: string }>(s, `/api/plugins/session-tree/sessions/${encodeURIComponent(id)}/export?session_profile=default`)
  let firstDiff = -1

  for (let index = 0; index < Math.max(file.length, core.length); index += 1) {
    if (file[index] !== core[index]) {
      firstDiff = index
      break
    }
  }

  assert(download.suggestedFilename() === filename, `file name ${download.suggestedFilename()}`)
  assert(file.equals(core), `the file differs from the core export: ${file.length} vs ${core.length} B, first differing byte ${firstDiff}`)
  assert(sha256(file) === sha256(core) && envelope.sha256 === sha256(core) && envelope.bytes === core.length, 'sha256 / size mismatch')

  return { file, core, facts: { file: filename, bytes: file.length, sha256: sha256(file), identical: true } }
}

/** A fresh test home for this mutating suite: the previous one goes to the e2e trash. */
function freshHome(): void {
  stopGateway(t)
  // Card 8 (F5): into the trash, then the trash pruned to the newest copy of each home.
  moveAside(t.root, { log: line => console.log(`  trash: ${line}`) })
}

// --- the suite ---------------------------------------------------------------------------------

async function main(): Promise<void> {
  const realBefore = snapshotRealHermes()

  // The other suites' home of this role uses the same ports: make sure it is not running.
  stopRoleHomes(t)
  freshHome()
  mkdirSync(shots, { recursive: true })
  console.log(`e2e actions — role ${t.role}, home ${t.home}`)
  const manifest = setup(t) as { seeded?: boolean }

  assert(manifest.seeded === true, 'the actions home was not freshly seeded')
  const s = await launch({ colorScheme: 'light' })
  const { page } = s

  await s.context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: webappBase(t) })
  afterFailure = async () => {
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  }

  try {
    await check('sign in, enable the desktop half, open the page', async () => {
      await signIn(t, page)
      await enableDesktopHalf(t, page)
      await openTree(s)

      return { blocks: await page.locator('[data-testid="session-tree-block"]').count() }
    })

    await check('menu: right-click opens the PROJECTS-pane items in the app\'s order and labels (SDK ContextMenu); Esc closes it, focus returns to the canvas', async () => {
      await openMenu(page, 'st-sys-tip')
      const items = await menuItemTexts(page)
      const slot = await page.getAttribute(MENU, 'data-slot')

      assert(JSON.stringify(items) === JSON.stringify(MENU_ORDER), `items ${JSON.stringify(items)}`)
      assert(slot === 'context-menu-content', `not the UI kit's ContextMenuContent: ${slot}`)
      await page.screenshot({ path: join(shots, 'actions-menu.png') })
      await page.keyboard.press('Escape')
      await closedMenu(page)
      const focus = await waitFor(
        'the focus back on the canvas',
        () => page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? document.activeElement?.tagName),
        value => value === 'session-tree-canvas',
        2000
      ).catch(error => String(error))
      // Space then pans (it is not swallowed by a focused control, and clicks nothing).
      const box = await page.locator('[data-testid="session-tree-canvas"]').boundingBox()
      const before = await page.$eval('.react-flow__viewport', el => (el as HTMLElement).style.transform)
      const spot = await page.evaluate(() => {
        const pane = document.querySelector('.react-flow__pane')!.getBoundingClientRect()

        for (let y = pane.top + 20; y < pane.bottom - 60; y += 17) {
          for (let x = pane.left + 20; x < pane.right - 90; x += 23) {
            if ([[x, y], [x + 60, y + 30]].every(([px, py]) => document.elementFromPoint(px, py)?.classList.contains('react-flow__pane'))) {
              return { x, y }
            }
          }
        }

        return null
      })

      assert(box && spot, 'no empty canvas spot')
      await page.mouse.move(spot.x, spot.y)
      await page.keyboard.down('Space')
      await page.mouse.down()
      await page.mouse.move(spot.x + 60, spot.y + 30, { steps: 8 })
      await page.mouse.up()
      await page.keyboard.up('Space')
      const after = await page.$eval('.react-flow__viewport', el => (el as HTMLElement).style.transform)

      assert(focus === 'session-tree-canvas', `focus after Escape: ${focus}`)
      assert(after !== before, 'Space + drag did not pan after the menu closed')
      await fit(page)

      return { items, focus, panned: true }
    })

    await check('the ⋯ button on a hovered block and the inspector\'s ⋯ open the same menu', async () => {
      await fit(page)
      const block = page.locator(BLOCK('st-sys-comments'))

      await block.hover()
      const more = block.locator('[data-testid="session-tree-block-more"]')

      await more.waitFor({ state: 'visible', timeout: 3000 })
      await more.click()
      await page.locator(`${MENU}[data-node-id="st-sys-comments"]`).waitFor({ timeout: 5000 })
      const fromBlock = await menuItemTexts(page)

      await page.keyboard.press('Escape')
      await closedMenu(page)
      await page.locator('[data-testid="session-tree-inspector"][data-selected-id="st-sys-comments"]').waitFor({ timeout: 5000 })
      await page.locator('[data-testid="session-tree-inspector-more"]').click()
      await page.locator(`${MENU}[data-node-id="st-sys-comments"]`).waitFor({ timeout: 5000 })
      const fromInspector = await menuItemTexts(page)

      await page.keyboard.press('Escape')
      await closedMenu(page)
      assert(JSON.stringify(fromBlock) === JSON.stringify(MENU_ORDER) && JSON.stringify(fromInspector) === JSON.stringify(MENU_ORDER), 'different items')

      return { fromBlock: fromBlock.length, fromInspector: fromInspector.length }
    })

    await check('R5/R7: no menu (and no ⋯) on a dimmed out-of-scope block or on a stand-in, and no browser menu either', async () => {
      // Records whether each real right-click's contextmenu event was default-prevented.
      await page.evaluate(() => {
        const w = window as unknown as { __stContext: boolean[] }

        w.__stContext = []
        window.addEventListener('contextmenu', event => w.__stContext.push(event.defaultPrevented))
      })
      await setScope(page, 'syscanvas')
      await fit(page)
      const dim = page.locator(BLOCK('st-hp-root'))
      const dimBox = await dim.boundingBox()

      assert(dimBox, 'no dimmed block')
      await page.mouse.click(dimBox.x + 30, dimBox.y + dimBox.height / 2, { button: 'right' })
      await page.waitForTimeout(400)
      assert((await page.locator(MENU).count()) === 0, 'a menu opened on a dimmed block')
      await dim.hover()
      assert((await dim.locator('[data-testid="session-tree-block-more"]').count()) === 0, 'a dimmed block has a ⋯ button')
      await setScope(page, 'All')
      await fit(page)
      const standin = page.locator('[data-testid="session-tree-standin"]').first()
      const standinBox = await standin.boundingBox()

      assert(standinBox, 'no stand-in')
      await page.mouse.click(standinBox.x + 30, standinBox.y + standinBox.height / 2, { button: 'right' })
      await page.waitForTimeout(400)
      assert((await page.locator(MENU).count()) === 0, 'a menu opened on a stand-in')
      assert((await standin.locator('[data-testid="session-tree-block-more"]').count()) === 0, 'a stand-in has a ⋯ button')
      const prevented = await page.evaluate(() => (window as unknown as { __stContext: boolean[] }).__stContext)

      assert(prevented.length === 2 && prevented.every(Boolean), `browser menu not suppressed: ${JSON.stringify(prevented)}`)

      return { dimmed: 'no menu', standin: 'no menu', defaultPrevented: prevented }
    })

    await check('Appearance ▸: the SDK swatches set the session colour in host.sessions (and No color clears it)', async () => {
      await openMenu(page, 'st-sys-reply')
      await page.locator(ITEM('appearance')).hover()
      await page.locator('[data-testid="session-tree-menu-appearance"]').waitFor({ timeout: 5000 })
      await page.waitForTimeout(250)
      await page.screenshot({ path: join(shots, 'actions-appearance-submenu.png') })
      const swatch = page.locator('[data-testid="session-tree-menu-appearance"] button[aria-label^="hsl"]').nth(3)
      const color = await swatch.getAttribute('aria-label')

      await swatch.click()
      const set = await waitFor('the colour override', () => storage(page, 'hermes.desktop.sessionColors'), value => JSON.stringify(value ?? {}).includes(String(color)))

      await page.keyboard.press('Escape')
      await closedMenu(page)
      await openMenu(page, 'st-sys-reply')
      await page.locator(ITEM('appearance')).hover()
      await page.locator('[data-testid="session-tree-menu-appearance"]').getByRole('button', { name: 'No color' }).click()
      const cleared = await waitFor('the colour cleared', () => storage(page, 'hermes.desktop.sessionColors'), value => !JSON.stringify(value ?? {}).includes('st-sys-reply'))

      await page.keyboard.press('Escape')
      await closedMenu(page)
      assert((set as Record<string, string>)['st-sys-reply'] === color, `colours ${JSON.stringify(set)}`)

      return { color, set, cleared }
    })

    await check('Pin / Unpin: host.sessions.pin (the app\'s pin store and, through its sync, the backend row)', async () => {
      await openMenu(page, 'st-md-katex')
      await choose(page, 'pin')
      await closedMenu(page)
      // `$pinnedSessionIds` is connection-scoped: hermes.desktop.pinnedSessions[<scope>].
      const pins = await waitFor('the pin store', () => storageMatching(page, 'hermes.desktop.pinnedSessions'), value => JSON.stringify(value).includes('st-md-katex'))
      const row = await waitFor('the backend pinned flag', () => rowOf(s, 'st-md-katex'), value => value?.pinned === true, 30_000)

      await page.locator(`${BLOCK('st-md-katex')} .st-pin`).waitFor({ timeout: 10_000 })
      await openMenu(page, 'st-md-katex')
      const label = (await page.locator(ITEM('pin')).innerText()).trim()

      await choose(page, 'pin')
      await waitFor('unpinned', () => storageMatching(page, 'hermes.desktop.pinnedSessions'), value => !JSON.stringify(value).includes('st-md-katex'))
      const after = await waitFor('the backend unpinned', () => rowOf(s, 'st-md-katex'), value => value?.pinned === false, 30_000)

      assert(label === 'Unpin', `second label ${label}`)

      return { pins, pinned: row?.pinned, label, unpinned: after?.pinned }
    })

    await check('Rename… from the menu: a dialog, Enter saves; the title is read back (backend fenced rename)', async () => {
      const backend: string[] = []
      const listener = (request: { url(): string }) => {
        if (/\/sessions\/st-sys-reply\/(rename|mutation-snapshot)/.test(request.url())) {
          backend.push(new URL(request.url()).pathname.split('/').pop() ?? '')
        }
      }

      page.on('request', listener)
      await openMenu(page, 'st-sys-reply')
      await choose(page, 'rename')
      const dialog = page.locator('[data-testid="session-tree-rename-dialog"][data-node-id="st-sys-reply"]')

      await dialog.waitFor({ timeout: 5000 })
      const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))
      const input = page.locator('[data-testid="session-tree-rename-input"]')

      await input.press('Control+A')
      await page.keyboard.type('Permissions: reply and resolve')
      await page.keyboard.press('Enter')
      await dialog.waitFor({ state: 'detached', timeout: 10_000 })
      const row = await waitFor('the renamed row', () => rowOf(s, 'st-sys-reply'), value => value?.title === 'Permissions: reply and resolve')
      const core = await api<{ title: string }>(s, '/api/sessions/st-sys-reply')

      await page.waitForFunction(id => document.querySelector(`[data-session-id="${id}"] .st-title`)?.textContent === 'Permissions: reply and resolve', 'st-sys-reply', { timeout: 10_000 })
      page.off('request', listener)
      assert(focused === 'session-tree-rename-input', `the dialog input did not take the focus (${focused})`)
      assert(JSON.stringify(backend) === JSON.stringify(['mutation-snapshot', 'rename']), `backend calls ${JSON.stringify(backend)}`)

      return { title: row?.title, core: core.title, backend }
    })

    await check('Rename from the inspector button: Save; the title is read back', async () => {
      await select(page, 'st-md-redline')
      await page.locator('[data-testid="session-tree-inspector-actions"] [data-action="rename"]').click()
      await page.locator('[data-testid="session-tree-rename-dialog"][data-node-id="st-md-redline"]').waitFor({ timeout: 5000 })
      await page.locator('[data-testid="session-tree-rename-input"]').fill('Redline diff view')
      await page.locator('[data-testid="session-tree-rename-save"]').click()
      const row = await waitFor('the renamed row', () => rowOf(s, 'st-md-redline'), value => value?.title === 'Redline diff view')

      await page.waitForFunction(() => document.querySelector('[data-testid="session-tree-inspector"] [data-field="title"]')?.textContent === 'Redline diff view', undefined, {
        timeout: 10_000
      })

      return { title: row?.title, block: await blockTitle(page, 'st-md-redline') }
    })

    await check('Rename limits (NB2): a pasted 5,000-character title is not cut; the refusal is shown and the title is unchanged on read-back (also the core\'s 101–400 refusal)', async () => {
      const id = 'st-hp-routing'
      const before = (await rowOf(s, id))?.title
      const renames: number[] = []
      const listener = (response: { url(): string; status(): number }) => {
        if (new RegExp(`/sessions/${id}/rename`).test(response.url())) {
          renames.push(response.status())
        }
      }

      page.on('response', listener)

      try {
        const attempt = async (length: number) => {
          await page.evaluate(text => navigator.clipboard.writeText(text), 'L'.repeat(length))
          const input = page.locator('[data-testid="session-tree-rename-input"]')

          await input.press('Control+A')
          await input.press('Control+V')
          const kept = await input.evaluate(el => (el as HTMLInputElement).value.length)

          await input.press('Enter')
          const error = page.locator('[data-testid="session-tree-rename-error"]')

          await page.waitForFunction(n => document.querySelector('[data-testid="session-tree-rename-error"]')?.textContent?.includes(`(${n} chars`), length, { timeout: 15_000 })

          return { kept, error: (await error.innerText()).trim() }
        }

        await openMenu(page, id)
        await choose(page, 'rename')
        await page.locator(`[data-testid="session-tree-rename-dialog"][data-node-id="${id}"]`).waitFor({ timeout: 5000 })
        const long = await attempt(5000)
        const mid = await attempt(150)
        const open = await page.locator('[data-testid="session-tree-rename-dialog"]').isVisible()

        await page.locator('[data-testid="session-tree-rename-dialog"]').getByRole('button', { name: 'Cancel' }).click()
        await page.locator('[data-testid="session-tree-rename-dialog"]').waitFor({ state: 'detached', timeout: 5000 })
        // The refusals also raised the app's error toasts (as its own rename does); they stay
        // until dismissed and would cover the toolbar.
        const dismiss = page.getByRole('button', { name: 'Dismiss notification' })
        let toasts = 0

        for (; toasts < 10 && (await dismiss.count()) > 0; toasts += 1) {
          await dismiss.first().click()
          await page.waitForTimeout(300)
        }
        assert((await dismiss.count()) === 0, 'error toasts left')
        const after = (await rowOf(s, id))?.title
        const core = await api<{ title: string }>(s, `/api/sessions/${id}`)

        assert(long.kept === 5000 && mid.kept === 150, `the input cut the paste: ${long.kept}, ${mid.kept}`)
        assert(long.error === 'Title too long (5000 chars, max 100)', `5000: "${long.error}"`)
        assert(mid.error === 'Title too long (150 chars, max 100)', `150: "${mid.error}"`)
        assert(JSON.stringify(renames) === JSON.stringify([422, 400]), `rename answers ${JSON.stringify(renames)}`)
        assert(open, 'the dialog closed on a refusal')
        assert(after === before && core.title === before, `title changed: ${after} / ${core.title}`)
        assert((await blockTitle(page, id)) === before, 'the block title changed')

        return { long, mid, answers: renames, title: after, toastsDismissed: toasts }
      } finally {
        page.off('response', listener)
      }
    })

    await check('Copy ID: the stored id is on the clipboard, with a toast', async () => {
      await openMenu(page, 'st-hp-routing')
      await page.locator(MENU).getByRole('menuitem', { name: 'Copy ID' }).click()
      const clip = await waitFor('the clipboard', () => page.evaluate(() => navigator.clipboard.readText()), text => text === 'st-hp-routing')
      const toast = await page.getByText('Session ID copied').first().waitFor({ timeout: 5000 }).then(() => true, () => false)
      // The app's CopyButton item keeps the menu open and reads "Copied" for a moment.
      const feedback = await page.locator(MENU).getByRole('menuitem', { name: 'Copied' }).count()

      await page.keyboard.press('Escape')
      await closedMenu(page)
      assert(toast, 'no toast')

      return { clipboard: clip, feedback: feedback === 1 ? 'Copied' : 'none' }
    })

    await check('Mark as unread / Mark as read: the backend read-state watermark toggles (fenced), the label follows', async () => {
      await openMenu(page, 'st-md-v2')
      const first = (await page.locator(ITEM('read')).innerText()).trim()

      await choose(page, 'read')
      const unread = await waitFor('unread', () => rowOf(s, 'st-md-v2'), value => value?.unread === true)

      await page.waitForFunction(() => document.querySelector('[data-session-id="st-md-v2"]')?.getAttribute('data-status') === 'unread', undefined, { timeout: 10_000 })
      await openMenu(page, 'st-md-v2')
      const second = (await page.locator(ITEM('read')).innerText()).trim()

      await choose(page, 'read')
      const read = await waitFor('read', () => rowOf(s, 'st-md-v2'), value => value?.unread === false)

      assert(first === 'Mark as unread' && second === 'Mark as read', `labels ${first} / ${second}`)

      return { first, unread: unread?.unread, second, read: read?.unread }
    })

    await check('Export: downloads <title>-<id8>.json, byte for byte the core export (sha256 too)', async () => {
      const exported = await exportBytes(s, 'st-md-v2', 'side-panel-v2-polish-st-md-v2.json')
      const saved = JSON.parse(exported.file.toString('utf8')) as { id: string; messages: unknown[]; title: string }

      assert(saved.id === 'st-md-v2' && saved.messages.length === 6, `contents ${saved.id} ${saved.messages.length}`)

      return { ...exported.facts, messages: saved.messages.length, title: saved.title }
    })

    await check('Export of a session with a whole-number float (estimated_cost_usd 2.0): the file keeps "2.0", byte for byte the core export', async () => {
      seedFixtures(t, ['--whole-cost-branch', 'st-export-whole', 'st-orphan-child', 'Whole-number cost'])
      await page.locator(BLOCK('st-export-whole')).waitFor({ timeout: 30_000 })
      const exported = await exportBytes(s, 'st-export-whole', 'whole-number-cost-st-expor.json')

      assert(exported.core.includes('"estimated_cost_usd":2.0'), 'the core export has no whole-number float')
      assert(exported.file.includes('"estimated_cost_usd":2.0'), 'the file lost the .0')

      return exported.facts
    })

    await check('Move to project ▸: the other folder projects only; the moved session\'s cwd and project change and the graph re-scopes it', async () => {
      const projectsBefore = await page.$$eval('[data-testid="session-tree-scope"] button[data-scope]', buttons =>
        buttons.map(button => ({ id: button.getAttribute('data-scope'), label: (button as HTMLElement).innerText.trim() }))
      )
      const syscanvas = projectsBefore.find(project => project.label === 'syscanvas')!
      const mdesign = projectsBefore.find(project => project.label === 'mdesign')!

      await openMenu(page, 'st-split-child')
      await page.locator(ITEM('move')).hover()
      await page.locator('[data-testid="session-tree-menu-move"]').waitFor({ timeout: 5000 })
      await page.waitForTimeout(250)
      await page.screenshot({ path: join(shots, 'actions-move-submenu.png') })
      const targets = await page.$$eval('[data-testid="session-tree-menu-move"] [data-action="move-to"]', items => items.map(item => (item as HTMLElement).innerText.trim()))

      assert(JSON.stringify([...targets].sort()) === JSON.stringify(['hermes-plugins', 'syscanvas']), `targets ${JSON.stringify(targets)}`)
      await page.locator(`[data-testid="session-tree-menu-move"] [data-project-id="${syscanvas.id}"]`).click()
      const row = await waitFor('the moved row', () => rowOf(s, 'st-split-child'), value => Boolean(value?.cwd?.endsWith('/syscanvas')))

      await page.waitForFunction(
        ([id, project]) => document.querySelector(`[data-session-id="${id}"]`)?.getAttribute('data-project-id') === project,
        ['st-split-child', syscanvas.id] as const,
        { timeout: 20_000 }
      )
      await setScope(page, 'syscanvas')
      const inScope = await page.getAttribute(BLOCK('st-split-child'), 'data-out-of-scope')

      await setScope(page, 'mdesign')
      const inMdesign = await page.getAttribute(BLOCK('st-split-child'), 'data-out-of-scope')

      await setScope(page, 'All')
      assert(inScope === null && inMdesign === 'true', `scope: syscanvas ${inScope}, mdesign ${inMdesign}`)
      assert(row?.git_repo_root?.endsWith('/syscanvas'), `git_repo_root ${row?.git_repo_root}`)

      return { targets, cwd: row?.cwd, from: mdesign.id, to: syscanvas.id, overlaps: await overlapsOf(page, 'st-split-child') }
    })

    let branchFromMenu = ''

    await check('Branch from the menu: session.branch_stored makes a child (_branched_from = parent); the graph stays, places and selects it', async () => {
      const before = new Set((await rowsOf(s)).keys())
      const hash = await page.evaluate(() => location.hash)

      await openMenu(page, 'st-hp-mockup')
      await choose(page, 'branch')
      const rows = await waitFor('a new child row', () => rowsOf(s), value => [...value.values()].some(row => !before.has(row.id) && row._branched_from === 'st-hp-mockup'), 30_000)
      const child = [...rows.values()].find(row => !before.has(row.id) && row._branched_from === 'st-hp-mockup')!

      branchFromMenu = child.id
      await page.locator(BLOCK(child.id)).waitFor({ timeout: 20_000 })
      await page.locator(`[data-testid="session-tree-inspector"][data-selected-id="${child.id}"]`).waitFor({ timeout: 10_000 })
      const link = await page.locator(`[data-testid="session-tree-link"][data-source="st-hp-mockup"][data-target="${child.id}"]`).count()
      const overlaps = await overlapsOf(page, child.id)

      assert(link === 1, 'no link from the parent')
      assert(overlaps.length === 0, `the child overlaps ${overlaps.join(', ')}`)
      assert((await page.evaluate(() => location.hash)) === hash, 'the page navigated away')

      return { child: child.id, branchedFrom: child._branched_from, title: child.title, archived: child.archived ?? false, overlaps }
    })

    await check('Branch from the inspector button: a child of the selected session, selected', async () => {
      const before = new Set((await rowsOf(s)).keys())

      await select(page, 'st-md-katex')
      await page.locator('[data-testid="session-tree-inspector-actions"] [data-action="branch"]').click()
      const rows = await waitFor('a new child row', () => rowsOf(s), value => [...value.values()].some(row => !before.has(row.id) && row._branched_from === 'st-md-katex'), 30_000)
      const child = [...rows.values()].find(row => !before.has(row.id) && row._branched_from === 'st-md-katex')!

      await page.locator(`[data-testid="session-tree-inspector"][data-selected-id="${child.id}"]`).waitFor({ timeout: 20_000 })

      return { child: child.id, branchedFrom: child._branched_from, overlaps: await overlapsOf(page, child.id) }
    })

    // Card-3 review carry-forward 1: the second click of a double-click lands on the child the
    // first click just selected (the request takes ~140 ms) and made a grandchild.
    for (const [gap, parent] of [
      [150, 'st-hp-mockup'],
      [300, 'st-md-katex']
    ] as const) {
      await check(`Branch: two real clicks on the inspector's Branch ${gap} ms apart make one child and no grandchild`, async () => {
        const before = new Set((await rowsOf(s)).keys())

        await select(page, parent)
        const button = page.locator('[data-testid="session-tree-inspector-actions"] [data-action="branch"]')
        const box = await button.boundingBox()

        assert(box, 'no Branch button')
        const x = box.x + box.width / 2
        const y = box.y + box.height / 2

        await page.mouse.click(x, y)
        await page.waitForTimeout(gap)
        await page.mouse.click(x, y)
        await page.waitForTimeout(4000)
        const rows = await rowsOf(s)
        const created = [...rows.values()].filter(row => !before.has(row.id))
        const child = created.find(row => row._branched_from === parent)

        assert(created.length === 1 && child, `new rows: ${JSON.stringify(created.map(row => [row.id, row._branched_from]))}`)
        assert(![...rows.values()].some(row => row._branched_from === child.id), 'a grandchild was made')
        await page.locator(`[data-testid="session-tree-inspector"][data-selected-id="${child.id}"]`).waitFor({ timeout: 10_000 })

        return { gapMs: gap, parent, child: child.id, created: created.length }
      })
    }

    // Card-4 review NB4: with a slow refetch the parent is still selected when the request
    // returns; a second real click ~600 ms after the first (≈ 450 ms after the return) made a
    // sibling. The page's own session list is held back 1.5 s per request during the clicks.
    await check("Branch with a slow refetch: a second real click on the inspector's Branch ~600 ms later makes exactly one child", async () => {
      const parent = 'st-sys-reply'
      const before = new Set((await rowsOf(s)).keys())
      const slow = { on: false, held: 0 }
      const hold = async (route: Route) => {
        if (slow.on) {
          slow.held += 1
          await new Promise(resolve => setTimeout(resolve, 1500))
        }

        await route.continue().catch(() => undefined)
      }

      await select(page, parent)
      await page.route('**/api/plugins/session-tree/sessions?**', hold)

      try {
        const button = page.locator('[data-testid="session-tree-inspector-actions"] [data-action="branch"]')
        const box = await button.boundingBox()

        assert(box, 'no Branch button')
        slow.on = true
        const first = Date.now()

        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
        await page.waitForTimeout(600)
        const stillParent = await page.getAttribute('[data-testid="session-tree-inspector"]', 'data-selected-id')

        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
        const secondAt = Date.now() - first

        await page.waitForTimeout(2500)
        slow.on = false
        await page.waitForTimeout(2500)
        const rows = await rowsOf(s)
        const created = [...rows.values()].filter(row => !before.has(row.id))

        assert(stillParent === parent, `the refetch was not slow enough: ${stillParent} was selected at the second click`)
        assert(created.length === 1 && created[0]._branched_from === parent, `new rows: ${JSON.stringify(created.map(row => [row.id, row._branched_from]))}`)
        await page.locator(`[data-testid="session-tree-inspector"][data-selected-id="${created[0].id}"]`).waitFor({ timeout: 10_000 })

        return { parent, secondClickMs: secondAt, selectedAtSecondClick: stillParent, created: created.length, child: created[0].id, heldRefetches: slow.held }
      } finally {
        slow.on = false
        await page.unroute('**/api/plugins/session-tree/sessions?**', hold)
      }
    })

    await check('Archive from the menu: hidden; Show archived shows it greyed with Unarchive, which restores it', async () => {
      await openMenu(page, 'st-hp-routing')
      await choose(page, 'archive')
      await page.locator(BLOCK('st-hp-routing')).waitFor({ state: 'detached', timeout: 10_000 })
      const hidden = await waitFor('archived', () => rowOf(s, 'st-hp-routing', true), value => value?.archived === true)

      assert(!(await rowsOf(s)).has('st-hp-routing'), 'still in the default list')
      await clickToolbar(page, 'session-tree-show-archived')
      await page.locator(BLOCK('st-hp-routing')).waitFor({ timeout: 15_000 })
      const look = await page.locator(BLOCK('st-hp-routing')).evaluate(el => ({ archived: el.getAttribute('data-archived'), opacity: Number(getComputedStyle(el).opacity) }))

      await openMenu(page, 'st-hp-routing')
      const label = (await page.locator(ITEM('archive')).innerText()).trim()

      await choose(page, 'archive')
      const restored = await waitFor('unarchived', () => rowOf(s, 'st-hp-routing'), value => value?.archived === false)

      await clickToolbar(page, 'session-tree-show-archived')
      await page.locator(BLOCK('st-hp-routing')).waitFor({ timeout: 15_000 })
      assert(look.archived === 'true' && look.opacity < 1, `archived look ${JSON.stringify(look)}`)
      assert(label === 'Unarchive', `label ${label}`)

      return { archived: hidden?.archived, look, label, restored: restored?.archived }
    })

    await check('Archive from the inspector button: archived (read back), then restored', async () => {
      await select(page, 'st-sys-mcp')
      await page.locator('[data-testid="session-tree-inspector-actions"] [data-action="archive"]').click()
      await page.locator(BLOCK('st-sys-mcp')).waitFor({ state: 'detached', timeout: 10_000 })
      const row = await waitFor('archived', () => rowOf(s, 'st-sys-mcp', true), value => value?.archived === true)

      // Restore through the graph: Show archived, then the menu's Unarchive.
      await clickToolbar(page, 'session-tree-show-archived')
      await page.waitForFunction(() => document.querySelector('[data-session-id="st-sys-mcp"]')?.getAttribute('data-archived') === 'true', undefined, { timeout: 15_000 })
      await openMenu(page, 'st-sys-mcp')
      const label = (await page.locator(ITEM('archive')).innerText()).trim()

      await choose(page, 'archive')
      const restored = await waitFor('unarchived', () => rowOf(s, 'st-sys-mcp', true), value => value?.archived === false)

      await clickToolbar(page, 'session-tree-show-archived')
      assert(label === 'Unarchive', `label ${label}`)

      return { archived: row?.archived, label, restored: restored?.archived }
    })

    await check('Delete with branches: the confirm says the branches stay; the row is gone, its child stays under a stand-in', async () => {
      await openMenu(page, 'st-sys-comments')
      await choose(page, 'delete')
      const text = page.locator('[data-testid="session-tree-delete-text"]')

      await text.waitFor({ timeout: 5000 })
      const said = (await text.innerText()).trim()

      await page.waitForTimeout(250)
      await page.screenshot({ path: join(shots, 'actions-delete-confirm.png') })
      assert(said.includes('Its 1 branch stays as a separate session.'), `confirm text "${said}"`)
      await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
      await text.waitFor({ state: 'detached', timeout: 15_000 })
      await waitFor('the row gone', () => rowsOf(s, true), value => !value.has('st-sys-comments'))
      await page.locator(BLOCK('st-sys-comments')).waitFor({ state: 'detached', timeout: 15_000 })
      await page.locator(BLOCK('st-sys-reply')).waitFor({ timeout: 10_000 })
      const standin = page.locator('[data-testid="session-tree-standin"][data-missing-id="st-sys-comments"]')

      await standin.waitFor({ timeout: 10_000 })
      const standinId = await standin.getAttribute('data-node-id')
      const linked = await page.locator(`[data-testid="session-tree-link"][data-source="${standinId}"][data-target="st-sys-reply"]`).count()

      assert(linked === 1, 'the orphaned child is not linked under the stand-in')

      return { said, standin: standinId }
    })

    await check('Delete is refused on the running fixture (disabled, with the reason)', async () => {
      seedFixtures(t, ['--activate', 'st-sys-pairing'])
      await page.waitForFunction(() => document.querySelector('[data-session-id="st-sys-pairing"]')?.getAttribute('data-status') === 'running', undefined, { timeout: 30_000 })
      await openMenu(page, 'st-sys-pairing')
      const item = page.locator(ITEM('delete'))
      const state = {
        disabled: await item.getAttribute('data-disabled'),
        reason: await item.getAttribute('data-blocked-reason'),
        text: (await item.innerText()).trim()
      }

      await page.keyboard.press('Escape')
      await closedMenu(page)
      assert(state.disabled !== null && /running/i.test(state.reason ?? '') && /running/i.test(state.text), `delete item ${JSON.stringify(state)}`)
      assert((await rowsOf(s)).has('st-sys-pairing'), 'the running session is gone')

      return state
    })

    await check('Delete refused by Hermes (a row with no owner stamp, as older CLI rows have): the refusal is shown in the confirm and the row stays', async () => {
      // A real owner refusal with its real shape: the core answers a Webapp login's edit of an
      // unowned history row with 403 permission_denied (measured; no turn can run here).
      seedFixtures(t, ['--unowned-branch', 'st-unowned', 'st-hp-root', 'Legacy CLI branch'])
      await page.locator(BLOCK('st-unowned')).waitFor({ timeout: 30_000 })
      await openMenu(page, 'st-unowned')
      await choose(page, 'delete')
      await page.locator('[data-testid="session-tree-delete-text"]').waitFor({ timeout: 5000 })
      await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
      const error = page.getByRole('dialog').getByText(/permission_denied/)
      const shown = await error.waitFor({ timeout: 15_000 }).then(
        async () => (await error.innerText()).trim(),
        () => ''
      )
      const core = await api<{ id: string; user_id: null | string }>(s, '/api/sessions/st-unowned')

      await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click()
      await page.locator('[data-testid="session-tree-delete-text"]').waitFor({ state: 'detached', timeout: 5000 })
      assert(shown, 'no refusal shown in the dialog')
      assert((await rowsOf(s)).has('st-unowned') && core.id === 'st-unowned', 'the refused session is gone')
      assert(await page.locator(BLOCK('st-unowned')).isVisible(), 'the refused block disappeared')

      return { error: shown, owner: core.user_id }
    })

    await check('Delete of a row deleted elsewhere while the confirm is open (NB3): the confirm finishes as deleted, like the core\'s idempotent delete', async () => {
      const id = 'st-export-whole'

      await openMenu(page, id)
      await choose(page, 'delete')
      const text = page.locator('[data-testid="session-tree-delete-text"]')

      await text.waitFor({ timeout: 5000 })
      // Another client deletes it first, through the same fenced backend route.
      const snap = await api<{ runtime_revision: number; runtime_generation: number }>(s, `/api/plugins/session-tree/sessions/${id}/mutation-snapshot?session_profile=default`)
      const elsewhere = await api<{ ok: boolean; deleted_ids?: string[] }>(s, `/api/plugins/session-tree/sessions/${id}/delete?session_profile=default`, {
        method: 'POST',
        body: { request_id: `e2e-${Date.now()}`, expected_revision: snap.runtime_revision, expected_generation: snap.runtime_generation }
      })

      assert(elsewhere.ok && elsewhere.deleted_ids?.includes(id), `the other delete: ${JSON.stringify(elsewhere)}`)
      await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
      await text.waitFor({ state: 'detached', timeout: 15_000 })
      await page.locator(BLOCK(id)).waitFor({ state: 'detached', timeout: 15_000 })
      const errors = await page.getByText(/Session not found/).count()

      assert(!(await rowsOf(s, true)).has(id), 'the row is back')
      assert(errors === 0, 'a "Session not found" error is shown')

      return { deletedElsewhere: elsewhere.deleted_ids, confirm: 'closed as deleted' }
    })

    await check('a session open in a tab: still actionable from the graph (the page comes back from the sidebar nav)', async () => {
      await fit(page)
      await page.locator(BLOCK(branchFromMenu)).dblclick()
      await page.waitForFunction(id => document.querySelector(`[data-session-id="${id}"]`)?.getAttribute('data-open') === 'true', branchFromMenu, { timeout: 20_000 })
      // The session tab now covers the page: the sidebar nav entry brings it back.
      await page.getByText('Session Tree', { exact: true }).first().click()
      await page.locator('[data-testid="session-tree-fit"]').waitFor({ state: 'visible', timeout: 10_000 })
      await openMenu(page, branchFromMenu)
      const items = await menuItemTexts(page)

      await page.keyboard.press('Escape')
      await closedMenu(page)
      assert(JSON.stringify(items) === JSON.stringify(MENU_ORDER), `items ${JSON.stringify(items)}`)

      return { open: branchFromMenu, items: items.length }
    })

    await check('Rename of a session open in a tab (a live runtime in the gateway): the title is read back; the route taken is recorded', async () => {
      const restRenames: string[] = []
      const listener = (request: { url(): string }) => {
        if (/\/sessions\/[^/]+\/rename/.test(request.url())) {
          restRenames.push(request.url())
        }
      }

      page.on('request', listener)

      try {
        // With the page in front, the app focuses no session (the SDK maps runtime → stored id only
        // for the focused one), so this takes the backend route; the RPC choice is unit-tested.
        const focused = await page.evaluate(() => {
          const host = (globalThis as unknown as { __HERMES_PLUGIN_SDK__: { host: { state: Record<string, { get(): unknown }> } } }).__HERMES_PLUGIN_SDK__.host

          return { stored: host.state.focusedStoredSessionId.get(), runtime: host.state.focusedSessionId.get() }
        })

        await openMenu(page, branchFromMenu)
        await choose(page, 'rename')
        await page.locator('[data-testid="session-tree-rename-input"]').fill('Mockup branch, renamed while open')
        await page.keyboard.press('Enter')
        await page.locator('[data-testid="session-tree-rename-dialog"]').waitFor({ state: 'detached', timeout: 10_000 })
        const row = await waitFor('the renamed row', () => rowOf(s, branchFromMenu), value => value?.title === 'Mockup branch, renamed while open')
        const route = restRenames.length > 0 ? 'backend' : 'session.title RPC'

        facts.renameOpenSession = { focused, route }

        return { focused, title: row?.title, route }
      } finally {
        page.off('request', listener)
      }
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

  writeFileSync(join(t.root, 'e2e-actions-facts.json'), `${JSON.stringify({ results, facts }, null, 2)}\n`)
  const failed = results.filter(r => !r.ok)

  console.log(`\ne2e-actions: ${results.length - failed.length} passed, ${failed.length} failed (screenshots: ${shots})`)
  process.exitCode = failed.length === 0 ? 0 : 1
}

await main()
