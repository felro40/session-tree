/**
 * The Rich cards layer, inside the flow (StyleDefinition.Layer):
 *
 * - the details driver: after every pan / zoom (throttled) and every data change it asks the
 *   details store for the cards in or near the viewport (`nearIds`: the view grown by half its
 *   size on each side); only what is not current goes out, batched;
 * - the singles drawer (R8): a right slide-out list of the sessions without branches, behind a
 *   grip labelled "N unbranched". A row shows title and excerpt; double-click opens it, right-
 *   click gives the session menu (`data-st-node`, the canvas's SessionMenu). Open or closed per
 *   device (the style's panel state). Hidden with Show all (the singles are on the canvas then).
 */
import { Codicon } from '@hermes/plugin-sdk'
import { useStoreApi } from '@xyflow/react'
import { memo, useCallback, useEffect, useMemo, useRef } from 'react'
import type { CSSProperties } from 'react'

import { shortAge } from '../../model/format.ts'
import { singlesInScope } from '../../model/graph.ts'
import type { GraphModel, GraphNode } from '../../model/graph.ts'
import { usePluginCtx } from '../../page/plugin-context.ts'
import { projectColor } from '../shared.tsx'
import type { StyleLayerProps } from '../types.ts'
import { localOffsetMinutes, useDetails, useRichEnv } from './context.tsx'
import { detailsSignature, nearIds } from './details.ts'
import type { Wanted } from './details.ts'
import { FIRST_PROMPT_LABEL } from './rich-flow.tsx'

/** Pan / zoom settle time before the viewport's cards are asked for (a throttle, not a debounce). */
export const VIEWPORT_THROTTLE_MS = 150
/** A drawer row's fixed height: the rows asked for are the ones scrolled into view. */
export const DRAWER_ROW = 62
const DRAWER_SLACK_ROWS = 6

const wanted = (node: GraphNode, nowMs: number): undefined | Wanted =>
  node.row ? { key: node.id, id: node.row.id, profile: node.profile, sig: detailsSignature(node.row, nowMs, localOffsetMinutes(nowMs)) } : undefined

function useViewportDetails({ model, positions, shown, nodeSize, nowMs }: Pick<StyleLayerProps, 'model' | 'nodeSize' | 'nowMs' | 'positions' | 'shown'>) {
  const env = useRichEnv()
  const ctx = usePluginCtx()
  const flow = useStoreApi()
  const latest = useRef({ model, positions, shown, nodeSize, nowMs })
  const timer = useRef<(() => void) | undefined>(undefined)

  const run = useCallback(() => {
    timer.current = undefined

    if (!env) {
      return
    }

    const { model, positions, shown, nodeSize, nowMs } = latest.current
    const { transform, width, height } = flow.getState()
    const rects: [string, { x: number; y: number; width: number; height: number }][] = []

    for (const id of shown) {
      const point = positions.get(id)
      const node = model.nodeById.get(id)

      if (point && node?.kind === 'session' && node.row) {
        rects.push([id, { x: point.x, y: point.y, width: nodeSize.width, height: nodeSize.height }])
      }
    }

    const items = nearIds(rects, { x: transform[0], y: transform[1], zoom: transform[2] }, width, height)
      .map(id => wanted(model.nodeById.get(id)!, nowMs))
      .filter((item): item is Wanted => Boolean(item))

    env.store.want(items)
  }, [env, flow])

  const schedule = useCallback(
    (ms: number) => {
      if (!timer.current) {
        timer.current = ctx.setTimeout(run, ms)
      }
    },
    [ctx, run]
  )

  // New data (a refetch, a drop, Show all): ask again; only changed or new cards go out.
  useEffect(() => {
    latest.current = { model, positions, shown, nodeSize, nowMs }
    schedule(0)
  }, [model, positions, shown, nodeSize, nowMs, schedule])

  useEffect(() => {
    const off = flow.subscribe((state, previous) => {
      if (state.transform !== previous.transform || state.width !== previous.width || state.height !== previous.height) {
        schedule(VIEWPORT_THROTTLE_MS)
      }
    })

    return () => {
      off()
      timer.current?.()
      timer.current = undefined
    }
  }, [flow, schedule])
}

