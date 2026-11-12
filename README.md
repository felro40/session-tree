# Session Tree

A Hermes Desktop / Webapp plugin that shows your chat sessions as an interactive graph of how they
were branched from each other. Work happens on `feature/session-tree` (Kanban tenant `session-tree`).

**Status: 7/7 — complete** (four view styles, session actions, synced layout, settings; the set's
final check is `scripts/e2e-final.ts`). Installing it into your Hermes is a separate step with the
user (below).

## Using it

- **Open it** from the sidebar ("Session Tree"), from ⌘K ("Open Session Tree") or at the route
  `/session-tree`. It is a full page, in the desktop app and in the Webapp.
- **What you see.** Each session is a block (in Subway: a station) with its title, project colour,
  last used, messages and tokens, plus its live status (running; needs input where a source exists),
  unread, pinned, cost and model. `/branch` children hang off their parent (solid links); the
  compression segments of one conversation fold into one block marked "compacted ×N"; a `/new` or
  idle reset is a dashed "continued as" link; a parent that is deleted, hidden or not loaded shows as
  a faded "Parent not loaded" stand-in. Delegate children and cron / kanban / tool sessions are
  hidden, like in the sidebar. The session open in the app is highlighted.
- **Navigate.** The plain wheel zooms toward the cursor (30–250 %); drag with the middle button to
  pan, or hold Space or Alt and left-drag (from a block too; Alt is for a laptop touchpad, which has
  no middle button). The toolbar has −, zoom %, + and Fit. A view is remembered per style, profile
  and scope on each device; a remembered view that would show none of the map (it was laid out
  again since, or panned off it) opens framed. In a project scope, Fit and the first visit frame
  that project's blocks (the other projects dimmed around them), and a remembered view that shows
  none of them opens framed on them.
- **Select.** A click selects one block and a click on empty canvas clears the selection. In Dense,
  Subway and Rich cards a left-drag on empty canvas draws a selection box: on release the blocks
  **fully** inside it are selected (one it only partly covers is not). **Shift**+click adds or
  removes one block, **Shift** + a box adds to the selection, **Esc** clears it, and **Ctrl/⌘+A**
  selects every editable block shown (in a text field such as Rename it selects the text instead).
  Dimmed blocks outside the scope, "Parent not loaded" stand-ins and the sessions in a style's
  singles list or drawer are never added by a box, Shift or Ctrl/⌘+A. Swimlanes has no box. With 2
  or more selected the Dense inspector lists them ("N selected"); a click on a title selects just
  that one. Right-click acts on the right-clicked block only, and Delete / Backspace never delete a
  session. The selection is per page: a new scope, profile or style clears it.
- **Arrange.** Drag blocks (every style but Swimlanes); dragging never re-parents. Each style has
  **one layout** per profile, whatever the project scope: a block dragged in a project scope is at
  that spot in All projects too, and choosing a scope never moves a block. Dragging a
  selected block moves every selected block by the same offset (with Snap, by the grabbed block's
  snapped spot); dragging an unselected block selects and moves just that one. Links follow the
  dragged blocks and re-route around other blocks on drop, and the whole group is saved in one
  request. A group move has no Undo. **Snap** shows a dot grid and snaps dragged blocks to it.
  **Re-arrange** in All projects resets every block of the style's layout; in a project scope it
  resets only that project's blocks (to the spots a Re-arrange in All would give them) and every
  other block stays where it is. It asks first, naming what resets (in a project scope, how many
  of its blocks are on the canvas; with none there is nothing to re-arrange; Space, Enter or Escape
  right after a misclick never confirm it or restore anything; only activating Re-arrange or
  Restore itself does: a click, or Tab to the button and Enter or Space), the toast offers
  Undo for 10 s (a project's Undo puts back only that project's blocks; no Undo puts back the
  old spot of a block moved to another project since, it stays in its new band), and the arrangement it
  replaced is kept in **Layout history**, opened from the
  Re-arrange confirm or its toast: one list per style, up to its last 10 arrangements, each
  marked "Before Re-arrange · All projects", "Before Re-arrange · <project>" or "Before a
  restore", shared by every device of the gateway (200 in all, the oldest extra backups first).
  Restore there brings one back (with Undo): it replaces the whole layout, every project's blocks,
  also from a project scope; the arrangement it replaces is kept too.
