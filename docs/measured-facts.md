# Measured facts — Session Tree 1/7 (foundation)

Measured 2026-11-09 by the card-1 coder against Hermes checkout `~/.hermes/hermes-agent` at
`2bd378ed1b` (client/backend v0.23.0), in the isolated test Hermes
`~/.cache/session-tree-e2e/c1-coder/home` (ports 19310–19314). File references are to that
checkout (read-only).

## Step 0 — environment

| Fact | Value |
|---|---|
| Worktree / branch | `/home/david/work_projects/session-tree-wt/session-tree`, `feature/session-tree` |
| Card start | HEAD `3806503ec73a59bf9220f0aafe5884b497d2bd0c`, `git status --short` empty |
| Baseline gates | none existed (0 lint files, 0 JS tests, 0 pytest tests, 0 e2e checks) |
| Toolchain | node 26.12.1 (`~/.hermes/tools/node-26.12.1-linux-x64/bin`), npm 12.0.2 (`~/.hermes/tools/npm-12.0.2-linux-x64/bin`) |
| Browser | `/usr/bin/google-chrome` through playwright-core 1.65.0 |
| Host React | 19.3.0 (`apps/desktop/package.json`) |

### The Python Hermes runs in (for `npm run test:py`)

- `~/.hermes/hermes-agent/.hermes/bin/hermes` is a launcher that execs the bundled interpreter
  `~/.hermes/tools/python-3.14.9+…-linux-x64/bin/python3 -I -c '<bootstrap>'`.
- `hermes --print-runtime-command` prints the runtime command:
  `python3 -I -c "import os, sys, runpy; …; sys.path.insert(0, '<checkout>'); sys._hermes_pin_default_home = True; import hermes_bootstrap; …; runpy.run_module('hermes_cli.main', …)"`.
- Under a fresh `HERMES_HOME` the stock launcher refuses: `no dependency environment is committed
  for this install; run hermes pm repair` (repair would write into the user's install, so it is
  never run).
- The test launcher `<root>/hermes` (written by `scripts/e2e/harness.ts` `ensureLauncher`) runs that
  same runtime command with the install's committed venv Python
  (`packages.venv.environment` in `~/.hermes/installs/56f548f9b7fd67d0/facts.json` →
  `…/environments/8e720cd570b24f2eb469291f11c9945d/venv/bin/python`). On first use
  `hermes_bootstrap` builds a dependency environment for the test data root under
  `<test home>/installs/` ("Installing Python dependencies"); `~/.hermes/installs` is not written.
  The gateway it starts runs as
  `python3 -m hermes_cli.main --profile default gateway run --quiet` with
  `PYTHONPATH=<checkout>:<test home>/installs/…/venv/lib/python3.14/site-packages`.
- The committed venv alone is not a complete Hermes environment (`import hermes_cli.config` →
  `ModuleNotFoundError: ruamel`); scripts therefore run through the launcher:
  `<root>/hermes --run-path <script.py> [args]`.
- **Exact `test:py` command** (`scripts/run-pytest.sh`):
  `env -i HOME=<root>/userhome HERMES_HOME=<root>/home TMPDIR=<root>/tmp … <root>/hermes --run-path scripts/pytest-main.py -p no:cacheprovider --rootdir tests/py --basetemp <root>/pytest-tmp tests/py`
  (`<root>` = `~/.cache/session-tree-e2e/c<card>-<role>`; card 2 made `--basetemp` per role, it
  was a shared `~/.cache/session-tree-e2e/pytest-tmp` in card 1).
- pytest 9.2.0 (MIT) lives in a test-only venv `~/.cache/session-tree-e2e/pytest-venv`
  (created `--system-site-packages` from the committed Python). **Measured:** a venv made from a
  venv with `--system-site-packages` sees the *base interpreter's* site-packages
  (`python-3.14.9+…/lib/python3.14/site-packages`), not Hermes's venv, so `import fastapi` fails
  there. So the direction is reversed: the tests run inside Hermes's runtime (the launcher) and
  `scripts/pytest-main.py` appends the pytest venv's site-packages to `sys.path`. Nothing is
  installed into Hermes's environment.

## Pre-check 1 — react-dom (path (a) chosen and proven)

- `@xyflow/react` 12.12.1 `dist/esm/index.js:9`: `import { createPortal } from 'react-dom';` —
  the only react-dom import; used by `EdgeLabelRenderer`, `ViewportPortal` and `NodeToolbar`.
- **(a) esbuild alias** `react-dom` → `src/shims/react-dom.ts`. `createPortal` there returns the
  same element React 19.3's `react-dom` builds
  (`{ $$typeof: Symbol.for('react.portal'), key, children, containerInfo, implementation }`,
  `react-dom/cjs/react-dom.development.js:18`). A portal is plain data; the host's own react-dom
  reconciler mounts it, because it renders the plugin's tree.
- Two more build fixes were needed for the loader:
  - `use-sync-external-store` (via zustand) is CommonJS and `require('react')`s: esbuild turned
    that into a throwing `__require("react")` stub. A build plugin resolves `require('react')` to a
    tiny ESM module that re-exports the external `react` with a real `import`.
  - zustand reads `import.meta.env.MODE`; it is defined as `"production"`.
- **Proof in the real loader** (`scripts/e2e-foundation.ts`): the plugin loads in the isolated
  Webapp with no load error, and the "continued as" edge label renders *inside*
  `.react-flow__edgelabel-renderer` (the portal target, not inline in the SVG), text
  `continued as`, box 60×14 px. Path (b) was not needed.
- Bundle guard (`tests/js/guards.test.ts`, es-module-lexer): the only import specifiers are
  `@hermes/plugin-sdk`, `react`, `react/jsx-runtime`; no dynamic `import()`, no `import.meta`, no
  `eval(` / `new Function`, no `__require(`, no `react-dom`.
- **Bundle size: 378 706 bytes** (`desktop/plugin.js`, 31 esbuild inputs; loader cap 16 MiB =
  16 777 216 bytes; the test budget is 2 MiB).

## Pre-check 2 — listeners of the isolated gateway

`ss -ltnp` / `ss -lxp` for the gateway (the only process whose environment names the test
`HERMES_HOME`), after `hermes webapp --no-open --skip-build`:

| Listener | Owner | How it is placed in the port block |
|---|---|---|
| TCP `127.0.0.1:19310` | Webapp listener (`gateway/webapp_listener.py`); it also serves `/api/ws` and `/api/plugins/*` | `webapp.port` (+ `webapp.host 127.0.0.1`) in the test config |
| unix `<home>/gateway.sock` | control socket | inside the test home; no port |
| unix `<home>/state/gateway.loop-tick.<pid>.sock` | loop tick | inside the test home; no port |

No other TCP listener opens with this config: the API-server platform (`platforms.api_server`),
`hermes dashboard` and `hermes proxy` are off / not started. The kanban dispatcher runs but only
holds a file lock in the test home. If any of those were turned on, their port keys
(`platforms.api_server.port`, `hermes dashboard --port`, `hermes proxy … --port`) would take 19311–19314.
The e2e asserts every listener of every test-home process is inside 19310–19314 and none is
forbidden.

## Pre-check 3 — `hermes webapp --skip-build` rebuilds nothing

- `hermes_cli/webapp.py:116`: with `skip_build` it only checks `dist-webapp/index.html` exists,
  prints `→ Reusing Hermes Webapp renderer at …/apps/desktop/dist-webapp (--skip-build)` and takes
  no build lock. The harness refuses to continue unless that line is printed.
- Before/after (start of the card vs. after every gateway start and e2e run):
  `git -C ~/.hermes/hermes-agent status --short` empty both times; HEAD `2bd378ed1b8d…` both times;
  `dist-webapp` listing (1 212 entries, every mtime and size) hash unchanged; `~/.hermes/config.yaml`
  sha/mtime, `~/.hermes/plugins/` and `~/.hermes/desktop-plugins/` listings unchanged. The e2e
  checks this automatically (`scripts/e2e/real-hermes-guard.ts`).

## Pre-check 4 — desktop half copy and enabling

- The Webapp's `/api/desktop-plugins/root` runs `reconcile_desktop_halves`
  (`hermes_cli/web_routers/desktop_plugins.py:96`), which copies `plugins/session-tree/desktop/`
  into `<home>/desktop-plugins/session-tree/` with a `.hermes-package.json` marker (`"linked": true`
  for the symlinked dev checkout; only the `desktop/` folder is copied, never `node_modules`).
  Observed: `desktop-plugins/session-tree/{plugin.js,.hermes-package.json}` after the first page load.
- It ships disabled. The harness enables it the user's way: Capabilities → Plugins → search
  "session" → catalog **Filters** → **Installed** → the grid card's own package switch
  **"Session Tree"** (`CatalogSwitch aria-label={pkg.name}`, `plugins-tab.tsx:772`; it enables
  every half). It then opens the detail view through the deep link
  `/capabilities?tab=plugins&plugin=session-tree` (`useDeepLinkHighlight`, `plugins-tab.tsx:630`)
  and asserts that the per-half switch **"Desktop: Session Tree"** reads on. Clicking the card's
  text does not open the detail view on a first-run home (attempt 1 failed there). The
  backend-off check uses only the per-half switch, so the agent half stays off. The choice
  persists in the browser's `localStorage['hermes.desktop.pluginDecisions.v2']`
  (`{"session-tree": true}`, `contrib/plugins-store.ts:38`), so every fresh browser context must
  flip it again (the e2e does). The harness never writes that key itself.

## Pre-check 5 — backend reach; `ctx.socket` in the Webapp

- `ctx.rest` reaches `/api/plugins/session-tree/*` from the Webapp (the page renders from it). The
  Webapp's REST bridge carries the sign-in credential; a bare `fetch()` to the same route gets 401.
- **`ctx.socket` does not work in the Webapp — it never dials.** Probe: a throwaway unified package
  `st-probe` (in the test home only) with a `@router.websocket('/events')` and a desktop half calling
  `ctx.socket('/events', …)`. Result after 12 s: no frames; playwright saw only the core socket
  `ws://127.0.0.1:19310/api/ws?native_dial=browser`, no dial to `/api/plugins/st-probe/events`.
  Cause, by design: `api/plugins.ts:196` returns early when `!hostHas('urlTokenAuth')` — "the
  browser-hosted Desktop (its session token never rides a URL): stay on the polling fallback".
- **Push that does work in the Webapp:** `broadcast_plugin_event('st-probe', 'ping', {'n': 1})` from
  the backend arrived at `host.onEvent('plugin.st-probe.ping')` as
  `{"type":"plugin.st-probe.ping","session_id":"","payload":{"n":1},…}`. → Card 4: push layout
  changes with `broadcast_plugin_event` + `host.onEvent`, keep polling as the fallback; do not use
  `ctx.socket`.
