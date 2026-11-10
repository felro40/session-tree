# Session Tree

A Hermes Desktop / Webapp plugin that shows sessions as an interactive branch graph.
Work happens on `feature/session-tree` (Kanban tenant `session-tree`).

Each chat session is a block; `/branch` children hang off their parent, compression segments of
one conversation fold into one block, and `/new` resets show as a dashed "continued as" link. The
page is reached from the sidebar ("Session Tree"), from ⌘K ("Open Session Tree") and at the route
`/session-tree`; double-clicking a block opens that session in a new tab.

**Status: 2/7 graph core + Dense + inspector.** The page draws the session families as a real
graph in the *Dense + inspector* style: tidy-tree auto-layout grouped by project, `/branch` links,
"compacted ×N" blocks, dashed "continued as" links, "Parent not loaded" stand-ins, singles in the
inspector's list (or on the canvas with **Show all**), archived on request, a project scope with
read-only dimmed blocks outside it, a profile filter, wheel zoom / middle-drag pan / snap grid, the
on-drop link router, live refresh, and the inspector. Positions live in memory (card 4 persists
them); the session actions are shown but disabled (card 3); the other three styles come in cards
5–7.

### Source map

| Path | What |
|---|---|
| `src/model/branch-tree.ts` | Port of the desktop's `session-branch-tree.ts` rules (forkParentId nesting, compression collapse); its tests are mirrored in `tests/js/branch-tree.test.ts`. |
| `src/model/graph.ts` | Rows + `projects.tree` → nodes, edges, families, singles, stand-ins, scope (`buildGraph`). |
| `src/model/layout.ts`, `layout-memory.ts` | Deterministic tidy-tree layout and the merge that places new sessions inside their own project group's band without moving placed blocks; in-memory positions per style + profile + scope. |
| `src/model/route.ts` | Link geometry and the R13 router: one `LinkRouter` per link shape (Dense: `curveRouter`); on-drop detours on a sparse orthogonal grid (A*). |
| `src/model/projects.ts`, `status.ts`, `format.ts` | Project membership, live status from `host.state`, display formatting. |
| `src/styles/` | The style registry (`registry.ts`), the style contract (`types.ts`) and the Dense style (`dense/`). |
| `src/page/` | The page (data, refresh), the shared canvas shell (`graph-canvas.tsx`), toolbar and block menu. |

## Package layout (one unified Hermes package)

| Path | What |
|---|---|
| `plugin.yaml`, `__init__.py` | Agent half. No tools; it exists so `plugins.enabled` can mount the backend. |
| `dashboard/manifest.json`, `dashboard/plugin_api.py` | Python backend (FastAPI `APIRouter`) at `/api/plugins/session-tree/`, reached with `ctx.rest`. Read-only today: `GET /health`, `GET /sessions`. Projects come from the gateway's own `projects.tree` RPC (`host.request`). |
| `desktop/plugin.js` | Desktop half. **Built output** of `src/` (`npm run build`), committed so the package installs without a build. |
| `src/` | TypeScript + JSX source: `plugin.tsx` (registration), `page/`, `settings/`, `model/` (pure graph rules), `shims/react-dom.ts`. |
| `tests/js/` | node:test unit tests and the static bundle guards. |
| `tests/py/` | pytest for the backend against an isolated, seeded Hermes home. |
| `scripts/` | build, the test-Hermes harness, the fixture seeder, e2e suites. |
| `docs/measured-facts.md` | Pre-check results and other measured facts. |

### Backend API

- `GET /health?session_profile=<name|*>` → `{ ok, plugin, version, profiles }`.
- `GET /sessions?session_profile=<name|*>&include_archived=<bool>&limit=<n>` → `{ sessions, profiles,
  limit, truncated, errors }`. Rows are the core session list's (`SessionDB.list_sessions_rich`
  through Hermes's own read-only profile helpers, exactly as `GET /api/profiles/sessions`), with
  `SessionInfo` fields plus `is_internal_child` and `compacted_segments` (the number of earlier
  compression segments folded into the row). `limit` defaults to 500 and is capped at 2000.
- Every endpoint requires `session_profile`; a malformed name is a 400, an unknown profile a 404. The key is not `profile`: on plugin routes `?profile=` is the gateway's own profile selector (the Webapp sets it to the active profile on every `ctx.rest` call), so it cannot carry the data selection (see `docs/measured-facts.md`, pre-check 5).

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
| `npm run test:e2e` | `scripts/run-e2e.sh`: every e2e suite in turn — `scripts/e2e-foundation.ts` (card 1) and `scripts/e2e-core-dense.ts` (card 2). Each starts the isolated test Hermes, signs in, enables the desktop half and checks the page in Chrome with real mouse/keyboard input. `KEEP_RUNNING=1` leaves the gateway up. |
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
  current card, 2): root `~/.cache/session-tree-e2e/c<card>-<role>/`, ports `19300 + 10·card`
  (+0..+4 coder, +5..+9 reviewer). Card 2: coder home `c2-coder/home`, ports 19320–19324 (the
  Webapp on 19320); reviewer `c2-reviewer`, ports 19325–19329.
- Setup writes the test config with `hermes config set` (`webapp.enabled true`, `webapp.host
  127.0.0.1`, `webapp.port`, `plugins.enabled: [session-tree]`), symlinks this checkout into the
  **test home's** `plugins/session-tree`, creates the `work` and `scale` profiles and seeds fixtures.
- The Webapp bundle is always reused (`--skip-build`); nothing is built in the Hermes checkout.
- `scripts/seed-fixtures.py` creates the fixtures through Hermes's own `SessionDB` API (three
  project repos, the mockup families incl. a grandchild, a 4-segment compressed conversation, a
  `/new` reset chain, an orphaned branch, a cross-project family, 24 singles, 2 archived, one
  recently active session, hidden delegate/cron/kanban/tool sessions, a second profile with 3
  sessions and a 500-session `scale` profile). Direct SQL touches only timestamps of the isolated
  fixture DB. `--branch NEW PARENT [TITLE]` and `--activate ID` (used by the card-2 e2e) add a live
  branch and stamp a session active now.
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
