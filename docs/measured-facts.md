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
  `env -i HOME=<root>/userhome HERMES_HOME=<root>/home TMPDIR=<root>/tmp … <root>/hermes --run-path scripts/pytest-main.py -p no:cacheprovider --rootdir tests/py --basetemp ~/.cache/session-tree-e2e/pytest-tmp tests/py`.
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
  "session" → catalog **Filters** → **Installed** → switch **"Desktop: Session Tree"**. The choice
  persists in the browser's `localStorage['hermes.desktop.pluginDecisions.v2']`
  (`{"session-tree": true}`, `contrib/plugins-store.ts:38`), so every fresh browser context must
  flip it again (the e2e does).

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
