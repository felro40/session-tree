/**
 * The page's only data source: this plugin's own backend
 * (`dashboard/plugin_api.py`, mounted at `/api/plugins/session-tree/`).
 */
import type { PluginContext } from '@hermes/plugin-sdk'

import type { SessionsResponse } from './model/sessions.ts'

export interface HealthResponse {
  ok: boolean
  plugin: string
  version: string
}

/** Rows the page asks for; the backend caps `limit` at 2000. */
export const SESSION_LIMIT = 2000

/**
 * The backend's data selector. Not `profile`: on plugin routes that query key is the gateway's
 * profile selector, which the Webapp transport fills with the active profile on every ctx.rest call.
 */
export const PROFILE_PARAM = 'session_profile'

export function fetchHealth(ctx: PluginContext, profile: string): Promise<HealthResponse> {
  return ctx.rest<HealthResponse>(`/health?${PROFILE_PARAM}=${encodeURIComponent(profile)}`, { timeoutMs: 8000 })
}

export function fetchSessions(
  ctx: PluginContext,
  { profile, includeArchived = false }: { profile: string; includeArchived?: boolean }
): Promise<SessionsResponse> {
  const query = new URLSearchParams({
    [PROFILE_PARAM]: profile,
    include_archived: String(includeArchived),
    limit: String(SESSION_LIMIT)
  })

  return ctx.rest<SessionsResponse>(`/sessions?${query.toString()}`, { timeoutMs: 20000 })
}
