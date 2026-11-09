/**
 * Session rows as the plugin backend returns them (`GET /sessions`), and the
 * pure rules that decide which rows become blocks. Links and families are
 * `graph.ts`'s.
 *
 * The nesting rule is the desktop sidebar's (`apps/desktop/src/lib/
 * session-branch-tree.ts`, `forkParentId`): a `/new` or idle/daily reset
 * (`_reset_from`) never nests; otherwise `_branched_from`, else
 * `parent_session_id`. Kept free of React and the SDK so node:test can run it.
 */

export interface SessionRow {
  id: string
  profile?: string
  title?: null | string
  preview?: null | string
  source?: null | string
  started_at?: null | number
  last_active?: null | number
  ended_at?: null | number
  message_count?: null | number
  tool_call_count?: null | number
  input_tokens?: null | number
  output_tokens?: null | number
  cache_read_tokens?: null | number
  cache_write_tokens?: null | number
  reasoning_tokens?: null | number
  estimated_cost_usd?: null | number
  actual_cost_usd?: null | number
  model?: null | string
  cwd?: null | string
  git_repo_root?: null | string
  parent_session_id?: null | string
  _branched_from?: null | string
  _reset_from?: null | string
  _lineage_root_id?: null | string
  _lineage_ids?: null | string[]
  compacted_segments?: number
  is_internal_child?: boolean
  archived?: boolean
  pinned?: boolean
  unread?: boolean
  is_active?: boolean
  /** `compression` on a row the core list projected onto its live tip. */
  continuation_kind?: null | string
}

export interface SessionsResponse {
  sessions: SessionRow[]
  profiles: string[]
  truncated: boolean
  limit: number
}

/** Sources the desktop sidebar never lists as conversations (its recents
 *  exclusion, `SIDEBAR_EXCLUDED_SOURCES` in `use-session-list-actions.ts`,
 *  minus messaging platforms, which the sidebar shows in their own section). */
export const HIDDEN_SOURCES: ReadonlySet<string> = new Set(['acp', 'cron', 'kanban', 'oneshot', 'subagent', 'tool'])

const trimmed = (value: null | string | undefined): string | undefined => value?.trim() || undefined

/** Parent to nest under, or undefined for a top-level block (core `forkParentId`). */
export function forkParentId(row: SessionRow): string | undefined {
  if (trimmed(row._reset_from)) {
    return undefined
  }

  return trimmed(row._branched_from) ?? trimmed(row.parent_session_id)
}

/** R6: delegate_task children and machine sources never become blocks; neither do empty
 *  launch stubs (no messages), which the core sidebar also leaves out (`min_messages=1`). */
export function isHiddenRow(row: SessionRow): boolean {
  if (row.is_internal_child) {
    return true
  }

  if (row.message_count === 0) {
    return true
  }

  const source = (row.source ?? '').trim().toLowerCase()

  return HIDDEN_SOURCES.has(source)
}

export function visibleRows(rows: readonly SessionRow[]): SessionRow[] {
  return rows.filter(row => !isHiddenRow(row))
}

/** The number of earlier compression segments folded into a block (R6 ×N). */
export function compactedCount(row: SessionRow): number {
  if (typeof row.compacted_segments === 'number') {
    return Math.max(0, row.compacted_segments)
  }

  return Math.max(0, (row._lineage_ids?.length ?? 1) - 1)
}

export function displayTitle(row: SessionRow): string {
  return trimmed(row.title) ?? trimmed(row.preview)?.slice(0, 80) ?? 'Untitled session'
}
