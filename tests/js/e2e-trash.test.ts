/**
 * Card 8 (F5): the e2e trash prune and `npm run clean:e2e`, on temporary e2e roots only (never
 * ~/.cache/session-tree-e2e, never ~/.hermes).
 *
 * - `deleteTrashEntry` (scripts/e2e/trash.ts) is the one delete: a direct child of the real
 *   `<root>/trash` only (not through `..`, not a trash entry that is a symlink), never following a
 *   symlink inside what it deletes, refusing a home whose gateway pid is alive.
 * - `pruneTrash` keeps the newest moved-aside copy of each home name.
 * - `clean` (scripts/e2e/clean.ts): the role's homes or, with `--all`, every card's and role's;
 *   keeps `pytest-venv` and whatever is not a test home; refuses while a test gateway runs.
 */
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { existsSync, linkSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { after, describe, it } from 'node:test'

import { clean, plan } from '../../scripts/e2e/clean.ts'
import { deleteTrashEntry, homeName, liveProcesses, moveAside, pruneTrash, sizeOf, TrashRefusal } from '../../scripts/e2e/trash.ts'

const REPO = resolve(import.meta.dirname, '..', '..')
const scratch = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'st-trash-'))
const children: ChildProcess[] = []

after(() => {
  for (const child of children) {
    child.kill('SIGKILL')
  }

  rmSync(scratch, { recursive: true, force: true })
})

let rootCount = 0

/** A fresh e2e root with an empty trash. */
function newRoot(): string {
  rootCount += 1
  const root = join(scratch, `root-${rootCount}`)

  mkdirSync(join(root, 'trash'), { recursive: true })

  return root
}

/** A fake test home: `<dir>/home/state.db` and a few files, optionally a gateway.pid. */
function fakeHome(dir: string, { pid }: { pid?: number } = {}): string {
  mkdirSync(join(dir, 'home', 'plugins'), { recursive: true })
  writeFileSync(join(dir, 'home', 'state.db'), 'x'.repeat(1000))
  writeFileSync(join(dir, 'hermes'), '#!/bin/sh\n')

  if (pid !== undefined) {
    writeFileSync(join(dir, 'home', 'gateway.pid'), JSON.stringify({ pid, kind: 'hermes-gateway' }))
  }

  return dir
}

/** A process that stays alive until the test ends (a stand-in for a running test gateway). */
function sleeper(): number {
  const child = spawn('sleep', ['300'], { stdio: 'ignore' })

  children.push(child)

  return child.pid!
}

const quiet = () => undefined

