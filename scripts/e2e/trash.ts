/**
 * Card 8 (F5): the e2e trash and the one guarded delete.
 *
 * A suite that needs a fresh test home moves the old one aside, `<e2e root>/trash/<name>-<ms>`
 * (`moveAside`), and then prunes the trash (`pruneTrash`): of each home name only the newest
 * moved-aside copy stays, the last run's evidence for debugging. `npm run clean:e2e`
 * (`scripts/e2e/clean.ts`) moves the role's stopped homes into the trash too and empties it.
 *
 * Every delete goes through `deleteTrashEntry`, which
 * - resolves the real path of `<e2e root>/trash` and deletes only a direct child of it whose real
 *   path is inside it (no `..`, no entry that is itself a symlink);
 * - never follows a symlink while deleting (a test home symlinks this checkout into
 *   `plugins/session-tree`): a link is unlinked, never descended into;
 * - refuses a home whose test gateway (or any process started under it) is still alive.
 */
import { chmodSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, realpathSync, renameSync, rmdirSync, unlinkSync } from 'node:fs'
import { basename, dirname, join, resolve, sep } from 'node:path'

import { E2E_ROOT } from './harness.ts'

/** `<root>/trash`, created if missing. */
export function trashDir(root: string = E2E_ROOT): string {
  const trash = join(root, 'trash')

  mkdirSync(trash, { recursive: true })

  return trash
}

/** A trash entry's home name: `c8-coder-rich-1794369554123` → `c8-coder-rich`. */
export function homeName(entry: string): string {
  return entry.replace(/-\d{10,}$/, '')
}

const isInside = (path: string, dir: string) => path === dir || path.startsWith(dir.endsWith(sep) ? dir : `${dir}${sep}`)

function alive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) {
    return false
  }

  try {
    process.kill(pid, 0)
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }

  // A zombie (exited, not yet reaped by its parent) runs nothing.
  try {
    return !/^\d+ \(.*\) Z/.test(readFileSync(`/proc/${pid}/stat`, 'utf8'))
  } catch {
    return true
  }
}

/** The pid a Hermes `gateway.pid` names (a JSON record `{"pid": …}` or a bare number). */
function pidOf(file: string): null | number {
  try {
    const text = readFileSync(file, 'utf8').trim()
    const pid = text.startsWith('{') ? Number((JSON.parse(text) as { pid?: unknown }).pid) : Number(text)

    return Number.isInteger(pid) ? pid : null
  } catch {
    return null
  }
}

/**
 * Live processes of the test home at `dir` (a role root, wherever it is now): the pid of any
 * `gateway.pid` under `<dir>/home` (the home and its profiles) that is alive, and every process
 * whose HERMES_HOME or working directory is inside `dir`.
 */
export function liveProcesses(dir: string): number[] {
  const roots = new Set([resolve(dir)])

  try {
    roots.add(realpathSync(dir))
  } catch {
    // Gone already.
  }

  const pids = new Set<number>()
  const pidFiles = [join(dir, 'home', 'gateway.pid')]

  try {
    for (const profile of readdirSync(join(dir, 'home', 'profiles'))) {
      pidFiles.push(join(dir, 'home', 'profiles', profile, 'gateway.pid'))
    }
  } catch {
    // No profiles.
  }

  for (const file of pidFiles) {
    const pid = pidOf(file)

    if (pid !== null && alive(pid)) {
      pids.add(pid)
    }
  }

  for (const entry of existsSync('/proc') ? readdirSync('/proc') : []) {
    if (!/^\d+$/.test(entry) || Number(entry) === process.pid) {
      continue
    }

    try {
      const env = readFileSync(`/proc/${entry}/environ`, 'latin1').split('\0')
      const home = env.find(each => each.startsWith('HERMES_HOME='))?.slice('HERMES_HOME='.length)
      const cwd = readlinkSync(`/proc/${entry}/cwd`)

      if ([...roots].some(root => (home !== undefined && isInside(resolve(home), root)) || isInside(cwd, root))) {
        pids.add(Number(entry))
      }
    } catch {
      // Gone, or not ours to read.
    }
  }

  return [...pids].sort((a, b) => a - b)
}

/** Bytes under `path` (what `du --apparent-size` counts): symlinks as links (never followed), a file
 *  with several hard links (the uv cache and `installs/` share most of theirs) once. */
