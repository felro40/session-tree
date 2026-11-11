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

---

# Measured facts — Session Tree 6/7 (Rich cards)

Measured 2026-11-10 by the card-6 coder in the isolated test Hermes (`~/.cache/session-tree-e2e/
c6-coder*`, ports 19360–19364; the harness default card is now 6). Style notes: `docs/rich-cards.md`.

## Step 0

HEAD `a3b93b2`, `git status --short` empty. Baseline (card 5 final review): lint 0, build 0
(603 051 B), `npm test` 242/242, `test:py` 177, `test:e2e` 127/127.

## R22 "branched at msg N": not drawn

Pre-check 9 (card 1, above) found no reliable branch-point source: the child keeps only
`_branched_from`; the copied-message count lives only in a fingerprint-keyed mutation receipt of one
runtime path; a common-prefix comparison breaks after compression, rewind or delete. R22: omit.

## `POST /sessions/details`

- Excerpt: one `SessionDB.get_messages(id, latest=True, limit=60)` (Hermes's paged read on
  `idx_messages_session_id`). Activity: one `COUNT(DISTINCT role || ':' || timestamp) … GROUP BY`
  local day over the 7-day range on `idx_messages_session_active (session_id, active, timestamp)`
  through SessionDB's read-only `_read_all` (Hermes has no per-day count API), over the compression
  lineage (≤ 32 segments). Both bounded per id; no whole-transcript scan.
- **Per-id time on a 5,000-message session: median 1.79 ms, max 2.09 ms** (7 runs, read-only
  open, `test_per_id_cost_on_a_5000_message_session_is_under_50_ms`); the whole
  `POST /sessions/details` for it (open + read) **4.98 ms**.
- Plain text, measured on the `--rich` fixtures (pytest and e2e): Markdown →
  `Plan Bold move: see the docs and run npm test. first item second item quoted line`; a code block →
  `Here is the fix: def add(a, b): return a + b Done.`; HTML-looking text (`<script>…</script><b>Bold</b>
  &amp; … &lt;img onerror…&gt; … 2 < 3 > 1`) → `Bold & italic link 2 < 3 > 1`; a tool call with text →
  `I'll run the tests.` (no `tool_calls` payload, no inline `<tool_call>`, no tool result); a
  400-word message → 232 characters + `…`; a 35-round tool run (no text in the newest 60 rows) →
  `null`, and the row's `preview` is the first prompt.
- Activity across a day boundary and an offset: a message a minute before local midnight is
  yesterday at the offset and today two hours further east; a message 7 days + 10 s back is outside
  at the offset and inside further east (`[1,0,0,0,0,1,1]` → `[2,0,0,0,0,0,2]`). A compression
  continuation's carried copy of a message counts once.
- Cap: 100 ids → 200, 101 → 422; unknown ids omitted; duplicates answered once; malformed id 400;
  unknown profile 404, `*` 400; `tz_offset_minutes` outside ±840 or a string 422; unknown fields 422.
- Read-only: sha256 + mtime + size of `state.db` and `state.db-wal` of the default home and of the
  rich home unchanged over details requests (`test_details_are_read_only`).

## The page (e2e `scripts/e2e-rich.ts`, final run: 19/19)

- Opens at Fit: 22 cards on the canvas, every card inside it, zoom 0.418; cards 280 × 164.
- **Excerpt = backend** for all 22 cards; the tool run shows `First prompt:` + its `preview`.
- **No layout jump:** answers delayed 1.5 s (`page.route`); 22 cards loading with 44 skeleton lines,
  every card rectangle identical (± 0.5 px) after the answers.
- **Token bar:** width = 54 px × tokens / 480 000 (the largest session) within ± 2 px for 22 bars
  (sample: 480k → 54.0001 px); scoped to mdesign the scale is 15 000 and the bars follow.
- **Sparkline = backend** activity for 22 cards (7 points each); the tooltip lists the 7 local days.
- Ghosts: ×3 → 2 ghost cards 3 and 7 px below the card's bottom, z-index −1, tag `compacted ×3`; ×1 →
  1 ghost, `compacted ×1`.
- Status: running (after `--activate`) → `::after` animation `st-rc-spin` 2.6 s + `running`; needs
  input (test hook) → banner `● Needs input · waiting on your reply`, background = `--ui-yellow`,
  touching the card's top edge; unread (the real Mark as unread) → title weight 750 (others 520) +
  dot; pinned → glyph; open (double-click → tab, `focusedStoredSessionId` = it) → 2 px ring + 26 px
  accent glow.
- **Drawer:** closed at first (off the canvas's right edge), grip `24 unbranched`, 24 rows (the
  `st-single-*` sessions); open after a click, still open after a reload, closed in a second browser
  context (another device); the first rows load their excerpts, the last row (below the scroll
  view) is never asked for; right-click → the session menu; double-click → a tab for that session.
- **R13:** `st-hp-routing` dropped 320 px lower, `st-md-redline` dropped across the link: the link
  detours, 0 of 201 path samples inside the dropped card; only `PATCH /state/positions` written;
  the `rich` layout stored (28 entries) and restored after a reload with the detour; every stored
  Dense position unchanged and Dense still draws them.
- **Viewport-near only (network log):** zoomed to 250 % on a corner and reloaded: one request, the
  4 ids near the view, none of the 18 far ones; after a middle-drag pan the 4 newly near cards were
  asked for, nothing outside the span of the pan.
- **`sessions.changed`:** `--append st-hp-mockup` → one request with exactly `["st-hp-mockup"]`, its
  sparkline today 6 → 8, no card moved.
- Theme: card background = `--ui-bg-elevated` resolved in place, light and dark, and they differ.
- **500-session fixture (Show all): first render 319 ms, pan 124 frames / 2008 ms = 61.8 fps**
  (≥ 30 required); 143 of the 500 cards asked for at open (zoom 0.30).
- No page error from the plugin; the only Rich writes are position saves.

## Found on the way (fixed, with regression tests)

