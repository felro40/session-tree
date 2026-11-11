/**
 * `npm run clean:e2e [--all]` (card 8, F5): frees the disk the e2e test homes take.
 *
 *   npm run clean:e2e          the trash and this role's stopped test homes of the current card
 *                              (`c<card>-<role>`, `c<card>-<role>-<variant>`; SESSION_TREE_ROLE,
 *                              SESSION_TREE_CARD as everywhere in the harness)
 *   npm run clean:e2e -- --all the trash and every card's and role's test homes
 *
 * A test home is a `c<card>-<role>[-<variant>]` directory of the e2e root with a `home/` in it;
 * nothing else there is touched (`pytest-venv`, logs, screenshot folders). It refuses, and
 * deletes nothing, while a test gateway (or any process started under one of those homes or trash
 * entries) runs. Each home is moved into the trash, and every trash entry is deleted by the one
 * guarded helper (`scripts/e2e/trash.ts`, `deleteTrashEntry`), which never follows a symlink.
 * Prints each removed path with its size.
 */
import { existsSync, lstatSync, readdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'

import { CARD, E2E_ROOT } from './harness.ts'
import { deleteTrashEntry, humanSize, liveProcesses, trashDir, TrashRefusal } from './trash.ts'

const HOME_NAME = /^c(\d+)-(coder|reviewer)(?:-([a-z][a-z0-9-]*))?$/
/** Kept whatever the scope: the test-only pytest venv the Python tests reuse. */
const KEEP = new Set(['pytest-venv', 'trash'])

export interface Plan {
  homes: string[]
  trash: string[]
}

/** The test homes `clean:e2e` would remove (`all`: every card and role), and the trash entries. */
export function plan({ all = false, root = E2E_ROOT, card = CARD, role = process.env.SESSION_TREE_ROLE || 'coder' }: { all?: boolean; root?: string; card?: number; role?: string } = {}): Plan {
  const homes: string[] = []

  for (const name of existsSync(root) ? readdirSync(root).sort() : []) {
    const match = HOME_NAME.exec(name)
    const dir = join(root, name)

    if (KEEP.has(name) || !match || lstatSync(dir).isSymbolicLink() || !lstatSync(dir).isDirectory()) {
      continue
    }

    const home = join(dir, 'home')

    if (!existsSync(home) || lstatSync(home).isSymbolicLink() || !lstatSync(home).isDirectory()) {
      continue
    }

    if (all || (Number(match[1]) === card && match[2] === role)) {
      homes.push(dir)
    }
  }

  const trash = join(root, 'trash')

  return { homes, trash: existsSync(trash) ? readdirSync(trash).sort().map(name => join(trash, name)) : [] }
}

export function clean({ all = false, root = E2E_ROOT, card = CARD, role = process.env.SESSION_TREE_ROLE || 'coder', log = console.log }: { all?: boolean; root?: string; card?: number; role?: string; log?: (line: string) => void } = {}): number {
  const { homes, trash } = plan({ all, root, card, role })
  const running = [...homes, ...trash].map(dir => ({ dir, pids: liveProcesses(dir) })).filter(each => each.pids.length > 0)

  if (running.length > 0) {
    for (const { dir, pids } of running) {
      log(`refused: ${dir} has a running test gateway or process (pid ${pids.join(', ')}); stop it first (scripts/test-hermes stop)`)
    }

    log('nothing removed')

    return 1
  }

  const bin = trashDir(root)
  const targets: { shown: string; entry: string }[] = trash.map(entry => ({ shown: entry, entry }))

  for (const dir of homes) {
    const entry = join(bin, `${dir.split('/').pop()}-${Date.now()}`)

    renameSync(dir, entry)
    targets.push({ shown: dir, entry })
  }

  let total = 0
  let refused = 0

  for (const { shown, entry } of targets) {
    try {
      const bytes = deleteTrashEntry(entry, root)

      total += bytes
      log(`removed ${shown} (${humanSize(bytes)})`)
    } catch (error) {
      if (!(error instanceof TrashRefusal)) {
        throw error
      }

      refused += 1
      log(`refused: ${error.message}`)
    }
  }

  log(`${targets.length - refused} removed, ${humanSize(total)} freed${refused ? `, ${refused} refused` : ''} (scope: ${all ? 'every card and role' : `card ${card}, role ${role}`}; kept: pytest-venv and everything that is not a test home)`)

  return refused ? 1 : 0
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  const unknown = args.filter(arg => arg !== '--all')

  if (unknown.length > 0) {
    console.error(`usage: npm run clean:e2e [-- --all] (unknown: ${unknown.join(' ')})`)
    process.exit(2)
  }

  process.exitCode = clean({ all: args.includes('--all') })
}
