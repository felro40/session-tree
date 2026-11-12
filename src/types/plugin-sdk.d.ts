/**
 * The subset of `@hermes/plugin-sdk` this plugin uses, typed by hand.
 *
 * The SDK has no published type package; the canonical surface is
 * `apps/desktop/src/sdk/index.ts` in the Hermes checkout (read-only for us).
 * At runtime the specifier is rewritten by the host loader to its live shim,
 * so nothing here is bundled: esbuild marks it external.
 */
declare module '@hermes/plugin-sdk' {
  import type { ChangeEvent, ComponentType, CSSProperties, KeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode, Ref } from 'react'

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

  /** `apps/desktop/src/sdk/sessions.ts`: the same stores the app's own pin and colour controls write. */
  export interface SessionsHost {
    pin(storedSessionId: string, pinned?: boolean, index?: number): void
    setColor(storedSessionId: string, color: null | string): void
  }

  export interface Host {
    state: {
      profile: ReadableAtom<string>
      focusedStoredSessionId: ReadableAtom<null | string>
      focusedSessionId: ReadableAtom<null | string>
      busy: ReadableAtom<boolean>
      busyBySession: ReadableAtom<Record<string, boolean>>
      gateway: ReadableAtom<string>
    }
    sessions: SessionsHost
    navigate(path: string): void
    notify(input: { kind: 'error' | 'info' | 'success' | 'warning'; message: string; title?: string; durationMs?: number }): string
    notifyError(error: unknown, fallback: string): string
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
    retryDelay?: number
    refetchOnWindowFocus?: boolean
    staleTime?: number
    /** TanStack Query v5: data shown while the new key loads (e.g. keep the previous result). */
    placeholderData?: (previousData: T | undefined, previousQuery: { queryKey: readonly unknown[] } | undefined) => T | undefined
  }): UseQueryResult<T>

  export const EmptyState: ComponentType<{ title: string; description?: string; className?: string }>
  /** Centered full-surface failure: title, description and an optional actions stack (children). */
  export const ErrorState: ComponentType<{ title: ReactNode; description?: ReactNode; className?: string; icon?: ReactNode; children?: ReactNode }>
  /** THE on/off settings row (a Switch labelled `label`). */
  export const ToggleRow: ComponentType<{
    checked: boolean
    label: string
    description?: ReactNode
    hint?: ReactNode
    below?: ReactNode
    disabled?: boolean
    id?: string
    wide?: boolean
    onChange: (on: boolean) => void
  }>
  export const Codicon: ComponentType<{ name: string; size?: number | string; className?: string; style?: CSSProperties }>
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

  // --- UI kit used by the session actions (apps/desktop/src/components/ui/*, Radix underneath).
  // Props are the subset this plugin passes; unknown DOM props (data-*) go through to Radix.
  type DataProps = { [key: `data-${string}`]: string | undefined }

  export const ContextMenu: ComponentType<{ children?: ReactNode; modal?: boolean; onOpenChange?: (open: boolean) => void }>
  export const ContextMenuTrigger: ComponentType<
    { children?: ReactNode; asChild?: boolean; disabled?: boolean; onContextMenu?: (event: ReactMouseEvent<HTMLElement>) => void } & DataProps
  >
  export const ContextMenuContent: ComponentType<
    {
      children?: ReactNode
      className?: string
      'aria-label'?: string
      onCloseAutoFocus?: (event: Event) => void
      onEscapeKeyDown?: (event: globalThis.KeyboardEvent) => void
    } & DataProps
  >
  export const ContextMenuItem: ComponentType<
    {
      children?: ReactNode
      className?: string
      disabled?: boolean
      title?: string
      variant?: 'default' | 'destructive'
      onSelect?: (event: Event) => void
    } & DataProps
  >
  export const ContextMenuSeparator: ComponentType<{ className?: string }>
  export const ContextMenuSub: ComponentType<{ children?: ReactNode }>
  export const ContextMenuSubTrigger: ComponentType<{ children?: ReactNode; disabled?: boolean; className?: string } & DataProps>
  export const ContextMenuSubContent: ComponentType<{ children?: ReactNode; className?: string } & DataProps>

  export const Dialog: ComponentType<{ open?: boolean; onOpenChange?: (open: boolean) => void; children?: ReactNode }>
  export const DialogContent: ComponentType<{ children?: ReactNode; className?: string } & DataProps>
  export const DialogHeader: ComponentType<{ children?: ReactNode; className?: string }>
  export const DialogTitle: ComponentType<{ children?: ReactNode; className?: string }>
  export const DialogDescription: ComponentType<{ children?: ReactNode; className?: string }>
  export const DialogFooter: ComponentType<{ children?: ReactNode; className?: string }>
  export const Button: ComponentType<
    {
      children?: ReactNode
      type?: 'button' | 'submit'
      variant?: 'default' | 'destructive' | 'ghost' | 'secondary' | 'outline'
      size?: string
      disabled?: boolean
      title?: string
      className?: string
      onClick?: (event: ReactMouseEvent<HTMLButtonElement>) => void
    } & DataProps
  >
  export const Input: ComponentType<
    {
      value?: string
      placeholder?: string
      disabled?: boolean
      autoFocus?: boolean
      className?: string
      maxLength?: number
      'aria-label'?: string
      ref?: Ref<HTMLInputElement>
      onChange?: (event: ChangeEvent<HTMLInputElement>) => void
      onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void
    } & DataProps
  >
  export const ConfirmDialog: ComponentType<{
    open: boolean
    onClose: () => void
    onConfirm: () => Promise<void> | void
    title: ReactNode
    description?: ReactNode
    children?: ReactNode
    confirmLabel?: string
    busyLabel?: string
    doneLabel?: string
    cancelLabel?: string
    destructive?: boolean
    /** Close as soon as onConfirm resolves (no busy → done beat). */
    dismissOnConfirm?: boolean
  }>
  export const ColorSwatches: ComponentType<{
    swatches: readonly string[]
    value: null | string
    onChange: (color: null | string) => void
    clearLabel: string
    clearIcon?: string
  }>
  export const PROFILE_SWATCHES: readonly string[]
  export const CopyButton: ComponentType<{
    appearance?: 'button' | 'icon' | 'inline' | 'menu-item' | 'context-menu-item' | 'tool-row'
    text: string | (() => Promise<string> | string)
    label?: string
    errorMessage?: string
    disabled?: boolean
    iconClassName?: string
    onCopied?: () => void
    onCopyError?: (error: unknown) => void
  }>
  /** THE copy-to-clipboard path (CopyButton's). */
  export function writeClipboardText(text: string): Promise<void>
  /** A v4 UUID on every origin. */
  export function randomUuid(): string
  /** IME-aware Enter (never a composition commit). */
  export function isSubmitEnter(event: KeyboardEvent<HTMLElement> | globalThis.KeyboardEvent): boolean
  /** The app's own strings (`t.sidebar.row.*`, `t.common.*`, …); read defensively. */
  export function useI18n(): { t: unknown }
  /** The app's lucide icon set. */
  export const icons: Record<string, ComponentType<{ className?: string; size?: number | string }>>
}

declare module '*.css' {
  const text: string
  export default text
}
