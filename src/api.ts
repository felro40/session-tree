/**
 * The page's data sources: this plugin's own backend (`dashboard/plugin_api.py`, mounted at
 * `/api/plugins/session-tree/`) for the session rows, and the gateway's `projects.tree` RPC for
 * the projects (the PROJECTS pane's own grouping).
 */
import { host } from '@hermes/plugin-sdk'
import type { PluginContext } from '@hermes/plugin-sdk'

import type { ExportEnvelope, MutationIdentity, MutationSnapshot } from './model/actions.ts'
import type { StateAnswer, SyncTransport } from './model/layout-sync.ts'
import { mergeProjects, parseProjectsTree } from './model/projects.ts'
import { withTimeout } from './model/timeout.ts'
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

/** A `projects.tree` answer that never comes (the gateway cannot serialise a row, or the socket
 *  is not connected) must not keep the page on "Loading sessions…" forever: each attempt fails
 *  after this long, and after the retries the page shows an error with Retry. */
export const PROJECTS_TIMEOUT_MS = 8000

/**
 * Projects for the given profiles from the gateway's own `projects.tree` RPC (the PROJECTS
 * pane's grouping, colours and icons), merged. A profile whose tree cannot be read adds none;
 * when no tree can be read the call fails (the page retries, then shows the error).
 */
export async function fetchProjects(profiles: readonly string[], ctx?: Pick<PluginContext, 'setTimeout'>): Promise<ProjectInfo[]> {
  const bounded = <T,>(promise: Promise<T>): Promise<T> =>
    ctx ? withTimeout(promise, PROJECTS_TIMEOUT_MS, (fn, ms) => ctx.setTimeout(fn, ms), `projects.tree did not answer in ${PROJECTS_TIMEOUT_MS / 1000} s`) : promise
  const results = await Promise.allSettled(
    profiles.map(profile => bounded(host.request<unknown>('projects.tree', { profile, preview_limit: 0 })).then(parseProjectsTree))
  )
  const trees = results.flatMap(result => (result.status === 'fulfilled' ? [result.value] : []))

  if (trees.length === 0 && results.length > 0) {
    throw (results[0] as PromiseRejectedResult).reason
  }

  return mergeProjects(trees)
}

// --- Session actions (card 3): the backend's fenced rename / read state, and export ----------

const sessionPath = (id: string, tail: string, profile: string) =>
  `/sessions/${encodeURIComponent(id)}/${tail}?${PROFILE_PARAM}=${encodeURIComponent(profile)}`

/** The core mutation snapshot (the fence an edit sends back). */
export function fetchMutationSnapshot(ctx: PluginContext, profile: string, id: string): Promise<MutationSnapshot> {
  return ctx.rest<MutationSnapshot>(sessionPath(id, 'mutation-snapshot', profile), { timeoutMs: 15000 })
}

export function postRename(ctx: PluginContext, profile: string, id: string, title: string, identity: MutationIdentity): Promise<{ ok: boolean; title?: string }> {
  return ctx.rest(sessionPath(id, 'rename', profile), { method: 'POST', body: { title, ...identity }, timeoutMs: 20000 })
}

export function postReadState(ctx: PluginContext, profile: string, id: string, unread: boolean, identity: MutationIdentity): Promise<{ ok: boolean }> {
  return ctx.rest(sessionPath(id, 'read', profile), { method: 'POST', body: { unread, ...identity }, timeoutMs: 20000 })
}

export function postArchive(ctx: PluginContext, profile: string, id: string, archived: boolean, identity: MutationIdentity): Promise<{ ok: boolean }> {
  return ctx.rest(sessionPath(id, 'archive', profile), { method: 'POST', body: { archived, ...identity }, timeoutMs: 20000 })
}

export function postDelete(
  ctx: PluginContext,
  profile: string,
  id: string,
  identity: MutationIdentity
): Promise<{ ok: boolean; deleted_ids?: string[]; already_absent?: boolean }> {
  return ctx.rest(sessionPath(id, 'delete', profile), { method: 'POST', body: { ...identity }, timeoutMs: 30000 })
}

/**
 * The session as the core export endpoint streams it (metadata + every message), as its exact
 * bytes in a base64 envelope (`decodeExportEnvelope`): `ctx.rest` parses every answer as JSON,
 * so the core body itself would not arrive verbatim.
 */
export function fetchExport(ctx: PluginContext, profile: string, id: string): Promise<ExportEnvelope> {
  return ctx.rest<ExportEnvelope>(sessionPath(id, 'export', profile), { timeoutMs: 120000 })
}

// --- The synced layout store (card 4): `/state`, `/state/positions`, `/settings`, `/state/layout` ---

const profileQuery = (profile: string, extra: Record<string, string> = {}) =>
  new URLSearchParams({ [PROFILE_PARAM]: profile, ...extra }).toString()

/** The page's transport for `LayoutSync` (every call names the profile it is for). */
export function stateTransport(ctx: PluginContext): SyncTransport {
  return {
    getState: (profile, since) =>
      ctx.rest<StateAnswer>(`/state?${profileQuery(profile, since === undefined ? {} : { since_rev: String(since.rev), epoch: since.epoch })}`, { timeoutMs: 10000 }),
    patchPositions: (profile, body) => ctx.rest(`/state/positions?${profileQuery(profile)}`, { method: 'PATCH', body, timeoutMs: 15000 }),
    patchSettings: (profile, patch) => ctx.rest(`/settings?${profileQuery(profile)}`, { method: 'PATCH', body: patch, timeoutMs: 15000 }),
    deleteLayout: (profile, style, scope) => ctx.rest(`/state/layout?${profileQuery(profile, { style, scope })}`, { method: 'DELETE', timeoutMs: 15000 }),
    putLayout: (profile, body) => ctx.rest(`/state/layout?${profileQuery(profile)}`, { method: 'PUT', body, timeoutMs: 20000 }),
    forgetBlocks: (profile, ids) => ctx.rest(`/state/forget?${profileQuery(profile)}`, { method: 'POST', body: { ids }, timeoutMs: 15000 })
  }
}

/** The backend's push for a layout change (`broadcast_plugin_event`, card 1 pre-check 5). */
export const LAYOUT_CHANGED_EVENT = 'plugin.session-tree.layout.changed'
