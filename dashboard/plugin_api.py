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

Each endpoint is shaped so a future SDK verb could replace it: ``/sessions`` returns
``SessionInfo`` rows like the core list does, plus the lineage facts the graph needs.
"""

from __future__ import annotations

import logging
import re
import time
from typing import Any

from fastapi import APIRouter, HTTPException, Query

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
    merged.sort(key=lambda row: row.get("last_active") or row.get("started_at") or 0, reverse=True)
    truncated = full_page or len(merged) > capped
    window = [_shape(row) for row in merged[:capped]]
    return {
        "sessions": window,
        "profiles": [name for name, _home in targets],
        "limit": capped,
        "truncated": truncated,
        "errors": errors,
    }
