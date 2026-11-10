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

function walk(dir: string, depth: number, skip: (name: string) => boolean = () => false, { dirMtimes = true }: { dirMtimes?: boolean } = {}): string[] {
  if (!existsSync(dir)) {
    return [`${dir}: absent`]
  }

  const lines: string[] = []

  const visit = (path: string, level: number) => {
    const st = lstatSync(path)
    const kind = st.isSymbolicLink() ? 'l' : st.isDirectory() ? 'd' : 'f'

    // A directory's mtime and size follow its entries; without them the listing still names every
    // entry, so an added, removed or relinked entry is still seen.
    lines.push(kind === 'd' && !dirMtimes ? `${path} d` : `${path} ${st.mtimeMs} ${st.size} ${kind}`)

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

/**
 * The `~/.hermes/plugins` listing the guard compares (card 6, carry-forward r4 N1): the user's own
 * live gateway rewrites runtime state there (`__pycache__`, `hermes-pwa/push_delivery_state.json`,
 * atomically, so the plugin's directory mtime moves too), never this harness. Those are left out:
 * `node_modules`, `__pycache__`, `*_state.json` files and directory mtimes. Every other entry
 * (a new link such as `plugins/session-tree`, a changed file) still changes the listing.
 */
export function pluginsListing(dir: string): string[] {
  return walk(dir, 2, name => name === 'node_modules' || name === '__pycache__' || name.endsWith('_state.json'), { dirMtimes: false })
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
    // The user's own live gateway rewrites runtime state there, never this harness (pluginsListing).
    plugins: sha(pluginsListing(join(HERMES, 'plugins')).join('\n')),
    desktopPlugins: sha(walk(join(HERMES, 'desktop-plugins'), 3).join('\n'))
  }
}

export function diffSnapshots(before: RealHermesSnapshot, after: RealHermesSnapshot): string[] {
  return (Object.keys(before) as (keyof RealHermesSnapshot)[])
    .filter(key => before[key] !== after[key])
    .map(key => `${key}: ${before[key]} → ${after[key]}`)
}
