# Subway map (card 7)

The fourth of R1's four view styles (mockup `variants/subway-map/`): every conversation lineage is a
thick coloured line, every session a station on it, a `/branch` the line splitting into a new track.
It is selectable in Settings → Plugins → Session Tree (View style, or "On this device") and in the
toolbar's style switcher, like every registered style (card 4). It sits third in the switcher, in
R1's order (Dense, Project swimlanes, Subway map, Rich cards).

Source: `src/styles/subway/` — `spec.ts` (geometry, ports, slots, shades, label spots), `plan.ts`
(the track plan: row children, link slots, tracks), `layout.ts` (the metro auto-layout and its
merge), `labels.ts` (label placement), `context.tsx` (the canvas context: the model and the label
store), `subway-flow.tsx` (station, stand-in, track), `layer.tsx` (the label driver, the map key and
the depot), `subway.css`, `index.ts` (the style definition). The router is `octilinearRouter` in
`src/model/route.ts`. Unit tests: `tests/js/subway.test.ts`; e2e: `scripts/e2e-subway.ts` (and the
whole-plugin `scripts/e2e-final.ts`).

## How it plugs into the canvas shell

Subway is a normal draggable style: `savesLayout: true`, its positions are stored under its own
style id (`subway`), separate from every other style's, through `LayoutSync.place()` / `drop()`. It
uses the card-6 `Provider` (the model and the label store for its stations) and `Layer` (inside the
flow). Two small, optional additions to the style contract (`src/styles/types.ts`):

- `linkSlots(model)` → edge id → departure slot. The routing chain (`canvas-routing.ts`) puts the
  slot into each link end (structure only, from the model: a content-only refetch never changes
  it, so it re-routes nothing) and passes it to `ports(kind, source, target, slot)`. Other styles
  have no slots (0).
- `fitPadding`: Fit's padding (Subway: room for the labels above the top row and for the depot).

## The track plan (`plan.ts`)

- A station's **row children** are its "continued as" successors, then its `/branch` children
  (each by creation time).
- The first row child continues on the station's row; every other one is a **split**.
- A **track** (a line) starts at a tree root. A `/branch` child that is its parent's first row child
  continues its parent's line; every other child starts a new one. A successor's tree is a line of
  its own, joined by the dotted planned line (which is not a track).
- So a family has 1 + (its splits) tracks, plus one per successor tree. On the default fixture:
  5 families, 10 `/branch` edges, 1 "continued as", 5 parents whose first row child is a branch
  child → **11 tracks** (unit test and e2e, the e2e computing it from the backend's rows).
- Each track gets a shade of its project's colour (`--st-pc`, from `projects.tree`; the theme's
  accent when the project has none): the first track the colour itself, later ones mixed with the
  theme's text colour (`SHADES`). A branch link is drawn in its child's line, "continued as" in its
  predecessor's.

## Geometry and the auto-layout (`spec.ts`, `layout.ts`)

- A station's box (the React Flow node) is 40 × 20: the ring (16 px, 3.5 px border) or the ×N
  capsule (38 × 18 with "×N" inside). Its label is drawn beside it, outside the box.
