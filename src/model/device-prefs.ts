/**
 * What stays on this device (R16), in `ctx.storage`: the view toggles (Show all, Show archived,
 * the profile filter), the project scope per profile filter, the optional per-device style
 * override, the side panel's open state per style and the open state of its sections, and the
 * zoom + pan per style, profile and scope. Nothing here is sent to the backend.
 */
export interface Viewport {
  x: number
  y: number
  zoom: number
}

export interface DeviceToggles {
  /** A style id, or `null`: use the synced style. */
  styleOverride: null | string
  showAll: boolean
  showArchived: boolean
  /** The profile filter; `null` follows the app's active profile. */
  profile: null | string
  /**
   * The project scope last chosen, per profile filter value (a profile name, or `*` for All
   * profiles): a project id. No entry: All projects. A project that no longer exists shows All
   * projects (the entry stays until another scope is chosen).
   */
  scopes: Record<string, string>
  /** The style's side panel (Dense: the inspector; Rich cards: the drawer) open, per style id. */
  panelOpen: Record<string, boolean>
  /** A panel's own sections open, per `<style id>:<section>` (Dense: the inspector's Singles). */
  sectionsOpen: Record<string, boolean>
  /**
   * Swimlanes lanes this device collapsed (card 5): one list of lane keys (project id, or the
   * no-project lane's fixed key), the same for every profile and scope. A project scope's own
   * collapsing of the other lanes is derived and never written here.
   */
  collapsedLanes: string[]
}

export interface PrefsStorage {
  get<T>(key: string, fallback: T): T
  set(key: string, value: unknown): void
}

export const DEVICE_KEY = 'device.v1'
export const VIEWPORT_KEY = 'viewport.v1'

const DEFAULTS: DeviceToggles = {
  styleOverride: null,
  showAll: false,
  showArchived: false,
  profile: null,
  scopes: {},
  panelOpen: {},
  sectionsOpen: {},
  collapsedLanes: []
}
/** Lane keys kept at most (a stale project id never grows the list without bound). */
export const MAX_COLLAPSED_LANES = 200
/** Remembered scopes kept at most (one per profile filter value; the oldest choice goes first). */
export const MAX_SCOPES = 100
/** The All projects scope (`graph.ts` `ALL_PROJECTS`): the default, never stored. */
const ALL_SCOPE = 'all'
const MAX_KEY = 4096

export const viewportKey = (style: string, profile: string, scope: string) => `${style}|${profile}|${scope}`

export class DevicePrefs {
  private readonly storage: PrefsStorage
  private readonly listeners = new Set<() => void>()
  private toggles: DeviceToggles
  private version = 0

  constructor(storage: PrefsStorage) {
    this.storage = storage
    this.toggles = sanitize(storage.get<unknown>(DEVICE_KEY, null))
  }

  get(): DeviceToggles {
    return this.toggles
  }

  get changeVersion(): number {
    return this.version
  }

  set(patch: Partial<DeviceToggles>): void {
    this.toggles = sanitize({ ...this.toggles, ...patch })
    this.storage.set(DEVICE_KEY, this.toggles)
    this.version += 1

    for (const listener of [...this.listeners]) {
      listener()
    }
  }

  /** The project scope last chosen for one profile filter value; `all` when none. */
  scope(profile: string): string {
    return this.toggles.scopes[profile] ?? ALL_SCOPE
  }

  setScope(profile: string, scope: string): void {
    if (this.scope(profile) === scope) {
      return
    }

    const others = Object.fromEntries(Object.entries(this.toggles.scopes).filter(([key]) => key !== profile))

    // The newest choice last, so the cap drops the one made longest ago.
    this.set({ scopes: scope === ALL_SCOPE ? others : { ...others, [profile]: scope } })
  }

  panelOpen(style: string, fallback = true): boolean {
    return this.toggles.panelOpen[style] ?? fallback
  }

  setPanelOpen(style: string, open: boolean): void {
    this.set({ panelOpen: { ...this.toggles.panelOpen, [style]: open } })
  }

  sectionOpen(style: string, section: string, fallback = true): boolean {
    return this.toggles.sectionsOpen[`${style}:${section}`] ?? fallback
  }

  setSectionOpen(style: string, section: string, open: boolean): void {
    this.set({ sectionsOpen: { ...this.toggles.sectionsOpen, [`${style}:${section}`]: open } })
  }

  laneCollapsed(key: string): boolean {
    return this.toggles.collapsedLanes.includes(key)
  }

  /** Collapses or expands one Swimlanes lane on this device. */
  toggleLane(key: string): void {
    const lanes = this.toggles.collapsedLanes

    this.set({ collapsedLanes: lanes.includes(key) ? lanes.filter(each => each !== key) : [...lanes, key] })
  }

  viewport(key: string): undefined | Viewport {
    const value = this.storage.get<unknown>(`${VIEWPORT_KEY}:${key}`, null) as Viewport | null

    return value && [value.x, value.y, value.zoom].every(Number.isFinite) && value.zoom > 0 ? { x: value.x, y: value.y, zoom: value.zoom } : undefined
  }

  /** Not a listener event: the viewport is the canvas's own state, only remembered here. */
  setViewport(key: string, viewport: Viewport): void {
    if ([viewport.x, viewport.y, viewport.zoom].every(Number.isFinite)) {
      this.storage.set(`${VIEWPORT_KEY}:${key}`, { x: viewport.x, y: viewport.y, zoom: viewport.zoom })
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)

    return () => this.listeners.delete(listener)
  }
}

function booleans(value: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = {}

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, open] of Object.entries(value as Record<string, unknown>)) {
      if (typeof open === 'boolean' && key.length <= MAX_KEY) {
        out[key] = open
      }
    }
  }

  return out
}

function scopes(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  const entries = Object.entries(value as Record<string, unknown>).filter(
    (entry): entry is [string, string] =>
      entry[0].length > 0 &&
      entry[0].length <= MAX_KEY &&
      typeof entry[1] === 'string' &&
      entry[1].length > 0 &&
      entry[1].length <= MAX_KEY &&
      entry[1] !== ALL_SCOPE
  )

  return Object.fromEntries(entries.slice(-MAX_SCOPES))
}

function sanitize(value: unknown): DeviceToggles {
  const raw = (value && typeof value === 'object' ? value : {}) as Partial<Record<keyof DeviceToggles, unknown>>

  const collapsedLanes = Array.isArray(raw.collapsedLanes)
    ? [...new Set((raw.collapsedLanes as unknown[]).filter((key): key is string => typeof key === 'string' && key.length > 0 && key.length <= MAX_KEY))].slice(
        -MAX_COLLAPSED_LANES
      )
    : DEFAULTS.collapsedLanes

  return {
    styleOverride: typeof raw.styleOverride === 'string' ? raw.styleOverride : DEFAULTS.styleOverride,
    showAll: typeof raw.showAll === 'boolean' ? raw.showAll : DEFAULTS.showAll,
    showArchived: typeof raw.showArchived === 'boolean' ? raw.showArchived : DEFAULTS.showArchived,
    profile: typeof raw.profile === 'string' ? raw.profile : DEFAULTS.profile,
    scopes: scopes(raw.scopes),
    panelOpen: booleans(raw.panelOpen),
    sectionsOpen: booleans(raw.sectionsOpen),
    collapsedLanes
  }
}
