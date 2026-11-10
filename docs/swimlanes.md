# Project swimlanes (card 5)

The second of R1's four view styles (mockup `variants/project-swimlanes/`). One horizontal lane
per project, a day time axis across the top, trees growing left to right inside their lane. It is
selectable in Settings → Plugins → Session Tree (View style, or "On this device") and in the
toolbar's style switcher, like every registered style (card 4).

Source: `src/styles/swimlanes/` — `layout.ts` (the pure layout), `spec.ts` (geometry, ports, the
shared layout spec), `swim-flow.tsx` (blocks, stand-in, links, lane chip), `layers.tsx` (the
layers around the flow), `index.ts` (the style definition); `src/page/frame-cache.ts` (when the
page recomputes it), `src/page/canvas-routing.ts` (when the canvas re-routes links). Unit tests:
`tests/js/swimlanes-layout.test.ts`, `tests/js/frame-cache.test.ts`,
`tests/js/canvas-routing.test.ts`; e2e: `scripts/e2e-swimlanes.ts`.

## How it plugs into the canvas shell

The style contract (`src/styles/types.ts`) got one optional part, `frame`:

- `frame.compute(input)` lays the style out from the data alone (`model`, Show all, this device's
  collapsed lanes, "now", the time-zone offset function `offsetAt(ms)`). The page calls it
  instead of `LayoutSync.place()`: Swimlanes never reads the position store and never queues
  anything to it.
- **When it is recomputed** (`src/page/frame-cache.ts`, card-5 review B1). Only when a real input
  changes: the style, the graph model (rows, projects, scope, profile, Show archived), Show all,
  the collapsed lanes, the **local day** of now, or the **offset at now** (a DST switch or a new
  zone). The page's minute tick inside the same local day and offset returns the previous layout
  object itself, so the canvas does not rebuild its rectangles or re-route a link (the obstacle
  router takes 0.5–0.7 s on the 500-session fixture). A new model (every refetch, such as one
  chat turn elsewhere) does recompute the layout; a recompute whose positions (or shown set)
  equal the previous ones reuses the previous map (set), so the canvas keeps its rectangles.
- **When links are re-routed** (`src/page/canvas-routing.ts`, card-5 review r2 B1-r2). The
  canvas's routing chain never keys on the model object: shown set → rectangles → link ends (per
  link its edge id, source, target and kind) → routes. Each stage keeps its previous object when
  its result is equal, and the router runs only when the link ends, the rectangles, the style's
  ports or its router change. A refetch that changes only block content (message count, tokens,
  last used, title, status) redraws those blocks and re-routes nothing; a structural change (a
  session added, removed, archived or moved to another lane, a new link, a local midnight, an
  offset change) re-routes once.
- The `nowMs` passed to the pure layout (for the future-start clamp below) is the one captured at
  that recompute. Only the **now marker** (the line and the pill) follows the live clock: the
  layers map the live `nowMs` with the same piecewise mapping (`swimNowX`, from today's local
  midnights), without a new layout.
- `frame.extraNodes(layout)`: flow nodes that are not blocks (the lane chips).
- `frame.Under`: a layer behind the flow in flow coordinates (lane bands, the hatched "earlier"
  zone, day lines, the now line, a collapsed lane's activity bar).
- `frame.Over`: a layer in front of the flow in screen coordinates (the lane header column, the
  time axis, the corner, the singles popover). Both follow the viewport with `useViewport()`.

The canvas shell keeps R3 navigation (plain wheel zoom toward the cursor, middle-drag pan,
Space + left-drag pan, toolbar −/%/+/Fit), the hover tooltip, the R5 read-only rules, the block menu
(card 3) and double-click to open. A framed style frames itself (`fit()` leaves room for the header
column and the axis).

## Rules of this style

- **No dragging, nothing saved (R12).** Nodes are not draggable; no `place()`, no save queue, no
  `DELETE`/`PUT /state/layout`, no `POST /state/forget` from rendering. Re-arrange is hidden; Snap
  shows disabled with the tooltip "Swimlanes has no dragging" and no grid is drawn. The only state
  write this style can cause is Move to project's existing `POST /state/forget` (it forgets the
  block's spot in the *other* styles' layouts), and the synced style itself (`PATCH /settings`) when
  the user switches style.
- **Lanes.** `projects.tree` order, then any project id the tree does not list (sorted), then the
  no-project lane, named like the core's bucket (`Home`, from the tree's `isNoProject` node). A
  project with no session under the current filters (profile, Show archived, hidden sources) gets
  no lane unless it is the scope.