describe('e2e trash: the guarded delete (card 8, F5)', () => {
  it('homeName strips the -<ms> suffix the move adds', () => {
    assert.equal(homeName('c8-coder-rich-1794369554123'), 'c8-coder-rich')
    assert.equal(homeName('c8-coder-1794369554123'), 'c8-coder')
    assert.equal(homeName('c8-coder'), 'c8-coder')
  })

  it('sizes count a hard-linked file once and a symlink as a link (as du --apparent-size does)', () => {
    const dir = join(scratch, `sized-${(rootCount += 1)}`)

    mkdirSync(join(dir, 'a'), { recursive: true })
    writeFileSync(join(dir, 'a', 'big'), 'x'.repeat(10_000))
    linkSync(join(dir, 'a', 'big'), join(dir, 'big-again'))
    symlinkSync(join(dir, 'a', 'big'), join(dir, 'big-link'))
    const total = sizeOf(dir)

    assert.ok(total >= 10_000 && total < 20_000, String(total))
  })

  it('prune keeps the newest moved-aside copy of each home name and deletes the older ones', () => {
    const root = newRoot()
    const trash = join(root, 'trash')

    for (const name of ['c8-coder-rich-1700000000001', 'c8-coder-rich-1700000000003', 'c8-coder-rich-1700000000002', 'c8-coder-1700000000005', 'c8-reviewer-sync-1700000000001']) {
      fakeHome(join(trash, name))
    }

    const { removed, refused } = pruneTrash(root, quiet)

    assert.deepEqual(readdirSync(trash).sort(), ['c8-coder-1700000000005', 'c8-coder-rich-1700000000003', 'c8-reviewer-sync-1700000000001'])
    assert.deepEqual(removed.map(each => each.path.split('/').pop()).sort(), ['c8-coder-rich-1700000000001', 'c8-coder-rich-1700000000002'])
    assert.ok(removed.every(each => each.bytes >= 1000), JSON.stringify(removed))
    assert.deepEqual(refused, [])
  })

  it('moveAside renames the home into the trash and prunes: after two moves of the same home, one copy is left', () => {
    const root = newRoot()
    const home = join(root, 'c8-coder-swim')

    fakeHome(home)
    const first = moveAside(home, { root, log: quiet })!

    fakeHome(home)
    const second = moveAside(home, { root, log: quiet })!

    assert.equal(existsSync(home), false)
    assert.notEqual(first, second)
    assert.deepEqual(readdirSync(join(root, 'trash')), [second.split('/').pop()])
    assert.equal(moveAside(join(root, 'nothing-here'), { root, log: quiet }), null)
  })

  it('refuses a path outside the trash: the e2e root itself, a sibling home, through `..`, a nested path, the trash itself', () => {
    const root = newRoot()
    const trash = join(root, 'trash')
    const outside = fakeHome(join(root, 'c8-coder'))

    fakeHome(join(trash, 'c8-coder-1700000000001'))
    mkdirSync(join(root, 'pytest-venv'))

    for (const path of [outside, join(trash, '..', 'c8-coder'), join(trash, '..', 'pytest-venv'), join(trash, 'c8-coder-1700000000001', 'home'), trash, root, join(trash, '..')]) {
      assert.throws(() => deleteTrashEntry(path, root), TrashRefusal, path)
    }

    assert.ok(existsSync(join(outside, 'home', 'state.db')))
    assert.ok(existsSync(join(root, 'pytest-venv')))
    assert.ok(existsSync(join(trash, 'c8-coder-1700000000001', 'home', 'state.db')))
  })

  it('refuses a trash entry that is itself a symlink (to a directory outside), and leaves the target', () => {
    const root = newRoot()
    const target = fakeHome(join(scratch, `precious-${rootCount}`))
    const link = join(root, 'trash', 'c8-coder-1700000000009')

    symlinkSync(target, link)
    assert.throws(() => deleteTrashEntry(link, root), TrashRefusal)
    assert.ok(existsSync(join(target, 'home', 'state.db')))
    // The prune refuses it too (it is the only copy of its name here, so it is not even a candidate;
    // with an older real copy beside it, the symlink is the newest and is kept).
    assert.deepEqual(pruneTrash(root, quiet).removed, [])
  })

  it('refuses when the trash itself is a symlink to somewhere else (an entry\'s real path is outside <root>/trash)', () => {
    const root = join(scratch, `root-linked-${(rootCount += 1)}`)
    const elsewhere = join(scratch, `elsewhere-${rootCount}`)

    mkdirSync(root, { recursive: true })
    fakeHome(join(elsewhere, 'c8-coder-1700000000001'))
    symlinkSync(elsewhere, join(root, 'trash'))
    // The trash's real path is `elsewhere`: a direct child of it is a legal entry (that is where the
    // trash really is), but a path that only reaches it through another directory is not.
    assert.throws(() => deleteTrashEntry(join(elsewhere, '..', `elsewhere-${rootCount}`, 'c8-coder-1700000000001', 'home'), root), TrashRefusal)
    assert.ok(existsSync(join(elsewhere, 'c8-coder-1700000000001', 'home', 'state.db')))
  })

  it('never follows a symlink inside a pruned home: the link goes, its target (a temp directory) survives', () => {
    const root = newRoot()
    const target = join(scratch, `checkout-${rootCount}`)

    mkdirSync(join(target, 'desktop'), { recursive: true })
    writeFileSync(join(target, 'desktop', 'plugin.js'), 'export {}\n')
    writeFileSync(join(target, 'README.md'), 'keep me\n')

    for (const name of ['c8-coder-1700000000001', 'c8-coder-1700000000002']) {
      const home = fakeHome(join(root, 'trash', name))

      // As in a real test home: this checkout symlinked into plugins/session-tree, and a file link.
      symlinkSync(target, join(home, 'home', 'plugins', 'session-tree'))
      symlinkSync(join(target, 'README.md'), join(home, 'readme-link'))
    }

    const { removed } = pruneTrash(root, quiet)

    assert.equal(removed.length, 1)
    assert.equal(existsSync(join(root, 'trash', 'c8-coder-1700000000001')), false)
    assert.equal(readFileSync(join(target, 'README.md'), 'utf8'), 'keep me\n')
    assert.ok(existsSync(join(target, 'desktop', 'plugin.js')))
    assert.ok(existsSync(join(root, 'trash', 'c8-coder-1700000000002', 'home', 'plugins', 'session-tree', 'README.md')))
  })

  it('refuses while a gateway pid from that home is alive, and deletes it once the gateway is gone', () => {
    const root = newRoot()
    const pid = sleeper()
    const entry = fakeHome(join(root, 'trash', 'c8-coder-sync-1700000000001'), { pid })

    assert.deepEqual(liveProcesses(entry), [pid])
    assert.throws(() => deleteTrashEntry(entry, root), (error: Error) => error instanceof TrashRefusal && error.message.includes(String(pid)))
    assert.ok(existsSync(join(entry, 'home', 'state.db')))
    // pruneTrash keeps a refused entry and says so.
    fakeHome(join(root, 'trash', 'c8-coder-sync-1700000000002'))
    const pruned = pruneTrash(root, quiet)

    assert.equal(pruned.removed.length, 0)
    assert.equal(pruned.refused.length, 1)
    process.kill(pid, 'SIGKILL')
    spawnSync('sleep', ['0.3'])
    assert.deepEqual(liveProcesses(entry), [])
    assert.ok(deleteTrashEntry(entry, root) > 0)
    assert.equal(existsSync(entry), false)
  })

  it('a process whose HERMES_HOME is inside the home counts as running too (no pid file needed)', () => {
    const root = newRoot()
    const entry = fakeHome(join(root, 'trash', 'c8-coder-final-1700000000001'))
    const child = spawn('sleep', ['300'], { stdio: 'ignore', env: { ...process.env, HERMES_HOME: join(entry, 'home') } })

    children.push(child)
    spawnSync('sleep', ['0.2'])
    assert.deepEqual(liveProcesses(entry), [child.pid])
    assert.throws(() => deleteTrashEntry(entry, root), TrashRefusal)
    child.kill('SIGKILL')
  })
})