- **Detours failed at fractional coordinates** (`src/model/route.ts`): the A* grid rounds to 0.01 px
  but the inflated obstacles did not, so the goal stub 12 px above a dropped child (y 611.989…)
  rounded to 599.99, 0.001 px inside the child's own inflated rectangle: no route, the link stayed a
  curve through the dropped card (seen in the e2e, reproduced from the page's dumped state). The
  inflated rectangles now sit on the same 0.01 px lattice. Two `route.test.ts` tests fail without
  the change and pass with it. Whole-pixel coordinates route exactly as before.
- **One long row of families:** the transposed tidy layout stacks project groups along one axis;
  with 280 × 164 cards the 22-card fixture was 10 000 px wide and did not fit at 30 %. Families now
  flow in rows wrapped near 16:10 (unit test: aspect 0.8–3).

## Simulated

- Needs input: injected through the e2e build's `session-tree:test-needs-input` event (no SDK
  source); folded away in `npm run build` (guard test).
- Running: the real backend `is_active` heuristic from `--activate` (fixture-only SQL on the
  timestamp); `host.state.busy*` stays unit-tested.

## Forwarded findings

- **r4 N1 fixed** (`scripts/e2e/real-hermes-guard.ts`): `pluginsListing` leaves out `*_state.json`,
  `__pycache__`, `node_modules` and directory mtimes under `~/.hermes/plugins`, still naming every
  entry; `tests/js/real-hermes-guard.test.ts` (an atomic `*_state.json` rewrite is ignored; a new
  link and a changed file are seen). The guard passed in every suite of the final run.
- Still open: r4 N2 (e2e-sync "backend stopped for real" flake; it passed 22/22 here), card 4
  NB1–NB3 (settings read-only note; 401/403 deterministic; `refusedPlacements` never cleared).
  r3 N2/N3 excluded by the user.

## Gates and bundle (code commit `ca15fd1`; the docs commit after it changes only docs)

- **`desktop/plugin.js`: 652 523 bytes** (was 603 051; 72 esbuild inputs), byte-identical over two
  builds and to the committed file (sha256 `5dfaeced…eb18923c7c`). Imports: `@hermes/plugin-sdk`,
  `react`, `react/jsx-runtime` only; no `eval(` / `new Function`. No new dependency.
- lint 0; build 0; `npm test` 264/264 (was 242); `test:py` 201 (was 177); `test:e2e` 146/146 —
  foundation 19 + core-dense 28 + actions 30 + sync 22 + swimlanes 28 + rich 19 (new).

## Fix r1 (card 6) — bounded excerpt (B1), light-theme contrast (B2) + N2, N3

Step 0: HEAD `f850ade`, `git status --short` empty; baseline as in the gates above.

### B1 — the excerpt's patterns were super-linear on the whole message

Cause (review r1): `plain_text` ran lazy `.+?` patterns (emphasis, links) over the whole message;
from every opener without a closer they scanned to the end. Before (offline, the `f850ade`
module, this machine): 8 KB `_x ` 123 ms, `**x ` 196 ms, `*x ` 122 ms, `~~x ` 94 ms, `[x ` 76 ms,
pasted code 14 ms; the review measured 200 KB `_x ` 73.2 s and 8,173 ms for the pasted-code
message through the real API, with a concurrent `/health` stalled 7,882 ms.

Fix (`dashboard/session_details.py`): `plain_text` reads the first **`INPUT_MAX` = 4,096
characters** (only the start is shown), and every pattern of the file is linear. Audit:

