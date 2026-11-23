"""``dashboard/hermes_store.py``, function by function, against the running Hermes.

Every read the plugin makes of a profile's store goes through ``hermes_store``; each function picks
the legacy ``SessionDB`` path (Hermes v0.23.2 and earlier) or the storage-interface path (v0.23.3+)
by what the handle has. These tests call each public function on the handle the core itself gives
(``hermes_cli.web_routers.profiles._open_session_db_at_path``, read-only) over seeded fixtures and
assert a concrete value, so a Hermes API move fails here, at the function that broke. Run against
another Hermes with ``HERMES_AGENT_DIR=<tree> npm run test:py``.

``test_every_public_function_has_a_test`` fails when ``hermes_store`` gains, renames or loses a
public function without this file following.
"""

from __future__ import annotations

import inspect
import sys
import time
from pathlib import Path

import pytest

from conftest import REPO, _load, fixture_store

#: The public functions of ``hermes_store`` this file tests (one test each, at least).
TESTED = {
    "is_storage_interface",
    "list_rows",
    "get_session",
    "compression_chain",
    "compression_lineage",
    "compression_tip",
    "latest_messages",
    "read_all",
    "conversation_revision",
    "generation_reader",
    "route_source",
}

SEGMENTS = ["st-sys-root", "st-sys-seg2", "st-sys-seg3", "st-sys-tip"]


@pytest.fixture(scope="module")
def store(plugin_api):
    """The ``hermes_store`` module the plugin runs with."""
    return plugin_api.hermes_store


@pytest.fixture(scope="module")
def seeder(manifest):
    return sys.modules.get("session_tree_seed_fixtures") or _load("session_tree_seed_fixtures", REPO / "scripts" / "seed-fixtures.py")


def _core_reader(home: Path):
    from hermes_cli.web_routers.profiles import _open_session_db_at_path

    return _open_session_db_at_path(home / "state.db", read_only=True)


@pytest.fixture()
def db(manifest, hermes_home):
    """A read-only handle on the default fixture home, as the core hands it to the plugin."""
    handle = _core_reader(hermes_home)
    try:
        yield handle
    finally:
        handle.close()


@pytest.fixture(scope="module")
def ctx_home(tmp_path_factory, seeder) -> Path:
    home = tmp_path_factory.mktemp("store-ctx-home")
    with fixture_store.open_store(home) as writer:
        seeder.seed_context(writer)
    return home


@pytest.fixture()
def ctx_db(ctx_home):
    handle = _core_reader(ctx_home)
    try:
        yield handle
    finally:
        handle.close()


def test_every_public_function_has_a_test(store):
    public = {name for name, value in vars(store).items()
              if not name.startswith("_") and inspect.isfunction(value) and value.__module__ == store.__name__}
    assert public == TESTED, f"untested: {sorted(public - TESTED)}; gone: {sorted(TESTED - public)}"


def test_is_storage_interface(store, db, tmp_path):
    # Two independent capability probes agree: the handle the core gives, and fixture_store's choice
    # of writer (the legacy SessionDB class when hermes_state still carries it).
    assert store.is_storage_interface(db) is (fixture_store.legacy_session_db() is None)
    with fixture_store.open_store(tmp_path) as writer:
        assert store.is_storage_interface(writer.db) is store.is_storage_interface(db) is writer.storage_interface
    assert store.is_storage_interface(object()) is False


def test_list_rows(store, db):
    rows = {row["id"]: row for row in store.list_rows(db, limit=1000, include_archived=False,
                                                       include_subagents=False, exclude_sources=None)}
    # A compacted conversation is listed by its tip, carrying its lineage root.
    assert rows["st-sys-tip"]["_lineage_root_id"] == "st-sys-root" and "st-sys-root" not in rows
    assert rows["st-hp-root"]["title"] == "Session tree plugin" and rows["st-hp-root"]["pinned"] == 1
    assert "st-archived-0" not in rows and "st-hidden-delegate" not in rows
    with_archived = {row["id"] for row in store.list_rows(db, limit=1000, include_archived=True,
                                                          include_subagents=False, exclude_sources=None)}
    assert {"st-archived-0", "st-archived-1"} <= with_archived
    without_cron = {row["id"] for row in store.list_rows(db, limit=1000, include_archived=False,
                                                         include_subagents=False, exclude_sources=["cron"])}
    assert "st-hidden-cron" in rows and "st-hidden-cron" not in without_cron
    # The window's newest rows, then the pinned rows it missed back-filled (st-hp-root, 2 h old).
    window = [row["id"] for row in store.list_rows(db, limit=3, include_archived=False, include_subagents=False,
                                                    exclude_sources=None)]
    assert len(window) == 4 and window[3] == "st-hp-root" and window[0] == "st-sys-pairing"


