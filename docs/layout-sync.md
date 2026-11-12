# Synced layout store, settings and style switching (card 4)

How Session Tree keeps block positions and the view settings across reloads, windows and devices
(R12, R16, R17, R18). Measured numbers are in `measured-facts.md` (card 4 section).

## What lives where

| What | Where | Synced? |
|---|---|---|
| View style (`style`), Snap grid (`snap`) | backend store, `settings` | every window and device served by the gateway |
| Block positions, per profile → style → layout key, `{x, y, updated_at}` (card 10: one layout per style; stored under the scope key `all`) | backend store, `layouts` | yes |
| Zoom + pan per style + profile + scope | `ctx.storage` `viewport.v2:<style>\|<profile>\|<scope>` (card 10; `viewport.v1` entries are ignored and removed) | no (this device) |
| Show all, Show archived, the profile filter, the project scope per profile filter (`scopes`), the style override, the side panel per style, a panel's sections (`sectionsOpen`: the Dense inspector's Singles) | `ctx.storage` `device.v1` | no |
| Layout history: the arrangements a Re-arrange or a restore replaced, one list per profile → style | backend store, `backups.json` | yes |
| The last server snapshot of each profile (offline fallback; never a read-only one) | `ctx.storage` `layoutCache.v1:<profile>` | — |
| Changes not yet acknowledged by the backend, one slot per window | `ctx.storage` `layoutPending.v2` | — |
| The latest drop time per layout + key on this device | `ctx.storage` `layoutDrops.v1` | — |

`ctx.storage` is namespaced by the host to `hermes.plugin.session-tree.*` (`localStorage`: shared by
every window of one browser profile, read live on each `get`).

## One layout per style (card 10)

The project scope chips only **dim and frame**: a style has one layout per profile, and every
scope shows it. Choosing a scope never moves a block and never changes a stored position;
arranging blocks in a project scope changes the layout All projects shows. Dense, Subway and Rich
cards keep separate layouts (their blocks differ in size); Swimlanes has none and still collapses
the other lanes in a scope.

- **Store shape:** `state.json` stays schema 1 with its `profile → style → scope` shape, but the
  only scope key used is `all` (a style's shared layout is its All projects layout as it was), so
  an older Session Tree still reads it as its All layout.
- **Auto-layout order:** `groupOrder` no longer puts the scoped project first: for any scope the
  auto-layout (fresh, and the merge of new sessions) gives exactly All's positions. The Dense
  inspector's singles, the Subway depot and the Rich drawer still list only the scope's sessions.
- **Migration:** on the first load (`GET /state`, `GET /state/backups`) or write after the upgrade,
  the store drops every layout of another scope from `state.json` and every backup of another
  scope from `backups.json`, under the store's locks, each file replaced atomically (the backups
  first; a writer killed in between leaves `state.json` as it was, and the next load finishes the
  job), and logs one line (`session_tree.layout_store`: how many layouts and backups it dropped).
  The `all` layouts are kept byte for byte; nothing is copied into Layout history (the user ruled
  the per-scope arrangements need not be kept). The migration bumps `rev`, so other windows'
  polls pick it up.
- **Retired scopes:** a write to a scope other than `all` (`PATCH /state/positions`, `PUT` /
  `DELETE /state/layout`, `PUT /state/layout/project`) answers **409 `scope_layout_retired: …`**
  and changes nothing. Its own code, not `newer_schema`: a still-open older tab gets one "could not
  save the layout" notice and drops the op, instead of turning read-only or silently writing a
  layout nothing reads. The page itself only ever sends `all` (`layoutRef`).
