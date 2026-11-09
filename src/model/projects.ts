/**
 * Projects from the gateway's `projects.tree` RPC (`tui_gateway/contracts/projects_pets.py`
 * `ProjectTreeNode`), and which project a session belongs to.
 *
 * Membership is the tree's own `sessionIds` (the PROJECTS pane's grouping). That list is built
 * from the core listing with archived rows left out, so a row the list does not name (an
 * archived session shown through "Show archived") falls back to the project whose repo or path
 * holds the row's `git_repo_root` / `cwd` (longest match), else the "no project" bucket.
 */
import type { SessionRow } from './sessions.ts'

export const NO_PROJECT_ID = '__no_project__'

export interface ProjectInfo {
  id: string
  label: string
  color: null | string
  icon: null | string
  isNoProject: boolean
  isAuto: boolean
  path: null | string
  repoPaths: string[]
  sessionIds: string[]
}

const str = (value: unknown): null | string => (typeof value === 'string' && value.trim() ? value : null)

/** Untrusted RPC payload → projects, dropping malformed entries. */
export function parseProjectsTree(payload: unknown): ProjectInfo[] {
  const list = (payload as { projects?: unknown } | null)?.projects

  if (!Array.isArray(list)) {
    return []
  }

  const out: ProjectInfo[] = []

  for (const raw of list) {
    const node = raw as Record<string, unknown> | null
    const id = str(node?.id)

    if (!node || !id) {
      continue
    }

    const repos = Array.isArray(node.repos) ? (node.repos as Record<string, unknown>[]) : []

    out.push({
      id,
      label: str(node.label) ?? id,
      color: str(node.color),
      icon: str(node.icon),
      isNoProject: node.isNoProject === true || id === NO_PROJECT_ID,
      isAuto: node.isAuto === true,
      path: str(node.path),
      repoPaths: repos.map(repo => str(repo?.path)).filter((path): path is string => Boolean(path)),
      sessionIds: Array.isArray(node.sessionIds) ? node.sessionIds.filter((sid): sid is string => typeof sid === 'string') : []
    })
  }

  return out
}

/** Several profiles' trees as one list: same id → one project, session ids united. */
export function mergeProjects(lists: readonly (readonly ProjectInfo[])[]): ProjectInfo[] {
  const byId = new Map<string, ProjectInfo>()

  for (const list of lists) {
    for (const project of list) {
      const known = byId.get(project.id)

      if (known) {
        known.sessionIds = [...new Set([...known.sessionIds, ...project.sessionIds])]
        known.repoPaths = [...new Set([...known.repoPaths, ...project.repoPaths])]
        known.color ??= project.color
        known.icon ??= project.icon
      } else {
        byId.set(project.id, { ...project, sessionIds: [...project.sessionIds], repoPaths: [...project.repoPaths] })
      }
    }
  }

  return [...byId.values()]
}

const trimSlash = (path: string) => path.replace(/[/\\]+$/, '')

function under(path: string, root: string): boolean {
  const p = trimSlash(path)
  const r = trimSlash(root)

  return p === r || p.startsWith(`${r}/`) || p.startsWith(`${r}\\`)
}

export interface ProjectIndex {
  projects: ProjectInfo[]
  byId: Map<string, ProjectInfo>
  /** The project a row belongs to, by any id it answers to, then by path. */
  projectOf(row: SessionRow): string | undefined
}

export function projectIndex(projects: readonly ProjectInfo[]): ProjectIndex {
  const bySession = new Map<string, string>()
  const roots: { root: string; id: string }[] = []
  const noProject = projects.find(project => project.isNoProject)

  for (const project of projects) {
    for (const sid of project.sessionIds) {
      if (!bySession.has(sid)) {
        bySession.set(sid, project.id)
      }
    }

    if (!project.isNoProject) {
      for (const root of [project.path, ...project.repoPaths]) {
        if (root) {
          roots.push({ root, id: project.id })
        }
      }
    }
  }

  roots.sort((a, b) => b.root.length - a.root.length || a.id.localeCompare(b.id))

  return {
    projects: [...projects],
    byId: new Map(projects.map(project => [project.id, project])),
    projectOf(row) {
      for (const id of [row.id, row._lineage_root_id, ...(row._lineage_ids ?? [])]) {
        const hit = id ? bySession.get(id) : undefined

        if (hit) {
          return hit
        }
      }

      const place = row.git_repo_root || row.cwd

      if (place) {
        const match = roots.find(entry => under(place, entry.root))

        if (match) {
          return match.id
        }
      }

      return noProject?.id
    }
  }
}
