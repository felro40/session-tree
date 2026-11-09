/**
 * `scripts/test-hermes <command>` — manage the isolated test Hermes for this repo.
 *
 *   launcher         write <root>/hermes only (used by `npm run test:py`)
 *   python           print the committed Hermes Python (read-only use)
 *   setup            launcher, config (Webapp on the role's port, plugins.enabled), package link,
 *                    fixture profiles and fixtures (idempotent)
 *   start            setup, then `hermes webapp --no-open --skip-build`; prints the sign-in link
 *   link             a fresh one-use sign-in link from the running gateway
 *   status           gateway processes and their TCP listeners
 *   backend on|off   put session-tree in / out of plugins.enabled and restart the gateway
 *   touch            rename one fixture (a real state.db change → sessions.changed)
 *   stop             stop the gateway and anything else started under the test home
 *   reset            stop, then move the role's root to <e2e root>/trash/
 *
 * Role: SESSION_TREE_ROLE=coder|reviewer (default coder).
 */
import { mkdirSync, renameSync, existsSync } from 'node:fs'
import { join } from 'node:path'

import {
  configure,
  E2E_ROOT,
  ensureLauncher,
  hermesPython,
  listenersOf,
  seedFixtures,
  setup,
  signInLink,
  stopGateway,
  testHermes,
  testHermesPids
} from './harness.ts'

const t = testHermes()
const [command, arg] = process.argv.slice(2)

function status(): { pids: number[]; listeners: string[] } {
  const pids = testHermesPids(t)

  return { pids, listeners: listenersOf(pids) }
}

switch (command) {
  case 'launcher':
    ensureLauncher(t)
    console.log(t.launcher)
    break
  case 'python':
    console.log(hermesPython())
    break
  case 'setup':
    console.log(JSON.stringify({ role: t.role, home: t.home, seed: summarize(setup(t)) }, null, 2))
    break
  case 'start': {
    const seed = setup(t)
    const link = signInLink(t)

    console.log(JSON.stringify({ role: t.role, home: t.home, seed: summarize(seed), ...status() }, null, 2))
    console.log(link)
    break
  }
  case 'link':
    console.log(signInLink(t))
    break
  case 'status':
    console.log(JSON.stringify({ role: t.role, home: t.home, ...status() }, null, 2))
    break
  case 'backend': {
    if (arg !== 'on' && arg !== 'off') {
      throw new Error('usage: test-hermes backend on|off')
    }

    configure(t, { backendEnabled: arg === 'on' })
    stopGateway(t)
    signInLink(t)
    console.log(JSON.stringify({ backend: arg, ...status() }, null, 2))
    break
  }
  case 'touch':
    console.log(JSON.stringify(seedFixtures(t, ['--touch'])))
    break
  case 'stop':
    stopGateway(t)
    console.log(JSON.stringify({ stopped: true, ...status() }, null, 2))
    break
  case 'reset': {
    stopGateway(t)

    if (existsSync(t.root)) {
      const trash = join(E2E_ROOT, 'trash')

      mkdirSync(trash, { recursive: true })
      renameSync(t.root, join(trash, `c1-${t.role}-${Date.now()}`))
    }

    console.log(JSON.stringify({ reset: true, root: t.root }))
    break
  }
  default:
    console.error('usage: test-hermes setup|start|link|status|backend on|off|touch|stop|reset')
    process.exit(2)
}

function summarize(seed: unknown): unknown {
  const m = seed as { seeded?: boolean; created?: unknown[] }

  return { seeded: m.seeded, defaultProfileRows: m.created?.length }
}