| Pattern | Before | Now |
|---|---|---|
| emphasis ×4 (`**`/`__`, `*`, `_`, `~~`) | `.+?` across lines, unbounded | `[^\n]{1,240}?`: one line, ≤ `SPAN` = 240 |
| inline code | `` (`+)(.+?)\1 `` across lines | a backtick run not inside a longer run, `[^\n]{1,240}?`, the same run |
| link, image, reference link | `[^\]]+` / `[^)]*` unbounded | labels `[^\[\]\n]{1,240}+` (possessive, stop at the next bracket); targets ≤ 512 with one level of nested `(…)` |
| reference definition (new) | stayed as text | the line is dropped |
| autolink | `[^>\s]+` | `[^<>\s]{1,512}+` |
| dropped blocks (`<tool_call>`, `<think>`, `<script>`, …) | opener `[^>]*` unbounded | opener `[^<>]{0,512}+`; body to the closer **or the end** (an unterminated one matches once) |
| fence | linear already (closer or end) | the same, possessive blank runs |
| HTML tag / comment | comment `<!--.*?-->`: each unclosed opener to the end | tag possessive; comment to `-->` or the end; new `_TAG_TAIL` drops a tag cut open at the end |
| heading tail, quote, list, rule, table rule | adjacent `[ \t]*` runs could trade characters (quadratic on long blank runs) | possessive runs; the heading tail starts at a run's first blank |
| whitespace collapse | `\s+` (linear) | unchanged |

Cut by the cap, a fence keeps its code as text, a tool-call payload is dropped (no closer: to the
end), a tag cut open at the end is removed. Normal content keeps its plain text: every earlier
excerpt test passes unchanged (Markdown, code block, tool call, HTML-looking text, the 400-word
message, the tool-run "First prompt" fallback). Differences, by design: emphasis and inline code
no longer span lines; spans longer than 240 characters keep their markers. **N2 done:**
`[click me](javascript:alert(document.domain)) raw anchor` → `click me raw anchor`, and
`[1]: javascript:alert(4)` is dropped. The read stays Hermes's `get_messages(latest=True,
limit=60)` (whole `content`, no `substr` query; read-only either way).

Measured (pytest `tests/py/test_details_bounds.py`, 20 bodies of ≥ 200 KB in
`scripts/seed-fixtures.py` `PATHOLOGICAL`: the review's `_x `, `**x `, `*x `, `~~x `, `[x `, `[x](`,
`` `x ``, `<x `, an unterminated fence, the pasted code ×4000, plus `__x `, `![x `, `<!--x `,
`<http:`, `<think `, an unterminated `<tool_call>`, blank runs, `#  `, `- `, `| -- `):

- **`plain_text` per body (median of 3, bar 50 ms): worst `**x ` / `__x ` 6.3 ms**, `_x ` 4.1,
  `*x ` 4.1, `~~x ` 3.2; `[x ` 0.38, `[x](` 0.36, `` `x `` 0.29, `<x ` 0.60, fence 0.42, pasted code
  0.37, the others 0.05–0.45 ms.
- **Every compiled pattern on the uncapped 200 KB bodies** (the cap's backstop; bar 1 s): worst
  `_EMPHASIS[1]` 185.8 ms (`*x `), the other emphasis patterns 140–186 ms, every other pattern
  ≤ 4.5 ms. Quadratic patterns took 8–73 s here.
- **Per id through `details` (processing, read-only open; bar 50 ms): worst 6.50 ms** (`__x `),
  `**x ` 6.49, `_x ` 4.23, `*x ` 4.19, `~~x ` 3.35, the others 0.20–0.77 ms; the endpoint
  wall 2.1–8.4 ms per single-id request.
- **One request of 100 ids, each a 200 KB pathological last message: 159 ms** (bar 2 s).
- 5,000-message session per id (unchanged code path): median 1.82 ms, max 2.19 ms; endpoint 6.34 ms.
- **Real API (e2e-rich, the Webapp on 19360–19364, profile `work`, `--pathological`):** the
  pasted-code session alone **7 ms** wall (was 8,173 ms), its excerpt `value =
  self._cache.get(key_name, None) # look up _cache …`; all 20 bodies in one request **40 ms**; a
  plugin `/health` sent 15 ms into that request **9 ms** (idle 3 ms; was 7,882 ms).

### B2 — light-theme contrast below 3:1

Measured by the new e2e check (`scripts/e2e-rich.ts`, light **and** dark): the colour at its
alpha inside every ancestor's `opacity`, over the backgrounds of the ancestors whose box covers
the probed point (`scripts/e2e/contrast.ts`, unit-tested in `tests/js/contrast.test.ts`: black /
white 21:1, `#777` 4.48, `#959595` 2.99, alpha and opacity-chain compositing, a non-covering layer,
the border's lower side). A border counts the lower of its inside and its outside.

| Element | light before → after | dark before → after |
|---|---|---|
| ghost border (both) | 1.96 → **3.46** | 2.34 → **4.98** |
| stand-in title "Parent not loaded" | 2.61 → **3.52** | ≥ 3 (passed) → **5.22** |
| stand-in dashed border | 1.54 → **3.49** | 1.85 → **5.22** |
| link stroke (N3) | 1.86 → **3.51** | 2.40 → **5.29** |

The "before" run is the same check on `f850ade`'s CSS (it failed with exactly these; the review
measured 1.98 / 2.62 / 1.56 / 1.87). Changes (`src/styles.css`, Rich section only, colours via
`var(--ui-*)` only): ghost border `--ui-text-tertiary` (was 18 % primary in stroke-secondary), its
fill 4 % primary (was 3 %); stand-in border `--ui-text-tertiary` (was 50 % of it) and `opacity: 1`
(was 0.8 — and, without the override, the shared Dense stand-in's 0.6 applies: the first after-run
measured 1.99 because of it); link stroke `--ui-text-tertiary` (was 55 % of it). Card geometry is
untouched: the ghosts keep their offsets (3 and 7 px below the card at Fit, z −1), cards stay
280 × 164, no rectangle or link route changes (the no-jump, detour and layout checks pass as before).
**N3 token-bar track: not taken** — raising the 1.2:1 track to 3:1 would bring it within ~1.2:1 of
the fill (3.68:1 against the card), so the fill/track boundary would get worse; it stays open.
Screenshots (zoomed in with the wheel after a middle-drag pan): `rich-ghosts-{light,dark}.png`,
`rich-standin-{light,dark}.png`.

### Still open

r1 N1 (`layout.ts` `nearest()` has no group bounds), N4 (`COUNT(DISTINCT role||':'||timestamp)`),
N5 (`DetailsStore.entries` never pruned), N3's token-bar track (above); earlier forwarded items as
listed above.

### Gates, bundle and numbers (code commit `ecf25ac`; the docs commit after it changes only docs)

- **`desktop/plugin.js`: 652 902 bytes** (was 652 523; CSS only), byte-identical over two builds and
  to the committed file (sha256 `815a4086…faad370e0e`). Imports: `@hermes/plugin-sdk`, `react`,
  `react/jsx-runtime` only; no `eval(` / `new Function`. No new dependency.
- lint 0; build 0; `npm test` 272/272 (was 264); `test:py` 246 (was 201); `test:e2e` 148/148 —
  foundation 19 + core-dense 28 + actions 30 + sync 22 + swimlanes 28 + rich 21 (was 19).

---

# Measured facts — Session Tree 7/7 (Subway map + whole-plugin final check)

Measured 2026-11-10 by the card-7 coder in the isolated test Hermes (`~/.cache/session-tree-e2e/
c7-coder*`, ports 19370–19374; the harness default card is now 7). Style notes: `docs/subway.md`.

## Step 0

HEAD `4892ca9` (card 6 review r2 PASS), `git status --short` empty; the set start commit
`3806503ec73a59bf9220f0aafe5884b497d2bd0c` is an ancestor. Baseline re-run here: lint 0, build 0
(652 902 B), `npm test` 272/272, `test:py` 246; e2e 148/148 as the card-6 reviewer measured it.

## The Subway map style

- **How it plugs in:** a normal draggable style (`savesLayout`, its own `subway` layouts) with the
  card-6 `Provider` / `Layer`, plus two optional contract parts: `linkSlots(model)` (each link's
  departure slot, structure only; the routing chain carries it in each link end, so a content-only
  refetch still routes nothing — unit test) and `fitPadding` (room for the labels and the depot).
- **Tracks** on the default fixture: 5 families, 10 `/branch` edges, 1 "continued as", 5 parents
  whose first row child is a branch child → **11 tracks**, 5 drawn colours (shades of the theme
  accent: the fixture projects have no colour). The e2e computes the 11 from the backend's rows and
  counts the distinct `data-track` of the drawn stations.
- **Auto-layout** (unit, default and 500-session fixtures, Show all off and on; e2e on the default
  fixture): every segment within 0.5° of a multiple of 45° (exactly 0° here: chamfered corners are
  exact), no detour, no two links with a collinear overlap > 0.5 px (unit) / > 1 px (e2e, on the
  drawn SVG paths), no crossing (unit, Show all off), no station overlapping a station or a label, no
  label overlapping a label, every label in its place above its station; deterministic (reversed
  rows give the same positions, slots and SVG). Every coordinate is a multiple of the 25 px grid.
  Layout + routing of the 500-session fixture: 41 ms (Show all off and on, Node).
- **Drag (e2e, real mouse):** mid-drag the incoming track of the dragged station is one straight
  segment (`M28 120 L309.21 340.63`, `data-routed="false"`, 6.9° off octilinear); after the
  drop it is octilinear (`M28 120 L28 354.42 L53 379.42 L376.59 379.42`) and every track is routed. A station dropped onto the
  `st-sys-tip → st-sys-comments` track makes it detour (`data-detoured`, 10 points, 0 of 300 path
  samples inside the station, octilinear); the dropped station's own track re-routes too. The drops
  are saved as `PATCH /state/positions` with `style: "subway"` only, restored after a reload with the
  detour; Dense's stored positions and drawing are unchanged. With Snap on a drop lands on the
  25 px grid and its track is octilinear.
- **Visuals (e2e):** ×3 capsule with "×3" and the "Compacted ×3: 3 earlier segments…" tooltip;
  "continued as" dotted (`2px, 9px`) with "continued as ›"; the stand-in hollow, dashed, "not
  loaded", its line dashed (`10px, 6px`) in `--ui-text-tertiary`; running: the `st-sw-ping`
  animation, infinite, in `--ui-green` (real `is_active`, `seed-fixtures --activate`); needs input: an
  amber ring (`--ui-yellow`, 3 px glow) **through the test-only hook** (no SDK source); unread: an
  accent dot after the title (the real Mark as unread); pinned: the pin glyph; "◉ you are here"
  under the station opened by a real double-click (`focusedStoredSessionId`); tracks over an 8 px
  casing in the canvas colour (the halo); the map key (6 entries) in the corner above the depot.
- **Depot (e2e):** 24 singles, open by default, folded state kept over a reload and not on another
  device (a second browser context), double-click opens a row in a tab, right-click gives the
  session menu (9 actions).
- **Labels:** a candidate search (above, below, above-left, below-left, right, left), stations top
  to bottom; after a drop that puts a station under another's label, that label moves (seen in the
  detour screenshot: the dropped station's label went below it).

## Whole-plugin final check (`scripts/e2e-final.ts`, the committed `desktop/plugin.js`)

- The switcher offers exactly the four styles, in R1's order. Each lays itself out on first view;
  Dense, Subway and Rich store 20 positions each, Swimlanes none; the same block sits elsewhere in
  each style.
- Per style, from the block's right-click menu (Subway: the station's ring): Rename (read back from
  the backend and drawn), Branch (a new `_branched_from` child, drawn and linked), Archive (gone),
  Show archived → the menu says Unarchive → restored, Delete → the confirm says "Its 1 branch stays
  as a separate session." → Cancel → the row stays. After each style, the other three styles' stored
  positions are unchanged (every stored id, 0.01 px), and each style draws its blocks at its stored
  positions (lineage-root keys for compacted blocks).
