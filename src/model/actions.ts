/**
 * Session actions (R14), the pure half: which route an action takes, what it may act on, and
 * the small rules the app's own session menu applies (`apps/desktop/src/app/chat/sidebar/
 * session-actions-menu.tsx`, `lib/session-export.ts`, `shared/src/session-http-mutations.ts`).
 * No React and no SDK, so node:test runs it; the page wires it to the host.
 */
import type { GraphNode } from './graph.ts'
import type { ProjectInfo } from './projects.ts'
import type { SessionRow } from './sessions.ts'
import type { LiveStatus } from './status.ts'

/** R5 / R7: actions exist only on in-scope session blocks (never on dimmed ones or stand-ins). */
export function isActionable(node: GraphNode | undefined): node is GraphNode & { row: SessionRow } {
  return Boolean(node && node.kind === 'session' && node.row && !node.readOnly)
}

// --- Export ------------------------------------------------------------------------------------

/** `sanitizeFilenamePart` of `lib/session-export.ts`. */
function sanitizeFilenamePart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

/** `<title>-<id8>.json`, exactly as the app names its export (`sessionExportFilename`). */
export function exportFilename(sessionId: string, title?: null | string): string {
  const titlePart = title ? sanitizeFilenamePart(title) : ''
  const idPart = sanitizeFilenamePart(sessionId).slice(0, 8) || 'session'

  return `${titlePart || 'session'}-${idPart}.json`
}

// --- Move to project ---------------------------------------------------------------------------

/** The folder a session moves into: the project's path, else its first repo (`projectRootCwd`). */
export function projectRootCwd(project: ProjectInfo | undefined): string {
  return (project?.path || project?.repoPaths.find(Boolean) || '').trim()
}

/** `MoveToProjectItems`: every project but the current one, the home bucket and folderless ones. */
export function moveTargets(projects: readonly ProjectInfo[], currentProjectId: string | undefined): ProjectInfo[] {
  return projects.filter(project => project.id !== currentProjectId && !project.isNoProject && projectRootCwd(project))
}

// --- Delete ------------------------------------------------------------------------------------

export const DELETE_RUNNING_REASON = 'Running — wait for it to finish'

/** R14: Delete is refused while the session runs (the gateway refuses a live session too). */
export function deleteBlockedReason(status: LiveStatus | undefined): string | undefined {
  return status?.running ? DELETE_RUNNING_REASON : undefined
}

/** R14: deleting orphans branch children (`hermes_state_sessions.py` delete), so say so. */
export function branchNote(branches: number): string {
  if (branches <= 0) {
    return ''
  }

  return branches === 1 ? 'Its 1 branch stays as a separate session.' : `Its ${branches} branches stay as separate sessions.`
}

// --- Rename ------------------------------------------------------------------------------------

export interface FocusedRuntime {
  focusedStoredSessionId: null | string
  focusedSessionId: null | string
}

export type RenameRoute = { kind: 'backend' } | { kind: 'rpc'; runtimeId: string }

/**
 * `renameSessionPreferringRpc`: the `session.title` RPC when the session has a live runtime the
 * page knows (the SDK maps runtime → stored id only for the focused session) and the title is
 * not empty (the RPC refuses a clear); the backend's fenced rename otherwise.
 */
export function renameRoute(row: SessionRow, host: FocusedRuntime, title: string): RenameRoute {
  const ids = new Set([row.id, ...(row._lineage_ids ?? [])])

  if (title.trim() && host.focusedSessionId && host.focusedStoredSessionId && ids.has(host.focusedStoredSessionId)) {
    return { kind: 'rpc', runtimeId: host.focusedSessionId }
  }

  return { kind: 'backend' }
}

// --- The mutation-snapshot fence ---------------------------------------------------------------

export interface MutationSnapshot {
  session_id: string
  exists: boolean
  runtime_revision: number
  runtime_generation: null | number
}

export interface MutationIdentity {
  request_id: string
  expected_revision: number
  expected_generation?: number
}

/** Refusals that settle a write: the next attempt must read a fresh snapshot. */
const DEFINITIVE =
  /revision_conflict|stale_generation|permission_denied|profile_mismatch|invalid_params|admission_conflict|session_busy|retained_receipts|runtime_coordination_required|unknown_execution|not_found|mutation_identity_required|client_upgrade_required|Session not found/

