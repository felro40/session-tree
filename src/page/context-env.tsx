/**
 * Card 12: the page's context-estimate store and its React glue. One store per page (above every
 * style and the Dense inspector), so a block, its tooltip and the inspector read the same entry.
 *
 * - `ContextEstimates` creates the store and keeps only the loaded data's blocks in it.
 * - `ContextDriver` (inside the flow, for every style) asks for the blocks in or near the
 *   viewport that have no usable measurement, after every pan / zoom (throttled) and every data
 *   change; only what is not current goes out, batched (≤ 100 ids per request).
 * - `useContextFigure(node)` is a block's figure (`contextFigure`); it re-renders that block only.
 * - `useWantContext(node)` asks for one node's estimate whatever its measurement (the inspector
 *   lists the estimate's categories for the selected session).
 */
import { useStoreApi } from '@xyflow/react'
import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'

import { fetchContext } from '../api.ts'
import { ContextStore, contextFigure, needsEstimate, wantedOf } from '../model/context.ts'
import type { ContextEntry, ContextFigure } from '../model/context.ts'
import type { GraphModel, GraphNode } from '../model/graph.ts'
import type { Point } from '../model/layout.ts'
import { nearIds } from '../styles/rich/details.ts'
import { usePluginCtx } from './plugin-context.ts'

const ContextStoreCtx = createContext<ContextStore | null>(null)

export function useContextStore(): ContextStore | null {
  return useContext(ContextStoreCtx)
}

const NO_SUBSCRIBE = () => () => undefined
const NOTHING = () => undefined

/** This block's estimate entry; re-renders only this block when it changes. */
export function useContextEntry(key: string | undefined): ContextEntry | undefined {
  const store = useContextStore()

  return useSyncExternalStore(
    store && key ? listener => store.subscribe(key, listener) : NO_SUBSCRIBE,
    store && key ? () => store.get(key) : NOTHING,
    NOTHING
  )
}

export function useContextFigure(node: GraphNode): ContextFigure | undefined {
  const entry = useContextEntry(node.id)

  return node.row ? contextFigure(node.row, entry) : undefined
}

/** The store's version (any entry changed): what a scope-wide figure (the Rich scale) follows. */
export function useContextVersion(): number {
  const store = useContextStore()

  return useSyncExternalStore(store ? listener => store.subscribeAll(listener) : NO_SUBSCRIBE, () => store?.version ?? 0, () => 0)
}

/** Asks for `node`'s estimate (the inspector's selection). */
export function useWantContext(node: GraphNode | undefined): void {
  const store = useContextStore()
  const item = node?.kind === 'session' && node.row && 'context_measured' in node.row ? wantedOf(node) : undefined
  const key = item ? `${item.key}\u0000${item.sig}` : ''

  useEffect(() => {
    if (store && item) {
      store.want([item])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the key names the item (node id + signature)
  }, [store, key])
}

export function ContextEstimates({ model, children }: { model: GraphModel | undefined; children: ReactNode }) {
  const ctx = usePluginCtx()
  const [store] = useState(() => new ContextStore((profile, ids) => fetchContext(ctx, profile, ids), { setTimeout: (fn, ms) => ctx.setTimeout(fn, ms), now: () => Date.now() }))

  useEffect(() => {
    store.resume()

    return () => store.dispose()
  }, [store])

  useEffect(() => {
    if (model) {
      store.retain(model.nodes.filter(node => node.kind === 'session').map(node => node.id))
    }
  }, [store, model])

  return <ContextStoreCtx.Provider value={store}>{children}</ContextStoreCtx.Provider>
}

/** Pan / zoom settle time before the viewport's blocks are asked for (a throttle). */
export const CONTEXT_THROTTLE_MS = 150

export function ContextDriver({
  model,
  positions,
  shown,
  nodeSize
}: {
  model: GraphModel
  positions: ReadonlyMap<string, Point>
  shown: ReadonlySet<string>
  nodeSize: { width: number; height: number }
}) {
  const store = useContextStore()
  const ctx = usePluginCtx()
  const flow = useStoreApi()
  const latest = useRef({ model, positions, shown, nodeSize })
  const timer = useRef<(() => void) | undefined>(undefined)

  const run = useCallback(() => {
    timer.current = undefined

    if (!store) {
      return
    }

    const { model, positions, shown, nodeSize } = latest.current
    const { transform, width, height } = flow.getState()
    const rects: [string, { x: number; y: number; width: number; height: number }][] = []

    for (const id of shown) {
      const point = positions.get(id)
      const node = model.nodeById.get(id)

      // R5: a dimmed out-of-scope block shows the same figure; it is asked for like any other.
      if (point && node?.kind === 'session' && node.row && needsEstimate(node.row)) {
        rects.push([id, { x: point.x, y: point.y, width: nodeSize.width, height: nodeSize.height }])
      }
    }

    store.want(nearIds(rects, { x: transform[0], y: transform[1], zoom: transform[2] }, width, height).map(id => wantedOf(model.nodeById.get(id)!)))
  }, [store, flow])

  const schedule = useCallback(
    (ms: number) => {
      if (!timer.current) {
        timer.current = ctx.setTimeout(run, ms)
      }
    },
    [ctx, run]
  )

  useEffect(() => {
    latest.current = { model, positions, shown, nodeSize }
    schedule(0)
  }, [model, positions, shown, nodeSize, schedule])

  useEffect(() => {
    const off = flow.subscribe((state, previous) => {
      if (state.transform !== previous.transform || state.width !== previous.width || state.height !== previous.height) {
        schedule(CONTEXT_THROTTLE_MS)
      }
    })

    return () => {
      off()
      timer.current?.()
      timer.current = undefined
    }
  }, [flow, schedule])

  return null
}
