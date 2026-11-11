/**
 * The Subway layer, inside the flow (StyleDefinition.Layer):
 *
 * - the label driver: places every shown station's label from the committed positions
 *   (`placeLabels`; the stations and the project labels are what a label must not cover) and hands
 *   the spots to the label store, which re-renders only the stations whose spot changed;
 * - the map key, in the bottom-right corner;
 * - the depot (R8): a bottom strip of the sessions without branches, stations on a dotted track.
 *   Double-click opens one, right-click gives the session menu (`data-st-node`, the canvas's
 *   SessionMenu). Open or folded per device (the style's panel state); hidden with Show all (the
 *   singles are on the canvas then).
 */
import { useLayoutEffect, useMemo } from 'react'
import type { CSSProperties, WheelEvent } from 'react'

import { shortAge } from '../../model/format.ts'
import { singlesInScope } from '../../model/graph.ts'
import type { GraphModel, GraphNode } from '../../model/graph.ts'
import { GROUP_PREFIX, LABEL_WIDTH } from '../../model/layout.ts'
import type { Point, Rect } from '../../model/layout.ts'
import { projectColor } from '../shared.tsx'
import type { StyleLayerProps } from '../types.ts'
import { useSubwayEnv } from './context.tsx'
import { placeLabels } from './labels.ts'
import { GROUP_LABEL_H } from './spec.ts'

function useLabelDriver({ positions, shown }: Pick<StyleLayerProps, 'positions' | 'shown'>) {
  const env = useSubwayEnv()
  const placements = useMemo(() => {
    const stations = new Map<string, Point>()
    const blocked: Rect[] = []

    for (const [id, point] of positions) {
      if (id.startsWith(GROUP_PREFIX)) {
        blocked.push({ x: point.x, y: point.y, width: LABEL_WIDTH, height: GROUP_LABEL_H })
      } else if (shown.has(id)) {
        stations.set(id, point)
      }
    }

    return placeLabels(stations, blocked)
  }, [positions, shown])

  useLayoutEffect(() => {
    env?.labels.set(placements)
  }, [env, placements])
}

function MapKey({ depot }: { depot: 'folded' | 'none' | 'open' }) {
  return (
    <div className={`st-sw-key nowheel nopan nodrag is-depot-${depot}`} data-testid="session-tree-map-key" aria-label="Map key">
      <b>Map key</b>
      <div data-key="line">
        <svg width="34" height="10" aria-hidden="true">
          <path d="M2 5 H32" className="st-sw-key-line" />
        </svg>
        line = conversation lineage
      </div>
      <div data-key="split">
        <svg width="34" height="14" aria-hidden="true">
          <path d="M2 4 H32" className="st-sw-key-line" />
          <path d="M8 4 L16 12 H32" className="st-sw-key-line is-split" />
        </svg>
        split = /branch
      </div>
      <div data-key="planned">
        <svg width="34" height="10" aria-hidden="true">
          <path d="M2 5 H32" className="st-sw-key-line is-planned" />
        </svg>
        dotted = continued as (/new)
      </div>
      <div data-key="capsule">
        <span className="st-sw-key-capsule">×3</span>
        capsule = compacted
      </div>
      <div data-key="standin">
        <span className="st-sw-key-hollow" />
        dashed = parent not loaded
      </div>
      <div data-key="status">
        <span className="st-sw-key-ring is-run" />
        pulse running · <span className="st-sw-key-ring is-ask" /> amber needs input
      </div>
    </div>
  )
}

function DepotRow({ node, model, selected, onSelect, onOpen, nowMs }: { node: GraphNode; model: GraphModel; selected: boolean; onSelect(id: string): void; onOpen(node: GraphNode): void; nowMs: number }) {
  const row = node.row!
  const project = node.projectId ? model.projects.find(each => each.id === node.projectId) : undefined

  return (
    <div
      className={`st-sw-depot-row${selected ? ' is-selected' : ''}${node.archived ? ' is-archived' : ''}`}
      data-testid="session-tree-depot-row"
      data-st-node={node.id}
      data-session-id={row.id}
      title={node.title}
      style={{ '--st-pc': projectColor(project) } as CSSProperties}
      onClick={() => onSelect(node.id)}
      onDoubleClick={() => onOpen(node)}
    >
      <i className="st-sw-depot-dot" />
      <span className="st-sw-depot-t" data-field="title">
        {node.title}
      </span>
      <span className="st-sw-depot-m">
        {shortAge(row.last_active || row.started_at, nowMs)} · {project?.label ?? 'Home'}
      </span>
    </div>
  )
}

function Depot({ model, open, onPanel, selectedId, onSelect, onOpen, nowMs }: Pick<StyleLayerProps, 'model' | 'nowMs' | 'onOpen' | 'onPanel' | 'onSelect' | 'selectedId'> & { open: boolean }) {
  const singles = useMemo(() => singlesInScope(model), [model])

  // The plain wheel scrolls the strip sideways (it never zooms the canvas: `nowheel`).
  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
      event.currentTarget.scrollLeft += event.deltaY
    }
  }

  return (
    <section className={`st-sw-depot nowheel nopan nodrag${open ? ' is-open' : ''}`} data-testid="session-tree-depot" data-open={open ? 'true' : 'false'} aria-label="Depot: sessions with no branches">
      <button
        type="button"
        className="st-sw-depot-h"
        data-testid="session-tree-depot-toggle"
        aria-expanded={open}
        onMouseDown={event => {
          // Never focus (Space pans), never start a pane gesture.
          event.preventDefault()
          event.stopPropagation()
        }}
        onDoubleClick={event => event.stopPropagation()}
        onClick={event => {
          event.stopPropagation()
          onPanel(!open)
        }}
      >
        {open ? '▾' : '▸'} Depot · <b data-testid="session-tree-depot-count">{singles.length}</b> single session{singles.length === 1 ? '' : 's'} (no branches)
      </button>
      {open && (
        <div className="st-sw-depot-track" onWheel={onWheel}>
          {singles.map(node => (
            <DepotRow key={node.id} node={node} model={model} selected={node.id === selectedId} onSelect={onSelect} onOpen={onOpen} nowMs={nowMs} />
          ))}
          {singles.length === 0 && <span className="st-sw-depot-none">No sessions without branches in this scope</span>}
        </div>
      )}
    </section>
  )
}

export function SubwayLayer(props: StyleLayerProps) {
  useLabelDriver(props)

  return (
    <>
      <MapKey depot={props.showAll ? 'none' : props.panelOpen ? 'open' : 'folded'} />
      {!props.showAll && <Depot {...props} open={props.panelOpen} />}
    </>
  )
}
