import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { ALL_PROJECTS, buildGraph } from '../../src/model/graph.ts'
import type { GraphModel } from '../../src/model/graph.ts'
import { NO_PROJECT_ID } from '../../src/model/projects.ts'
import type { SessionRow } from '../../src/model/sessions.ts'
import { browserOffsetAt } from '../../src/page/frame-cache.ts'
import { fitSwimlanes, layoutSwimlanes, localCalendar, localDay, swimNowX } from '../../src/styles/swimlanes/layout.ts'
import type { SwimInput, SwimLayout } from '../../src/styles/swimlanes/layout.ts'
import {
  CHILD_GAP,
  CHIP_GAP,
  DAY_WIDTH,
  EARLIER_GAP,
  EARLIER_WIDTH,
  GHOST_GAP,
  HEADER_WIDTH,
  LANE_COLLAPSED_HEIGHT,
  popoverPlacement,
  SWIM_HEIGHT,
  SWIM_WIDTH,
  swimPorts,
  tokenLabel,
  WINDOW_DAYS
} from '../../src/styles/swimlanes/spec.ts'
import { loadFixture, project, row } from './fixtures.ts'

const DAY = 86_400
const HOUR = 3600

/** "Now" for a captured fixture: just after its most recent activity (the capture time). */
function fixtureNow(rows: readonly SessionRow[]): number {
  return Math.ceil(Math.max(...rows.map(each => each.last_active ?? 0), ...rows.map(each => each.started_at ?? 0)) + 60) * 1000
}

function layout(model: GraphModel, extra: Partial<SwimInput> = {}): SwimLayout {
  return layoutSwimlanes({ model, showAll: false, collapsed: new Set(), nowMs: 1_800_000_000_000, tzOffsetMinutes: 0, ...extra })
}

const options = (scope = ALL_PROJECTS) => ({ profile: 'default', showArchived: false, scope })

/** The invariants every layout must hold (coder acceptance, card 5). */
function assertInvariants(model: GraphModel, out: SwimLayout): { shown: number; rows: number; clamped: number } {
  const shown = [...out.shown].map(id => out.boxes.get(id)!)

  // No two shown blocks overlap.
  for (let i = 0; i < shown.length; i += 1) {
    for (let j = i + 1; j < shown.length; j += 1) {
      const a = shown[i]
      const b = shown[j]
      const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

      assert.ok(!overlap, `${a.id} overlaps ${b.id}`)
    }
  }

  // Every shown block sits inside its lane (a ghost inside the scoped lane).
  for (const box of shown) {
    const laneKey = box.zone === 'ghost' ? model.options.scope : box.lane
    const lane = out.lanes.find(each => each.key === laneKey)

    assert.ok(lane, `${box.id}: no lane ${laneKey}`)
    assert.ok(!lane.collapsed, `${box.id} shown in a collapsed lane`)
    assert.ok(box.y >= lane.top && box.y + box.height <= lane.top + lane.height, `${box.id} (${box.y}) outside lane ${lane.key} (${lane.top}..${lane.top + lane.height})`)
  }

  // Every child is to the right of its parent (branch parent or "continued as" predecessor),
  // across lanes too, for every block with an x (shown or an activity mark).
  for (const edge of model.edges) {
    const parent = out.boxes.get(edge.source)
    const child = out.boxes.get(edge.target)

    if (parent && child && parent.zone !== 'ghost' && child.zone !== 'ghost') {
      assert.ok(child.x >= parent.x + parent.width, `${edge.target} (x ${child.x}) is not right of its parent ${edge.source} (x ${parent.x})`)
    }
  }

  // x follows the start time within each row, except the right-of-parent clamp. Stand-ins and
  // ghosts have no time of their own (placed by their child / at the lane's left edge).
  const rows = new Map<string, typeof shown>()

  for (const box of shown) {
    if (box.zone === 'standin' || box.zone === 'ghost') {
      continue
    }

    const key = `${box.lane}#${box.row}`

    rows.set(key, [...(rows.get(key) ?? []), box])
  }

  for (const [key, boxes] of rows) {
    boxes.sort((a, b) => a.x - b.x)

    for (let i = 1; i < boxes.length; i += 1) {
      const before = boxes[i - 1]
      const after = boxes[i]
      const timeBefore = before.time ?? -Infinity
      const timeAfter = after.time ?? -Infinity

      assert.ok(
        timeAfter >= timeBefore || before.clamped || after.clamped,
        `row ${key}: ${after.id} (t ${timeAfter}) right of ${before.id} (t ${timeBefore}) without a clamp`
      )
    }
  }

  // The clamp is exactly: placed just right of the parent, later than its own time would put it.
  for (const id of out.clamped) {
    const box = out.boxes.get(id)!
    const parentId = model.parentOf.get(id) ?? model.continuedFrom.get(id)
    const parent = out.boxes.get(parentId!)!

    if (parent.zone !== 'ghost') {
      assert.equal(box.x, parent.x + SWIM_WIDTH + CHILD_GAP, `${id} clamp position`)
    }
  }

  return { shown: shown.length, rows: rows.size, clamped: out.clamped.size }
}