- The metro grid: 25 px (the Snap pitch); columns 250 px apart (a station and its label's room),
  rows 100 px apart, **one track per row**. Every auto-layout coordinate is a multiple of 25.
- A family: depth → column. A station's first row child goes on its row; each later one takes the
  next free row below everything placed so far (depth first). The rows between a station and one of
  its splits therefore hold only stations of its earlier splits' subtrees, all in later columns.
- Ports: the line that continues a track leaves the right edge (centre); a split leaves the bottom
  edge at its own **slot** (slot 1 at +16 px from the centre, then +8, 0, −8, −16; later splits
  further left); every line enters its target's left edge (centre).
- A split's track drops straight down from its slot, takes a 45° cut (25 px) and runs into its
  station. Later (lower) splits drop further left, so a drop never crosses an earlier split's run;
  the rows it passes are empty in its column. **No two tracks share a corridor and none cross** in
  the auto-layout (unit test on the default fixture and the 500-session fixture; e2e on the default
  fixture with collinear-overlap geometry).
- Families stack top to bottom, grouped by project (the shared `groupOrder`: the scoped project
  first, `projects.tree` order, no project last), each group under its label with room for the first
  row's station labels; with Show all, singles fill a 4-column grid under the group's trees.

## Labels (`labels.ts`)

- A label is 168 × 46: the title (bold, at most 2 lines, clamped) and a muted meta line (last used ·
  messages · tokens; "running" / "needs input" / "archived" pills; the ⋯ menu on hover). The model
  and cost are in its tooltip. Pinned adds a pin glyph before the title, unread an accent dot after
  it (and a bolder title).
- Placement: stations top to bottom, left to right (ties by id); each label takes the first of
  above (the mockup's place), below, above-left, below-left, right, left that overlaps no station,
  no project label and no label placed before it; when none is free, the spot with the least
  overlap (`data-label-clear="false"`). Deterministic. In the auto-layout every label fits above its
  station (unit test and e2e).
- The layer places the labels from the committed positions; the label store re-renders only the
  stations whose spot changed. While a station is dragged its label keeps its spot (it moves with
  the station) and is placed again after the drop.

## Links and routing (R13, `octilinearRouter`)

- While a station is dragged, its tracks are **straight segments** from port to port (`live`).
- On drop every track is an **octilinear polyline**: an axis-aligned skeleton (a bottom port drops
  straight down then runs in; a side port runs out 30 px, turns, runs in) with each corner cut at
  45° (`chamferPolyline`: exactly 45°, never more than half a segment). A track that would cross
  another station detours around it: the shared orthogonal grid detour (`detour`, now with a
  `corners` option), chamfered the same way, the cuts kept inside the clearance and checked against
  every station. Tracks that now cross the dropped station re-route in the same pass (the shared
  `routeLinks`).
- Halo: every track is drawn over a casing in the canvas colour (8 px under a 4.5 px line), so where
  one track crosses another the upper one has a gap around it, as on a metro map.
- "Continued as" is a dotted planned line (`2 9`, round caps) labelled "continued as ›"; the
  stand-in's line is dashed grey (`10 6`).

## Stations, status and the rest

- ×N: a capsule station with "×N" inside; its tooltip names the folded segments.
- The stand-in: a hollow dashed station labelled "not loaded" ("parent deleted or older · N child")
  at the start of a dashed grey line.
- Running pulses (a green ring, `st-sw-ping`); needs input is an amber ring (with a "needs input"
  pill); unread an accent dot after the title; pinned a pin glyph; the session open in the app a
  "◉ you are here" marker under its station (above it when the label is below).
- Archived (Show archived): faded, a dotted ring. Out of scope: dimmed and read-only (R5).
- The map key (bottom right): line, split, dotted planned line, capsule, dashed stand-in, pulse /
  amber.
- The **depot** (R8): a bottom strip of the sessions without branches, each a small station on a
  dotted track with its title and "age · project". Double-click opens one in a tab, right-click gives
  the session menu (`data-st-node`, the canvas's SessionMenu), the wheel scrolls it sideways. Open or
  folded per device (the style's panel state, default open). With Show all the singles are on the
  canvas instead and the depot is gone.

## Merge (R12)

`previous` (the stored positions) is kept exactly (the same objects). A new station goes where its
track would put it — right of its parent on the parent's row for the first row child, else on a row
under its placed siblings — at the nearest free spot **inside its group's band** (from its label to
the next group's label), keeping its label's room clear (a footprint of the station and the label
above it); a new family at the first free spot of its group's band in its own grid shape; what does
not fit goes under everything, under a continuation label of its group. New stations placed this way
are not guaranteed corridor-free (the auto-layout is); Re-arrange gives the auto-layout again.

## Limits

- More than five splits from one station: slots 6–8 pack into the box's last 4 px and later ones
  share the last slot, so their drops overlap visually (no fixture or real data seen has more than
  three).
- Up-splits (the mockup's one line climbing to a new station) are not drawn: every split drops below.
- Labels are placed to avoid stations and labels, not tracks; after a drag a track may run under a
  label.
- No continuous obstacle routing while dragging (out of scope, R13).
