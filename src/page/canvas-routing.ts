/**
 * The canvas shell's routing chain (card-5 review r2, B1-r2): which blocks are on the canvas,
 * their rectangles (the router's obstacles), the structural link ends, and every link routed on
 * drop (R13). `graph-canvas.tsx` holds one per mounted canvas and asks it for the current
 * routing on every render; each stage reruns only when one of its own inputs is a new object,
 * and keeps its previous output (the same object) when the new one is equal:
 *
 * - `shown`: a framed style's shown set as given (the frame cache keeps it stable), else the
 *   laid-out families' blocks from the model; an equal set keeps the previous one.
 * - `rects`: from `shown`, the positions and the spec, built in block-id order; equal
 *   rectangles keep the previous map.
 * - `links`: per link whose two blocks have a rectangle, its edge id, source, target and kind
 *   (all the router and the style's ports read from the model), sorted by edge id; the same set
 *   keeps the previous array, in whatever order the model lists its edges (B1-r3).
 * - `routes`: `routeLinks` over `links` and `rects` with the style's ports and router. It never
 *   keys on the model, and both its inputs are in id order, never row order. So a refetch that
 *   only changes block content (message count, tokens, last used, title, status) does not
 *   re-route, also when the backend's `last_active` sort moves the changed row (and its edge) to
 *   the front, and a reorder of the rows alone re-routes nothing. A real structural change (a
 *   block added, removed or moved, a new link) re-routes once.
 *
 * Pure (no React): node:test drives the same object the canvas uses.
 */
import type { EdgeKind, GraphModel } from '../model/graph.ts'
import { laidOutFamilies, rectOf } from '../model/layout.ts'
import type { LayoutSpec, Point, Rect } from '../model/layout.ts'
import { routeLinks } from '../model/route.ts'
import type { LinkRouter, Port } from '../model/route.ts'
import type { RoutedLink } from '../styles/types.ts'

/** What the router and the style's ports read of one link. */
export interface LinkEnd {
  id: string
  source: string
  target: string
  kind: EdgeKind
}

export type PortsOf = (kind: EdgeKind, source: Rect, target: Rect) => { from: Port; to: Port }

export interface RoutingInput {
  model: GraphModel
  spec: LayoutSpec
  /** A framed style's shown set (Swimlanes); absent: the laid-out families' blocks. */
  frameShown?: ReadonlySet<string>
  positions: ReadonlyMap<string, Point>
  ports: PortsOf
  router: LinkRouter
}

export interface Routing {
  shown: ReadonlySet<string>
  rects: ReadonlyMap<string, Rect>
  links: readonly LinkEnd[]
  routes: ReadonlyMap<string, RoutedLink>
}

export interface CanvasRouting {
  get(input: RoutingInput): Routing
  /** How many times `routeLinks` ran (tests and diagnostics). */
  readonly routed: number
}

const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>) => a === b || (a.size === b.size && [...a].every(each => b.has(each)))

function sameRects(a: ReadonlyMap<string, Rect>, b: ReadonlyMap<string, Rect>): boolean {
  if (a.size !== b.size) {
    return false
  }

  for (const [id, rect] of a) {
    const other = b.get(id)

    if (!other || other.x !== rect.x || other.y !== rect.y || other.width !== rect.width || other.height !== rect.height) {
      return false
    }
  }

  return true
}

/** Plain code-unit order (the same in Node and every browser). */
const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/** Both lists come sorted by id (the links stage), so in-order equality is set equality. */
const sameLinks = (a: readonly LinkEnd[], b: readonly LinkEnd[]) =>
  a.length === b.length && a.every((end, i) => end.id === b[i].id && end.source === b[i].source && end.target === b[i].target && end.kind === b[i].kind)

/** One stage: reruns when a dependency is a new object; an equal result keeps the old one. */
function stage<T>(same: (a: T, b: T) => boolean) {
  let deps: readonly unknown[] | undefined
  let value: T

  return (next: readonly unknown[], compute: () => T): T => {
    if (deps && deps.length === next.length && deps.every((each, i) => each === next[i])) {
      return value
    }

    const fresh = compute()

    value = deps && same(value, fresh) ? value : fresh
    deps = next

    return value
  }
}

export function createCanvasRouting(): CanvasRouting {
  let routed = 0
  const shownStage = stage<ReadonlySet<string>>(sameSet)
  const rectsStage = stage<ReadonlyMap<string, Rect>>(sameRects)
  const linksStage = stage<readonly LinkEnd[]>(sameLinks)
  const routesStage = stage<ReadonlyMap<string, RoutedLink>>(() => false)

  return {
    get routed() {
      return routed
    },

    get({ model, spec, frameShown, positions, ports, router }) {
      const shown = frameShown
        ? shownStage([frameShown], () => frameShown)
        : shownStage([model, spec], () => new Set(laidOutFamilies(model, spec).flatMap(family => family.nodeIds)))

      const rects = rectsStage([shown, positions, spec], () => {
        const out = new Map<string, Rect>()

        // By id (B1-r3): the router's obstacle list follows this map's order, so the same blocks
        // in any order give the same routes.
        for (const id of [...shown].sort(byId)) {
          const point = positions.get(id)

          if (point) {
            out.set(id, rectOf(id, point, spec))
          }
        }

        return out
      })

      // Sorted by edge id (B1-r3): `model.edges` follows the row order, which the backend sorts
      // by `last_active`, so a chat turn in a branched session moves its edge to the front. The
      // same set in another order is then the same list, and keeps the previous array.
      const links = linksStage([model, rects], () =>
        model.edges
          .filter(edge => rects.has(edge.source) && rects.has(edge.target))
          .map(edge => ({ id: edge.id, source: edge.source, target: edge.target, kind: edge.kind }))
          .sort((a, b) => byId(a.id, b.id))
      )

      // R13 on drop: every link against every other block, from the committed positions. While a
      // block is dragged its links no longer match these ends and draw live instead.
      const routes = routesStage([links, rects, ports, router], () => {
        routed += 1
        const ends = links.map(link => ({ id: link.id, source: link.source, target: link.target, ...ports(link.kind, rects.get(link.source)!, rects.get(link.target)!) }))
        const out = new Map<string, RoutedLink>()
        const done = routeLinks(ends, rects, router)

        for (const end of ends) {
          out.set(end.id, { from: end.from, to: end.to, route: done.get(end.id)! })
        }

        return out
      })

      return { shown, rects, links, routes }
    }
  }
}