describe('Swimlanes layout on the fixtures', () => {
  const fixture = loadFixture('default')
  const nowMs = fixtureNow(fixture.rows)
  const model = buildGraph(fixture.rows, fixture.projects, options())

  for (const tz of [0, 60, -300, 330]) {
    it(`holds every invariant (all projects, tz ${tz} min), Show all off and on`, () => {
      const off = assertInvariants(model, layout(model, { nowMs, tzOffsetMinutes: tz }))
      const on = assertInvariants(model, layout(model, { nowMs, tzOffsetMinutes: tz, showAll: true }))

      assert.ok(off.shown >= 15, `only ${off.shown} blocks shown`)
      assert.ok(on.shown > off.shown + 20, 'Show all did not put the singles on the axis')
    })
  }

  it('is deterministic: the same inputs give byte-identical output, also from shuffled rows', () => {
    const a = layout(model, { nowMs, showAll: true })
    const b = layout(model, { nowMs, showAll: true })
    const shuffled = buildGraph([...fixture.rows].reverse(), fixture.projects, options())
    const c = layout(shuffled, { nowMs, showAll: true })
    const plain = (out: SwimLayout) => JSON.stringify({ boxes: [...out.boxes.values()].sort((p, q) => (p.id < q.id ? -1 : 1)), lanes: out.lanes, ticks: out.ticks, nowX: out.nowX })

    assert.equal(plain(a), plain(b))
    assert.equal(plain(a), plain(c))
  })

  it('one lane per project in projects.tree order, the no-project lane last, named like the core bucket (Home)', () => {
    const out = layout(model, { nowMs })
    const labels = out.lanes.map(lane => lane.label)

    const treeOrder = fixture.projects.filter(each => !each.isNoProject).map(each => each.label)

    assert.deepEqual(treeOrder, ['syscanvas', 'hermes-plugins', 'mdesign'])
    assert.deepEqual(labels, [...treeOrder, 'Home'])
    assert.equal(out.lanes.at(-1)!.key, NO_PROJECT_ID)
  })

  it('header counts and tokens: every session of the lane under the filters, singles included', () => {
    const out = layout(model, { nowMs })

    for (const lane of out.lanes) {
      const members = model.nodes.filter(node => node.kind === 'session' && (lane.key === NO_PROJECT_ID ? !node.projectId || node.projectId === NO_PROJECT_ID : node.projectId === lane.key))
      const tokens = members.reduce((sum, node) => sum + (node.row!.input_tokens ?? 0) + (node.row!.output_tokens ?? 0), 0)

      assert.equal(lane.sessions, members.length, `${lane.label} sessions`)
      assert.equal(lane.tokens, tokens, `${lane.label} tokens`)
      assert.equal(lane.singles + lane.inTrees, lane.sessions)
      assert.equal(lane.singleIds.length, lane.singles, `${lane.label}: chip lists every single`)
    }

    // syscanvas: the compacted conversation counts once (one block), with its own tokens.
    const sys = out.lanes.find(lane => lane.label === 'syscanvas')!

    assert.ok(sys.tokens >= 480_000)
    assert.equal(tokenLabel(1_400_000), '1.4M')
    assert.equal(tokenLabel(402_000), '402k')
  })

  it('a stand-in sits in its child\'s lane, just left of the child, linked to it', () => {
    const out = layout(model, { nowMs })
    const standin = [...out.boxes.values()].find(box => box.zone === 'standin')!
    const child = out.boxes.get('st-orphan-child')!

    assert.equal(standin.lane, child.lane)
    assert.equal(child.lane, NO_PROJECT_ID)
    assert.ok(standin.x + SWIM_WIDTH < child.x && child.x - (standin.x + SWIM_WIDTH) <= 24)
    assert.ok(out.links.some(link => link.source === standin.id && link.target === 'st-orphan-child'))
  })

  it('a cross-project family keeps each block in its own lane; the link runs between lanes, child right of parent', () => {
    const out = layout(model, { nowMs })
    const root = out.boxes.get('st-split-root')!
    const child = out.boxes.get('st-split-child')!

    assert.notEqual(root.lane, child.lane)
    assert.ok(child.x >= root.x + SWIM_WIDTH + CHILD_GAP - 1e-9)
    const link = out.links.find(each => each.source === 'st-split-root' && each.target === 'st-split-child')!

    assert.deepEqual([link.from.dir, link.to.dir], ['right', 'left'])
    assert.equal(link.from.x, root.x + SWIM_WIDTH)
    assert.equal(link.to.x, child.x)
  })

  it('singles sit in their lane\'s chip, right of every block; Show all empties the chips', () => {
    const out = layout(model, { nowMs })
    const right = Math.max(...[...out.boxes.values()].map(box => box.x + box.width))

    for (const lane of out.lanes) {
      assert.ok(lane.chip, `${lane.label} has no chip`)
      assert.ok(lane.chip.x > right && lane.chip.y >= lane.top && lane.chip.y + lane.chip.height <= lane.top + lane.height)
      assert.ok(lane.singleIds.every(id => !out.shown.has(id)))
    }

    const all = layout(model, { nowMs, showAll: true })

    assert.ok(all.lanes.every(lane => !lane.chip && lane.singleIds.length === 0))
    assert.ok(model.singles.every(node => all.shown.has(node.id)))
  })

  it('a lane this device collapsed: a thin header with an activity bar, its blocks hidden, nobody else moves in x', () => {
    const open = layout(model, { nowMs })
    const sys = open.lanes.find(lane => lane.label === 'syscanvas')!
    const closed = layout(model, { nowMs, collapsed: new Set([sys.key]) })
    const lane = closed.lanes.find(each => each.key === sys.key)!

    assert.ok(lane.collapsed && !lane.scopeCollapsed && lane.height === LANE_COLLAPSED_HEIGHT)
    assert.ok(lane.activity.length >= 6)
    assert.ok(!lane.chip)
    assert.ok([...closed.shown].every(id => closed.boxes.get(id)!.lane !== sys.key))

    for (const [id, box] of open.boxes) {
      assert.equal(closed.boxes.get(id)!.x, box.x, `${id} moved in x`)
    }
  })

  it('a project scope collapses the other lanes (derived, not the device map) and shows the cross-project parent as a ghost at the lane\'s left edge', () => {
    const mdesign = fixture.projects.find(each => each.label === 'mdesign')!
    const scoped = buildGraph(fixture.rows, fixture.projects, options(mdesign.id))
    const collapsed = new Set<string>()
    const out = layout(scoped, { nowMs, collapsed })

    assertInvariants(scoped, out)
    assert.equal(collapsed.size, 0)
    assert.ok(out.lanes.filter(lane => lane.key !== mdesign.id).every(lane => lane.collapsed && lane.scopeCollapsed && lane.height === LANE_COLLAPSED_HEIGHT))
    assert.ok(!out.lanes.find(lane => lane.key === mdesign.id)!.collapsed)
    assert.ok(out.ghosts.has('st-split-root'))
    const ghost = out.boxes.get('st-split-root')!
    const inLane = [...out.shown].filter(id => !out.ghosts.has(id)).map(id => out.boxes.get(id)!)

    assert.equal(ghost.zone, 'ghost')
    assert.ok(scoped.nodeById.get('st-split-root')!.readOnly)
    assert.ok(inLane.every(box => box.x > ghost.x + SWIM_WIDTH), 'the ghost is not at the left edge')
    assert.ok(out.links.some(link => link.source === 'st-split-root' && link.target === 'st-split-child'))

    // A lane the device collapsed but which is the scope still opens.
    const forced = layout(scoped, { nowMs, collapsed: new Set([mdesign.id]) })

    assert.ok(!forced.lanes.find(lane => lane.key === mdesign.id)!.collapsed)
  })

  it('NB1: the ghost sits just left of the scoped lane\'s leftmost block (never in the day window); the chips follow the expanded lanes only', () => {
    const mdesign = fixture.projects.find(each => each.label === 'mdesign')!
    const scoped = buildGraph(fixture.rows, fixture.projects, options(mdesign.id))
    const out = layout(scoped, { nowMs })
    const ghost = out.boxes.get('st-split-root')!
    const inLane = [...out.shown].filter(id => !out.ghosts.has(id)).map(id => out.boxes.get(id)!)
    const leftmost = Math.min(...inLane.map(box => box.x))

    assert.equal(ghost.x, Math.min(0, leftmost) - GHOST_GAP - SWIM_WIDTH)
    assert.ok(ghost.x + SWIM_WIDTH < 0, 'the ghost reaches into the day window')
    // Fit frames from the ghost: the bounds start there.
    assert.equal(out.bounds.minX, ghost.x - 12)
    const right = Math.max(WINDOW_DAYS * DAY_WIDTH, ...inLane.map(box => box.x + box.width))
    const chip = out.lanes.find(lane => lane.key === mdesign.id)!.chip!

    assert.equal(chip.x, right + CHIP_GAP, 'the chip is placed from collapsed lanes too')
    // A collapsed lane's far-right block does not push the other lanes' chips out.
    const open = layout(model, { nowMs })
    const widest = open.lanes.reduce((best, lane) => {
      const r = Math.max(...[...open.shown].map(id => open.boxes.get(id)!).filter(box => box.lane === lane.key).map(box => box.x + box.width))

      return r > best.r ? { key: lane.key, r } : best
    }, { key: '', r: -Infinity })
    const without = layout(model, { nowMs, collapsed: new Set([widest.key]) })
    const others = Math.max(WINDOW_DAYS * DAY_WIDTH, ...[...without.shown].map(id => without.boxes.get(id)!).map(box => box.x + box.width))

    assert.ok(without.lanes.filter(lane => lane.chip).every(lane => lane.chip!.x === others + CHIP_GAP))
    assertInvariants(scoped, out)
  })

  it('fit frames every lane right of the header column, under the axis, inside the zoom limits', () => {
    const out = layout(model, { nowMs })
    const view = fitSwimlanes(out, 1200, 700, 0.3)

    assert.ok(view.zoom >= 0.3 && view.zoom <= 1.15)
    assert.ok(Math.abs(view.x + out.bounds.minX * view.zoom - (HEADER_WIDTH + 8)) < 1e-9)
    assert.ok(out.bounds.height * view.zoom <= 700 || view.zoom === 0.3)
  })
})