export function sizeOf(path: string, seen: Set<string> = new Set()): number {
  const stat = lstatSync(path)

  if (!stat.isDirectory()) {
    if (stat.nlink > 1) {
      const key = `${stat.dev}:${stat.ino}`

      if (seen.has(key)) {
        return 0
      }

      seen.add(key)
    }

    return stat.size
  }

  let total = stat.size

  for (const name of readdirSync(path)) {
    total += sizeOf(join(path, name), seen)
  }

  return total
}

export function humanSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0

  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }

  return `${unit === 0 ? value : value.toFixed(1)} ${units[unit]}`
}

/** Deletes `path` and everything under it without following a symlink. */
function removeTree(path: string): void {
  const stat = lstatSync(path)

  if (!stat.isDirectory()) {
    // A file, or a symlink (to a file or a directory): only the link itself goes.
    unlinkSync(path)

    return
  }

  // A read-only directory (a cache may leave some) cannot have entries removed until it is writable.
  if ((stat.mode & 0o700) !== 0o700) {
    chmodSync(path, stat.mode | 0o700)
  }

  for (const name of readdirSync(path)) {
    removeTree(join(path, name))
  }

  rmdirSync(path)
}

export class TrashRefusal extends Error {}

/**
 * Deletes one direct child of `<root>/trash`, after the guards above; returns its size in bytes.
 * Throws `TrashRefusal` (and deletes nothing) when a guard says no.
 */
export function deleteTrashEntry(path: string, root: string = E2E_ROOT): number {
  const trash = realpathSync(join(root, 'trash'))
  const abs = resolve(path)
  let stat

  try {
    stat = lstatSync(abs)
  } catch {
    throw new TrashRefusal(`${path}: no such trash entry`)
  }

  if (stat.isSymbolicLink()) {
    throw new TrashRefusal(`${path}: a symlink, not a trash entry (never followed)`)
  }

  const parent = realpathSync(dirname(abs))
  const real = realpathSync(abs)
  const name = basename(abs)

  if (parent !== trash || dirname(real) !== trash || name === '' || name === '.' || name === '..' || !isInside(real, trash) || real === trash) {
    throw new TrashRefusal(`${path}: not a direct child of ${trash}`)
  }

  const running = liveProcesses(real)

  if (running.length > 0) {
    throw new TrashRefusal(`${path}: a test gateway or process of this home is still running (pid ${running.join(', ')})`)
  }

  const bytes = sizeOf(real)

  removeTree(real)

  return bytes
}

export interface Removed {
  path: string
  bytes: number
}

/**
 * Keeps the newest moved-aside copy of each home name in the trash and deletes the older ones
 * (by the `-<ms>` suffix; an entry without one counts as oldest). A refused entry stays and is
 * reported; nothing else is touched.
 */
export function pruneTrash(root: string = E2E_ROOT, log: (line: string) => void = () => undefined): { removed: Removed[]; refused: string[] } {
  const trash = join(root, 'trash')
  const removed: Removed[] = []
  const refused: string[] = []

  if (!existsSync(trash)) {
    return { removed, refused }
  }

  const groups = new Map<string, string[]>()

  for (const entry of readdirSync(trash)) {
    const list = groups.get(homeName(entry)) ?? []

    list.push(entry)
    groups.set(homeName(entry), list)
  }

  const stamp = (entry: string) => Number(/-(\d{10,})$/.exec(entry)?.[1] ?? 0)

  for (const entries of groups.values()) {
    const older = entries.sort((a, b) => stamp(b) - stamp(a) || (a < b ? 1 : -1)).slice(1)

    for (const entry of older) {
      const path = join(trash, entry)

      try {
        removed.push({ path, bytes: deleteTrashEntry(path, root) })
        log(`removed ${path} (${humanSize(removed[removed.length - 1].bytes)})`)
      } catch (error) {
        if (!(error instanceof TrashRefusal)) {
          throw error
        }

        refused.push(error.message)
        log(`kept ${error.message}`)
      }
    }
  }

  return { removed, refused }
}

/** Moves the role root `dir` aside into the trash (`<name>-<ms>`), then prunes the trash. */
export function moveAside(dir: string, { root = E2E_ROOT, name = basename(dir), log }: { root?: string; name?: string; log?: (line: string) => void } = {}): null | string {
  if (!existsSync(dir)) {
    return null
  }

  const bin = trashDir(root)
  let stamp = Date.now()

  // Two moves in one millisecond get distinct names (the later one the larger stamp, so it is the newest).
  while (existsSync(join(bin, `${name}-${stamp}`))) {
    stamp += 1
  }

  const target = join(bin, `${name}-${stamp}`)

  renameSync(dir, target)
  pruneTrash(root, log)

  return target
}
