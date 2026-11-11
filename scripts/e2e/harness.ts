/**
 * Test-Hermes harness: one isolated Hermes per role, outside ~/.hermes.
 *
 *   root  /home/david/.cache/session-tree-e2e/c<card>-<role>/
 *   home  <root>/home            (HERMES_HOME of the isolated gateway)
 *   ports 19300 + 10·card: coder +0..+4, reviewer +5..+9 (the Webapp listens on the first);
 *         card 5 (the default): coder 19350-19354, reviewer 19355-19359
 *
 * The card number comes from SESSION_TREE_CARD (default: scripts/e2e/CARD, the current card).
 *
 * The user's real Hermes is never touched: no writes under ~/.hermes, no build in the
 * Hermes checkout (`hermes webapp --skip-build` always), and the package is linked
 * only into the test home's plugins/.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, readlinkSync, renameSync, symlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const PLUGIN_ID = 'session-tree'
export const E2E_ROOT = process.env.SESSION_TREE_E2E_ROOT ?? join(homedir(), '.cache', 'session-tree-e2e')
const USER_HERMES = join(homedir(), '.hermes')
const HERMES_AGENT = process.env.HERMES_AGENT_DIR ?? join(USER_HERMES, 'hermes-agent')
const NODE_BIN = dirname(process.execPath)

export type Role = 'coder' | 'reviewer'

/**
 * The default card: the one source of truth is `scripts/e2e/CARD` (card 7 fix r1 B1: run-pytest.sh
 * once defaulted to 6 while this file said 7). run-pytest.sh and scripts/test-hermes take the
 * root from this module (`test-hermes-cli.ts launcher`), so neither has a card number of its own.
 */
export const DEFAULT_CARD = Number(readFileSync(join(REPO, 'scripts', 'e2e', 'CARD'), 'utf8').trim())

/** The card whose test home and port block this run uses (each card of the set has its own). */
export const CARD = Number(process.env.SESSION_TREE_CARD ?? DEFAULT_CARD)

if (!Number.isInteger(CARD) || CARD < 1 || CARD > 9) {
  throw new Error(`SESSION_TREE_CARD must be 1..9, got ${process.env.SESSION_TREE_CARD}`)
}

const PORT_BASE: Record<Role, number> = { coder: 19300 + CARD * 10, reviewer: 19305 + CARD * 10 }
/** Ports the user's live Hermes and host services hold; never used here. */
export const FORBIDDEN_PORTS = [9119, 9120, 8765, 5720, 13000, 18000, 2019, 24800, 22, 25, 53, 80, 443, 631]

export interface TestHermes {
  role: Role
  root: string
  home: string
  userHome: string
  launcher: string
  webappPort: number
  portBlock: [number, number]
  projectsDir: string
}

export function testHermes(
  role: Role = (process.env.SESSION_TREE_ROLE as Role) || 'coder',
  { variant }: { variant?: string } = {}
): TestHermes {
  if (!(role in PORT_BASE)) {
    throw new Error(`role must be coder or reviewer, got ${role}`)
  }

  if (variant !== undefined && !/^[a-z][a-z0-9-]{0,20}$/.test(variant)) {
    throw new Error(`bad test home variant ${variant}`)
  }

  // A variant (card 3: `actions`) is a second home of the same role on the same ports, for a
  // suite that mutates its fixtures; suites run one after the other, never at once.
  const root = join(E2E_ROOT, `c${CARD}-${role}${variant ? `-${variant}` : ''}`)
  const base = PORT_BASE[role]

  return {
    role,
    root,
    home: join(root, 'home'),
    userHome: join(root, 'userhome'),
    launcher: join(root, 'hermes'),
    webappPort: base,
    portBlock: [base, base + 4],
    projectsDir: join(root, 'projects')
  }
}

/** Environment for every isolated Hermes call: nothing inherited from the worker. */
export function isolatedEnv(t: TestHermes): NodeJS.ProcessEnv {
  return {
    HOME: t.userHome,
    HERMES_HOME: t.home,
    HERMES_GATEWAY_LOCK_DIR: join(t.root, 'locks'),
    TMPDIR: join(t.root, 'tmp'),
    XDG_CONFIG_HOME: join(t.userHome, '.config'),
    XDG_CACHE_HOME: join(t.userHome, '.cache'),
    XDG_DATA_HOME: join(t.userHome, '.local', 'share'),
    XDG_STATE_HOME: join(t.userHome, '.local', 'state'),
    PATH: `${NODE_BIN}:/usr/bin:/bin`,
    LANG: 'C.UTF-8'
  }
}