describe('Swimlanes layout on the 500-session fixture', () => {
  const fixture = loadFixture('scale')
  const nowMs = fixtureNow(fixture.rows)

  for (const showAll of [false, true]) {
    it(`holds every invariant with Show all ${showAll ? 'on' : 'off'}`, () => {
      const model = buildGraph(fixture.rows, fixture.projects, { profile: 'scale', showArchived: false, scope: ALL_PROJECTS })
      const started = performance.now()
      const out = layout(model, { nowMs, showAll })
      const ms = performance.now() - started
      const result = assertInvariants(model, out)

      assert.equal(result.shown, showAll ? model.nodes.length : model.nodes.filter(node => !node.single).length)
      assert.ok(ms < 2000, `layout took ${ms} ms`)
      assert.equal(JSON.stringify([...layout(model, { nowMs, showAll }).boxes]), JSON.stringify([...out.boxes]))
    })
  }
})

describe('Swimlanes time axis edge cases', () => {
  // Now: 2026-11-10 15:00 UTC (a Tuesday).
  const now = Date.UTC(2026, 10, 10, 15, 0, 0) / 1000
  const nowMs = now * 1000
  const projects = [project('p', [])]
  const base = (id: string, extra: Partial<SessionRow>) => row(id, { cwd: '/repos/p', git_repo_root: '/repos/p', ...extra })

  /** A two-block family (so both are on the axis): `id` and a child started one hour after now - 1d. */
  function family(id: string, extra: Partial<SessionRow>, childStart = now - DAY): SessionRow[] {
    return [base(id, extra), base(`${id}-kid`, { _branched_from: id, parent_session_id: id, started_at: childStart, last_active: childStart + 60 })]
  }

  const model = (rows: SessionRow[]) => buildGraph(rows, projects, options())

  it('the window: today and the 8 days before it, one tick per local day, the first bold with its month', () => {
    const out = layout(model(family('a', { started_at: now - 2 * DAY, last_active: now - 2 * DAY })), { nowMs })

    assert.equal(out.ticks.length, WINDOW_DAYS)
    assert.deepEqual(out.ticks.map(tick => tick.label), ['Nov 2', 'Tue 3', 'Wed 4', 'Thu 5', 'Fri 6', 'Sat 7', 'Sun 8', 'Mon 9', 'Tue 10'])
    assert.ok(out.ticks[0].bold && !out.ticks[1].bold)
    assert.equal(out.monthLabel, 'Nov 2026')
    // Now (15:00) is 15/24 into today's column.
    assert.equal(out.nowX, 8 * DAY_WIDTH + (15 / 24) * DAY_WIDTH)
  })

  it('a session 5 days old sits on its own tick (x within that day\'s column)', () => {
    const start = now - 5 * DAY - 3 * HOUR
    const out = layout(model(family('a', { started_at: start, last_active: start + 60 })), { nowMs })
    const box = out.boxes.get('a')!
    const tick = out.ticks.find(each => each.day === localDay(start, 0))!

    assert.equal(box.zone, 'window')
    assert.ok(box.x >= tick.x && box.x < tick.x + DAY_WIDTH, `x ${box.x} vs tick ${tick.x}`)
  })

  it('a session 30 days old goes into the "earlier" zone, never on a day tick; earlier ones keep their order', () => {
    const rows = [
      ...family('old', { started_at: now - 30 * DAY, last_active: now - 30 * DAY + 60 }),
      ...family('older', { started_at: now - 60 * DAY, last_active: now - 60 * DAY + 60 })
    ]
    const out = layout(model(rows), { nowMs })
    const old = out.boxes.get('old')!
    const older = out.boxes.get('older')!

    assert.equal(old.zone, 'earlier')
    assert.equal(older.zone, 'earlier')
    assert.ok(old.x + SWIM_WIDTH <= -EARLIER_GAP + 1e-9, `old x ${old.x} reaches the first column`)
    assert.ok(older.x < old.x, 'earlier zone not ordered by start')
    assert.ok(out.ticks.every(tick => tick.x >= 0))
  })

  it('a future started_at (clock skew) is clamped to the now marker, never beyond, and does not crash', () => {
    const out = layout(model(family('skew', { started_at: now + 3 * DAY, last_active: now + 3 * DAY }, now - 2 * DAY)), { nowMs })
    const box = out.boxes.get('skew')!

    assert.ok(out.future.has('skew'))
    assert.equal(box.time, now)
    assert.equal(box.x, Math.floor(out.nowX))
    assert.ok(box.x <= out.nowX)
  })

  it('a missing or invalid started_at falls back to last_active, then to the earlier zone (first there)', () => {
    const lastActive = now - 3 * DAY
    const rows = [
      ...family('nostart', { started_at: null, last_active: lastActive }),
      ...family('nan', { started_at: Number.NaN, last_active: lastActive }),
      ...family('nothing', { started_at: null, last_active: null }),
      ...family('old', { started_at: now - 40 * DAY, last_active: now - 40 * DAY })
    ]
    const out = layout(model(rows), { nowMs })
    const tick = out.ticks.find(each => each.day === localDay(lastActive, 0))!

    for (const id of ['nostart', 'nan']) {
      const box = out.boxes.get(id)!

      assert.equal(box.time, lastActive)
      assert.ok(box.x >= tick.x && box.x < tick.x + DAY_WIDTH, `${id} not on the last_active tick`)
    }

    const nothing = out.boxes.get('nothing')!

    assert.equal(nothing.zone, 'earlier')
    assert.equal(nothing.time, null)
    assert.ok(nothing.x < out.boxes.get('old')!.x, 'an undated session is not first in the earlier zone')
  })

  it('days are local: a start at 23:30 UTC is the next day at +60 min and the same day at -60 min', () => {
    const start = Date.UTC(2026, 10, 7, 23, 30, 0) / 1000
    const rows = family('edge', { started_at: start, last_active: start + 60 }, start + 2 * DAY)
    const east = layout(model(rows), { nowMs, tzOffsetMinutes: 60 })
    const west = layout(model(rows), { nowMs, tzOffsetMinutes: -60 })
    const eastTick = east.ticks.find(tick => tick.label === 'Sun 8')!
    const westTick = west.ticks.find(tick => tick.label === 'Sat 7')!

    assert.ok(east.boxes.get('edge')!.x >= eastTick.x && east.boxes.get('edge')!.x < eastTick.x + DAY_WIDTH * 0.05, `east ${east.boxes.get('edge')!.x} vs ${eastTick.x}`)
    assert.ok(west.boxes.get('edge')!.x >= westTick.x + DAY_WIDTH * 0.9 && west.boxes.get('edge')!.x < westTick.x + DAY_WIDTH)
    // The same instant in both: now (15:00 UTC) is 16:00 east, 14:00 west.
    assert.equal(east.nowX, 8 * DAY_WIDTH + (16 / 24) * DAY_WIDTH)
    assert.equal(west.nowX, 8 * DAY_WIDTH + (14 / 24) * DAY_WIDTH)
  })

  it('a child that started before its parent is placed just right of the parent and reported as clamped', () => {
    const parentStart = now - 2 * DAY
    const rows = family('p', { started_at: parentStart, last_active: parentStart + 60 }, parentStart - 6 * HOUR)
    const out = layout(model(rows), { nowMs })

    assert.deepEqual([...out.clamped], ['p-kid'])
    assert.equal(out.boxes.get('p-kid')!.x, out.boxes.get('p')!.x + SWIM_WIDTH + CHILD_GAP)
    assert.equal(out.boxes.get('p-kid')!.row, out.boxes.get('p')!.row, 'the child does not keep its parent\'s row')
  })

  it('blocks are 170 × 54; a "continued as" link drops from the predecessor\'s bottom when the successor is below and right', () => {
    const below = swimPorts('reset', { x: 0, y: 0, width: SWIM_WIDTH, height: SWIM_HEIGHT }, { x: 400, y: 150, width: SWIM_WIDTH, height: SWIM_HEIGHT })
    const level = swimPorts('reset', { x: 0, y: 0, width: SWIM_WIDTH, height: SWIM_HEIGHT }, { x: 400, y: 0, width: SWIM_WIDTH, height: SWIM_HEIGHT })

    assert.deepEqual([below.from.dir, below.to.dir], ['down', 'left'])
    assert.deepEqual([level.from.dir, level.to.dir], ['right', 'left'])
  })

  it('NB1: a ghost in a lane with no earlier-zone block sits just left of the day window, not in a fixed far-left column', () => {
    const projects2 = [project('p', []), project('q', [])]
    const rows = [
      row('g-parent', { cwd: '/repos/q', git_repo_root: '/repos/q', started_at: now - 3 * DAY, last_active: now - 3 * DAY + 60 }),
      row('g-child', { cwd: '/repos/p', git_repo_root: '/repos/p', _branched_from: 'g-parent', parent_session_id: 'g-parent', started_at: now - 2 * DAY, last_active: now - 2 * DAY + 60 })
    ]
    const scoped = buildGraph(rows, projects2, options('p'))
    const out = layout(scoped, { nowMs })
    const ghost = out.boxes.get('g-parent')!

    assert.equal(ghost.zone, 'ghost')
    assert.equal(ghost.x, -GHOST_GAP - SWIM_WIDTH)
    assert.ok(ghost.x > -EARLIER_WIDTH, 'the ghost is still left of the earlier zone')
    assertInvariants(scoped, out)
  })
})

