"""Session Tree backend: mounted at ``/api/plugins/session-tree/`` by the dashboard plugin host.

The desktop half reaches it with ``ctx.rest``. It exists for what the desktop SDK cannot do
(``host.listPersistedSessions`` caps at 500 rows and hard-codes ``archived: 'exclude'``), and it
is the page's session data source.

Rules (Shared requirement 5):

* Every endpoint takes the profile it reads as ``session_profile`` and refuses an unknown one
  (``*`` means every profile). Not ``profile``: on plugin routes that query key is the gateway's own
  profile selector (``hermes_cli/web_server_plugin_profiles.py`` ``plugin_request_scope``; the Webapp
  transport sets ``?profile=<active profile>`` on every ``ctx.rest`` call, and a request forwarded to
  a secondary profile's plugin host arrives with it stripped), so it cannot carry the data selection.
* Reads go through Hermes's own listing, the same one ``GET /api/profiles/sessions`` runs:
  ``_profile_targets`` → ``_read_profile_db`` (a read-only ``SessionDB`` open) →
  ``SessionDB.list_sessions_rich`` → ``_tag_rows`` → ``_strip_session_list_rows``.
  Nothing here opens ``state.db`` with raw SQL.
* Inputs are untrusted: profile names are pattern- and length-checked, ``limit`` is capped.
* Writes (card 3: rename, read state, archive, delete) never touch ``state.db`` themselves: each
  calls the core endpoint's own mutation path with its guards (see "session actions" below).

Each endpoint is shaped so a future SDK verb could replace it: ``/sessions`` returns
``SessionInfo`` rows like the core list does, plus the lineage facts the graph needs.
"""

from __future__ import annotations

import logging
import re
import time
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt, StrictStr

logger = logging.getLogger(__name__)

router = APIRouter()

PLUGIN_ID = "session-tree"
VERSION = "0.1.0"

#: ``GET /sessions`` row cap (per request, across every profile it reads).
MAX_LIMIT = 2000
DEFAULT_LIMIT = 500
ALL_PROFILES = "*"
#: Hermes profile names: ``hermes_cli.profiles`` allows ``[a-z0-9][a-z0-9_-]{0,63}``.
_PROFILE_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")


def _profile_targets() -> list[tuple[str, Any]]:
    """(name, home) for every profile this Hermes serves, as the core session list sees them."""
    from hermes_cli.web_routers.profiles import _profile_targets as core_profile_targets

    return core_profile_targets("GET /api/plugins/session-tree/sessions")


def _resolve_profiles(profile: str) -> list[tuple[str, Any]]:
    """The targets *profile* names: one profile, or every profile for ``*``. 400 for a malformed
    name, 404 for a well-formed name this Hermes does not have."""
    name = (profile or "").strip()
    if name != ALL_PROFILES and not _PROFILE_RE.fullmatch(name):
        raise HTTPException(status_code=400, detail="session_profile must be a profile name or '*'")
    targets = _profile_targets()
    if name == ALL_PROFILES:
        return targets
    chosen = [(target_name, home) for target_name, home in targets if target_name == name]
    if not chosen:
        raise HTTPException(status_code=404, detail=f"Unknown profile: {name}")
    return chosen


def _is_internal_child(row: dict[str, Any]) -> bool:
    """A delegate_task child, by the same marker the API server's exact-id projection reads
    (``model_config._delegate_from``)."""
    import json

    raw = row.get("model_config")
    try:
        config = json.loads(raw) if isinstance(raw, str) and raw else raw
    except (TypeError, ValueError):
        config = None
    return isinstance(config, dict) and config.get("_delegate_from") is not None


