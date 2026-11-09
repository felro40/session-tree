/** Shared block pieces: invisible link handles at fixed positions, and the project group label. */
import { Codicon } from '@hermes/plugin-sdk'
import { Handle, Position } from '@xyflow/react'
import type { Node, NodeProps } from '@xyflow/react'
import { memo } from 'react'
import type { CSSProperties } from 'react'

import type { ProjectInfo } from '../model/projects.ts'
import type { GroupLabelData } from './types.ts'

/**
 * Handles at the same spots the style's `ports` use. Links compute their own geometry from the
 * block rectangles; the handles only keep React Flow's edge bookkeeping satisfied.
 */
export function BlockHandles({ resetX }: { resetX: number }) {
  return (
    <>
      <Handle type="target" position={Position.Left} isConnectable={false} className="session-tree__handle" />
      <Handle
        id="up"
        type="target"
        position={Position.Top}
        isConnectable={false}
        className="session-tree__handle"
        style={{ left: resetX }}
      />
      <Handle type="source" position={Position.Right} isConnectable={false} className="session-tree__handle" />
      <Handle
        id="down"
        type="source"
        position={Position.Bottom}
        isConnectable={false}
        className="session-tree__handle"
        style={{ left: resetX }}
      />
    </>
  )
}

/** React Flow handle descriptors matching `BlockHandles`, so edges draw before any DOM measure. */
export function blockHandles(width: number, height: number, resetX: number) {
  return [
    { type: 'target' as const, position: Position.Left, x: 0, y: height / 2, width: 1, height: 1 },
    { id: 'up', type: 'target' as const, position: Position.Top, x: resetX, y: 0, width: 1, height: 1 },
    { type: 'source' as const, position: Position.Right, x: width - 1, y: height / 2, width: 1, height: 1 },
    { id: 'down', type: 'source' as const, position: Position.Bottom, x: resetX, y: height - 1, width: 1, height: 1 }
  ]
}

/** The PROJECTS pane's project glyph: a colour dot, or the project's icon tinted by its colour. */
export function ProjectGlyph({ project, size = 12 }: { project?: ProjectInfo; size?: number }) {
  if (!project) {
    return <span className="session-tree__glyph-dot session-tree__glyph-dot--none" aria-hidden="true" />
  }

  if (project.color && !project.icon) {
    return <span className="session-tree__glyph-dot" aria-hidden="true" style={{ backgroundColor: project.color }} />
  }

  return (
    <Codicon
      name={project.icon || (project.isNoProject ? 'home' : project.isAuto ? 'repo' : 'folder-library')}
      size={size}
      className="session-tree__glyph-icon"
      style={project.color ? { color: project.color } : undefined}
    />
  )
}

/** A project's colour for block edges; theme fallback when the project has none. */
export const projectColor = (project?: ProjectInfo): string => project?.color || 'var(--ui-text-quaternary)'

export type GroupLabelNode = Node<GroupLabelData, 'group'>

export const GroupLabel = memo(function GroupLabel({ data }: NodeProps<GroupLabelNode>) {
  return (
    <div
      className={`session-tree__group-label${data.dimmed ? ' is-dimmed' : ''}`}
      data-testid="session-tree-group-label"
      data-project-id={data.project?.id ?? ''}
      style={{ '--st-pc': projectColor(data.project) } as CSSProperties}
    >
      <ProjectGlyph project={data.project} size={11} />
      <span>{data.label}</span>
    </div>
  )
})
