"""Session Tree backend, card 12: how big each session's context is, beside its lifetime tokens.

Two reads, both read-only, both through Hermes's own functions (never a validity check, an
estimate or a cache window of our own):

* ``row_fields(db, row, now)`` — for every ``GET /sessions`` row, in the listing's read callback
  (the database is already open there): the session's **measured** context, the last call's
  ``read_tokens + write_tokens`` from the stored prompt-cache clock (``sessions.prompt_cache_clock``,
  parsed with ``agent.prompt_cache_clock.event_from_json``), why that measurement no longer holds
  (``_invalid_reason`` with the session's id and current generation, then the saved-route check
  ``stored_cache_window`` applies), and the cold-session cache window
  (``stored_cache_window`` + ``cache_certainly_warm`` / ``cache_certainly_cold``). The only database
  read is ``current_generation`` (one indexed ``COUNT``), and only for a row that has a clock.
* ``estimates(db, ids, home)`` — for ``POST /sessions/context``: per id, the **estimate**
  ``agent.context_breakdown.stored_context_breakdown`` over the session's stored system prompt, its
  ``tools[]`` pin (``tools.mcp_tool_agent.pinned_tool_defs``) and its model history, computed
  exactly as the core's cold-session ``session.context_breakdown`` does
  (``gateway/session_tui_reads.py`` ``_stored_breakdown``), cached per (store, compression tip,
  conversation revision, system prompt, tool pin) with a size cap.

The page decides what it shows (``contextFigure`` in ``src/model/context.ts``): the measurement
only when it is still valid and its confidence is known, else the estimate (``~``), else ``—``.

The context window (the model's context length) is ``None`` everywhere: card 12 pre-check P2
found no path through ``agent.model_metadata.get_model_context_length`` that is proven to make no
network call and write nothing (docs/measured-facts.md, card 12 P2).

Private Hermes helpers are reached in one place each (``_hermes_private``), and
``tests/py/test_context_api.py`` fails loudly when an import or a signature changes:

* ``agent.prompt_cache_clock._invalid_reason`` and ``._saved_route_changed`` (the validity rule
  ``stored_cache_window`` itself applies);
* ``gateway.session_tui_reads._saved_route`` (the persisted ``(provider, base_url, model)``) and
  ``._model_history`` (the tip's working context as live replay loads it).

The caller opens the database read-only (``_read_profile_db``); nothing here writes.
"""

from __future__ import annotations

import hashlib
import json
import threading
import time
from collections import OrderedDict
from typing import Any, Iterable, Optional

#: Ids per ``POST /sessions/context`` request (the page batches in requests of at most this many).
MAX_IDS = 100
#: Estimates kept in the server cache (least recently used dropped first).
CACHE_MAX = 1000

#: ``cache_window.state`` values.
WARM, MAY_BE_WARM, EXPIRED, UNKNOWN = "warm", "may_be_warm", "expired", "unknown"


def _hermes_private() -> dict[str, Any]:
    """The private Hermes helpers this module wraps, imported in one place."""
    from agent.prompt_cache_clock import _invalid_reason, _saved_route_changed
    from gateway.session_tui_reads import _model_history, _saved_route

    return {
        "_invalid_reason": _invalid_reason,
        "_saved_route_changed": _saved_route_changed,
        "_saved_route": _saved_route,
        "_model_history": _model_history,
    }


def saved_route(row: dict[str, Any]) -> tuple[Any, Any, Any]:
    """``(provider, base_url, model)`` as the row persists them (``_saved_route``)."""
    return _hermes_private()["_saved_route"](row)


def model_history(db: Any, tip: str) -> list[dict[str, Any]]:
    """The tip's working context (``_model_history``)."""
    return _hermes_private()["_model_history"](db, tip)


def invalid_reason(event: Any, *, session_id: str, generation: Optional[int],
                   route: tuple[Any, Any, Any]) -> Optional[str]:
    """Why the stored clock no longer describes what a resume loads, or ``None``: exactly the rule
    ``stored_cache_window`` applies for a session with no live agent (``_invalid_reason`` with the
    row's id and current generation, then the persisted route against the event's route)."""
    private = _hermes_private()
    reason = private["_invalid_reason"](event, session_id=session_id, generation=generation, route=None)
    if reason is None and private["_saved_route_changed"](event, route):
        reason = "route_changed"
    return reason


def _number(value: Any) -> Optional[float]:
    return float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def cache_state(window: Optional[dict[str, Any]], now: float) -> Optional[dict[str, Any]]:
    """``stored_cache_window``'s answer as the page reads it: ``state`` from
    ``cache_certainly_warm`` / ``cache_certainly_cold`` at *now*, the two bounds and the reason."""
    from agent.prompt_cache_clock import UNKNOWN as UNKNOWN_CONFIDENCE
    from agent.prompt_cache_clock import cache_certainly_cold, cache_certainly_warm

    if window is None:
        return None
    if window.get("confidence") == UNKNOWN_CONFIDENCE:
        state = UNKNOWN
    elif cache_certainly_warm(window, now=now):
        state = WARM
    elif cache_certainly_cold(window, now=now):
        state = EXPIRED
    else:
        state = MAY_BE_WARM
    return {
        "state": state,
        "guaranteed_until": _number(window.get("guaranteed_until")),
        "estimated_until": _number(window.get("estimated_until")),
        "reason": window.get("reason") if isinstance(window.get("reason"), str) else None,
    }


