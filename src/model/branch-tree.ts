/**
 * Port of the desktop sidebar's branch nesting rules (`apps/desktop/src/lib/session-branch-tree.ts`
 * in the Hermes checkout). A disk plugin cannot import app modules, so the rules are copied here
 * and its test cases are mirrored in `tests/js/branch-tree.test.ts`.
 *
 * - `forkParentId` (in `sessions.ts`): a `/new` or idle/daily reset (`_reset_from`) never nests;
 *   otherwise `_branched_from`, else `parent_session_id`.
 * - `collapseCompressionLineages`: one row per profile + `_lineage_root_id`.
 * - `resolveBranchParents`: which visible row a row nests under (the core walk of
 *   `flattenSessionsWithBranches`), extended so any compression segment id in `_lineage_ids`
 *   also names the visible row (card 1, pre-check 8: a branch may start from a middle segment).
 * - `flattenSessionsWithBranches`: the sidebar's flat list, kept so the mirrored tests exercise
 *   the same nesting the graph uses.
 */
import { forkParentId } from './sessions.ts'
import type { SessionRow } from './sessions.ts'

export interface SidebarSessionEntry {
  branchStem?: string
  session: SessionRow
}

export interface FlattenSessionsOptions {
  /** Keep the input root order instead of re-sorting by group recency. */
  preserveOrder?: boolean
}

export const recency = (session: SessionRow): number => session.last_active || session.started_at || 0

export const profileKey = (session: SessionRow): string => (session.profile ?? '').trim() || 'default'

/** Profile-qualified compression lineage (core `lineageKey`). */
export const lineageKey = (session: SessionRow): string =>
  `${profileKey(session)}::${session._lineage_root_id?.trim() || session.id}`

/**
 * One row per compression lineage: the row nothing in its lineage continues from, then the
 * freshest (first in input on a tie). Core `collapseCompressionLineages`.
 */
export function collapseCompressionLineages(sessions: readonly SessionRow[]): readonly SessionRow[] {
  const groups = new Map<string, SessionRow[]>()

  for (const session of sessions) {
    const key = lineageKey(session)
    const group = groups.get(key)

    if (group) {
      group.push(session)
    } else {
      groups.set(key, [session])
    }
  }

  if (groups.size === sessions.length) {
    return sessions
  }

  const winners = new Set<SessionRow>()

  for (const group of groups.values()) {
    const continuedIds = new Set(group.map(session => session.parent_session_id?.trim()))

    const score = (session: SessionRow) =>
      continuedIds.has(session.id) ? -Infinity : Math.max(session.last_active || 0, session.started_at || 0)

    winners.add(group.reduce((best, session) => (score(session) > score(best) ? session : best)))
  }

  return sessions.filter(session => winners.has(session))
}

/** `profile::id` → the visible row that id names (own id, lineage root, segments, collapsed rows). */
export function visibleIdIndex(sessions: readonly SessionRow[], input: readonly SessionRow[]): Map<string, SessionRow> {
  const byVisibleId = new Map<string, SessionRow>()
  const key = (session: SessionRow, id: string) => `${profileKey(session)}::${id}`

  // Segment ids first, so a row's own id and its lineage root (core rules) win over them.
  for (const session of sessions) {
    for (const segment of session._lineage_ids ?? []) {
      const id = segment?.trim()

      if (id && !byVisibleId.has(key(session, id))) {
        byVisibleId.set(key(session, id), session)
      }
    }
  }

  for (const session of sessions) {
    const rootId = session._lineage_root_id?.trim()

    if (rootId) {
      byVisibleId.set(key(session, rootId), session)
    }
  }

  for (const session of sessions) {
    byVisibleId.set(key(session, session.id), session)
  }

  // A collapsed stale tip still names its conversation: its children nest under the survivor.
  const survivorByLineage = new Map(sessions.map(session => [lineageKey(session), session]))

  for (const session of input) {
    const survivor = survivorByLineage.get(lineageKey(session))

    if (survivor && !byVisibleId.has(key(session, session.id))) {
      byVisibleId.set(key(session, session.id), survivor)
    }
  }

  return byVisibleId
}