- **Old queued ops:** a window's pending queue (`layoutPending.v2`) can hold ops an older build
  queued for another scope. When a window adopts a queue (on load, or a closed window's slot) those
  are dropped, never sent, with no notice. The queue format is unchanged; a scoped Re-arrange is a
  new op kind (`project`), which an older build's reader skips.
- **Camera (`viewport.v2`):** zoom + pan stay remembered per device, per style + profile + scope.
  The keys were bumped once from `viewport.v1` (saved for the old per-scope positions): v1 entries
  are never read, and are removed when the page looks at their key or names it (every style × the
  known profiles × All + the projects; the storage cannot list its keys). With no remembered view
  a project scope frames that project's blocks on the canvas, All everything; **Fit** does the
  same; a remembered view that shows none of the scope's blocks (in a project scope: of that
  project's) opens framed on them.
- **Re-arrange in a project scope** resets only that project's blocks (L2). The page computes a
  fresh full auto-layout of the current graph (All order) and sends one
  `PUT /state/layout/project` with the spots it gives that project's blocks (its sessions and
  in-scope stand-ins, by layout key) and its group labels; a project key the fresh layout does not
  place (a continuation label, a single while Show all is off) goes in `remove`. The server
  applies it per block under the lock (last write wins per block): every other block is untouched,
  also one another device moved meanwhile. Before changing anything it keeps a backup of the whole
  style layout in Layout history, written first under the same lock (`project` recorded with it).
  In a layout nobody dragged nothing moves (no backup, no new revision). **Undo** sends the same
  endpoint without `backup`: exactly that project's previous entries back, the keys the
  Re-arrange added removed, no other block touched. Every Undo (this one, a Re-arrange in All
  projects' and a restore's) skips a block moved to another project since (review t_5e9be878
  N1): the page compares each block's project when the action ran with its project at Undo (its
  graph model, which follows other devices too), and the moved block gets no entry and no
  remove (in a whole-layout `PUT` it is left out), so it keeps the spot the auto-layout gave it in
  its new band; group labels and every other entry come back exactly. A refused scoped Re-arrange removes its toast
  too (`onReplaceRefused`, with the `project`). Re-arrange in All projects is unchanged
  (`DELETE /state/layout`). Known limitation: a block of another project dragged into that
  project's area can overlap the reset blocks (README § Known limitations).

## Layout keys (card-4 review B2)

A block's position is stored under its **layout key**, not its block id:

- a **compression lineage** (one block, "compacted ×N") is keyed by its lineage **root** id: the
  core list's `_lineage_root_id` (`hermes_state_session_list.project_compression_tips` sets it to
  the root row's id on the projected tip row; `SessionDB.get_compression_lineage(id)[0]` is the
  same id). The block id is the live **tip** and changes on every compaction; the root does not;
- every other block keeps its own id (a session never compacted has no `_lineage_root_id`, so its
  key is what card 4 stored: no schema bump, nothing moves);
- like block ids, a key is profile-qualified (`<profile>/<root>`) only when two profiles share it.

`GraphNode.layoutKey` holds it; `layoutKeysOf(model)` maps block id ↔ key for `LayoutSync.place()`.
Every position read or write speaks keys: `PATCH /state/positions` (drops and auto placements),
`DELETE` / `PUT /state/layout` (Re-arrange / Undo: what the window showed, by key),
`POST /state/forget` (move to project), the local cache, the pending queue and push/poll merges.
Selection, double-click open, the session actions, the focus highlight and the Branch parent
keep using the live tip id.

**Migration (and no pile-up of old tip keys):** serving `GET /state` canonicalises in the same
step as prune: an entry keyed by a non-root member of a lineage (an old tip, a middle segment) is
re-keyed to the root; when the root already has an entry, the newer by `updated_at` wins; the
member key is dropped either way. So a block a card-4 page stored under its tip comes back at
its spot, and every compaction leaves exactly one entry.

## The backend store (`dashboard/layout_store.py`)

- **File:** `<HERMES_HOME root>/session-tree/state.json` (the root, not a profile home: the profile
  is a key inside; the gateway may serve a request in a secondary profile's scope). Outside the
  plugin package, which installs and updates replace.
- **Shape (schema 1):** `{"schema": 1, "epoch": E, "rev": N, "settings": {"style": null|id, "snap": bool},
  "layouts": {profile: {style: {"all": {key: {"x", "y", "updated_at"}}}}}}`. `rev` counts writes.
  The scope level stays for older readers; card 10 uses only `all` (see One layout per style).
  `profile` is a profile name or `*` (the All profiles view keeps its own layouts). Keys are the
  graph's layout keys: session ids (a compacted conversation's lineage root), `<profile>/<id>`
  (only when two profiles share an id), `missing:<profile>/<id>` (stand-ins) and `group:<project>`
  (+ `\x1f<n>` continuation labels).
