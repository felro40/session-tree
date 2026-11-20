/**
 * e2e — Session Tree card 12: each session's context size (measured or estimated) beside its
 * lifetime tokens, against the isolated test Hermes. Its own fresh test home of the role
 * (`c<card>-<role>-context`, the role's port block), seeded with the default fixtures plus the
 * context family (`seed-fixtures.py --context`: a valid measured clock, an `unknown`-confidence
 * clock, a clock made stale by a prune, one from another route, an estimate only, never ran).
 * No model provider: no prompt is sent; every clock comes from the fixture.
 *
 *   node scripts/e2e-context.ts    (part of `npm run test:e2e`)
 *   KEEP_RUNNING=1 …               leaves the test gateway up afterwards
 *
 * In Subway, Swimlanes and Rich cards each fixture's block shows the expected figure (the exact
 * measured value; `~` + the backend's estimate; `—`), and its hover tooltip (real mouse) lists the
 * context, the lifetime tokens and the cache state. The Dense inspector's Context and Lifetime
 * sections; the Rich bar's width; the Swimlanes lane header ends in `used`. Live: an archive
 * (`--archive`, a tool-result prune) flips a measured block to `~…` after the refresh, and an
 * appended message refetches the estimate. An older backend (the base commit's `dashboard/`,
 * this page) shows `— ctx` with no error. Screenshots, light and dark: <root>/shots/.
 */
import { copyFileSync, existsSync, mkdirSync, renameSync, symlinkSync, writeFileSync } from 'node:fs'
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { join } from 'node:path'

import type { Page } from 'playwright-core'

import { close, enableDesktopHalf, launch, signIn } from './e2e/browser.ts'
import {
  api,
  assert,
  backendLog,
  backToTree,
  BLOCK,
  fit,
  freshHome,
  openTree,
  PAGE,
  portsFree,
  reloadTree,
  rowsOf,
  sleep,
  suite,
  switchStyle,
  viewport,
  waitFor
} from './e2e/common.ts'
import { buildTestPackage, isolatedEnv, PLUGIN_ID, REPO, seedFixtures, setup, signInLink, stopGateway, stopRoleHomes, testHermes, testHermesPids, webappBase } from './e2e/harness.ts'
import { diffSnapshots, snapshotRealHermes } from './e2e/real-hermes-guard.ts'
import { contextFigure, contextSignature, contextTooltip, fullNumber, usedLabel, lifetimeTokens, cacheState } from '../src/model/context.ts'
import type { ContextAnswer, ContextEntry } from '../src/model/context.ts'
import type { SessionRow } from '../src/model/sessions.ts'
import { TOKEN_BAR } from '../src/styles/rich/spec.ts'

const t = testHermes(undefined, { variant: 'context' })
const shots = join(t.root, 'shots')
const { results, facts, check, onFailure } = suite()

/** The base commit of card 12: its backend predates the context fields and endpoint. */
const BASE_COMMIT = 'a6b5e520fa8fc851d390b413462ebc9257829811'
const MEASURED = 'st-ctx-measured'
const UNKNOWN = 'st-ctx-unknown'
const COMPACTED = 'st-ctx-compacted'
const ROUTE = 'st-ctx-route'
const ESTIMATE = 'st-ctx-estimate'
const NEVER = 'st-ctx-never'
const IDS = [MEASURED, UNKNOWN, COMPACTED, ROUTE, ESTIMATE, NEVER]
const STYLES = ['subway', 'swimlanes', 'rich'] as const
const INSPECTOR = '[data-testid="session-tree-inspector"]'

/** The suite's own direct estimate requests carry this query (the page's requests never do). */
const DIRECT = 'e2e=direct'

async function estimates(s: Parameters<typeof rowsOf>[0], ids: string[]): Promise<ContextAnswer['contexts']> {
  return (await api<ContextAnswer>(s, `/api/plugins/session-tree/sessions/context?${DIRECT}`, { method: 'POST', body: { profile: 'default', ids } })).contexts
}

/** The backend's answer as the page's entry for `row` as it is now (its current signature, D4). */
const entryOf = (answer: ContextAnswer['contexts'], row: SessionRow): ContextEntry | undefined =>
  answer[row.id] ? { status: 'loaded', sig: contextSignature(row), estimate: answer[row.id].estimate, window: answer[row.id].context_window } : undefined

/** What each fixture's block must read, from the backend's own row and estimate. */
function expectedLabels(rows: SessionRow[], answer: ContextAnswer['contexts']): Record<string, string> {
  return Object.fromEntries(
    IDS.map(id => {
      const row = rows.find(each => each.id === id)!

      return [id, contextFigure(row, entryOf(answer, row)).label]
    })
  )
}

