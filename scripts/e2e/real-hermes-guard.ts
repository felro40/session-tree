/**
 * Proof that the user's real Hermes is untouched (Shared requirement 6): a snapshot of the
 * Hermes checkout's git status, every mtime under apps/desktop/dist-webapp/, and the sha/mtime
 * of ~/.hermes/config.yaml, ~/.hermes/plugins/ and ~/.hermes/desktop-plugins/. Read-only.
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, lstatSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const HERMES = join(homedir(), '.hermes')
const CHECKOUT = join(HERMES, 'hermes-agent')

function walk(dir: string, depth: number, skip: (name: string) => boolean = () => false): string[] {
  if (!existsSync(dir)) {
    return [`${dir}: absent`]
  }

  const lines: string[] = []

  const visit = (path: string, level: number) => {
    const st = lstatSync(path)

    lines.push(`${path} ${st.mtimeMs} ${st.size} ${st.isSymbolicLink() ? 'l' : st.isDirectory() ? 'd' : 'f'}`)

    if (st.isDirectory() && !st.isSymbolicLink() && level < depth) {
      for (const name of readdirSync(path).sort()) {
        if (!skip(name)) {
          visit(join(path, name), level + 1)
        }
      }
    }
  }

  visit(dir, 0)

  return lines
}

const sha = (text: string) => createHash('sha256').update(text).digest('hex')

export interface RealHermesSnapshot {
  gitStatus: string
  gitHead: string
  distWebapp: string
  distWebappEntries: number
  config: string
  plugins: string
  desktopPlugins: string
}

export function snapshotRealHermes(): RealHermesSnapshot {
  const git = (args: string[]) => spawnSync('git', ['-C', CHECKOUT, ...args], { encoding: 'utf8' }).stdout.trim()
  const dist = walk(join(CHECKOUT, 'apps', 'desktop', 'dist-webapp'), 32)
  const config = join(HERMES, 'config.yaml')

  return {
    gitStatus: git(['status', '--short']),
    gitHead: git(['rev-parse', 'HEAD']),
    distWebapp: sha(dist.join('\n')),
    distWebappEntries: dist.length,
    config: existsSync(config) ? `${sha(readFileSync(config, 'utf8'))} ${statSync(config).mtimeMs}` : 'absent',
    // __pycache__ is rewritten by the user's own live gateway, never by this harness.
    plugins: sha(walk(join(HERMES, 'plugins'), 2, name => name === 'node_modules' || name === '__pycache__').join('\n')),
    desktopPlugins: sha(walk(join(HERMES, 'desktop-plugins'), 3).join('\n'))
  }
}

export function diffSnapshots(before: RealHermesSnapshot, after: RealHermesSnapshot): string[] {
  return (Object.keys(before) as (keyof RealHermesSnapshot)[])
    .filter(key => before[key] !== after[key])
    .map(key => `${key}: ${before[key]} → ${after[key]}`)
}
