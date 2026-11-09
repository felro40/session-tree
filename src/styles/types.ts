/**
 * The style contract. A style decides how the shared canvas shell draws the graph model: its
 * node and edge components, its layout, whether blocks drag, where singles live, how links are
 * routed, and an optional side panel. The shell itself knows no style.
 *
 * Card 2 registers Dense + inspector; cards 5–7 add the other three; card 4 adds switching.
 */
import type { EdgeTypes, NodeTypes } from '@xyflow/react'
import type { ComponentType } from 'react'

import type { EdgeKind, GraphModel, GraphNode } from '../model/graph.ts'
import type { LayoutResult, LayoutSpec, Point, Rect } from '../model/layout.ts'
import type { ProjectInfo } from '../model/projects.ts'
import type { LinkRouter, Port, Route } from '../model/route.ts'
import type { LiveStatus } from '../model/status.ts'

export type StyleId = 'dense' | 'rich' | 'subway' | 'swimlanes'

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
  selectedId: null | string
  onSelect(id: null | string, reveal?: boolean): void
  onOpen(node: GraphNode): void
  statusOf(node: GraphNode): LiveStatus | undefined
  nowMs: number
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
  singles: SinglesContainer
  router: LinkRouter
  /** Where a link of `kind` leaves its source block and enters its target block. */
  ports(kind: EdgeKind, source: Rect, target: Rect): { from: Port; to: Port }
  /** Snap grid pitch (R4). */
  grid: number
  /** x offset (from a block's left edge) where vertical "continued as" links attach. */
  resetPortX: number
  /** Optional right-hand panel (Dense: the inspector). */
  Panel?: ComponentType<StylePanelProps>
}
