/**
 * The Subway canvas context (card 7): the model (for the track plan) and the label store. The
 * layer places the labels from the committed positions (`labels.ts`) and writes them here; each
 * station reads its own label spot, so a placement re-renders the stations whose spot changed,
 * never the canvas, the layout or the links. While a station is dragged its label keeps its spot
 * (it moves with the station) until the drop.
 */
import { createContext, useContext, useMemo, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'

import type { GraphModel } from '../../model/graph.ts'
import type { PlacedLabel } from './labels.ts'
import { subwayPlan } from './plan.ts'
import type { SubwayPlan } from './plan.ts'

export class LabelStore {
  private spots = new Map<string, PlacedLabel>()
  private readonly listeners = new Map<string, Set<() => void>>()

  get(id: string): PlacedLabel | undefined {
    return this.spots.get(id)
  }

  /** Replaces every spot; notifies the stations whose spot changed (or appeared, or went). */
  set(next: ReadonlyMap<string, PlacedLabel>): string[] {
    const changed: string[] = []

    for (const [id, label] of next) {
      const before = this.spots.get(id)

      if (!before || before.spot !== label.spot || before.clear !== label.clear) {
        changed.push(id)
      }
    }

    for (const id of this.spots.keys()) {
      if (!next.has(id)) {
        changed.push(id)
      }
    }

    this.spots = new Map(next)

    for (const id of changed) {
      for (const listener of [...(this.listeners.get(id) ?? [])]) {
        listener()
      }
    }

    return changed
  }

  subscribe(id: string, listener: () => void): () => void {
    let set = this.listeners.get(id)

    if (!set) {
      set = new Set()
      this.listeners.set(id, set)
    }

    set.add(listener)

    return () => {
      set.delete(listener)

      if (set.size === 0) {
        this.listeners.delete(id)
      }
    }
  }
}

export interface SubwayEnv {
  model: GraphModel
  plan: () => SubwayPlan
  labels: LabelStore
}

const SubwayCtx = createContext<null | SubwayEnv>(null)

export function useSubwayEnv(): null | SubwayEnv {
  return useContext(SubwayCtx)
}

const NO_SUBSCRIBE = () => () => undefined
const NOTHING = () => undefined

/** This station's label spot; re-renders only this station when it changes. */
export function useLabelSpot(id: string): PlacedLabel | undefined {
  const store = useSubwayEnv()?.labels

  return useSyncExternalStore(store ? listener => store.subscribe(id, listener) : NO_SUBSCRIBE, store ? () => store.get(id) : NOTHING, NOTHING)
}

/** Mounted for every style (the canvas's StyleProviders): cheap; the plan is computed on demand. */
export function SubwayProvider({ model, children }: { model: GraphModel; children: ReactNode }) {
  const [labels] = useState(() => new LabelStore())
  const value = useMemo<SubwayEnv>(() => ({ model, plan: () => subwayPlan(model), labels }), [model, labels])

  return <SubwayCtx.Provider value={value}>{children}</SubwayCtx.Provider>
}
