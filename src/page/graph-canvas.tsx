/**
 * The canvas shell shared by every style: React Flow with the R3 navigation (plain wheel zooms
 * toward the cursor, middle-drag pans, Space + left-drag pans, left-drag on empty canvas only
 * clears the selection), R4 snap grid, live link redraw while dragging, on-drop routing (R13),
 * double-click to open in a tab (R2), read-only blocks outside the scope (R5), the hover
 * tooltip and the block menu. What a block looks like comes from the style.
 */
import {
  Background,
  BackgroundVariant,
  ReactFlow
} from '@xyflow/react'
import type { Edge, Node, NodeChange, NodeMouseHandler, OnNodeDrag } from '@xyflow/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'

import type { GraphModel, GraphNode } from '../model/graph.ts'
import { lineageOf } from '../model/graph.ts'
import { GROUP_PREFIX, laidOutFamilies, LABEL_WIDTH, rectOf } from '../model/layout.ts'
import type { GroupLabel, LayoutSpec, Point, Rect } from '../model/layout.ts'
import { routeLinks } from '../model/route.ts'
import type { LiveStatus } from '../model/status.ts'
import { blockHandles } from '../styles/shared.tsx'
import type { BlockData, GroupLabelData, LinkData, RoutedLink, StyleDefinition } from '../styles/types.ts'
import { usePluginCtx } from './plugin-context.ts'
import { SessionMenu } from './session-menu.tsx'
import type { MenuState } from './session-menu.tsx'

export const MIN_ZOOM = 0.3
export const MAX_ZOOM = 2.5
/** React Flow renders only visible elements past this many blocks (500-session fixture). */
const VISIBLE_ONLY_ABOVE = 150
export const OUT_OF_SCOPE_TIP = 'Outside this project — switch to All projects to edit'
const STANDIN_TIP = 'Parent not loaded — deleted, hidden or outside the loaded sessions'
const TOOLTIP_DELAY_MS = 350

type FlowNode = Node<BlockData | GroupLabelData>
type FlowEdge = Edge<LinkData>

export interface GraphCanvasProps {
  style: StyleDefinition
  spec: LayoutSpec
  model: GraphModel
  positions: ReadonlyMap<string, Point>
  labels: GroupLabel[]
  selectedId: null | string
  onSelect(id: null | string): void
  onMove(moves: ReadonlyMap<string, Point>): void
  onOpen(node: GraphNode): void
  statusOf(node: GraphNode): LiveStatus | undefined
  snap: boolean
  nowMs: number
}

interface Tooltip {
  text: string
  x: number
  y: number
  nodeId: string
}

