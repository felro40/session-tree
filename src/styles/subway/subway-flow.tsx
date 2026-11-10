/**
 * Subway map (mockup `variants/subway-map/`): every conversation lineage is a thick coloured line
 * (a shade of its project colour per track), every session a ringed station with its label beside
 * it (title, at most 2 lines, and a muted meta line: last used, messages, tokens). Compacted ×N is
 * a capsule station with "×N" inside; the stand-in a hollow dashed station "not loaded" at the
 * start of a dashed grey line; "continued as" a dotted planned line with its label.
 *
 * Status: running stations pulse, needs input is an amber ring, unread an accent dot after the
 * title, pinned a pin glyph, the open session a "you are here" marker. Tracks are drawn over a
 * casing in the canvas colour, so a track that crosses another shows a halo there.
 */
import { Codicon } from '@hermes/plugin-sdk'
import { BaseEdge, EdgeLabelRenderer, useInternalNode } from '@xyflow/react'
import type { Edge, EdgeProps, InternalNode, Node, NodeProps } from '@xyflow/react'
import { memo } from 'react'
import type { CSSProperties } from 'react'

import { agoLabel, costLabel } from '../../model/format.ts'
import type { Rect } from '../../model/layout.ts'
import { octilinearRouter } from '../../model/route.ts'
import type { Port } from '../../model/route.ts'
import { useSessionActions } from '../../page/session-actions-context.ts'
import { BlockHandles } from '../shared.tsx'
import { tokenLabel } from '../swimlanes/spec.ts'
import type { BlockData, LinkData } from '../types.ts'
import { useLabelSpot, useSubwayEnv } from './context.tsx'
import { labelRect } from './labels.ts'
import { LABEL_H, LABEL_W, STATION_H, STATION_W, lineBase, subwayPorts, trackColour } from './spec.ts'
import type { LabelSpot } from './spec.ts'

export type SubwayStationNode = Node<BlockData, 'subway-station'>
export type SubwayStandinNode = Node<BlockData, 'subway-standin'>
export type SubwayLinkEdge = Edge<LinkData, 'subway-link'>

export const COMPACTED_TIP = (n: number) => `Compacted ×${n}: ${n} earlier segment${n === 1 ? '' : 's'} of this conversation folded into this station`
export const HERE_LABEL = 'you are here'

const LABEL_ORIGIN = { x: 0, y: 0 }

/** The label's box relative to the station's top-left, for its spot. */
function labelStyle(spot: LabelSpot): CSSProperties {
  const rect = labelRect(LABEL_ORIGIN, spot)

  return { left: rect.x, top: rect.y, width: LABEL_W, height: LABEL_H }
}

function stationClass(data: BlockData, selected: boolean, extra = ''): string {
  const { node, status } = data

  return [
    'st-subway',
    extra,
    selected ? 'is-selected' : '',
    data.inLineage ? 'is-lineage' : '',
    status?.open ? 'is-open' : '',
    status?.running ? 'is-running' : '',
    status?.needsInput ? 'is-asking' : '',
    status?.unread ? 'is-unread' : '',
    node.archived ? 'is-archived' : '',
    node.outOfScope ? 'is-out-of-scope' : ''
  ]
    .filter(Boolean)
    .join(' ')
}

