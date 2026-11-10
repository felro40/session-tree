# Rich cards (card 6)

The third of R1's four view styles (mockup `variants/rich-cards/`): content-first, airy 280 px
cards in top-down trees, so a session can be told apart without opening it. It is selectable in
Settings → Plugins → Session Tree (View style, or "On this device") and in the toolbar's style
switcher, like every registered style (card 4).

Source: `src/styles/rich/` — `spec.ts` (geometry, ports, the token scale, sparkline points,
tooltip), `layout.ts` (the layout and its merge), `details.ts` (the details store and the
viewport rule, pure), `context.tsx` (the canvas context: the store and the token scale),
`rich-flow.tsx` (card, stand-in, link), `layer.tsx` (the details driver and the drawer),
`index.ts` (the style definition). Backend: `dashboard/session_details.py` +
`POST /sessions/details` in `dashboard/plugin_api.py`. Unit tests: `tests/js/rich.test.ts`;
pytest: `tests/py/test_details_api.py`; e2e: `scripts/e2e-rich.ts`.

## How it plugs into the canvas shell

The style contract (`src/styles/types.ts`) got three optional parts:

- `Provider` wraps the flow and supplies context to the style's blocks. The canvas renders
  **every registered style's Provider, always, in registry order** (`StyleProviders` in
  `graph-canvas.tsx`), so the tree above React Flow keeps its shape on a style switch and React
  Flow is never remounted (its viewport and measured nodes stay). Rich's `RichProvider` holds the
  details store and the token scale (the largest session's tokens in the current scope).
- `Layer` is drawn inside the flow (a React Flow child, so it reads the viewport store): Rich's
  `RichLayer` drives the details fetch and draws the drawer.
- `panelDefaultOpen`: the panel / drawer's state on a device that never chose (Rich: closed, as in
  the mockup; Dense keeps its inspector open). The open state itself is the existing per-device,
  per-style `panelOpen` (R16).

Rich is a normal draggable style: `savesLayout: true`, its positions are stored under its own
style id (`rich`), separate from Dense's, through the same `LayoutSync.place()` / `drop()` path.

## Layout

- **A family is a top-down tree.** The shared tidy layout (`layoutFamily`, now exported from
  `model/layout.ts`) runs transposed (`transposedSpec`: card width ↔ height, depth gap ↔ sibling
  gap) and its x/y are swapped back: depth runs down the canvas (100 px between levels, room for
  the needs-input banner), siblings across it (60 px), a parent centred over its children, a
  "continued as" successor tree to the right of its predecessor's.
- **Families flow in rows** (`freshRichLayout`): the cards are big, so one long row (or column) of
  families would not fit any screen even at the 30 % minimum zoom. Project by project
  (`groupOrder`: the scoped project first, `projects.tree` order, no project last), trees first and
  then singles (Show all), the families are placed left to right and wrapped at
  `max(widest family, √(area × 1.6))`, which keeps the canvas near 16:10. Each project's first
  family in a row sits under its label (44 px band); a project that wraps onto the next row gets a
  continuation label (`group:<project>\u001f<n>`, the id form `model/layout.ts` already uses).
- **New sessions never move a placed card** (`mergeRichLayout`): every stored position is kept as
  the very same object. A new card goes under its parent (right of its last sibling on that row),
  right of its predecessor, or above its child, at the nearest free lattice spot (right, then left,
  then the rows below); a new family (or a single with Show all) at the first free spot right of
  and below its group's label, row by row; a group with no label yet gets one under everything.
  Overlap checks go through a bucketed rectangle index, so turning Show all on for the 500-session
  fixture after a saved layout places its 400 singles in about 10 ms (unit test).
- Re-arrange (R12) is the shared one: it forgets the `rich` layout of the scope and the fresh
  layout runs again, with Undo.

## Cards

Fixed size **280 × 164**: the excerpt and the sparkline have fixed slots (skeleton lines and a
grey sparkline box while they load), so the details arriving never move or resize anything
(e2e: every card rectangle before and after, answers delayed 1.5 s).

- Header: the project chip (`ProjectGlyph` + label, the project colour from data), pin glyph,
  unread dot, `running` label, `archived` chip, then the 7-day sparkline and ⋯ (the session menu).
- Title: two lines, bold (750) when unread.
- Excerpt (R22): the backend's plain-text excerpt of the last user / assistant message; when there
  is none (the newest messages are a tool run, say) the row's `preview`, labelled
  **"First prompt:"**. Rendered as React text: no markup, no remote fetch.