/** The Python the user's Hermes install committed (read-only use; never installed into). */
export function hermesPython(): string {
  if (process.env.HERMES_PYTHON) {
    return process.env.HERMES_PYTHON
  }

  const installs = join(USER_HERMES, 'installs')

  for (const key of readdirSync(installs)) {
    const facts = join(installs, key, 'facts.json')

    if (existsSync(facts)) {
      const env = JSON.parse(readFileSync(facts, 'utf8'))?.packages?.venv?.environment

      if (env && existsSync(join(env, 'bin', 'python'))) {
        return join(env, 'bin', 'python')
      }
    }
  }

  throw new Error(`no committed Hermes Python under ${installs}; set HERMES_PYTHON`)
}

/**
 * `<root>/hermes`: the runtime command `hermes --print-runtime-command` prints, run with the
 * committed venv Python. A bare `hermes` under a fresh HERMES_HOME refuses with "no dependency
 * environment is committed for this install"; this launcher avoids `hermes pm repair`, which
 * would write into the user's install.
 */
export function ensureLauncher(t: TestHermes): void {
  for (const dir of [t.root, t.home, t.userHome, join(t.root, 'tmp'), join(t.root, 'locks')]) {
    mkdirSync(dir, { recursive: true })
  }

  const python = hermesPython()
  // `--run-path <script>` runs a script inside the bootstrapped Hermes environment (the
  // data root's dependency env that hermes_bootstrap puts on sys.path), like the stock
  // launcher's `--run-module`.
  const code =
    "import os, sys, runpy; os.environ.pop('PYTHONHOME', None); os.environ.pop('PYTHONPATH', None); " +
    "os.environ.pop('VIRTUAL_ENV', None); " +
    `sys.path.insert(0, '${HERMES_AGENT}'); sys._hermes_pin_default_home = True; import hermes_bootstrap; ` +
    "os.environ.get('HERMES_HOME') or os.environ.__setitem__('HERMES_HOME', " +
    "str(__import__('hermes_constants').get_default_hermes_root())); " +
    "script = sys.argv.pop(2) if sys.argv[1:2] == ['--run-path'] and len(sys.argv) > 2 else None; " +
    "(sys.argv.pop(1), runpy.run_path(script, run_name='__main__')) if script else " +
    "runpy.run_module('hermes_cli.main', run_name='__main__', alter_sys=True)"

  writeFileSync(t.launcher, `#!/bin/sh\nexec ${python} -I -c "${code}" "$@"\n`, { mode: 0o755 })
}

export interface RunResult {
  status: number
  stdout: string
  stderr: string
}

