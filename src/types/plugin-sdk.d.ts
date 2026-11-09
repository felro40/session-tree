/**
 * The subset of `@hermes/plugin-sdk` this plugin uses, typed by hand.
 *
 * The SDK has no published type package; the canonical surface is
 * `apps/desktop/src/sdk/index.ts` in the Hermes checkout (read-only for us).
 * At runtime the specifier is rewritten by the host loader to its live shim,
 * so nothing here is bundled: esbuild marks it external.
 */
declare module '@hermes/plugin-sdk' {
  import type { ComponentType, ReactNode } from 'react'

  export interface ReadableAtom<T> {
    get(): T
    subscribe(listener: (value: T) => void): () => void
  }

  export interface GatewayEvent {
    type: string
    session_id?: string
    payload?: unknown
  }

  export type OpenSessionIntent = 'in-place' | 'main' | 'stack' | 'tab' | 'window'

  export interface Host {
    state: {
      profile: ReadableAtom<string>
      focusedStoredSessionId: ReadableAtom<null | string>
      busyBySession: ReadableAtom<Record<string, boolean>>
      gateway: ReadableAtom<string>
    }
    navigate(path: string): void
    notify(input: { kind: 'error' | 'info' | 'success' | 'warning'; message: string; title?: string }): string
    openSession(id: string, options?: { profile?: string; intent?: OpenSessionIntent }): Promise<unknown>
    onEvent(type: string, listener: (event: GatewayEvent) => void): () => void
    request<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>
  }

  export const host: Host

  export interface PluginRestOptions {
    method?: string
    body?: unknown
    timeoutMs?: number
  }

  export interface PluginStorage {
    get<T>(key: string, fallback: T): T
    set(key: string, value: unknown): void
    remove(key: string): void
  }

  export interface Contribution {
    id: string
    area: string
    title?: string
    order?: number
    render?: () => ReactNode
    data?: unknown
  }

  export interface PluginSettingsPage {
    id: string
    title: string
    icon?: string
    order?: number
    render: () => ReactNode
  }

  export interface PluginContext {
    readonly source: string
    register(c: Contribution): () => void
    registerMany(cs: Contribution[]): () => void
    registerSettingsPage?: (page: PluginSettingsPage) => () => void
    rest<T>(path: string, opts?: PluginRestOptions): Promise<T>
    socket(path: string, onMessage: (data: unknown) => void): () => void
    onEvent(type: string, listener: (event: GatewayEvent) => void): () => void
    onDispose(fn: () => void): void
    setTimeout(fn: () => void, ms: number): () => void
    setInterval(fn: () => void, ms: number): () => void
    addEventListener(
      target: EventTarget,
      type: string,
      listener: EventListener,
      options?: AddEventListenerOptions | boolean
    ): () => void
    storage: PluginStorage
  }

  export interface HermesPlugin {
    id: string
    name?: string
    description?: string
    defaultEnabled?: boolean
    register(ctx: PluginContext): void
  }

  export const ROUTES_AREA: string
  export const SIDEBAR_NAV_AREA: string
  export const PALETTE_AREA: string

  export function useValue<T>(atom: ReadableAtom<T>): T

  export interface UseQueryResult<T> {
    data: T | undefined
    error: unknown
    isError: boolean
    isPending: boolean
    isFetching: boolean
    refetch(): Promise<unknown>
  }

  export function useQuery<T>(options: {
    queryKey: readonly unknown[]
    queryFn: () => Promise<T>
    retry?: boolean | number
    refetchOnWindowFocus?: boolean
    staleTime?: number
  }): UseQueryResult<T>

  export const EmptyState: ComponentType<{ title: string; description?: string; className?: string }>
  export const ListRow: ComponentType<{
    title: ReactNode
    description?: ReactNode
    action?: ReactNode
    below?: ReactNode
    wide?: boolean
    id?: string
    className?: string
  }>
  export const SegmentedControl: ComponentType<{
    options: readonly { id: string; label: string }[]
    value: string
    onChange: (id: string) => void
    className?: string
    disabled?: boolean
  }>
}

declare module '*.css' {
  const text: string
  export default text
}