def _list_profile(name: str, home: Any, *, include_archived: bool, limit: int,
                  errors: list[dict[str, str]], now: float) -> list[dict[str, Any]]:
    """One profile's rows through the core listing (read-only open, compression tips projected)."""
    from hermes_cli.session_listing import subagent_listing_scope
    from hermes_cli.web_routers.profiles import _read_profile_db, _tag_rows

    def read(db):
        include_subagents, exclude = subagent_listing_scope(home)
        rows = db.list_sessions_rich(
            limit=limit, offset=0, order_by_last_active=True, compact_rows=True,
            include_pinned=True, include_archived=include_archived, archived_only=False,
            include_subagents=include_subagents, exclude_sources=exclude,
        )
        for row in rows:
            # Pre-check 8: "compacted ×N" counts the compression segments folded into this block,
            # N = len(compression chain) - 1. Not len(_lineage_ids) - 1: for a canonical local reset
            # lineage the core list also folds the reset segments into _lineage_ids.
            root = row.get("_lineage_root_id")
            chain = db.get_compression_chain(root) if row.get("continuation_kind") == "compression" and root else None
            row["compacted_segments"] = max(0, len(chain) - 1) if chain else 0
        return _tag_rows(rows, name, now)

    return _read_profile_db(name, home, errors, read) or []


def _shape(row: dict[str, Any]) -> dict[str, Any]:
    """Derived facts the graph needs, then the core list's heavy-field strip."""
    from hermes_cli.web_server_gateway import _strip_session_list_rows

    row["is_internal_child"] = _is_internal_child(row)
    # A stable shape: the core list only sets these keys when they hold a value.
    for key in ("_branched_from", "_reset_from", "_lineage_root_id", "_lineage_ids", "parent_session_id"):
        row.setdefault(key, None)
    row.setdefault("compacted_segments", 0)
    row.pop("_effective_last_active", None)
    _strip_session_list_rows([row])
    return row


#: The data selector's query key (see the module docstring for why it is not ``profile``).
PROFILE_PARAM = "session_profile"


def _profile_query():
    return Query(..., alias=PROFILE_PARAM, max_length=64)


@router.get("/health")
def health(profile: str = _profile_query()) -> dict[str, Any]:
    """Liveness for the desktop half: 200 means the backend is mounted and *profile* is known."""
    names = [name for name, _home in _resolve_profiles(profile)]
    return {"ok": True, "plugin": PLUGIN_ID, "version": VERSION, "profiles": names}


@router.get("/sessions")
def sessions(
    profile: str = _profile_query(),
    include_archived: bool = False,
    limit: int = Query(DEFAULT_LIMIT, ge=1),
) -> dict[str, Any]:
    """Session rows for *profile* (``*``: every profile), most recently active first.

    Rows are the core list's (compression roots projected to their live tip, sub-agent runs and
    hidden rows left out exactly as the sidebar's own query does); the graph model decides which
    of them become blocks. ``limit`` above ``MAX_LIMIT`` is capped to it.
    """
    targets = _resolve_profiles(profile)
    capped = min(limit, MAX_LIMIT)
    errors: list[dict[str, str]] = []
    now = time.time()
    merged: list[dict[str, Any]] = []
    full_page = False
    for name, home in targets:
        rows = _list_profile(name, home, include_archived=include_archived, limit=capped,
                             errors=errors, now=now)
        # A profile that filled its page may hold more rows than were read.
        full_page = full_page or len(rows) >= capped
        merged.extend(rows)
    from hermes_cli.web_routers.profiles import _pinned_window

    merged.sort(key=lambda row: row.get("last_active") or row.get("started_at") or 0, reverse=True)
    truncated = full_page or len(merged) > capped
    # The core window: the first ``capped`` rows by recency plus every pinned row past them (the
    # per-profile queries back-fill pinned rows past their LIMIT; a plain cut would drop them).
    window = [_shape(row) for row in _pinned_window(merged, 0, capped)]
    return {
        "sessions": window,
        "profiles": [name for name, _home in targets],
        "limit": capped,
        "truncated": truncated,
        "errors": errors,
    }


# --- session actions (card 3, R14/R15) ------------------------------------------------------
#
# What the desktop SDK has no verb for: rename (for a session with no live runtime here), the
# read-state watermark, archive, delete and the export download. Each endpoint is the core
# endpoint's own code path, reached in-process, with the core guards:
#
# * rename / read / archive: ``hermes_cli.web_server_sessions._mutate_session_request`` (what
#   ``PATCH /api/sessions/{id}`` runs): the caller's identity, the live gateway owner when one
#   serves the home (else the offline store under its exclusive-maintenance lock), and the
#   mutation-snapshot fence: ``request_id`` + ``expected_revision`` (+ ``expected_generation``)
#   from ``GET .../mutation-snapshot``; a stale revision is refused (409), a running turn answers
#   ``session_busy`` (409). Nothing here writes ``state.db`` itself.
# * delete: the core ``DELETE /api/sessions/{id}`` handler itself (the same fenced mutation).
# * export: ``GET /api/sessions/{id}/export``'s own streaming handler, so the bytes are the
#   core's; they reach the page base64-encoded in a small envelope, never re-serialised.
#
# Shaped so a future SDK verb can replace each one: the payloads are the core ones.