export const SubwayStation = memo(function SubwayStation({ data, selected }: NodeProps<SubwayStationNode>) {
  const { node, status, project } = data
  const env = useSubwayEnv()
  const actions = useSessionActions()
  const placed = useLabelSpot(node.id)
  const spot: LabelSpot = placed?.spot ?? 'above'
  const row = node.row!
  const track = env?.plan().track.get(node.id)
  const tokens = Math.max(0, Number(row.input_tokens) || 0) + Math.max(0, Number(row.output_tokens) || 0)
  const below = spot === 'below' || spot === 'below-left'
  const details = [row.model ? `model ${row.model}` : '', `cost ${costLabel(row.actual_cost_usd, row.estimated_cost_usd)}`].filter(Boolean).join(' · ')

  return (
    <div
      className={stationClass(data, Boolean(selected), node.compacted > 0 ? 'is-capsule' : '')}
      data-testid="session-tree-block"
      data-session-id={row.id}
      data-node-id={node.id}
      data-project-id={node.projectId ?? ''}
      data-track={track?.id}
      data-shade={track?.ordinal}
      data-label-spot={spot}
      data-label-clear={placed ? String(placed.clear) : undefined}
      data-status={status?.tone ?? 'idle'}
      data-running={status?.running ? 'true' : undefined}
      data-needs-input={status?.needsInput ? 'true' : undefined}
      data-unread={status?.unread ? 'true' : undefined}
      data-pinned={status?.pinned ? 'true' : undefined}
      data-open={status?.open ? 'true' : undefined}
      data-archived={node.archived ? 'true' : undefined}
      data-out-of-scope={node.outOfScope ? 'true' : undefined}
      data-lineage={data.inLineage ? 'true' : undefined}
      data-compacted={node.compacted || undefined}
      style={{ width: STATION_W, height: STATION_H, '--st-pc': lineBase(project?.color), '--st-tc': trackColour(track?.ordinal ?? 0) } as CSSProperties}
    >
      <BlockHandles resetX={STATION_W / 2} />
      {node.compacted > 0 ? (
        <span className="st-sw-station st-sw-capsule" data-testid="session-tree-station" data-shape="capsule" title={COMPACTED_TIP(node.compacted)}>
          <span data-testid="session-tree-compacted">×{node.compacted}</span>
        </span>
      ) : (
        <span className="st-sw-station st-sw-ring" data-testid="session-tree-station" data-shape="ring" />
      )}
      <div className={`st-sw-label is-${spot}`} data-testid="session-tree-station-label" style={labelStyle(spot)} title={details}>
        <div className="st-sw-title" data-field="title">
          {status?.pinned && <Codicon name="pinned" size={11} className="st-pin" aria-label="pinned" />}
          <span className="st-sw-title-text">{node.title}</span>
          {status?.unread && <span className="st-sw-udot" data-testid="session-tree-unread-dot" title="Unread" />}
        </div>
        <div className="st-sw-meta">
          <span data-field="last-used">{agoLabel(row.last_active || row.started_at, data.nowMs)}</span>
          <span data-field="messages">{row.message_count ?? 0} msgs</span>
          <span data-field="tokens">{tokenLabel(tokens)} tok</span>
          {status?.running && <span className="st-sw-pill is-run">running</span>}
          {status?.needsInput && (
            <span className="st-sw-pill is-ask" data-testid="session-tree-needs-input">
              needs input
            </span>
          )}
          {node.archived && <span className="st-sw-pill">archived</span>}
          {actions?.canAct(node) && (
            // R14: the session menu from the station itself (on hover or while selected).
            <button
              type="button"
              className="st-more st-sw-more nodrag nopan"
              data-testid="session-tree-block-more"
              aria-label="Session actions"
              title="Session actions"
              onMouseDown={event => event.stopPropagation()}
              onDoubleClick={event => event.stopPropagation()}
              onClick={event => {
                event.stopPropagation()
                actions.openMenuFor(node.id, event.currentTarget)
              }}
            >
              <Codicon name="ellipsis" size={12} />
            </button>
          )}
        </div>
      </div>
      {status?.open && (
        <span className={`st-sw-here${below ? ' is-above' : ''}`} data-testid="session-tree-you-are-here">
          ◉ {HERE_LABEL}
        </span>
      )}
    </div>
  )
})

