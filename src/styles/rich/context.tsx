/**
 * The Rich cards canvas context: the details store (excerpts, activity) and the context bar's
 * scale. Its `Provider` wraps the canvas (StyleDefinition.Provider), so cards read it without any
 * of it going through the graph model, the block data or the routing chain: details arriving
 * re-render the card that asked, never the canvas, the layout or the links.
 */
import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'

import { fetchDetails } from '../../api.ts'
import { contextFigure } from '../../model/context.ts'
import type { GraphModel } from '../../model/graph.ts'
import { useContextStore, useContextVersion } from '../../page/context-env.tsx'
import { usePluginCtx } from '../../page/plugin-context.ts'
import { DetailsStore } from './details.ts'
import type { DetailsEntry } from './details.ts'
import { ScopeScaleMemory } from './spec.ts'

export interface RichEnv {
  store: DetailsStore
  /**
   * Card 12 (A2), fix r1 (D1): the largest context figure over every in-scope session (the
   * context bars' scale when the model's window is unknown), whatever is in the viewport.
   */
  maxTokens: number
  /** Fix r1 (D3): not every in-scope figure has settled yet; the scope-scaled bars are unfilled. */
  pending: boolean
}

const RichEnvCtx = createContext<null | RichEnv>(null)

export function useRichEnv(): null | RichEnv {
  return useContext(RichEnvCtx)
}

/** Minutes to add to UTC for local time now (the activity's day boundaries). */
export const localOffsetMinutes = (ms: number = Date.now()) => -new Date(ms).getTimezoneOffset()

const NO_SUBSCRIBE = () => () => undefined
const NOTHING = () => undefined

/** This card's details entry; re-renders only this card when it changes. */
export function useDetails(id: string | undefined): DetailsEntry | undefined {
  const env = useRichEnv()
  const store = env?.store

  return useSyncExternalStore(
    store && id ? listener => store.subscribe(id, listener) : NO_SUBSCRIBE,
    store && id ? () => store.get(id) : NOTHING,
    NOTHING
  )
}

export function RichProvider({ model, children }: { model: GraphModel; children: ReactNode }) {
  const ctx = usePluginCtx()
  const [store] = useState(
    () =>
      new DetailsStore(
        (profile, ids, tz) => fetchDetails(ctx, profile, ids, tz),
        { setTimeout: (fn, ms) => ctx.setTimeout(fn, ms), now: () => Date.now() },
        () => localOffsetMinutes()
      )
  )
  const contexts = useContextStore()
  const version = useContextVersion()
  // Fix r1 (D3): the last settled contributions, so a row being refetched keeps its old value.
  const [memory] = useState(() => new ScopeScaleMemory())
  const scale = useMemo(
    () => memory.update(model, node => (node.row ? contextFigure(node.row, contexts?.get(node.id)) : undefined)),
    // The version is the context store's change signal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [memory, model, contexts, version]
  )
  const pending = scale.pending
  const maxTokens = scale.max
  const value = useMemo<RichEnv>(() => ({ store, maxTokens, pending }), [store, maxTokens, pending])

  useEffect(() => {
    store.resume()

    return () => store.dispose()
  }, [store])

  // Card 7 (card-6 review r1 N5): the cache holds only the sessions of the loaded data (a
  // deleted session, another profile's, a refetch without it: dropped).
  useEffect(() => {
    store.retain(model.nodes.filter(node => node.kind === 'session').map(node => node.id))
  }, [store, model])

  return <RichEnvCtx.Provider value={value}>{children}</RichEnvCtx.Provider>
}