- **Open** a session in a new tab with a double-click.
- **Act** on a session with a right-click (or its ⋯): Appearance ▸, Pin / Unpin, Rename…, Move to
  project ▸, Copy ID, Branch, Export, Mark as read / unread, Archive / Unarchive, Delete — the
  PROJECTS pane's menu. Delete asks first, says that branches stay as separate sessions, and is
  refused while the session runs. After Branch the page stays and selects the new child.
- **Filter.** The scope picker shows All projects or one project (other projects' blocks dimmed and
  read-only; Swimlanes collapses the other lanes instead). A scope only dims and frames: the blocks
  stay where All projects shows them. The profile filter defaults to the active
  profile and offers All profiles. **Show all** puts the sessions without branches on the canvas;
  **Show archived** shows archived sessions greyed out (their menu offers Unarchive). The chosen
  project is remembered per profile filter on this device: closing the page (or reloading) and
  opening it again shows the same project, filters and view (zoom and pan). A remembered project
  that no longer exists shows All projects.
- **Narrow windows** (a split view). The toolbar never squeezes its controls. When the project chips
  do not all fit next to the controls they get their own row below them; with less room the brand,
  then Show all / Archived / Snap / Fit show their icons only (the name stays in the tooltip); with
  less still the tools get a row of their own. A project row too long for the window scrolls (plain
  wheel, Shift + wheel or sideways swipe), fades out at the hidden end and keeps the selected
  project in view. The layout is the same at any text size (Settings → text size in the Webapp).

## The four styles

| Style | Look | Where singles go | Positions |
|---|---|---|---|
| **Dense + inspector** (default) | compact pills, thin curved links, tidy trees left to right, an inspector panel on the right | the inspector's list | one layout per style (every scope shows it) |
| **Project swimlanes** | one lane per project (alphabetical, no project last) with a header column, a local-day time axis, orthogonal links | a "no branches N" chip per lane | none: laid out from the data (no dragging, no Snap) |
| **Subway map** | each lineage a thick coloured line, sessions as stations, `/branch` as the line splitting into a new track, octilinear tracks, ×N capsules, a dotted planned line for "continued as", a map key | the depot strip at the bottom | one layout per style (every scope shows it) |
| **Rich cards** | airy 280 px cards with a last-message excerpt, a 7-day sparkline, model, a token bar; soft curved links | a right slide-out drawer | one layout per style (every scope shows it) |

Each style keeps its own positions (one layout per style and profile; the block sizes differ), and
every project scope of a style shows that same layout. Details: `docs/swimlanes.md`, `docs/subway.md`,
`docs/rich-cards.md`; the layout store: `docs/layout-sync.md`.

**Upgrading to one layout per style** (card 10): an earlier Session Tree kept a separate
arrangement per project scope. Updating keeps each style's All projects arrangement and drops the
per-scope arrangements (and their Layout history entries) on the first load, so every scope then
shows the All projects arrangement. Zoom and pan are remembered afresh (the earlier views were saved
for the old per-scope positions).

## Settings and sync

- **Settings → Plugins → Session Tree**: *View style* (synced), *On this device* (use the synced
  style, or one of the four), and the *Snap grid* default. The toolbar's style switcher changes the
  synced style, or this device's override when one is set.
- **Synced** across windows and devices of the gateway (through the plugin backend: push, with a
  5 s poll as the fallback): the style, block positions (one layout per style and profile), Snap and
  the Layout history.
  Positions are saved on drop (debounced, never per mouse move); when the backend is unreachable the
  page keeps the last saved layout ("offline: showing last saved layout") and queues drops.
- **Per device** (`ctx.storage`): zoom and pan, the project scope (per profile filter), the panel /
  drawer / depot open state and the Dense inspector's Singles list, Show all, Show archived, the
  profile filter and the style override. The selection is not kept.

## Known limitations

- **Needs input** has no SDK source (no `host.state` atom; card 1 pre-check 10): the styles draw it,
  but nothing sets it in a real Hermes today. The e2e shows it through a test-only hook in its own
  build (`--test-styles`), which the committed bundle does not contain.