#: Stored session ids (``SessionDB`` ids: timestamps, hex, fixture slugs). Untrusted input.
_SESSION_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$")
#: ``SessionDB.MAX_TITLE_LENGTH`` is 100; anything far past it is refused before Hermes sees it.
MAX_TITLE_INPUT = 400
MAX_REQUEST_ID = 128


def _one_profile(profile: str) -> tuple[str, Any]:
    """A single named profile for a mutation (``*`` is a read-only selector)."""
    if (profile or "").strip() == ALL_PROFILES:
        raise HTTPException(status_code=400, detail="session_profile must name one profile for a session action")
    return _resolve_profiles(profile)[0]


def _checked_session_id(session_id: str) -> str:
    if not _SESSION_ID_RE.fullmatch(session_id or ""):
        raise HTTPException(status_code=400, detail="malformed session id")
    return session_id


def _require_session(name: str, home: Any, session_id: str) -> dict[str, Any]:
    """The stored row of *session_id* in profile *name* (read-only open); 404 when there is none."""
    from hermes_cli.web_routers.profiles import _read_profile_db

    errors: list[dict[str, str]] = []
    row = _read_profile_db(name, home, errors, lambda db: db.get_session(session_id))
    if errors:
        raise HTTPException(status_code=503, detail=errors[0]["error"])
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")
    return row


class _Fence(BaseModel):
    """The core mutation identity (``hermes_cli.web_models.SessionRename``'s fence fields).

    Optional on purpose: a request without them reaches the core guard, which refuses it
    (409 ``mutation_identity_required``), exactly as ``PATCH /api/sessions/{id}`` does."""

    model_config = ConfigDict(extra="forbid")

    request_id: Optional[str] = Field(None, min_length=1, max_length=MAX_REQUEST_ID)
    expected_revision: Optional[StrictInt] = Field(None, ge=0)
    expected_generation: Optional[StrictInt] = Field(None, ge=0)


class RenameBody(_Fence):
    #: Empty clears the title (the core PATCH semantics). Hermes refuses a title over its
    #: ``MAX_TITLE_LENGTH`` (100) with 400 "Title too long (N chars, max 100)"; one over
    #: ``MAX_TITLE_INPUT`` is refused here first (422). Nothing is truncated.
    title: StrictStr = Field(..., max_length=MAX_TITLE_INPUT)


class ReadBody(_Fence):
    #: True: mark as unread (arms the read-state watermark); False: mark as read now.
    unread: StrictBool


class ArchiveBody(_Fence):
    #: True archives (and unpins, as the app's ``setSessionArchived`` does); False restores.
    archived: StrictBool


class DeleteBody(_Fence):
    """Only the fence: the session id is the path's."""


async def _mutate(request: Request, profile: str, session_id: str, body: _Fence, payload: dict[str, Any]) -> dict[str, Any]:
    from fastapi.concurrency import run_in_threadpool
    from hermes_cli.web_server_sessions import _mutate_session_request

    name, home = _one_profile(profile)
    sid = _checked_session_id(session_id)
    await run_in_threadpool(_require_session, name, home, sid)
    return await _mutate_session_request(
        request, name, sid, request_id=body.request_id, expected_revision=body.expected_revision,
        expected_generation=body.expected_generation, operation="sidebar", payload=payload)


@router.get("/sessions/{session_id}/mutation-snapshot")
async def mutation_snapshot(session_id: str, request: Request, profile: str = _profile_query()) -> dict[str, Any]:
    """The fence for one edit: the core ``GET /api/sessions/{id}/mutation-snapshot``."""
    from fastapi.concurrency import run_in_threadpool
    from hermes_cli.web_routers.sessions import get_session_mutation_snapshot

    name, home = _one_profile(profile)
    sid = _checked_session_id(session_id)
    await run_in_threadpool(_require_session, name, home, sid)
    return await get_session_mutation_snapshot(sid, request, name)


