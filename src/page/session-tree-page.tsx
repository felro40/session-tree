/**
 * The Session Tree page (route `/session-tree`). Foundation scope: load the
 * rows from the plugin backend, filter the hidden kinds, and draw every
 * visible row as a plain block with plain links.
 */
import { EmptyState, host, useQuery, useValue } from '@hermes/plugin-sdk'
import type { PluginContext } from '@hermes/plugin-sdk'
import { useMemo } from 'react'

import { fetchHealth, fetchSessions } from '../api.ts'
import { visibleRows } from '../model/sessions.ts'
import { TreeCanvas } from './tree-canvas.tsx'

export const BACKEND_OFF_MESSAGE =
  "Session Tree's backend is off: enable the session-tree plugin for this profile and restart the gateway."

export function SessionTreePage({ ctx }: { ctx: PluginContext }) {
  const profile = useValue(host.state.profile) || 'default'

  const health = useQuery({
    queryKey: ['session-tree', 'health', profile],
    queryFn: () => fetchHealth(ctx, profile),
    retry: false,
    refetchOnWindowFocus: false
  })

  const sessions = useQuery({
    queryKey: ['session-tree', 'sessions', profile],
    queryFn: () => fetchSessions(ctx, { profile }),
    retry: false,
    refetchOnWindowFocus: false
  })

  const rows = useMemo(() => visibleRows(sessions.data?.sessions ?? []), [sessions.data])

  let body

  if (health.isError) {
    body = (
      <div className="session-tree__state" data-testid="session-tree-backend-off">
        <EmptyState title={BACKEND_OFF_MESSAGE} />
      </div>
    )
  } else if (sessions.isError) {
    body = (
      <div className="session-tree__state" data-testid="session-tree-error">
        <EmptyState title="Could not load sessions" description={errorText(sessions.error)} />
      </div>
    )
  } else if (health.isPending || sessions.isPending) {
    body = (
      <div className="session-tree__state" data-testid="session-tree-loading">
        <EmptyState title="Loading sessions…" />
      </div>
    )
  } else if (rows.length === 0) {
    body = (
      <div className="session-tree__state" data-testid="session-tree-empty">
        <EmptyState title="No sessions yet" description="Sessions you start show up here." />
      </div>
    )
  } else {
    body = <TreeCanvas rows={rows} />
  }

  return (
    <div
      className="session-tree"
      data-testid="session-tree-page"
      data-profile={profile}
      data-row-count={sessions.data ? rows.length : undefined}
    >
      {body}
    </div>
  )
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? 'Unknown error')
}