describe('Swimlanes time axis across a DST change (NB4, card-5 review)', () => {
  // America/New_York: EDT (UTC-4) until 2026-11-01 06:00 UTC (02:00 EDT), then EST (UTC-5).
  const DST_END = Date.UTC(2026, 10, 1, 6, 0, 0)
  const newYork = (ms: number) => (ms < DST_END ? -240 : -300)
  const projects = [project('p', [])]
  const base = (id: string, extra: Partial<SessionRow>) => row(id, { cwd: '/repos/p', git_repo_root: '/repos/p', ...extra })
  // Now: Thu 2026-11-05 12:00 EST. A session started Sat Oct 31 00:30 EDT (04:30 UTC).
  const nowMs = Date.UTC(2026, 10, 5, 17, 0, 0)
  const start = Date.UTC(2026, 9, 31, 4, 30, 0) / 1000
  const rows = [base('dst', { started_at: start, last_active: start + 60 }), base('dst-kid', { _branched_from: 'dst', parent_session_id: 'dst', started_at: start + DAY, last_active: start + DAY + 60 })]
  const model = buildGraph(rows, projects, options())
  const column = (out: SwimLayout, id: string) => out.ticks.find(tick => out.boxes.get(id)!.x >= tick.x && out.boxes.get(id)!.x < tick.x + DAY_WIDTH)?.label

  it('the reviewer\'s repro: with each timestamp\'s own offset the session is in the Sat 31 column (one fixed offset put it in Fri 30)', () => {
    const fixed = layout(model, { nowMs, tzOffsetMinutes: -300 })
    const perInstant = layout(model, { nowMs, offsetAt: newYork })

    assert.equal(column(fixed, 'dst'), 'Fri 30', 'the old fixed-offset behaviour (control)')
    assert.equal(column(perInstant, 'dst'), 'Sat 31')
    // 00:30 into a 24 h day.
    const tick = perInstant.ticks.find(each => each.label === 'Sat 31')!

    assert.equal(perInstant.boxes.get('dst')!.x, Math.floor(tick.x + (0.5 / 24) * DAY_WIDTH))
    assertInvariants(model, perInstant)
  })

  it('the same with the real zone: TZ=America/New_York and the page\'s browserOffsetAt', () => {
    const before = process.env.TZ

    process.env.TZ = 'America/New_York'

    try {
      assert.equal(browserOffsetAt(Date.UTC(2026, 9, 31, 4, 30, 0)), -240)
      assert.equal(browserOffsetAt(nowMs), -300)
      assert.equal(column(layout(model, { nowMs, offsetAt: browserOffsetAt }), 'dst'), 'Sat 31')
    } finally {
      if (before === undefined) {
        delete process.env.TZ
      } else {
        process.env.TZ = before
      }
    }
  })

  it('the 25-hour day (Sun Nov 1): x stays in its column and monotonic in time through the repeated hour', () => {
    // 01:30 EDT (05:30 UTC), then 01:10 EST (06:10 UTC, 40 min later), then 23:30 EST.
    const times = [Date.UTC(2026, 10, 1, 5, 30, 0), Date.UTC(2026, 10, 1, 6, 10, 0), Date.UTC(2026, 10, 2, 4, 30, 0)].map(ms => ms / 1000)
    const chain = times.map((t, i) => base(`d${i}`, { started_at: t, last_active: t + 60 }))
    // One family each (two blocks so it is on the axis): a late child.
    const kids = times.map((t, i) => base(`d${i}-kid`, { _branched_from: `d${i}`, parent_session_id: `d${i}`, started_at: t + 2 * DAY, last_active: t + 2 * DAY + 60 }))
    const out = layout(buildGraph([...chain, ...kids], projects, options()), { nowMs, offsetAt: newYork })
    const xs = times.map((_, i) => out.boxes.get(`d${i}`)!.x)

    assert.deepEqual(times.map((_, i) => column(out, `d${i}`)), ['Nov 1', 'Nov 1', 'Nov 1'])
    assert.ok(xs[0] < xs[1] && xs[1] < xs[2], `not monotonic: ${xs}`)
  })

  it('the now marker in a non-UTC zone: the live mapping equals a fresh layout\'s', () => {
    const out = layout(model, { nowMs, offsetAt: newYork })

    assert.ok(Math.abs(out.nowX - (8 * DAY_WIDTH + (12 / 24) * DAY_WIDTH)) < 1e-9)
    assert.ok(Math.abs(swimNowX(out, nowMs + 3 * HOUR * 1000) - layout(model, { nowMs: nowMs + 3 * HOUR * 1000, offsetAt: newYork }).nowX) < 1e-9)
  })
})