export const SubwayStandin = memo(function SubwayStandin({ data }: NodeProps<SubwayStandinNode>) {
  const { node } = data
  const env = useSubwayEnv()
  const placed = useLabelSpot(node.id)
  const spot: LabelSpot = placed?.spot ?? 'above'
  const children = env?.model.childrenOf.get(node.id)?.length ?? 0

  return (
    <div
      className={stationClass(data, false, 'is-standin')}
      data-testid="session-tree-standin"
      data-node-id={node.id}
      data-missing-id={node.missingId}
      data-track={env?.plan().track.get(node.id)?.id}
      data-label-spot={spot}
      data-out-of-scope={node.outOfScope ? 'true' : undefined}
      style={{ width: STATION_W, height: STATION_H }}
    >
      <BlockHandles resetX={STATION_W / 2} />
      <span className="st-sw-station st-sw-hollow" data-testid="session-tree-station" data-shape="hollow" />
      <div className={`st-sw-label is-${spot}`} data-testid="session-tree-station-label" style={labelStyle(spot)}>
        <div className="st-sw-title st-sw-nl" data-field="title">
          not loaded
        </div>
        <div className="st-sw-meta">
          <span>parent deleted or older</span>
          <span>
            {children} child{children === 1 ? '' : 'ren'}
          </span>
        </div>
      </div>
    </div>
  )
})

function rectOfInternal(node: InternalNode): Rect {
  return {
    x: node.internals.positionAbsolute.x,
    y: node.internals.positionAbsolute.y,
    width: node.measured?.width ?? node.width ?? STATION_W,
    height: node.measured?.height ?? node.height ?? STATION_H
  }
}

const samePort = (a: Port, b: Port) => Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && a.dir === b.dir

export function SubwayLink({ id, source, target, data }: EdgeProps<SubwayLinkEdge>) {
  const env = useSubwayEnv()
  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)

  if (!sourceNode || !targetNode || !data) {
    return null
  }

  const plan = env?.plan()
  const slot = plan?.slots.get(id) ?? 0
  const { from, to } = subwayPorts(data.kind, rectOfInternal(sourceNode), rectOfInternal(targetNode), slot)
  const routed = Boolean(data.route && samePort(data.route.from, from) && samePort(data.route.to, to))
  // R13: the stored on-drop route while both ends stay put; a straight segment while dragging.
  const route = routed ? data.route!.route : octilinearRouter.live(from, to)
  // A branch is drawn in its child's track colour; "continued as" in its predecessor's.
  const track = plan?.track.get(data.kind === 'reset' ? source : target)
  const project = (data.kind === 'reset' ? sourceNode : targetNode).data as BlockData | undefined
  const classes = [
    'session-tree__link',
    'st-sw-track',
    `session-tree__link--${data.kind}`,
    data.fromStandin ? 'session-tree__link--standin' : '',
    data.highlighted ? 'is-highlighted' : ''
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <g
      data-testid="session-tree-link"
      data-source={source}
      data-target={target}
      data-kind={data.kind}
      data-slot={slot}
      data-track={track?.id}
      data-standin={data.fromStandin ? 'true' : undefined}
      data-detoured={route.detoured ? 'true' : 'false'}
      data-routed={routed ? 'true' : 'false'}
      data-highlighted={data.highlighted ? 'true' : undefined}
      className={data.dimmed ? 'is-dimmed' : undefined}
      style={{ '--st-pc': lineBase(project?.project?.color), '--st-tc': trackColour(track?.ordinal ?? 0) } as CSSProperties}
    >
      <path className="st-sw-casing" data-testid="session-tree-track-casing" d={route.svg} />
      <BaseEdge id={id} path={route.svg} className={classes} />
      {data.kind === 'reset' && (
        <EdgeLabelRenderer>
          <div
            className="session-tree__link-label st-sw-planned nodrag nopan"
            data-testid="session-tree-link-label"
            data-link-id={id}
            style={{ transform: `translate(-50%, 4px) translate(${route.mid.x}px, ${route.mid.y}px)` }}
          >
            continued as ›
          </div>
        </EdgeLabelRenderer>
      )}
    </g>
  )
}