@router.post("/sessions/{session_id}/rename")
async def rename(session_id: str, body: RenameBody, request: Request, profile: str = _profile_query()) -> dict[str, Any]:
    """Rename a stored session (the page uses the ``session.title`` RPC instead when the session
    has a live runtime it knows, as the app does)."""
    return await _mutate(request, profile, session_id, body, {"title": body.title})


@router.post("/sessions/{session_id}/read")
async def read_state(session_id: str, body: ReadBody, request: Request, profile: str = _profile_query()) -> dict[str, Any]:
    """Mark as read / unread: the core read-state watermark (``SessionDB.set_session_read``)."""
    return await _mutate(request, profile, session_id, body, {"unread": body.unread})


@router.post("/sessions/{session_id}/archive")
async def archive(session_id: str, body: ArchiveBody, request: Request, profile: str = _profile_query()) -> dict[str, Any]:
    """Archive / Unarchive, as the app does it (``api/sessions.ts`` ``setSessionArchived``: the
    fenced ``PATCH {archived}``, plus ``pinned: false`` when archiving). Not the ``session.archive``
    RPC: from a Webapp window the desktop client only sends it for a session whose revision it
    holds (an open one), so a stored row the window never opened is refused client-side."""
    payload: dict[str, Any] = {"archived": body.archived, **({"pinned": False} if body.archived else {})}
    return await _mutate(request, profile, session_id, body, payload)


@router.post("/sessions/{session_id}/delete")
async def delete(session_id: str, body: DeleteBody, request: Request, profile: str = _profile_query()) -> dict[str, Any]:
    """Delete, as the app does it: the core ``DELETE /api/sessions/{id}`` handler itself (the
    fenced ``delete`` mutation, the owner's running-session refusal, the on-disk scrub). The
    ``session.delete`` RPC is not served to a Webapp window (unknown method).

    No existence pre-check: the core decides, and its delete is idempotent (an id that is
    already gone answers ``{"ok": true, "already_absent": true}``)."""
    from hermes_cli.web_routers.sessions import delete_session_endpoint

    name, _home = _one_profile(profile)
    sid = _checked_session_id(session_id)
    return await delete_session_endpoint(sid, request, profile=name, request_id=body.request_id,
                                         expected_revision=body.expected_revision,
                                         expected_generation=body.expected_generation)


async def _drain(response: Any) -> bytes:
    """The exact bytes a Starlette response sends (each streamed chunk, encoded as it does)."""
    if not hasattr(response, "body_iterator"):
        return bytes(response.body)
    out = bytearray()
    async for chunk in response.body_iterator:
        out += chunk if isinstance(chunk, (bytes, bytearray, memoryview)) else chunk.encode(response.charset)
    return bytes(out)


@router.get("/sessions/{session_id}/export")
async def export(session_id: str, profile: str = _profile_query()) -> dict[str, Any]:
    """The session (metadata + every message) exactly as the core export handler streams it.

    The body is the core's bytes, base64-encoded in an envelope: ``ctx.rest`` parses every
    answer as JSON, and a parse + re-serialise is not verbatim (``2.0`` → ``2``; ``Infinity`` does
    not parse). The page decodes ``body`` and writes those bytes to the file unchanged."""
    import base64
    import hashlib

    from fastapi.concurrency import run_in_threadpool
    from hermes_cli.web_routers.sessions import export_session_endpoint

    name, home = _one_profile(profile)
    sid = _checked_session_id(session_id)
    row = await run_in_threadpool(_require_session, name, home, sid)
    response = await export_session_endpoint(sid, profile=name)
    data = await _drain(response)
    return {
        "ok": True,
        "session_id": sid,
        "title": row.get("title"),
        "encoding": "base64",
        "content_type": response.media_type or "application/json",
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
        "body": base64.b64encode(data).decode("ascii"),
    }


# --- the synced layout store (card 4, R16/R17) -----------------------------------------------
#
# Style, snap and block positions shared by every window and device served by this gateway, in
# ``<HERMES_HOME root>/session-tree/state.json`` (``dashboard/layout_store.py``: atomic writes,
# one writer at a time across threads and processes, last write wins per block, caps, corrupt
# file kept as ``.bak``). This is the plugin's own file, never ``state.db``. Every change is
# pushed to the open windows as ``plugin.session-tree.layout.changed`` (``broadcast_plugin_event``
# → ``host.onEvent``, card 1 pre-check 5); the page also polls ``?since_rev=`` as the fallback.
#
# Shaped so a future SDK verb (a synced per-plugin store) could replace it: plain JSON in, out.