describe('Swimlanes local calendar where local midnight does not exist (NB1, card-5 review r2)', () => {
  // America/Havana: CST (UTC-5) until Sun 2026-03-08 00:00 local (05:00 UTC), then CDT (UTC-4);
  // the clock jumps from 00:00 to 01:00, so that day starts at 01:00 CDT = 05:00 UTC.
  const SPRING = Date.UTC(2026, 2, 8, 5, 0, 0)
  const havana = (ms: number) => (ms < SPRING ? -300 : -240)

  it('the day starts at its first local second (01:00 CDT), not an hour early on the day before', () => {
    const calendar = localCalendar(havana)
    const day = calendar.dayOf(SPRING / 1000)
    const start = calendar.midnight(day)

    assert.equal(start, SPRING / 1000, `day start ${new Date(start * 1000).toISOString()}`)
    assert.equal(calendar.dayOf(start), day)
    assert.equal(calendar.dayOf(start - 1), day - 1)
    // The day before and after are ordinary: 24 h (CST) before, 24 h (CDT) after; this one is 23 h.
    assert.equal(calendar.midnight(day - 1), Date.UTC(2026, 2, 7, 5, 0, 0) / 1000)
    assert.equal(calendar.midnight(day + 1), Date.UTC(2026, 2, 9, 4, 0, 0) / 1000)
    // 06:00 CDT is 5 of the day's 23 hours in.
    assert.ok(Math.abs(calendar.fraction(Date.UTC(2026, 2, 8, 10, 0, 0) / 1000, day) - 5 / 23) < 1e-9)
  })

  for (const zone of ['America/Havana', 'America/Santiago', 'America/New_York', 'Australia/Lord_Howe']) {
    it(`with the real zone (TZ=${zone}, browserOffsetAt), every day over 400 days starts at its first local second`, () => {
      const before = process.env.TZ

      process.env.TZ = zone

      try {
        const calendar = localCalendar(browserOffsetAt)
        const first = calendar.dayOf(Date.UTC(2026, 0, 1) / 1000)
        const wrong = []

        for (let day = first; day < first + 400; day += 1) {
          const start = calendar.midnight(day)

          if (!(calendar.dayOf(start) === day && calendar.dayOf(start - 1) === day - 1)) {
            wrong.push(new Date(start * 1000).toISOString())
          }
        }

        assert.deepEqual(wrong, [])
      } finally {
        if (before === undefined) {
          delete process.env.TZ
        } else {
          process.env.TZ = before
        }
      }
    })
  }
})

describe('Swimlanes singles popover placement (NB5, card-5 review)', () => {
  it('opens below a chip high in the canvas, above a chip low in it, never taller than the room on that side', () => {
    const high = popoverPlacement({ y: 80, height: 24 }, 800, 12)

    assert.equal(high.above, false)
    assert.equal(high.edge, 80 + 24 + 6)
    assert.ok(high.edge + high.maxHeight <= 800)

    const low = popoverPlacement({ y: 700, height: 24 }, 800, 12)

    assert.equal(low.above, true)
    assert.equal(low.edge, 700 - 6)
    assert.ok(low.edge - low.maxHeight >= 26, 'the popover runs under the time axis')

    // A short list that fits below stays below, even low in the canvas.
    assert.equal(popoverPlacement({ y: 600, height: 24 }, 800, 1).above, false)
  })
})
