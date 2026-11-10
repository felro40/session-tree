# Session Tree

A Hermes Desktop / Webapp plugin that shows sessions as an interactive branch graph.
Work happens on `feature/session-tree` (Kanban tenant `session-tree`).

Each chat session is a block; `/branch` children hang off their parent, compression segments of
one conversation fold into one block, and `/new` resets show as a dashed "continued as" link. The
page is reached from the sidebar ("Session Tree"), from ⌘K ("Open Session Tree") and at the route
`/session-tree`; double-clicking a block opens that session in a new tab.

**Status: 4/7 synced layout.** The page draws the session families as a real graph in the
*Dense + inspector* style: tidy-tree auto-layout grouped by project, `/branch` links,
"compacted ×N" blocks, dashed "continued as" links, "Parent not loaded" stand-ins, singles in the
inspector's list (or on the canvas with **Show all**), archived on request, a project scope with
read-only dimmed blocks outside it, a profile filter, wheel zoom / middle-drag pan / snap grid, the
on-drop link router, live refresh, and the inspector. Every block in scope has the PROJECTS
pane's session menu (right-click, the block's ⋯, the inspector's ⋯ and buttons): Rename…, Pin,
Mark as read/unread, Appearance ▸, Copy ID, Branch, Export, Move to project ▸, Archive/Unarchive,
Delete. Block positions, the view style and Snap are saved by the backend and synced to every
window and device of the gateway (push, with a 5 s poll as the fallback); zoom/pan and the view
toggles stay per device; Re-arrange has Undo; Settings → Plugins → Session Tree and the toolbar
switch the style (see `docs/layout-sync.md`). The other three styles come in cards 5–7.

### Source map

| Path | What |
|---|---|
| `src/model/branch-tree.ts` | Port of the desktop's `session-branch-tree.ts` rules (forkParentId nesting, compression collapse); its tests are mirrored in `tests/js/branch-tree.test.ts`. |
| `src/model/graph.ts` | Rows + `projects.tree` → nodes, edges, families, singles, stand-ins, scope (`buildGraph`). |
| `src/model/layout.ts`, `layout-memory.ts` | Deterministic tidy-tree layout and the merge that places new sessions inside their own project group's band without moving placed blocks; the cards 2–3 in-memory positions (now only unit-tested). |
| `src/model/layout-sync.ts`, `device-prefs.ts` | Card 4: the synced layout store client (snapshot + queued changes, debounced batched saves, never during a drag, offline cache and retry, push/poll refresh, Re-arrange/Undo) and the per-device preferences (`ctx.storage`). |
| `src/model/route.ts` | Link geometry and the R13 router: one `LinkRouter` per link shape (Dense: `curveRouter`); on-drop detours on a sparse orthogonal grid (A*). |
| `src/model/projects.ts`, `status.ts`, `format.ts` | Project membership, live status from `host.state`, display formatting. |
| `src/model/actions.ts` | The session actions' pure rules: routes (rename RPC vs backend), move targets, the delete gate and note, the export file name, the mutation-snapshot fence client, optimistic row overrides. |
| `src/styles/` | The style registry (`registry.ts`: the synced choice + device override), the style contract (`types.ts`), the Dense style (`dense/`) and the test-only `e2e-alt/` (registered only in the e2e's own build). |
| `src/page/` | The page (data, refresh), the shared canvas shell (`graph-canvas.tsx`), toolbar (with the style switcher), the block menu (`session-menu.tsx`, SDK ContextMenu), the actions controller with its dialogs (`session-actions.tsx`) and the shared services (`services.ts`: layout store, device prefs, push + poll). |

## Package layout (one unified Hermes package)

| Path | What |
|---|---|
| `plugin.yaml`, `__init__.py` | Agent half. No tools; it exists so `plugins.enabled` can mount the backend. |
| `dashboard/manifest.json`, `dashboard/plugin_api.py` | Python backend (FastAPI `APIRouter`) at `/api/plugins/session-tree/`, reached with `ctx.rest`: the session rows, the session actions the SDK has no verb for (rename, read state, archive, delete, export), each through the core endpoint's own code path, and the synced layout store. Projects come from the gateway's own `projects.tree` RPC (`host.request`). |
| `dashboard/layout_store.py` | The synced layout store (standard library only): `<HERMES_HOME>/session-tree/state.json`, atomic writes under a thread lock + `fcntl.flock`, caps, corrupt-file backup, prune (`docs/layout-sync.md`). |
| `desktop/plugin.js` | Desktop half. **Built output** of `src/` (`npm run build`), committed so the package installs without a build. |
| `src/` | TypeScript + JSX source: `plugin.tsx` (registration), `page/`, `settings/`, `model/` (pure graph rules), `shims/react-dom.ts`. |
| `tests/js/` | node:test unit tests and the static bundle guards. |
| `tests/py/` | pytest for the backend against an isolated, seeded Hermes home. |
| `scripts/` | build, the test-Hermes harness, the fixture seeder, e2e suites. |
| `docs/measured-facts.md` | Pre-check results and other measured facts. |
| `docs/layout-sync.md` | Card 4: the synced layout store, its endpoints, the page's sync rules, the test-only style. |

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
`docs/layout-sync.md`): `GET /state[?since_rev=]`, `PATCH /state/positions`, `PATCH /settings`,
`DELETE /state/layout?style=&scope=` (Re-arrange), `PUT /state/layout` (Undo), `POST /state/forget`.
They write only `<HERMES_HOME>/session-tree/state.json` and push `plugin.session-tree.layout.changed`.

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
| `npm run test:e2e` | `scripts/run-e2e.sh`: every e2e suite in turn — `scripts/e2e-foundation.ts` (card 1), `scripts/e2e-core-dense.ts` (card 2), `scripts/e2e-actions.ts` (card 3) and `scripts/e2e-sync.ts` (card 4: two browser contexts as two devices, a package built with the test-only style). The actions and sync suites mutate their fixtures, so each runs in its own fresh home `c<card>-<role>-actions` / `-sync` on the same ports, the previous one moved to the e2e trash. Each starts the isolated test Hermes, signs in, enables the desktop half and checks the page in Chrome with real mouse/keyboard input. `KEEP_RUNNING=1` leaves the gateway up. |
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
scripts/test-hermes reset     # stop and move the role's root to ~/.cache/session-tree-e2e/trash/
```

- Role `SESSION_TREE_ROLE=coder` (default) or `reviewer`, card `SESSION_TREE_CARD` (default: the
  current card, 4): root `~/.cache/session-tree-e2e/c<card>-<role>/`, ports `19300 + 10·card`
  (+0..+4 coder, +5..+9 reviewer). Card 4: coder home `c4-coder/home`, ports 19340–19344 (the
  Webapp on 19340); reviewer `c4-reviewer`, ports 19345–19349. The actions and sync suites' own
  homes are `c4-<role>-actions` and `c4-<role>-sync` (same ports, never running at the same time as
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
  (card 4's failed-load check).
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

Not done yet, and never by a worker: it happens after the whole set is reviewed, with the user's
go-ahead. The steps, for reference only:

1. Link the package into your Hermes: `ln -s /home/david/work_projects/session-tree ~/.hermes/plugins/session-tree`
   (from the merged main checkout).
2. Allow the backend: `hermes config set plugins.enabled '[…existing…, "session-tree"]'`
   (keep the plugins already listed).
3. Restart the gateway so the backend mounts: `hermes gateway restart`.
4. Enable the desktop half: Capabilities → Plugins → Installed → Session Tree → **Desktop** switch
   (it ships disabled), in the desktop app and in each Webapp browser.
