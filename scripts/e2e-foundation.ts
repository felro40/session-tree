/**
 * e2e — Session Tree 1/7 foundation, against the isolated test Hermes (coder ports 19310-19314).
 *
 *   npm run test:e2e            (SESSION_TREE_ROLE=reviewer for the reviewer's home/ports)
 *   KEEP_RUNNING=1 npm run test:e2e   leaves the test gateway up afterwards
 *
 * Every check is DOM-, geometry- or assertion-based; input is real (locator clicks, page.mouse,
 * page.keyboard). Screenshots go to <test root>/shots/ (never into the repo).
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { aliasIndex, forkParentId, graphLinks, visibleRows } from '../src/model/sessions.ts'
import type { SessionRow, SessionsResponse } from '../src/model/sessions.ts'
import { close, enableDesktopHalf, goto, launch, signIn } from './e2e/browser.ts'
import type { Session } from './e2e/browser.ts'
import {
  configure,
  FORBIDDEN_PORTS,
  hermes,
  listenersOf,
  seedFixtures,
  setup,
  signInLink,
  stopGateway,
  testHermes,
  testHermesPids
} from './e2e/harness.ts'
import { diffSnapshots, snapshotRealHermes } from './e2e/real-hermes-guard.ts'

const BACKEND_OFF_MESSAGE =
  "Session Tree's backend is off: enable the session-tree plugin for this profile and restart the gateway."

interface Manifest {
  hidden: string[]
  archived: string[]
  branch_links: [string, string][]
  reset_links: [string, string][]
  compressed: { root: string; tip: string; segments: number; lineage: string[] }
  orphan: { child: string; deleted_parent: string }
  created: string[]
}

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

function sameSet(actual: Iterable<string>, expected: Iterable<string>, label: string): void {
  const a = new Set(actual)
  const e = new Set(expected)
  const missing = [...e].filter(x => !a.has(x))
  const extra = [...a].filter(x => !e.has(x))

  assert(missing.length === 0 && extra.length === 0, `${label}: missing ${JSON.stringify(missing)} extra ${JSON.stringify(extra)}`)
}

/** The backend, called the way `ctx.rest` calls it in the Webapp (the app's own REST bridge
 *  carries the sign-in credential; a bare fetch() is refused with 401). */
async function backendRows(s: Session, query: string): Promise<SessionsResponse> {
  return s.page.evaluate(async q => {
    const bridge = (window as unknown as { hermesDesktop: { api(req: { path: string }): Promise<unknown> } }).hermesDesktop

    return (await bridge.api({ path: `/api/plugins/session-tree/sessions?${q}` })) as SessionsResponse
  }, query)
}

async function openPage(s: Session): Promise<void> {
  await s.page.locator('[data-testid="session-tree-page"]').waitFor({ timeout: 30_000 })
}

async function domBlocks(s: Session): Promise<string[]> {
  await s.page.locator('[data-testid="session-tree-block"]').first().waitFor({ timeout: 30_000 })

  return s.page.$$eval('[data-testid="session-tree-block"]', nodes => nodes.map(n => n.getAttribute('data-session-id') ?? ''))
}

async function domLinks(s: Session): Promise<string[]> {
  return s.page.$$eval('[data-testid="session-tree-link"]', nodes =>
    nodes.map(n => `${n.getAttribute('data-kind')}:${n.getAttribute('data-source')}->${n.getAttribute('data-target')}`)
  )
}

/** Block background vs the theme variable it must come from, resolved in place. */
async function themeProbe(s: Session) {
  return s.page.evaluate(() => {
    const block = document.querySelector('[data-testid="session-tree-block"]') as HTMLElement
    const probe = document.createElement('div')

    probe.style.background = 'var(--ui-bg-elevated)'
    probe.style.color = 'var(--ui-text-primary)'
    block.parentElement!.appendChild(probe)

    const expected = { bg: getComputedStyle(probe).backgroundColor, fg: getComputedStyle(probe).color }

    probe.remove()

    const actual = { bg: getComputedStyle(block).backgroundColor, fg: getComputedStyle(block).color }

    return { actual, expected, editorBg: getComputedStyle(document.body).getPropertyValue('--ui-bg-editor').trim() }
  })
}

