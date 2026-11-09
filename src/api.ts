/**
 * The page's data sources: this plugin's own backend (`dashboard/plugin_api.py`, mounted at
 * `/api/plugins/session-tree/`) for the session rows, and the gateway's `projects.tree` RPC for
 * the projects (the PROJECTS pane's own grouping).
 */
import { host } from '@hermes/plugin-sdk'
import type { PluginContext } from '@hermes/plugin-sdk'

import { mergeProjects, parseProjectsTree } from './model/projects.ts'
import type { ProjectInfo } from './model/projects.ts'
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

export interface ProfilesResponse {
  ok: boolean
  profiles: string[]
}

/** Every profile this Hermes serves (the profile filter's options). */
export function fetchProfiles(ctx: PluginContext): Promise<ProfilesResponse> {
  return ctx.rest<ProfilesResponse>(`/health?${PROFILE_PARAM}=*`, { timeoutMs: 8000 })
}

/**
 * Projects for the given profiles from the gateway's own `projects.tree` RPC (the PROJECTS
 * pane's grouping, colours and icons), merged. A profile whose tree cannot be read adds none;
 * when no tree can be read the call fails (the page retries, then draws without projects).
 */
export async function fetchProjects(profiles: readonly string[]): Promise<ProjectInfo[]> {
  const results = await Promise.allSettled(
    profiles.map(profile => host.request<unknown>('projects.tree', { profile, preview_limit: 0 }).then(parseProjectsTree))
  )
  const trees = results.flatMap(result => (result.status === 'fulfilled' ? [result.value] : []))

  if (trees.length === 0 && results.length > 0) {
    throw (results[0] as PromiseRejectedResult).reason
  }

  return mergeProjects(trees)
}