def test_get_session(store, db):
    row = store.get_session(db, "st-md-katex")
    assert row["id"] == "st-md-katex" and row["title"] == "Math page weight (KaTeX)"
    assert row["parent_session_id"] == "st-md-tip" and row["_branched_from"] == "st-md-tip"
    assert row["message_count"] == 6 and row["input_tokens"] == 12000 and row["output_tokens"] == 3000
    assert store.get_session(db, "st-nope") is None


def test_compression_chain(store, db):
    assert store.compression_chain(db, "st-sys-root") == SEGMENTS
    assert store.compression_chain(db, "st-single-00") == ["st-single-00"]


def test_compression_lineage(store, db):
    assert store.compression_lineage(db, "st-sys-seg3") == SEGMENTS
    assert store.compression_lineage(db, "st-nope") == []


def test_compression_tip(store, db):
    assert store.compression_tip(db, "st-sys-root") == "st-sys-tip"
    assert store.compression_tip(db, "st-single-00") == "st-single-00"


def test_latest_messages(store, db):
    # st-single-00 holds four messages: the prompt, a reply, a follow-up and a reply (chronological).
    got = store.latest_messages(db, "st-single-00", 2)
    assert [(m["role"], m["content"]) for m in got] == [
        ("user", "Follow-up 1 on Debian rpmbuild fix"), ("assistant", "Reply 1 about Debian rpmbuild fix.")]


def test_read_all(store, db):
    rows = store.read_all(db, "SELECT COUNT(*) FROM messages WHERE session_id = ?", ("st-single-00",))
    assert rows[0][0] == 4


def test_conversation_revision(store, tmp_path):
    with fixture_store.open_store(tmp_path) as writer:
        writer.create_session("st-rev", "desktop", model="m")
        writer.append_message("st-rev", "user", "first", timestamp=time.time() - 10)
    handle = _core_reader(tmp_path)
    try:
        first = store.conversation_revision(handle, "st-rev")
        assert store.conversation_revision(handle, "st-rev") == first and hash(first) is not None
    finally:
        handle.close()
    with fixture_store.open_store(tmp_path) as writer:
        writer.append_message("st-rev", "assistant", "second", timestamp=time.time())
    handle = _core_reader(tmp_path)
    try:
        assert store.conversation_revision(handle, "st-rev") != first
    finally:
        handle.close()


def test_generation_reader(store, ctx_db):
    reader = store.generation_reader(ctx_db)
    # st-ctx-compacted had one tool result pruned (seed_context's archive_one); the others none.
    assert reader.prompt_cache_generation("st-ctx-compacted") == 1
    assert reader.prompt_cache_generation("st-ctx-measured") == 0
    if store.is_storage_interface(ctx_db):
        assert reader is not ctx_db  # the usage repository; the handle itself has no such read
    else:
        assert reader is ctx_db


def test_route_source(store, ctx_db, seeder):
    from gateway.session_tui_reads import _saved_route

    row = store.get_session(ctx_db, "st-ctx-measured")
    provider, _base_url, model = _saved_route(store.route_source(ctx_db, row))
    assert (provider, model) == (seeder.CONTEXT_PROVIDER, seeder.CONTEXT_MODEL) == ("anthropic", "claude-opus-4.1")
    if store.is_storage_interface(ctx_db):
        assert store.route_source(ctx_db, row).model_config["provider"] == "anthropic"
    else:
        assert store.route_source(ctx_db, row) is row