- **7-day activity (Rich cards):** `COUNT(DISTINCT role || ':' || timestamp)` counts two messages of
  the same role with the same timestamp as one. (Card 6 review r1 N4.)
- **Excerpts (Rich cards):** some Markdown markers stay as text: emphasis across a soft line break,
  link targets over 512 characters, inline code over 240 characters (all inert plain text). The e2e's
  real-API excerpt timing uses 25 ids; 100 ids in one request are covered in pytest only.
  (Card 6 review r2 NB2, NB3.)
- **Space on the profile select:** while the toolbar's profile `<select>` has the focus, Space is
  given back to the canvas (it pans) instead of opening the list; a click and the select's other
  keys still work. A documented trade-off (card 3 NB4; `docs/measured-facts.md`).
- **Project swimlanes, excluded by the user** (card 5 review r3):
  - *N2:* a session that starts in the future (clock skew) re-routes about every 10 minutes — the
    future-start clamp uses the `nowMs` captured at each recompute, and every refetch recomputes.
  - *N3:* the now pill's gap and clipping noted in review r2 (its NB2) were not taken.
- **Subway map:** more than five splits from one station pack into the last slots (their drops
  overlap visually); every split drops below its parent (no up-splits); a label takes the first
  spot free of stations, labels and tracks, a station's own tracks avoided first — where no spot is
  free (crowded drops) it takes the least overlap and a track may still run under it; new
  sessions placed by the merge are not guaranteed corridor-free; after a drop, two re-routed tracks
  can share a corridor for a stretch (e.g. `st-md-tip → st-md-redline` and `→ st-md-katex` both on
  y = 898 for about 209 px in the card 7 review's crossing probe). Re-arrange gives the
  corridor-free auto-layout again. See `docs/subway.md` § Limits.
- **Rich cards merge:** a new card is placed on its base row or the rows below inside its group's
  shelf segment, else at the free spot of its group's own segments nearest to its parent (for a
  parent on its group's last shelf row, typically beside it on its own row). Only when its group's
  segments have no free spot at all does it go under everything, below a continuation label of
  its group, which can be far from its parent. It never lands in another group's segment, and no
  saved position moves.
- **No sidebar highlighting from the graph** (R19: no SDK verb); highlighting works the other way.
- **Re-arrange in a project scope** puts that project's blocks back at their automatic spots and
  leaves every other block where it is, so a block of another project that was dragged into that
  area can end up overlapping the reset blocks. Drag it away, or Re-arrange in All projects.
- **Selection:** bulk actions on a selection, Undo for a group move, box selection in Swimlanes and
  keyboard navigation between blocks are not part of this set. With Snap on, a group moves by the
  grabbed block's snapped offset, so its spacing is kept: blocks that already sit on the grid stay
  on it, while blocks placed off the grid (the auto-layout's spacing, or drops with Snap off) keep
  their offset from the grabbed block and land on the grid only after a drop of their own.

## Source map

| Path | What |
|---|---|
| `src/model/branch-tree.ts` | Port of the desktop's `session-branch-tree.ts` rules (forkParentId nesting, compression collapse); its tests are mirrored in `tests/js/branch-tree.test.ts`. |
| `src/model/graph.ts` | Rows + `projects.tree` → nodes, edges, families, singles, stand-ins, scope (`buildGraph`). |
| `src/model/layout.ts`, `layout-memory.ts` | Deterministic tidy-tree layout and the merge that places new sessions inside their own project group's band without moving placed blocks; the cards 2–3 in-memory positions (now only unit-tested). |
| `src/model/layout-sync.ts`, `device-prefs.ts` | Card 4: the synced layout store client (snapshot + queued changes, debounced batched saves, never during a drag, offline cache and retry, push/poll refresh, Re-arrange/Undo, a restore from Layout history; card 10: one layout per style, `layoutRef`, the scoped Re-arrange op) and the per-device preferences (`ctx.storage`, with the project scope per profile filter and the `viewport.v2` views). |
| `src/model/project-rearrange.ts`, `layout-undo.ts`, `camera.ts` | Card 10: what a Re-arrange in a project scope resets (the project's blocks and labels, at their fresh spots), what an Undo puts back (never the old spot of a block moved to another project since; review t_5e9be878 N1), and the camera of a scope (what Fit and a first visit frame, when a remembered view is kept). |
| `src/model/route.ts` | Link geometry and the R13 router: one `LinkRouter` per link shape (Dense, Rich cards: `curveRouter`; Swimlanes: `orthogonalRouter`, elbows with rounded corners; Subway: `octilinearRouter`, straight while dragging, 45°-chamfered on drop); on-drop detours on a sparse orthogonal grid (A*, on a 0.01 px lattice obstacles included), drawn rounded or chamfered. |
| `src/model/projects.ts`, `status.ts`, `format.ts` | Project membership, live status from `host.state`, display formatting. |
| `src/model/actions.ts` | The session actions' pure rules: routes (rename RPC vs backend), move targets, the delete gate and note, the export file name, the mutation-snapshot fence client, optimistic row overrides. |
| `src/model/selection.ts` | Card 9: the selection (a set with one primary block) and its rules — click, Shift toggle, box (full containment), Shift + box, Esc, Ctrl/⌘+A, the never-selectable blocks, what a refresh keeps — and the group offset of a multi-block drag (with Snap, by the grabbed block's snapped spot). |
| `src/styles/` | The style registry (`registry.ts`: the synced choice + device override), the style contract (`types.ts`, with the optional `frame` a data-only style uses), the Dense style (`dense/`), the Project swimlanes style (`swimlanes/`: the pure lane layout `layout.ts`, geometry `spec.ts`, blocks/links/chips, the header column + axis layers), the Rich cards style (`rich/`: top-down flow layout `layout.ts`, geometry `spec.ts`, the details store `details.ts`, canvas context `context.tsx`, cards/links `rich-flow.tsx`, details driver + drawer `layer.tsx`), the Subway map style (`subway/`: the track plan `plan.ts`, metro layout `layout.ts`, label placement `labels.ts`, geometry `spec.ts`, stations/tracks `subway-flow.tsx`, label driver + map key + depot `layer.tsx`, `subway.css`) and the test-only `e2e-alt/` (registered only in the e2e's own build). |
| `src/page/` | The page (data, refresh), the shared canvas shell (`graph-canvas.tsx`, with a framed style's layers), toolbar (with the style switcher; its narrow-width layout is the pure `toolbar-layout.ts`), the Re-arrange confirm and Layout history dialog (`layout-history.tsx`, its row and confirm text `history-labels.ts`), the block menu (`session-menu.tsx`, SDK ContextMenu), the actions controller with its dialogs (`session-actions.tsx`) and the shared services (`services.ts`: layout store, device prefs, push + poll). |

## Package layout (one unified Hermes package)

| Path | What |
|---|---|
| `plugin.yaml`, `__init__.py` | Agent half. No tools; it exists so `plugins.enabled` can mount the backend. |
| `dashboard/manifest.json`, `dashboard/plugin_api.py` | Python backend (FastAPI `APIRouter`) at `/api/plugins/session-tree/`, reached with `ctx.rest`: the session rows, the session actions the SDK has no verb for (rename, read state, archive, delete, export), each through the core endpoint's own code path, and the synced layout store. Projects come from the gateway's own `projects.tree` RPC (`host.request`). |
| `dashboard/layout_store.py` | The synced layout store (standard library only): `<HERMES_HOME>/session-tree/state.json`, atomic writes under a thread lock + `fcntl.flock`, caps, corrupt-file backup, prune, and the Layout history backups in `backups.json` (`docs/layout-sync.md`). |
| `dashboard/session_details.py` | Card 6: the Rich cards details (plain-text excerpt of the last message, 7-day activity) read through a read-only `SessionDB`, bounded per id (`docs/rich-cards.md`). |
| `desktop/plugin.js` | Desktop half. **Built output** of `src/` (`npm run build`), committed so the package installs without a build. |
| `src/` | TypeScript + JSX source: `plugin.tsx` (registration), `page/`, `settings/`, `model/` (pure graph rules), `shims/react-dom.ts`. |
| `tests/js/` | node:test unit tests and the static bundle guards. |
| `tests/py/` | pytest for the backend against an isolated, seeded Hermes home. |
| `scripts/` | build, the test-Hermes harness, the fixture seeder, e2e suites. |
| `docs/measured-facts.md` | Pre-check results and other measured facts. |
| `docs/layout-sync.md` | Card 4: the synced layout store, its endpoints, the page's sync rules, the test-only style. |
| `docs/swimlanes.md`, `docs/subway.md`, `docs/rich-cards.md` | Cards 5–7: the Project swimlanes, Subway map and Rich cards styles. |

### Backend API

- `GET /health?session_profile=<name|*>` → `{ ok, plugin, version, profiles }`.
- `GET /sessions?session_profile=<name|*>&include_archived=<bool>&limit=<n>` → `{ sessions, profiles,
  limit, truncated, errors }`. Rows are the core session list's (`SessionDB.list_sessions_rich`
  through Hermes's own read-only profile helpers, exactly as `GET /api/profiles/sessions`), with
  `SessionInfo` fields plus `is_internal_child` and `compacted_segments` (the number of earlier
  compression segments folded into the row). `limit` defaults to 500 and is capped at 2000.
- Every endpoint requires `session_profile`; a malformed name is a 400, an unknown profile a 404. The key is not `profile`: on plugin routes `?profile=` is the gateway's own profile selector (the Webapp sets it to the active profile on every `ctx.rest` call), so it cannot carry the data selection (see `docs/measured-facts.md`, pre-check 5).

Session actions (card 3; `session_profile` names one profile, `*` is a 400; an unknown session is a
404; ids and bodies are validated, bodies reject unknown fields):

- `GET /sessions/{id}/mutation-snapshot` → the core `GET /api/sessions/{id}/mutation-snapshot`
  (`runtime_revision`, `runtime_generation`): the fence the next edit sends back.
- `POST /sessions/{id}/rename` `{title, request_id, expected_revision, expected_generation}`,
  `POST /sessions/{id}/read` `{unread, …fence}`, `POST /sessions/{id}/archive` `{archived, …fence}`
  → `hermes_cli.web_server_sessions._mutate_session_request` (what `PATCH /api/sessions/{id}`
  runs): the live gateway owner, or the offline store under its maintenance lock; a stale fence is
  a 409 `revision_conflict`, a missing one a 409, a running turn a 409 `session_busy`. Archiving
  also unpins, like the app.
- `POST /sessions/{id}/delete` `{…fence}` → the core `DELETE /api/sessions/{id}` handler itself
  (fenced `delete` mutation and on-disk scrub). Branch children stay, orphaned. An id already gone
  answers the core's idempotent `{ok: true, already_absent: true}`.
- `GET /sessions/{id}/export` → the core `GET /api/sessions/{id}/export` stream's exact bytes,
  base64 in `{ok, session_id, title, encoding: "base64", content_type, bytes, sha256, body}`
  (`ctx.rest` parses every answer as JSON; the page writes the decoded bytes verbatim).
- Nothing in the backend writes `state.db` itself.

Synced layout store (card 4; `session_profile` may be `*`, the All profiles view's own layouts; see
`docs/layout-sync.md`): `GET /state[?since_rev=&epoch=]`, `PATCH /state/positions`, `PATCH /settings`,
`DELETE /state/layout?style=&scope=all` (Re-arrange in All projects), `PUT /state/layout` (Undo; `backup: true` for a
restore from Layout history), `PUT /state/layout/project` (card 10: a Re-arrange in a project scope,
or its Undo, per block), `POST /state/forget`, `GET /state/backups?style=` and
`GET /state/backups/{id}` (Layout history, one list per style).
They write only `<HERMES_HOME>/session-tree/state.json` and `backups.json`, and push `plugin.session-tree.layout.changed`
(`{epoch, rev, profile, kind}`). Positions are keyed by layout key (a compacted conversation's
lineage root, so a compaction does not move it), once per profile + style (scope `all`; a write to
another scope is a 409 `scope_layout_retired`); a `state.json` of a newer schema is served
read-only and never written (409 `newer_schema`).

Rich cards details (card 6; see `docs/rich-cards.md`): `POST /sessions/details`
`{profile, ids: [≤ 100], tz_offset_minutes}` → `{profile, tz_offset_minutes, days, details: {id:
{excerpt, excerpt_role, activity: [7]}}}`. `excerpt` is the last user / assistant message as plain
text (Markdown stripped, tags removed, tool-call payloads dropped), ≤ 240 characters, or `null`;
`activity` the user + assistant messages per local day of the last 7 days, oldest first. Unknown
ids are omitted; a 101st id is a 422. Read-only, bounded per id (one paged read + one indexed
count), about 1.8 ms per id on a 5,000-message session.

Gateway / SDK routes the page uses directly: `host.sessions.pin` / `setColor` (Pin, Appearance),
`session.branch_stored` (Branch), `session.workspace.move` (Move to project), `session.title`
(Rename of the session focused in the app), clipboard through the SDK `CopyButton`.

## Development

Toolchain: node ≥ 26 (type-stripping runs the `.ts` scripts directly) and npm 12. On this host:

```sh
export PATH=/home/david/.hermes/tools/npm-12.0.2-linux-x64/bin:/home/david/.hermes/tools/node-26.12.1-linux-x64/bin:$PATH
npm ci
```

| Command | What it does |
|---|---|
| `npm run build` | esbuild bundles `src/` into one ESM file, `desktop/plugin.js`. Only `@hermes/plugin-sdk`, `react`, `react/jsx-runtime` stay external; `react-dom` is aliased to `src/shims/react-dom.ts`. Fails on a copyleft dependency; `node scripts/build.mjs --licenses` prints the table below. |
| `npm run lint` | ESLint (typescript-eslint, react-hooks, plugin fences) and `tsc --noEmit`. |
| `npm test` | node:test unit tests, including the static guards on the built `desktop/plugin.js` (run `build` first). |
| `npm run test:py` | pytest for `dashboard/plugin_api.py`, run inside the Python environment Hermes itself runs in (see `scripts/run-pytest.sh`). pytest comes from a test-only venv under `~/.cache/session-tree-e2e/`. |
| `npm run test:e2e` | `scripts/run-e2e.sh`: every e2e suite in turn — `scripts/e2e-foundation.ts` (card 1), `scripts/e2e-core-dense.ts` (card 2), `scripts/e2e-actions.ts` (card 3), `scripts/e2e-sync.ts` (card 4: two browser contexts as two devices, a package built with the test-only style; also the Re-arrange confirm, Layout history opened from its toast and restored from the other device, and a reopened page keeping its scope and view), `scripts/e2e-swimlanes.ts` (card 5), `scripts/e2e-rich.ts` (card 6: the test-only build too, for its needs-input hook), `scripts/e2e-subway.ts` (card 7: the test-only build, for the same hook), `scripts/e2e-toolbar.ts` (the toolbar at window widths 1600 → 360 px and page widths 1400 → 340 px, fractional ones around every layout change too, in every style, with nine projects, and under Hermes' UI scale at 80–125 %: no overlap, nothing squeezed or clipped, the bar shows the row / stacked / wrapped layout it applied and the same one at any UI scale, the scope strip's wheel and Shift + wheel scroll and selected chip, light theme), `scripts/e2e-final.ts` (card 7: the whole-plugin check with the **committed** `desktop/plugin.js` — every style's actions, two-context sync, light/dark per style, the 500-session fixture per style), `scripts/e2e-select.ts` (card 9: box selection and group moves in Dense, Subway and Rich cards, two contexts, the 500-session group drag; `SESSION_TREE_SELECT_ONLY=scale` runs only that last check) and `scripts/e2e-shared.ts` (card 10: one layout per style — the migration on a copy of the real store, then in Dense, Subway and Rich: a scope never moves a block, the first visit and Fit frame the project, a block dragged in a scope shows in All and in a second context, a scoped Re-arrange with its Undo and Layout history entry; in Dense, the Undo of a project and an All Re-arrange after a block moved to another project, and the confirm's block count; `SESSION_TREE_REAL_STATE` names the store copy). The actions, sync, swimlanes, rich, subway, toolbar, final, select and shared suites mutate (or add to) their fixtures, so each runs in its own fresh home `c<card>-<role>-actions` / `-sync` / `-swim` / `-rich` / `-subway` / `-toolbar` / `-final` / `-select` / `-shared` on the same ports, the previous one moved to the e2e trash (which is then pruned to the newest copy of each home name, `scripts/e2e/trash.ts`). The foundation and core-dense suites share the role's plain home, which `run-e2e.sh` resets first (`test-hermes reset`), so full runs repeat back to back with no manual step. Each starts the isolated test Hermes, signs in, enables the desktop half and checks the page in Chrome with real mouse/keyboard input. `KEEP_RUNNING=1` leaves the gateway up. |
| `npm run clean:e2e` | `scripts/e2e/clean.ts`: frees the disk the test homes take (a full `test:e2e` makes 7 homes of about 460 MB). Removes the e2e trash and this role's stopped test homes of the current card (`c<card>-<role>`, `c<card>-<role>-<variant>`; `SESSION_TREE_ROLE`); `npm run clean:e2e -- --all` does every card's and role's. Keeps `pytest-venv` and everything that is not a test home (logs, screenshot folders), refuses (and removes nothing) while a test gateway runs, and prints each removed path with its size. All deleting goes through one guarded helper (`deleteTrashEntry`): only a direct child of the real `<e2e root>/trash`, never following a symlink (test homes link this checkout into `plugins/session-tree`), never a home whose gateway is alive. |
| `node scripts/capture-fixtures.ts` | Re-captures `tests/js/fixtures/{default,scale}.json` (backend rows + `projects.tree`) from a running, seeded test Hermes. |

### The isolated test Hermes

Never test against your real Hermes. `scripts/test-hermes` manages one isolated Hermes per role
outside `~/.hermes`:

```sh
scripts/test-hermes start     # setup + `hermes webapp --no-open --skip-build`, prints a one-use sign-in link
scripts/test-hermes status    # gateway pids and TCP listeners
scripts/test-hermes link      # a fresh sign-in link (valid 60 s)
scripts/test-hermes backend off|on   # take session-tree out of / back into plugins.enabled, restart
scripts/test-hermes stop
scripts/test-hermes reset     # stop and move the role's root to ~/.cache/session-tree-e2e/trash/ (then pruned)
```

- The trash keeps only the newest moved-aside copy of each home name (the last run's evidence);
  `npm run clean:e2e` empties it (see Development).
- Role `SESSION_TREE_ROLE=coder` (default) or `reviewer`, card `SESSION_TREE_CARD` (default: the
  current card from `scripts/e2e/CARD`, 9 — the one place the number lives; `npm run test:py` and
  `scripts/test-hermes` take their root from the harness): root `~/.cache/session-tree-e2e/c<card>-<role>/`, ports `19300 + 10·card`
  (+0..+4 coder, +5..+9 reviewer). Card 9: coder home `c9-coder/home`, ports 19390–19394 (the
  Webapp on 19390); reviewer `c9-reviewer`, ports 19395–19399. The actions, sync, swimlanes, rich,
  subway, final and select suites' own homes are `c9-<role>-actions`, `-sync`, `-swim`, `-rich`,
  `-subway`, `-final` and `-select` (same ports, never running at the same time as
  the other suites). Setup moves the shared home's layout store aside first
  (`<root>/layout-store-old/`), so synced positions and Snap from an earlier run do not carry over.
- Setup writes the test config with `hermes config set` (`webapp.enabled true`, `webapp.host
  127.0.0.1`, `webapp.port`, `plugins.enabled: [session-tree]`), symlinks this checkout into the
  **test home's** `plugins/session-tree`, creates the `work` and `scale` profiles and seeds fixtures.
- The Webapp bundle is always reused (`--skip-build`); nothing is built in the Hermes checkout.
- `scripts/seed-fixtures.py` creates the fixtures through Hermes's own `SessionDB` API (three
  project repos, the mockup families incl. a grandchild, a 4-segment compressed conversation, a
  `/new` reset chain, an orphaned branch, a cross-project family, 24 singles, 2 archived, one
  recently active session, hidden delegate/cron/kanban/tool sessions, a second profile with 3
  sessions and a 500-session `scale` profile). Direct SQL touches only timestamps of the isolated
  fixture DB. Every row carries the owner stamp a signed-in Webapp tab gives its own rows
  (`user_id` = the host owner), so the core accepts that login's edits. `--branch NEW PARENT [TITLE]`
  and `--activate ID` (used by the card-2 e2e) add a live branch and stamp a session active now;
  `--unowned-branch NEW PARENT [TITLE]` adds one without the owner stamp (card 3's real refusal);
  `--inf-cost-branch NEW PARENT [TITLE]` one with an infinite cost and `--delete ID` removes a row
  (card 4's failed-load check); `--rich` adds the card-6 family `st-rich-*` whose last messages hold
  Markdown, a code block, HTML-looking text, a very long message, a tool call and a long tool run;
  `--pathological [PROFILE]` adds 200 KB pathological last messages (card 6 B1) and, since card 7,
  five 200 KB messages that start with dropped blocks (`st-patho-lead-*`: a leading `<think>`, tool
  call, `<style>` + `<script>`, 28 reasoning blocks, an unclosed one).
- The desktop half ships disabled; the e2e enables it in Capabilities → Plugins like a user.

## Dependencies and licenses

Runtime code bundled into `desktop/plugin.js` (exact versions from `package-lock.json`; direct
dependencies are pinned exactly in `package.json`):

| Package | Version | License |
|---|---|---|
| @xyflow/react | 12.12.1 | MIT |
| @xyflow/system | 0.0.84 | MIT |
| classcat | 5.0.5 | MIT |
| d3-color | 3.1.1 | ISC |
| d3-dispatch | 3.0.2 | ISC |
| d3-drag | 3.0.1 | ISC |
| d3-ease | 3.0.2 | BSD-3-Clause |
| d3-interpolate | 3.0.2 | ISC |
| d3-selection | 3.0.1 | ISC |
| d3-timer | 3.0.2 | ISC |
| d3-transition | 3.0.2 | ISC |
| d3-zoom | 3.0.1 | ISC |
| use-sync-external-store | 1.7.0 | MIT |
| zustand | 4.5.7 | MIT |

React and react-dom are **not** bundled: `react` comes from the host app, and React Flow's
`createPortal` is served by `src/shims/react-dom.ts`. Development-only tools: esbuild 0.28.2 (MIT),
eslint 10.14.0 (MIT), typescript-eslint 8.72.2 (MIT), typescript 6.0.3 (Apache-2.0),
eslint-plugin-react-hooks 7.1.1 (MIT), playwright-core 1.65.0 (Apache-2.0), es-module-lexer 3.0.4
(MIT), pytest 9.2.0 (MIT, test venv only). No copyleft code is in the bundle; the build enforces it.

## Install into your Hermes (later, with the user)

Not done by any worker: it happens after the whole set is reviewed, by the parent session, with the
user's go-ahead (R21). The steps, for that session to run:

1. **Check out the reviewed branch** in `/home/david/work_projects/session-tree`: the user merges
   the set into `dev` there. The symlinked checkout serves whatever branch is checked out, with no
   build: `desktop/plugin.js` is committed.
2. **Check the gateway is not mid-turn** for anything you care about (step 5 may restart it).
3. **Link the package** into your Hermes:
   `ln -s /home/david/work_projects/session-tree ~/.hermes/plugins/session-tree`
   (the user's checkout; never a worktree).
4. **Allow the backend half**: `hermes plugins enable session-tree`. It adds `session-tree` to
   `plugins.enabled` and keeps the entries already there (it also takes it out of
   `plugins.disabled`, which it writes as `[]` when absent); `plugin.yaml` declares
   `capabilities: []`, so there is no consent prompt. With a gateway running it reloads its plugins
   and prints what went live or that a restart is needed; with none it prints nothing more.
5. **Restart the gateway** if step 4 said so (`hermes gateway restart`), so the backend mounts.
   Check `GET /api/plugins/session-tree/health?session_profile=default` answers `{"ok": true, …}`
   (in the Webapp: the page no longer says "Session Tree's backend is off").
6. **Enable the desktop half**: Capabilities → Plugins → Installed → Session Tree → the **Desktop**
   switch (it ships disabled), in the desktop app and in each Webapp browser.
7. Open **Session Tree** from the sidebar. The first view of each style lays itself out and saves its
   positions under `~/.hermes/session-tree/state.json` (the only file the plugin writes).

To remove it: switch the desktop half off, run `hermes plugins disable session-tree` (it takes the
entry out of `plugins.enabled`, keeps the others, lists it in `plugins.disabled`, and says whether
the gateway still needs a restart), delete the symlink; `~/.hermes/session-tree/` holds the saved
layouts (delete it to forget them).
