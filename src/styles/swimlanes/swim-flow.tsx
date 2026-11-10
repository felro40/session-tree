/**
 * Project swimlanes blocks and links (mockup `variants/project-swimlanes/`): compact 170 × 54
 * cards with the project colour as a top border, a title line and one meta line (last used,
 * messages, tokens); status as a dot plus coloured meta text; `compacted ×N` as a pill with a
 * stacked-paper shadow; orthogonal links with rounded corners from the parent's right edge into
 * the child's left edge; a dashed accent "continued as" link; the lane's "no branches N" chip.
 */
import { Codicon } from '@hermes/plugin-sdk'
import { BaseEdge, EdgeLabelRenderer, useInternalNode } from '@xyflow/react'
import type { Edge, EdgeProps, InternalNode, Node, NodeProps } from '@xyflow/react'
import { memo } from 'react'
import type { CSSProperties } from 'react'

import { agoLabel } from '../../model/format.ts'
import type { Rect } from '../../model/layout.ts'
import { orthogonalRouter } from '../../model/route.ts'
import type { Port } from '../../model/route.ts'
import { useFrameUi } from '../../page/frame-context.ts'
import { useSessionActions } from '../../page/session-actions-context.ts'
import { BlockHandles, ProjectGlyph, projectColor } from '../shared.tsx'
import type { BlockData, LinkData } from '../types.ts'
import { blockTokens } from './layout.ts'
import { SWIM_HEIGHT, SWIM_RESET_X, SWIM_WIDTH, swimPorts, tokenLabel } from './spec.ts'

export type SwimBlockNode = Node<BlockData, 'swim-session'>
export type SwimStandinNode = Node<BlockData, 'swim-standin'>
export type SwimLinkEdge = Edge<LinkData, 'swim-link'>

export interface ChipData extends Record<string, unknown> {
  laneKey: string
  label: string
  count: number
  color: string
}

export type SwimChipNode = Node<ChipData, 'swim-chip'>

export const CHIP_PREFIX = 'chip:'

function blockClass(data: BlockData, selected: boolean, extra = ''): string {
  const { node } = data

  return [
    'session-tree__block',
    'st-swim',
    extra,
    selected ? 'is-selected' : '',
    data.inLineage ? 'is-lineage' : '',
    data.status?.open ? 'is-open' : '',
    node.archived ? 'is-archived' : '',
    node.compacted > 0 ? 'is-compacted' : '',
    node.outOfScope ? 'is-ghost' : ''
  ]
    .filter(Boolean)
    .join(' ')
}

