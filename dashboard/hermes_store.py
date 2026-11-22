"""Session Tree backend: the one place that knows how to read a profile's session store.

``hermes_cli.web_routers.profiles._read_profile_db`` hands its callback a different object
depending on the Hermes version:

* **v0.23.2 and earlier**: a read-only ``hermes_state.SessionDB`` (``list_sessions_rich``,
  ``get_compression_chain``, ``get_messages``, ``_read_all`` …).
* **v0.23.3 and later**: a read-only storage-interface handle (``persistence_assembly.Persistence``)
  with repositories: ``sessions``, ``lineage``, ``messages``, ``usage``. ``SessionDB`` remains
  only as a deprecated stub without those methods, and is removed in v0.27.0.

Every read the plugin makes goes through a function here, which picks the path by what the handle
has (``is_storage_interface``), never by version number. Each function returns the old
``SessionDB`` shape (plain dicts and lists), so the callers stay the same on both.

Nothing here writes; the caller opens the store read-only.
"""

from __future__ import annotations

import json
from types import SimpleNamespace
from typing import Any, Optional


def is_storage_interface(db: Any) -> bool:
    """True for a v0.23.3+ storage-interface handle, False for a legacy ``SessionDB``."""
    return not callable(getattr(type(db), "list_sessions_rich", None)) and _has(db, "sessions")


def _has(db: Any, name: str) -> bool:
    try:
        getattr(db, name)
    except AttributeError:
        return False
    return True


# --- sessions ------------------------------------------------------------------------------------

def list_rows(db: Any, *, limit: int, include_archived: bool, include_subagents: bool,
              exclude_sources: Optional[list[str]]) -> list[dict[str, Any]]:
    """The core listing's rows, newest activity first, compact, pinned rows back-filled and
    compression tips projected onto their roots (what ``GET /api/profiles/sessions`` runs)."""
    kwargs: dict[str, Any] = dict(limit=limit, offset=0, order_by_last_active=True, compact_rows=True, include_pinned=True,
                  include_archived=include_archived, archived_only=False,
                  include_subagents=include_subagents, exclude_sources=exclude_sources)
    if is_storage_interface(db):
        from hermes_cli.web_server_sessions import _session_rows

        return _session_rows(db, **kwargs)
    return db.list_sessions_rich(**kwargs)


def get_session(db: Any, session_id: str) -> Optional[dict[str, Any]]:
    """The full session row as a dict (``system_prompt`` and the resolved ``tool_names`` pin
    included), or ``None`` for an id the store does not have."""
    if is_storage_interface(db):
        record = db.sessions.get(session_id)
        return None if record is None else record.as_session_row()
    return db.get_session(session_id)


# --- compression lineage -------------------------------------------------------------------------

def compression_chain(db: Any, session_id: str) -> list[str]:
    """The compression chain walked forward from ``session_id`` to its tip (``[session_id]`` when
    nothing continued it)."""
    if is_storage_interface(db):
        return [str(sid) for sid in db.lineage.chain(session_id)]
    return list(db.get_compression_chain(session_id) or [])


def compression_lineage(db: Any, session_id: str) -> list[str]:
    """The compression lineage holding ``session_id``, root first; ``[]`` for an unknown id."""
    if is_storage_interface(db):
        return [str(sid) for sid in db.lineage.lineage(session_id)]
    return list(db.get_compression_lineage(session_id) or [])


def compression_tip(db: Any, session_id: str) -> str:
    """The live end of ``session_id``'s compression chain; ``session_id`` itself when none."""
    if is_storage_interface(db):
        return str(db.lineage.tip(session_id) or session_id)
    return db.get_compression_tip(session_id) or session_id


# --- messages ------------------------------------------------------------------------------------

def latest_messages(db: Any, session_id: str, limit: int) -> list[dict[str, Any]]:
    """The newest ``limit`` live messages, in chronological order, as stored row dicts (``role``,
    ``content``, ``_compressed_summary`` on a summary row)."""
    if is_storage_interface(db):
        from persistence.conversation.messages import TranscriptRead

        rows = db.messages.read_transcript(session_id, TranscriptRead(latest=True, limit=limit))
        return [row.as_wire_row() for row in rows]
    return db.get_messages(session_id, latest=True, limit=limit)


def read_all(db: Any, sql: str, params: Any = ()) -> list[Any]:
    """One read-only ``SELECT`` through Hermes's own pooled reader (WAL-aware, IOERR-retrying),
    for an aggregate no public verb offers. Private on both versions: v0.23.3+ reaches the
    handle's bound store holder."""
    if is_storage_interface(db):
        return db._bound_store().holder()._read_all(sql, params)
    return db._read_all(sql, params)


def conversation_revision(db: Any, session_id: str) -> Any:
    """A hashable stamp that changes when the session's transcript does (an estimate cache key)."""
    if is_storage_interface(db):
        return db.messages.conversation_revision(session_id).as_tuple()
    return db.conversation_revision(session_id)


# --- prompt cache --------------------------------------------------------------------------------

def generation_reader(db: Any) -> Any:
    """What ``agent.prompt_cache_clock.current_generation`` reads the session's context
    generation from: the usage repository on v0.23.3+, the ``SessionDB`` itself before. Passing
    the handle on v0.23.3+ would make ``current_generation`` answer ``None`` (no reader), and a
    compacted session would then look valid."""
    return db.usage if is_storage_interface(db) else db


def route_source(db: Any, row: dict[str, Any]) -> Any:
    """``row`` shaped for ``gateway.session_tui_reads._saved_route``: v0.23.3+ reads a record's
    ``model_config`` mapping and ``model``; earlier versions read the row dict itself."""
    if not is_storage_interface(db):
        return row
    config = row.get("model_config")
    if isinstance(config, str):
        try:
            config = json.loads(config)
        except ValueError:
            config = None
    return SimpleNamespace(model_config=config if isinstance(config, dict) else {}, model=row.get("model"))