- **Epoch (card-4 review NB2):** `epoch` is a random 16-hex id minted whenever a fresh
  `state.json` is written: the first write, the first write after a corrupt file was moved aside,
  after the file was deleted. `(epoch, rev)` names a state; a `rev` alone restarts at 1 with a new
  file, and a window holding the old file's rev could take the new file for one it has. `epoch` is
  an optional key of schema 1 (no bump): a file without it (written by card 4) still loads, as the
  one stable epoch `legacy`, until its next write persists a real one; no file at all is `none`.
  A malformed `epoch` makes the file corrupt (`.bak`).
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
  never overwritten: `GET /state` serves it as empty with `read_only: true` and `store_schema`
  (epoch `newer`), and every write answers 409 with a detail starting `newer_schema: `.
- **Prune + canonicalise:** serving `GET /state` first drops the positions of sessions that no
  longer exist and re-keys compression-lineage members to the lineage root (see Layout keys).
  Both come from one `SessionDB.get_compression_lineage(id)` per stored id on a read-only open per
  profile (`[]`: no such row; archived rows exist, so they keep theirs; `[0]` is the root). An
  entry is kept when its key is an existing session id or the lineage root of one. Group labels
  and stand-ins are not sessions and stay. When a profile's store cannot be read, nothing is
  pruned or moved.
- **Layout history (`backups.json`, its own schema 2):** `{"schema": 2, "backups": [{id, profile,
  style, scope, project, created_at, reason, positions: {key: {x, y}}}]}`, oldest first. `scope`
  is `all`; `project` is the project a Re-arrange in a project scope reset, `null` for one in All
  projects and for a restore. Schema 1 (card 4–9, no `project`) still loads, its backups reading as
  `project: null` ("Before Re-arrange · All projects"), and is written back as schema 2; an older
  Session Tree reads a schema-2 file as newer (see below). A Re-arrange
  (`DELETE /state/layout`) keeps the layout it forgets (`reason: "rearrange"`); a scoped
  Re-arrange (`PUT /state/layout/project` with `backup: true`) keeps the whole style layout
  (`"rearrange"`, with its `project`); a restore
  (`PUT /state/layout` with `backup: true`) keeps the one it replaces (`"restore"`); an Undo
  (`PUT` without it) and a Re-arrange of nothing keep none. An arrangement the layout already has
  a backup of adds no second copy (that one moves to the newest end). At most 10 per profile +
  style (the oldest go first), 200 in all, within 16 MiB; the global caps take the oldest
  backup of a style that has more than one first, so a style keeps its newest backup unless
  every style is down to one. Written under the same locks,
  atomically, **before** `state.json`: a writer killed in between leaves one extra backup, never a
  lost layout. A corrupt `backups.json` is moved to `backups.json.corrupt-<time>-<random>.bak` and
  never blocks a Re-arrange; a newer-schema one (after a downgrade) reads as empty
  (`read_only: true`) and refuses a Re-arrange and a restore (409 `layout_history_newer: …`, the
  layout stays; not `newer_schema`, so the page stays writable and the page drops the refused op
  with one notice). Drops, Undo and `POST /state/forget` still work then (forget leaves a newer
  file alone). `POST /state/forget` drops the blocks from
  the profile's backups too (a backup that held only them goes). Backups are not pruned when a
  session is deleted: a restore with a gone session's key is harmless (no block uses it, and the
  next `GET /state` prunes it). A restore is a `PUT` of positions, not of a backup id, so the
  server cannot tell that they came from a backup of the same style; the page checks it
  (`layout-history.tsx`), and a mismatched `PUT` is no worse than any other `PUT`. A separate
  file, so `state.json` keeps its schema and an older Session Tree reads it as before.

## Endpoints (`dashboard/plugin_api.py`)

