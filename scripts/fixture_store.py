"""Session Tree test fixtures: the one place that writes a fixture Hermes store. TEST/FIXTURE-ONLY.

Nothing under ``dashboard/`` imports this module; the plugin's runtime reads go through
``dashboard/hermes_store.py``. The seeder (``scripts/seed-fixtures.py``), ``tests/py/conftest.py`` and
the tests open fixture stores here, and fixture reads that ``hermes_store`` has go through it.

Hermes writes a profile's ``state.db`` through one of two APIs:

* **v0.23.2 and earlier**: ``hermes_state.SessionDB`` (``create_session``, ``append_message``,
  ``update_token_counts``, ``end_session`` …).
* **v0.23.3 and later**: the storage interface, ``persistence_assembly.open_persistence`` with the
  repositories ``sessions``, ``lineage``, ``messages`` and ``usage``. ``hermes_state.SessionDB`` is a
  deprecated stub there without most of those methods, and it is removed in v0.27.0.

``open_store`` picks the API by capability, never by version: the legacy class when
``hermes_state`` carries the real ``SessionDB`` (one with ``update_token_counts``), else the
storage interface; then the opened handle decides every call through
``hermes_store.is_storage_interface``, once, at open. ``FixtureStore`` keeps the method names and
arguments the seeder always used (the old ``SessionDB`` ones), so a fixture seeds the same rows on
both versions.

Fixture-only direct SQL (``FixtureStore.fixture_sql``; the same statements on both paths, each
marked ``# fixture-only:`` where it is written, in ``scripts/seed-fixtures.py``):

* ``sessions.started_at``, ``last_activity_at``, ``ended_at``: backdating every fixture row
  (``Seeder._backdate``). No API of either version sets a historical timestamp.
* ``sessions.ended_at = NULL``, ``end_reason = NULL`` and ``last_activity_at = now``
  (``activate``, ``--activate``): re-open a fixture and stamp its activity now. The re-open API
  (``SessionDB.reopen_session``, ``sessions.reopen``) also retires queued prompts, freezes legacy
  reset children and un-archives a lineage, and ``sessions.touch_activity`` only moves the stamp
  forward with activity labels; the fixture changes these two cells and nothing else.
* ``sessions.ended_at = NULL``, ``end_reason = NULL`` (``compact``, ``--compact``): clear a tip's
  end stamp before ending it ``compression`` (the first end wins), for the same reason.
"""

from __future__ import annotations

import importlib.util
import sys
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Callable, Iterator, Optional

REPO = Path(__file__).resolve().parents[1]


def _load_hermes_store():
    """``dashboard/hermes_store.py`` (read-only use: its reads and ``is_storage_interface``)."""
    name = "session_tree_fixture_hermes_store"
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(name, REPO / "dashboard" / "hermes_store.py")
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


hermes_store = _load_hermes_store()


def legacy_session_db() -> Any:
    """``hermes_state.SessionDB`` when it is the legacy store class (it carries the fixtures' write
    verbs, ``update_token_counts`` among them), else ``None``: no ``hermes_state`` module, or the
    v0.23.3+ deprecated stub. Read from the module's own namespace, so probing the stub (served by
    the module's ``__getattr__``) emits no deprecation warning."""
    if importlib.util.find_spec("hermes_state") is None:
        return None
    import hermes_state

    cls = vars(hermes_state).get("SessionDB")
    return cls if isinstance(cls, type) and callable(getattr(cls, "update_token_counts", None)) else None


def _state_db(path: Path | str) -> Path:
    """``path`` as a ``state.db`` file: a home directory gets ``state.db`` appended."""
    path = Path(path)
    return path if path.name == "state.db" else path / "state.db"


def open_store(path: Path | str) -> "FixtureStore":
    """A writable fixture store over ``path`` (a home directory or its ``state.db``), created when
    missing. Close it (or use it as a context manager)."""
    db_path = _state_db(path)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    legacy = legacy_session_db()
    if legacy is not None:
        return FixtureStore(legacy(db_path=db_path))
    from persistence_assembly import open_persistence, profile_scope

    return FixtureStore(open_persistence(profile_scope(home=db_path.parent), eager=True))


@contextmanager
def open_reader(path: Path | str) -> Iterator[Any]:
    """A read-only handle over an existing store, for ``hermes_store``'s reads: a read-only
    ``SessionDB`` on the legacy API, an ``open_persistence_reader`` handle on the storage interface."""
    db_path = _state_db(path)
    legacy = legacy_session_db()
    if legacy is not None:
        db = legacy(db_path=db_path, read_only=True)
        try:
            yield db
        finally:
            db.close()
        return
    from persistence_assembly import open_persistence_reader

    with open_persistence_reader(db_path) as handle:
        yield handle


