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
import type { Edge, Node, NodeChange, NodeMouseHandler, OnNodeDrag, Viewport } from '@xyflow/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { GraphModel, GraphNode } from '../model/graph.ts'
import { lineageOf } from '../model/graph.ts'
import { GROUP_PREFIX, LABEL_WIDTH } from '../model/layout.ts'
import type { GroupLabel, LayoutSpec, Point, Rect } from '../model/layout.ts'
import type { LiveStatus } from '../model/status.ts'
import { blockHandles } from '../styles/shared.tsx'
import type { BlockData, FrameLayout, GroupLabelData, LinkData, StyleDefinition } from '../styles/types.ts'
import { createCanvasRouting } from './canvas-routing.ts'
import { FrameUiCtx } from './frame-context.ts'
import type { FrameUi } from './frame-context.ts'
import { usePluginCtx } from './plugin-context.ts'
import { useSessionActions } from './session-actions-context.ts'
import { SessionMenu } from './session-menu.tsx'

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
  /** The blocks being dragged (card 4: nothing is saved meanwhile), `null` when the drag ends. */
  onDragging(ids: null | string[]): void
  onOpen(node: GraphNode): void
  statusOf(node: GraphNode): LiveStatus | undefined
  snap: boolean
  nowMs: number
  /** This view's zoom + pan from an earlier visit on this device; framed (fit) when absent. */
  initialViewport?: Viewport
  /** After every pan or zoom: remembered per style + profile + scope on this device. */
  onViewport(viewport: Viewport): void
  /** A framed style's layout (Swimlanes): which blocks are shown, and what its layers draw. */
  frameLayout?: FrameLayout
  /** A framed style's lane header was clicked. */
  onToggleLane?(key: string): void
}

interface Tooltip {
  text: string
  x: number
  y: number
  nodeId: string
}

