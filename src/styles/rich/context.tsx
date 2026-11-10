/**
 * The Rich cards canvas context: the details store (excerpts, activity) and the token scale. Its
 * `Provider` wraps the canvas (StyleDefinition.Provider), so cards read it without any of it going
 * through the graph model, the block data or the routing chain: details arriving re-render the
 * card that asked, never the canvas, the layout or the links.
 */
import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'

import { fetchDetails } from '../../api.ts'
import type { GraphModel } from '../../model/graph.ts'
import { usePluginCtx } from '../../page/plugin-context.ts'
import { DetailsStore } from './details.ts'
import type { DetailsEntry } from './details.ts'
import { maxTokensInScope } from './spec.ts'

export interface RichEnv {
  store: DetailsStore
  /** The largest session's tokens in the current scope (the token bars' scale). */
  maxTokens: number
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
  const maxTokens = useMemo(() => maxTokensInScope(model), [model])
  const value = useMemo<RichEnv>(() => ({ store, maxTokens }), [store, maxTokens])

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
