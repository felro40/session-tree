/**
 * Card 11: a new session from a right-click on the canvas, the pure half. No React and no SDK,
 * so node:test runs it; the page wires it to the host (`page/create-session.tsx`).
 *
 * - **Which project** (`projectAt`, D4/D5): in a project scope always that project; in All
 *   projects the area under the cursor (Dense and Subway: a group label's band, from the label
 *   down to the next one, `labelSpans`; Rich cards: the shelf segment, `shelfSegments`;
 *   Swimlanes: the lane), else the project of the nearest block, else No project.
 * - **The name** (A2, R3): prefilled with the first free "New session", "New session 2", …; the
 *   dialog checks it with Hermes' own rules (`sanitize_title`, `MAX_TITLE_LENGTH`, and the
 *   uniqueness rule `_resolve_title_conflict` in `hermes_state_titles.py`).
 * - **The spot** (A3): the block centred on the click, snapped to the grid with Snap on.
 * - **The create** (D1 as ruled after pre-check P1): `session.create` with one fresh
 *   `request_id` per attempt (the Webapp's canonical client refuses `idempotency_key`), then
 *   `session.title`, then the runtime is released (`releaseRuntime`: `session.detach` when the
 *   create answered a `subscription_id`, else `session.close`; a -32601 from one tries the other
 *   once). A refused title releases the runtime and deletes the untitled empty row it left
 *   (only that row, re-checked first). A title error on a row the re-check keeps (it is titled,
 *   or has messages) is a create, with a warning (`titleWarning`): the session is real. `title`
 *   is never sent with the create: measured, the canonical gateway then answers an existing
 *   session that holds that title instead of a new one.
 */
import { MAX_TITLE_LENGTH } from './actions.ts'
import type { GatewayRequest } from './actions.ts'
import type { LabelSpan, Point, Rect } from './layout.ts'
import { GROUP_PREFIX } from './layout.ts'
import { NO_PROJECT_ID } from './projects.ts'
import type { SessionRow } from './sessions.ts'
import { snapPoint } from './selection.ts'

export { MAX_TITLE_LENGTH }

// --- which project ------------------------------------------------------------------------------

/** A Rich cards shelf segment (`styles/rich/layout.ts` `shelfSegments`): half-open on both axes. */
export interface AreaSegment {
  key: string
  x: number
  y: number
  right: number
  bottom: number
}

/** A Swimlanes lane: its project key (`NO_PROJECT_ID` for the no-project lane) and rows. */
export interface AreaLane {
  key: string
  top: number
  height: number
}

/** The laid-out geometry the project areas come from, per style. */
export type CanvasAreas =
  | { kind: 'bands'; spans: readonly LabelSpan[] }
  | { kind: 'shelves'; segments: readonly AreaSegment[] }
  | { kind: 'lanes'; lanes: readonly AreaLane[] }

export interface ProjectAtInput {
  areas: CanvasAreas
  /** The click, in flow coordinates. */
  point: Point
  /** The blocks on the canvas (their project, `undefined`: no project). */
  blocks: readonly { projectId?: string; rect: Rect }[]
  /** `all`, or the project scope (D4: it always wins). */
  scope: string
}

/** A group key (`group:<project>`) → its project id (`NO_PROJECT_ID` for the no-project group). */
const projectOfKey = (key: string) => key.slice(GROUP_PREFIX.length) || NO_PROJECT_ID

/** The project whose area holds `point`, or `undefined` (above every label, a Rich gap). */
export function areaAt(areas: CanvasAreas, point: Point): string | undefined {
  if (areas.kind === 'bands') {
    const span = areas.spans.find(each => point.y >= each.y && point.y < each.next)

    return span ? projectOfKey(span.key) : undefined
  }

  if (areas.kind === 'shelves') {
    const segment = areas.segments.find(each => point.x >= each.x && point.x < each.right && point.y >= each.y && point.y < each.bottom)

    return segment ? projectOfKey(segment.key) : undefined
  }

  return areas.lanes.find(lane => point.y >= lane.top && point.y < lane.top + lane.height)?.key
}

const distance = (point: Point, rect: Rect) => {
  const dx = Math.max(rect.x - point.x, 0, point.x - (rect.x + rect.width))
  const dy = Math.max(rect.y - point.y, 0, point.y - (rect.y + rect.height))

  return Math.hypot(dx, dy)
}

/**
 * D4/D5: the project a new session made at `point` goes in: the scope, else the area under the
 * cursor, else the nearest block's project (the first of equals), else No project.
 */
export function projectAt({ areas, point, blocks, scope }: ProjectAtInput): string {
  if (scope !== 'all') {
    return scope
  }

  const area = areaAt(areas, point)

  if (area !== undefined) {
    return area
  }

  let best: { projectId?: string; d: number } | undefined

  for (const block of blocks) {
    const d = distance(point, block.rect)

    if (!best || d < best.d) {
      best = { projectId: block.projectId, d }
    }
  }

  return best ? (best.projectId ?? NO_PROJECT_ID) : NO_PROJECT_ID
}

