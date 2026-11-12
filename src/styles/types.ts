/**
 * The style contract. A style decides how the shared canvas shell draws the graph model: its
 * node and edge components, its layout, whether blocks drag, where singles live, how links are
 * routed, and an optional side panel. The shell itself knows no style.
 *
 * Card 2 registers Dense + inspector; cards 5–7 add the other three; card 4 adds switching.
 */
import type { EdgeTypes, FitViewOptions, Node, NodeTypes } from '@xyflow/react'
import type { ComponentType, ReactNode } from 'react'

import type { Viewport } from '../model/device-prefs.ts'
import type { EdgeKind, GraphModel, GraphNode } from '../model/graph.ts'
import type { LayoutResult, LayoutSpec, Point, Rect } from '../model/layout.ts'
import type { ProjectInfo } from '../model/projects.ts'
import type { LinkRouter, Port, Route } from '../model/route.ts'
import type { LiveStatus } from '../model/status.ts'

/** R1's four styles, plus `e2e-alt`: a test-only style that only the e2e build registers. */
export type StyleId = 'dense' | 'e2e-alt' | 'rich' | 'subway' | 'swimlanes'

/** Where a style keeps singles (R8) while "Show all" is off. */
export type SinglesContainer = 'depot' | 'drawer' | 'inspector-list' | 'lane-chip'

export interface BlockData extends Record<string, unknown> {
  node: GraphNode
  status?: LiveStatus
  project?: ProjectInfo
  /** On the selected block's ancestor/descendant path (not the selected block itself). */
  inLineage: boolean
  nowMs: number
}

export interface GroupLabelData extends Record<string, unknown> {
  project?: ProjectInfo
  label: string
  dimmed: boolean
}

export interface LinkData extends Record<string, unknown> {
  kind: EdgeKind
  fromStandin: boolean
  highlighted: boolean
  dimmed: boolean
  /** The on-drop route, valid while both ends stay where they were routed. */
  route?: RoutedLink
}

export interface RoutedLink {
  from: Port
  to: Port
  route: Route
}

export interface StylePanelProps {
  model: GraphModel
  /** The one selected block; `null` with none or several (card 9). */
  selectedId: null | string
  /** Card 9: every selected block (the Dense inspector lists them when there are 2 or more). */
  selectedIds: readonly string[]
  onSelect(id: null | string, reveal?: boolean): void
  onOpen(node: GraphNode): void
  statusOf(node: GraphNode): LiveStatus | undefined
  nowMs: number
  /** The panel's own sections (Dense: Singles), open or closed on this device; default open. */
  sectionOpen(section: string): boolean
  onSection(section: string, open: boolean): void
}

/** What a framed style's layout is computed from (card 5): the data and this device only. */
export interface FrameInput {
  model: GraphModel
  showAll: boolean
  /** Lane keys this device collapsed. */
  collapsed: ReadonlySet<string>
  nowMs: number
  /** Minutes to add to UTC for local time at an instant (ms): each timestamp gets its own (DST). */
  offsetAt(ms: number): number
}

/** A framed style's layout: positions plus what its own layers draw. */
export interface FrameLayout extends LayoutResult {
  /** Blocks drawn on the canvas. */
  shown: ReadonlySet<string>
  /** Zoom + pan that frame the content in a canvas of this size. */
  fit(width: number, height: number, minZoom: number): Viewport
}

export interface FrameLayerProps {
  layout: FrameLayout
  model: GraphModel
  nowMs: number
  onOpen(node: GraphNode): void
  /** A lane header was clicked (collapse / expand on this device). */
  onToggleLane(key: string): void
  /** The extra node (a lane chip) that was activated, with its box relative to the canvas. */
  active: null | { id: string; box: Rect }
  onCloseActive(): void
}

