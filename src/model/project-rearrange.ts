/**
 * Card 10 (L2, A5): what a Re-arrange in a project scope resets. Positions are stored once per
 * style, so a scoped Re-arrange moves only that project's blocks, to the spots a fresh full
 * auto-layout of the current graph (All order: `groupOrder` ignores the scope) gives them, the
 * same spots a Re-arrange in All projects would. Every other block stays where it is.
 *
 * "The project's blocks" are the blocks a project scope shows undimmed (its sessions, and a
 * stand-in parent of one of them) and that project's group labels, continuations included.
 * A key the fresh layout does not place (a single while Show all is off, a continuation label)
 * is forgotten, as a Re-arrange in All forgets it.
 *
 * No React and no SDK in here (unit tests).
 */
import type { GraphModel } from './graph.ts'
import { GROUP_PREFIX, groupKey, labelGroup } from './layout.ts'
import type { LayoutResult, Point } from './layout.ts'
import type { LayoutKeys } from './layout-sync.ts'
import { NO_PROJECT_ID } from './projects.ts'

export interface ProjectReset {
  /** Every layout key of the project: the op touches these and nothing else. */
  keys: string[]
  /** Layout key → its fresh spot (the keys the fresh layout places). */
  spots: Map<string, Point>
  /** The project's blocks on the canvas (labels aside), for the confirm text. */
  blocks: number
}

/** The group label key of a project scope (`__no_project__` is the no-project group). */
export const scopeGroupKey = (scope: string) => groupKey(scope === NO_PROJECT_ID ? undefined : scope)

/**
 * `model` is the scoped graph (its `outOfScope` marks), `fresh` a fresh auto-layout of it
 * (`style.layout(model, undefined, spec)`), `stored` the style's layout by layout key.
 */
export function projectReset(model: GraphModel, scope: string, fresh: LayoutResult, stored: ReadonlyMap<string, Point>, keys: LayoutKeys): ProjectReset {
  const group = scopeGroupKey(scope)
  const ids = model.nodes.filter(node => !node.outOfScope && (node.kind === 'session' || node.kind === 'standin')).map(node => node.id)
  const inGroup = (key: string) => key.startsWith(GROUP_PREFIX) && labelGroup(key) === group
  const out = new Set<string>(ids.map(id => keys.toStore(id)))

  for (const key of [...stored.keys(), ...fresh.positions.keys()]) {
    if (inGroup(key)) {
      out.add(key)
    }
  }

  const spots = new Map<string, Point>()

  for (const [id, point] of fresh.positions) {
    const key = id.startsWith(GROUP_PREFIX) ? id : keys.toStore(id)

    if (out.has(key)) {
      spots.set(key, { x: point.x, y: point.y })
    }
  }

  const blocks = ids.filter(id => fresh.positions.has(id)).length

  return { keys: [...out], spots, blocks }
}