- Footer: model chip (`claude-opus-4.1` → `opus-4.1`), last used, messages, and a 54 px token bar
  whose fill is `tokens / max` of the largest session in the current scope (all sessions for All
  projects; the scoped project's for a scope), labelled with the value (`480k`, `1.4M`).
- Sparkline: 7 values, oldest first, today last; its tooltip (`title`) lists each local day
  (`Wed 11-04: 3 msgs`).
- Compacted ×N: up to two ghost cards stacked behind the card (offset 9 px each) plus a
  `compacted ×N` tag under its bottom-right corner.
- Status (R11): running is a rotating conic border (`@property --st-rc-ang`, the theme's
  `--ui-green`); needs input an amber banner strip on top of the card (`--ui-yellow`); open in the
  app an accent ring with a 26 px glow; archived dashed and faded; out of scope 16 % (R5).
- Stand-in (R7): a dashed skeleton card, "Parent not loaded".

## Links

Soft bezier curves (`curveRouter`) from the parent's bottom centre into the child's top centre,
with a small end circle; "continued as" runs from the predecessor's right edge into the
successor's left edge as a dashed accent curve with a `continued as` pill. R13 is the shared
routing chain (`page/canvas-routing.ts`): links follow a dragged card live; on drop a link whose
curve would cross another card detours around it (rounded orthogonal path), once. The chain keys on
link ends and rectangles only, so the details fetch and `sessions.changed` refetches never
re-route or re-layout (unit test and e2e).

**No "branched at msg N" pill.** Card 1's pre-check 9 found no reliable source for the branch
point (`docs/measured-facts.md`): the child row keeps only `_branched_from`; the copied-message
count survives only in a mutation receipt keyed by an admission fingerprint, not by child id, and
only for one runtime path; a common-prefix comparison breaks once the parent is compressed,
rewound or deleted. R22 says to omit the pill then.

## The drawer (R8)

Singles live in a right slide-out drawer (300 px) behind a grip labelled **"N unbranched"** (N =
the singles in scope). Rows show the title, age and the excerpt (or "First prompt:"); a click
selects, a double-click opens the session in a tab (R2), a right-click gives the card 3 session
menu (rows carry `data-st-node`, which the canvas's `SessionMenu` resolves). Its open state is per
device (R16), closed on a device that never opened it. With Show all the singles are cards on the
canvas and the drawer is not drawn.

## Details: `POST /sessions/details`

`{profile, ids: [≤ 100], tz_offset_minutes}` → `{profile, tz_offset_minutes, days: [7 dates],
details: {id: {excerpt, excerpt_role, activity: [7]}}}`; unknown ids are omitted, a 101st id is a
422, `profile` must name one known profile (body field: the query's `profile` is the gateway's
routing key). Read-only, one read-only `SessionDB` open per request, bounded per id:

- the row: `get_session` (primary key);
- the excerpt: Hermes's own paged read, `get_messages(id, latest=True, limit=60)` (`ORDER BY id
  DESC LIMIT` on `idx_messages_session_id`); the newest user / assistant message with text, not a
  compression summary. `plain_text` drops `<tool_call>`, `<think>`, `<script>`, `<style>` blocks,
  keeps fenced code's code without fences, unwraps links / images / inline code / emphasis, strips
  headings, quotes, list markers, rules and table rules, removes HTML tags (also entity-escaped
  ones, after `html.unescape`), collapses whitespace; `clip` cuts to 240 characters with `…`.
  Tool-call payloads never reach it (only `content` is read; tool rows are skipped);
- the activity: one `COUNT(DISTINCT role || ':' || timestamp) … GROUP BY` local day over the 7-day
  timestamp range on the `(session_id, active, timestamp)` index, through SessionDB's read-only
  reader (`_read_all`; Hermes has no per-day count API). It covers the conversation's compression
  lineage (`get_compression_lineage`, ≤ 32 segments); a message carried into a later segment
  (same role and timestamp) counts once. Display rows count (`active = 1 OR compacted = 1`),
  rewound rows do not.

Measured: **1.8 ms per id** on a 5,000-message session (median of 7, `test_details_api.py`).

## Page rules for the details

- Only cards **in or near the viewport** are asked for: the view grown by half its size on each
  side (`nearIds`), after every pan / zoom (throttled to 150 ms) and every data change; the drawer
  asks only for the rows scrolled into view (± 6) while it is open.
- Batched: wants within 60 ms go out as one request per profile, ≤ 100 ids each.
- Cached per session (per card, under the graph node id) with a **signature**: the row's
  `last_active` and `message_count`, the local day and the offset. A current entry is never asked
  for again; a `sessions.changed` refetch that changes a row changes its signature, so exactly the
  sessions that changed are asked for again (the old details stay shown meanwhile). A failed
  request is not retried for 15 s.
- Details never enter the graph model, the block data or the routing chain: each card subscribes
  to its own entry (`useSyncExternalStore`), so an answer re-renders that card only.

## Simulated

- **Needs input**: the SDK has no source (pre-check 10). The e2e's own build (`--test-styles`)
  listens for a `session-tree:test-needs-input` window event naming the waiting ids; `npm run
  build` folds that branch away (`tests/js/guards.test.ts` proves the string is absent).
- **Running**: the backend row's `is_active` (the core's 300 s activity heuristic), produced for
  real by the fixture's `--activate` (fixture-only direct SQL on the timestamp); the
  `host.state.busy*` path stays unit-tested (`status.test.ts`).