// --- the spot ---------------------------------------------------------------------------------

/** A3: the new block's top-left, centred on the click; snapped to the grid (as drags) with Snap on. */
export function spotFor(click: Point, size: { width: number; height: number }, snap: boolean, grid: number): Point {
  const spot = { x: click.x - size.width / 2, y: click.y - size.height / 2 }

  return snap ? snapPoint(spot, grid) : spot
}

// --- the name -----------------------------------------------------------------------------------

export const DEFAULT_SESSION_NAME = 'New session'

// Hermes' `sanitize_title` (`hermes_state_titles.py`): lone surrogates → U+FFFD, ASCII controls
// (keeping \t \n \r for the whitespace collapse) and zero-width / bidi / object-replacement code
// points removed, whitespace collapsed, trimmed.
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g
// eslint-disable-next-line no-control-regex -- Hermes strips exactly these controls
const TITLE_CONTROL = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g
const TITLE_INVISIBLE = /[\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff\ufffc\ufff9-\ufffb]/g

/** The title Hermes stores for `title` (`''`: none). */
export function sanitizeTitle(title: string): string {
  return title.replace(LONE_SURROGATE, '\ufffd').replace(TITLE_CONTROL, '').replace(TITLE_INVISIBLE, '').replace(/\s+/g, ' ').trim()
}

/** Characters as Hermes counts them (code points). */
export const titleLength = (title: string) => [...title].length

const profileOf = (row: SessionRow) => (row.profile ?? '').trim() || 'default'

/**
 * Hermes' uniqueness rule (`_resolve_title_conflict`): another session holding exactly this
 * title keeps it, unless it is an ended, empty, visible, unarchived "ghost" (that one yields
 * its name). The page only knows the rows it loaded; anything else the server still refuses.
 */
export function titleHolder(rows: readonly SessionRow[], profile: string, title: string): SessionRow | undefined {
  return rows.find(
    row =>
      profileOf(row) === profile &&
      (row.title ?? '') === title &&
      !((row.message_count ?? 0) === 0 && row.ended_at != null && !row.archived)
  )
}

/** A2: the first of "New session", "New session 2", … that no loaded row of `profile` is called. */
export function defaultSessionName(rows: readonly SessionRow[], profile: string): string {
  const taken = new Set(rows.filter(row => profileOf(row) === profile).map(row => (row.title ?? '').trim()))

  for (let n = 1; ; n += 1) {
    const name = n === 1 ? DEFAULT_SESSION_NAME : `${DEFAULT_SESSION_NAME} ${n}`

    if (!taken.has(name)) {
      return name
    }
  }
}

export type NameProblem = { kind: 'empty' } | { kind: 'long'; length: number } | { kind: 'taken'; holder: SessionRow }

/** Why Create stays disabled for `name`, or `null` (A2, R3a). */
export function nameProblem(name: string, rows: readonly SessionRow[], profile: string): NameProblem | null {
  const title = sanitizeTitle(name)

  if (!title) {
    return { kind: 'empty' }
  }

  if (titleLength(title) > MAX_TITLE_LENGTH) {
    return { kind: 'long', length: titleLength(title) }
  }

  const holder = titleHolder(rows, profile, title)

  return holder ? { kind: 'taken', holder } : null
}

// --- the create ---------------------------------------------------------------------------------

export interface CreateParams {
  profile: string
  /** The project's root folder; absent: No project (the row lands in the gateway's home, R4). */
  cwd?: string
  /** Sanitised, non-empty, within `MAX_TITLE_LENGTH`. */
  title: string
}

export interface CreatedRuntime {
  session_id?: string
  stored_session_id?: string
  subscription_id?: string
}

/** How the plugin's hold on the runtime was released (R2). */
export type ReleaseOutcome = 'close' | 'detach' | 'failed'

const isUnknownMethod = (error: unknown) => {
  const value = error as { code?: unknown; message?: unknown } | null

  return value?.code === -32601 || /unknown method|-32601/i.test(String(value?.message ?? error ?? ''))
}

/**
 * R2: release the runtime a create bound. `session.detach` (with the create's subscription) when
 * there is one, else `session.close`; a -32601 (the method is not served by this client) tries
 * the other once. Never throws.
 */
export async function releaseRuntime(
  request: GatewayRequest,
  runtime: { sessionId: string; subscriptionId?: string; profile: string }
): Promise<ReleaseOutcome> {
  const detach = () =>
    request('session.detach', {
      session_id: runtime.sessionId,
      ...(runtime.subscriptionId ? { subscription_id: runtime.subscriptionId } : {}),
      end_reason: 'cli_close',
      profile: runtime.profile
    }).then(() => 'detach' as const)
  const close = () => request('session.close', { session_id: runtime.sessionId, profile: runtime.profile }).then(() => 'close' as const)
  const [first, second] = runtime.subscriptionId ? [detach, close] : [close, detach]

  try {
    return await first()
  } catch (error) {
    if (!isUnknownMethod(error)) {
      return 'failed'
    }
  }

  try {
    return await second()
  } catch {
    return 'failed'
  }
}