/** Each fixture block's figure on screen (null: not drawn). */
async function shownLabels(page: Page): Promise<Record<string, null | { text: string; kind: null | string }>> {
  return page.evaluate(ids => {
    const out: Record<string, null | { text: string; kind: null | string }> = {}

    for (const id of ids) {
      const field = document.querySelector(`[data-testid="session-tree-block"][data-session-id="${id}"] [data-field="context"]`)

      out[id] = field ? { text: (field.textContent ?? '').trim(), kind: field.getAttribute('data-kind') } : null
    }

    return out
  }, IDS)
}

async function settledLabels(page: Page) {
  return waitFor('every context figure settled', () => shownLabels(page), labels => Object.values(labels).every(label => label && label.kind !== 'loading'), 20_000)
}

/** Hover a block with the real mouse (leave first) and read the tooltip. */
async function tooltipOf(page: Page, id: string): Promise<string> {
  const target = await page.locator(BLOCK(id)).first().boundingBox()

  assert(target, `no box for ${id}`)
  await page.mouse.move(5, 5)
  await sleep(250)
  await page.mouse.move(target.x + Math.min(30, target.width / 2), target.y + Math.min(10, target.height / 2), { steps: 4 })
  const tip = page.locator(`[data-testid="session-tree-tooltip"][data-node-id="${id}"]`)

  await tip.waitFor({ timeout: 5000 })
  const text = (await tip.innerText()).trim()

  await page.mouse.move(5, 5)

  return text
}

/** A clip around the block (and, in Subway, its label beside the station). */
async function blockShot(page: Page, id: string, file: string, pad = 24): Promise<void> {
  const boxes = await page.evaluate(sid => {
    const el = document.querySelector(`[data-testid="session-tree-block"][data-session-id="${sid}"]`)

    return el ? [el, ...el.querySelectorAll('*')].map(node => node.getBoundingClientRect()).filter(r => r.width > 0 && r.height > 0).map(r => ({ l: r.left, t: r.top, r: r.right, b: r.bottom })) : []
  }, id)

  assert(boxes.length > 0, `no box for ${id}`)
  const l = Math.max(0, Math.min(...boxes.map(b => b.l)) - pad)
  const top = Math.max(0, Math.min(...boxes.map(b => b.t)) - pad)

  await page.screenshot({ path: join(shots, file), clip: { x: l, y: top, width: Math.max(...boxes.map(b => b.r)) + pad - l, height: Math.max(...boxes.map(b => b.b)) + pad - top } })
}

/** Zoom in on a block with the real wheel, toward the cursor (the figures are legible). */
async function zoomTo(page: Page, id: string, notches = 3): Promise<void> {
  const target = await page.locator(BLOCK(id)).first().boundingBox()

  assert(target, `no box for ${id}`)
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2)

  for (let i = 0; i < notches; i += 1) {
    await page.mouse.wheel(0, -240)
    await sleep(120)
  }

  await sleep(500)
}

