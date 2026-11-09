/**
 * Captures the unit-test fixtures from the isolated test Hermes: the backend's `/sessions` rows
 * and the gateway's `projects.tree` for the seeded `default` profile (archived included) and the
 * 500-session `scale` profile, read through the Webapp exactly as the page reads them.
 *
 *   scripts/test-hermes start   # seeded test Hermes on the role's port block
 *   node scripts/capture-fixtures.ts
 *
 * Writes tests/js/fixtures/{default,scale}.json, trimmed to the fields the graph model reads,
 * with the test root's absolute path replaced by `/e2e`.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { close, enableDesktopHalf, goto, launch, signIn } from './e2e/browser.ts'
import { REPO, testHermes } from './e2e/harness.ts'

const KEEP = [
  'id', 'profile', 'title', 'preview', 'source', 'started_at', 'last_active', 'ended_at', 'message_count',
  'tool_call_count', 'input_tokens', 'output_tokens', 'estimated_cost_usd', 'actual_cost_usd', 'model', 'cwd',
  'git_repo_root', 'parent_session_id', '_branched_from', '_reset_from', '_lineage_root_id', '_lineage_ids',
  'continuation_kind', 'compacted_segments', 'is_internal_child', 'archived', 'pinned', 'unread', 'is_active'
]

const t = testHermes()
const s = await launch()
const out = join(REPO, 'tests', 'js', 'fixtures')

try {
  await signIn(t, s.page)
  await enableDesktopHalf(t, s.page)
  await goto(t, s.page, '/session-tree')
  await s.page.locator('[data-testid="session-tree-page"]').waitFor({ timeout: 30_000 })
  mkdirSync(out, { recursive: true })

  for (const profile of ['default', 'scale']) {
    const data = await s.page.evaluate(async name => {
      const bridge = (window as unknown as { hermesDesktop: { api(req: { path: string }): Promise<{ sessions: Record<string, unknown>[] }> } }).hermesDesktop
      const host = (globalThis as unknown as { __HERMES_PLUGIN_SDK__: { host: { request(m: string, p: object): Promise<unknown> } } }).__HERMES_PLUGIN_SDK__.host
      const rows = await bridge.api({ path: `/api/plugins/session-tree/sessions?session_profile=${name}&include_archived=true&limit=2000` })
      const tree = await host.request('projects.tree', { profile: name, preview_limit: 0 })

      return { rows: rows.sessions, tree }
    }, profile)
    const rows = data.rows.map(row => Object.fromEntries(KEEP.filter(key => key in row).map(key => [key, row[key]])))
    const projects = ((data.tree as { projects: Record<string, unknown>[] }).projects ?? []).map(project => ({
      id: project.id,
      label: project.label,
      color: project.color ?? null,
      icon: project.icon ?? null,
      isNoProject: project.isNoProject ?? false,
      isAuto: project.isAuto ?? false,
      path: project.path ?? null,
      repos: ((project.repos as { path?: string }[] | undefined) ?? []).map(repo => ({ path: repo.path ?? null })),
      sessionIds: project.sessionIds ?? []
    }))
    const text = JSON.stringify({ profile, rows, projectsTree: { projects } }, null, 1).replaceAll(t.root, '/e2e')

    writeFileSync(join(out, `${profile}.json`), `${text}\n`)
    console.log(`${profile}: ${rows.length} rows, ${projects.length} projects`)
  }
} finally {
  await close(s)
}