/** Where a create failed: the create itself, or the name (the dialog stays open). */
export class CreateFailure extends Error {
  readonly stage: 'create' | 'title'
  readonly error: unknown
  /** A refused title: the untitled row the create left was deleted, or the delete failed. */
  readonly cleanup?: 'deleted' | 'failed'
  readonly release?: ReleaseOutcome

  constructor(stage: 'create' | 'title', cause: unknown, message: string, extra: { cleanup?: 'deleted' | 'failed'; release?: ReleaseOutcome } = {}) {
    super(message)
    this.stage = stage
    this.error = cause
    this.cleanup = extra.cleanup
    this.release = extra.release
  }
}

const reason = (error: unknown) => {
  const value = error as { message?: unknown } | null

  return String(value?.message ?? error ?? 'unknown error')
}

/** The dialog's words for a refused title (measured: the canonical gateway answers -32603). */
export function titleRefusalText(title: string, error: unknown): string {
  const text = reason(error)
  const code = (error as { code?: unknown } | null)?.code

  if (code === 4022 || /already in use/i.test(text)) {
    return `“${title}” is already the name of another session. Pick another name.`
  }

  return `Hermes refused the name “${title}” (${text}). It may be the name of a session this page does not show; pick another name.`
}

/** The row the re-check kept: it is titled (the title may have landed after all) or has messages. */
export interface KeptRow {
  title?: null | string
  message_count?: null | number
}

export interface CreateDeps {
  request: GatewayRequest
  /** One fresh id per attempt: the create's `request_id` (its retry key). */
  mintId(): string
  /**
   * A title error left a row: delete it when it is still untitled and empty (re-checked just
   * before), through the fenced delete. `null`: deleted (or already gone); else the row it kept.
   */
  removeIfUntouched(profile: string, sessionId: string): Promise<KeptRow | null>
}

/** The title call answered an error, but the row is real (kept by the re-check). */
export interface TitleWarning {
  /** The title call's error. */
  reason: string
  /** The title the row has (`null`: none). */
  storedTitle: null | string
}

export interface CreateOutcome {
  /** The stored session id (the block's id). */
  sessionId: string
  release: ReleaseOutcome
  /** Only when the title call answered an error and the re-check kept the row. */
  titleWarning?: TitleWarning
}

/**
 * One create attempt (D1 as ruled): `session.create` → `session.title` → release. Throws a
 * `CreateFailure` for the create or a refused title (the untitled empty row deleted, or its
 * delete failed); a title error on a row the re-check keeps is a create with a `titleWarning`.
 * A release that fails is reported in the outcome (the session is real; the caller says so).
 */
export async function createSession(deps: CreateDeps, params: CreateParams): Promise<CreateOutcome> {
  let created: CreatedRuntime

  try {
    created = await deps.request<CreatedRuntime>('session.create', {
      profile: params.profile,
      ...(params.cwd ? { cwd: params.cwd, cwd_explicit: true } : {}),
      source: 'desktop',
      request_id: deps.mintId()
    })
  } catch (error) {
    throw new CreateFailure('create', error, `Could not create the session (${reason(error)})`)
  }

  const runtimeId = created?.session_id
  const sessionId = created?.stored_session_id || runtimeId

  if (!runtimeId || !sessionId) {
    throw new CreateFailure('create', created, 'The gateway returned no session id')
  }

  const runtime = { sessionId: runtimeId, subscriptionId: created.subscription_id, profile: params.profile }

  try {
    await deps.request('session.title', { session_id: runtimeId, title: params.title, profile: params.profile })
  } catch (error) {
    const release = await releaseRuntime(deps.request, runtime)
    let kept: KeptRow | null

    try {
      kept = await deps.removeIfUntouched(params.profile, sessionId)
    } catch {
      throw new CreateFailure('title', error, titleRefusalText(params.title, error), { cleanup: 'failed', release })
    }

    if (!kept) {
      throw new CreateFailure('title', error, titleRefusalText(params.title, error), { cleanup: 'deleted', release })
    }

    // Titled or used since: a real session, so it is created (on the canvas, kept), with a warning.
    return { sessionId, release, titleWarning: { reason: reason(error), storedTitle: (kept.title ?? '').trim() || null } }
  }

  return { sessionId, release: await releaseRuntime(deps.request, runtime) }
}

/**
 * A8: one submit is one session. While an attempt is in flight, another submit (a double click,
 * an Enter repeat) joins it instead of starting a second create; a finished attempt (done or
 * failed) lets the next submit start a new one, with a new `request_id`.
 */
export function createAttempts<T>() {
  let flight: Promise<T> | null = null

  return {
    run(start: () => Promise<T>): { flight: Promise<T>; joined: boolean } {
      if (flight) {
        return { flight, joined: true }
      }

      const current = start().finally(() => {
        if (flight === current) {
          flight = null
        }
      })

      flight = current

      return { flight: current, joined: false }
    },
    get busy(): boolean {
      return flight !== null
    }
  }
}