/**
 * The core client's fence (`createSessionMutationClient`): read the snapshot once per intent
 * (`key`), keep that identity while a write is ambiguous (a retry reuses it), and drop it on an
 * acknowledgement or a definitive refusal.
 */
export function createFencedMutation(mintId: () => string) {
  const pending = new Map<string, Promise<MutationIdentity>>()

  return async function mutate<T>(key: string, read: () => Promise<MutationSnapshot>, send: (identity: MutationIdentity) => Promise<T>): Promise<T> {
    let prepared = pending.get(key)

    if (!prepared) {
      prepared = read().then(snapshot => {
        if (
          typeof snapshot?.exists !== 'boolean' ||
          !snapshot.exists ||
          !Number.isSafeInteger(snapshot.runtime_revision) ||
          snapshot.runtime_revision < 0 ||
          !Number.isSafeInteger(snapshot.runtime_generation) ||
          (snapshot.runtime_generation as number) < 0
        ) {
          throw new Error('Session mutation snapshot unavailable; refresh before trying again')
        }

        return { request_id: mintId(), expected_revision: snapshot.runtime_revision, expected_generation: snapshot.runtime_generation as number }
      })
      pending.set(key, prepared)
    }

    let identity: MutationIdentity

    try {
      identity = await prepared
    } catch (error) {
      pending.delete(key)
      throw error
    }

    try {
      const result = await send(identity)

      pending.delete(key)

      return result
    } catch (error) {
      if (DEFINITIVE.test(String(error instanceof Error ? error.message : error))) {
        pending.delete(key)
      }

      throw error
    }
  }
}

// --- Errors ------------------------------------------------------------------------------------

/**
 * The words a REST refusal carries: `ctx.rest` rejects with `"<status>: <body>"`; a FastAPI body
 * is `{"detail": …}`. A refusal reason (`session_busy`) is turned into a sentence.
 */
export function restErrorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? 'Unknown error')
  const match = /^(\d{3}): (.*)$/s.exec(message)
  let detail = match ? match[2] : message

  if (match) {
    try {
      const body = JSON.parse(match[2]) as { detail?: unknown }

      detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail ?? body)
    } catch {
      // Not JSON: the raw body.
    }
  }

  const reasons: Record<string, string> = {
    session_busy: 'The session is running; try again when it is idle',
    revision_conflict: 'The session changed elsewhere; refresh and try again',
    stale_generation: 'The session changed elsewhere; refresh and try again',
    permission_denied: 'Hermes refused: this window may not edit that session',
    not_found: 'Session not found'
  }

  return reasons[detail] ? `${reasons[detail]} (${detail})` : detail
}

// --- Optimistic overrides ----------------------------------------------------------------------

/** What an action changed before the server confirms it. `removed`: deleted (drop the row). */
export type RowOverride = Partial<Pick<SessionRow, 'archived' | 'pinned' | 'title' | 'unread'>> & { removed?: boolean }

/** Rows as the page shows them: the server's, patched by pending overrides. */
export function applyOverrides(rows: readonly SessionRow[], overrides: ReadonlyMap<string, RowOverride>): SessionRow[] {
  if (overrides.size === 0) {
    return rows as SessionRow[]
  }

  const out: SessionRow[] = []

  for (const row of rows) {
    const override = overrides.get(row.id)

    if (!override) {
      out.push(row)
    } else if (!override.removed) {
      const fields: RowOverride = { ...override }

      delete fields.removed
      out.push({ ...row, ...fields })
    }
  }

  return out
}

/** Retires the overrides the server rows now confirm (or that name a row that is gone). */
export function settleOverrides(rows: readonly SessionRow[], overrides: ReadonlyMap<string, RowOverride>): Map<string, RowOverride> {
  const byId = new Map(rows.map(row => [row.id, row]))
  const next = new Map<string, RowOverride>()

  for (const [id, override] of overrides) {
    const row = byId.get(id)

    if (override.removed) {
      if (row) {
        next.set(id, override)
      }

      continue
    }

    if (!row) {
      continue
    }

    const agrees = (Object.keys(override) as (keyof RowOverride)[]).every(key => key === 'removed' || (row[key as keyof SessionRow] ?? undefined) === (override[key] ?? undefined))

    if (!agrees) {
      next.set(id, override)
    }
  }

  return next
}
