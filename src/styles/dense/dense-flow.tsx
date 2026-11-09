/**
 * Dense + inspector (mockup `variants/dense-inspector/`): single-line pills — status dot,
 * truncated title, trailing age, the project colour as a thin left edge — and thin bezier links.
 */
import { Codicon } from '@hermes/plugin-sdk'
import { BaseEdge, EdgeLabelRenderer, useInternalNode } from '@xyflow/react'
import type { Edge, EdgeProps, InternalNode, Node, NodeProps } from '@xyflow/react'
import { memo } from 'react'
import type { CSSProperties } from 'react'

import { shortAge } from '../../model/format.ts'
import type { Rect } from '../../model/layout.ts'
import { curveRouter } from '../../model/route.ts'
import type { Port } from '../../model/route.ts'
import { BlockHandles, projectColor } from '../shared.tsx'
import type { BlockData, LinkData } from '../types.ts'
import { DENSE_HEIGHT, DENSE_RESET_X, DENSE_WIDTH, densePorts } from './spec.ts'

export type DenseBlockNode = Node<BlockData, 'dense-session'>
export type DenseStandinNode = Node<BlockData, 'dense-standin'>
export type DenseLinkEdge = Edge<LinkData, 'dense-link'>


function blockClass(data: BlockData, selected: boolean, extra = ''): string {
  const { node } = data

  return [
    'session-tree__block',
    'st-dense',
    extra,
    selected ? 'is-selected' : '',
    data.inLineage ? 'is-lineage' : '',
    data.status?.open ? 'is-open' : '',
    node.archived ? 'is-archived' : '',
    node.outOfScope ? 'is-out-of-scope' : ''
  ]
    .filter(Boolean)
    .join(' ')
}

export const DenseBlock = memo(function DenseBlock({ data, selected }: NodeProps<DenseBlockNode>) {
  const { node, status, project } = data
  const row = node.row!
  const tone = status?.tone ?? 'idle'

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
      data-out-of-scope={node.outOfScope ? 'true' : undefined}
      data-lineage={data.inLineage ? 'true' : undefined}
      style={{ width: DENSE_WIDTH, height: DENSE_HEIGHT, '--st-pc': projectColor(project) } as CSSProperties}
    >
      <BlockHandles resetX={DENSE_RESET_X} />
      <span className={`st-dot st-dot--${tone}`} aria-label={tone === 'idle' ? undefined : tone} />
      {status?.pinned && <Codicon name="pinned" size={11} className="st-pin" />}
      <span className="st-title">{node.title}</span>
      {node.compacted > 0 && (
        <span className="st-cmp" data-testid="session-tree-compacted" title={`compacted ×${node.compacted}`}>
          <Codicon name="layers" size={11} />×{node.compacted}
        </span>
      )}
      <span className="st-age">{shortAge(row.last_active || row.started_at, data.nowMs)}</span>
    </div>
  )
})

export const DenseStandin = memo(function DenseStandin({ data }: NodeProps<DenseStandinNode>) {
  const { node } = data

  return (
    <div
      className={blockClass(data, false, 'is-standin')}
      data-testid="session-tree-standin"
      data-node-id={node.id}
      data-missing-id={node.missingId}
      data-out-of-scope={node.outOfScope ? 'true' : undefined}
      style={{ width: DENSE_WIDTH, height: DENSE_HEIGHT }}
    >
      <BlockHandles resetX={DENSE_RESET_X} />
      <span className="st-title">Parent not loaded</span>
      <span className="st-age">?</span>
    </div>
  )
})

function rectOfInternal(node: InternalNode): Rect {
  return {
    x: node.internals.positionAbsolute.x,
    y: node.internals.positionAbsolute.y,
    width: node.measured?.width ?? node.width ?? DENSE_WIDTH,
    height: node.measured?.height ?? node.height ?? DENSE_HEIGHT
  }
}

const samePort = (a: Port, b: Port) => Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5

export function DenseLink({ id, source, target, data }: EdgeProps<DenseLinkEdge>) {
  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)

  if (!sourceNode || !targetNode || !data) {
    return null
  }

  const { from, to } = densePorts(data.kind, rectOfInternal(sourceNode), rectOfInternal(targetNode))
  const routed = data.route && samePort(data.route.from, from) && samePort(data.route.to, to)
  // R13: the stored on-drop route while both ends stay put, the live curve otherwise.
  const route = routed ? data.route!.route : curveRouter.live(from, to)
  const classes = [
    'session-tree__link',
    `session-tree__link--${data.kind}`,
    data.fromStandin ? 'session-tree__link--standin' : '',
    data.highlighted ? 'is-highlighted' : '',
    data.dimmed ? 'is-dimmed' : ''
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
      className={data.dimmed ? 'is-dimmed' : undefined}
    >
      <BaseEdge id={id} path={route.svg} className={classes} />
      {data.kind === 'reset' ? (
        <path
          className={`session-tree__link-end${data.highlighted ? ' is-highlighted' : ''}`}
          d={`M${to.x - 3} ${to.y - 5} L${to.x + 3} ${to.y - 5} L${to.x} ${to.y - 1}Z`}
        />
      ) : (
        <circle className={`session-tree__link-end${data.highlighted ? ' is-highlighted' : ''}`} cx={to.x - 2} cy={to.y} r={2} />
      )}
      {data.kind === 'reset' && (
        // EdgeLabelRenderer portals into the flow's label layer (the react-dom shim's proof).
        <EdgeLabelRenderer>
          <div
            className="session-tree__link-label nodrag nopan"
            data-testid="session-tree-link-label"
            data-link-id={id}
            style={{ transform: `translate(0, -50%) translate(${route.mid.x + 6}px, ${route.mid.y}px)` }}
          >
            continued as
          </div>
        </EdgeLabelRenderer>
      )}
    </g>
  )
}