/**
 * A style that computes its layout from the data alone and draws its own layers around the flow
 * (Swimlanes: lane bands and the day grid under it; the lane header column, the time axis and
 * the singles popover over it). It never reads or writes the layout store. The page recomputes
 * it only when its inputs change (`frame-cache.ts`: data, filters, collapse, the local day and
 * the offset), not on the minute tick; the layers follow the live `nowMs` themselves.
 */
export interface StyleFrame {
  compute(input: FrameInput): FrameLayout
  /** Flow nodes that are not blocks (lane chips); their types are in the style's `nodeTypes`. */
  extraNodes(layout: FrameLayout): Node[]
  Under: ComponentType<{ layout: FrameLayout; nowMs: number }>
  Over: ComponentType<FrameLayerProps>
}

/** What a style's canvas layer gets (card 6, Rich cards: the details driver and the drawer). */
export interface StyleLayerProps {
  model: GraphModel
  /** Block top-lefts (flow coordinates) and the blocks on the canvas. */
  positions: ReadonlyMap<string, Point>
  shown: ReadonlySet<string>
  /** Card 8: the routed links of the committed positions (their ends and routes; Subway labels keep off them). */
  links: readonly { id: string; source: string; target: string }[]
  routes: ReadonlyMap<string, RoutedLink>
  nodeSize: { width: number; height: number }
  /** "Show all": singles are on the canvas, not in the style's container. */
  showAll: boolean
  selectedId: null | string
  onSelect(id: null | string): void
  onOpen(node: GraphNode): void
  nowMs: number
  /** The style's side panel / drawer open on this device (R16). */
  panelOpen: boolean
  onPanel(open: boolean): void
}

export interface StyleDefinition {
  id: StyleId
  label: string
  /** React Flow node types; must include `session`, `standin` and `group` entries. */
  nodeTypes: NodeTypes
  nodeType: { session: string; standin: string; group: string }
  edgeTypes: EdgeTypes
  edgeType: string
  nodeSize: { width: number; height: number }
  layoutSpec(options: { showAll: boolean }): LayoutSpec
  /** Positions for the model, keeping `previous` (see `mergeLayout`). */
  layout(model: GraphModel, previous: ReadonlyMap<string, Point> | undefined, spec: LayoutSpec): LayoutResult
  draggable: boolean
  /** Whether block positions are saved to the synced layout store (Swimlanes: no, R12). */
  savesLayout: boolean
  singles: SinglesContainer
  router: LinkRouter
  /** Where a link of `kind` leaves its source block and enters its target block; `slot` is the
   *  link's departure slot (`linkSlots`; 0 for every style without them). */
  ports(kind: EdgeKind, source: Rect, target: Rect, slot?: number): { from: Port; to: Port }
  /** Card 7 (Subway): each link's departure slot, from the model's structure alone (a split's
   *  own port on its parent station, so tracks never share a corridor). */
  linkSlots?(model: GraphModel): ReadonlyMap<string, number>
  /** Snap grid pitch (R4). */
  grid: number
  /** x offset (from a block's left edge) where vertical "continued as" links attach. */
  resetPortX: number
  /** Optional right-hand panel (Dense: the inspector). */
  Panel?: ComponentType<StylePanelProps>
  /** Shown as the disabled Snap toggle's tooltip when the style has no dragging (Swimlanes). */
  snapUnavailable?: string
  /** A style laid out from the data alone, with its own layers (Swimlanes). */
  frame?: StyleFrame
  /**
   * Card 6: wraps the canvas, so the style's blocks can read what is not block data (Rich cards:
   * the details store and the token scale). Nothing provided here reaches the model, the layout
   * or the routing chain.
   */
  Provider?: ComponentType<{ model: GraphModel; children: ReactNode }>
  /** Card 6: drawn inside the flow, over it (Rich cards: the details fetcher and the drawer). */
  Layer?: ComponentType<StyleLayerProps>
  /** The panel / drawer's open state on a device that never chose (default: open). */
  panelDefaultOpen?: boolean
  /** Card 7: Fit's padding (Subway: room for the labels above the top row and the depot below). */
  fitPadding?: FitViewOptions['padding']
}