describe('npm run clean:e2e (card 8, F5)', () => {
  /** An e2e root like the real one: homes of two cards and roles, the venv, logs, screenshots, a trash. */
  function populated(): string {
    const root = newRoot()

    for (const name of ['c8-coder', 'c8-coder-rich', 'c8-coder-sync', 'c8-reviewer', 'c8-reviewer-subway', 'c7-coder', 'c7-coder-final']) {
      fakeHome(join(root, name))
    }

    mkdirSync(join(root, 'pytest-venv', 'bin'), { recursive: true })
    writeFileSync(join(root, 'pytest-venv', 'bin', 'pytest'), '#!/bin/sh\n')
    // Evidence folders that look like a home name but hold no `home/`: never touched.
    mkdirSync(join(root, 'c7-coder-screenshots'))
    writeFileSync(join(root, 'c7-coder-screenshots', 'a.png'), 'png')
    writeFileSync(join(root, 'e2e-all.log'), 'log')
    fakeHome(join(root, 'trash', 'c8-coder-rich-1700000000001'))
    fakeHome(join(root, 'trash', 'c7-reviewer-1700000000001'))

    return root
  }

  const left = (root: string) => readdirSync(root).filter(name => name !== 'trash').sort()

  it('the role scope: the trash and this card\'s and role\'s stopped homes; pytest-venv and the rest stay', () => {
    const root = populated()
    const lines: string[] = []

    assert.deepEqual(plan({ root, card: 8, role: 'coder' }).homes.map(dir => dir.split('/').pop()), ['c8-coder', 'c8-coder-rich', 'c8-coder-sync'])
    assert.equal(clean({ root, card: 8, role: 'coder', log: line => lines.push(line) }), 0)
    assert.deepEqual(left(root), ['c7-coder', 'c7-coder-final', 'c7-coder-screenshots', 'c8-reviewer', 'c8-reviewer-subway', 'e2e-all.log', 'pytest-venv'])
    assert.deepEqual(readdirSync(join(root, 'trash')), [])
    // Each removed path with its size, the homes by their own path.
    assert.ok(lines.some(line => line.startsWith(`removed ${join(root, 'c8-coder-rich')} (`)), lines.join('\n'))
    assert.equal(lines.filter(line => line.startsWith('removed ')).length, 5, lines.join('\n'))
    assert.ok(lines.every(line => !line.startsWith('removed ') || /\(\d+(\.\d)? (B|KB|MB|GB)\)$/.test(line)), lines.join('\n'))
    assert.ok(existsSync(join(root, 'pytest-venv', 'bin', 'pytest')))
  })

  it('--all: every card\'s and role\'s homes and the trash; pytest-venv, logs and screenshot folders stay', () => {
    const root = populated()

    assert.equal(clean({ all: true, root, card: 8, role: 'coder', log: quiet }), 0)
    assert.deepEqual(left(root), ['c7-coder-screenshots', 'e2e-all.log', 'pytest-venv'])
    assert.deepEqual(readdirSync(join(root, 'trash')), [])
  })

  it('refuses while a test gateway runs — in a home of the scope or in the trash — and removes nothing', () => {
    for (const where of ['c8-coder-sync', join('trash', 'c8-coder-rich-1700000000001')]) {
      const root = populated()
      const pid = sleeper()

      writeFileSync(join(root, where, 'home', 'gateway.pid'), JSON.stringify({ pid }))
      const before = [left(root), readdirSync(join(root, 'trash')).sort()]
      const lines: string[] = []

      assert.equal(clean({ root, card: 8, role: 'coder', log: line => lines.push(line) }), 1)
      assert.deepEqual([left(root), readdirSync(join(root, 'trash')).sort()], before)
      assert.ok(lines.some(line => line.startsWith('refused: ') && line.includes(String(pid))), lines.join('\n'))
      assert.ok(lines.includes('nothing removed'))
      process.kill(pid, 'SIGKILL')
    }
  })

  it('a home of another role running does not stop the role scope (it is not touched)', () => {
    const root = populated()
    const pid = sleeper()

    writeFileSync(join(root, 'c8-reviewer', 'home', 'gateway.pid'), JSON.stringify({ pid }))
    assert.equal(clean({ root, card: 8, role: 'coder', log: quiet }), 0)
    assert.ok(existsSync(join(root, 'c8-reviewer', 'home', 'gateway.pid')))
    process.kill(pid, 'SIGKILL')
  })

  it('the npm entry point: the role from SESSION_TREE_ROLE, the card from the harness, --all, and a usage error for anything else', () => {
    const root = populated()
    const env = { ...process.env, SESSION_TREE_E2E_ROOT: root, SESSION_TREE_CARD: '8', SESSION_TREE_ROLE: 'reviewer' }
    const run = (args: string[]) => spawnSync(process.execPath, ['scripts/e2e/clean.ts', ...args], { cwd: REPO, env, encoding: 'utf8' })
    const bad = run(['--everything'])

    assert.equal(bad.status, 2, bad.stderr)
    const role = run([])

    assert.equal(role.status, 0, role.stderr)
    assert.match(role.stdout, /scope: card 8, role reviewer/)
    assert.deepEqual(left(root), ['c7-coder', 'c7-coder-final', 'c7-coder-screenshots', 'c8-coder', 'c8-coder-rich', 'c8-coder-sync', 'e2e-all.log', 'pytest-venv'])
    const all = run(['--all'])

    assert.equal(all.status, 0, all.stderr)
    assert.deepEqual(left(root), ['c7-coder-screenshots', 'e2e-all.log', 'pytest-venv'])
  })
})