def session_unread(db: Any, session_id: str) -> Optional[bool]:
    """Hermes's own unread rule for a stored row (activity after the ``last_read_at`` watermark);
    ``None`` for an unknown id. ``db`` is a handle from ``open_reader`` or ``FixtureStore.db``."""
    if hermes_store.is_storage_interface(db):
        entry = db.sessions.summary(session_id)
        return None if entry is None else bool(entry.unread)
    row = db.get_session(session_id)
    return None if row is None else bool(db.session_unread(row))


def _media_root() -> str:
    """The profile's retained media root a storage-interface delete takes (as ``SessionDB.delete_session``
    resolves it on v0.23.3)."""
    from gateway.session_ingress_media import native_inputs_root

    return str(native_inputs_root())


class FixtureStore:
    """One writable fixture store. Every method has the old ``SessionDB`` name, arguments and
    result shape, and runs on whichever API the opened handle is."""

    def __init__(self, db: Any) -> None:
        self.db = db
        # The one decision point: by what the opened handle has (hermes_store.is_storage_interface),
        # never by a Hermes version; every method below branches on it.
        self.storage_interface = hermes_store.is_storage_interface(db)

    def close(self) -> None:
        self.db.close()

    def __enter__(self) -> "FixtureStore":
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    # --- sessions ---------------------------------------------------------------------------------

    def create_session(self, session_id: str, source: str, **kwargs: Any) -> str:
        """Upsert a row (``model``, ``model_config`` with its lineage markers, ``parent_session_id``,
        ``cwd``, ``git_repo_root``, ``user_id``, …)."""
        if not self.storage_interface:
            return self.db.create_session(session_id, source, **kwargs)
        from persistence.conversation.sessions import NewSession

        return str(self.db.sessions.create(NewSession(session_id=session_id, source=source, **kwargs)))

    def end_session(self, session_id: str, end_reason: str) -> None:
        if not self.storage_interface:
            return self.db.end_session(session_id, end_reason)
        self.db.sessions.end(session_id, end_reason)

    def set_session_title(self, session_id: str, title: Optional[str]) -> bool:
        if not self.storage_interface:
            return self.db.set_session_title(session_id, title)
        return bool(self.db.sessions.set_title(session_id, title))

    def set_session_pinned(self, session_id: str, pinned: bool) -> bool:
        if not self.storage_interface:
            return self.db.set_session_pinned(session_id, pinned)
        return bool(self.db.sessions.set_pinned(session_id, pinned))

    def set_session_archived(self, session_id: str, archived: bool) -> bool:
        if not self.storage_interface:
            return self.db.set_session_archived(session_id, archived)
        return bool(self.db.sessions.set_archived(session_id, archived).changed)

    def update_system_prompt(self, session_id: str, system_prompt: Optional[str]) -> None:
        if not self.storage_interface:
            return self.db.update_system_prompt(session_id, system_prompt)
        self.db.sessions.update_system_prompt(session_id, system_prompt)

    def update_session_tool_names(self, session_id: str, pin: Any) -> None:
        """The session's ``tools[]`` pin (``None`` clears it)."""
        if not self.storage_interface:
            return self.db.update_session_tool_names(session_id, pin)
        self.db.sessions.update_tool_pin(session_id, pin)

    def delete_session(self, session_id: str) -> bool:
        """Delete the row (its lineage and delegate children), then the after-delete work; True when
        something was removed."""
        if not self.storage_interface:
            return bool(self.db.delete_session(session_id))
        from session_retention import after_sessions_removed

        removed = self.db.sessions.delete(session_id, media_root=_media_root())
        after_sessions_removed(self.db, self.db.scope.profile_dir, removed, reason="delete", primary=session_id)
        return bool(removed)

    def get_session(self, session_id: str) -> Optional[dict[str, Any]]:
        return hermes_store.get_session(self.db, session_id)

    def get_session_title(self, session_id: str) -> Optional[str]:
        if not self.storage_interface:
            return self.db.get_session_title(session_id)
        return self.db.sessions.get_title(session_id)

    # --- compression lineage ----------------------------------------------------------------------

    def get_compression_tip(self, session_id: str) -> str:
        return hermes_store.compression_tip(self.db, session_id)

    def get_compression_lineage(self, session_id: str) -> list[str]:
        return hermes_store.compression_lineage(self.db, session_id)

    # --- messages ---------------------------------------------------------------------------------

    def append_message(self, session_id: str, role: str, content: Any = None, **fields: Any) -> int:
        """One transcript row (``timestamp``, ``tool_calls``, ``tool_call_id``, ``tool_name``, …)."""
        if not self.storage_interface:
            return self.db.append_message(session_id, role, content, **fields)
        from persistence.conversation.messages import NewMessage

        return int(self.db.messages.append(session_id, NewMessage.from_live({"role": role, "content": content, **fields})))

    def append_messages_batch(self, session_id: str, messages: list[dict[str, Any]], *,
                              chunk_rows: Optional[int] = None) -> int:
        """Many transcript rows in one write (``chunk_rows`` per transaction); the inserted count."""
        if not self.storage_interface:
            return self.db.append_messages_batch(session_id, messages, chunk_rows=chunk_rows)
        from persistence.conversation.messages import NewMessage

        result = self.db.messages.append_batch(session_id, [NewMessage.from_live(m) for m in messages], chunk_rows=chunk_rows)
        return int(result.inserted)

    def get_messages_as_conversation(self, session_id: str, *, include_row_ids: bool = False) -> list[dict[str, Any]]:
        """The active transcript as OpenAI-style message dicts (``_row_id`` stamped on request)."""
        if not self.storage_interface:
            return self.db.get_messages_as_conversation(session_id, include_row_ids=include_row_ids)
        from persistence.conversation.messages import ConversationRequest

        request = ConversationRequest(include_row_ids=include_row_ids)
        return [message.as_openai_message() for message in self.db.messages.read_conversation(session_id, request)]

    def rewrite_pruned_rows(self, session_id: str, changes: list[tuple[dict[str, Any], dict[str, Any]]]) -> int:
        """A tool-result prune committed in place: each ``(original, replacement)`` row keeps its id
        with the replacement's content, and one archived twin of its old self. Hermes's own change
        records (``agent.conversation_compression_archive.held_message``) on the storage interface."""
        if not self.storage_interface:
            return self.db.rewrite_pruned_rows(session_id, changes)
        from agent.conversation_compression_archive import held_message
        from persistence.conversation.messages import NewMessage, PrunedRowChange

        result = self.db.messages.rewrite_pruned_rows(session_id, [
            PrunedRowChange(held_message(original), NewMessage.from_live(replacement), NewMessage.from_live(original))
            for original, replacement in changes])
        return int(result.rewritten)

    def archive_and_compact(self, session_id: str, messages: list[dict[str, Any]]) -> None:
        """An in-place compaction: the active transcript archived, ``messages`` written as the new one
        (Hermes's own ``commit_compaction`` on the storage interface)."""
        if not self.storage_interface:
            return self.db.archive_and_compact(session_id, messages)
        from agent.conversation_compression_archive import commit_compaction

        commit_compaction(None, self.db, session_id, messages)

    # --- usage ------------------------------------------------------------------------------------

    def update_token_counts(self, session_id: str, *, source: Optional[str] = None, **counts: Any) -> None:
        """Add one API call's accounting (``input_tokens``, ``output_tokens``, ``cache_read_tokens``,
        ``cache_write_tokens``, ``model``, ``estimated_cost_usd``, ``prompt_cache_clock`` …). On the
        storage interface: the ``UsageDelta`` ``agent.turn_usage.queue_usage`` builds from the same
        keywords, queued and flushed, so the row holds it when this returns."""
        if not self.storage_interface:
            return self.db.update_token_counts(session_id, source=source, **counts)
        from persistence.conversation.usage import BillingRoute, TokenCounts, UsageDelta

        tokens = TokenCounts(**{key: counts.pop(key, 0) for key in (
            "input_tokens", "output_tokens", "cache_read_tokens", "cache_write_tokens", "reasoning_tokens")})
        route = {key: counts.pop(key, None) for key in ("model", "billing_provider", "billing_base_url", "billing_mode")}
        delta = UsageDelta(tokens=tokens, route=BillingRoute(**route) if route["model"] else None, source=source, **counts)
        self.db.usage.queue_usage(session_id, delta)
        if not self.db.usage.flush_usage():
            raise TimeoutError(f"usage for {session_id} was not applied")

    def prompt_cache_generation(self, session_id: str) -> int:
        """How many transcript rows a compaction or prune archived (the prompt-cache clock's generation)."""
        return int(hermes_store.generation_reader(self.db).prompt_cache_generation(session_id))

    # --- fixture-only SQL -------------------------------------------------------------------------

    def fixture_sql(self, write: Callable[[Any], Any]) -> Any:
        """Run ``write(conn)`` in one write transaction of this store: FIXTURE-ONLY, for the cells no
        API sets (module docstring). Private on both versions: ``SessionDB._execute_write``, and on
        the storage interface the bound store holder's ``_execute_write`` (as ``hermes_store.read_all``
        reaches its reader)."""
        if not self.storage_interface:
            return self.db._execute_write(write)
        return self.db._bound_store().holder()._execute_write(write)