export function lookupVisible(index: Map<string, SessionRow>, session: SessionRow, id: string): SessionRow | undefined {
  return index.get(`${profileKey(session)}::${id.trim()}`)
}

export type BranchParent =
  | { kind: 'nested'; parent: SessionRow }
  /** The parent id names no visible row: deleted, hidden or outside the loaded data. */
  | { kind: 'missing'; parentId: string }
  /** No parent, or the "parent" is compression ancestry of the row itself. */
  | { kind: 'none' }

/**
 * Whether a row's `forkParentId` that names no visible row is only its own compression
 * ancestry: the id is in its lineage, or the row is a compression continuation (it carries a
 * foreign lineage root) whose parent link is the bare `parent_session_id` of the previous
 * segment rather than a `/branch` marker.
 */
function isOwnCompressionAncestry(session: SessionRow, parentId: string): boolean {
  const rootId = session._lineage_root_id?.trim()

  if (parentId === rootId || (session._lineage_ids ?? []).some(id => id?.trim() === parentId)) {
    return true
  }

  return Boolean(rootId && rootId !== session.id && !session._branched_from?.trim())
}

export function resolveBranchParent(session: SessionRow, index: Map<string, SessionRow>): BranchParent {
  const parentId = forkParentId(session)

  if (!parentId) {
    return { kind: 'none' }
  }

  const parent = lookupVisible(index, session, parentId)

  if (parent) {
    // Compression ancestry is not a branch: never nest a row under its own lineage.
    return parent === session || lineageKey(parent) === lineageKey(session) ? { kind: 'none' } : { kind: 'nested', parent }
  }

  return isOwnCompressionAncestry(session, parentId) ? { kind: 'none' } : { kind: 'missing', parentId }
}

/** Flat list with branch/fork sessions nested visually under their parent (core sidebar). */
export function flattenSessionsWithBranches(
  input: readonly SessionRow[],
  options: FlattenSessionsOptions = {}
): SidebarSessionEntry[] {
  const sessions = collapseCompressionLineages(input)

  if (sessions.length < 2) {
    return sessions.map(session => ({ session }))
  }

  const index = visibleIdIndex(sessions, input)
  const childrenByParent = new Map<string, SessionRow[]>()
  const nestedIds = new Set<string>()

  for (const session of sessions) {
    const resolved = resolveBranchParent(session, index)

    if (resolved.kind !== 'nested') {
      continue
    }

    nestedIds.add(session.id)
    const siblings = childrenByParent.get(resolved.parent.id) ?? []
    siblings.push(session)
    childrenByParent.set(resolved.parent.id, siblings)
  }

  for (const siblings of childrenByParent.values()) {
    siblings.sort((left, right) => recency(right) - recency(left))
  }

  const groupRecencyMemo = new Map<string, number>()

  const groupRecency = (session: SessionRow): number => {
    const cached = groupRecencyMemo.get(session.id)

    if (cached !== undefined) {
      return cached
    }

    groupRecencyMemo.set(session.id, recency(session)) // cycle guard

    const max = (childrenByParent.get(session.id) ?? []).reduce(
      (acc, child) => Math.max(acc, groupRecency(child)),
      recency(session)
    )

    groupRecencyMemo.set(session.id, max)

    return max
  }

  const out: SidebarSessionEntry[] = []
  const seen = new Set<string>()

  const emit = (session: SessionRow, branchStem?: string) => {
    if (seen.has(session.id)) {
      return
    }

    seen.add(session.id)
    out.push(branchStem ? { branchStem, session } : { session })

    const children = childrenByParent.get(session.id)
    children?.forEach((child, index) => emit(child, index === children.length - 1 ? '└─ ' : '├─ '))
  }

  const roots = sessions.filter(session => !nestedIds.has(session.id)).map((session, index) => ({ index, session }))

  if (!options.preserveOrder) {
    roots.sort((a, b) => groupRecency(b.session) - groupRecency(a.session) || a.index - b.index)
  }

  roots.forEach(({ session }) => emit(session))

  for (const session of sessions) {
    if (!seen.has(session.id)) {
      out.push({ session })
    }
  }

  return out
}
