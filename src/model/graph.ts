/**
 * The graph model: backend rows + `projects.tree` → nodes, edges and families. Pure (no React,
 * no SDK) so node:test can run it.
 *
 * - Visible rows: the hidden kinds (R6), archived unless shown (R9), the profile filter (R10),
 *   then one row per compression lineage (core `collapseCompressionLineages`); that row carries
 *   "compacted ×N" (pre-check 8).
 * - Edges: `/branch` children by `forkParentId` (solid), `_reset_from` as "continued as"
 *   (dashed). A branch parent that names no visible row becomes one faded stand-in node per
 *   missing id (R7), linked to its children.
 * - Families: connected components over the edges. A component of one node is a single (R8).
 * - Scope (R5): every session node gets its project; in a project scope the others are marked
 *   `outOfScope` (drawn dimmed and read-only). Stand-ins are always read-only.
 */
import {
  collapseCompressionLineages,
  lookupVisible,
  profileKey,
  recency,
  resolveBranchParent,
  visibleIdIndex
} from './branch-tree.ts'
import { NO_PROJECT_ID, projectIndex } from './projects.ts'
import type { ProjectInfo } from './projects.ts'
import { compactedCount, displayTitle, isHiddenRow } from './sessions.ts'
import type { SessionRow } from './sessions.ts'

export const ALL_PROJECTS = 'all'
export const ALL_PROFILES = '*'

export interface GraphOptions {
  /** A profile name, or `*` for every profile. */
  profile: string
  showArchived: boolean
  /** `all`, or a project id from `projects.tree`. */
  scope: string
}

export type NodeKind = 'session' | 'standin'
export type EdgeKind = 'branch' | 'reset'

export interface GraphNode {
  id: string
  kind: NodeKind
  /** The session row (absent on a stand-in). */
  row?: SessionRow
  title: string
  /** Project id (session nodes); undefined when no project claims it. */
  projectId?: string
  profile: string
  archived: boolean
  /** Earlier compression segments folded into this block. */
  compacted: number
  /** Created (`started_at`), for sibling order. */
  createdAt: number
  /** Last used, for family order. */
  lastActive: number
  /** Other project than the scope: drawn dimmed, read-only (R5). */
  outOfScope: boolean
  /** No drag, selection, menu or rename: out of scope, or a stand-in. */
  readOnly: boolean
  familyId: string
  single: boolean
  /** Stand-in only: the id the children name. */
  missingId?: string
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  kind: EdgeKind
  /** From a stand-in (drawn dashed). */
  fromStandin: boolean
}

export interface Family {
  id: string
  nodeIds: string[]
  /** Project of its first root session, for grouping. */
  projectId?: string
  /** At least one session member is in scope. */
  inScope: boolean
  lastActive: number
}

export interface GraphModel {
  options: GraphOptions
  nodes: GraphNode[]
  edges: GraphEdge[]
  families: Family[]
  nodeById: Map<string, GraphNode>
  /** Branch children per node, by creation time. */
  childrenOf: Map<string, string[]>
  /** Branch parent per node. */
  parentOf: Map<string, string>
  /** "continued as" successors per node. */
  continuedAs: Map<string, string[]>
  continuedFrom: Map<string, string>
  projects: ProjectInfo[]
  /** Single nodes (no relations), most recent first. */
  singles: GraphNode[]
}

export const STANDIN_PREFIX = 'missing:'

const byCreated = (model: { nodeById: Map<string, GraphNode> }) => (a: string, b: string) => {
  const na = model.nodeById.get(a)
  const nb = model.nodeById.get(b)

  return (na?.createdAt ?? 0) - (nb?.createdAt ?? 0) || a.localeCompare(b)
}

/** The rows that become blocks, before the compression collapse. */
export function filterRows(rows: readonly SessionRow[], options: Pick<GraphOptions, 'profile' | 'showArchived'>): SessionRow[] {
  return rows.filter(
    row =>
      !isHiddenRow(row) &&
      (options.showArchived || !row.archived) &&
      (options.profile === ALL_PROFILES || profileKey(row) === options.profile)
  )
}