async function main(): Promise<void> {
  mkdirSync(shots, { recursive: true })
  const realBefore = snapshotRealHermes()

  console.log(`e2e foundation — role ${t.role}, home ${t.home}`)

  const manifest = setup(t) as Manifest & { seeded: boolean }
  const s = await launch({ colorScheme: 'light' })

  try {
    await check('isolated gateway starts with --skip-build and every listener is inside the port block', async () => {
      await signIn(t, s.page)
      const pids = testHermesPids(t)
      const listeners = listenersOf(pids)
      const ports = listeners.map(l => Number(l.split(':').pop()))

      assert(pids.length > 0, 'no test gateway process')
      assert(ports.length > 0, 'no listener found')

      for (const port of ports) {
        assert(port >= t.portBlock[0] && port <= t.portBlock[1], `listener ${port} outside ${t.portBlock}`)
        assert(!FORBIDDEN_PORTS.includes(port), `forbidden port ${port}`)
      }

      facts.listeners = listeners

      return listeners
    })

    await check('desktop half is enabled in Capabilities → Plugins (it ships disabled)', async () => {
      const flipped = await enableDesktopHalf(t, s.page)

      return { flipped }
    })

    await check('sidebar nav entry "Session Tree" opens /session-tree', async () => {
      await goto(t, s.page, '/')
      const nav = s.page.getByRole('button', { name: 'Session Tree', exact: true }).first()

      await nav.click()
      await s.page.waitForURL(/#\/session-tree$/)
      await openPage(s)
    })

    await check('⌘K "Open Session Tree" opens /session-tree', async () => {
      await goto(t, s.page, '/')
      await s.page.waitForFunction(() => !location.hash.includes('session-tree'))
      await s.page.locator('body').click({ position: { x: 700, y: 400 } }).catch(() => undefined)
      await s.page.keyboard.press('Control+k')
      await s.page.keyboard.type('Open Session Tree')
      await s.page.getByRole('option', { name: /Open Session Tree/ }).first().waitFor({ timeout: 10_000 })
      await s.page.keyboard.press('Enter')
      await s.page.waitForURL(/#\/session-tree$/)
      await openPage(s)
    })

    let rows: SessionRow[] = []
    let visible: SessionRow[] = []

    await check('backend rows come through the plugin route; raw rows include the machine sources', async () => {
      const body = await backendRows(s, 'session_profile=default&include_archived=false&limit=2000')

      assert(Array.isArray(body.sessions), `GET /sessions → ${JSON.stringify(body).slice(0, 200)}`)
      rows = body.sessions
      visible = visibleRows(rows)
      const ids = new Set(rows.map(r => r.id))

      for (const id of ['st-hidden-cron', 'st-hidden-kanban', 'st-hidden-tool']) {
        assert(ids.has(id), `${id} missing from raw rows`)
      }

      assert(!ids.has('st-hidden-delegate'), 'the delegate child is listed (core listing hides sub-agent runs)')
      facts.backendRows = rows.length
      facts.visibleRows = visible.length

      return { raw: rows.length, visible: visible.length }
    })

    await check('scale fixture: the backend returns all 500 rows of the scale profile', async () => {
      const started = Date.now()
      const body = await backendRows(s, 'session_profile=scale&include_archived=false&limit=2000')
      const ms = Date.now() - started

      assert(body.sessions.length === 500, `${body.sessions.length} rows`)
      assert(body.truncated === false, 'reported truncated')
      facts.scaleQueryMs = ms

      return { rows: body.sessions.length, ms }
    })

    await check('box count equals the visible-row count, ids match, hidden kinds absent', async () => {
      const blocks = await domBlocks(s)

      assert(blocks.length === visible.length, `${blocks.length} blocks, ${visible.length} visible rows`)
      sameSet(blocks, visible.map(r => r.id), 'block ids')

      for (const id of [...manifest.hidden, ...manifest.archived, manifest.orphan.deleted_parent]) {
        assert(!blocks.includes(id), `${id} is drawn`)
      }

      const compressed = manifest.compressed

      assert(blocks.includes(compressed.tip), 'the compressed conversation is not drawn by its tip')

      for (const segment of compressed.lineage.slice(0, -1)) {
        assert(!blocks.includes(segment), `earlier segment ${segment} drawn as its own block`)
      }

      const tipRow = rows.find(r => r.id === compressed.tip)

      assert(tipRow?.compacted_segments === compressed.segments, `compacted_segments ${tipRow?.compacted_segments}`)

      return { blocks: blocks.length }
    })

    await check('links match forkParentId (branch) and _reset_from (continued as) for the fixtures', async () => {
      const links = await domLinks(s)
      const expected = graphLinks(visible).map(l => `${l.kind}:${l.source}->${l.target}`)

      sameSet(links, expected, 'links vs graph model')

      for (const [parent, child] of manifest.branch_links) {
        assert(links.includes(`branch:${parent}->${child}`), `missing branch ${parent}->${child}`)
      }

      for (const [from, to] of manifest.reset_links) {
        assert(links.includes(`reset:${from}->${to}`), `missing continued-as ${from}->${to}`)
      }

      const alias = aliasIndex(visible)

      for (const link of links.filter(l => l.startsWith('branch:'))) {
        const [, source, target] = /^branch:(.+)->(.+)$/.exec(link)!
        const row = visible.find(r => r.id === target)!

        assert(alias.get(forkParentId(row)!) === source, `${target}'s forkParentId does not resolve to ${source}`)
      }

      // The deleted parent's branch child is drawn, unlinked (its stand-in is a later card's).
      assert(!links.some(l => l.endsWith(`->${manifest.orphan.child}`)), 'orphan child linked to something')

      return { links: links.length }
    })

    await check('react-dom shim: the "continued as" edge label renders through the portal layer', async () => {
      const inPortal = await s.page.locator('.react-flow__edgelabel-renderer [data-testid="session-tree-link-label"]').count()
      const text = await s.page.locator('[data-testid="session-tree-link-label"]').first().innerText()
      const box = await s.page.locator('[data-testid="session-tree-link-label"]').first().boundingBox()

      assert(inPortal >= 1, 'no edge label inside .react-flow__edgelabel-renderer')
      assert(text.trim() === 'continued as', `label text "${text}"`)
      assert(box && box.width > 0 && box.height > 0, 'label has no size')

      return { labels: inPortal, box }
    })

    await check('light theme: blocks paint from var(--ui-*) and the page screenshot is taken', async () => {
      const probe = await themeProbe(s)

      assert(probe.actual.bg === probe.expected.bg, `block bg ${probe.actual.bg} ≠ var ${probe.expected.bg}`)
      assert(probe.actual.fg === probe.expected.fg, `block fg ${probe.actual.fg} ≠ var ${probe.expected.fg}`)
      facts.lightTheme = probe
      await s.page.screenshot({ path: join(shots, 'session-tree-light.png') })

      return probe.actual
    })

    await check('dark theme: the same blocks repaint from the dark theme variables', async () => {
      await s.page.emulateMedia({ colorScheme: 'dark' })
      await s.page.waitForTimeout(800)
      const probe = await themeProbe(s)
      const light = facts.lightTheme as Awaited<ReturnType<typeof themeProbe>>

      assert(probe.actual.bg === probe.expected.bg, `block bg ${probe.actual.bg} ≠ var ${probe.expected.bg}`)
      assert(probe.actual.bg !== light.actual.bg, 'block background did not change with the theme')
      facts.darkTheme = probe
      await s.page.screenshot({ path: join(shots, 'session-tree-dark.png') })
      await s.page.emulateMedia({ colorScheme: 'light' })

      return probe.actual
    })

    await check('pre-check 10: host.state exposes busyBySession (runtime ids) — no needs-input atom', async () => {
      const state = await s.page.evaluate(() => {
        const host = (globalThis as unknown as { __HERMES_PLUGIN_SDK__: { host: { state: Record<string, { get(): unknown }> } } })
          .__HERMES_PLUGIN_SDK__.host

        return {
          keys: Object.keys(host.state).sort(),
          busyBySession: host.state.busyBySession.get(),
          focusedStoredSessionId: host.state.focusedStoredSessionId.get()
        }
      })

      facts.hostState = state
      assert(state.keys.includes('busyBySession'), 'no busyBySession')

      return state.keys
    })

    await check('pre-checks 7: sessions.changed and projects.changed reach host.onEvent in the Webapp', async () => {
      await s.page.evaluate(() => {
        const w = window as unknown as { __stEvents: string[]; __stOff: (() => void)[] }
        const host = (globalThis as unknown as { __HERMES_PLUGIN_SDK__: { host: { onEvent(type: string, fn: (e: { type: string }) => void): () => void } } })
          .__HERMES_PLUGIN_SDK__.host

        w.__stEvents = []
        w.__stOff = ['sessions.changed', 'projects.changed'].map(type => host.onEvent(type, e => w.__stEvents.push(e.type ?? type)))
      })

      seedFixtures(t, ['--touch'])
      const probeDir = join(t.root, 'tmp', `project-probe-${Date.now()}`)

      mkdirSync(probeDir, { recursive: true })
      const created = hermes(t, ['project', 'create', `e2e probe ${Date.now()}`, probeDir])

      assert(created.status === 0, `hermes project create failed: ${created.stderr || created.stdout}`)
      await s.page.waitForFunction(
        () => {
          const events = (window as unknown as { __stEvents: string[] }).__stEvents

          return events.includes('sessions.changed') && events.includes('projects.changed')
        },
        undefined,
        { timeout: 30_000 }
      )

      const events = await s.page.evaluate(() => (window as unknown as { __stEvents: string[] }).__stEvents)

      facts.events = events

      return [...new Set(events)]
    })

    await check('pre-check 6 / R2: double-clicking a block opens that session in a new tab', async () => {
      await goto(t, s.page, '/session-tree')
      await openPage(s)
      const block = s.page.locator('[data-session-id="st-hp-routing"]')

      await block.waitFor()
      const tabsBefore = await s.page.getByRole('tab').count()

      await block.dblclick()
      await s.page.waitForFunction(
        before => document.querySelectorAll('[role="tab"]').length > before,
        tabsBefore,
        { timeout: 20_000 }
      )

      const tabs = await s.page.getByRole('tab').allInnerTexts()

      assert(tabs.some(text => /edge routing/i.test(text)), `no tab for the session: ${JSON.stringify(tabs)}`)
      facts.openSessionTabs = tabs

      return { tabsBefore, tabs }
    })

    await check('settings page: Settings → Plugins → Session Tree shows the View style row', async () => {
      await goto(t, s.page, '/settings?tab=plugins&plugin=session-tree')
      const settings = s.page.locator('[data-testid="session-tree-settings"]')

      await settings.waitFor({ timeout: 20_000 })
      const text = await settings.innerText()

      assert(text.includes('View style') && text.includes('Dense + inspector'), `settings text: ${text}`)
      await s.page.screenshot({ path: join(shots, 'session-tree-settings.png') })
    })

    await check('plugin loads with no page errors', () => {
      assert(s.errors.length === 0, s.errors.join('\n'))
    })

    await check('backend stopped (plugin not in plugins.enabled, gateway restarted) → EmptyState', async () => {
      configure(t, { backendEnabled: false })
      stopGateway(t)
      // A fresh browser: nothing cached from the run with the backend on.
      const off = await launch({ colorScheme: 'light' })

      try {
        await signIn(t, off.page)
        await enableDesktopHalf(t, off.page)
        await goto(t, off.page, '/session-tree')
        const empty = off.page.locator('[data-testid="session-tree-backend-off"]')

        await empty.waitFor({ timeout: 30_000 })
        const text = (await empty.innerText()).trim()

        assert(text === BACKEND_OFF_MESSAGE, `EmptyState text: ${text}`)
        assert((await off.page.locator('[data-testid="session-tree-block"]').count()) === 0, 'blocks drawn without a backend')
        await off.page.screenshot({ path: join(shots, 'session-tree-backend-off.png') })

        return text
      } finally {
        await close(off)
      }
    })
  } finally {
    await close(s)
    configure(t, { backendEnabled: true })
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

    return { gitStatus: realBefore.gitStatus || '(clean)', distWebappEntries: realBefore.distWebappEntries }
  })

  writeFileSync(join(t.root, 'e2e-foundation-facts.json'), `${JSON.stringify({ results, facts }, null, 2)}\n`)
  const failed = results.filter(r => !r.ok)

  console.log(`\ne2e-foundation: ${results.length - failed.length} passed, ${failed.length} failed (screenshots: ${shots})`)
  process.exitCode = failed.length === 0 ? 0 : 1
}

await main()
