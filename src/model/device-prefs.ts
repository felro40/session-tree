/**
 * What stays on this device (R16), in `ctx.storage`: the view toggles (Show all, Show archived,
 * the profile filter), the optional per-device style override, the side panel's open state per
 * style, and the zoom + pan per style, profile and scope. Nothing here is sent to the backend.
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
  /** The style's side panel (Dense: the inspector; Rich cards: the drawer) open, per style id. */
  panelOpen: Record<string, boolean>
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

const DEFAULTS: DeviceToggles = { styleOverride: null, showAll: false, showArchived: false, profile: null, panelOpen: {}, collapsedLanes: [] }
/** Lane keys kept at most (a stale project id never grows the list without bound). */
export const MAX_COLLAPSED_LANES = 200

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

  panelOpen(style: string): boolean {
    return this.toggles.panelOpen[style] ?? true
  }

  setPanelOpen(style: string, open: boolean): void {
    this.set({ panelOpen: { ...this.toggles.panelOpen, [style]: open } })
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

function sanitize(value: unknown): DeviceToggles {
  const raw = (value && typeof value === 'object' ? value : {}) as Partial<Record<keyof DeviceToggles, unknown>>
  const panelOpen: Record<string, boolean> = {}

  if (raw.panelOpen && typeof raw.panelOpen === 'object') {
    for (const [style, open] of Object.entries(raw.panelOpen as Record<string, unknown>)) {
      if (typeof open === 'boolean') {
        panelOpen[style] = open
      }
    }
  }

  const collapsedLanes = Array.isArray(raw.collapsedLanes)
    ? [...new Set((raw.collapsedLanes as unknown[]).filter((key): key is string => typeof key === 'string' && key.length > 0 && key.length <= 4096))].slice(
        -MAX_COLLAPSED_LANES
      )
    : DEFAULTS.collapsedLanes

  return {
    styleOverride: typeof raw.styleOverride === 'string' ? raw.styleOverride : DEFAULTS.styleOverride,
    showAll: typeof raw.showAll === 'boolean' ? raw.showAll : DEFAULTS.showAll,
    showArchived: typeof raw.showArchived === 'boolean' ? raw.showArchived : DEFAULTS.showArchived,
    profile: typeof raw.profile === 'string' ? raw.profile : DEFAULTS.profile,
    panelOpen,
    collapsedLanes
  }
}
