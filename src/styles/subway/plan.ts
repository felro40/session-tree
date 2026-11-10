/**
 * The Subway map's track plan (pure; card 7): which line every station is on, and which port each
 * link leaves its parent by. From the model's structure alone (never positions or row content), so
 * the auto-layout, the routing chain's slots and the drawn colours always agree.
 *
 * - A station's *row children* are its "continued as" successors, then its `/branch` children
 *   (each by creation time). The first row child continues on the station's row (the right
 *   port); every other one drops below (a split, the bottom port at its own slot).
 * - A track is a line: a tree root starts one, a `/branch` child that is its parent's first row
 *   child continues its parent's, and every other child starts a new one (the line splitting
 *   into a new track). A successor's tree is a line of its own, joined by the dotted "planned
 *   line" (not a track). So a family has 1 + (its splits) tracks, plus one per successor tree.
 */
import type { GraphModel } from '../../model/graph.ts'

export interface SubwayPlan {
  /** Per station: successors, then branch children (family members, by creation time). */
  rowKids: ReadonlyMap<string, readonly string[]>
  /** Edge id → departure slot (0: continues the row; 1, 2, …: the splits, top to bottom). */
  slots: ReadonlyMap<string, number>
  /** Station → its track's id (`<family>#<ordinal>`) and ordinal within its family (the shade). */
  track: ReadonlyMap<string, { id: string; ordinal: number }>
  /** Tracks over the families with more than one station (those on the canvas without Show all). */
  trackCount: number
  /** Family → its roots in placement order (a tree root with no predecessor first). */
  roots: ReadonlyMap<string, readonly string[]>
}

const cache = new WeakMap<GraphModel, SubwayPlan>()

const byCreated = (model: GraphModel) => (a: string, b: string) =>
  (model.nodeById.get(a)?.createdAt ?? 0) - (model.nodeById.get(b)?.createdAt ?? 0) || (a < b ? -1 : a > b ? 1 : 0)

/** The plan for `model`, computed once per model object. */
export function subwayPlan(model: GraphModel): SubwayPlan {
  let plan = cache.get(model)

  if (!plan) {
    plan = buildPlan(model)
    cache.set(model, plan)
  }

  return plan
}

/** `StyleDefinition.linkSlots`. */
export const subwaySlots = (model: GraphModel): ReadonlyMap<string, number> => subwayPlan(model).slots

function buildPlan(model: GraphModel): SubwayPlan {
  const order = byCreated(model)
  const rowKids = new Map<string, string[]>()
  const slots = new Map<string, number>()
  const track = new Map<string, { id: string; ordinal: number }>()
  const roots = new Map<string, string[]>()
  const edgeId = new Map(model.edges.map(edge => [`${edge.source}\u0000${edge.target}`, edge.id]))
  let trackCount = 0

  for (const family of model.families) {
    const members = new Set(family.nodeIds)
    let ordinal = 0

    for (const id of family.nodeIds) {
      const successors = (model.continuedAs.get(id) ?? []).filter(kid => members.has(kid)).sort(order)
      const children = (model.childrenOf.get(id) ?? []).filter(kid => members.has(kid)).sort(order)
      const kids = [...successors, ...children]

      rowKids.set(id, kids)
      kids.forEach((kid, index) => {
        const edge = edgeId.get(`${id}\u0000${kid}`)

        if (edge) {
          slots.set(edge, index)
        }
      })
    }

    const isRoot = (id: string) => !(model.parentOf.has(id) && members.has(model.parentOf.get(id)!)) && !(model.continuedFrom.has(id) && members.has(model.continuedFrom.get(id)!))
    const familyRoots = family.nodeIds.filter(isRoot).sort(order)
    const seen = new Set<string>()
    const walk = (id: string, own: { id: string; ordinal: number }) => {
      seen.add(id)
      track.set(id, own)

      for (const [index, kid] of (rowKids.get(id) ?? []).entries()) {
        if (seen.has(kid)) {
          continue
        }

        // Only a branch child that is the first row child stays on its parent's line.
        const continues = index === 0 && model.parentOf.get(kid) === id

        walk(kid, continues ? own : { id: `${family.id}#${(ordinal += 1)}`, ordinal })
      }
    }

    // Anything not reached from a root (a malformed cycle) starts its own line, oldest first.
    let first = true

    for (const id of [...familyRoots, ...[...family.nodeIds].sort(order)]) {
      if (seen.has(id)) {
        continue
      }

      walk(id, first ? { id: `${family.id}#0`, ordinal: 0 } : { id: `${family.id}#${(ordinal += 1)}`, ordinal })
      first = false

      if (!familyRoots.includes(id)) {
        familyRoots.push(id)
      }
    }

    roots.set(family.id, familyRoots)

    if (family.nodeIds.length > 1) {
      trackCount += new Set(family.nodeIds.map(id => track.get(id)!.id)).size
    }
  }

  return { rowKids, slots, track, trackCount, roots }
}
