import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { ALL_PROJECTS, buildGraph } from '../../src/model/graph.ts'
import { laidOutFamilies, layoutGraph, rectOf } from '../../src/model/layout.ts'
import type { Point, Rect } from '../../src/model/layout.ts'
import { curvePath, curveRouter, insideRect, orthogonalRoute, pathToSvg, routeLinks, samplePath } from '../../src/model/route.ts'
import type { LinkEnds, Route } from '../../src/model/route.ts'
import { DENSE_HEIGHT, DENSE_WIDTH, denseLayoutSpec, densePorts } from '../../src/styles/dense/spec.ts'
import { loadFixture } from './fixtures.ts'

const block = (x: number, y: number): Rect => ({ x, y, width: DENSE_WIDTH, height: DENSE_HEIGHT })

/** Sampled points of every route that fall inside a block other than the link's own two ends. */
function intrusions(routes: ReadonlyMap<string, Route>, links: readonly LinkEnds[], rects: ReadonlyMap<string, Rect>): string[] {
  const out: string[] = []

  for (const link of links) {
    const samples = samplePath(routes.get(link.id)!.path, 48)

    for (const [id, rect] of rects) {
      if (id === link.source || id === link.target) {
        continue
      }

      const hit = samples.find(point => insideRect(point, rect))

      if (hit) {
        out.push(`${link.id} enters ${id} at ${hit.x.toFixed(1)},${hit.y.toFixed(1)}`)
      }
    }
  }

  return out
}

function linksFor(pairs: [string, string, 'branch' | 'reset'][], rects: ReadonlyMap<string, Rect>): LinkEnds[] {
  return pairs.map(([source, target, kind]) => ({
    id: `${kind}:${source}->${target}`,
    source,
    target,
    ...densePorts(kind, rects.get(source)!, rects.get(target)!)
  }))
}