def row_fields(db: Any, row: dict[str, Any], now: float) -> dict[str, Any]:
    """``context_measured``, ``context_invalid_reason`` and ``cache_window`` of one listing row.

    ``context_measured`` is the stored clock's figure whenever a clock parses (``{tokens, sent_at,
    confidence}``), also when it no longer holds: the page uses it only with no invalid reason and
    a known confidence. ``None`` without a clock (a session that never touched a prompt cache)."""
    from agent.prompt_cache_clock import current_generation, event_from_json, stored_cache_window

    raw = row.get("prompt_cache_clock")
    event = event_from_json(raw) if isinstance(raw, str) and raw else None
    if event is None:
        return {"context_measured": None, "context_invalid_reason": None, "cache_window": None}
    session_id = str(row.get("id") or "")
    generation = current_generation(db, session_id)
    route = saved_route(row)
    window = stored_cache_window(raw, session_id=session_id, generation=generation, saved_route=route)
    return {
        "context_measured": {
            "tokens": max(0, int(event.read_tokens or 0)) + max(0, int(event.write_tokens or 0)),
            "sent_at": _number(event.sent_at),
            "confidence": event.confidence,
        },
        "context_invalid_reason": invalid_reason(event, session_id=session_id, generation=generation, route=route),
        "cache_window": cache_state(window, now),
    }


# --- the estimate ---------------------------------------------------------------------------------

class EstimateCache:
    """Estimates per (store, tip, conversation revision, system prompt, tool pin), at most
    ``limit`` of them (least recently used dropped first). Thread-safe: the endpoint runs in the
    threadpool."""

    def __init__(self, limit: int = CACHE_MAX):
        self.limit = limit
        self._entries: OrderedDict[tuple, Optional[dict[str, Any]]] = OrderedDict()
        self._lock = threading.Lock()
        self.hits = 0
        self.misses = 0

    def get(self, key: tuple) -> tuple[bool, Optional[dict[str, Any]]]:
        with self._lock:
            if key in self._entries:
                self._entries.move_to_end(key)
                self.hits += 1
                return True, self._entries[key]
            self.misses += 1
            return False, None

    def put(self, key: tuple, value: Optional[dict[str, Any]]) -> None:
        with self._lock:
            self._entries[key] = value
            self._entries.move_to_end(key)
            while len(self._entries) > max(1, self.limit):
                self._entries.popitem(last=False)

    def __len__(self) -> int:
        with self._lock:
            return len(self._entries)

    def clear(self) -> None:
        with self._lock:
            self._entries.clear()
            self.hits = self.misses = 0


CACHE = EstimateCache()


def _digest(text: Any) -> Optional[str]:
    return hashlib.sha256(text.encode("utf-8")).hexdigest() if isinstance(text, str) else None


def breakdown(row: dict[str, Any], conversation: list[dict[str, Any]]) -> Optional[dict[str, Any]]:
    """``stored_context_breakdown`` over the row's frozen system prompt and ``tools[]`` pin, as
    ``_stored_breakdown`` builds it; ``None`` when there is no stored prompt yet (never ran)."""
    from agent.context_breakdown import stored_context_breakdown
    from tools.mcp_tool_agent import pinned_tool_defs

    prompt = row.get("system_prompt")
    if not prompt:
        return None
    try:
        pin = json.loads(row.get("tool_names") or "null")
    except (TypeError, ValueError):
        pin = None  # a pin hash whose row was swept resolves to itself (as _stored_breakdown)
    return stored_context_breakdown(prompt, pinned_tool_defs(pin), conversation)


def _shape_estimate(result: Optional[dict[str, Any]]) -> Optional[dict[str, Any]]:
    if result is None:
        return None
    return {
        "total": int(result.get("estimated_total") or 0),
        "categories": [
            {"id": str(cat.get("id")), "label": str(cat.get("label") or cat.get("id")), "tokens": int(cat.get("tokens") or 0)}
            for cat in result.get("categories") or [] if isinstance(cat, dict)
        ],
    }


def estimate_of(db: Any, session_id: str, *, store: str, cache: EstimateCache = CACHE) -> tuple[bool, Optional[dict[str, Any]]]:
    """``(found, estimate)`` for one stored id: ``found`` False for an id the store does not have."""
    row = db.get_session(session_id)
    if not row:
        return False, None
    # The compression tip the session's model context lives in (``_context_id``).
    tip = db.get_compression_tip(session_id) or session_id
    if tip != session_id:
        row = db.get_session(tip) or row
    key = (store, tip, db.conversation_revision(tip), _digest(row.get("system_prompt")), _digest(row.get("tool_names")))
    hit, value = cache.get(key)
    if hit:
        return True, value
    value = _shape_estimate(breakdown(row, model_history(db, tip))) if row.get("system_prompt") else None
    cache.put(key, value)
    return True, value


def context_window(row: Optional[dict[str, Any]] = None) -> Optional[int]:
    """The model's context length as a denominator: always ``None`` (card 12 P2: no network-free,
    write-free resolution path; never guessed)."""
    return None


def estimates(db: Any, ids: Iterable[str], *, store: str, cache: EstimateCache = CACHE) -> dict[str, dict[str, Any]]:
    """Per id the profile has: ``estimate`` (``{total, categories}`` or ``None``) and
    ``context_window``. Unknown ids are omitted."""
    out: dict[str, dict[str, Any]] = {}
    for session_id in ids:
        if session_id in out:
            continue
        found, value = estimate_of(db, session_id, store=store, cache=cache)
        if found:
            out[session_id] = {"estimate": value, "context_window": context_window()}
    return out


def timed(fn, *args, **kwargs) -> tuple[Any, float]:
    started = time.perf_counter()
    result = fn(*args, **kwargs)
    return result, (time.perf_counter() - started) * 1000.0