- **`?profile=` is reserved on plugin routes (deviation from the card's `profile=` parameter).**
  The Webapp transport adds `?profile=<active profile>` to every `ctx.rest` call unless the path
  already has one (`lib/browser-transport.ts:64`), and the gateway uses it to pick which profile's
  plugin scope serves the request (`plugin_request_scope`, `web_server_plugin_profiles.py:183`); a
  request routed to a secondary profile's plugin host gets `profile` stripped
  (`_GATEWAY_QUERY_KEYS`). Measured: `GET /sessions?profile=scale` from the Webapp answered
  `404 {"detail":"Plugin not found"}` (session-tree is enabled for `default` only). So the backend's
  data selector is **`session_profile=<name|*>`**; `profile` stays the gateway's routing key and is
  left to the transport. A profile without the plugin enabled therefore shows the "backend is off"
  EmptyState, which is what its text asks for.

## Pre-check 6 — open in a tab

Double-clicking a block calls `host.openSession(id, { intent: 'tab' })`. In the Webapp the
workspace gains a tab for that stored session ("EDGE ROUTING: LIBAVOID" after double-clicking the
`st-hp-routing` block; the tab count rose from 2 to 4 because the workspace tab strip appears with
its "New session" tab). Checked by `scripts/e2e-foundation.ts`.

## Pre-check 7 — change events

Subscribed through `host.onEvent` in the Webapp; a fixture rename through `SessionDB.set_session_title`
produced `sessions.changed`, and `hermes project create …` produced `projects.changed`. Both
arrived (`tui_gateway/change_watcher.py:381` polls state.db every 0.5 s with a 2 s broadcast
floor; projects.db every 2 s).

## Pre-check 8 — "compacted ×N"

- The core list already merges a compression lineage into one row: `list_sessions_rich(…)` with
  `include_children=False` hides continuation rows in SQL and `project_compression_tips`
  (`hermes_state_session_list.py:5`) projects the root row onto its live tip, setting
  `_lineage_root_id` (root id), `_lineage_ids` (root → tip) and `continuation_kind: 'compression'`.
  The client then collapses any duplicates by profile + `_lineage_root_id` (core
  `collapseCompressionLineages`).
- **N = `len(db.get_compression_chain(_lineage_root_id)) − 1`**, computed by the backend as
  `compacted_segments`. Not `len(_lineage_ids) − 1`: for a canonical *local* reset lineage
  `annotate_local_lineages` (`hermes_state_local.py:379`) also folds the reset segments into
  `_lineage_ids` (and, per `exclude_superseded_segments`, the core list then shows the whole reset
  chain as one row; only resets without a local receipt, such as gateway/messaging `/new`, keep
  separate rows with `_reset_from`). This is read from the source, not exercised: the fixtures'
  reset chain is created without a local receipt, so it keeps two rows and a "continued as" link.
- A branch child may name any segment as its parent (`_branched_from` = a middle segment): the graph
  resolves every id in `_lineage_ids` to the visible block. The core sidebar maps only the root id.
- Fixture: 4 segments → `compacted_segments` 3 on the tip.

## Pre-check 9 — branch point: **No, not reliably**

- `branch_in_transaction` (`hermes_state_mutation_branch.py:85`) copies the parent's active rows up
  to `through_message_id` and returns `copied_messages` only in the mutation result. The child row
  stores just `model_config._branched_from`; `message_count` keeps growing as the branch continues.
- The result survives only inside a `state_meta` mutation receipt keyed by an admission fingerprint
  (`hermes_state_runtime.py:470`), not by child id, exists only for branches made through that
  runtime path (not legacy TUI `/branch`), and `retire_mutation_receipts` rewrites receipts.
- Cloned rows are byte-exact copies (timestamps included, `_clone_message_rows`), so a
  common-prefix comparison against the parent is possible, but it breaks after the parent is
  compressed, rewound or deleted.
- → R22: omit the "branched at msg N" pill.

## Pre-check 10 — live status sources

`host.state` keys in the Webapp: `activeSessionId, awaitingResponse, busy, busyBySession,
connectionId, cwd, focusedSessionId, focusedSessionOwner, focusedSessionProfile,
focusedStoredSessionId, focusedUsage, gateway, model, profile, viewport`.

| Status | Source | Limits |
|---|---|---|
| running | `host.state.busyBySession` | keyed by **runtime** session id, only sessions open in this window; runtime→stored id is exposed only for the focused session (`focusedSessionId` ↔ `focusedStoredSessionId`). Backend rows add `is_active` (core 300 s activity heuristic, `_tag_rows`) |
| needs input | — | **not exposed**: no `host.state` atom; approvals/clarify live in app stores keyed by runtime id. Only gateway events via `host.onEvent` remain |
| unread | backend row `unread` (`SessionDB.session_unread`) | — |
| open in app | `host.state.focusedStoredSessionId` | — |

The isolated Hermes has no model provider and no stub provider was found, so "running" and
"needs input" cannot be produced for real; later cards must inject them at the `host.state`
boundary in unit tests.

## Other facts found on the way

- The Webapp shows a first-run "Let's get you setup" provider dialog once per test home; the harness
  clicks "I'll choose a provider later".
- Plugin backends mount at gateway start only for packages in `plugins.enabled`
  (`Mounted plugin API routes: /api/plugins/session-tree/` in `logs/gateway.log`).
- `hermes profile create <name>` sets `gateway.multiplex_profiles: true` in the test config.
- The core sidebar hides sessions with no messages (`min_messages=1`); the graph model does too.

---

# Measured facts — Session Tree 2/7 (graph core + Dense + inspector)

Measured 2026-11-09 by the card-2 coder in the isolated test Hermes
`~/.cache/session-tree-e2e/c2-coder/home` (ports 19320–19324; the harness now derives home and
ports from `SESSION_TREE_CARD`, default 2: `c<card>-<role>`, `19300 + 10·card`, reviewer +5).

## Step 0

HEAD `e8a04a214e05930d45ed0f8167e09cb3f2feda21`, `git status --short` empty. Card-1 baseline
(reviewer-measured): lint 0, build 0 (378 706 B), `npm test` 35/35, `test:py` 28, `test:e2e` 19/19.

## Bundle

- **`desktop/plugin.js`: 471 726 bytes** (48 esbuild inputs) after fix r1 (was 467 052 at
  `b52eaf9`), byte-identical over two builds (sha256 `19dc53bd…416e14b`). Loader cap 16 MiB; test
  budget 2 MiB. No new runtime dependency.

## `projects.tree` as the scope source

- Called through `host.request('projects.tree', { profile, preview_limit: 0 })`, once per profile in
  the filter (every profile for "All profiles"), merged by project id. Nodes: `id` (an auto
  project's id is its repo root path; the home bucket is `__no_project__`, label "Home"), `label`,
  `color` (null for the fixtures' auto projects, so their blocks use the theme's quaternary text
  colour), `icon`, `isNoProject`, `isAuto`, `repos[].path`, `sessionIds`.
- `sessionIds` come from `list_sessions_rich(include_children=False, include_archived=False)`
  (`tui_gateway/methods_projects.py` `_project_tree_inputs`): compression tips by their visible
  (tip) id, and **no archived rows**. The model therefore matches a row by its id, lineage root or
  any segment id, and an archived row (shown via "Show archived") by its `git_repo_root`/`cwd`
  under a project's repo path (longest match), else the home bucket.
- On a cold page load the gateway socket can still be connecting: the projects query retries
  (4 × 750 ms) and the page lays nothing out until it settles, so a layout never groups every block
  under "no project".

## Opening a session from the graph (R2)

Double-click → `host.openSession(id, { intent: 'tab' })`. Measured in the Webapp: a session tab
"EDGE ROUTING: LIBAVOID" is stacked beside the page, the page keeps its route (`#/session-tree`),
`host.state.focusedStoredSessionId` becomes the opened id, and the block shows the "open in app"
ring (R11). Out-of-scope blocks and stand-ins never open.

## Live status sources (R11) — what is real and what is simulated

| Status | Source in this card | How it is checked |
|---|---|---|
| running | backend row `is_active` (core 300 s heuristic) | **e2e, real backend path**: `seed-fixtures.py --activate st-sys-pairing` stamps the fixture's last activity now (fixture-only direct SQL on timestamps); the block turns `running` after `sessions.changed`. |
| running (focused, mid-turn) | `host.state.busy` / `busyBySession[focusedSessionId]` | **simulated**: unit tests inject `host.state` snapshots (`tests/js/status.test.ts`); no provider can run a turn in the test Hermes. |
| needs input | none — the SDK exposes no source (pre-check 10) | **simulated**: the status function takes a `needsInput` set; unit tests inject it; the page passes an empty set. |
| unread / pinned | backend row | unit tests; `st-hp-root` shows the pin. |
| open in app | `host.state.focusedStoredSessionId` | e2e (after the double-click above). |

## R3 navigation in React Flow 12.12.1

- `panOnDrag={[1]}` (middle button only), `panActivationKeyCode="Space"` (Space makes every
  button pan, `FlowRenderer`: `panOnDrag = panActivationKeyPressed || panOnDrag`), `zoomOnScroll`
  (zooms at the pointer), `selectionOnDrag={false}`, `selectionKeyCode`/`multiSelectionKeyCode`/
  `deleteKeyCode` `null`, `zoomOnDoubleClick={false}`, zoom 0.3–2.5.
- React Flow does not stop the middle button's browser defaults; capture-phase listeners on the
  canvas (`ctx.addEventListener`) `preventDefault` `mousedown`/`mouseup`/`auxclick` for button 1.
  e2e: all three arrive `defaultPrevented: true`, no `paste` event, no scroll change.
- Measured: wheel −240 at a block point zoomed 125 % → 174 % and the point under the cursor moved
  (0.20, 0.10) px; 12 more wheel-ups clamp at 250 %, 20 wheel-downs at 30 %. Middle-drag (140, 90)
  panned exactly (140, 90); Space + left-drag (−110, 60) panned (−110, 60); left-drag on empty
  canvas kept the viewport and cleared the selection.
- Space + left-drag also pans when it starts on a block (fix r1): while Space is held every block
  is rendered `draggable: false`, so it has no `nopan` class and d3-zoom takes the drag. Measured:
  Space + drag (100, 60) from `st-sys-tip` panned (100, 60), the block stayed put. A Space typed in
  a form field does not count (same rule as React Flow's key handling).
- The profile `<select>` blurs after a change: a focused form control swallows the Space key, so
  Space + drag did not pan after choosing a profile. (Its Escape handler never ran while the native
  list was open, so a select closed without a change kept the focus; card 3 fixed that, see the
  card-3 section.) The other toolbar controls never
  take focus from the mouse (`mousedown` default prevented). Measured: after work → default the
  active element is `BODY` and Space + drag (80, −50) panned (80, −50).
- Show archived keeps the canvas mounted (fix r1): the sessions query keeps the previous rows as
  placeholder data while the same profile refetches, so no "Loading sessions…" state, no remount and
  no re-fit. Measured: the viewport stayed at (165.5, 119.75, 1.25) through on and off, the selection
  and inspector stayed, and the loading state never appeared (MutationObserver count 0).
- Snap: `snapToGrid` with a 16 px grid and a dot `Background` whose pattern pitch is 16 × zoom; a
  drop of (+37, +23) px landed on (480, 48) (multiples of 16); with snap off a (13, 7) flow-px drag
  moved the block by exactly that.

## R13 router (middle ground)

- While a block is dragged, its links are redrawn live from the blocks' current rectangles (the
  stored route no longer matches the ends, so the plain bezier is drawn). On drop, every link is
  checked against every other block (`routeLinks`); a crossing one gets an orthogonal A* path on a
  sparse grid around the obstacles inflated by 12 px (6, 3, then 1 px when a block sits next to a
  port), drawn with corner radius below the clearance, and validated by sampling. From its stub the
  path may turn (only doubling back into the source block is barred), so a port 4 px from a
  neighbour leaves through the gap; only a neighbour under 2 px away boxes a port in. The
  randomised unit test drops a block 0–10 px from each port: 400 rounds, 805 close drops, 62 boxed
  in (counted, bounded ≤ 25 %), every other round with no sampled point inside another block.
- e2e: the cross-project link stretched to 460 px stays plain; dropping `st-md-redline` onto it
  makes it `data-detoured="true"`; 121 screen-space samples of that path (SVG
  `getPointAtLength` × CTM) and of all 12 links enter no other block.

## Live refresh

`sessions.changed` / `projects.changed` through `ctx.onEvent`, plus a 10 s poll while the page is
visible. A branch seeded with `seed-fixtures.py --branch` while the page was open appeared after
782 ms; none of the 20 existing blocks (one of them user-dragged) moved.

New blocks go inside their own project group's band, from under its label down to the next group's
label (fix r1): a new family member next to its relative (parent's next column, nearest free row),
else in the next column to the right with a free row in the band; a new family or single at the
first free spot of its band; a family taller than its band under everything, with a continuation
label of its project; a project with no group yet as a labelled block under everything. Measured on
the fixture: the live child of `st-hp-root` landed at (444, 276) in the hermes-plugins band
(220–310), the live child of `st-sys-tip` at (444, 128) in the syscanvas band (26–194), both
overlapping nothing, in All projects and in the syscanvas scope; no existing block moved.

## 500-session scale fixture

Profile `scale` with **Show all** (500 blocks laid out: 10 families of 10 + 400 singles):

- **time to first render: 321 ms** (from choosing the profile to the first block drawn, including the
  backend fetch of 500 rows and `projects.tree`); React Flow's `onlyRenderVisibleElements` is on
  above 150 blocks (335 block elements in the DOM at that zoom).
- **scripted 2 s middle-drag pan: 123 frames in 2003 ms = 61.4 fps** (requestAnimationFrame count,
  120 real mouse moves).
- After fix r1 (`ea5cb4d`): first render **313 ms**, pan **123 frames in 2005 ms = 61.3 fps**
  (reviewer baseline at `b52eaf9`: 314 ms, 60.3 fps). Turning Show all on over the existing
  `scale` layout places the 400 singles in their bands in about 25 ms (`mergeLayout`, node).

## Deviations

- `scripts/e2e-foundation.ts` (card 1) keeps all its checks, but two now assert the card-2 graph
  instead of card 1's plain boxes: blocks + the inspector's singles list together equal the visible
  rows, and the orphaned branch links from its "Parent not loaded" stand-in instead of being unlinked.
- The block context menu shows the R14 items disabled (card 3 wires them), so the R5 check can
  contrast an in-scope block (menu opens) with a dimmed one (no menu).
- Selecting is limited to in-scope session blocks: stand-ins and dimmed blocks are not selectable
  from the canvas or the inspector links (R5 "no selection").

---

# Measured facts — Session Tree 3/7 (session actions)

Measured 2026-11-09 by the card-3 coder in the isolated test Hermes `~/.cache/session-tree-e2e/c3-coder/home`
(ports 19330–19334; the harness default card is now 3) and, for the mutating e2e, its own fresh home
`c3-coder-actions/home` on the same ports.

## Step 0

HEAD `a671660936eb46c79174e06efcb7b902fca3e333`, `git status --short` empty. Baseline (card-2
reviewer, re-checked here for lint and unit tests): lint 0, build 0 (471 726 B), `npm test` 111/111,
`test:py` 30, `test:e2e` 47/47 (foundation 19 + core-dense 28).

## Pre-check — the route of every action

Each route was read in the cited contracts and in the app's own code
(`app/chat/sidebar/session-actions-menu.tsx`, `app/session/hooks/use-session-actions/index.ts`,
`store/projects.ts`, `store/session-unread-remote.ts`, `api/sessions.ts`, `lib/session-export.ts`,
`api/canonical-protocol.ts`), then exercised from a Webapp window of the isolated Hermes
(`host.request` / `window.hermesDesktop.api` probes, then the e2e).

| Item | The app's own route | Route here | Measured |
|---|---|---|---|
| Appearance ▸ | `ColorSwatches` + `PROFILE_SWATCHES` → `setSessionColorOverride` | the SDK's `ColorSwatches` + `PROFILE_SWATCHES` (exported) → `host.sessions.setColor` (clear: `null`) | `localStorage['hermes.desktop.sessionColors']` gets `{ "<id>": "hsl(…)" }`; No color removes it. The SDK has no colour read verb, so the swatch shows the colour this page set, not one set elsewhere. |
| Pin / Unpin | `pinSession` / `unpinSession` (the row's `onTogglePin`) | `host.sessions.pin(id, !pinned)` | the connection-scoped pin store `hermes.desktop.pinnedSessions.remote.<origin>` gains the id; the app's pin sync then PATCHes the backend `pinned` flag (the row reads `pinned: true`, then `false`). |
| Rename… | `renameSessionPreferringRpc`: `session.title` RPC when the window knows a live runtime for the session and the title is not empty, else fenced `PATCH /api/sessions/{id} {title}` | the same choice: `session.title` for the session focused in the app (`focusedStoredSessionId` ↔ `focusedSessionId`, the only runtime mapping the SDK exposes), else the backend's fenced `POST /sessions/{id}/rename` → `_mutate_session_request` | backend path read back through `SessionDB` and the core detail; a stale fence → 409 `revision_conflict`. In the Webapp a session opened in a tab covers the page; back on the page no session is focused, so the e2e rename of an open session took the backend path (the RPC choice is unit-tested). |
| Move to project ▸ | `MoveToProjectItems`: tree minus the current project and folderless projects → `session.workspace.move {session_key, cwd: projectRootCwd, profile}` | the same | works on a session the window never opened; the row's `cwd` and `git_repo_root` change and `projects.tree` regroups it. |
| Copy ID | `CopyButton` (context-menu item, keeps the menu open showing "Copied") | the SDK `CopyButton`, plus a toast | clipboard reads the stored id. |
| Branch | `session.branch_stored {parent_session_id, idempotency_key, cwd, profile, source}` | the same, one request per parent in flight (`createBranchFlights`, like the app's `branchCreateFlightsRef`); the page stays (no tab) | the child is persisted at once (`_seed_branch_row`), `_branched_from` = the parent; the result's `session_id` equals the stored id (no separate runtime to release). |
| Export | `exportSession`: client-side pages of `/api/sessions/{id}/messages` wrapped in its own JSON, `<title>-<id8>.json` | the card's choice: the backend's `GET /sessions/{id}/export` runs the core `GET /api/sessions/{id}/export` handler and returns its bytes base64 in an envelope; the page writes them verbatim; same file name rule | **byte for byte** the core endpoint's (fix r1): pytest decodes the envelope and compares with the core's bytes (whole-number float and `Infinity` rows included); the e2e compares the downloaded file with the core endpoint's raw bytes (`Buffer.equals` + sha256). |
| Mark as read / unread | `markSessionUnread` → fenced `PATCH {unread}` | the backend's fenced `POST /sessions/{id}/read {unread}` → `_mutate_session_request` | the row's `unread` and `SessionDB.session_unread` follow. |
| Archive / Unarchive | `setSessionArchived` → fenced `PATCH {archived, pinned:false}` (REST, not the RPC) | **the backend's fenced `POST /sessions/{id}/archive`** → `_mutate_session_request` with the same payload | **`session.archive` from a Webapp window fails client-side** (`api/canonical-protocol.ts` `retainedMutation`: "Session revision unavailable; reopen the session before editing metadata") for any session the window never opened; the app itself archives over REST. |
| Delete | `deleteSession` → fenced `DELETE /api/sessions/{id}` after `ConfirmDialog` | **the backend's fenced `POST /sessions/{id}/delete`** → the core `delete_session_endpoint` itself | **`session.delete` is not served to a Webapp window** (`-32601 unknown method`, `data.reason: unknown_method`). The core delete takes the block's compression chain and leaves branch children (orphaned, `_branched_from` kept). |

No action needed a direct `state.db` write, so nothing was blocked.

### The core mutation path from a plugin route

- The plugin router is mounted in-process in the gateway's web app, so a plugin endpoint gets the
  same `Request` (identity in `request.state.session`, `app.state.session_authority`) the core
  endpoint gets; `_mutate_session_request(request, profile, id, …)` runs unchanged.
- **Ownership:** for a Webapp login the actor is the host owner (`principal_subject` →
  `uid:<n>`), and `gateway/session_local_migration.py require_history_claim` refuses a history row
  with no owner stamp (`user_id` NULL) unless the transport is a native one: the core's own PATCH
  answered **403 `permission_denied`** for the card-1/2 fixtures. Rows a signed-in Webapp tab
  creates are stamped with the host owner (`tui_gateway/session_transports.py`
  `_transport_auth_user_id`), so the seeder now stamps every fixture the same way
  (`create_session(user_id=host_owner_subject())`). The e2e keeps one unowned row
  (`--unowned-branch`) to show a real refusal.
- In pytest (no gateway) the same call goes the offline way: `_mutate_via_gateway_owner` finds no
  endpoint and `_mutate_offline_store` runs `mutate_runtime_session` under the exclusive
  maintenance lock of the tmp home, with the loopback session-token identity.
- Running-session refusals: the owner refuses with 409 `session_busy` while a turn runs
  (`MUTATION_GUARD_REFUSALS`); no turn can run in the test Hermes, so the page also disables Delete
  while the block reads running (R14) — see "simulated" below. An idle session open in a tab is
  deleted by the core (measured), it is not refused.

## Menu, entry points, focus

- The menu is the SDK's `ContextMenu` (`ContextMenuContent` renders `data-slot="context-menu-content"`)
  around the canvas. Right-click on an in-scope session block opens it at the pointer. The block's ⋯
  (on hover or while selected) and the inspector's ⋯ open the same menu: a `ContextMenu` opens only
  on `contextmenu`, so the button dispatches one on the canvas at its own position, naming the node.
- Items, order and labels are the app's row menu without its Open group (R14 has none):
  Rename…, Pin/Unpin, Mark as unread/read, Appearance ▸, Copy ID, —, Branch, Export, Move to
  project ▸, —, Archive/Unarchive, Delete. Labels come from the app's own strings (`useI18n`:
  `t.sidebar.row.*`, `t.sidebar.projects.*`, `t.common.*`), with English fallbacks.
- Dimmed out-of-scope blocks, stand-ins and empty canvas: the `contextmenu` event is
  default-prevented before the menu sees it, so neither our menu nor the browser's opens (both real
  right-clicks recorded `defaultPrevented: true`); those blocks have no ⋯.
- Esc or a click outside closes it. Focus goes back to the canvas element (`tabIndex=-1`), not to a
  button Space would click; a Rename… or Delete opened from the menu keeps the focus in its dialog
  (the app's `suppressCloseFocusRef`). The menu's modal layer is torn down after it unmounts, so a
  single focus call sometimes landed on `BODY`; the canvas re-focuses itself a few times (0–400 ms)
  while nothing else has the focus.
- Delete while running: the item is disabled and shows "Running — wait for it to finish".

## Carry-forward from card 2 (r2)

1. **Overlap with a hidden single (NB1).** `mergeLayout` now treats every remembered block position
   (not only the shown ones) as an obstacle. Regression test: Show all on → off → a new child of
   `st-sys-tip` → on (`tests/js/layout.test.ts`): it reproduced `st-single-16` under the child
   before the fix. The e2e Branch checks assert the new child overlaps nothing.
2. **Profile select keeps the focus (NB5).** A select closed without a change (Escape, a second
   click, the same profile) kept the focus, because its Escape handler never runs while the native
   list is open. Now: a pointer-down on the canvas blurs it, and a Space keydown aimed at it is
   taken as the pan key (default prevented, the select blurred, the key handed to React Flow from
   the body, which ignores keys aimed at form controls). e2e with a real click + Escape and a
   keyboard change (see the card-2 suite).
3. **Weak card-2 checks.** The NB4 check now runs before any other Show archived toggle, and the
   NB5 check is driven by a real click on the select and the keyboard (no `selectOption`).

## Simulated or not exercised end to end

- **Running / needs input** stay simulated (no provider): running comes from the backend's
  `is_active` (`seed-fixtures.py --activate`, the real heuristic) and from injected `host.state` in
  unit tests; the owner's `session_busy` refusal (a running turn) cannot be produced here. Its shape
  (`409 {"detail":"session_busy"}`) is handled by `restErrorText` (unit test); the e2e shows a real
  owner refusal instead (`permission_denied`, 403, unowned row).
- **Rename through `session.title`** is chosen only for the session focused in the app; in the
  Webapp that session's tab covers the page, so the e2e could not trigger it — the route choice is
  unit-tested (`renameRoute`).
- **Appearance read-back** is the store `host.sessions.setColor` writes (localStorage); blocks keep
  the project colour (R11 asks for the project colour on blocks).

## Fix r1 (card 3) — export bytes, Branch flights, rename limits, idempotent delete

**B1: the export is byte-identical to the core export.**
- Before: `ctx.rest` parsed the backend's JSON (which was the core's bytes) and the page wrote
  `JSON.stringify(data)`. Not verbatim: Python's `"estimated_cost_usd":2.0` came out as `:2`
  (r1: 2 047 B core vs 2 045 B file, first difference at byte 739), and a non-finite float
  (`Infinity`) would make the parse throw.
- `ctx.rest` cannot return raw text: in the Webapp it is `browserApi`
  (`apps/desktop/src/lib/browser-transport.ts:182-220`), which reads the body as text and returns
  `JSON.parse(text)` (an empty body is `null`, an HTML body throws). So the core body travels as
  data, not as the response.
- Now: the backend still runs the core `export_session_endpoint` (no re-implementation, no SQL),
  drains its `StreamingResponse` exactly as Starlette sends it (each `str` chunk encoded with the
  response charset, UTF-8) and answers
  `{ok, session_id, title, encoding: "base64", content_type, bytes, sha256, body}`. The page
  decodes `body` (`decodeExportEnvelope`: `atob` → `Uint8Array`, length checked against `bytes`)
  and puts those bytes in the `Blob` unchanged. File name unchanged (`<title>-<id8>.json`).
- Tests: pytest decodes the envelope and compares it with the core endpoint's bytes for
  `st-sys-tip`, `st-md-v2`, a whole-number-cost row (`"estimated_cost_usd":2.0`) and an
  `Infinity` row; the envelope's `bytes`/`sha256` match. Unit tests: verbatim decode (`2.0`,
  `Infinity`, non-ASCII). e2e: right-click → Export on `st-md-v2` (5 450 B) and on
  `st-export-whole` (`seed-fixtures.py --whole-cost-branch`, 2 854 B), each download
  `Buffer.equals` the core `GET /api/sessions/{id}/export` raw bytes (fetched by the signed-in
  page with the tab's own session token) and has the same sha256. Mutation check: with the old
  parse + stringify put back in the page, the whole-cost check failed (2 852 vs 2 854 B, first
  differing byte 834); `st-md-v2` still matched (its floats are fractional).
- **Non-finite floats in Hermes:** `SessionDB.update_token_counts(estimated_cost_usd=nan)` is
  refused (SQLite stores NaN as NULL: `IntegrityError: NOT NULL constraint failed:
  session_model_usage.estimated_cost_usd`), so a NaN cannot be stored. `inf` is stored and the
  core export writes `"estimated_cost_usd":Infinity`. That row exists only inside its pytest (added
  through `SessionDB`, removed after); it is not an e2e fixture.

**NB1: Branch double-submit.** The page minted a new key per call and claimed retry stability.
Now `createBranchFlights` keeps one `session.branch_stored` flight per (profile, parent): a second
Branch while the first is in flight joins it (one RPC, one key for the attempt), and only the first
caller places, selects and toasts; the flight is dropped once it settles, so a later Branch is a
new attempt with a new key. Unit test: two rapid invocations on the same parent → 1 RPC; other
parents/profiles are separate; a failure drops the flight. In the Webapp the canonical client turns
`session.branch_stored` into a retained `session.mutate` and drops the key itself
(`apps/desktop/src/api/canonical-protocol.ts:461-466` → `retainedMutation`, `:331-350`); r1 measured
the same key sent twice giving 2 children there, so the page-side guard is what holds on every
transport.

**NB2: rename limits.** The dialog's `maxLength={100}` silently cut a pasted title. Removed, as
in the app's dialog: the full text is sent and Hermes decides. 101–400 characters: the core
answers 400 `Title too long (N chars, max 100)`; over 400: the plugin refuses first (422,
`string_too_long` on `title`), and `restErrorText` words it the same way (`Title too long (5000
chars, max 100)`). The dialog stays open with the error inline (plus the app's error toast, as
the app's own rename does); nothing is saved. An empty title still clears it (the app's REST
clear). e2e: paste (clipboard + Ctrl+V) 5 000 and then 150 characters — the input keeps 5 000 / 150,
answers 422 then 400, both messages shown, the title unchanged in the backend rows, the core detail
and the block. pytest: 150 → 400, 5 000 → 422, the stored title unchanged.

**NB3: delete of an already-absent row.** The backend's delete no longer pre-checks with a 404:
the core `delete_session_endpoint` decides. Measured (pytest): a fenced delete of an id already
gone answers `{"ok": true, "already_absent": true}`; without a fence the core guard answers 409
first (`client_upgrade_required`); a fence with revision 0 and no generation is 400
`invalid_params`. The page treats `already_absent`, and the 404 "Session not found" of the fence
read (the row vanished before the confirm), as deleted. e2e: the confirm is open, another client
deletes the row through the backend, Delete then closes the confirm as deleted, no error shown.

**NB4: Space on the focused profile select (not changed).** Since the card-2 carry-forward, a
Space keydown aimed at the profile `<select>` is taken as the pan key, so a keyboard user cannot
open the select with Space. Trade-off kept: only Space is intercepted (`graph-canvas.tsx` keydown
capture returns for any other `code`), so the select's other keys and a click are left to the
browser; letting Space open it again would bring back the bug that fix closed (Space + drag not
panning after a profile change). Not a trivial safe change, so left as is.

**NB5:** the stale comment in `test_router_mutations_are_only_the_fenced_session_actions` now
names the four writes it asserts.

## Gates, bundle and numbers (HEAD of this card)

- **Fix r1:** `desktop/plugin.js` **505 406 bytes** (52 esbuild inputs; was 503 398), byte-identical
  over two rebuilds (sha256 `f8f3a2c2…3abcba92`). lint 0; build 0; `npm test` 134/134 (was 128);
  `test:py` 80 (was 77; the unknown-session 404 case for delete is gone, NB3, and five tests are
  new); `test:e2e` 74/74 — foundation 19 + core-dense 28 + actions 27 (was 24). 500-session
  fixture: first render 314 ms, pan 121 frames in 2003 ms = 60.4 fps. (Card-4 note: these figures
  are from one fix-r1 run; the fix-r1 handoff quoted another run, 317 ms / 61.4 fps, and the card-3
  reviewer measured 314 ms / 61.4 fps at `e951f2a`. Run-to-run spread is a few ms and ±0.5 fps;
  card 4 re-measured, see its section.)

Card 3 (implementation, `93318b5`):

- **`desktop/plugin.js`: 503 398 bytes** (52 esbuild inputs; was 471 726), byte-identical over
  rebuilds (sha256 `c30c0d15…f139950`). Loader cap 16 MiB; test budget 2 MiB. No new dependency.
- lint 0; build 0; `npm test` 128/128 (was 111); `test:py` 77 (was 30); `test:e2e` 71/71 —
  foundation 19 + core-dense 28 + actions 24 (was 47).
- NB5 proof: with the select fix switched off in the page (a test-only flag, not committed), a real
  click + Escape on the profile select left the focus on `SELECT` and Space + drag did not pan;
  with it on, the same input panned (80, 50).
- 500-session fixture after this card: first render 315 ms, pan 122 frames in 2002 ms = 60.9 fps.
- Live refresh after the NB1 fix: the remembered spots of the singles Show all placed earlier are
  obstacles now, so the live children land further right in their bands (st-sys-tip's at
  (666, 128), st-hp-root's at (888, 276); card 2 measured 444) — still in band, overlapping nothing.
- Light and dark: the menu is the UI kit's (dark: background `rgb(22 24 29 / .96)`, text
  `rgb(230 237 243 / .94)` from the theme); our additions (⋯, the disabled-item note, the dialog
  error) use `var(--ui-*)` only.

---

# Measured facts — Session Tree 4/7 (synced layout, settings, style switching)

Measured 2026-11-10 by the card-4 coder in the isolated test Hermes `~/.cache/session-tree-e2e/c4-coder/home`
(ports 19340–19344; the harness default card is now 4) and, for the mutating suites, their own fresh
homes `c4-coder-actions/home` and `c4-coder-sync/home` on the same ports. The mechanism is described
in `docs/layout-sync.md`.

## Step 0

HEAD `e951f2a304b1ccd39b58baa69697e9c4adc9f39e`, `git status --short` empty. Baseline (card-3
reviewer, lint and unit tests re-checked here): lint 0, build 0 (505 406 B), `npm test` 134/134,
`test:py` 80, `test:e2e` 74/74 (foundation 19 + core-dense 28 + actions 27); 500 fixture 314 ms /
61.4 fps.

## Push or poll: push, with a 5 s poll as the fallback

- Decided from pre-check 5: a plugin `ctx.socket` never dials in the Webapp; `broadcast_plugin_event`
  from the backend reaches `host.onEvent` there. Re-measured for this card with a throwaway probe
  (not committed): a `PATCH /state/positions` from one tab took 24 ms, and the same tab's
  `host.onEvent('plugin.session-tree.layout.changed')` fired 28 ms after it was sent, with
  `{"type":"plugin.session-tree.layout.changed","payload":{"rev":3,"profile":"default","kind":"positions"},…}`.
- So the backend pushes `layout.changed` after every change and the page refreshes on it; the page
  also polls `GET /state?since_rev=` every 5 s while visible (a missed push, a window that was
  hidden). e2e: B fetched the new state 22 ms after the store had A's drop, before the e2e's own 50 ms
  poll of the store noticed it (reported latency 0–1 ms), i.e. by push, not by B's 5 s poll.
- The plugin route runs in the gateway process (pre-check of card 3), so the broadcast goes out from
  the request's worker thread (`tui_gateway/ws.py` `WSTransport.write` is thread-safe).

## Store: concurrency and atomicity (pytest)

- **Cross-process lock:** a process-level `threading.Lock` plus `fcntl.flock(LOCK_EX)` on the sidecar
  `session-tree/state.lock`; every mutation re-reads the file under both locks. Two processes × 60
  rounds (a distinct block each round + the shared block each round) lose no distinct block, the
  shared block holds the write with the latest `updated_at`, and `rev` is exactly 240. Eight threads ×
  25 rounds: the same.
- **Killed writer:** a second process rewrites a 4 000-entry layout (~300 KB) in a loop and is
  `SIGKILL`ed at a random moment, 30 times. After each kill the file parses, validates and is one whole
  generation; at least one kill left a temp file behind (a kill mid-write), and no `.bak` appeared.
  Mutation check: with the temp-file + rename replaced by a direct, two-step write of `state.json`,
  the test failed 3 runs out of 3.
- **Corrupt file:** six corrupt contents (truncated JSON, empty, a list, a bad `rev` type, a bad
  coordinate type, invalid UTF-8) each serve `{rev: 0, layouts: {}}`, are kept byte for byte as
  `state.json.corrupt-<time>-<random>.bak`, and the next write makes a fresh valid file. A newer
  schema is never overwritten (writes answer 409). e2e: a hand-written truncated `state.json` in the
  sync home → `GET /state` served rev 0, the page reloaded with its blocks, one `.bak` with the
  original bytes, and the next save wrote rev 1.

## Page: what the e2e measured (`scripts/e2e-sync.ts`, 19 checks)

- **First view on a fresh store:** one `if_absent` save of the auto-layout (20 positions: 17 blocks
  shown + 3 group labels), the second window's identical placements skipped server-side; no save at
  all during 6 s idle.
- **No save during a drag:** a 1.5 s drag (15 mouse moves 100 ms apart, then the drop) → zero
  `/state/*` writes between mouse-down and mouse-up (network log), then exactly one `PATCH
  /state/positions` (`mode: set`) 301 ms after the browser's `mouseup`. Reload → the block at the
  stored spot (113.6, 128.8).
- **Concurrent drags** of `st-hp-root` (A) and `st-sys-mcp` (B) at the same time: both stored, both
  pages show both.
- **Zoom and pan per device:** A zoomed (wheel) and panned (middle-drag) to (14.5, −23.0, 1.743);
  6 s later B was still at (75.5, 69.75, 1.25); no viewport ever went to the backend; A got exactly
  its view back after a reload (`ctx.storage` `viewport.v1:<style>|<profile>|<scope>`).
- **Settings page round-trip:** View style → E2E alt stored `{style: "e2e-alt"}`, B switched by push,
  the settings page showed it after a reload; Snap grid default on → B's canvas `data-snap="on"`,
  then off; back to Dense.
- **Device override:** A "On this device = E2E alt" → A draws `e2e-alt` (switcher `data-source=device`),
  B and the synced setting stay Dense for 6 s.
- **Toolbar switcher:** with the override set it changed only A (no `/settings` write); without it,
  B's switcher changed the synced style and A followed. Positions are per style: `st-sys-tip` is at
  (113.6, 128.8) in Dense and (0, 82) in E2E alt.
- **Re-arrange + Undo:** Re-arrange stored the fresh layout (`st-sys-tip` (113.6, 128.8) → (0, 60))
  on both pages; Undo restored all 20 entries (DELETE then PUT in A's network log), on both pages.
- **A new seeded session** (`--branch st-sync-new st-sys-tip`) was placed at (557.6, 139.6); all 20
  stored coordinates unchanged in the store (exactly) and on screen (±0.01 px).
- **Backend unreachable:** (a) *simulated*: the browser blocks `/api/plugins/session-tree/state*`
  and the page is reloaded — it lays out the cached layout (`st-sys-tip` at its stored spot), shows
  "offline: showing last saved layout", and recovers when the route is unblocked. (b) *real*: the
  gateway is stopped with A open — A keeps working, a drop is queued in `ctx.storage`
  (`layoutPending.v1`, 1 entry), the banner shows; after the restart the same tab recovered without a
  new sign-in and the drop was stored.
- **Reloads land on `#/`:** every `page.reload()` of `#/session-tree` landed on `#/` in this Webapp
  build (4 of 4), so the e2e navigates back to the route after a reload. The cause was not
  investigated (the app's router on a cold load); the page itself does not navigate.

## Carry-forward items from the card-3 review

1. **Branch double-click** — fixed twice over: the inspector's Branch ignores `event.detail > 1` (a
   real double-click), and the actions controller ignores a Branch on the child a Branch has just
   made for 800 ms (`createBranchCooldown`; playwright's two `mouse.click` calls both carry
   `detail: 1`). e2e (actions suite, 2 new checks): two real clicks 150 ms apart on `st-hp-mockup`
   and 300 ms apart on `st-md-katex` each make exactly one child and no grandchild. Mutation check:
   with both guards off, the 300 ms check failed (a child and a grandchild); the 150 ms one still
   passed in this environment because the first request had not returned yet (the flight guard
   joined it). Unit test for the cooldown.
2. **`isAlreadyAbsent`** — now only the backend's own fence-read 404 `{"detail": "Session not found"}`
   (parsed) and the core's `already_absent` answer; the core's 404 `not_found` (an existing row it
   could not restore) is not treated as deleted. Unit test (fails on the old regex).
3. **500-fixture numbers** — the card-3 doc line now says which run its 314 ms / 60.4 fps came from.
   Re-measured on this card's final run (fresh home, `0cf2ac0`): **first render 317 ms, pan 122 frames
   in 2002 ms = 60.9 fps** (other runs this card: 315 ms / 60.9 fps, 316 ms / 61.4 fps).
4. **Endless "Loading sessions…"** — reproduced: with a session whose cost is infinite
   (`seed-fixtures.py --inf-cost-branch`), the plugin's `/sessions` still answered, but the gateway's
   `projects.tree` RPC never answered (still pending after 25 s), so the page stayed on "Loading
   sessions…". Now each `projects.tree` attempt times out after 8 s (`withTimeout`, `ctx.setTimeout`),
   and after 3 retries a failed projects load is an error state ("Could not load projects" + Retry),
   like a failed sessions load ("Could not load sessions" + Retry). e2e: the error state with Retry
   within 60 s; after the row is removed, Retry brings the canvas back. Unit test for the timeout.
   The app's own session list also fails on that row (core bug, out of scope; Hermes unchanged).

## Deviations

- A failed `projects.tree` is now an error state with Retry (card 2 drew the graph without
  projects). Drawing without projects would group every block under "no project", and with card 4
  that layout would also be saved; the page also saves no placement while projects are missing.
- One more endpoint than the card listed: `POST /state/forget` — a session moved to another project
  (card 3's Move to project) must leave every stored layout so each places it in its new band;
  without it, the old spot would come back after a reload.
- `session_profile=*` is accepted by the state endpoints (the All profiles view has its own
  layouts); `profile=` stays the gateway's routing key, as in card 1.
- The inspector got a show/hide toggle (toolbar, per device, per style): R16 lists the panel's open
  state as per-device state, and there was no way to close it before.

## Simulated or not exercised end to end

- The offline reload (a) blocks the store route in the browser; (b) stops the real gateway.
- Running / needs input stay as in cards 2–3 (simulated at `host.state` in unit tests).
- The test-only style exists only in the e2e's own build; the shipped bundle cannot register it.

## Gates, bundle and numbers (HEAD of this card)

- **`desktop/plugin.js`: 534 773 bytes** (56 esbuild inputs; was 505 406), byte-identical over two
  builds (sha256 `34eae9ee…6c57419e`). Loader cap 16 MiB; test budget 2 MiB. No new dependency.
- lint 0; build 0; `npm test` 157/157 (was 134); `test:py` 162 (was 80); `test:e2e` 95/95 —
  foundation 19 + core-dense 28 + actions 29 (was 27) + sync 19 (new).
- Re-running core-dense on a reused home fails 5 checks (its live-refresh branches and titles from
  the earlier run stay in the home); on a fresh home (as every card's final run) it is 28/28. The
  harness now also moves the layout store aside on setup, so synced state cannot carry over.

## Fix r1 (card 4) — refused-save loop, layout key across compaction, NB1–NB4

Measured 2026-11-10 by the card-4 fix worker on fix base `0342f32`, code commit `a86e4e0`, in the
isolated homes `c4-coder` (reset first), `c4-coder-actions` and `c4-coder-sync` (ports 19340–19344).
Baseline at `0342f32` (r1 reviewer, unit and pytest re-checked here): lint 0, build 0 (534 773 B),
`npm test` 157/157, `test:py` 162, `test:e2e` 95/95.

### B1 — a refused save never loops

- **Classification** (`refusalKind` in `src/model/layout-sync.ts`): no HTTP answer (network,
  timeout), 5xx, 408, 429 are transient (queue kept, offline banner, backoff 1/2/5/5/10 s, nothing
  notified); any other 4xx is a refusal; a 409 whose detail contains `newer_schema` is its own kind.
  The backend's 409 detail now starts `newer_schema: state.json has schema N; …`.
- **Newer schema:** `GET /state` on a newer-schema file answers `read_only: true, store_schema: N`
  (epoch `newer`, empty layouts), so the page usually never sends a write at all; a write that
  meets one (the file changed after the page's fetch) gets the 409 and the page goes read-only
  then. Read-only: no position, layout or settings write, the flush timer not armed, one banner
  (`session-tree-read-only`), one notice (`kind: warning`); auto-layout, drags, Re-arrange and
  settings keep working in that window only. A later full `GET /state` without `read_only` leaves
  the mode (changes made meanwhile are dropped, as the banner said).
- **Other refusals:** the op is dropped; refused `if_absent` placements are remembered per layout +
  key, so `place()` on the next render does not queue them again; one notice per status per page.
- **Unit (r1 probe form, the page's subscribe → `place()` loop):** 409 newer_schema on a write → 1
  request over 150 re-renders, then 0 over 150 more re-renders + a drop, settings, forget,
  Re-arrange + Undo and 150 polls; 1 notice. GET `read_only` → 0 writes over 120 re-renders and a
  drop, 1 notice; a supported GET → saving resumes (1 `if_absent`). 413 → exactly 1 request per
  distinct op (2 blocks; then a 3rd block; then a drop: 3 requests over 240 re-renders), 1 notice,
  never offline.
- **e2e (sync suite, the r1 repro on a real gateway):** gateway stopped, `state.json` =
  `{"schema":2,"rev":3,…,"extra":{}}`, restarted, tab signed in again, page opened: **0 writes** in
  the ≥ 10 s after the banner appeared (r1: 33 PATCH in 10 s), **1 notice** (counted by wrapping the
  SDK's `host.notify` before the plugin loads; r1: "Show 45 more notifications"), banner text exact,
  the file byte-identical, no plugin page error; a real drag still moves the block locally and is
  not sent. Then a valid schema-1 file (no epoch) → after a reload the banner is gone and the
  auto-layout is saved again (21 entries, a fresh epoch, rev 1).

### B2 — the layout key of a compacted block is its lineage root (+ NB3)

- Where the root comes from: the backend's `/sessions` rows are the core list's
  (`list_sessions_rich` → `project_compression_tips`), which sets `_lineage_root_id` = the root
  row's id on the projected tip row (and `None` for a session never compacted). pytest
  `test_the_listing_names_a_compacted_block_by_its_tip_and_reports_the_lineage_root` reads it back
  on a real two-segment lineage. The page: `GraphNode.layoutKey` = `_lineage_root_id || id`
  (profile-qualified only on a clash, like ids); `layoutKeysOf(model)` maps block id ↔ key in
  `place()`, drops and forget; Re-arrange/Undo already carry keys. Selection, open, actions,
  focus and the Branch parent still use the tip id.
- Backend canonicalisation in the same step as prune: `SessionDB.get_compression_lineage(id)` per
  stored id (`[]` = gone, `[0]` = root), member keys re-keyed to the root, newer `updated_at` wins
  on a clash, member keys dropped. pytest on the store (tip → root, profile-qualified keys, clash
  both ways, middle segment + tip piling up → one root entry, root keys kept, gone keys dropped,
  nothing written when settled) and through the API on real SessionDB rows (migration; a
  compaction through `seed-fixtures.compact`; a late write under the former tip folded in).
- **e2e:** (1) migration: the conversation's entry stored the card-4 way (root key forgotten, the
  tip key written at (354, 289)) → after a reload the block is at (354, 289); on disk only
  `st-sys-root` at that spot, no `st-sys-tip`. (2) drag the ×3 block to (256.7, 353.9), compact it
  through SessionDB (`seed-fixtures.py --compact st-sys-tip st-sys-seg5`: lineage
  root → seg2 → seg3 → tip → seg5), reload → the block is now `st-sys-seg5`, says ×4, sits at
  (256.7, 353.9) exactly; on disk `st-sys-root` at that spot and neither tip key; no save mentions
  a tip id; B shows it there too. (r1 P4: the ×4 block jumped to (0, 60).)

### NB1 — windows on one device

- `layoutPending.v2` = `{slots: {<window>: {beat, ops}}}`; a window rewrites only its slot; slots
  silent for 30 s (or released on `pagehide` / dispose: beat 0) are adopted by the next window that
  constructs or polls; the card-4 `layoutPending.v1` list is adopted once and cleared.
  `layoutDrops.v1` records the latest drop time per layout + key on the device, and a queued drop
  older than that is discarded before sending.
- **Unit P5** (one storage, two `LayoutSync`s, A's writes blocked): A drops `st-md-katex` at p1; A2
  opens and does **not** replay it (no PATCH; A's slot still holds 1 op); A2 drops at p2 (stored);
  A unblocked → nothing sent, the store ends at **p2**, A's queue empty. Also: two windows queueing
  offline keep both queues (3 ops) and all land; a closed window's slot (31 s silent) and the v1
  list are adopted and sent; a released slot is adopted at once by the reloaded page.

### NB2 — store epoch

- 16-hex `epoch` minted on every fresh file (first write, after corrupt-file recovery, after a
  deletion); a file without it loads as `legacy` until its next write; no file is `none`. `GET
  /state?since_rev=&epoch=` answers unchanged only for the same pair; pushes carry `{epoch, rev}`;
  the page refreshes on any push of another epoch. pytest: deleted file → same rev 1 under a new
  epoch, the old pair gets the full state; legacy load + first write persists a real epoch;
  malformed epochs are corrupt files. Unit: a recreated file at the same rev 3 is picked up by
  push and by poll (0342f32: the push was ignored, the poll said unchanged).

### NB4 — Branch on the same source

- `createBranchCooldown` also tracks the source: ignored while its request is in flight and for
  800 ms after it returns (answer or failure); `guardedBranch` is the one path the controller uses.
- Unit with a held request (a slow refetch: nothing selected the child yet): a click at 300 ms
  (in flight), at 600 ms and 799 ms after the return → ignored, one request; at 801 ms a new one.
- **e2e (actions suite):** the page's `/sessions` held 1.5 s per request; real clicks on the
  inspector's Branch of `st-sys-reply` 604 ms apart, the parent still selected at the second click
  → exactly **one** child, which is then selected.

### How each new test was shown to fail on `0342f32`

A scratch tree with `0342f32`'s `src/` and `dashboard/` and this commit's `tests/` and `scripts/`:
- **pytest:** 14 of the new tests fail (canonicalise ×3, epoch ×2, malformed epoch ×4, newer schema
  read-only ×1 in `test_layout_store.py`; migration, compaction, newer-schema API, epoch poll in
  `test_state_api.py`); the listing fact check passes (it checks Hermes, not this code).
- **unit:** the new symbols were shimmed onto the old code (constants; `refusalKind` from the old
  `isRefusal`; `layoutKeysOf` with no keys; `guardedBranch` = the 0342f32 controller's Branch path).
  The 409 and 413 loop tests first hung the runner (the refusal loop never yields); with the scratch
  FakeServer capped at 2000 calls they fail with ~2000 requests. GET read-only, classification
  (404 was transient), B2 keys (graph and sync), P5, own-slot, orphan, release and epoch fail; both
  NB4 tests fail (the second click sends or joins a request). The transient-retry test passes on
  both (a guard for existing behaviour).
- **e2e:** not re-run on the old build; the same repros are the r1 reviewer's probes P4/P6
  (`0342f32`: block at (0, 60); 33 PATCH and 45+ notifications in 10 s).

### Simulated or not exercised end to end

- NB1 and NB2 are proven in unit tests (fake storage shared by two `LayoutSync`s; a fake server
  that recreates its file) and pytest; no e2e drives two windows of one context against a blocked
  route, nor a deleted `state.json` with a window holding the same rev.
- Running / needs input stay simulated at `host.state` (cards 2–3).

### Gates, bundle and numbers (code commit `a86e4e0`; the docs commit after it changes only docs)

- **`desktop/plugin.js`: 544 571 bytes** (56 inputs; was 534 773), byte-identical over two builds
  (sha256 `76007674…73a1b577`).
- lint 0; build 0; `npm test` 171/171 (was 157); `test:py` 177 (was 162); `test:e2e` 99/99 —
  foundation 19 + core-dense 28 + actions 30 (was 29) + sync 22 (was 19).
- **500 fixture** (fresh `c4-coder` home, this run): first render **313 ms**, pan 122 frames in
  2002 ms = **60.9 fps**.


# Measured facts — Session Tree 5/7 (Project swimlanes)

Measured 2026-11-10 by the card-5 coder in the isolated test Hermes `~/.cache/session-tree-e2e/c5-coder/home`
(ports 19350–19354; the harness default card is now 5) and, for the mutating suites, their own fresh
homes `c5-coder-actions`, `c5-coder-sync` and `c5-coder-swim` on the same ports. The style is
described in `docs/swimlanes.md`.

## Step 0

Card start commit `b56708ca991edd4dc142c2bb4519e8965ebaa9d8`, `git status --short` empty. Baseline
(card-4 reviewer; lint, build and unit tests re-checked here): lint 0, build 0 (544 571 B), `npm test`
171/171, `test:py` 177, `test:e2e` 99/99 (foundation 19 + core-dense 28 + actions 30 + sync 22);
500 fixture 316 ms / 61.4 fps.

## How the style plugs in

- A new optional `frame` in the style contract: `compute` (the pure lane layout), `extraNodes` (lane
  chips), `Under` (bands, earlier zone, day lines, now line, activity bars; flow coordinates) and
  `Over` (header column, axis, corner, singles popover; screen coordinates, `useViewport()`). The
  page calls `frame.compute` instead of `LayoutSync.place()`, so Swimlanes never reads or writes the
  position store; Snap is forced off for a style without dragging; Re-arrange is hidden.
- The block menu now also opens from a list row that stands for a block (`data-st-node`, the singles
  popover): `nodeIdAt` looks for it next to `.react-flow__node`.
- The router got the orthogonal shape (`elbowPoints`, `makeOrthogonalRouter`: elbows with 7 px
  rounded corners; the existing A* detour on a blocked link). Found on the way: with fractional
  block coordinates a detour could fail (the A* grid rounds to 0.01 px, so a stub on the boundary
  of the source's own inflated rectangle read as inside it) and the link fell back to a straight
  line through a block. Swimlanes therefore floors x to whole pixels (Dense positions are already
  whole or 0.1-px multiples). A throwaway probe on the default fixture (not committed) showed the
  `st-md-tip → st-md-v2` link straight through `st-md-katex` before the change and detoured after
  it; the router's own unit test covers an elbow detour.

## Time axis (decisions)

- Window: **9 local-day columns** (today + 8 before; the mockup's Nov 2 → Tue 10), 140 px each,
  piecewise linear inside a day; the page passes `-getTimezoneOffset()` for now (one fixed offset for
  the window).
- **Earlier zone:** starts before the window, 420 px left of the first column, ordered by start (x
  by rank), never on a tick. e2e: `st-archived-0` (300 h old) ends at 645.7 px, the first tick is at
  658.0 px.
- **Future `started_at`:** clamped to now (the now marker), reported in `future`. Unit test.
- **Missing / invalid `started_at`:** `last_active`, else first in the earlier zone. Unit test.
- e2e: seven unclamped blocks each fall inside their start day's column (offsets 5–71 px of a
  ~89 px column at the fitted zoom); no root block starts right of the now marker.

## What the e2e measured (`scripts/e2e-swimlanes.ts`, 21 checks)

- **Switching:** Settings → View style → Project swimlanes stored `{style: "swimlanes"}` and the page
  drew it; the toolbar switcher went Swimlanes → Dense → Swimlanes (synced).
- **Lanes:** syscanvas, hermes-plugins, mdesign (the `projects.tree` order then; since round 4 the
  lanes use the fixed alphabetical order: hermes-plugins, mdesign, syscanvas) and Home last; header
  counts and tokens equal the backend's `/sessions` rows under the same filters: syscanvas 12 /
  645 000, hermes-plugins 9 / 135 000, mdesign 11 / 165 000, Home 7 / 105 000. Every block inside its
  lane's band.
- **Header column:** a 140 px horizontal middle-drag pan moved a block by 140 px and the headers by
  0 px; a 60 px vertical pan moved the headers by 60 px and the axis by 0 px; after a wheel zoom
  (0.637 → 0.420) every header's height / zoom still equals its lane height (304, 160, 232, 112) and
  the width stayed 168 px.
- **No dragging, no writes:** a real 160 × 90 px mouse drag left `st-hp-root` at (1118, 320) exactly;
  zero `/state*` writes in the network log during or after it. Snap: `disabled`, title "Swimlanes has
  no dragging", no background grid, a click writes nothing; no Re-arrange button.
- **Navigation:** wheel 0.637 → 0.888 with the point under the cursor fixed (±2 px); middle-drag
  (−90, 40) and Space + left-drag (70, −30) panned by exactly that; toolbar + zoomed.
- **Collapse:** hermes-plugins collapsed to a 32 px band (20 px at the zoom) with its activity bar,
  its blocks gone; still collapsed after a real reload; expanded again, still expanded after a
  reload (`device.v1.collapsedLanes` in `ctx.storage`).
- **Scope (mdesign):** the other three lanes collapsed (`data-scope-collapsed`), the view re-fitted
  (0.637 → 0.435); `st-split-root` drawn as a ghost (opacity 0.45, meta "syscanvas"), left of every
  other block, linked to `st-split-child`; hover tooltip "Outside this project — switch to All
  projects to edit"; right-click no menu, click no selection, double-click no tab, drag no move; a
  header click in the scope changed nothing; back to All every lane open; no position write.
- **Singles popover:** the syscanvas chip says 6 = the header's singles = the popover's rows; a
  right-click on a row opened the session menu for it; a double-click opened it in a tab
  (`focusedStoredSessionId` = `st-single-00`).
- **Dense → Swimlanes → Dense:** all 20 stored Dense entries unchanged (exact), no new entry, no
  `swimlanes` layout in `state.json`, zero position / layout / forget writes while Swimlanes was
  shown (only `PATCH /settings` for the style), Dense draws its stored spots.
- **Actions from swimlane blocks:** Rename (backend read-back), Move to project (`st-md-katex` →
  hermes-plugins: the block is now inside the hermes-plugins band, that lane's count +1; the only
  state write was `POST /state/forget`), Archive (gone; Show archived: greyed, opacity 0.55, menu says
  Unarchive, which restores it).
- **Theme:** blocks paint `var(--ui-bg-elevated)` in light and dark; screenshots attached to the card.

## 500-session fixture (final run, fresh homes, HEAD `8184e89`)

- **Swimlanes** (Show all, profile `scale`, 3 lanes of 167 / 167 / 166): first render **602 ms**, pan
  **124 frames in 2002 ms = 61.9 fps** (earlier runs this card: 563 ms / 61.4 fps, 562 ms / 61.4 fps).
  First render is measured from the profile switch to the first block, fetch included.
- **Dense** re-measured in the same run (core-dense): **315 ms, 61.4 fps** (123 frames / 2003 ms).
- Layout alone (unit test): the 500 fixture lays out well under the test's 2 s bound (the whole
  swimlanes unit file runs in ~90 ms).

## Card-4 review carry-forwards

1. **Settings read-only note** — done: in read-only mode the settings page shows the page banner's
   message plus "View style and Snap changes apply in this window only" (`src/settings/notes.ts`,
   unit-tested; the offline note is unchanged and is not shown together with it).
2. **401 / 403 are transient** — done: a queued drop stays queued, is retried with the backoff and is
   saved after the user signs in again; no "could not save" notice. Unit test.
3. **`refusedPlacements` cleared** — done: on Re-arrange and on every successful replace of that
   layout (Re-arrange's `DELETE`, Undo's `PUT`). Unit test.

All three new unit tests (and the extended failure classification) fail on `b56708c`'s
`layout-sync.ts` (checked by swapping that file in and running the suite).

## Deviations

- The e2e-sync suite's switcher helper refocuses the select before every key press: with a third
  style registered, E2E alt is two options away from Dense and the select blurs after each change
  (the card-4 behaviour kept for Space). Test-only change, separate commit.
- Header clicks do nothing while a project scope is active (the scope's collapsing is derived; the
  user's map is untouched), with a tooltip saying so.
- The ghost column sits left of the earlier zone, so a scope with a ghost frames wider (lower zoom).
- A project with no session under the filters gets no lane (unless it is the scope).

## Simulated or not exercised end to end

- Running / needs input as in cards 2–4 (the running fixture uses the backend's activity heuristic;
  needs input has no SDK source). A future `started_at` and a missing one are unit-tested only (the
  seeder has no such row).

## Gates, bundle and numbers (code HEAD `8184e89`; the docs commit after it changes only docs)

- **`desktop/plugin.js`: 594 924 bytes** (63 esbuild inputs; was 544 571), byte-identical over two
  builds and to the committed file (sha256 `f843934a…2725154d`). No new dependency.
- lint 0; build 0; `npm test` 205/205 (was 171); `test:py` 177 (unchanged, no backend change);
  `test:e2e` 120/120 — foundation 19 + core-dense 28 + actions 30 + sync 22 + swimlanes 21 (new).

## Fix r1 (card 5) — idle freeze every 60 s (B1) + NB1–NB5

Measured 2026-11-10 by the card-5 fix coder, same isolated homes and ports (19350–19354), fresh
homes (`scripts/test-hermes reset`, then `npm run test:e2e`). Fix start commit `ddb396b`
(`git status --short` empty); code commit `3d7757e`, docs commit after it. Where this section
disagrees with the card-5 sections above, this section is current.

### B1 — no re-layout and no re-route on the minute tick

- **Cause (review r1):** the page's `frameLayout` memo depended on `nowMs` (a 60 s tick), so every
  tick gave a new positions map, the canvas rebuilt its rectangles and `routeLinks` ran the A*
  detour over every block: 611 ms and 706 ms long tasks exactly 60 s apart on the 500 fixture
  (reviewer), against 1–2 ms for the layout itself.
- **Fix (`src/page/frame-cache.ts`):** the page holds one frame cache. It recomputes the layout
  only when the style, the model, Show all, the collapsed lanes (by content), the local day of now
  or the offset at now changes; otherwise it returns the previous layout object. A recompute whose
  positions / shown set equal the previous ones reuses the previous map / set (defence in depth).
  The canvas keys its shown set on `frameLayout.shown` (not the layout object). The layout's
  `nowMs` (future clamp) is the one captured at the recompute; the now line and pill follow the
  live clock through `swimNowX` (same mapping, from today's local midnights). Dense is unchanged.
- **Unit (`tests/js/frame-cache.test.ts`, 5 tests):** +1 min, +2 min, +5 h, +14 h 59 min in the same
  local day → the same layout object, `positions` `===`, `compute` ran once, and a canvas memo chain
  with a counting router routed no link again; across local midnight → recomputed once; a new
  offset at now (DST) → recomputed; Show all / collapsed lanes → recomputed; the same rows as a new
  model → recomputed, positions and shown set reused (`===`); control: computing on every tick (the
  `ddb396b` behaviour) gives a new map and routes every link twice.
- **e2e (`scripts/e2e-swimlanes.ts`, real 60 s tick, no clock hook):** profile `scale`, Swimlanes,
  first render settled + 3 s, then 66 s idle with `PerformanceObserver('longtask')` and a
  MutationObserver on the now pill (`data-now-x`, which only changes on a tick while idle):
  - Show all off: **1 tick, 0 long tasks** (window 66 003 ms; the marker moved 770.4229 → 770.4521 px);
  - Show all on (500 blocks): **1 tick, 0 long tasks** (66 002 ms; 649.4521 → 649.4812 px).
  The check asserts ≥ 1 tick and no task ≥ 200 ms. (The development run before it: the same, 0
  long tasks in both windows.) Reviewer at `ddb396b`: 611 / 706 ms (Show all off), 473 ms (on).

### NB1 — ghost column and chips

- The scope ghost sits 40 px (`GHOST_GAP`) left of the scoped lane's leftmost block, and never in
  the day window (`x = min(0, leftmost) − 40 − 170`); the chips' x comes from the blocks of
  expanded lanes only. Unit tests (fixture scope, a minimal two-project family, a collapsed far-right
  lane); invariants still hold; the existing ghost e2e (dimmed, read-only) still passes.
- e2e (1440 × 900): mdesign scope fits at **58.0 %** (reviewer at `ddb396b`: 43 %); ghost right edge
  541.6 px = first tick 564.8 − 40 × 0.580.

### NB2 — now pill vs today's label

- The pill is centred on the line unless that would cover today's tick label; then it sits 4 px
  right of the label (measured in a layout effect, written to the pill only; `data-shifted`).
- e2e: no bounding-box intersection at the fit zoom (0.637) and at the minimum zoom (0.30, where a
  day column is narrower than label + pill, so the shift path runs: `data-shifted=true`).

### NB3 — header totals at small heights

- A lane shorter on screen than a block (54 px) keeps one compact line `N sessions · T tok`
  (`data-compact`). e2e: every expanded header's totals line is inside its header at zoom 0.637
  and 0.30 (2 compact headers at 0.30).

### NB4 — DST

- The layout takes an offset *function* (`offsetAt(ms)`; the page passes `browserOffsetAt`); each
  timestamp's local day uses its own offset, a local day runs midnight to midnight (23/25 h on a DST
  change). Unit tests: the reviewer's repro (now 2026-11-05 12:00 EST, start Sat Oct 31 00:30 EDT)
  is in **Sat 31** with an injected New York function and with `TZ=America/New_York` +
  `browserOffsetAt` (the old fixed −300 puts it in Fri 30, kept as a control); x monotonic through
  the repeated hour of Nov 1; the live now mapping equals a fresh layout's. The B1 offset key is the
  offset at now.

### NB5 — singles popover

- Opens below the chip, or above it when there is less room below than the list needs and more
  above; height capped to the room on that side (`popoverPlacement` in `spec.ts`, unit-tested).
- e2e: a chip at y 110 opens below (131–309); the Home chip panned to 824–840 opens above
  (641–818); both inside the canvas, neither clipped.

### 500-session fixture (final run, fresh homes, `3d7757e`)

- **Swimlanes** (Show all): first render **507 ms**, pan **123 frames / 2004 ms = 61.4 fps**
  (development run: 580 ms / 61.4 fps).
- **Dense** (Show all), new check at the end of the swimlanes suite: **340 ms, 60.9 fps** (122 /
  2003 ms); core-dense's own check: 314 ms, 60.9 fps.

### No position writes

- Unchanged and still proven by the e2e network log: over the whole Swimlanes period the only state
  writes were `PATCH /settings` (style switches) and the Move's `POST /state/forget`; Dense →
  Swimlanes → Dense left all 20 stored Dense entries exact and no `swimlanes` layout. The frame
  cache is page state only; nothing new reaches the store.

### Deviations

- NB1: the ghost goes "just left of the leftmost block" *or* just left of the first day column when
  the lane's leftmost block is inside the window — a ghost has no time, so it never sits on a day.
- NB2: the pill moves right of today's label rather than stacking (the 26 px axis has no room for
  two rows); the line itself stays exact.
- B1: the e2e's new Dense measurement runs last in the swimlanes suite (Dense saves its scale
  layout, which the suite's no-write check must not see).

### Gates, bundle and numbers (code commit `3d7757e`; the docs commit after it changes only docs)

- **`desktop/plugin.js`: 600 383 bytes** (64 esbuild inputs; was 594 924), byte-identical over two
  builds and to the committed file (sha256 `e146702a…30cb3375`). Imports: `@hermes/plugin-sdk`,
  `react`, `react/jsx-runtime` only; no `eval(` / `new Function`. No new dependency.
- lint 0; build 0; `npm test` 217/217 (was 205); `test:py` 177 (unchanged); `test:e2e` 124/124 —
  foundation 19 + core-dense 28 + actions 30 + sync 22 + swimlanes 25 (was 21).

## Fix r2 (card 5) — a data refresh re-routed every link (B1-r2) + NB1

Measured 2026-11-10 by the card-5 fix-r2 coder, same isolated homes and ports (19350–19354), fresh
homes (`scripts/test-hermes reset`, then `npm run test:e2e`). Fix start commit `92c59f1`
(`git status --short` empty); code commit `51367d4`, docs commit after it. Where this section
disagrees with the sections above, this section is current. In particular, fix r1's "a spurious
recompute does not re-route either" was untrue: its unit "canvas memo chain" was a test-local copy
that, like the real canvas, keyed the routes on the model.

### B1-r2 — the router keys on structure, not on the model

- **Cause (review r2):** `graph-canvas.tsx` memoised the routes on `[model, rects, style]` and the
  shown set on `[model, spec, frameShown]` (always a new `Set`). Every refetch gives a new model,
  so `routeLinks` ran the A* detour over every block although positions and the shown set were
  reused: 617 + 762 ms (Show all off) and 466 ms (on) per chat turn on the 500 fixture (reviewer).
- **Fix (`src/page/canvas-routing.ts`):** the canvas's routing chain, as one object the canvas
  holds (`useState(createCanvasRouting)`) and asks on every render. Stages: shown set (a framed
  style's as given; else the laid-out families, from the model) → rectangles (shown, positions,
  spec) → link ends (per link: edge id, source, target, kind — all the router and the style's ports
  read from the model) → routes (link ends, rectangles, `style.ports`, `style.router`). Each stage
  reruns only when one of its inputs is a new object and keeps its previous output when the new one
  is equal, so the routes never depend on the model object.
- **Correction (card-5 review r3, B1-r3; fixed in round 4 below):** the claim that a content-only
  refetch re-routes nothing was untrue for branched sessions. The link ends were compared position
  by position in `model.edges` order, which follows the row order; the backend sorts rows by
  `last_active`, so a turn in a branched child that was not the newest row moved its edge to the
  front and re-routed every link (698 + 686 ms for st-scale-0003, reviewer r3). The e2e below
  appended to st-scale-0000, a root already the newest row, which can never reorder. Since round
  4 the link ends are sorted by edge id and the rectangles built in id order, so a reorder of the
  rows alone re-routes nothing.
- **Memo-chain audit (`graph-canvas.tsx`):** what feeds the router or its obstacles — shown,
  rectangles, link ends, routes — is in that chain, with no model key. Left on the model, as it must
  be: `lineage`, `baseNodes` (block content: title, last used, messages, tokens, status, pinned),
  `edges` (flow edge props; `data.route` is the stable route object), `graphNode`, the menu. The
  frame cache still recomputes the Swimlanes layout on a new model (cheap; it reuses equal
  positions / shown) — it does not route.
- **Dense:** the same chain. A drop changes the committed positions → new rectangles → every link
  re-routed once (R13); during a drag nothing changes in the chain (links draw live, as before). The
  only difference: a Dense refetch with equal positions also no longer re-routes (it cost 3–4 ms).
  core-dense's e2e (28, unchanged) passes.
- **Unit (`tests/js/canvas-routing.test.ts`, 4 tests, through `createCanvasRouting`):** Swimlanes,
  Show all off and on: a new model (new row objects) with one changed `message_count`,
  `last_active` and tokens → **0 router calls**, `routes`, link ends, rectangles and shown `===`, and
  the new model's node (what the block draws) carries the new count; a new `/branch` child → routed
  once more, its link present; the same rows again → nothing. Dense: a content-only refetch with an
  equal new positions map keeps the routes; a moved block re-routes once and the link end follows.
  `tests/js/frame-cache.test.ts` now drives the same object (its test-local copy is gone); its
  "same rows, new model" test asserts 0 router calls and `routes ===`, and its former control is
  now "without the cache every tick gives a new positions map; the chain routes nothing while the
  rectangles are equal, and once more when a block moves".
- **The displayed count:** asserted in the DOM by the e2e below (the block's `messages` field).
- **e2e (`scripts/e2e-swimlanes.ts`):** profile `scale`, Swimlanes, first render settled + 3 s, a
  `PerformanceObserver('longtask')`, then `seed-fixtures.py --append st-scale-0000 scale` (one
  user/assistant pair through Hermes's `SessionDB.append_message` in the isolated home), wait until
  the block shows the new count, then 2 s more. Final run:
  - Show all off: **2 → 4 msgs after 1022 ms, 0 long tasks**;
  - Show all on (500 blocks): **4 → 6 msgs after 669 ms, 0 long tasks**.
- **Fails on `92c59f1`:** a `git archive 92c59f1` export outside the repo with the new
  `e2e-swimlanes.ts` and `seed-fixtures.py` laid over it: the new check fails with long tasks of
  **666 ms and 664 ms** (Show all off; the check stops at the first failing run), the other 25
  checks pass. The unit tests on the same export, with a probe shim that ports 92c59f1's inline
  memo deps to the `createCanvasRouting` interface: all 4 canvas-routing tests and the 2 changed
  frame-cache tests fail (e.g. "the router ran on a content-only refetch: 22 !== 11").
- **Minute tick (still):** the idle check across a real tick, final run: Show all off 1 tick, 0 long
  tasks; on 1 tick, 0 long tasks.

### NB1 — local midnight that does not exist

- `localCalendar.midnight`: when the guess is not the day's first second (`dayOf(start) === day &&
  dayOf(start − 1) === day − 1` fails, a spring-forward at 00:00), binary-search the boundary within
  ±4 h. Ordinary days keep the guess.
- Unit: an injected America/Havana function (2026-03-08 starts at 01:00 CDT = 05:00 UTC, not 04:00;
  the 23 h day's fraction); with the real zones (`TZ=` + `browserOffsetAt`) Havana, Santiago, New
  York and Lord Howe, every one of 400 days starts at its first local second. On `92c59f1` the
  injected test and the Havana and Santiago runs fail (`day start 2026-03-08T04:00:00.000Z`).

### NB2 — not taken

- The shifted pill still sits right of today's label, away from its line in the morning, and can
  clip at the axis's right edge at high zoom. Keeping it inside the axis conflicts with "never cover
  today's label" when the label is near the right edge; that needs a design call, and the line
  itself is exact.

### 500-session fixture (final run, fresh homes, `51367d4`)

- **Swimlanes** (Show all): first render **638 ms**, pan **123 frames / 2003 ms = 61.4 fps**
  (development run: 603 ms / 61.4 fps).
- **Dense** (Show all), at the end of the swimlanes suite: **339 ms, 61.4 fps**; core-dense's own
  check: 315 ms, 60.9 fps.

### No position writes

- Unchanged and proven by the e2e network log: during Swimlanes only `PATCH /settings` and the
  Move's `POST /state/forget`; Dense → Swimlanes → Dense left all 20 stored Dense entries exact.
  `--append` writes only messages in the isolated home's scale profile.

### Gates, bundle and numbers (code commit `51367d4`; the docs commit after it changes only docs)

- **`desktop/plugin.js`: 602 455 bytes** (was 600 383), byte-identical over two builds and to the
  committed file (sha256 `78d4d63e…d7bec869b7`). Imports: `@hermes/plugin-sdk`, `react`,
  `react/jsx-runtime` only; no `eval(` / `new Function`. No new dependency.
- lint 0; build 0; `npm test` 226/226 (was 217); `test:py` 177 (unchanged); `test:e2e` 125/125 —
  foundation 19 + core-dense 28 + actions 30 + sync 22 + swimlanes 26 (was 25).

## Fix r3 (card 5, round 4) — order-independent link check (B1-r3) + fixed lane order

Measured 2026-11-10 by the card-5 round-4 coder, same isolated homes and ports (19350–19354), fresh
homes (`scripts/test-hermes reset`, then `npm run test:e2e`). Fix start commit `324633a`
(`git status --short` empty); code commit `a453b7d`, docs commit after it. The user authorised this
round as a one-off ("A1 + B1", comment on `t_3f07e736`, dated 2026-11-09). Where this section
disagrees with the sections above, this section is current.

### B1-r3 — a row reorder alone re-routed every link

- **Cause (review r3):** `sameLinks` compared the link ends position by position, in
  `model.edges` order. `buildGraph` adds edges in row order and the backend returns rows newest
  first (`order_by_last_active`), so a chat turn in a branched child that was not the newest row
  moved its edge to the front: the same set, another order, every link re-routed (698 + 686 ms for
  st-scale-0003, reviewer r3), with routes identical to the old ones.
- **Fix (`src/page/canvas-routing.ts`):** the links stage sorts the link ends by edge id
  (code-unit order), so in-order equality is set equality and the same set keeps the previous
  array; the rectangles stage builds its map in block-id order, because `routeLinks` takes its
  obstacle list in the map's order. Neither input of the router depends on the row order any
  more, so the same set always gives the same routes. The router itself is unchanged; Dense keeps
  live links during a drag and the re-route on drop (R13).
- **Unit (`tests/js/canvas-routing.test.ts`, through `createCanvasRouting` + the frame cache, as
  the page drives them):** Show all off and on, a bumped branched child (`st-md-katex`, row 4+, new
  `message_count` and `last_active`) moved to the front as the backend sorts it — the test checks
  that its edge's index in `model.edges` did change — makes **0 router calls**, `routes`, link ends
  and rectangles `===`; reversing or shuffling the rows alone (Show all off and on) makes 0 router
  calls; a fresh chain over the same rows in three orders gives byte-identical link ends,
  rectangles and routes; Dense: reversed rows keep `routes ===`, a drop still re-routes once.
- **e2e (`scripts/e2e-swimlanes.ts`, new check):** profile `scale`, Swimlanes, first render
  settled + 3 s. Before the append it proves from the backend's own answer that the session is a
  branched child (`_branched_from`) and not the newest row, and after it that the row became the
  newest. One `SessionDB.append_message` pair (`seed-fixtures.py --append`), wait for the block's
  DOM count, 2 s more. Final run:
  - Show all off, **st-scale-0003** (row 3 → 0): 2 → 4 msgs after 984 ms, **0 long tasks**;
  - Show all on, **st-scale-0007** (row 7 → 0): 2 → 4 msgs after 853 ms, **0 long tasks**.
  - The st-scale-0000 check (B1-r2) is kept: 0 long tasks with Show all off and on.

### Fixed lane order (user ruling; closes review r3's N1)

- **Rule:** `orderLanes` (`src/styles/swimlanes/layout.ts`, pure, used for All projects and for a
  project scope, collapsed lanes included): project lanes by
  `a.label.localeCompare(b.label, 'en', { sensitivity: 'accent' })`, ties by project id in
  code-unit order, the no-project lane last whatever its label. Colours, icons, labels and
  membership still come from `projects.tree`; the toolbar's scope picker and the other styles keep
  `projects.tree`'s order (the e2e asserts the toolbar is still in its non-alphabetical order).
- **Unit:** `orderLanes` — mixed-case labels; a three-way tie (`foo` / `Foo` / `FOO`) broken by id;
  the no-project lane given in the middle with the label `AAA Home` ends last; all 120
  permutations of a 5-lane input give the same output and leave the input alone. Layout: the
  default fixture's lanes are hermes-plugins, mdesign, syscanvas, Home for `projects.tree`'s
  syscanvas-first order and for its reverse, with equal positions; a scope keeps the order; a
  synthetic 3-project case keeps lanes and positions when `projects.tree` reorders. Chain, Show
  all off and on: two `projects.tree` answers with the same projects in other orders keep
  `positions`, `rects` and `routes` `===` with 0 router calls; a chat turn in a branched mdesign row
  plus `projects.tree` listing mdesign first: 0 router calls; adding a project ("Aardvark", which
  sorts first) re-routes once, and the same set in another order then routes nothing.
- **e2e (new check):** profile `scale` (3 auto projects, so no seed change was needed), Swimlanes:
  the project `projects.tree` lists last (read from the toolbar) gets a turn in its newest root
  session; the check waits until the toolbar lists it first (projects.tree refetched and
  reordered), then 3 s more. Final run: st-scale-0020 (hermes-plugins), `projects.tree` order
  syscanvas, mdesign, hermes-plugins → hermes-plugins, mdesign, syscanvas; lane headers
  hermes-plugins, mdesign, syscanvas before and after (alphabetical); **0 long tasks**.
- **The lane-order e2e on the default fixture** now expects the alphabetical lanes
  (hermes-plugins, mdesign, syscanvas, Home) with counts and tokens unchanged.

### Fails on `324633a`

- **Unit:** a `git archive 324633a` export (scratch `c5r4/old`, outside the repo) with the two new
  test files; `swimlanes-layout.test.ts` gets a stand-in `orderLanes` that keeps the input order
  (324633a has none). 17 of 55 fail: all 6 B1-r3 chain tests (e.g. "the router ran for a branched
  child moved to the front: 22 !== 11"), all 5 lane-order chain tests, the default-fixture lane
  test, the synthetic reorder test and the 4 `orderLanes` tests. Log: `old-unit.log`.
- **e2e:** the same export with the new `e2e-swimlanes.ts` (3 of 28 fail): the default-fixture
  lane order (lanes `syscanvas, hermes-plugins, mdesign, Home`); B1-r3 with a **673 ms** long task
  (st-scale-0003, Show all off; the Show all on run, st-scale-0007, recorded **459 ms**); the lane
  order check: lanes moved `mdesign, syscanvas, hermes-plugins` → `hermes-plugins, mdesign,
  syscanvas` with a **717 ms** long task. Logs: `swim-old.log`, `swim-old-facts.json`, copied with
  the screenshots to `~/.cache/session-tree-e2e/c5-fix-r3-screenshots/`.

### Still holding

- **Minute tick:** idle across a real tick, Show all off and on: 1 tick each, 0 long tasks.
- **500-session fixture (final run):** Swimlanes first render **662 ms**, pan **61.9 fps**; Dense at
  the end of the swimlanes suite **336 ms, 61.4 fps**; core-dense's own check 316 ms, 60.9 fps.
- **Dense unchanged:** core-dense 28/28 with its suite file unchanged; Dense → Swimlanes → Dense
  left all 20 stored Dense positions exact.
- **No position writes:** during Swimlanes only `PATCH /settings` and the Move's
  `POST /state/forget` (network log).

### Gates, bundle and numbers (code commit `a453b7d`; the docs commit after it changes only docs)

- **`desktop/plugin.js`: 603 051 bytes** (was 602 455), byte-identical over two builds and to the
  committed file (sha256 `a39db99d…41e364c15b`). Imports: `@hermes/plugin-sdk`, `react`,
  `react/jsx-runtime` only; no `eval(` / `new Function`. No new dependency.
- lint 0; build 0; `npm test` 242/242 (was 226); `test:py` 177 (unchanged); `test:e2e` 127/127 —
  foundation 19 + core-dense 28 + actions 30 + sync 22 + swimlanes 28 (was 26).