describe('curve router (Dense, R13)', () => {
  it('keeps the plain bezier when nothing is in the way', () => {
    const rects = new Map([['a', block(0, 0)], ['b', block(300, 60)]])
    const links = linksFor([['a', 'b', 'branch']], rects)
    const routes = routeLinks(links, rects, curveRouter)

    assert.equal(routes.get(links[0].id)!.detoured, false)
    assert.equal(routes.get(links[0].id)!.svg, pathToSvg(curvePath(links[0].from, links[0].to)))
  })

  it('a block dropped onto a link: the link detours and no sampled point enters any other block', () => {
    const rects = new Map([['a', block(0, 0)], ['b', block(500, 0)], ['dropped', block(260, 4)]])
    const links = linksFor([['a', 'b', 'branch']], rects)

    // The live (drag-time) curve does cross the dropped block.
    assert.ok(samplePath(curveRouter.live(links[0].from, links[0].to).path).some(point => insideRect(point, rects.get('dropped')!)))

    const routes = routeLinks(links, rects, curveRouter)

    assert.equal(routes.get(links[0].id)!.detoured, true)
    assert.deepEqual(intrusions(routes, links, rects), [])
  })

  it('other links that now cross the dropped block re-route in the same pass', () => {
    const rects = new Map([
      ['p', block(0, 100)],
      ['k1', block(440, 40)],
      ['k2', block(440, 160)],
      ['far', block(0, 400)],
      ['far-kid', block(440, 400)],
      // Dropped between the parent and its children, across both links.
      ['dropped', block(220, 96)]
    ])
    const links = linksFor(
      [
        ['p', 'k1', 'branch'],
        ['p', 'k2', 'branch'],
        ['far', 'far-kid', 'branch']
      ],
      rects
    )
    const routes = routeLinks(links, rects, curveRouter)

    assert.equal(routes.get('branch:p->k1')!.detoured, true)
    assert.equal(routes.get('branch:p->k2')!.detoured, true)
    assert.equal(routes.get('branch:far->far-kid')!.detoured, false)
    assert.deepEqual(intrusions(routes, links, rects), [])
  })

  it('a block right next to a port still gets a detour, with a tighter clearance', () => {
    const rects = new Map([['a', block(0, 0)], ['b', block(500, 0)], ['dropped', block(200, 4)], ['close', block(320, 22)]])
    const links = linksFor([['a', 'b', 'branch']], rects)
    const routes = routeLinks(links, rects, curveRouter)

    assert.equal(routes.get(links[0].id)!.detoured, true)
    assert.deepEqual(intrusions(routes, links, rects), [])
  })

  it('a "continued as" link (vertical) detours around a block dropped between the two', () => {
    const rects = new Map([['prev', block(0, 0)], ['next', block(0, 200)], ['dropped', block(-40, 90)]])
    const links = linksFor([['prev', 'next', 'reset']], rects)
    const routes = routeLinks(links, rects, curveRouter)

    assert.equal(routes.get(links[0].id)!.detoured, true)
    assert.deepEqual(intrusions(routes, links, rects), [])
  })

  it('on the laid-out fixture: drag a parent far below; its links detour and every link stays clear of every other block', () => {
    const fixture = loadFixture('default')
    const model = buildGraph(fixture.rows, fixture.projects, { profile: 'default', showArchived: false, scope: ALL_PROJECTS })
    const spec = denseLayoutSpec({ showAll: false })
    const positions = new Map(layoutGraph(model, spec).positions)
    const shown = new Set(laidOutFamilies(model, spec).flatMap(family => family.nodeIds))
    const bottom = Math.max(...[...positions.values()].map(point => point.y))

    // Drop st-hp-root under everything, two columns right: its links to its children now run
    // back up and left across other families' blocks.
    positions.set('st-hp-root', { x: 2 * (DENSE_WIDTH + spec.columnGap), y: bottom + 80 })

    const rects = new Map([...positions].filter(([id]) => shown.has(id)).map(([id, point]) => [id, rectOf(id, point, spec)]))
    const links: LinkEnds[] = model.edges
      .filter(edge => rects.has(edge.source) && rects.has(edge.target))
      .map(edge => ({ id: edge.id, source: edge.source, target: edge.target, ...densePorts(edge.kind, rects.get(edge.source)!, rects.get(edge.target)!) }))
    const live = links.find(link => link.id === 'branch:st-hp-root->st-hp-routing')!

    assert.ok(
      samplePath(curveRouter.live(live.from, live.to).path).some(point =>
        [...rects].some(([id, rect]) => id !== live.source && id !== live.target && insideRect(point, rect))
      ),
      'the live curve crosses another block'
    )

    const routes = routeLinks(links, rects, curveRouter)

    assert.equal(routes.get('branch:st-hp-root->st-hp-routing')!.detoured, true)
    assert.deepEqual(intrusions(routes, links, rects), [])
  })

  it('randomised drops: whenever the ports are free, every link ends up clear', () => {
    let seed = 7
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648

      return seed / 2147483648
    }

    for (let round = 0; round < 40; round += 1) {
      const a = block(0, 0)
      const b = block(380 + Math.round(random() * 300), Math.round(random() * 260) - 130)
      const rects = new Map([['a', a], ['b', b]])
      const links = linksFor([['a', 'b', 'branch']], rects)
      const near = (rect: Rect, point: Point) =>
        point.x > rect.x - 30 && point.x < rect.x + rect.width + 30 && point.y > rect.y - 30 && point.y < rect.y + rect.height + 30

      for (let k = 0; k < 3; k += 1) {
        const candidate = block(150 + Math.round(random() * 360), Math.round(random() * 200) - 100)
        const clash = [...rects.values()].some(rect => Math.abs(rect.x - candidate.x) < DENSE_WIDTH + 10 && Math.abs(rect.y - candidate.y) < DENSE_HEIGHT + 10)

        if (!clash && !near(candidate, links[0].from) && !near(candidate, links[0].to)) {
          rects.set(`o${k}`, candidate)
        }
      }

      const routes = routeLinks(links, rects, curveRouter)

      assert.deepEqual(intrusions(routes, links, rects), [], `round ${round}`)
    }
  })
})

describe('orthogonalRoute', () => {
  it('returns null when a port is boxed in', () => {
    const from = { x: 168, y: 13, dir: 'right' as const }
    const to = { x: 500, y: 13, dir: 'left' as const }

    assert.equal(orthogonalRoute(from, to, [block(172, 0)]), null)
  })

  it('leaves along the source port direction and enters along the target port direction', () => {
    const from = { x: 168, y: 13, dir: 'right' as const }
    const to = { x: 500, y: 13, dir: 'left' as const }
    const points = orthogonalRoute(from, to, [block(260, 4)])!

    assert.ok(points[1].x > from.x && points[1].y === from.y)
    assert.ok(points[points.length - 2].x < to.x && points[points.length - 2].y === to.y)
  })
})