export const SwimBlock = memo(function SwimBlock({ data, selected }: NodeProps<SwimBlockNode>) {
  const { node, status, project } = data
  const actions = useSessionActions()
  const row = node.row!
  const tone = status?.tone ?? 'idle'
  // R5: a ghost is the scoped block's parent from another project, read-only.
  const ghost = node.outOfScope

  return (
    <div
      className={blockClass(data, Boolean(selected))}
      data-testid="session-tree-block"
      data-session-id={row.id}
      data-node-id={node.id}
      data-project-id={node.projectId ?? ''}
      data-status={tone}
      data-open={status?.open ? 'true' : undefined}
      data-archived={node.archived ? 'true' : undefined}
      data-out-of-scope={ghost ? 'true' : undefined}
      data-ghost={ghost ? 'true' : undefined}
      data-lineage={data.inLineage ? 'true' : undefined}
      style={{ width: SWIM_WIDTH, height: SWIM_HEIGHT, '--st-pc': projectColor(project) } as CSSProperties}
    >
      <BlockHandles resetX={SWIM_RESET_X} />
      {node.compacted > 0 && (
        <span
          className="st-swim-cpill"
          data-testid="session-tree-compacted"
          title={`${node.compacted} earlier segment${node.compacted > 1 ? 's' : ''} folded into this block`}
        >
          <Codicon name="layers" size={10} />
          compacted ×{node.compacted}
        </span>
      )}
      <div className="st-swim-r1">
        {status?.pinned && <Codicon name="pinned" size={11} className="st-pin" />}
        <span className="st-title">{node.title}</span>
        {tone !== 'idle' && <span className={`st-dot st-dot--${tone}`} aria-label={tone} />}
        {actions?.canAct(node) && (
          // R14: the session menu from the block itself (on hover or while selected).
          <button
            type="button"
            className="st-more st-swim-more nodrag nopan"
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
      <div className="st-swim-meta">
        {ghost ? (
          <>
            <ProjectGlyph project={project} size={10} />
            <span className="st-swim-ghost-project" data-testid="session-tree-ghost-project">
              {project?.label ?? 'Home'}
            </span>
            <i>·</i>
            {agoLabel(row.last_active || row.started_at, data.nowMs)}
          </>
        ) : (
          <>
            {status?.open && (
              <>
                <span className="st-opn">● open</span>
                <i>·</i>
              </>
            )}
            {status?.needsInput && !status.running && (
              <>
                <span className="st-ask">needs input</span>
                <i>·</i>
              </>
            )}
            {status?.running ? <span className="st-run">running</span> : agoLabel(row.last_active || row.started_at, data.nowMs)}
            <i>·</i>
            <span data-field="messages">{row.message_count ?? 0} msgs</span>
            <i>·</i>
            <span data-field="tokens">{tokenLabel(blockTokens(node))}</span>
          </>
        )}
      </div>
    </div>
  )
})

export const SwimStandin = memo(function SwimStandin({ data }: NodeProps<SwimStandinNode>) {
  const { node } = data

  return (
    <div
      className={blockClass(data, false, 'is-standin')}
      data-testid="session-tree-standin"
      data-node-id={node.id}
      data-missing-id={node.missingId}
      data-out-of-scope={node.outOfScope ? 'true' : undefined}
      style={{ width: SWIM_WIDTH, height: SWIM_HEIGHT }}
    >
      <BlockHandles resetX={SWIM_RESET_X} />
      <div className="st-swim-r1">
        <span className="st-title">Parent not loaded</span>
      </div>
      <div className="st-swim-meta">deleted, hidden or not loaded</div>
    </div>
  )
})

function rectOfInternal(node: InternalNode): Rect {
  return {
    x: node.internals.positionAbsolute.x,
    y: node.internals.positionAbsolute.y,
    width: node.measured?.width ?? node.width ?? SWIM_WIDTH,
    height: node.measured?.height ?? node.height ?? SWIM_HEIGHT
  }
}

const samePort = (a: Port, b: Port) => Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && a.dir === b.dir

export function SwimLink({ id, source, target, data }: EdgeProps<SwimLinkEdge>) {
  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)

  if (!sourceNode || !targetNode || !data) {
    return null
  }

  const { from, to } = swimPorts(data.kind, rectOfInternal(sourceNode), rectOfInternal(targetNode))
  const routed = data.route && samePort(data.route.from, from) && samePort(data.route.to, to)
  // R13: the on-drop (here: on-layout) route while both ends stay put, the plain elbow otherwise.
  const route = routed ? data.route!.route : orthogonalRouter.live(from, to)
  const classes = [
    'session-tree__link',
    'st-swim-link',
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
      data-standin={data.fromStandin ? 'true' : undefined}
      data-detoured={route.detoured ? 'true' : 'false'}
      data-highlighted={data.highlighted ? 'true' : undefined}
    >
      <BaseEdge id={id} path={route.svg} className={classes} />
      <path
        className={`st-swim-arrow${data.kind === 'reset' ? ' is-reset' : ''}${data.highlighted ? ' is-highlighted' : ''}`}
        d={`M${to.x - 6} ${to.y - 4} L${to.x} ${to.y} L${to.x - 6} ${to.y + 4}Z`}
      />
      {data.kind === 'reset' && (
        <EdgeLabelRenderer>
          <div
            className="session-tree__link-label st-swim-link-label nodrag nopan"
            data-testid="session-tree-link-label"
            data-link-id={id}
            style={{ transform: `translate(-50%, -50%) translate(${route.mid.x}px, ${route.mid.y}px)` }}
          >
            continued as
          </div>
        </EdgeLabelRenderer>
      )}
    </g>
  )
}

/** R8: the lane's "no branches N" chip; a click opens the singles popover (the overlay). */
export const SwimChip = memo(function SwimChip({ id, data }: NodeProps<SwimChipNode>) {
  const ui = useFrameUi()
  const open = ui?.activeId === id

  return (
    <button
      type="button"
      className={`st-swim-chip nodrag nopan${open ? ' is-on' : ''}`}
      data-testid="session-tree-lane-chip"
      data-lane={data.laneKey}
      data-count={data.count}
      aria-expanded={open}
      title={`${data.count} session${data.count === 1 ? '' : 's'} without branches in ${data.label}`}
      style={{ '--st-pc': data.color } as CSSProperties}
      onMouseDown={event => {
        // Never focus (Space pans), never start a pane gesture.
        event.preventDefault()
        event.stopPropagation()
      }}
      onDoubleClick={event => event.stopPropagation()}
      onClick={event => {
        event.stopPropagation()
        ui?.activate(id, event.currentTarget)
      }}
    >
      no branches <b>{data.count}</b>
      <Codicon name={open ? 'chevron-up' : 'chevron-down'} size={11} />
    </button>
  )
})
