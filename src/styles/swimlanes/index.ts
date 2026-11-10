/**
 * Project swimlanes (R1, card 5; mockup `variants/project-swimlanes/`): one lane per project, a
 * day time axis, trees growing left to right. No dragging and no saved positions (R12): the
 * layout is computed from the data on every render (`layout.ts`) and never touches the layout
 * store.
 */
import type { Node } from '@xyflow/react'

import { orthogonalRouter } from '../../model/route.ts'
import { GroupLabel, projectColor } from '../shared.tsx'
import type { FrameLayout, StyleDefinition, StyleFrame } from '../types.ts'
import { SwimOver, SwimUnder } from './layers.tsx'
import { fitSwimlanes, layoutSwimlanes } from './layout.ts'
import type { SwimFrameLayout } from './layout.ts'
import { NO_DRAG_TIP, SWIM_GRID, SWIM_HEIGHT, SWIM_RESET_X, SWIM_WIDTH, swimLayoutSpec, swimPorts } from './spec.ts'
import { CHIP_PREFIX, SwimBlock, SwimChip, SwimLink, SwimStandin } from './swim-flow.tsx'
import type { ChipData } from './swim-flow.tsx'

export const swimFrame: StyleFrame = {
  compute(input): FrameLayout {
    const layout = layoutSwimlanes(input)

    return Object.assign(layout, { fit: (width: number, height: number, minZoom: number) => fitSwimlanes(layout, width, height, minZoom) })
  },

  extraNodes(frameLayout): Node[] {
    const layout = frameLayout as SwimFrameLayout

    return layout.lanes
      .filter(lane => lane.chip)
      .map(lane => ({
        id: `${CHIP_PREFIX}${lane.key}`,
        type: 'swim-chip',
        position: { x: lane.chip!.x, y: lane.chip!.y },
        data: { laneKey: lane.key, label: lane.label, count: lane.singleIds.length, color: projectColor(lane.project) } satisfies ChipData,
        draggable: false,
        selectable: false,
        focusable: false,
        connectable: false,
        width: lane.chip!.width,
        height: lane.chip!.height,
        measured: { width: lane.chip!.width, height: lane.chip!.height },
        className: 'session-tree__chip-node',
        zIndex: 1
      }))
  },

  Under: SwimUnder,
  Over: SwimOver
}

export const swimlanesStyle: StyleDefinition = {
  id: 'swimlanes',
  label: 'Project swimlanes',
  nodeTypes: { 'swim-session': SwimBlock, 'swim-standin': SwimStandin, 'swim-chip': SwimChip, group: GroupLabel },
  nodeType: { session: 'swim-session', standin: 'swim-standin', group: 'group' },
  edgeTypes: { 'swim-link': SwimLink },
  edgeType: 'swim-link',
  nodeSize: { width: SWIM_WIDTH, height: SWIM_HEIGHT },
  layoutSpec: swimLayoutSpec,
  // The page lays a framed style out through `frame.compute` (with "now", the time zone and the
  // collapsed lanes); this keeps the contract for any other caller: no previous positions used.
  layout: (model, _previous, spec) =>
    layoutSwimlanes({ model, showAll: spec.includeSingles, collapsed: new Set(), nowMs: Date.now(), tzOffsetMinutes: -new Date().getTimezoneOffset() }),
  draggable: false,
  savesLayout: false,
  singles: 'lane-chip',
  router: orthogonalRouter,
  ports: swimPorts,
  grid: SWIM_GRID,
  resetPortX: SWIM_RESET_X,
  snapUnavailable: NO_DRAG_TIP,
  frame: swimFrame
}
