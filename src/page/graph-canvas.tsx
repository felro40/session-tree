/**
 * The canvas shell shared by every style: React Flow with the R3 navigation (plain wheel zooms
 * toward the cursor, middle-drag pans, Space or Alt + left-drag pans: Alt for a laptop touchpad,
 * which has no middle button), card 9's selection (a left-drag on empty canvas draws a selection
 * box in the draggable styles, Shift+click, Esc, Ctrl/⌘+A, and dragging a selected block moves
 * every selected block), R4 snap grid, live link redraw while dragging, on-drop routing (R13),
 * double-click to open in a tab (R2), read-only blocks outside the scope (R5), the hover tooltip
 * and the block menu. What a block looks like comes from the style.
 */
import {
  Background,
  BackgroundVariant,
  ReactFlow,
  SelectionMode,
  useReactFlow,
  useStoreApi
} from '@xyflow/react'
import type { Edge, Node, NodeChange, NodeMouseHandler, OnNodeDrag, Viewport } from '@xyflow/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react'

import type { GraphModel, GraphNode } from '../model/graph.ts'
import { lineageOf } from '../model/graph.ts'
import { GROUP_PREFIX, LABEL_WIDTH } from '../model/layout.ts'
import type { GroupLabel, LayoutSpec, Point, Rect } from '../model/layout.ts'
import { boxOf, canvasSelectable, fullyInside, groupPositions, singleSelected } from '../model/selection.ts'
import type { Selection, SelectionAction } from '../model/selection.ts'
import type { LiveStatus } from '../model/status.ts'
import { registeredStyles } from '../styles/registry.ts'
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
/** Held, they turn a left-drag into a pan (React Flow's pan activation keys; `event.key` "Alt"). */
const PAN_KEYS = ['Space', 'Alt']

type FlowNode = Node<BlockData | GroupLabelData>
type FlowEdge = Edge<LinkData>