/** Established TCP connections of `pids` whose peer is not this machine (`ss -tnpH`). */
function outsideConnections(pids: readonly number[]): string[] {
  const out = spawnSync('ss', ['-tnpH', 'state', 'established'], { encoding: 'utf8' }).stdout ?? ''

  return out
    .split('\n')
    .filter(line => pids.some(pid => line.includes(`pid=${pid},`)))
    .map(line => line.trim().split(/\s+/))
    .filter(cols => cols.length >= 4 && !/^(127\.|\[::1\]|\[::ffff:127\.)/.test(cols[3]))
    .map(cols => `${cols[2]} -> ${cols[3]}`)
}

/** The base commit's backend with this card's page: `<root>/package-old`. */
function oldBackendPackage(newPackage: string): string {
  const dir = join(t.root, 'package-old')

  for (const sub of ['dashboard', 'desktop']) {
    mkdirSync(join(dir, sub), { recursive: true })
  }

  for (const file of ['plugin.yaml', '__init__.py', 'dashboard/manifest.json', 'dashboard/plugin_api.py', 'dashboard/layout_store.py', 'dashboard/session_details.py']) {
    writeFileSync(join(dir, file), execFileSync('git', ['show', `${BASE_COMMIT}:${file}`], { cwd: REPO }))
  }

  copyFileSync(join(newPackage, 'desktop', 'plugin.js'), join(dir, 'desktop', 'plugin.js'))

  return dir
}

/** Point the test home's package link at `target` (the old link is moved aside, never deleted). */
function relink(target: string): void {
  const link = join(t.home, 'plugins', PLUGIN_ID)

  if (existsSync(link)) {
    renameSync(link, join(t.root, `plugin-link-${Date.now()}`))
  }

  symlinkSync(target, link)
}

async function main(): Promise<void> {
  const realBefore = snapshotRealHermes()

  stopRoleHomes(t)
  freshHome(t)
  console.log(`e2e context — role ${t.role}, home ${t.home}`)
  const packageDir = buildTestPackage(t)
  const manifest = setup(t, { packageDir }) as { seeded?: boolean }

  assert(manifest.seeded === true, 'the context home was not freshly seeded')
  const seeded = seedFixtures(t, ['--context']) as { created?: boolean; clocks?: Record<string, number>; archive?: { generation: number } }

  assert(seeded.created === true, `the context fixtures were not created: ${JSON.stringify(seeded)}`)
  facts.seeded = { clocks: seeded.clocks, archive: seeded.archive }
  mkdirSync(shots, { recursive: true })
  const s = await launch({ colorScheme: 'light' })
  const { page } = s
  const stacks: string[] = []
  const log = backendLog(page)
  /** Every finished POST /sessions/context of the page (its estimate requests, the response read). */
  const answered: { at: number; ids: string[] }[] = []
  let failures = 0

  page.on('requestfinished', request => {
    const url = new URL(request.url())

    if (request.method() === 'POST' && url.pathname.endsWith('/api/plugins/session-tree/sessions/context') && !url.search.includes(DIRECT)) {
      answered.push({ at: Date.now(), ids: (JSON.parse(request.postData() ?? '{}') as { ids?: string[] }).ids ?? [] })
    }
  })

  page.on('pageerror', error => stacks.push(`${error.message}\n${error.stack ?? ''}`))
  onFailure(
    async () => {
      failures += 1
      await page.screenshot({ path: join(shots, `failure-${failures}.png`) }).catch(() => undefined)

      return `${await page.evaluate(p => JSON.stringify({ hash: location.hash, style: document.querySelector(p)?.getAttribute('data-style') }), PAGE)} (failure-${failures}.png)`
    },
    async () => {
      await page.mouse.move(5, 5).catch(() => undefined)
      await page.keyboard.press('Escape')

      if (!(await page.locator('[data-testid="session-tree-canvas"]').count())) {
        await backToTree(page).catch(() => undefined)
      }
    }
  )

  try {
    await signIn(t, page)
    await enableDesktopHalf(t, page)

    await check('P1, in the plugin host (the test gateway): a /sessions + /sessions/context round writes nothing (state.db, -wal, -shm, data_version on a held connection), starts no process and opens no outside connection; the estimate\'s first and cached cost', async () => {
      const probe = spawn(t.launcher, ['--run-path', join(REPO, 'scripts', 'e2e', 'db-probe.py'), t.home], { cwd: t.root, env: isolatedEnv(t), stdio: ['pipe', 'pipe', 'pipe'] })
      const lines: string[] = []
      let buffered = ''

      probe.stdout.on('data', chunk => {
        buffered += String(chunk)
        lines.push(...buffered.split('\n').slice(0, -1).filter(Boolean))
        buffered = buffered.split('\n').pop() ?? ''
      })
      await waitFor('the probe\'s first snapshot', async () => lines.length, n => n >= 1, 60_000)
      const pidsBefore = testHermesPids(t).filter(pid => pid !== probe.pid).sort()
      const connsBefore = outsideConnections(pidsBefore)
      const listed = await rowsOf(s)
      const first = await api<ContextAnswer & { elapsed_ms: number }>(s, '/api/plugins/session-tree/sessions/context', { method: 'POST', body: { profile: 'default', ids: IDS } })
      const cached = await api<ContextAnswer & { elapsed_ms: number }>(s, '/api/plugins/session-tree/sessions/context', { method: 'POST', body: { profile: 'default', ids: IDS } })
      const scaleStart = Date.now()
      const scale = await rowsOf(s, 'scale')
      const scaleMs = Date.now() - scaleStart

      probe.stdin.write('\n')
      await waitFor('the probe\'s second snapshot', async () => lines.length, n => n >= 2, 30_000)
      const [before, after] = lines.map(line => JSON.parse(line) as { data_version: number; files: Record<string, unknown> })
      const pidsAfter = testHermesPids(t).filter(pid => pid !== probe.pid).sort()
      const connsAfter = outsideConnections(pidsAfter)

      assert(listed.find(row => row.id === MEASURED)?.context_measured?.tokens === 154789 && (first.contexts[ESTIMATE]?.estimate?.total ?? 0) > 0, 'the round answered')
      assert(before.data_version === after.data_version && JSON.stringify(before.files) === JSON.stringify(after.files), `state.db changed: ${JSON.stringify({ before, after })}`)
      assert(JSON.stringify(pidsBefore) === JSON.stringify(pidsAfter), `processes ${pidsBefore} → ${pidsAfter}`)
      assert(connsAfter.filter(conn => !connsBefore.includes(conn)).length === 0, `new outside connections: ${connsAfter}`)
      facts.p1 = {
        files: Object.keys(before.files),
        dataVersion: before.data_version,
        processes: pidsAfter.length,
        outsideConnections: connsAfter,
        estimateFirstMs: first.elapsed_ms,
        estimateCachedMs: cached.elapsed_ms,
        scaleRows: scale.length,
        scaleListingMs: scaleMs
      }

      return facts.p1
    })

    await openTree(t, s)
    let rows = await rowsOf(s)
    let answer = await estimates(s, IDS)

    await check('the backend: the measured fixture is measured (154,789), the stale and unknown ones name why, the never-run one has no estimate', () => {
      const of = (id: string) => rows.find(row => row.id === id)!

      assert(of(MEASURED).context_measured?.tokens === 154789 && of(MEASURED).context_invalid_reason === null, JSON.stringify(of(MEASURED).context_measured))
      assert(of(MEASURED).cache_window?.state === 'warm', `cache ${JSON.stringify(of(MEASURED).cache_window)}`)
      assert(of(UNKNOWN).context_measured?.confidence === 'unknown', 'unknown confidence')
      assert(of(COMPACTED).context_invalid_reason === 'compacted' && of(ROUTE).context_invalid_reason === 'route_changed', 'reasons')
      assert(of(ESTIMATE).context_measured === null && of(NEVER).context_measured === null, 'no clocks')
      assert(answer[NEVER]?.estimate === null && IDS.filter(id => id !== NEVER).every(id => (answer[id]?.estimate?.total ?? 0) > 0), JSON.stringify(answer))

      return Object.fromEntries(IDS.map(id => [id, { measured: of(id).context_measured?.tokens ?? null, reason: of(id).context_invalid_reason, estimate: answer[id]?.estimate?.total ?? null }]))
    })

    for (const style of STYLES) {
      await check(`${style}: each fixture's block shows the expected figure (\`155k ctx\` measured, \`~\` + the backend's estimate, \`— ctx\`), and its tooltip the context, the lifetime tokens and the cache state (real hover)`, async () => {
        await switchStyle(page, style)
        await fit(page)
        const expected = expectedLabels(rows, answer)
        const shown = await settledLabels(page)
        const off = IDS.filter(id => shown[id]?.text !== expected[id])

        assert(off.length === 0, `figures off: ${JSON.stringify(off.map(id => [id, shown[id], expected[id]]))}`)
        assert(expected[MEASURED] === '155k ctx' && expected[NEVER] === '— ctx' && expected[ESTIMATE].startsWith('~'), JSON.stringify(expected))
        // Drawn whole: the figure ends inside the box that clips it (card body, block, station label).
        const clipped = await page.evaluate(
          ([ids, container]) =>
            ids
              .map(id => {
                const block = document.querySelector(`[data-testid="session-tree-block"][data-session-id="${id}"]`)!
                const box = (container ? block.querySelector(container)! : block).getBoundingClientRect()
                const figure = block.querySelector('[data-field="context"]')!.getBoundingClientRect()

                return { id, over: Math.round((figure.right - box.right) * 10) / 10 }
              })
              .filter(each => each.over > 0.5),
          [IDS, style === 'rich' ? '.st-rc-body' : style === 'subway' ? '[data-testid="session-tree-station-label"]' : '.st-swim-meta'] as const
        )

        assert(clipped.length === 0, `figures cut at the edge: ${JSON.stringify(clipped)}`)
        const tips: Record<string, string> = {}

        for (const id of [MEASURED, COMPACTED, NEVER]) {
          const row = rows.find(each => each.id === id)!
          const tip = await tooltipOf(page, id)
          const want = [row.title, ...contextTooltip(row, entryOf(answer, row), Date.now())].join('\n')

          assert(tip === want, `${id} tooltip:\n${tip}\n--- wanted ---\n${want}`)
          tips[id] = tip
        }

        await page.screenshot({ path: join(shots, `context-${style}-light.png`) })

        return { shown: Object.fromEntries(IDS.map(id => [id, shown[id]?.text])), tooltip: tips[MEASURED].split('\n') }
      })
    }

    await check('Swimlanes: the lane header keeps the lifetime sum, now ending in `used`', async () => {
      await switchStyle(page, 'swimlanes')
      await fit(page)
      const heads = await page.$$eval('[data-testid="session-tree-lane-header"] [data-field="totals"]', els => els.map(el => (el.textContent ?? '').trim()))

      assert(heads.length >= 3 && heads.every(text => / used$/.test(text) && !/ tok$/.test(text)), JSON.stringify(heads))

      return heads
    })

    await check('Rich cards: the bar shows the context, filled against the largest context in scope (no window known), ± 1 px', async () => {
      await switchStyle(page, 'rich')
      await fit(page)
      await settledLabels(page)
      // Fix r1 (D3): until every in-scope figure settled the scale is pending (unfilled bars, `of` "").
      await page.waitForFunction(() => !document.querySelector('[data-testid="session-tree-block"][data-context-scale="pending"]'), undefined, { timeout: 20_000 })
      const zoom = (await viewport(page)).zoom
      const bars = await page.$$eval(
        '[data-testid="session-tree-block"]',
        (elements, z) =>
          elements
            .filter(element => element.getAttribute('data-out-of-scope') !== 'true')
            .map(element => ({
              id: element.getAttribute('data-session-id')!,
              context: element.getAttribute('data-context'),
              kind: element.getAttribute('data-context-kind'),
              scale: element.getAttribute('data-context-scale'),
              of: Number(element.getAttribute('data-context-of')),
              tokens: Number(element.getAttribute('data-tokens')),
              width: element.querySelector('[data-testid="session-tree-token-bar"]')!.getBoundingClientRect().width / z
            })),
        zoom
      )
      const max = Math.max(...bars.map(bar => Number(bar.context) || 0))
      const off = bars.filter(bar => bar.scale !== 'scope' || bar.of !== max || Math.abs(bar.width - (TOKEN_BAR * (Number(bar.context) || 0)) / max) > 1)
      const byId = Object.fromEntries(bars.map(bar => [bar.id, bar]))
      // The figure is drawn whole inside its card (the footer gives way at the model chip).
      const clipped = await page.$$eval('[data-testid="session-tree-block"]', elements =>
        elements
          .map(element => {
            const card = element.querySelector('.st-rc-body')!.getBoundingClientRect()
            const figure = element.querySelector('[data-field="context"]')!.getBoundingClientRect()

            return { id: element.getAttribute('data-session-id'), over: figure.right - card.right }
          })
          .filter(each => each.over > -4)
      )

      assert(clipped.length === 0, `figures reaching the card edge: ${JSON.stringify(clipped.slice(0, 4))}`)

      assert(max === 154789, `scale ${max}`)
      assert(off.length === 0, `bars off: ${JSON.stringify(off.slice(0, 3))}`)
      assert(Math.abs(byId[MEASURED].width - TOKEN_BAR) <= 1 && byId[NEVER].width === 0, `measured ${byId[MEASURED].width}, never ${byId[NEVER].width}`)
      assert(byId[MEASURED].tokens === lifetimeTokens(rows.find(row => row.id === MEASURED)), 'data-tokens is still the lifetime figure')

      return { max, cards: bars.length, measured: byId[MEASURED].width, estimate: { context: byId[ESTIMATE].context, width: byId[ESTIMATE].width } }
    })

    await check('Dense inspector: the Context section (figure, source, cache state, the estimate\'s categories) and the Tokens used (lifetime) section equal the row', async () => {
      await switchStyle(page, 'dense')
      await fit(page)
      const read = async (id: string) => {
        await page.locator(BLOCK(id)).first().click()
        const inspector = page.locator(`${INSPECTOR}[data-selected-id="${id}"]`)

        await inspector.waitFor({ timeout: 5000 })
        await page.waitForFunction(
          sel => {
            const section = document.querySelector(`${sel} [data-testid="session-tree-inspector-context"]`)

            return section && section.getAttribute('data-kind') !== 'loading' && (section.getAttribute('data-kind') === 'none' || section.querySelector('[data-testid="session-tree-inspector-categories"]'))
          },
          `${INSPECTOR}[data-selected-id="${id}"]`,
          { timeout: 15_000 }
        )

        return inspector.evaluate(el => {
          const text = (name: string) => (el.querySelector(`[data-field="${name}"]`)?.textContent ?? '').trim()
          const title = (name: string) => el.querySelector(`[data-field="${name}"]`)?.getAttribute('title') ?? null

          return {
            kind: el.querySelector('[data-testid="session-tree-inspector-context"]')?.getAttribute('data-kind'),
            context: text('context'),
            tokens: text('context-tokens'),
            source: text('context-source'),
            cache: text('cache-state'),
            cacheState: el.querySelector('[data-field="cache-state"]')?.getAttribute('data-state'),
            total: Number(el.querySelector('[data-testid="session-tree-inspector-categories"]')?.getAttribute('data-total') ?? NaN),
            categories: [...el.querySelectorAll('[data-field="category"]')].map(c => [c.getAttribute('data-id'), Number(c.getAttribute('data-tokens'))]),
            lifetime: text('lifetime'),
            in: title('tokens-in'),
            out: title('tokens-out'),
            read: title('cache-read'),
            write: title('cache-write')
          }
        })
      }
      const measured = await read(MEASURED)
      const row = rows.find(each => each.id === MEASURED)!
      const est = answer[MEASURED]!.estimate!

      assert(measured.kind === 'measured' && measured.context === '155k ctx' && measured.tokens === '154,789 tokens', JSON.stringify(measured))
      assert(/^Measured at the last call, .+Leaves out that call's uncached input and its reply\.$/.test(measured.source), measured.source)
      assert(measured.cacheState === 'warm' && measured.cache === `Cache: ${cacheState(row.cache_window, Date.now()).text}`, measured.cache)
      assert(measured.total === est.total && JSON.stringify(measured.categories) === JSON.stringify(est.categories.map(c => [c.id, c.tokens])), `categories ${JSON.stringify(measured.categories)}`)
      assert(measured.lifetime === usedLabel(lifetimeTokens(row)), measured.lifetime)
      assert(measured.in === fullNumber(row.input_tokens) && measured.out === fullNumber(row.output_tokens), `${measured.in} / ${measured.out}`)
      assert(measured.read === fullNumber(row.cache_read_tokens) && measured.write === fullNumber(row.cache_write_tokens), `${measured.read} / ${measured.write}`)
      const stale = await read(COMPACTED)

      assert(stale.kind === 'estimated' && stale.context === expectedLabels(rows, answer)[COMPACTED] && stale.cacheState === 'unknown', JSON.stringify(stale))
      assert(/compacted or pruned/.test(stale.source) && /compacted or pruned/.test(stale.cache), `${stale.source} | ${stale.cache}`)
      const never = await read(NEVER)

      assert(never.kind === 'none' && never.context === '— ctx' && never.cache === 'Cache: no prompt-cache call stored', JSON.stringify(never))
      await read(MEASURED)
      await page.locator(INSPECTOR).screenshot({ path: join(shots, 'context-inspector-light.png') })

      return { measured, stale: { context: stale.context, cache: stale.cache }, never: never.context }
    })

    await check('light and dark: screenshots of a block per style and of the inspector (the figures paint from the theme)', async () => {
      const out: Record<string, string> = {}

      for (const scheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: scheme })
        await sleep(400)

        for (const style of STYLES) {
          await switchStyle(page, style)
          await fit(page)
          await zoomTo(page, MEASURED)
          await blockShot(page, MEASURED, `context-block-${style}-${scheme}.png`)
          out[`${style}-${scheme}`] = await page.$eval(`${BLOCK(MEASURED)} [data-field="context"]`, el => getComputedStyle(el).color)
        }

        await switchStyle(page, 'dense')
        await fit(page)
        await page.locator(BLOCK(MEASURED)).first().click()
        await page.locator(`${INSPECTOR}[data-selected-id="${MEASURED}"] [data-testid="session-tree-inspector-categories"]`).waitFor({ timeout: 10_000 })
        await page.locator(INSPECTOR).screenshot({ path: join(shots, `context-inspector-${scheme}.png`) })
        out[`inspector-${scheme}`] = await page.$eval(`${INSPECTOR} [data-field="context-tokens"]`, el => getComputedStyle(el).color)
      }

      await page.emulateMedia({ colorScheme: 'light' })
      assert(out['rich-light'] !== out['rich-dark'] && out['inspector-light'] !== out['inspector-dark'], `colours ${JSON.stringify(out)}`)

      return out
    })

    await check('live: an archive of the measured session (a prune, `--archive`) flips its block to `~…` after the refresh', async () => {
      await switchStyle(page, 'subway')
      await fit(page)
      await settledLabels(page)
      const before = (await shownLabels(page))[MEASURED]
      const rowsBefore = await rowsOf(s)
      const from = Date.now()
      const archived = seedFixtures(t, ['--archive', MEASURED]) as { how: string; generation: number; generation_before: number }

      assert(archived.how === 'prune' && archived.generation === archived.generation_before + 1, JSON.stringify(archived))
      // Fix r1 (D5): the backend's own figure under the new signature (the clock now names
      // `compacted`), fetched directly; the block must show exactly that, and the page's refetch
      // for the session must have completed — a stale estimate (loaded earlier by the inspector)
      // never passes for it (D4).
      rows = await waitFor('the listing names the archive', () => rowsOf(s), list => list.find(each => each.id === MEASURED)?.context_invalid_reason === 'compacted', 30_000)
      answer = await estimates(s, IDS)
      const row = rows.find(each => each.id === MEASURED)!
      const want = contextFigure(row, entryOf(answer, row)).label

      assert(/^~\d/.test(want), `the backend's figure ${want}`)
      const sigsMoved = IDS.filter(id => contextSignature(rows.find(each => each.id === id)!) !== contextSignature(rowsBefore.find(each => each.id === id)!))
      const after = await waitFor('the measured block shows the backend\'s new estimate', () => shownLabels(page), labels => labels[MEASURED]?.kind === 'estimated' && labels[MEASURED]?.text === want, 30_000)
      const refetch = await waitFor('the page\'s refetch for the archived session completed', async () => answered.filter(entry => entry.at >= from && entry.ids.includes(MEASURED)), list => list.length > 0, 30_000)

      return { before, after: after[MEASURED], want, refetches: refetch.map(entry => entry.ids), sigsMoved, archived }
    })

    await check('live: an appended message makes the estimate refetch (that session only) and the figure follows (the tooltip\'s full number)', async () => {
      const before = (await shownLabels(page))[ESTIMATE]
      const oldTotal = answer[ESTIMATE]?.estimate?.total ?? 0
      // Fix r1 (D5): the window opens only after the archive's refetch has completed (above).
      const from = Date.now()
      const askedSince = () =>
        log
          .filter(entry => entry.at >= from && entry.method === 'POST' && entry.path.startsWith('/sessions/context') && !entry.path.includes(DIRECT))
          .flatMap(entry => (JSON.parse(entry.body ?? '{}') as { ids?: string[] }).ids ?? [])

      seedFixtures(t, ['--append', ESTIMATE])
      rows = await waitFor('the listing has the appended message', () => rowsOf(s), list => contextSignature(list.find(each => each.id === ESTIMATE)!) !== contextSignature(rows.find(each => each.id === ESTIMATE)!), 30_000)
      answer = await estimates(s, IDS)
      const newTotal = answer[ESTIMATE]?.estimate?.total ?? 0
      const row = rows.find(each => each.id === ESTIMATE)!
      const want = contextFigure(row, entryOf(answer, row)).label
      const after = (await waitFor('the block shows the backend\'s new estimate', () => shownLabels(page), labels => labels[ESTIMATE]?.kind === 'estimated' && labels[ESTIMATE]?.text === want, 30_000))[ESTIMATE]

      await waitFor('the page\'s refetch for the appended session completed', async () => answered.filter(entry => entry.at >= from && entry.ids.includes(ESTIMATE)), list => list.length > 0, 30_000)
      const tip = await tooltipOf(page, ESTIMATE)
      const asked = askedSince()

      assert(newTotal > oldTotal, `estimate ${oldTotal} → ${newTotal}`)
      assert(tip.includes(`Context: ~${fullNumber(newTotal)} tokens`), tip)
      assert(asked.length > 0 && asked.every(id => id === ESTIMATE), `asked for ${JSON.stringify(asked)}; timeline ${JSON.stringify(log.filter(entry => entry.at >= from).map(entry => `${entry.at - from} ${entry.method} ${entry.path.split('?')[0]} ${entry.body ?? ''}`))}`)

      return { before: before?.text, after: after?.text, total: [oldTotal, newTotal], asked }
    })

    await check('Rich cards (fix r1, B1): the bar\'s scale is the whole scope\'s, whatever the viewport — zoomed in on a card far from the largest and reloaded, then Fit: the same data-context-of and the same fill (± 1 px); no estimate request over 100 ids', async () => {
      const FAR = 'st-rich-code'
      const rich = seedFixtures(t, ['--rich']) as { created?: boolean }

      assert(rich.created === true, `the Rich fixtures were not created: ${JSON.stringify(rich)}`)
      await switchStyle(page, 'rich')
      await reloadTree(t, s)
      await page.locator(BLOCK(FAR)).first().waitFor({ timeout: 20_000 })
      await fit(page)
      await zoomTo(page, FAR, 12)
      const zoomed = await viewport(page)

      assert(zoomed.zoom > 2.4, `zoom ${zoomed.zoom}`)
      await reloadTree(t, s)
      await page.locator(BLOCK(FAR)).first().waitFor({ timeout: 20_000 })
      const read = () =>
        page.$eval(BLOCK(FAR), element => {
          const bar = element.querySelector('[data-testid="session-tree-token-bar"]')!.getBoundingClientRect()
          const track = element.querySelector('.st-rc-bar')!.getBoundingClientRect()

          return { of: element.getAttribute('data-context-of'), scale: element.getAttribute('data-context-scale'), context: element.getAttribute('data-context'), fill: bar.width / track.width }
        })
      const first = await read()
      const atZoom = await waitFor('the scale is not pending', read, value => value.scale === 'scope' && value.of !== '', 30_000)
      const reloaded = await viewport(page)
      /** Which in-scope cards are on screen now (the largest is not among the far card's neighbours). */
      const onScreen = await page.$$eval('[data-testid="session-tree-block"]', elements =>
        elements
          .filter(element => {
            const r = element.getBoundingClientRect()

            return r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight
          })
          .map(element => element.getAttribute('data-session-id'))
      )

      await fit(page)
      const atFit = await read()
      const cards = await page.$$eval('[data-testid="session-tree-block"]', elements =>
        elements.filter(element => element.getAttribute('data-out-of-scope') !== 'true').map(element => ({ id: element.getAttribute('data-session-id'), context: Number(element.getAttribute('data-context')) || 0 }))
      )
      const largest = cards.reduce((best, card) => (card.context > best.context ? card : best), cards[0])
      const oversize = log.filter(entry => entry.method === 'POST' && entry.path.startsWith('/sessions/context') && !entry.path.includes(DIRECT)).map(entry => ((JSON.parse(entry.body ?? '{}') as { ids?: string[] }).ids ?? []).length)

      assert(reloaded.zoom > 2.4, `the reload did not keep the zoom: ${reloaded.zoom}`)
      assert(Number(atZoom.context) > 0, `the far card has no figure: ${JSON.stringify(atZoom)}`)
      assert(atFit.of === atZoom.of && atFit.scale === 'scope', `data-context-of ${atZoom.of} at zoom vs ${atFit.of} at Fit`)
      assert(Math.abs(atFit.fill - atZoom.fill) * TOKEN_BAR <= 1, `fill ${atZoom.fill} at zoom vs ${atFit.fill} at Fit`)
      assert(Number(atFit.of) === largest.context, `scale ${atFit.of} vs the largest in-scope card ${largest.id} ${largest.context}`)
      assert(oversize.every(n => n <= 100), `a request asked for ${Math.max(...oversize)} ids`)

      return { far: FAR, firstRead: first, atZoom, atFit, zoom: reloaded.zoom, largest, onScreen, largestOnScreen: onScreen.includes(largest.id), requests: oversize.length, maxIds: Math.max(...oversize) }
    })

    await check('no page errors from the plugin', () => {
      const fromPlugin = stacks.filter(stack => /blob:|session-tree|desktop-plugins/.test(stack))

      assert(fromPlugin.length === 0, fromPlugin.join('\n'))
      assert(s.errors.length === 0, s.errors.join('\n'))
    })

    await check('an older backend (the base commit\'s dashboard/, this page): `— ctx` and the lifetime figure, no context request, no error', async () => {
      await page.goto('about:blank')
      stopGateway(t)
      relink(oldBackendPackage(packageDir))
      await signIn(t, page)
      await openTree(t, s).catch(async () => {
        await enableDesktopHalf(t, page)
        await openTree(t, s)
      })
      const oldRows = await rowsOf(s)

      assert(oldRows.length > 0 && !('context_measured' in oldRows[0]), 'the backend is not the old one')
      const from = Date.now()

      await switchStyle(page, 'rich')
      await reloadTree(t, s)
      await fit(page)
      await sleep(1500)
      const shown = await shownLabels(page)
      const tip = await tooltipOf(page, MEASURED)
      const requests = log.filter(entry => entry.at >= from && entry.path.startsWith('/sessions/context'))
      const row = oldRows.find(each => each.id === MEASURED)!

      assert(IDS.every(id => shown[id]?.text === '— ctx' && shown[id]?.kind === 'none'), JSON.stringify(shown))
      assert(requests.length === 0, `context requests: ${requests.length}`)
      assert(tip.includes('Context: not reported by this Hermes backend') && tip.includes(`${fullNumber(lifetimeTokens(row))} tokens used`), tip)
      const fromPlugin = stacks.filter(stack => /blob:|session-tree|desktop-plugins/.test(stack))

      assert(fromPlugin.length === 0 && s.errors.length === 0, [...fromPlugin, ...s.errors].join('\n'))
      await page.screenshot({ path: join(shots, 'context-old-backend-light.png') })

      return { shown: shown[MEASURED], tip: tip.split('\n') }
    })
  } finally {
    await close(s)
    stopGateway(t)

    if (existsSync(join(t.root, 'package-old'))) {
      relink(packageDir)
    }

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

  writeFileSync(join(t.root, 'e2e-context-facts.json'), `${JSON.stringify({ results, facts, base: webappBase(t) }, null, 2)}\n`)
  const failed = results.filter(r => !r.ok)

  console.log(`\ne2e-context: ${results.length - failed.length} passed, ${failed.length} failed (screenshots: ${shots})`)
  process.exitCode = failed.length === 0 ? 0 : 1
}

await main()