const DrawerRow = memo(function DrawerRow({
  node,
  model,
  selected,
  onSelect,
  onOpen,
  nowMs
}: {
  node: GraphNode
  model: GraphModel
  selected: boolean
  onSelect(id: string): void
  onOpen(node: GraphNode): void
  nowMs: number
}) {
  const entry = useDetails(node.id)
  const row = node.row!
  const project = node.projectId ? model.projects.find(each => each.id === node.projectId) : undefined
  const excerpt = entry?.details?.excerpt
  const preview = row.preview?.trim()

  return (
    <div
      className={`st-rc-single${selected ? ' is-selected' : ''}${node.archived ? ' is-archived' : ''}`}
      data-testid="session-tree-drawer-row"
      data-st-node={node.id}
      data-session-id={row.id}
      title={node.title}
      style={{ height: DRAWER_ROW, '--st-pc': projectColor(project) } as CSSProperties}
      onClick={() => onSelect(node.id)}
      onDoubleClick={() => onOpen(node)}
    >
      <i className="st-rc-single-dot" />
      <span className="st-rc-single-t" data-field="title">
        {node.title}
      </span>
      <span className="st-rc-single-a">{shortAge(row.last_active || row.started_at, nowMs)}</span>
      {!entry ? (
        <span className="st-rc-single-p is-loading" data-testid="session-tree-excerpt" data-loading="true">
          <i className="st-rc-sk" style={{ width: '80%' }} />
        </span>
      ) : excerpt ? (
        <span className="st-rc-single-p" data-testid="session-tree-excerpt" data-kind="last">
          <span data-field="excerpt">{excerpt}</span>
        </span>
      ) : (
        <span className="st-rc-single-p" data-testid="session-tree-excerpt" data-kind={preview ? 'first-prompt' : 'none'}>
          {preview ? (
            <>
              <b data-field="excerpt-label">{FIRST_PROMPT_LABEL}:</b> <span data-field="excerpt">{preview}</span>
            </>
          ) : (
            'No messages to show'
          )}
        </span>
      )}
    </div>
  )
})

function Drawer({ model, open, onPanel, selectedId, onSelect, onOpen, nowMs }: Pick<StyleLayerProps, 'model' | 'nowMs' | 'onOpen' | 'onPanel' | 'onSelect' | 'selectedId'> & { open: boolean }) {
  const env = useRichEnv()
  const list = useRef<HTMLDivElement>(null)
  const singles = useMemo(() => singlesInScope(model), [model])
  const latest = useRef({ singles, nowMs })

  // Only the rows scrolled into view (plus a few) are asked for, and only while it is open.
  const askVisible = useCallback(() => {
    const element = list.current
    const { singles, nowMs } = latest.current

    if (!env || !element || !open) {
      return
    }

    const first = Math.max(0, Math.floor(element.scrollTop / DRAWER_ROW) - DRAWER_SLACK_ROWS)
    const last = Math.min(singles.length, Math.ceil((element.scrollTop + element.clientHeight) / DRAWER_ROW) + DRAWER_SLACK_ROWS)

    env.store.want(
      singles
        .slice(first, last)
        .map(node => wanted(node, nowMs))
        .filter((item): item is Wanted => Boolean(item))
    )
  }, [env, open])

  useEffect(() => {
    latest.current = { singles, nowMs }
    askVisible()
  }, [singles, nowMs, askVisible])

  return (
    <aside
      className={`st-rc-drawer nowheel nopan nodrag${open ? ' is-open' : ''}`}
      data-testid="session-tree-drawer"
      data-open={open ? 'true' : 'false'}
      aria-label="Sessions with no branches"
    >
      <button
        type="button"
        className="st-rc-grip"
        data-testid="session-tree-drawer-grip"
        aria-expanded={open}
        title="Sessions with no branches"
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
        <b data-testid="session-tree-drawer-count">{singles.length}</b> unbranched
        <Codicon name={open ? 'chevron-right' : 'chevron-left'} size={11} />
      </button>
      <div className="st-rc-dr-h">
        Unbranched <small>{singles.length} without branches</small>
      </div>
      <div className="st-rc-dr-list" ref={list} onScroll={askVisible}>
        {singles.map(node => (
          <DrawerRow key={node.id} node={node} model={model} selected={node.id === selectedId} onSelect={onSelect} onOpen={onOpen} nowMs={nowMs} />
        ))}
        {singles.length === 0 && <div className="st-rc-none">No sessions without branches in this scope</div>}
      </div>
    </aside>
  )
}

export function RichLayer(props: StyleLayerProps) {
  useViewportDetails(props)

  return props.showAll ? null : <Drawer {...props} open={props.panelOpen} />
}