/** A form control or editable element: keys typed there are text, not canvas shortcuts. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null

  return Boolean(element?.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"]'))
}

export function GraphCanvas(props: GraphCanvasProps) {
  const { style, spec, model, positions, labels, selectedId, onSelect, onMove, onDragging, onOpen, statusOf, snap, nowMs, initialViewport, onViewport, frameLayout, onToggleLane } = props
  // Read once: the canvas frames itself (or restores this view) on mount only.
  const [mountViewport] = useState(initialViewport)
  const ctx = usePluginCtx()
  const wrapper = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<ReadonlyMap<string, Point>>()
  const actions = useSessionActions()
  const [tooltip, setTooltip] = useState<Tooltip>()
  const spaceDown = useRef(false)
  // R3: while Space is held a left-drag pans from anywhere, also from a block (not a block drag).
  const [spaceHeld, setSpaceHeld] = useState(false)
  const tooltipTimer = useRef<() => void>(undefined)
  const frame = style.frame && frameLayout ? style.frame : undefined
  // A framed style's activated extra node (a Swimlanes lane chip: its singles popover).
  const [activeExtra, setActiveExtra] = useState<null | { id: string; box: Rect }>(null)
  const active = frame ? activeExtra : null

  // The shown set, the rectangles (the router's obstacles) and the routed links (R13 on drop),
  // keyed on structure, never on the model object (B1-r2, canvas-routing.ts): a refetch that
  // only changes block content re-routes nothing. A framed style's shown set is stable across
  // the minute tick (frame-cache.ts). While a block is dragged its links no longer match these
  // ends and draw live instead.
  const [routing] = useState(createCanvasRouting)
  const frameShown = frameLayout && style.frame ? frameLayout.shown : undefined
  const { shown, routes } = routing.get({ model, spec, frameShown, positions, ports: style.ports, router: style.router })
  const lineage = useMemo(() => lineageOf(model, selectedId), [model, selectedId])

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

    // A framed style's own non-block nodes (Swimlanes: the lane chips).
    if (frame && frameLayout) {
      nodes.push(...(frame.extraNodes(frameLayout) as FlowNode[]))
    }

    return nodes
  }, [model, positions, labels, shown, style, spec, statusOf, lineage, selectedId, nowMs, frame, frameLayout])

  const nodes = useMemo(() => {
    const moved = drag ? baseNodes.map(node => (drag.has(node.id) ? { ...node, position: drag.get(node.id)!, dragging: true } : node)) : baseNodes

    // A non-draggable block has no `nopan` class, so React Flow's Space pan starts on it too.
    return spaceHeld ? moved.map(node => (node.draggable ? { ...node, draggable: false } : node)) : moved
  }, [baseNodes, drag, spaceHeld])

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

  const onNodeDragStart = useCallback<OnNodeDrag<FlowNode>>(
    (_event, _node, dragged) => {
      hideTooltip()
      onDragging(dragged.map(item => item.id).filter(id => !id.startsWith(GROUP_PREFIX)))
    },
    [hideTooltip, onDragging]
  )

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

      // After the drop is recorded: the save (debounced) may go out now.
      onDragging(null)
    },
    [onMove, onDragging]
  )

  const graphNode = useCallback((flowNode: FlowNode): GraphNode | undefined => model.nodeById.get(flowNode.id), [model])

  const onNodeClick = useCallback<NodeMouseHandler<FlowNode>>(
    (_event, flowNode) => {
      const node = graphNode(flowNode)

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

  // The menu itself is the SDK ContextMenu around the canvas (SessionMenu); it decides on the
  // same event whether a block gets one (R5, R7). Here: just no tooltip over it.
  const onNodeContextMenu = useCallback<NodeMouseHandler<FlowNode>>(() => hideTooltip(), [hideTooltip])

  const onMoveEnd = useCallback((_event: unknown, viewport: Viewport) => onViewport(viewport), [onViewport])

  const closeActive = useCallback(() => setActiveExtra(null), [])

  const onMoveStart = useCallback(() => {
    hideTooltip()
    closeActive()
  }, [hideTooltip, closeActive])

  const frameUi = useMemo<FrameUi>(
    () => ({
      activeId: active?.id ?? null,
      activate(id, element) {
        const box = wrapper.current?.getBoundingClientRect()
        const rect = element.getBoundingClientRect()

        hideTooltip()
        setActiveExtra(current =>
          current?.id === id || !box ? null : { id, box: { x: rect.left - box.left, y: rect.top - box.top, width: rect.width, height: rect.height } }
        )
      }
    }),
    [active, hideTooltip]
  )

  // A framed style frames itself (its header column and axis take canvas room): on mount when
  // this view has no remembered zoom + pan.
  const onInit = useCallback(
    (instance: { setViewport(viewport: Viewport): Promise<boolean> }) => {
      const box = wrapper.current?.getBoundingClientRect()

      if (frameLayout && style.frame && !mountViewport && box && box.width > 0) {
        void instance.setViewport(frameLayout.fit(box.width, box.height, MIN_ZOOM))
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on mount
    []
  )

  const onMenuOpen = useCallback(
    (node: GraphNode) => {
      hideTooltip()
      onSelect(node.id)
    },
    [hideTooltip, onSelect]
  )

  // Focus back on the canvas, not on a button: Space must pan, not click (R3). The menu's modal
  // layer is torn down after it unmounts (a focus attempt made while it is still there is lost),
  // so try again a few times while nothing else has taken the focus.
  const restoreFocus = useCallback(() => {
    const attempt = () => {
      const active = document.activeElement

      if (!active || active === document.body) {
        wrapper.current?.focus({ preventScroll: true })
      }
    }

    wrapper.current?.focus({ preventScroll: true })

    for (const ms of [0, 50, 150, 400]) {
      ctx.setTimeout(attempt, ms)
    }
  }, [ctx])

  useEffect(() => {
    actions?.setMenuHost(wrapper.current)

    return () => actions?.setMenuHost(null)
  }, [actions])

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

    // Card-2 r2 NB5: a toolbar <select> that closed without a change (Escape, a second click,
    // the same profile again) keeps the focus and swallows Space; give the keyboard back.
    const releaseSelect = (target: EventTarget | null = document.activeElement) => {
      const element = target as HTMLElement | null

      if (element instanceof HTMLSelectElement && element.closest('[data-testid="session-tree-toolbar"]')) {
        element.blur()

        return true
      }

      return false
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

          releaseSelect()

          if (pointer.button !== 0 || spaceDown.current || !target) {
            return
          }

          if (target.closest('.react-flow__pane') && !target.closest('.react-flow__node')) {
            onSelect(null)
          }
        },
        true
      ),
      ctx.addEventListener(
        window,
        'keydown',
        event => {
          if ((event as KeyboardEvent).code !== 'Space') {
            return
          }

          // Space aimed at the toolbar's select: the pan key, not "open the list". React Flow
          // ignores a key whose target is a form control, so hand it the same key from the body.
          if (releaseSelect(event.target)) {
            event.preventDefault()
            event.stopPropagation()
            document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true }))

            return
          } else if (isTypingTarget(event.target)) {
            // Typing a space in a text field is not the pan key (React Flow's own rule).
            return
          }

          spaceDown.current = true
          setSpaceHeld(true)
        },
        true
      ),
      ctx.addEventListener(window, 'keyup', event => {
        if ((event as KeyboardEvent).code === 'Space') {
          spaceDown.current = false
          setSpaceHeld(false)
        }
      }),
      ctx.addEventListener(window, 'blur', () => {
        spaceDown.current = false
        setSpaceHeld(false)
      })
    ]

    return () => offs.forEach(off => off())
  }, [ctx, onSelect])

  useEffect(() => () => tooltipTimer.current?.(), [])

  const Under = frame?.Under
  const Over = frame?.Over

  return (
    <SessionMenu model={model} onOpenFor={onMenuOpen} onRestoreFocus={restoreFocus}>
      <div
        ref={wrapper}
        tabIndex={-1}
        className={`session-tree__canvas${snap ? ' has-grid' : ''}${frame ? ' is-framed' : ''}`}
        data-testid="session-tree-canvas"
        data-style={style.id}
        data-snap={snap ? 'on' : 'off'}
        data-grid={style.grid}
        data-draggable={style.draggable ? 'true' : 'false'}
      >
        <FrameUiCtx.Provider value={frameUi}>
          {Under && frameLayout && <Under layout={frameLayout} nowMs={nowMs} />}
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
            onMoveStart={onMoveStart}
            onInit={onInit}
            nodesDraggable={style.draggable}
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
            fitView={!mountViewport && !style.frame}
            fitViewOptions={{ padding: 0.08, maxZoom: 1.25 }}
            defaultViewport={mountViewport}
            onMoveEnd={onMoveEnd}
            proOptions={{ hideAttribution: true }}
          >
            {snap && <Background variant={BackgroundVariant.Dots} gap={style.grid} size={1.3} />}
          </ReactFlow>
          {Over && frameLayout && (
            <Over
              layout={frameLayout}
              model={model}
              nowMs={nowMs}
              onOpen={onOpen}
              onToggleLane={key => onToggleLane?.(key)}
              active={active}
              onCloseActive={closeActive}
            />
          )}
        </FrameUiCtx.Provider>
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
      </div>
    </SessionMenu>
  )
}