All take `session_profile=<name|*>` (400 malformed, 404 unknown). Each change is pushed as
`plugin.session-tree.layout.changed` `{epoch, rev, profile, kind}` (`broadcast_plugin_event`).
Every write answers `epoch` too.

| Endpoint | What |
|---|---|
| `GET /state[?since_rev=N&epoch=E]` | `{schema, epoch, rev, settings, layouts, read_only[, store_schema]}` of the profile (pruned and canonicalised first); `since_rev` + `epoch` naming the current state answer `{schema, epoch, rev, unchanged: true}` (the cheap poll). Only both together: a `since_rev` without `epoch`, or with another epoch, gets the full state. |
| `PATCH /state/positions` `{style, scope, mode: set\|if_absent, positions: [{id, x, y}]}` | Batch upsert → `{ok, rev, changed, applied, skipped, updated_at}`. `scope` must be `all` (else 409 `scope_layout_retired`). |
| `PATCH /settings` `{style?, snap?}` | The synced settings (global) → `{ok, rev, changed, settings}`. |
| `DELETE /state/layout?style=&scope=all` | Re-arrange in All projects: removes the style's layout (keeping a backup of it) → `{ok, rev, changed, removed, backup_id}`. |
| `PUT /state/layout` `{style, scope, positions, backup?}` | Undo: the layout becomes exactly `positions` → `{ok, rev, changed, count, backup_id}`. `backup: true` (a restore from Layout history) keeps the layout it replaces first. |
| `PUT /state/layout/project` `{style, scope, project, positions, remove?, backup?}` | Card 10: a Re-arrange in a project scope (`backup: true`) or its Undo. Per block: each of `positions` (`[{id, x, y}]`, ≤ 5000) is set (one already at its spot keeps its entry), each of `remove` (block ids, ≤ 5000) is forgotten; no other block changes. `backup: true` keeps the whole style layout in Layout history first, with `project`. → `{ok, rev, changed, applied, removed, backup_id}`. Nothing changed: no backup, no revision. 400 for a malformed project (`all` included), id or coordinate, or an id in both lists; 413 past the caps; 409 `layout_history_newer` like a Re-arrange. Pushed as `kind: "rearrange"` (or `"restore"` for the Undo). |
| `GET /state/backups?style=[&scope=]` | Layout history of one style (one list whatever the scope; an older page's `scope` is ignored), newest first → `{ok, backups: [{id, created_at, reason, project, count}], read_only}`. |
| `GET /state/backups/{id}` | One backup of the profile → `{ok, id, style, scope, project, created_at, reason, positions: [{id, x, y}]}` (404 for another profile's or an unknown id; 400 for a malformed id). |
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
- **Re-arrange** asks first (a plain dialog naming what resets — in All projects "Every block in
  <style> goes back to the automatic layout", in a project "The N blocks of <project> go back to
  their automatic spots; other projects stay where they are" (N: the project's blocks the op moves
  on the canvas, labels aside; "The 1 block … goes back to its automatic spot"; with none, "No
  block of <project> is on the canvas, so there is nothing to re-arrange." and Re-arrange is
  disabled; review t_5e9be878 N4) — not the SDK's ConfirmDialog, which
  confirms on Enter and Space whichever button holds focus: Space is the pan key). The confirm
  opens with focus on Cancel and Layout history with focus on Close, so Space, Enter or Escape
  right after a misclick change nothing; only activating Re-arrange or Restore itself does (a
  click, or Tab to the button and Enter or Space). In All projects it then queues a delete of the
  style's layout and shows a toast with Undo, which queues a `PUT` of exactly what the window
  showed before, less any block moved to another project since; in a project scope it queues the
  scoped op (One layout per style).
- **Layout history** (from the Re-arrange confirm's *Layout history…* and the Re-arrange toast; not
  in Swimlanes; the toolbar has no room for a button of its own at the narrowest widths) sends this
  window's queue first, then lists the backups of the style (one list for every scope; each row
  "Before Re-arrange · All projects", "Before Re-arrange · <project label from `projects.tree`>",
  "· a removed project" for one that no longer exists, or "Before a restore"), refetched on every
  store revision. Restore fetches one backup and queues a `PUT` with `backup: true` (shown at
  once, with an Undo toast like Re-arrange); it replaces the whole style layout, every project's
  blocks (in a project scope the dialog says so); blocks the backup lacks are placed anew by the
  auto-layout.
  A Re-arrange or restore the server refuses (dropped, e.g. 409 `layout_history_newer`) also
  removes its toast, every time, not only with the first notice of that kind.