export function hermes(t: TestHermes, args: string[], { timeoutMs = 120_000, input }: { timeoutMs?: number; input?: string } = {}): RunResult {
  const result = spawnSync(t.launcher, args, {
    cwd: t.root,
    env: isolatedEnv(t),
    encoding: 'utf8',
    timeout: timeoutMs,
    input
  })

  return { status: result.status ?? -1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

function hermesOk(t: TestHermes, args: string[]): string {
  const result = hermes(t, args)

  if (result.status !== 0) {
    throw new Error(`hermes ${args.join(' ')} failed (${result.status}): ${result.stderr || result.stdout}`)
  }

  return result.stdout
}

/** Webapp on the role's first port, the package enabled for the agent half (backend mount). */
export function configure(t: TestHermes, { backendEnabled = true }: { backendEnabled?: boolean } = {}): void {
  hermesOk(t, ['config', 'set', 'webapp.enabled', 'true'])
  hermesOk(t, ['config', 'set', 'webapp.host', '127.0.0.1'])
  hermesOk(t, ['config', 'set', 'webapp.port', String(t.webappPort)])
  hermesOk(t, ['config', 'set', 'plugins.enabled', backendEnabled ? `["${PLUGIN_ID}"]` : '[]'])
}

/** The one place a link to this package is allowed: the TEST home's plugins/. */
export function linkPackage(t: TestHermes, target: string = REPO): void {
  const plugins = join(t.home, 'plugins')
  const link = join(plugins, PLUGIN_ID)

  mkdirSync(plugins, { recursive: true })

  if (existsSync(link)) {
    if (readlinkSync(link) !== target) {
      throw new Error(`${link} exists and does not point at ${target}`)
    }

    return
  }

  symlinkSync(target, link)
}

/**
 * Card 4: the package as the sync suite installs it, `<root>/package/`: the same agent half and
 * backend (copied from the checkout), but a desktop/plugin.js built with the test-only style
 * (`scripts/build.mjs --test-styles`). The committed desktop/plugin.js is never that build.
 */
export function buildTestPackage(t: TestHermes): string {
  const dir = join(t.root, 'package')

  for (const sub of ['dashboard', 'desktop']) {
    mkdirSync(join(dir, sub), { recursive: true })
  }

  for (const file of ['plugin.yaml', '__init__.py', 'dashboard/manifest.json', 'dashboard/plugin_api.py', 'dashboard/layout_store.py', 'dashboard/session_details.py']) {
    copyFileSync(join(REPO, file), join(dir, file))
  }

  execFileSync(process.execPath, [join(REPO, 'scripts', 'build.mjs'), '--test-styles', '--outfile', join(dir, 'desktop', 'plugin.js')], {
    cwd: REPO,
    encoding: 'utf8'
  })

  return dir
}

/**
 * The synced layout store of the test home (`<home>/session-tree/`). A suite that reuses the
 * shared home starts from no stored layout and settings: an earlier run's drops or Snap would
 * otherwise carry over (they are synced, by design). Moved aside, never deleted.
 */
export function resetLayoutStore(t: TestHermes): void {
  const store = join(t.home, PLUGIN_ID)

  if (existsSync(store)) {
    const aside = join(t.root, 'layout-store-old')

    mkdirSync(aside, { recursive: true })
    renameSync(store, join(aside, `${Date.now()}`))
  }
}

/** Second profile (3 sessions) and the 500-session scale profile the seeder fills. */
export const FIXTURE_PROFILES = ['work', 'scale']

export function ensureProfiles(t: TestHermes): void {
  for (const name of FIXTURE_PROFILES) {
    if (!existsSync(join(t.home, 'profiles', name))) {
      hermesOk(t, ['profile', 'create', name, '--no-alias', '--no-skills'])
    }
  }
}

/** Everything `start` needs before the gateway runs: launcher, config, package link, fixtures. */
export function setup(t: TestHermes, { backendEnabled = true, packageDir = REPO }: { backendEnabled?: boolean; packageDir?: string } = {}): unknown {
  ensureLauncher(t)
  configure(t, { backendEnabled })
  linkPackage(t, packageDir)
  ensureProfiles(t)
  resetLayoutStore(t)

  return seedFixtures(t)
}

export function seedFixtures(t: TestHermes, extra: string[] = []): unknown {
  const out = execFileSync(t.launcher, ['--run-path', join(REPO, 'scripts', 'seed-fixtures.py'), ...extra], {
    cwd: t.root,
    env: { ...isolatedEnv(t), SESSION_TREE_PROJECTS_DIR: t.projectsDir },
    encoding: 'utf8',
    timeout: 300_000
  })

  return JSON.parse(out.trim().split('\n').pop() ?? '{}')
}

/** PIDs of processes whose environment names this test home (gateway and its children). */
export function testHermesPids(t: TestHermes): number[] {
  const needle = `HERMES_HOME=${t.home}\0`
  const pids: number[] = []

  for (const entry of readdirSync('/proc')) {
    if (!/^\d+$/.test(entry) || Number(entry) === process.pid) {
      continue
    }

    try {
      if (`${readFileSync(`/proc/${entry}/environ`, 'latin1')}\0`.includes(needle)) {
        pids.push(Number(entry))
      }
    } catch {
      // Gone or not ours.
    }
  }

  return pids
}

/** TCP listeners owned by the given PIDs (`ss -ltnp`). */
export function listenersOf(pids: readonly number[]): string[] {
  const out = spawnSync('ss', ['-ltnpH'], { encoding: 'utf8' }).stdout ?? ''

  return out
    .split('\n')
    .filter(line => pids.some(pid => line.includes(`pid=${pid},`)))
    .map(line => line.trim().split(/\s+/)[3])
}

/**
 * Starts the gateway (if needed) through `hermes webapp --no-open --skip-build` and returns the
 * one-use sign-in link it prints (valid 60 s). Calling it again on a running gateway mints a new link.
 */
export function signInLink(t: TestHermes): string {
  const result = hermes(t, ['webapp', '--no-open', '--skip-build'], { timeoutMs: 180_000 })
  const match = /(http:\/\/127\.0\.0\.1:\d+\/webapp\/launch#ticket=\S+)/.exec(result.stdout)

  if (result.status !== 0 || !match) {
    throw new Error(`hermes webapp did not print a link (${result.status}): ${result.stderr || result.stdout}`)
  }

  if (!result.stdout.includes('(--skip-build)')) {
    throw new Error('hermes webapp did not confirm --skip-build reuse')
  }

  return match[1]
}

export function stopGateway(t: TestHermes): void {
  hermes(t, ['gateway', 'stop'], { timeoutMs: 60_000 })

  const deadline = Date.now() + 20_000

  while (Date.now() < deadline && testHermesPids(t).length > 0) {
    spawnSync('sleep', ['0.5'])
  }

  // A child that outlives `gateway stop` is ours by environment; SIGTERM it by literal pid.
  for (const pid of testHermesPids(t)) {
    try {
      process.kill(pid, 'SIGTERM')
    } catch {
      // Already gone.
    }
  }
}

export function webappBase(t: TestHermes): string {
  return `http://127.0.0.1:${t.webappPort}`
}