export function buildGraph(rows: readonly SessionRow[], projects: readonly ProjectInfo[], options: GraphOptions): GraphModel {
  const input = filterRows(rows, options)
  const sessions = collapseCompressionLineages(input)
  const index = visibleIdIndex(sessions, input)
  const projectsIdx = projectIndex(projects)

  // Node ids: the session id; qualified by profile only when two profiles share an id.
  const idCount = new Map<string, number>()

  for (const row of sessions) {
    idCount.set(row.id, (idCount.get(row.id) ?? 0) + 1)
  }

  const nodeIdOf = new Map<SessionRow, string>()

  for (const row of sessions) {
    nodeIdOf.set(row, (idCount.get(row.id) ?? 0) > 1 ? `${profileKey(row)}/${row.id}` : row.id)
  }

  const nodes: GraphNode[] = []
  const nodeById = new Map<string, GraphNode>()

  for (const row of sessions) {
    const id = nodeIdOf.get(row)!
    const projectId = projectsIdx.projectOf(row)

    const node: GraphNode = {
      id,
      kind: 'session',
      row,
      title: displayTitle(row),
      projectId,
      profile: profileKey(row),
      archived: Boolean(row.archived),
      compacted: compactedCount(row),
      createdAt: row.started_at || row.last_active || 0,
      lastActive: recency(row),
      outOfScope: false,
      readOnly: false,
      familyId: id,
      single: true
    }

    nodes.push(node)
    nodeById.set(id, node)
  }

  const edges: GraphEdge[] = []
  const parentOf = new Map<string, string>()
  const continuedFrom = new Map<string, string>()

  for (const row of sessions) {
    const target = nodeIdOf.get(row)!
    const resolved = resolveBranchParent(row, index)

    if (resolved.kind === 'nested') {
      const source = nodeIdOf.get(resolved.parent)!

      edges.push({ id: `branch:${source}->${target}`, source, target, kind: 'branch', fromStandin: false })
      parentOf.set(target, source)
      continue
    }

    if (resolved.kind === 'missing') {
      const source = `${STANDIN_PREFIX}${profileKey(row)}/${resolved.parentId}`

      if (!nodeById.has(source)) {
        const standin: GraphNode = {
          id: source,
          kind: 'standin',
          title: 'Parent not loaded',
          profile: profileKey(row),
          archived: false,
          compacted: 0,
          createdAt: (row.started_at || 0) - 1,
          lastActive: 0,
          outOfScope: false,
          readOnly: true,
          familyId: source,
          single: false,
          missingId: resolved.parentId
        }

        nodes.push(standin)
        nodeById.set(source, standin)
      }

      edges.push({ id: `branch:${source}->${target}`, source, target, kind: 'branch', fromStandin: true })
      parentOf.set(target, source)
      continue
    }

    // A /new or idle reset: "continued as" from the predecessor's block.
    const resetFrom = row._reset_from?.trim()
    const predecessor = resetFrom ? lookupVisible(index, row, resetFrom) : undefined

    if (predecessor && predecessor !== row) {
      const source = nodeIdOf.get(predecessor)!

      edges.push({ id: `reset:${source}->${target}`, source, target, kind: 'reset', fromStandin: false })
      continuedFrom.set(target, source)
    }
  }

  const model: GraphModel = {
    options,
    nodes,
    edges,
    families: [],
    nodeById,
    childrenOf: new Map(),
    parentOf,
    continuedAs: new Map(),
    continuedFrom,
    projects: projectsIdx.projects,
    singles: []
  }

  for (const edge of edges) {
    const into = edge.kind === 'branch' ? model.childrenOf : model.continuedAs

    into.set(edge.source, [...(into.get(edge.source) ?? []), edge.target])
  }

  const order = byCreated(model)

  for (const list of [...model.childrenOf.values(), ...model.continuedAs.values()]) {
    list.sort(order)
  }

  // Stand-ins sit with their children's project.
  for (const node of nodes) {
    if (node.kind === 'standin') {
      node.projectId = model.childrenOf.get(node.id)?.map(id => nodeById.get(id)?.projectId).find(Boolean)
    }
  }

  assignFamilies(model)
  applyScope(model, options.scope)

  return model
}