- **Offline (transient failures):** a request with no answer (network, timeout), a 5xx, 408 or
  429 keeps the queue in `ctx.storage`, marks the profile offline ("offline: showing last saved
  layout" banner) and retries with a backoff (1, 2, 5, 5, 10 s). Nothing is notified. The page keeps
  working on the cached snapshot; a reload while offline still has the queued changes.
- **Refusals (card-4 review B1).** Any other 4xx is deterministic: retrying cannot help.
  - *Newer schema* (409 `newer_schema: …`, or a `GET /state` answering `read_only: true`): the
    store is **read-only** for the page's lifetime (the `LayoutSync`, one per plugin load), or until
    a later `GET /state` serves a supported schema. Nothing more is sent (no position, layout or
    settings write; the flush timer is not even armed). One persistent banner, "Layout saved by a
    newer Session Tree version — changes here are not saved" (`session-tree-read-only`), and at
    most one notification. The canvas stays usable: auto-layout, drags, Re-arrange and settings
    apply in this window only (never persisted). The read-only snapshot is never cached.
  - *Other refusals* (400, 404, 413, 422, a 409 that is not `newer_schema`): that op is dropped.
    An auto-layout placement that was refused is remembered (layout + key) for the page's
    lifetime, so `place()` never queues it again on the next render. One notification per refusal
    kind (the status) per page lifetime.
  - `host.notify` is never called per failed request: `LayoutSync` calls `onRefused(error, kind)`
    at most once per kind.
- **The pending queue: windows on one device (card-4 review NB1).** All windows of one browser
  profile share `localStorage`. `layoutPending.v2` is `{slots: {<window id>: {beat, ops}}}`:
  - a window (a random id per `LayoutSync`) rewrites only its own slot: it re-reads the key and
    replaces its slot, so it never overwrites another window's queued entries; an empty queue
    removes the slot;
  - `beat` (the window's clock at its last write) is refreshed on every queue change, every flush
    attempt (the retry backoff is ≤ 10 s) and every poll; a slot whose beat is older than 30 s
    (`ORPHAN_MS`: its window was closed) is **adopted** by the next window that constructs or
    polls: its ops go first in that window's queue and the slot is removed. `dispose()` (a plugin
    reload) and `release()` (on `pagehide`: a reload, a closed tab) write beat 0, so the next
    window adopts at once; a tab that vanished without `pagehide` is adopted after 30 s. If a slow window
    finds its slot adopted, it keeps only what it queued since. The card-4 queue
    (`layoutPending.v1`) is adopted once and cleared;
  - **drop order:** every drop carries its time (the device clock, strictly increasing within a
    window) and stamps `layoutDrops.v1[<layout>\0<key>]` with the latest drop time of that block on
    this device (entries kept 30 days, 5000 at most). Before anything is sent, a queued drop older
    than that record is discarded: an older drop of a block never overwrites a newer drop of the
    same block made in another window of the same device. Across devices, last write wins per
    block by server receive time, as before.
- **Other windows (push, then poll):** card 1's pre-check 5 measured that a plugin `ctx.socket`
  never dials in the Webapp, while `broadcast_plugin_event` from the backend reaches
  `host.onEvent` there. So the backend pushes `layout.changed`, the page refreshes on it (unless it
  already has that `epoch` and `rev`: a push of another epoch always refreshes), and it also polls
  `GET /state?since_rev=&epoch=` every 5 s while the page is visible (`document.visibilityState`),
  for a missed push. A full answer replaces the snapshot, so a new epoch resets the known `rev`. A
  refresh never moves a block that is being dragged (the canvas draws the drag position) and never
  flushes a pending drop early.
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