export function GraphCanvas(props: GraphCanvasProps) {
  const { style, spec, model, positions, labels, selectedId, onSelect, onMove, onOpen, statusOf, snap, nowMs } = props
  const ctx = usePluginCtx()
  const wrapper = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<ReadonlyMap<string, Point>>()
  const [menu, setMenu] = useState<MenuState>()
  const [tooltip, setTooltip] = useState<Tooltip>()
  const spaceDown = useRef(false)
  const tooltipTimer = useRef<() => void>(undefined)

  const shown = useMemo(() => new Set(laidOutFamilies(model, spec).flatMap(family => family.nodeIds)), [model, spec])
  const lineage = useMemo(() => lineageOf(model, selectedId), [model, selectedId])

  // Committed rectangles of every block on the canvas (the router's obstacles).
  const rects = useMemo(() => {
    const out = new Map<string, Rect>()

    for (const id of shown) {
      const point = positions.get(id)

      if (point) {
        out.set(id, rectOf(id, point, spec))
      }
    }

    return out
  }, [shown, positions, spec])

  // R13 on drop: every link against every other block, from the committed positions. While a
  // block is dragged its links no longer match these ends and draw live instead.
  const routes = useMemo(() => {
    const ends = model.edges
      .filter(edge => rects.has(edge.source) && rects.has(edge.target))
      .map(edge => ({ id: edge.id, source: edge.source, target: edge.target, ...style.ports(edge.kind, rects.get(edge.source)!, rects.get(edge.target)!) }))
    const routed = routeLinks(ends, rects, style.router)
    const out = new Map<string, RoutedLink>()

    for (const end of ends) {
      out.set(end.id, { from: end.from, to: end.to, route: routed.get(end.id)! })
    }

    return out
  }, [model, rects, style])

  const baseNodes = useMemo(() => {
    const { width, height } = style.nodeSize
    const handles = blockHandles(width, height, style.resetPortX)
    const nodes: FlowNode[] = []
    const projectById = new Map(model.projects.map(project => [project.id, project]))
    const noProject = model.projects.find(project => project.isNoProject)

    for (const label of labels) {
      const point = positions.get(label.id)
      const project = label.projectId ? projectById.get(label.projectId) : noProject

      if (!point) {
        continue
      }

      nodes.push({
        id: label.id,
        type: style.nodeType.group,
        position: point,
        data: {
          project,
          label: project?.label ?? 'No project',
          dimmed: model.options.scope !== 'all' && (label.projectId ?? '__no_project__') !== model.options.scope
        },
        draggable: false,
        selectable: false,
        focusable: false,
        connectable: false,
        width: LABEL_WIDTH,
        height: spec.labelHeight,
        measured: { width: LABEL_WIDTH, height: spec.labelHeight },
        className: 'session-tree__group-node',
        zIndex: -1
      })
    }

    for (const node of model.nodes) {
      const point = positions.get(node.id)

      if (!point || !shown.has(node.id)) {
        continue
      }

      nodes.push({
        id: node.id,
        type: node.kind === 'standin' ? style.nodeType.standin : style.nodeType.session,
        position: point,
        data: {
          node,
          status: statusOf(node),
          project: node.projectId ? projectById.get(node.projectId) : undefined,
          inLineage: lineage.has(node.id) && node.id !== selectedId,
          nowMs
        },
        draggable: style.draggable && !node.readOnly,
        selectable: !node.readOnly,
        connectable: false,
        selected: node.id === selectedId && !node.readOnly,
        width,
        height,
        measured: { width, height },
        handles
      })
    }

    return nodes
  }, [model, positions, labels, shown, style, spec, statusOf, lineage, selectedId, nowMs])

  const nodes = useMemo(
    () => (drag ? baseNodes.map(node => (drag.has(node.id) ? { ...node, position: drag.get(node.id)!, dragging: true } : node)) : baseNodes),
    [baseNodes, drag]
  )

  const edges = useMemo<FlowEdge[]>(
    () =>
      model.edges
        .filter(edge => shown.has(edge.source) && shown.has(edge.target))
        .map(edge => {
          const source = model.nodeById.get(edge.source)
          const target = model.nodeById.get(edge.target)

          return {
            id: edge.id,
            source: edge.source,
            target: edge.target,
            ...(edge.kind === 'reset' ? { sourceHandle: 'down', targetHandle: 'up' } : {}),
            type: style.edgeType,
            selectable: false,
            focusable: false,
            data: {
              kind: edge.kind,
              fromStandin: edge.fromStandin,
              highlighted: lineage.has(edge.source) && lineage.has(edge.target),
              dimmed: Boolean(source?.outOfScope && target?.outOfScope),
              route: routes.get(edge.id)
            }
          }
        }),
    [model, shown, style, lineage, routes]
  )

  const nodeTypes = style.nodeTypes
  const edgeTypes = style.edgeTypes

  const hideTooltip = useCallback(() => {
    tooltipTimer.current?.()
    tooltipTimer.current = undefined
    setTooltip(undefined)
  }, [])

  const onNodesChange = useCallback((changes: NodeChange<FlowNode>[]) => {
    const moves = changes.filter(
      (change): change is Extract<NodeChange<FlowNode>, { type: 'position' }> =>
        change.type === 'position' && Boolean(change.position) && change.dragging === true
    )

    if (moves.length > 0) {
      setDrag(previous => {
        const next = new Map(previous)

        for (const move of moves) {
          next.set(move.id, move.position!)
        }

        return next
      })
    }
  }, [])

  const onNodeDragStart = useCallback<OnNodeDrag<FlowNode>>(() => {
    hideTooltip()
    setMenu(undefined)
  }, [hideTooltip])

  const onNodeDragStop = useCallback<OnNodeDrag<FlowNode>>(
    (_event, _node, dragged) => {
      const moves = new Map<string, Point>()

      for (const item of dragged) {
        if (!item.id.startsWith(GROUP_PREFIX)) {
          moves.set(item.id, { x: item.position.x, y: item.position.y })
        }
      }

      setDrag(undefined)

      if (moves.size > 0) {
        onMove(moves)
      }
    },
    [onMove]
  )

  const graphNode = useCallback((flowNode: FlowNode): GraphNode | undefined => model.nodeById.get(flowNode.id), [model])

  const onNodeClick = useCallback<NodeMouseHandler<FlowNode>>(
    (_event, flowNode) => {
      const node = graphNode(flowNode)

      setMenu(undefined)

      if (node && !node.readOnly) {
        onSelect(node.id)
      }
    },
    [graphNode, onSelect]
  )

  const onNodeDoubleClick = useCallback<NodeMouseHandler<FlowNode>>(
    (_event, flowNode) => {
      const node = graphNode(flowNode)

      // R5: double-click does nothing on a read-only block.
      if (node && !node.readOnly && node.kind === 'session') {
        onOpen(node)
      }
    },
    [graphNode, onOpen]
  )

  const onNodeContextMenu = useCallback<NodeMouseHandler<FlowNode>>(
    (event, flowNode) => {
      event.preventDefault()
      const node = graphNode(flowNode)

      hideTooltip()

      if (!node || node.readOnly || !wrapper.current) {
        setMenu(undefined)

        return
      }

      const box = wrapper.current.getBoundingClientRect()

      onSelect(node.id)
      setMenu({ nodeId: node.id, x: event.clientX - box.left, y: event.clientY - box.top })
    },
    [graphNode, hideTooltip, onSelect]
  )

  const onNodeMouseEnter = useCallback<NodeMouseHandler<FlowNode>>(
    (event, flowNode) => {
      const node = graphNode(flowNode)
      const target = event.currentTarget as HTMLElement

      if (!node || !wrapper.current) {
        return
      }

      tooltipTimer.current?.()
      tooltipTimer.current = ctx.setTimeout(() => {
        if (!wrapper.current || !target.isConnected) {
          return
        }

        const box = wrapper.current.getBoundingClientRect()
        const rect = target.getBoundingClientRect()
        const text = node.kind === 'standin' ? STANDIN_TIP : node.outOfScope ? OUT_OF_SCOPE_TIP : node.title

        setTooltip({ text, nodeId: node.id, x: rect.left - box.left, y: rect.bottom - box.top + 6 })
      }, TOOLTIP_DELAY_MS)
    },
    [ctx, graphNode]
  )

  // R3 details React Flow does not cover: the middle button must not start the browser's
  // autoscroll or an X11 primary-selection paste, and a plain left-press on empty canvas
  // clears the selection instead of panning. Capture phase, so it runs before d3-zoom.
  useEffect(() => {
    const element = wrapper.current

    if (!element) {
      return
    }

    const middle = (event: Event) => {
      if ((event as MouseEvent).button === 1) {
        event.preventDefault()
      }
    }

    const offs = [
      ctx.addEventListener(element, 'mousedown', middle, true),
      ctx.addEventListener(element, 'mouseup', middle, true),
      ctx.addEventListener(element, 'auxclick', middle, true),
      ctx.addEventListener(
        element,
        'pointerdown',
        event => {
          const pointer = event as PointerEvent
          const target = pointer.target as Element | null

          if (pointer.button !== 0 || spaceDown.current || !target) {
            return
          }

          if (target.closest('.react-flow__pane') && !target.closest('.react-flow__node')) {
            onSelect(null)
            setMenu(undefined)
          }
        },
        true
      ),
      ctx.addEventListener(window, 'keydown', event => {
        if ((event as KeyboardEvent).code === 'Space') {
          spaceDown.current = true
        }
      }),
      ctx.addEventListener(window, 'keyup', event => {
        if ((event as KeyboardEvent).code === 'Space') {
          spaceDown.current = false
        }
      }),
      ctx.addEventListener(window, 'blur', () => {
        spaceDown.current = false
      })
    ]

    return () => offs.forEach(off => off())
  }, [ctx, onSelect])

  useEffect(() => () => tooltipTimer.current?.(), [])

  const closeMenu = useCallback(() => setMenu(undefined), [])

  return (
    <div
      ref={wrapper}
      className={`session-tree__canvas${snap ? ' has-grid' : ''}`}
      data-testid="session-tree-canvas"
      data-style={style.id}
      data-snap={snap ? 'on' : 'off'}
      data-grid={style.grid}
      onContextMenu={(event: ReactMouseEvent) => {
        // Inside the canvas the browser menu never opens; blocks get ours (or none: R5).
        event.preventDefault()
      }}
    >
      <ReactFlow<FlowNode, FlowEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={onNodeDragStop}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onNodeContextMenu={onNodeContextMenu}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={hideTooltip}
        onMoveStart={hideTooltip}
        onPaneContextMenu={closeMenu}
        panOnDrag={[1]}
        panActivationKeyCode="Space"
        zoomOnScroll
        panOnScroll={false}
        zoomOnDoubleClick={false}
        zoomOnPinch
        selectionOnDrag={false}
        selectionKeyCode={null}
        multiSelectionKeyCode={null}
        deleteKeyCode={null}
        nodesConnectable={false}
        nodesFocusable={false}
        edgesFocusable={false}
        elevateNodesOnSelect={false}
        snapToGrid={snap}
        snapGrid={[style.grid, style.grid]}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        onlyRenderVisibleElements={nodes.length > VISIBLE_ONLY_ABOVE}
        fitView
        fitViewOptions={{ padding: 0.08, maxZoom: 1.25 }}
        proOptions={{ hideAttribution: true }}
      >
        {snap && <Background variant={BackgroundVariant.Dots} gap={style.grid} size={1.3} />}
      </ReactFlow>
      {tooltip && (
        <div
          className="session-tree__tooltip"
          role="tooltip"
          data-testid="session-tree-tooltip"
          data-node-id={tooltip.nodeId}
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          {tooltip.text}
        </div>
      )}
      {menu && <SessionMenu menu={menu} onClose={closeMenu} />}
    </div>
  )
}