def _load_sibling(name: str):
    """A module next to this file. The plugin host loads this file by path, without a package,
    so a relative import has nothing to resolve against."""
    import importlib.util
    import sys
    from pathlib import Path

    module_name = f"hermes_dashboard_plugin_session_tree_{name}"
    if module_name in sys.modules:
        return sys.modules[module_name]
    spec = importlib.util.spec_from_file_location(module_name, Path(__file__).with_name(f"{name}.py"))
    if spec is None or spec.loader is None:
        raise ImportError(f"cannot load {name}.py next to {__file__}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


layout_store = _load_sibling("layout_store")
_STORES: dict[str, Any] = {}


def _state_store():
    """The store of this Hermes: ``<root>/session-tree/state.json``, outside the package (which
    installs and updates replace). The root, not a profile's home: positions are keyed by profile
    inside, and the gateway may serve a request in a secondary profile's scope."""
    from hermes_constants import get_default_hermes_root

    path = get_default_hermes_root() / PLUGIN_ID / "state.json"
    key = str(path)
    if key not in _STORES:
        _STORES[key] = layout_store.LayoutStore(path)
    return _STORES[key]


def _emit_plugin_event(event: str, payload: dict[str, Any]) -> None:
    from hermes_cli.plugin_events import broadcast_plugin_event

    broadcast_plugin_event(PLUGIN_ID, event, payload)


def _changed(rev: int, profile: str, kind: str, epoch: Optional[str] = None) -> None:
    """Push one change to every open window. Fire-and-forget: a window that misses it polls.
    ``epoch`` + ``rev`` name the new state (a ``rev`` alone restarts with a fresh file)."""
    try:
        _emit_plugin_event("layout.changed", {"epoch": epoch, "rev": rev, "profile": profile, "kind": kind})
    except Exception:  # noqa: BLE001 - the write already happened; the poll catches up
        logger.debug("session-tree: layout.changed push failed", exc_info=True)


def _view_profile(profile: str) -> str:
    """A layout's profile key: a known profile name, or ``*`` (the All profiles view)."""
    name = (profile or "").strip()
    _resolve_profiles(name)
    return name


def _store_call(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except layout_store.StoreError as exc:
        raise HTTPException(status_code=exc.status, detail=exc.detail) from exc


def _existing_ids(profile: str):
    """For ``LayoutStore.prune``: which stored ids still exist (archived included), per profile,
    each with its compression lineage's root id (``SessionDB.get_compression_lineage``, root
    first: the id the core list reports as ``_lineage_root_id``, so the page keys the block by it).
    ``None`` (do not prune) when any profile's store cannot be read."""
    from hermes_cli.web_routers.profiles import _read_profile_db

    view = dict(_resolve_profiles(profile))
    every = dict(_profile_targets())

    def existing(candidates: dict[Optional[str], set[str]]):
        alive: dict[Optional[str], dict[str, str]] = {}
        for key, ids in candidates.items():
            # A bare id belongs to the view's profile(s); ``<profile>/<id>`` to that profile (one
            # this Hermes no longer has holds no session).
            homes = view if key is None else {key: every[key]} if key in every else {}
            found: dict[str, str] = {}
            for name, home in homes.items():
                errors: list[dict[str, str]] = []

                def read(db, wanted=ids):
                    roots: dict[str, str] = {}
                    for sid in wanted:
                        # [] for an id with no row; [sid] for one never compacted (or a fork).
                        lineage = db.get_compression_lineage(sid)
                        if lineage:
                            roots[sid] = lineage[0]
                    return roots

                result = _read_profile_db(name, home, errors, read)
                if errors:
                    return None
                # No state.db yet: that profile has no sessions at all.
                for sid, root in (result or {}).items():
                    found.setdefault(sid, root)
            alive[key] = found
        return alive

    return existing


class PositionsBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    style: StrictStr = Field(..., max_length=32)
    scope: StrictStr = Field(..., min_length=1, max_length=1024)
    #: ``set``: a drop (replaces the stored entry); ``if_absent``: what an auto-layout placed
    #: (never replaces a stored entry, so a late first save cannot undo another window's drop).
    mode: StrictStr = Field("set", pattern="^(set|if_absent)$")
    #: ``[{id, x, y}]``, checked by the store (ids, finite coordinates, the batch cap: 413).
    positions: list[Any]


class LayoutBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    style: StrictStr = Field(..., max_length=32)
    scope: StrictStr = Field(..., min_length=1, max_length=1024)
    positions: list[Any]


class SettingsBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    style: Optional[StrictStr] = Field(None, max_length=32)
    snap: Optional[StrictBool] = None


@router.get("/state")
def get_state(profile: str = _profile_query(), since_rev: Optional[int] = Query(None, ge=0),
              epoch: Optional[str] = Query(None, max_length=64)) -> dict[str, Any]:
    """The synced settings and *profile*'s layouts (``*``: the All profiles view's own layouts).

    ``since_rev`` + ``epoch`` naming the current state answer ``{unchanged: true}`` without the
    layouts (the cheap poll); only both together: a fresh file restarts ``rev`` at 0 under a new
    epoch. Serving the layouts first drops the positions of sessions that no longer exist
    (archived ones keep theirs) and moves an entry keyed by a compression lineage member to the
    lineage root's key. ``read_only: true``: the file has a newer schema (writes answer 409)."""
    name = _view_profile(profile)
    store = _state_store()
    if since_rev is not None and epoch is not None and (epoch, since_rev) == store.version():
        return {"schema": layout_store.SCHEMA_VERSION, "epoch": epoch, "rev": since_rev, "unchanged": True}
    pruned = _store_call(store.prune, name, _existing_ids(name))
    snapshot = store.snapshot(name)
    if pruned:
        _changed(snapshot["rev"], name, "prune", snapshot["epoch"])
    return snapshot


@router.patch("/state/positions")
def patch_positions(body: PositionsBody, profile: str = _profile_query()) -> dict[str, Any]:
    """A batch of block positions for one style + scope; last write wins per block."""
    name = _view_profile(profile)
    result = _store_call(_state_store().upsert_positions, name, body.style, body.scope, body.positions,
                         if_absent=body.mode == "if_absent")
    if result["changed"]:
        _changed(result["rev"], name, "positions", result["epoch"])
    return result


@router.patch("/settings")
def patch_settings(body: SettingsBody, profile: str = _profile_query()) -> dict[str, Any]:
    """The synced view settings (global, not per profile): ``style`` and/or ``snap``."""
    _view_profile(profile)
    patch = body.model_dump(exclude_none=True)
    result = _store_call(_state_store().set_settings, patch)
    if result["changed"]:
        _changed(result["rev"], ALL_PROFILES, "settings", result["epoch"])
    return result


@router.delete("/state/layout")
def delete_layout(profile: str = _profile_query(), style: str = Query(..., max_length=32),
                  scope: str = Query(..., min_length=1, max_length=1024)) -> dict[str, Any]:
    """Re-arrange: forget one style + scope layout. Answers the removed entries (Undo's input)."""
    name = _view_profile(profile)
    result = _store_call(_state_store().delete_layout, name, style, scope)
    if result["changed"]:
        _changed(result["rev"], name, "rearrange", result["epoch"])
    return result


@router.put("/state/layout")
def put_layout(body: LayoutBody, profile: str = _profile_query()) -> dict[str, Any]:
    """Undo of a Re-arrange: one style + scope layout becomes exactly ``positions``."""
    name = _view_profile(profile)
    result = _store_call(_state_store().replace_layout, name, body.style, body.scope, body.positions)
    if result["changed"]:
        _changed(result["rev"], name, "restore", result["epoch"])
    return result


class ForgetBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ids: list[Any]


@router.post("/state/forget")
def forget_blocks(body: ForgetBody, profile: str = _profile_query()) -> dict[str, Any]:
    """A session moved to another project: forget its spot in every layout of *profile*, so each
    layout places it anew in its new project's band."""
    name = _view_profile(profile)
    result = _store_call(_state_store().forget_blocks, name, body.ids)
    if result["changed"]:
        _changed(result["rev"], name, "forget", result["epoch"])
    return result