function assignFamilies(model: GraphModel): void {
  const parent = new Map<string, string>(model.nodes.map(node => [node.id, node.id]))

  const find = (id: string): string => {
    let root = id

    while (parent.get(root) !== root) {
      root = parent.get(root)!
    }

    parent.set(id, root)

    return root
  }

  for (const edge of model.edges) {
    const a = find(edge.source)
    const b = find(edge.target)

    if (a !== b) {
      // Deterministic representative: the smaller id.
      parent.set(a < b ? b : a, a < b ? a : b)
    }
  }

  const members = new Map<string, string[]>()

  for (const node of model.nodes) {
    const root = find(node.id)

    members.set(root, [...(members.get(root) ?? []), node.id])
  }

  const order = byCreated(model)

  for (const [root, ids] of members) {
    ids.sort(order)
    const family: Family = {
      id: root,
      nodeIds: ids,
      inScope: true,
      lastActive: Math.max(0, ...ids.map(id => model.nodeById.get(id)?.lastActive ?? 0))
    }
    // The family's project: its earliest session node that is a root (no branch parent), else any.
    const sessionIds = ids.filter(id => model.nodeById.get(id)?.kind === 'session')
    const lead = sessionIds.find(id => !model.parentOf.has(id) && !model.continuedFrom.has(id)) ?? sessionIds[0]

    family.projectId = lead ? model.nodeById.get(lead)?.projectId : undefined

    for (const id of ids) {
      const node = model.nodeById.get(id)!

      node.familyId = root
      node.single = ids.length === 1
    }

    model.families.push(family)
  }

  model.families.sort((a, b) => b.lastActive - a.lastActive || a.id.localeCompare(b.id))
  model.singles = model.families
    .filter(family => family.nodeIds.length === 1)
    .map(family => model.nodeById.get(family.nodeIds[0])!)
}

/** R5: mark nodes outside `scope` (a project id) dimmed and read-only. */
export function applyScope(model: GraphModel, scope: string): void {
  const all = scope === ALL_PROJECTS

  for (const node of model.nodes) {
    if (node.kind === 'session') {
      node.outOfScope = !all && (node.projectId ?? NO_PROJECT_ID) !== scope
      node.readOnly = node.outOfScope
    }
  }

  for (const node of model.nodes) {
    if (node.kind === 'standin') {
      const children = model.childrenOf.get(node.id) ?? []

      node.outOfScope = !all && children.every(id => model.nodeById.get(id)?.outOfScope)
      node.readOnly = true
    }
  }

  for (const family of model.families) {
    family.inScope = family.nodeIds.some(id => {
      const node = model.nodeById.get(id)

      return node?.kind === 'session' && !node.outOfScope
    })
  }
}

/** The selected node's ancestors and descendants (branch and "continued as" links), itself included. */
export function lineageOf(model: GraphModel, id: null | string | undefined): Set<string> {
  const set = new Set<string>()

  if (!id || !model.nodeById.has(id)) {
    return set
  }

  let up: string | undefined = id

  while (up && !set.has(up)) {
    set.add(up)
    up = model.parentOf.get(up) ?? model.continuedFrom.get(up)
  }

  const stack = [id]
  const down = new Set<string>([id])

  while (stack.length > 0) {
    const next = stack.pop()!

    for (const child of [...(model.childrenOf.get(next) ?? []), ...(model.continuedAs.get(next) ?? [])]) {
      if (!down.has(child)) {
        down.add(child)
        set.add(child)
        stack.push(child)
      }
    }
  }

  return set
}

/** Singles in scope (R8 container lists), most recent first. */
export function singlesInScope(model: GraphModel): GraphNode[] {
  return model.singles.filter(node => !node.outOfScope)
}