- Two-context sync: a drop in one context shows in the other in 9 ms (Dense) and 10 ms (Subway)
  after the store has it (push); the synced style follows in the second context.
- Light and dark: a screenshot per style; the canvas background differs between the schemes in
  every style (theme variables).

### 500-session fixture (Show all, final full run)

| Style | First render | Pan (scripted 2 s middle-drag) | Bar |
|---|---|---|---|
| Dense + inspector | 315 ms | 61.9 fps | ≥ 45 |
| Project swimlanes | 781 ms | 61.4 fps | ≥ 45 |
| Subway map | 340 ms | 61.4 fps | ≥ 45 |
| Rich cards | 336 ms | 61.2 fps | ≥ 30 |

First render: from switching the profile to `scale` (the style already chosen) to 500 on the canvas
with a block drawn; the view opens at the minimum zoom (30 %). An earlier run: 365 / 787 / 337 /
339 ms, 61.5 / 61.5 / 61.2 / 61.3 fps.

## Carry-forward fixes (orchestrator rulings)

### c5 r4 N2 — the e2e-sync "backend stopped for real" flake

- **Root cause:** not the test's timing as such. The page polls its rows and projects every 10 s
  (`use-live-refresh.ts`); a poll while the gateway is down fails (`projects.tree: Hermes gateway is
  not connected`), and the page treated *any* query error as a failed load: it replaced the canvas
  with "Could not load projects" even though it had data — so the check passed or failed on whether
  a poll landed inside the gateway-down window. That is also a real defect against R17 (the cached
  layout is the fallback while the backend is unreachable).
