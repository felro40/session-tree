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
#   core's.
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


def _require_session(name: str, home: Any, session_id: str) -> None:
    """404 unless *session_id* is a stored row of profile *name* (read-only open)."""
    from hermes_cli.web_routers.profiles import _read_profile_db

    errors: list[dict[str, str]] = []
    row = _read_profile_db(name, home, errors, lambda db: db.get_session(session_id))
    if errors:
        raise HTTPException(status_code=503, detail=errors[0]["error"])
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")


class _Fence(BaseModel):
    """The core mutation identity (``hermes_cli.web_models.SessionRename``'s fence fields).

    Optional on purpose: a request without them reaches the core guard, which refuses it
    (409 ``mutation_identity_required``), exactly as ``PATCH /api/sessions/{id}`` does."""

    model_config = ConfigDict(extra="forbid")

    request_id: Optional[str] = Field(None, min_length=1, max_length=MAX_REQUEST_ID)
    expected_revision: Optional[StrictInt] = Field(None, ge=0)
    expected_generation: Optional[StrictInt] = Field(None, ge=0)


class RenameBody(_Fence):
    #: Empty clears the title (the core PATCH semantics); Hermes trims and caps it at 100.
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
    ``session.delete`` RPC is not served to a Webapp window (unknown method)."""
    from fastapi.concurrency import run_in_threadpool
    from hermes_cli.web_routers.sessions import delete_session_endpoint

    name, home = _one_profile(profile)
    sid = _checked_session_id(session_id)
    await run_in_threadpool(_require_session, name, home, sid)
    return await delete_session_endpoint(sid, request, profile=name, request_id=body.request_id,
                                         expected_revision=body.expected_revision,
                                         expected_generation=body.expected_generation)


@router.get("/sessions/{session_id}/export")
async def export(session_id: str, profile: str = _profile_query()):
    """The session (metadata + every message) as JSON, streamed by the core export handler."""
    from fastapi.concurrency import run_in_threadpool
    from hermes_cli.web_routers.sessions import export_session_endpoint

    name, home = _one_profile(profile)
    sid = _checked_session_id(session_id)
    await run_in_threadpool(_require_session, name, home, sid)
    return await export_session_endpoint(sid, profile=name)
