/**
 * The React Flow canvas: one plain block per visible row, plain links.
 * Foundation scope — the four styles, toolbar and interactions come later.
 */
import { host } from '@hermes/plugin-sdk'
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  Handle,
  Position,
  ReactFlow
} from '@xyflow/react'
import type { Edge, EdgeProps, Node, NodeProps } from '@xyflow/react'
import { memo, useCallback, useMemo } from 'react'

import { BLOCK_HEIGHT, BLOCK_WIDTH, layoutForest } from '../model/layout.ts'
import { displayTitle, graphLinks } from '../model/sessions.ts'
import type { LinkKind, SessionRow } from '../model/sessions.ts'

type BlockData = { title: string; row: SessionRow }
type BlockNode = Node<BlockData, 'block'>
type LinkData = { kind: LinkKind }
type LinkEdge = Edge<LinkData, 'link'>

const SessionBlock = memo(function SessionBlock({ data }: NodeProps<BlockNode>) {
  return (
    <div
      className="session-tree__block"
      data-testid="session-tree-block"
      data-session-id={data.row.id}
      title={data.title}
      style={{ width: BLOCK_WIDTH, height: BLOCK_HEIGHT }}
    >
      <Handle type="target" position={Position.Left} isConnectable={false} className="session-tree__handle" />
      <Handle id="up" type="target" position={Position.Top} isConnectable={false} className="session-tree__handle" />
      <span className="session-tree__block-title">{data.title}</span>
      <Handle type="source" position={Position.Right} isConnectable={false} className="session-tree__handle" />
      <Handle id="down" type="source" position={Position.Bottom} isConnectable={false} className="session-tree__handle" />
    </div>
  )
})

function SessionLink(props: EdgeProps<LinkEdge>) {
  const { id, source, target, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data } = props
  const kind = data?.kind ?? 'branch'

  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 8
  })

  return (
    <g data-testid="session-tree-link" data-source={source} data-target={target} data-kind={kind}>
      <BaseEdge id={id} path={path} className={`session-tree__link session-tree__link--${kind}`} />
      {kind === 'reset' && (
        // EdgeLabelRenderer portals into the flow's label layer: the react-dom shim's proof.
        <EdgeLabelRenderer>
          <div
            className="session-tree__link-label nodrag nopan"
            data-testid="session-tree-link-label"
            data-link-id={id}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            continued as
          </div>
        </EdgeLabelRenderer>
      )}
    </g>
  )
}

const nodeTypes = { block: SessionBlock }
const edgeTypes = { link: SessionLink }

export function TreeCanvas({ rows }: { rows: readonly SessionRow[] }) {
  const { nodes, edges } = useMemo(() => {
    const links = graphLinks(rows)
    const positions = layoutForest(rows, links)

    const nodes: BlockNode[] = rows.map(row => ({
      id: row.id,
      type: 'block',
      position: positions.get(row.id) ?? { x: 0, y: 0 },
      data: { title: displayTitle(row), row },
      draggable: false,
      connectable: false
    }))

    const edges: LinkEdge[] = links.map(link => ({
      id: link.id,
      source: link.source,
      target: link.target,
      // "Continued as" runs from the predecessor's bottom edge to the successor's top edge.
      ...(link.kind === 'reset' ? { sourceHandle: 'down', targetHandle: 'up' } : {}),
      type: 'link',
      data: { kind: link.kind },
      selectable: false
    }))

    return { nodes, edges }
  }, [rows])

  const openInTab = useCallback((_event: unknown, node: BlockNode) => {
    void host.openSession(node.id, { intent: 'tab' })
  }, [])

  return (
    <div className="session-tree__canvas" data-testid="session-tree-canvas">
      <ReactFlow<BlockNode, LinkEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeDoubleClick={openInTab}
        zoomOnDoubleClick={false}
        nodesConnectable={false}
        fitView
        minZoom={0.3}
        maxZoom={2.5}
        proOptions={{ hideAttribution: true }}
      />
    </div>
  )
}