export interface GraphCanvasProps {
  style: StyleDefinition
  spec: LayoutSpec
  model: GraphModel
  positions: ReadonlyMap<string, Point>
  labels: GroupLabel[]
  /** Card 9: the selected blocks (a set with one primary block). */
  selection: Selection
  /** Card 9: a selection change from the canvas (click, Shift+click, box, Esc, Ctrl/⌘+A, menu, drag). */
  onSelection(action: SelectionAction): void
  /** One block (a style layer's drawer or depot row; `null` clears). */
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
  /** The style's panel / drawer open on this device, and its toggle (card 6: the Rich drawer). */
  panelOpen?: boolean
  onPanel?(open: boolean): void
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

const NOT_TEXT_INPUTS = new Set(['button', 'checkbox', 'color', 'file', 'image', 'radio', 'range', 'reset', 'submit'])

/**
 * Card 9: a field that takes text (Rename, search): Ctrl/⌘+A selects its text there, and Esc is
 * its own. A toolbar `<select>` or a button that kept the focus is not one.
 */
export function isTextField(target: EventTarget | null): boolean {
  const element = (target as HTMLElement | null)?.closest?.('input, textarea, [contenteditable=""], [contenteditable="true"]')

  return Boolean(element && !(element instanceof HTMLInputElement && NOT_TEXT_INPUTS.has(element.type)))
}

/**
 * Every registered style's Provider, always, in registry order: the tree above the flow keeps its
 * shape across a style switch, so switching never remounts React Flow (its viewport, measured
 * nodes). A Provider only supplies context to its own style's blocks; it is cheap for the others.
 */
function StyleProviders({ model, children }: { model: GraphModel; children: ReactNode }) {
  return registeredStyles().reduceRight<ReactNode>((inner, each) => {
    const Provider = each.Provider

    return Provider ? (
      <Provider key={each.id} model={model}>
        {inner}
      </Provider>
    ) : (
      inner
    )
  }, children)
}

export function GraphCanvas(props: GraphCanvasProps) {
  const { style, spec, model, positions, labels, selection, onSelection, onSelect, onMove, onDragging, onOpen, statusOf, snap, nowMs, initialViewport, onViewport, frameLayout, onToggleLane, panelOpen = false, onPanel } = props
  // Read once: the canvas frames itself (or restores this view) on mount only.
  const [mountViewport] = useState(initialViewport)
  const ctx = usePluginCtx()
  const flow = useReactFlow()
  const flowStore = useStoreApi()
  const wrapper = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<ReadonlyMap<string, Point>>()
  // Card 9: the drag in progress (the grabbed block and every dragged block's start) and the
  // latest group spots, which the drop records.
  const dragGroup = useRef<null | { grabbed: string; starts: ReadonlyMap<string, Point>; latest?: ReadonlyMap<string, Point> }>(null)
  const actions = useSessionActions()
  const [tooltip, setTooltip] = useState<Tooltip>()
  const spaceDown = useRef(false)
  const altDown = useRef(false)
  // R3: while Space (or Alt) is held a left-drag pans from anywhere, also from a block (not a
  // block drag).
  const [panKeyHeld, setPanKeyHeld] = useState(false)
  const tooltipTimer = useRef<() => void>(undefined)
  const frame = style.frame && frameLayout ? style.frame : undefined
  // Card 9 (S1/S2): the selection box in the styles with dragging (Dense, Subway, Rich cards);
  // Swimlanes has none, a left-drag on its empty canvas only clears the selection as before.
  const boxSelect = style.draggable
  const boxSelectRef = useRef(boxSelect)
  // Where the box started (flow coordinates) and whether Shift was held then (Shift + a box adds).
  const boxStart = useRef<null | { at: Point; additive: boolean }>(null)
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
  const { shown, rects, links, routes } = routing.get({ model, spec, frameShown, positions, ports: style.ports, router: style.router, slots: style.linkSlots })
  const selectedIds = useMemo(() => new Set(selection.ids), [selection])
  // The lineage highlight shows only while exactly one block is selected (card 9).
  const selectedId = singleSelected(selection)
  const lineage = useMemo(() => lineageOf(model, selectedId), [model, selectedId])
  // What a box or Ctrl/⌘+A may select: editable session blocks on the canvas (card 9).
  const selectableRects = useMemo(() => {
    const out = new Map<string, Rect>()

    for (const [id, rect] of rects) {
      if (canvasSelectable(model, shown, id)) {
        out.set(id, rect)
      }
    }

    return out
  }, [model, shown, rects])
  const selectableRef = useRef(selectableRects)

  useEffect(() => {
    boxSelectRef.current = boxSelect
    selectableRef.current = selectableRects
  }, [boxSelect, selectableRects])

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
        selected: selectedIds.has(node.id) && !node.readOnly,
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
  }, [model, positions, labels, shown, style, spec, statusOf, lineage, selectedId, selectedIds, nowMs, frame, frameLayout])

  const nodes = useMemo(() => {
    const moved = drag ? baseNodes.map(node => (drag.has(node.id) ? { ...node, position: drag.get(node.id)!, dragging: true } : node)) : baseNodes

    // A non-draggable block has no `nopan` class, so React Flow's Space / Alt pan starts on it too.
    return panKeyHeld ? moved.map(node => (node.draggable ? { ...node, draggable: false } : node)) : moved
  }, [baseNodes, drag, panKeyHeld])

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

  const onNodesChange = useCallback(
    (changes: NodeChange<FlowNode>[]) => {
      const moves = changes.filter(
        (change): change is Extract<NodeChange<FlowNode>, { type: 'position' }> =>
          change.type === 'position' && Boolean(change.position) && change.dragging === true
      )

      if (moves.length === 0) {
        return
      }

      const group = dragGroup.current
      const grabbed = group ? moves.find(move => move.id === group.grabbed) : undefined

      if (!group || !grabbed) {
        setDrag(previous => {
          const next = new Map(previous)

          for (const move of moves) {
            next.set(move.id, move.position!)
          }

          return next
        })

        return
      }

      // Card 9: every dragged block moves by the grabbed block's offset (spacing kept); with Snap
      // the grabbed block snaps and the others follow it (React Flow's own snap is off: it snaps
      // a group by its first block, not by the one under the pointer).
      const next = groupPositions(group.starts, group.grabbed, grabbed.position!, snap, style.grid)
      const latest = group.latest

      if (latest && latest.size === next.size && [...next].every(([id, point]) => latest.get(id)?.x === point.x && latest.get(id)?.y === point.y)) {
        return
      }

      group.latest = next
      setDrag(next)
    },
    [snap, style.grid]
  )

  const onNodeDragStart = useCallback<OnNodeDrag<FlowNode>>(
    (_event, node, dragged) => {
      hideTooltip()

      const blocks = dragged.filter(item => !item.id.startsWith(GROUP_PREFIX))

      dragGroup.current = { grabbed: node.id, starts: new Map(blocks.map(item => [item.id, { x: item.position.x, y: item.position.y }])) }

      // A left-drag on an unselected block selects just that block (React Flow drags it alone).
      if (!selectedIds.has(node.id)) {
        onSelection({ type: 'only', id: node.id })
      }

      onDragging(blocks.map(item => item.id))
    },
    [hideTooltip, onDragging, onSelection, selectedIds]
  )

  const onNodeDragStop = useCallback<OnNodeDrag<FlowNode>>(
    (_event, _node, dragged) => {
      const latest = dragGroup.current?.latest
      const moves = new Map<string, Point>()

      for (const item of dragged) {
        if (!item.id.startsWith(GROUP_PREFIX)) {
          const point = latest?.get(item.id) ?? item.position

          moves.set(item.id, { x: point.x, y: point.y })
        }
      }

      dragGroup.current = null
      setDrag(undefined)

      // One drop for the whole group: one routing pass and one batched save (card 9).
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
    (event, flowNode) => {
      const node = graphNode(flowNode)

      if (node && !node.readOnly) {
        // Card 9: Shift+click adds or removes one block; a plain click selects only this one.
        onSelection(event.shiftKey ? { type: 'toggle', id: node.id } : { type: 'only', id: node.id })
      }
    },
    [graphNode, onSelection]
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

      // Card 9 (S3): the menu acts on the right-clicked block only. A right-click inside the
      // selection keeps it; on another block it selects just that block, as before.
      if (!selectedIds.has(node.id)) {
        onSelection({ type: 'only', id: node.id })
      }
    },
    [hideTooltip, onSelection, selectedIds]
  )

  // Card 9: the selection box. React Flow draws it (`selectionOnDrag`); which blocks it selects
  // is decided here, from the box's two corners in flow coordinates: only the editable blocks
  // fully inside it (`SelectionMode.Full`, `canvasSelectable`). React Flow's own select changes
  // are not used (the canvas's selection is controlled).
  const onSelectionStart = useCallback(
    (event: ReactMouseEvent) => {
      const rect = flowStore.getState().userSelectionRect

      boxStart.current = rect ? { at: { x: rect.startX, y: rect.startY }, additive: event.shiftKey } : null
      hideTooltip()
    },
    [flowStore, hideTooltip]
  )

  const onSelectionEnd = useCallback(
    (event: ReactMouseEvent) => {
      const start = boxStart.current

      boxStart.current = null

      if (!start) {
        return
      }

      const end = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }, { snapToGrid: false })
      const ids = fullyInside(selectableRef.current, boxOf(start.at, end))

      onSelection({ type: 'box', ids, additive: start.additive })
    },
    [flow, onSelection]
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
  // autoscroll or an X11 primary-selection paste, and a plain left-press on empty canvas clears
  // the selection (card 9: in the box styles a left-drag then draws a selection box, and a press
  // with Shift keeps the selection for Shift + a box). Capture phase, so it runs before d3-zoom.
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

          // A pan (Space or Alt held) keeps the selection.
          if (pointer.button !== 0 || spaceDown.current || altDown.current || pointer.altKey || !target) {
            return
          }

          if (target.closest('.react-flow__pane') && !target.closest('.react-flow__node') && !(boxSelectRef.current && pointer.shiftKey)) {
            onSelection({ type: 'clear' })
          }
        },
        true
      ),
      // Card 9: Esc clears the selection; Ctrl/⌘+A selects every editable block shown. Neither
      // acts while the focus is in a text field (Rename, search: Ctrl/⌘+A selects its text there)
      // or in an open menu or dialog. Delete and Backspace never delete sessions (React Flow's
      // delete key is off and nothing here listens for them).
      ctx.addEventListener(window, 'keydown', event => {
        const key = event as KeyboardEvent
        const target = key.target as Element | null
        // Only keys aimed at this page (or at nothing in particular): not the app around it.
        const onPage = !target || target === document.body || target === document.documentElement || Boolean(wrapper.current?.closest('.session-tree')?.contains(target))

        if (!onPage || key.defaultPrevented || isTextField(target) || target?.closest?.('[role="menu"], [role="dialog"], [role="alertdialog"], [role="listbox"]')) {
          return
        }

        if (key.key === 'Escape') {
          onSelection({ type: 'clear' })
        } else if ((key.ctrlKey || key.metaKey) && !key.altKey && !key.shiftKey && key.key.toLowerCase() === 'a') {
          key.preventDefault()
          onSelection({ type: 'all', ids: [...selectableRef.current.keys()] })
        }
      }),
      ctx.addEventListener(
        window,
        'keydown',
        event => {
          if ((event as KeyboardEvent).key === 'Alt') {
            altDown.current = true
            setPanKeyHeld(true)

            return
          }

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
          setPanKeyHeld(true)
        },
        true
      ),
      ctx.addEventListener(window, 'keyup', event => {
        const key = event as KeyboardEvent

        if (key.code === 'Space') {
          spaceDown.current = false
        } else if (key.key === 'Alt') {
          altDown.current = false
        } else {
          return
        }

        setPanKeyHeld(spaceDown.current || altDown.current)
      }),
      ctx.addEventListener(window, 'blur', () => {
        spaceDown.current = false
        altDown.current = false
        setPanKeyHeld(false)
      })
    ]

    return () => offs.forEach(off => off())
  }, [ctx, onSelection])

  useEffect(() => () => tooltipTimer.current?.(), [])

  const Under = frame?.Under
  const Over = frame?.Over
  const Layer = style.Layer

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
        data-box-select={boxSelect ? 'true' : 'false'}
        data-selected-count={selection.ids.length}
        data-selected={selection.ids.join(' ')}
        data-route-passes={routing.routed}
      >
        <FrameUiCtx.Provider value={frameUi}>
          {Under && frameLayout && <Under layout={frameLayout} nowMs={nowMs} />}
          <StyleProviders model={model}>
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
            onSelectionStart={onSelectionStart}
            onSelectionEnd={onSelectionEnd}
            nodesDraggable={style.draggable}
            panOnDrag={[1]}
            panActivationKeyCode={PAN_KEYS}
            zoomOnScroll
            panOnScroll={false}
            zoomOnDoubleClick={false}
            zoomOnPinch
            selectionOnDrag={boxSelect}
            selectionMode={SelectionMode.Full}
            selectionKeyCode={null}
            multiSelectionKeyCode={null}
            deleteKeyCode={null}
            nodesConnectable={false}
            nodesFocusable={false}
            edgesFocusable={false}
            elevateNodesOnSelect={false}
            // Card 9: the canvas snaps dragged blocks itself (`groupPositions`): a group by the
            // grabbed block's snapped spot, one block exactly as React Flow's snapToGrid did.
            snapToGrid={false}
            snapGrid={[style.grid, style.grid]}
            minZoom={MIN_ZOOM}
            maxZoom={MAX_ZOOM}
            onlyRenderVisibleElements={nodes.length > VISIBLE_ONLY_ABOVE}
            fitView={!mountViewport && !style.frame}
            fitViewOptions={{ padding: style.fitPadding ?? 0.08, maxZoom: 1.25 }}
            defaultViewport={mountViewport}
            onMoveEnd={onMoveEnd}
            proOptions={{ hideAttribution: true }}
          >
            {snap && <Background variant={BackgroundVariant.Dots} gap={style.grid} size={1.3} />}
            {Layer && (
              <Layer
                model={model}
                positions={positions}
                shown={shown}
                links={links}
                routes={routes}
                nodeSize={style.nodeSize}
                showAll={spec.includeSingles}
                selectedId={selectedId}
                onSelect={onSelect}
                onOpen={onOpen}
                nowMs={nowMs}
                panelOpen={panelOpen}
                onPanel={open => onPanel?.(open)}
              />
            )}
          </ReactFlow>
          </StyleProviders>
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