- **Header column.** Fixed in screen x (a horizontal pan does not move it), follows the lanes
  vertically, matches their heights at every zoom, 168 px wide at every zoom. Swatch (the project's
  colour or icon), name, `N sessions · T tok`, `I in trees · S singles`. When the lane is shorter
  on screen than a block (54 px; the default fit), the header keeps one compact line,
  `N sessions · T tok` (card-5 review NB3). Counts are every session
  block of the lane under the current filters, singles included; tokens are `input_tokens +
  output_tokens` of those blocks (a compacted conversation counts once, with its tip row's tokens).
- **Collapse.** A header click collapses or expands the lane on this device (`ctx.storage`,
  `device.v1.collapsedLanes`: one list of lane keys — the project id, `__no_project__` for the
  no-project lane — the same for every profile and scope). A collapsed lane is a 32 px band with an
  activity bar: one mark per block it holds, at the block's x.
- **Project scope (R5).** The other lanes collapse (derived from the scope, never written to the
  device map; their headers do not toggle while a scope is active) and the view re-fits. A scoped
  block's parent from another project (branch parent or "continued as" predecessor) is drawn as a
  **ghost**: the real block, dimmed and read-only (no drag, menu, selection, rename, open; the
  tooltip "Outside this project — switch to All projects to edit"), just left of the scoped
  lane's leftmost block (40 px gap; when the lane's leftmost block is in the day window, just left
  of the first day column, so a ghost never sits on a day — card-5 review NB1), its meta line
  naming its project. The link runs from the ghost.
- **Per-device viewport.** Zoom and pan are remembered per style + profile + scope (card 4). A scope
  change always re-fits (the lanes change height); a reload in a scope gets that scope's view back.
  Fit frames every lane's height and the shown blocks, chips and now marker. The lane chips sit
  24 px right of the rightmost block of an *expanded* lane (a collapsed lane's activity marks do
  not push them, or the framing, out — NB1).
- **Show all (R8)** puts the singles on the time axis in their lane; the chips go away. A chip's
  popover opens below the chip, or above it when there is less room below than the list needs
  and more above; its height is capped to the room on that side, so the canvas never clips it
  (NB5).
- **Archived (R9)** blocks are greyed in their lane, their menu offers Unarchive.

## Time axis

- **Local days.** The page injects an offset *function*, `offsetAt(ms) = -new Date(ms).getTimezoneOffset()`
  (`browserOffsetAt`); every timestamp's local day uses the offset in force at that instant, and
  a local day runs from its local midnight to the next (23 or 25 hours on a DST change; the column
  is the same 140 px, so x stays monotonic through a repeated hour). Card-5 review NB4: the
  previous version used now's offset for the whole window, which put a session started Sat Oct 31
  00:30 EDT in the **Fri 30** column when viewed on Nov 5 (EST) — a wrong tick, not the "1/24 of a
  column" claimed here before. The layout stays pure (the function is an input; tests inject a
  fixed or a New York offset).
- **Window: 9 day columns** — today and the 8 days before it (the mockup's Nov 2 → Tue 10), 140 px
  each. Day column `d` spans `[d·140, (d+1)·140)`; a block's x is its column's left plus the
  fraction of that local day elapsed at its start, floored to a whole pixel. Tick labels: the first
  column and a month's first day say `Nov 2` (bold), the others `Tue 3`. The now marker sits at
  now's fraction of today's column; it follows the live clock (the minute tick) without a new
  layout. The “now” pill is centred on the marker line unless that would cover today's tick
  label (early in the day, or at a low zoom); then it sits just right of that label (NB2).
- **"Earlier" zone.** A start before the first column goes into a 420 px hatched zone left of it,
  ordered by start (x by rank across the zone; the last earlier block ends ≥ 24 px before the first
  column), never on a day tick.
- **Future `started_at`** (clock skew): clamped to now — the `nowMs` captured when the layout was
  last computed (see “When it is recomputed”). The block sits at the now marker of that moment and
  is never right of the live marker, which only moves right until the next recompute (the layout
  reports it in `future`).
- **Missing or invalid `started_at`** (absent, 0, negative, NaN, ±∞): `last_active` instead; if that
  is missing too, the block goes first in the earlier zone.

## Rows and links

- **Right-of-parent clamp.** A child starts at least 36 px right of its parent's right edge (branch
  parent or "continued as" predecessor), across lanes too. Where its time would put it further
  left, it is placed exactly there: x then reads "after", not a time. This is the only exception to
  "x follows the start time" within a row; the layout returns the clamped blocks.
- **Row packing.** Greedy interval packing per lane in a fixed order: families by their first root's
  start, then family id; inside a family, parents before children (pre-order, by start then id).
  A branch child takes its parent's row when it fits there, else the first row it fits in; a
  "continued as" successor takes the first row under its predecessor that also leaves the run of
  its link free. 16 px are kept free between two blocks of a row. Ties are broken by id, so the
  output is byte-stable.
- **Stand-ins (R7)** sit in their child's lane, 24 px left of the leftmost child.
- **Links (R13 shape: orthogonal elbows, rounded corners).** A branch link leaves the parent's
  right edge, turns 14 px right of it, runs vertically, and enters the child's left edge with an
  arrow; a "continued as" link (dashed, accent, labelled) drops from the predecessor's bottom 30 px
  from its left edge and runs right into the successor (the branch shape when the successor is not
  below and right). A link that would cross another block detours around it (`makeOrthogonalRouter`
  in `src/model/route.ts`, the same A* detour as Dense; there is no drag here, so routes are made
  once per change of the link ends or block rectangles, see "When links are re-routed").

## Simulated / not measured

- Running and needs input are as in cards 2–4 (the running fixture uses the backend's activity
  heuristic; needs input has no SDK source and is unit-tested at `host.state`).