- **Shown on the old bundle:** a probe (scratch `c7flake.ts`: open the page, stop the gateway, sample
  the page every 500 ms for 30 s). `4892ca9`'s committed bundle: the canvas is replaced by the error
  state **7.2 s** after the stop, page title "projects.tree: Hermes gateway is not connected" (the
  r4 reviewer's observation). HEAD's bundle: the canvas stays all 30 s (57 samples), the same
  failure in the title.
- **Fix:** only a load with nothing to show yet ends in the error with Retry; a failed background
  refresh keeps the last data (`session-tree-page.tsx`), and the page says so
  (`data-refresh-failed="true"`). The card-4 failed-load check (a reload with an unserialisable row)
  still ends in the error with Retry.
- **The check is deterministic now:** after stopping the gateway it waits for that real condition (a
  background refresh has failed: `data-refresh-failed="true"`, up to 30 s), then asserts the canvas
  is still there with the cached position, then drags. Five `e2e-sync` runs in a row: see below.

### c6 r1 N5 — `DetailsStore.entries` never pruned

`DetailsStore.retain(keys)` drops the entries, failure marks, queued wants and answers in flight of
every card not in the loaded data, then caps the cache at `MAX_ENTRIES` (2 000, oldest first);
`RichProvider` calls it on every new model. Unit test: a dropped session's entry, queued want and
late answer are gone and it is fetched again when wanted; 2 050 entries retained → 2 000 kept.

### c6 r1 N1 — Rich merge `nearest()` had no group bounds

Fixed without moving any saved position and without a layout rewrite: the shelves partition the
canvas into group segments (a label's segment runs to the next label on its shelf row and down to
the next shelf row; the first segment of a row also owns the room left of it); a new card's centre
may not lie in another group's segment; when its group has no room, it goes under everything below
a continuation label of its group. The review's probe: the new child of `st-hp-root` landed at
(1700, 1104) in mdesign's shelf, 1 553 px away; now at (−340, 1104), next to its siblings in its own
row. Unit test over six parents (every new card inside its own group's segment, nothing placed
moves) fails on `4892ca9`'s layout ("the new child of st-hp-root at {x:1700,y:1104} is in
group:/e2e/projects/mdesign's segment") and passes now. Limitation: a full group's new card can be
far from its parent (under the continuation label).

### c6 r2 NB1 — a leading dropped block over the 4 KB cap emptied the excerpt

`_text_of` now skips leading dropped blocks before the cap (`_skip_leading_blocks`: an opener at the
current position, its closer searched once from there; at most 64 blocks; an unclosed one drops the
rest, as `_DROP_BLOCKS` would). The new opener pattern is linear (a lookbehind lets only the first
blank of a run start a match: 5.1 ms worst on an uncapped 200 KB body, in the every-pattern test).
pytest (`tests/py/test_details_leading.py`, 13 tests): the review's repro
(`'<think>' + 6.4 KB + '</think>The answer is 42.'` → "The answer is 42."), mixed case and
attributes, `<style>` + `<script>`, a multimodal list, the 64-block bound; five 200 KB bodies (the
seeder's `LEADING`: think, tool call, style + script, 28 reasoning blocks, unclosed) —
`plain_text` 0.04–0.05 ms each, `details` 0.19–0.22 ms per id, the endpoint 1.9–2.2 ms; all 25
pathological bodies in one request 35 ms (1.4 ms per id). 10 of the 13 fail on `4892ca9`'s
`session_details.py`. Through the real API (e2e-rich's B1 check, now seeding the five leading
bodies too): 25 ids in one request **39 ms** (1.6 ms per id), the pasted code alone 6 ms, a plugin
`/health` during the request 8 ms.

## Found on the way

- **A second e2e-sync flake (fixed in the test, `82ed496`).** In the first of the five-run series
  the card-4 B2 check failed once: "saved under a tip id", the body an `if_absent` placement of
  `missing:default/st-sys-tip` and `missing:default/st-sys-seg2`. The seeder's `--compact` is four
  separate `SessionDB` writes (re-open the tip, end it with `compression`, create the continuation,
  its message); the likely cause (inferred from the saved body, not traced further) is a refetch
  between them that sees the tip ended with no continuation yet, so its children show for a moment
  under stand-ins, whose auto-placement is saved under the stand-ins' own keys.
  That is not the B2 regression (a block saved under the *tip's* id), but the check's regex matched
  any body containing the tip id. It now compares the saved position ids exactly. The series was
  restarted after the fix (below). The page side (a transient stand-in during a non-atomic
  compaction) is recorded as a finding, not changed.
- The registry now lists the styles in R1's order (Subway between Swimlanes and Rich); the static
  guard test that pins the shipped registry was updated.
- `detour()` takes the corner shape (`roundedPolyline` by default, `chamferPolyline` for Subway);
  the other styles' routes are unchanged (their tests pass untouched).

## Simulated or not exercised end to end

- **Needs input** (every style): no SDK source; the e2e suites that check it (rich, subway) use the
  test-only `session-tree:test-needs-input` window event of the `--test-styles` build. The committed
  bundle has no such hook (guard test); `e2e-final` runs the committed bundle and does not check it.
- **Running**: the real backend `is_active` heuristic (`seed-fixtures --activate`); no model
  provider runs a real turn.

## e2e-sync five times in a row

After `82ed496`, `scripts/e2e-sync.ts` alone, five times back to back, each in a fresh
`c7-coder-sync` home: **22/22, 22/22, 22/22, 22/22, 22/22** (exit 0 each). In every run the
"backend stopped for real" check saw `data-refresh-failed="true"` (a background refresh failed while
the gateway was down) with the canvas and the cached position kept. (A first series was stopped
after run 1 failed on the B2 check described above; it was restarted after the fix.)

## Scope sweep (card 7, `git diff 4892ca9..HEAD`)

Every file outside `src/styles/subway/`, `docs/subway.md`, the two new suites and their helpers
belongs to this card: the router (`route.ts`: the octilinear router, `detour`'s corner option), the
routing chain and the contract (`canvas-routing.ts`, `types.ts`: link slots, Fit padding), the canvas
and page (`graph-canvas.tsx`: slots and Fit padding; `session-tree-page.tsx`: the depot hint, Fit
padding, the N2 fix), registration (`registry.ts`, `plugin.tsx`: the style and its CSS), the N1/N5
fixes (`rich/layout.ts`, `rich/details.ts`, `rich/context.tsx`) with tests (`rich.test.ts`), the
NB1 fix (`session_details.py`, the seeder's `LEADING` bodies, `test_details_leading.py`), the N2
check (`e2e-sync.ts`), the harness's card default (`harness.ts`, `scripts/test-hermes`), the suite
list (`run-e2e.sh`), the registry guard (`guards.test.ts`), the rebuilt `desktop/plugin.js`, and the
docs (`README.md`, this file).

## Gates, bundle and numbers

- **`desktop/plugin.js`: 701 199 bytes** (was 652 902: the Subway style and its CSS), sha256
  `f2e8d03f…8c30b41241`, byte-identical over rebuilds and to the committed file. Imports:
  `@hermes/plugin-sdk`, `react`, `react/jsx-runtime` only; no `eval(` / `new Function` (guard
  tests). Well under the 16 MiB loader cap (budget 2 MiB). No new dependency; the license table is
  unchanged (`node scripts/build.mjs --licenses`).
- lint 0; build 0; `npm test` **293/293** (was 272: subway 19, rich +2); `test:py` **259** (was
  246: `test_details_leading.py` 13); `test:e2e` **177/177** at `759c501` — foundation 19 +
  core-dense 28 + actions 30 + sync 22 + swimlanes 28 + rich 21 + **subway 15** + **final 14**; and
  e2e-sync 5 × 22/22 at `82ed496`.
- **Correction (card 7 fix r1, review r1 finding 7):** the last full `test:e2e` on `ff5475c` itself
  (shared home reset by hand first) was **176/177**: e2e-sync's card-4 B1 newer-schema check
  failed once ("no save after the reload"). The review saw the same check fail in 1 of its 3
  e2e-sync runs. That was a test race (fix r1 B2, below), now fixed.

## Fix r1 (card 7) — review r1 `t_13edf7f7` findings 1–4, 6–8

Hermes checkout now at **`3b421578588243f920886e6fe79a6faa87ea026e`** (`3b42157`, committed
2026-11-09 16:24 −0800; client/backend v0.23.1): the user ran `hermes update` on 2026-11-10
11:25–11:31 EST, between card 6 and card 7's review. Read-only as before; `git status --short`
there is empty before and after this round. The line references of this file's earlier sections are
to `2bd378ed1b`.

- **B1 — `npm run test:py` exited 127 in a clean environment.** `run-pytest.sh` defaulted
  `SESSION_TREE_CARD` to 6, the harness to 7, so the script exec'd `c6-<role>/hermes` that only a
  leftover `c6-coder` root provided. Now `scripts/e2e/CARD` (`7`) is the one place the number
  lives: `harness.ts` reads it (`DEFAULT_CARD`), `scripts/test-hermes` goes through the harness,
  and `run-pytest.sh` takes its root from the launcher path the harness prints (no card of its
  own). Guard test `tests/js/harness-card.test.ts` (7 tests): the CARD file is a card of the set,
  the harness default equals it, `test-hermes` and `test-hermes-cli.ts` resolve `c<CARD>-coder` with
  `SESSION_TREE_CARD` unset (the override still works), `run-pytest.sh` has no card variable and
  derives the root from the launcher, and no entry point carries a literal default card. After the
  N8 cleanup (no `c6-*` root left): `env -u SESSION_TREE_CARD npm run test:py` → exit 0, **259
  passed**.
- **B2 — e2e-sync's newer-schema "saves resume after a reload" race.** Both contexts are open and
  B polls too; when the valid file comes back, whichever page fetches it first places the
  auto-layout and saves it (`if_absent`), and the other then has nothing to save. The check asserted
  on A's log only. It now counts the position saves of both contexts since the file came back
  (`logA` and `logB`), which is the real condition (saving resumed). Audit of the other two-context
  checks: the B2 compaction check ("no save under a tip id") also looked at A's log only — it now
  checks both logs (a negative check that missed B's saves); the rest assert on A's own action (its
  drag, its override switch, its Re-arrange) or on the store, and need no change. No sleep added.
  **e2e-sync 5 × in a row at `74abc1c`: 22/22, 22/22, 22/22, 22/22, 22/22, exit 0 each.**
- **B3 — a repeat full run needed a manual reset.** `run-e2e.sh` now runs `test-hermes-cli.ts
  reset` (stop, move the role's shared root to `trash/`) before the first suite and stops if that
  fails; e2e-foundation and e2e-core-dense then seed a fresh home (every other suite already moved
  its own variant home aside). Guard test: the reset step precedes the suite loop, and `reset` moves
  a scratch root to the trash. **Two full `npm run test:e2e` back to back, no manual step: see Gates.**
- **N3 — a Subway track ran through its own end stations and labels.** See `docs/subway.md`
  (Links and routing, Own ends). A bottom port whose target is not below and to the right drops
  30 px, runs to 30 px left of the target, climbs or drops and runs in from the left; the plain shape
  is also checked against the link's own two stations and the room above each kept for its label
  (`LABEL_SPOTS[0]`), and a hit detours with them as grid obstacles (the own boxes 0.02 px smaller:
  a port's stub on its own box's inflated edge used to land a float error inside it, which also
  caused the one "through another station" case). Only `makeOctilinearRouter` / `octilinearPoints`
  changed; `orthogonalRoute`, `detour` and the other styles' routers are untouched. All 202
  auto-layout tracks (default and 500 fixtures, Show all off and on) are byte-identical to
  `ff5475c`'s (diffed `d` strings). Seeded fuzz `tests/js/subway-fuzz.test.ts`, 447 drops (33 onto
  another station skipped), through the production routing chain with the labels placed as the
  layer places them:

  | per track, 447 drops | ff5475c | 74abc1c |
  |---|---|---|
  | segments off octilinear (± 0.5°) | 0 | 0 |
  | through an own station | 108 | **0** |
  | through an own label at its first spot (above) | 207 | **0** |
  | through an own label the placement moved (below, beside) | 111 | 167 (limit, below) |
  | through another station | 1 | **0** |
  | drag back ≠ original routes | 0 | 0 |

  (The review's own probe counted 106/448 through own ends; it read the stand-in's link ends from
  the edge id, which also produced its one "through another station".) The moved-label cases are the
  label placement's: it avoids stations and labels, not tracks, so a label pushed below a station
  with splits sits on their stubs — listed in `docs/subway.md` § Limits with the count; the fuzz
  test pins it as a ratchet (≤ 167). Also unit tests of the reviewer's repro (st-sys-pairing at
  tip + (−123.65, −147.11): was `M28 120 L28 -12.11 L3 -37.11 L-123.65 -37.11`, now leaves
  downwards) and of the re-slot case (a later `/new` on st-hp-root moves st-hp-routing's link to slot
  1: no longer through its parent), and a new e2e-subway check of the repro with the real mouse
  (`M28 120 L28 135 L13 150 L-126.61 150 L-151.61 125 L-151.61 -22.11 L-136.61 -37.11 L-121.61
  -37.11`: 0 of 401 path samples inside the tip, the pairing or the tip's label).
- **N4 — Rich merge sent a child far away when its parent is on its group's last shelf row.**
  After the base row and the rows below, `nearest()` now searches the group's own segments on the
  lattice around the base, nearest to the parent first, before the continuation label; never
  another group's segment, no saved position moves. Default fixture: st-sys-reply's child 1,392 →
  **340 px** (beside it on its row; 4892ca9: 430 px, in hermes-plugins' segment); st-md-redline's
  child 1,381 → **340 px** (4892ca9: 264 px directly below it — inside the no-project group's
  segment, which N1 forbids; 340 px is the nearest spot in mdesign's own segment, a card being
  280 + 60 px wide). Unit test bounds 430 / 340 and asserts the 264 px spot is another group's;
  the N1 test is unchanged and green. README wording fixed.
- **N6 — a background refresh that keeps failing was invisible.** A small pill, top right of the
  stage, "Couldn't refresh — showing the last data" (`--ui-bg-tertiary` / `--ui-text-secondary` /
  `--ui-stroke-tertiary`), shown while a refresh has failed with data on screen, gone with the next
  successful refresh. The c5 r4 N2 e2e check now waits for it while the gateway is down (exact
  text), reads its colours in light and dark (they differ: theme variables), takes both
  screenshots, and waits for it to go after the restart (`noteCleared: true` in all 7 sync runs).
- **N7** README's excerpt id count (25) and this file corrected. **N8** `c6-coder`, `c6-reviewer`
  and the old `c7-coder` roots moved to `~/.cache/session-tree-e2e/trash/*-fixr1-<ts>` before B1
  was verified (`c3-coder`, an older card's root, is left as found; `c6-r2` and the `*-shots`
  folders are evidence, not roots).

### Simulated

Unchanged from card 7: needs input via the test-only hook (rich, subway suites); running via the
real `is_active` heuristic.

### Scope sweep (fix r1, `git diff ff5475c..HEAD --stat`)

`scripts/e2e/CARD`, `scripts/e2e/harness.ts`, `scripts/run-pytest.sh`, `scripts/test-hermes`,
`tests/js/harness-card.test.ts` (B1); `scripts/e2e-sync.ts` (B2, N6 check); `scripts/run-e2e.sh`
(B3); `src/model/route.ts` (octilinear router only), `tests/js/subway-fuzz.test.ts`,
`scripts/e2e-subway.ts`, `docs/subway.md` (N3); `src/styles/rich/layout.ts`,
`tests/js/rich.test.ts`, `docs/rich-cards.md` (N4); `src/page/session-tree-page.tsx`,
`src/styles.css` (N6); `desktop/plugin.js` (rebuilt); `README.md` (N4, N7); this file (N7).

### Gates, bundle and numbers (code commit `74abc1c`; the docs commit after it changes only docs)

- **`desktop/plugin.js`: 703 954 bytes** (was 701 199: the N3 router and the N6 note), sha256
  `6490d0b8…f2f7747ea6`, byte-identical over a rebuild and to the committed file; imports
  `@hermes/plugin-sdk`, `react`, `react/jsx-runtime` only; no `eval(` / `new Function` (guard tests).
- lint 0; build 0; `npm test` **306/306** (was 293: harness-card 7, subway-fuzz 5, rich +1);
  `env -u SESSION_TREE_CARD npm run test:py` exit 0, **259**; e2e-sync 5 × 22/22; `npm run test:e2e`
  twice back to back with no manual step: **178/178, exit 0** and **178/178, exit 0** — each
  foundation 19 + core-dense 28 + actions 30 + sync 22 + swimlanes 28 + rich 21 + subway **16** (the
  N3 browser check) + final 14; every suite's real-Hermes guard passed. In run 2, foundation and
  core-dense ran on the home `run-e2e.sh` had just reset (B3).
- 500 fixture (e2e-final, run 1): Dense 314 ms / 61.5 fps, Swimlanes 817 ms / 61.6 fps, Subway
  337 ms / 61.2 fps, Rich 338 ms / 61.2 fps.

## Card 8 — follow-up fixes F1–F6

Branch `feature/session-tree-followups` from `dev` at `033096c`; Hermes checkout `3b42157` (read
only, `git status --short` empty before and after). `scripts/e2e/CARD` = 8 (the harness now accepts
cards 1..8): coder ports 19380–19384, homes `c8-coder*`. Findings from card 6 review r2
`t_099e37c7` (NB4), card 7 r1 `t_13edf7f7` and r2 `t_20c0ad8f` (findings 1–3); their evidence
folders were gone, so each repro was rebuilt from the findings text.

| | 033096c (before) | now (after) |
|---|---|---|
| **F1** Rich: refresh-failed note vs open drawer (e2e-rich, sessions poll refused by the browser) | note `{x 1185.0, y 76, w 245.0, h 22.3}` overlaps the drawer `{x 1140, w 300}` at 1440 × 900; `{x 745.0}` overlaps `{x 700}` at 1000 px; light and dark alike | open: note `{x 885.0, y 76}` (1440) / `{x 445.0, y 76}` (1000), 10 px clear of the drawer, inside the canvas `{x 260, w 1180 / 740}`; light and dark |
| F1 note, drawer closed / other styles (1440 × 900) | Rich 1185.03 / 76, Rich 1000 px 745.03 / 76, Dense 921.03 / 76 (inspector open), Swimlanes 1185.03 / 76, Subway 1185.03 / 76 | identical (0 px): every box at top 8 / right 10 of the stage |
| **F2** Subway fuzz (447 drops, seed 7): drops with a station's own track through its own label | 94 drops (167 tracks), 30 of them with a free spot, 65 with none | **48 drops (65 tracks), 0 with a free spot**, 48 with none |
| F2 label/station, label/label overlaps (fuzz, summed) | 0 / 0 | 0 / 0 |
| F2 auto-layout labels with the routed tracks vs without (default + 500 fixtures, Show all off/on) | — | byte-identical, all `above`; the subway tests' track pins unchanged |
| F2 browser check (e2e-subway) | — | st-md-tip dropped under st-hp-root (4th candidate): `below` crossed by both splits, the only free spot `left` taken; 0 own-track points in the label (flow and screen) |
| **F3** shared corridor after a drop | undocumented | `docs/subway.md` § Limits and README § Known limitations (repro: `st-md-tip → redline` / `→ katex` on y = 898 for ≈ 209 px; Re-arrange clears it) |
| **F4** token bar: full extent vs card (light / dark) | 1.20 / 1.27 (10 % text track, no outline) | **3.53 / 5.17** (1 px `--ui-text-tertiary` outline) |
| F4 fill vs track (light / dark) | 3.28 / **2.87** (accent 75 % over the track) | **5.64 / 5.08** (full `--ui-accent` over a clear track) |
| F4 token-bar width check (± 2 px) | pass | pass (sample 480 000 tokens → 54.0 px) |
| **F5** trash after two full runs | grows forever (289 homes, 127 GB seen by the user) | ≤ one copy per home name: after run 2, 7 entries (one run), 3.2 GB |
| **F6** README install | merge into `main`; hand-edited `plugins.enabled` | `dev` checkout; `hermes plugins enable/disable session-tree` |

- **F1.** `.session-tree__stage:has(.st-rc-drawer.is-open) .session-tree__note { right: 310px;
  max-width: calc(100% - 320px) }` — nothing else changes. Screenshots `rich-note-drawer-open-
  {light,dark}-{1440,1000}.png` (before and after).
- **F2.** `placeLabels(stations, blocked, tracks)`: a spot is free when it overlaps no station,
  project label or earlier label and no routed track (exact segment test, 0.5 px inset, the
  fuzz's own threshold); otherwise the least overlap of stations and labels as before, ties broken
  by fewer own tracks, then fewer other tracks. The Subway layer gets the routing chain's `links` and
  `routes` (new `StyleLayerProps` fields, passed by `graph-canvas.tsx`). The fuzz audit computes
  "free" independently (its own order and overlap code). The 48 remaining drops all have no free
  spot (every spot overlaps a station, a label or a track).
- **F4** composited with `scripts/e2e/contrast.ts` on the card with the smallest filled share
  (st-hp-mockup, 3.1 %, the empty part) and the largest (st-sys-tip, full).
- **F5.** `scripts/e2e/trash.ts`: `moveAside` (rename into `trash/<name>-<ms>`, then `pruneTrash`:
  the newest copy of each home name stays) and the one delete, `deleteTrashEntry`: a direct child
  of the real `<root>/trash` only (`..`, nested paths, the root, the trash itself and a trash entry
  that is a symlink are refused), never following a symlink while deleting (links are unlinked), and
  refusing a home with a live gateway (`home/gateway.pid` or a profile's, or any process whose
  `HERMES_HOME` or working directory is inside it; zombies do not count). Every suite's fresh home
  and `test-hermes reset` use it. `npm run clean:e2e [-- --all]` (`scripts/e2e/clean.ts`) moves the
  role's (or every card's and role's) stopped `c<card>-<role>[-variant]` homes (directories with a
  `home/`) into the trash and deletes every trash entry, keeping `pytest-venv`, logs and screenshot
  folders; it refuses and removes nothing while any of them has a live process; it prints each path
  with its size (apparent bytes, a hard-linked file once: equal to `du --apparent-size -B1`, e.g.
  456 707 653 B for a rich home). Unit tests `tests/js/e2e-trash.test.ts` (15).
  - Two full runs back to back (`f149c39`), du measured after each: start trash 929 MB / root
    1.5 GB; after run 1 trash 1.4 GB (3 entries: the homes run 1 replaced) / root 3.3 GB; after run
    2 trash **3.2 GB, 7 entries — one per home, one run** / root **6.4 GB** (7 live homes + the
    trash + `pytest-venv`; measured separately: `du` over both at once counts the shared inodes
    once). Each later run replaces the trash's copies instead of adding to them.
  - A home is 442–471 MB (`du`): `home/cache/uv` 309 MB, `home/installs` 130 MB.
  - **Shared uv cache: not done.** Hermes takes it from `pm.packages.uv_cache_dir()` =
    `get_default_hermes_root() / "cache" / "uv"` (the test's `HERMES_HOME`) and passes it to uv as
    `UV_CACHE_DIR` explicitly (`pm/environment.py`), overriding any environment value; there is no
    override to honour, so the per-home size stays 442–471 MB.
- **F6** in the c8-coder test home (`HERMES_HOME=…/c8-coder/home`), `plugins.enabled` set to
  `[st-dummy-plugin]` first:
  - no gateway: `hermes plugins enable session-tree` → `✓ Plugin session-tree enabled.` (exit 0);
    `plugins.enabled` `[st-dummy-plugin]` → `[session-tree, st-dummy-plugin]`. The config diff is
    that line plus `disabled: []` (an empty list Hermes writes). `hermes plugins disable
    session-tree` → `⊘ Plugin session-tree disabled. No running gateway answered. If one is
    running, restart it for this to take effect: hermes gateway restart`; enabled back to
    `[st-dummy-plugin]`, `disabled: [session-tree]`.
  - test gateway running (Webapp on 19380): enable → `✓ Plugin session-tree enabled. Gateway
    reloaded plugins; nothing of this plugin needs a session or restart.`; disable → `The running
    gateway reloaded its plugins and unloaded session-tree; platform hooks it already wired up stay
    until a gateway restart (hermes gateway restart).`
  - No consent prompt (`capabilities: []`). README § Install says this.

### Found on the way (not changed)

- **e2e-swimlanes "B1-r3" depends on the time of day.** It asserts that `st-scale-0007` (seeded
  4.5 h old) is drawn in the default Swimlanes view with Show all on. It passed at 23:4x
  (run 1) and failed at 00:0x (run 2) and 00:2x (alone). Most likely cause: after midnight that
  session falls into the previous day's column, which changes the lanes' packing, and the view no
  longer shows it (screenshot `failure-1.png` of that run). Swimlanes is
  untouched by this card; not fixed (outside F1–F6).
- The real-Hermes guard of one before-run of e2e-rich (CSS of 033096c) failed on
  `~/.hermes/desktop-plugins` at 23:15: the user checked out `main` → `dev` in their checkout, and
  their Hermes re-copied the linked package's `plugin.js` (`.hermes-package.json` source mtime
  23:15:18). Nothing of this card touches `~/.hermes`; every later guard passed.

### Simulated

Unchanged: needs input via the test-only hook (rich, subway); running via the real `is_active`
heuristic. F1's failed refresh is the browser refusing the plugin's `/sessions` poll (the gateway
stays up).

### Scope sweep (`git diff 033096c..HEAD`)

F1: `src/styles.css`, `scripts/e2e-rich.ts`. F2: `src/styles/subway/labels.ts`,
`src/styles/subway/layer.tsx`, `src/styles/types.ts` and `src/page/graph-canvas.tsx` (the routes
reach the layer), `tests/js/subway-fuzz.test.ts`, `tests/js/subway.test.ts`,
`scripts/e2e-subway.ts`. F4: `src/styles.css`, `scripts/e2e-rich.ts`. F5: `scripts/e2e/trash.ts`,
`scripts/e2e/clean.ts`, `tests/js/e2e-trash.test.ts`, `package.json` (`clean:e2e`), the fresh-home
code of `scripts/e2e/common.ts`, `e2e-actions.ts`, `e2e-sync.ts`, `e2e-swimlanes.ts`,
`e2e-rich.ts`, `scripts/e2e/test-hermes-cli.ts` (reset). Card number: `scripts/e2e/CARD`,
`scripts/e2e/harness.ts`, `tests/js/harness-card.test.ts`. Docs: `README.md`, `docs/subway.md`,
`docs/rich-cards.md`, this file. `desktop/plugin.js` rebuilt.

### Gates, bundle and numbers

- **`desktop/plugin.js`: 706 600 bytes** (was 703 954), sha256 `e5e3e90a…537b6b23f`,
  byte-identical over a rebuild; imports `@hermes/plugin-sdk`, `react`, `react/jsx-runtime` only; no
  `eval(` / `new Function` (guard tests).
- lint 0; build 0; `npm test` **323/323** (was 306: e2e-trash 15, subway +2); `npm run test:py`
  **259 passed**.
