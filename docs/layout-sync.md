# Synced layout store, settings and style switching (card 4)

How Session Tree keeps block positions and the view settings across reloads, windows and devices
(R12, R16, R17, R18). Measured numbers are in `measured-facts.md` (card 4 section).

## What lives where

| What | Where | Synced? |
|---|---|---|
| View style (`style`), Snap grid (`snap`) | backend store, `settings` | every window and device served by the gateway |
| Block positions, per profile → style → scope → block id, `{x, y, updated_at}` | backend store, `layouts` | yes |
| Zoom + pan per style + profile + scope | `ctx.storage` `viewport.v1:<style>\|<profile>\|<scope>` | no (this device) |
| Show all, Show archived, the profile filter, the style override, the side panel per style | `ctx.storage` `device.v1` | no |
| The last server snapshot of each profile (offline fallback) | `ctx.storage` `layoutCache.v1:<profile>` | — |
| Changes not yet acknowledged by the backend | `ctx.storage` `layoutPending.v1` | — |

`ctx.storage` is namespaced by the host to `hermes.plugin.session-tree.*`.

## The backend store (`dashboard/layout_store.py`)

- **File:** `<HERMES_HOME root>/session-tree/state.json` (the root, not a profile home: the profile
  is a key inside; the gateway may serve a request in a secondary profile's scope). Outside the
  plugin package, which installs and updates replace.
- **Shape (schema 1):** `{"schema": 1, "rev": N, "settings": {"style": null|id, "snap": bool},
  "layouts": {profile: {style: {scope: {block: {"x", "y", "updated_at"}}}}}}`. `rev` counts writes.
  `profile` is a profile name or `*` (the All profiles view keeps its own layouts). Block ids are the
  graph's node ids: session ids, `<profile>/<id>` (only when two profiles share an id),
  `missing:<profile>/<id>` (stand-ins) and `group:<project>` (+ `\x1f<n>` continuation labels).
- **Atomic writes:** each write goes to `.state.json.tmp-<pid>-<random>` in the same folder, is
  `fsync`ed, then `os.replace`d over `state.json`, then the folder is `fsync`ed. A killed writer
  leaves the old file or the new one; its temp file is ignored, and removed by the next writer
  (every writer holds the lock while its temp file exists, so under the lock any temp is stale).
- **One writer at a time — threads and processes:** a process-level `threading.Lock`, then an
  exclusive `fcntl.flock` on the sidecar `session-tree/state.lock`. The flock is what makes two
  processes safe (a second gateway worker, a plugin host child, the pytest's second process):
  every mutation re-reads `state.json` under both locks, applies its change, bumps `rev` and writes.
  So no update to distinct blocks is lost, and for one block the later write wins.
- **Last write wins per block, by server receive time:** an upsert stamps `updated_at` when it is
  applied under the lock (strictly increasing, also across processes: never below the newest stamp
  in the file).
- **Two upsert modes:** `set` (a drop: replaces the stored entry) and `if_absent` (what an
  auto-layout placed: never replaces a stored entry, so a late first save from one window cannot
  undo another window's drop).
- **Untrusted input, caps:** profile `^(\*|[a-z0-9][a-z0-9_-]{0,63})$` (and known to this Hermes),
  style `^[a-z][a-z0-9-]{0,31}$`, scope 1–1024 chars, block id 1–600 chars, no control characters
  (except `\x1f` in block ids), coordinates finite and within ±1e7, exactly `{id, x, y}` per entry.
  2000 entries per request (413), 5000 per layout, 256 layouts per profile, 64 profiles, 8 MiB file.
  Bodies reject unknown fields. A refused request writes nothing.
- **Corrupt file:** a `state.json` that does not parse (or holds `NaN`/`Infinity`) or does not
  validate is moved to `state.json.corrupt-<UTC time>-<random>.bak` (under the locks, before
  anything else is written) and an empty, valid state is served. A file of a **newer** schema is
  never overwritten: it reads as empty and writes answer 409.
- **Prune:** serving `GET /state` first drops the positions of sessions that no longer exist
  (`SessionDB.get_session_list_row` on a read-only open per profile; archived rows exist, so they
  keep theirs). Group labels and stand-ins are not sessions and stay. When a profile's store cannot
  be read, nothing is pruned.

## Endpoints (`dashboard/plugin_api.py`)

All take `session_profile=<name|*>` (400 malformed, 404 unknown). Each change is pushed as
`plugin.session-tree.layout.changed` `{rev, profile, kind}` (`broadcast_plugin_event`).

| Endpoint | What |
|---|---|
| `GET /state[?since_rev=N]` | `{schema, rev, settings, layouts}` of the profile (pruned first); `since_rev` equal to the current `rev` answers `{schema, rev, unchanged: true}` (the cheap poll). |
| `PATCH /state/positions` `{style, scope, mode: set\|if_absent, positions: [{id, x, y}]}` | Batch upsert → `{ok, rev, changed, applied, skipped, updated_at}`. |
| `PATCH /settings` `{style?, snap?}` | The synced settings (global) → `{ok, rev, changed, settings}`. |
| `DELETE /state/layout?style=&scope=` | Re-arrange: removes one layout → `{ok, rev, changed, removed}`. |
| `PUT /state/layout` `{style, scope, positions}` | Undo: the layout becomes exactly `positions` → `{ok, rev, changed, count}`. |
| `POST /state/forget` `{ids}` | A session moved to another project: its blocks leave every layout of the profile (so each layout places it anew in its new band). |

None of them touches `state.db`.

## The page (`src/model/layout-sync.ts`, `src/page/services.ts`)

- One `LayoutSync` and one `DevicePrefs` per plugin load (`register(ctx)`), shared by the page and
  the settings page.
- **Reads:** the profile's last server snapshot with this window's unacknowledged changes replayed
  on top. The page lays out only once the first fetch answered or failed (`settled`), so it never
  shows (or saves) an auto-layout and then moves it.
- **Writes:** queued, sent after a 300 ms trailing debounce, consecutive upserts of one layout
  batched into one request. Nothing is sent while a block is dragged (`setDragging`); the drop is
  recorded on mouse-up and goes out 300 ms later. Auto-layout placements go as `if_absent`.
- **Re-arrange** queues a delete of the current style + scope layout and shows a toast with Undo,
  which queues a `PUT` of exactly what the window showed before.
- **Offline:** a request that fails (network, 5xx, the plugin route missing) keeps the queue in
  `ctx.storage`, marks the profile offline ("offline: showing last saved layout" banner) and retries
  with a backoff (1, 2, 5, 5, 10 s). The page keeps working on the cached snapshot; a reload while
  offline still has the queued changes. A refusal (400/409/413/422) is dropped and shown as an error.
- **Other windows (push, then poll):** card 1's pre-check 5 measured that a plugin `ctx.socket`
  never dials in the Webapp, while `broadcast_plugin_event` from the backend reaches
  `host.onEvent` there. So the backend pushes `layout.changed`, the page refreshes on it (unless it
  already has that `rev`), and it also polls `GET /state?since_rev=` every 5 s while the page is
  visible (`document.visibilityState`), for a missed push. A refresh never moves a block that is
  being dragged (the canvas draws the drag position) and never flushes a pending drop early.
- **Styles:** the effective style is this device's override if it names a registered style, else
  the synced style if registered, else Dense (`resolveStyleId`). The toolbar switcher changes the
  override when one is set, else the synced style. Settings → Plugins → Session Tree has View style
  (synced), On this device (Use synced style, or a style) and Snap grid default (synced; the
  toolbar's Snap toggle is the same setting). A style with `savesLayout: false` (Swimlanes, card 5)
  saves nothing.

## The test-only style

The e2e needs a second style for the switcher before cards 5–7 exist. `src/styles/e2e-alt/` makes
one (Dense with wider spacing, id `e2e-alt`, label "E2E alt (test only)"). The registry adds it only
when the build-time constant `__SESSION_TREE_TEST_STYLES__` is true:

- `npm run build` (the committed `desktop/plugin.js`) defines it `false`; esbuild folds the
  registry's branch away and drops `makeE2eAltStyle`, so the code is not in the bundle at all —
  nothing at runtime (storage, URL, settings) can enable it.
- `node scripts/build.mjs --test-styles --outfile <path>` defines it `true`; the build refuses an
  `--outfile` of `desktop/plugin.js`. Only the e2e harness runs it (`buildTestPackage`: the sync
  suite installs `<test root>/package/`, a copy of the agent half and backend plus that build).
- `tests/js/guards.test.ts` proves it on the committed bundle: no `makeE2eAltStyle`, no `"e2e-alt"`,
  no "E2E alt", no `__SESSION_TREE_TEST_STYLES__`, and the registry map holds only Dense.
