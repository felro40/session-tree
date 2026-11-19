"""Card 12: each session's context — ``GET /sessions``'s ``context_measured`` /
``context_invalid_reason`` / ``cache_window`` and ``POST /sessions/context``'s estimate.

The fixtures (``scripts/seed-fixtures.py`` ``seed_context``) live in their own small Hermes home,
served as an extra profile ``ctx`` (as the Rich cards tests do); the mutation tests seed a fresh
home each. Everything here goes through the plugin's own endpoints or ``dashboard/session_context.py``.
"""

from __future__ import annotations

import hashlib
import inspect
import os
import socket
import sqlite3
import statistics
import subprocess
import sys
import time
from pathlib import Path

import pytest

from conftest import PREFIX, REPO, _load

CTX = "ctx"
MEASURED, UNKNOWN, COMPACTED, ROUTE, ESTIMATE, NEVER = (
    "st-ctx-measured", "st-ctx-unknown", "st-ctx-compacted", "st-ctx-route", "st-ctx-estimate", "st-ctx-never")
ALL = [MEASURED, UNKNOWN, COMPACTED, ROUTE, ESTIMATE, NEVER]


@pytest.fixture(scope="module")
def seeder(manifest):
    return sys.modules.get("session_tree_seed_fixtures") or _load("session_tree_seed_fixtures", REPO / "scripts" / "seed-fixtures.py")


def _seed_home(path: Path, seeder) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    db = seeder.SessionDB(db_path=path / "state.db")
    try:
        seeder.seed_context(db)
    finally:
        db.close()
    return path


@pytest.fixture(scope="module")
def ctx_home(tmp_path_factory, seeder) -> Path:
    return _seed_home(tmp_path_factory.mktemp("ctx-home"), seeder)


@pytest.fixture()
def fresh_home(tmp_path, seeder) -> Path:
    """A context home of its own, for a test that changes it."""
    return _seed_home(tmp_path / "ctx-fresh", seeder)


def _serve(monkeypatch, plugin_api, name: str, home: Path) -> None:
    original = plugin_api._profile_targets
    monkeypatch.setattr(plugin_api, "_profile_targets", lambda: [*original(), (name, home)])


@pytest.fixture()
def ctx(monkeypatch, plugin_api, ctx_home):
    _serve(monkeypatch, plugin_api, CTX, ctx_home)
    return ctx_home


@pytest.fixture()
def fresh(monkeypatch, plugin_api, fresh_home):
    _serve(monkeypatch, plugin_api, "ctxfresh", fresh_home)
    return fresh_home


@pytest.fixture()
def module(plugin_api):
    module = plugin_api.session_context
    module.CACHE.clear()
    return module


def rows(client, profile: str = CTX) -> dict[str, dict]:
    response = client.get(f"{PREFIX}/sessions", params={"session_profile": profile})
    assert response.status_code == 200, response.text
    return {row["id"]: row for row in response.json()["sessions"]}


def post(client, body: dict):
    return client.post(f"{PREFIX}/sessions/context", json=body)


def contexts(client, ids: list[str], profile: str = CTX) -> dict:
    response = post(client, {"profile": profile, "ids": ids})
    assert response.status_code == 200, response.text
    return response.json()["contexts"]


# --- the Hermes functions this card reuses (a loud failure when one moves) -----------------------

def test_the_hermes_functions_and_wrapped_private_helpers_keep_their_signatures(plugin_api):
    from agent import context_breakdown, prompt_cache_clock
    from gateway import session_tui_reads
    from tools import mcp_tool_agent

    def params(fn):
        return [(p.name, p.kind) for p in inspect.signature(fn).parameters.values()]

    kw, pos = inspect.Parameter.KEYWORD_ONLY, inspect.Parameter.POSITIONAL_OR_KEYWORD
    assert params(prompt_cache_clock.event_from_json) == [("raw", pos)]
    assert params(prompt_cache_clock.current_generation) == [("db", pos), ("session_id", pos)]
    assert params(prompt_cache_clock.stored_cache_window) == [("raw_clock", pos), ("session_id", kw), ("generation", kw), ("saved_route", kw)]
    assert [n for n, _k in params(prompt_cache_clock.cache_certainly_warm)] == ["window", "now"]
    assert [n for n, _k in params(prompt_cache_clock.cache_certainly_cold)] == ["window", "now"]
    assert params(context_breakdown.stored_context_breakdown) == [("system_prompt", pos), ("tools", pos), ("messages", pos)]
    assert params(mcp_tool_agent.pinned_tool_defs) == [("saved", pos)]
    # The private ones, each reached only through session_context._hermes_private.
    assert params(prompt_cache_clock._invalid_reason) == [("event", pos), ("session_id", kw), ("generation", kw), ("route", kw)]
    assert params(prompt_cache_clock._saved_route_changed) == [("event", pos), ("saved", pos)]
    assert params(session_tui_reads._saved_route) == [("row", pos)]
    assert params(session_tui_reads._model_history) == [("db", pos), ("tip", pos)]
    assert params(session_tui_reads._stored_breakdown) == [("row", pos), ("conversation", pos), ("usage", pos), ("tip", kw), ("db", kw)]
    private = plugin_api.session_context._hermes_private()
    assert private["_invalid_reason"] is prompt_cache_clock._invalid_reason
    assert private["_model_history"] is session_tui_reads._model_history


# --- P1.3: no network, no process (first in the file: the cold imports happen under the guard) ----

def _children(pid: int) -> set[int]:
    out = set()
    for entry in os.listdir("/proc"):
        if entry.isdigit():
            try:
                with open(f"/proc/{entry}/stat", encoding="latin1") as fh:
                    fields = fh.read().rsplit(")", 1)[1].split()
            except OSError:
                continue
            if int(fields[1]) == pid:
                out.add(int(entry))
    return out


def test_p1_3_the_reads_open_no_socket_and_start_no_process(client, ctx, module, monkeypatch):
    cold = "model_tools" not in sys.modules
    opened: list[str] = []

    def refuse(name):
        def guard(*args, **kwargs):
            opened.append(f"{name}{args[1:2]}")
            raise OSError(f"card 12 P1.3 guard: {name} refused")
        return guard

    monkeypatch.setattr(socket.socket, "connect", refuse("connect"))
    monkeypatch.setattr(socket.socket, "connect_ex", refuse("connect_ex"))
    monkeypatch.setattr(socket.socket, "sendto", refuse("sendto"))
    monkeypatch.setattr(socket, "create_connection", refuse("create_connection"))
    monkeypatch.setattr(socket, "getaddrinfo", refuse("getaddrinfo"))
    started: list[str] = []
    real_popen = subprocess.Popen.__init__

    def popen(self, *args, **kwargs):
        started.append(repr(args[:1]))
        return real_popen(self, *args, **kwargs)

    monkeypatch.setattr(subprocess.Popen, "__init__", popen)
    monkeypatch.setattr(os, "fork", refuse("fork"))
    before = _children(os.getpid())
    listed = rows(client)
    answered = contexts(client, ALL)
    after = _children(os.getpid())
    print(f"\nP1.3: model_tools imported cold under the guard: {cold}; sockets {opened}; processes {started}; "
          f"children before {sorted(before)} after {sorted(after)}")
    assert listed[MEASURED]["context_measured"]["tokens"] == 154789
    assert answered[ESTIMATE]["estimate"]["total"] > 0
    assert opened == [] and started == [] and after <= before


# --- the measured context and its validity --------------------------------------------------------

def test_validity_per_reason_on_the_fixtures(client, ctx, seeder):
    got = rows(client)
    measured = got[MEASURED]
    assert measured["context_measured"]["tokens"] == sum(seeder.CONTEXT_CLOCKS[MEASURED]) == 154789
    assert measured["context_measured"]["confidence"] == "proven" and measured["context_invalid_reason"] is None
    assert measured["cache_window"]["state"] == "warm"
    assert got[UNKNOWN]["context_measured"]["confidence"] == "unknown" and got[UNKNOWN]["context_invalid_reason"] is None
    assert got[UNKNOWN]["cache_window"]["state"] == "unknown"
    assert got[COMPACTED]["context_invalid_reason"] == "compacted"
    assert got[COMPACTED]["cache_window"] == {"state": "unknown", "guaranteed_until": None, "estimated_until": None, "reason": "compacted"}
    assert got[ROUTE]["context_invalid_reason"] == "route_changed"
    assert got[ROUTE]["cache_window"]["reason"] == "route_changed"
    for sid in (ESTIMATE, NEVER):
        assert got[sid]["context_measured"] is None and got[sid]["context_invalid_reason"] is None and got[sid]["cache_window"] is None
    # The lifetime tokens are the row's columns, unchanged.
    assert (measured["input_tokens"], measured["output_tokens"]) == (26000, 500)
    assert measured["cache_read_tokens"] == 120000 and measured["cache_write_tokens"] == 34789


def test_rows_without_a_clock_carry_null_fields(client, manifest):
    got = rows(client, "default")
    assert got and all(row["context_measured"] is None and row["cache_window"] is None for row in got.values())


def test_session_rotated_and_storage_unavailable(ctx_home, module):
    from hermes_cli.web_routers.profiles import _open_session_db_at_path

    db = _open_session_db_at_path(ctx_home / "state.db", read_only=True)
    try:
        row = dict(db.get_session(MEASURED))
        moved = module.row_fields(db, {**row, "id": "st-ctx-elsewhere"}, time.time())
        assert moved["context_invalid_reason"] == "session_rotated" and moved["cache_window"]["state"] == "unknown"

        class Broken:
            def prompt_cache_generation(self, sid):
                raise sqlite3.OperationalError("disk I/O error")

        broken = module.row_fields(Broken(), row, time.time())
        assert broken["context_invalid_reason"] == "storage_unavailable" and broken["context_measured"]["tokens"] == 154789
    finally:
        db.close()


def test_an_archive_flips_measured_to_estimated(client, fresh, seeder):
    name = "ctxfresh"
    before = rows(client, name)[MEASURED]
    assert before["context_invalid_reason"] is None
    db = seeder.SessionDB(db_path=fresh / "state.db")
    try:
        result = seeder.archive_one(db, MEASURED)
    finally:
        db.close()
    assert result["how"] == "prune" and result["generation"] == result["generation_before"] + 1
    after = rows(client, name)[MEASURED]
    assert after["context_invalid_reason"] == "compacted" and after["cache_window"]["state"] == "unknown"
    # The page's estimate signature moves with a prune (the transcript revision; the counts do not).
    assert after["transcript_revision"] > before["transcript_revision"]
    assert after["message_count"] == before["message_count"]
    assert contexts(client, [MEASURED], name)[MEASURED]["estimate"]["total"] > 0


# --- the estimate ---------------------------------------------------------------------------------

def test_the_estimate_equals_stored_breakdown(client, ctx, module):
    from gateway.session_tui_reads import _model_history, _stored_breakdown
    from hermes_cli.web_routers.profiles import _open_session_db_at_path

    answered = contexts(client, ALL)
    db = _open_session_db_at_path(ctx / "state.db", read_only=True)
    try:
        for sid in ALL:
            row = db.get_session(sid)
            if sid == NEVER:
                assert not row.get("system_prompt") and answered[sid]["estimate"] is None
                continue
            expected = _stored_breakdown(row, _model_history(db, sid), {}, tip=sid, db=db)
            got = answered[sid]["estimate"]
            assert got["total"] == expected["estimated_total"] > 0
            assert got["categories"] == [{"id": c["id"], "label": c["label"], "tokens": c["tokens"]} for c in expected["categories"]]
            assert answered[sid]["context_window"] is None
    finally:
        db.close()
    ids = {c["id"] for c in answered[ESTIMATE]["estimate"]["categories"]}
    assert {"system_prompt", "tool_definitions", "skills", "subagent_definitions", "conversation"} <= ids


def test_cache_window_states_at_fixed_times(module):
    from agent.prompt_cache_clock import CacheEvent, event_to_json, stored_cache_window

    sent = 1_800_000_000.0
    route = ("anthropic", "", "m")

    def window(**kw):
        event = CacheEvent(route=route, destination=route, route_class="anthropic_markers", requested_ttl="5m", sent_at=sent,
                           read_tokens=10, write_tokens=5, tier="5m", confidence=kw.pop("confidence", "proven"), reason="r",
                           session_id="s", generation=0, **kw)
        return stored_cache_window(event_to_json(event), session_id="s", generation=0, saved_route=(None, None, "m"))

    tiered = window(coverage={"5m": sent + 300}, guaranteed_until=sent + 300, estimated_until=sent + 3600)
    assert module.cache_state(tiered, sent + 10)["state"] == "warm"
    assert module.cache_state(tiered, sent + 300)["state"] == "may_be_warm"
    assert module.cache_state(tiered, sent + 3599)["state"] == "may_be_warm"
    assert module.cache_state(tiered, sent + 3600)["state"] == "expired"
    assert module.cache_state(tiered, sent + 10) == {"state": "warm", "guaranteed_until": sent + 300, "estimated_until": sent + 3600, "reason": "r"}
    no_guarantee = window(estimated_until=sent + 600, confidence="assumed")
    assert module.cache_state(no_guarantee, sent + 1)["state"] == "may_be_warm"
    assert module.cache_state(no_guarantee, sent + 600)["state"] == "expired"
    unknown = window(confidence="unknown")
    assert module.cache_state(unknown, sent)["state"] == "unknown"
    assert module.cache_state(None, sent) is None


# --- the endpoint's input -------------------------------------------------------------------------

def test_100_ids_pass_and_101_are_refused(client, ctx):
    ids = [MEASURED, *[f"st-x-{i}" for i in range(99)]]
    got = contexts(client, ids)
    assert list(got) == [MEASURED]  # unknown ids are omitted
    assert post(client, {"profile": CTX, "ids": [f"st-x-{i}" for i in range(101)]}).status_code == 422


@pytest.mark.parametrize(("body", "status"), [
    ({"profile": "nope", "ids": []}, 404),
    ({"profile": "../default", "ids": []}, 400),
    ({"profile": "*", "ids": []}, 400),
    ({"ids": []}, 422),
    ({"profile": "default", "ids": ["../etc"]}, 400),
    ({"profile": "default", "ids": ["a b"]}, 400),
    ({"profile": "default", "ids": [1]}, 422),
    ({"profile": "default", "ids": "st-sys-tip"}, 422),
    ({"profile": "default", "ids": [], "extra": True}, 422),
])
def test_input_is_validated(client, body, status):
    assert post(client, body).status_code == status


def test_duplicates_answered_once_and_default_fixtures_have_no_estimate(client, manifest):
    got = contexts(client, ["st-sys-tip", "st-sys-tip", "st-single-00"], profile="default")
    assert set(got) == {"st-sys-tip", "st-single-00"}
    assert all(each == {"estimate": None, "context_window": None} for each in got.values())


# --- the server cache -----------------------------------------------------------------------------

def test_the_server_cache_hits_invalidates_on_a_new_message_and_is_capped(client, fresh, module, seeder, monkeypatch):
    name = "ctxfresh"
    computed: list[str] = []
    real = module.breakdown
    monkeypatch.setattr(module, "breakdown", lambda row, conversation: computed.append(row["id"]) or real(row, conversation))
    first = contexts(client, [ESTIMATE], name)[ESTIMATE]["estimate"]
    again = contexts(client, [ESTIMATE], name)[ESTIMATE]["estimate"]
    assert computed == [ESTIMATE] and again == first and module.CACHE.hits >= 1
    db = seeder.SessionDB(db_path=fresh / "state.db")
    try:
        db.append_message(ESTIMATE, "user", "one more question " * 50, timestamp=time.time())
    finally:
        db.close()
    grown = contexts(client, [ESTIMATE], name)[ESTIMATE]["estimate"]
    assert computed == [ESTIMATE, ESTIMATE] and grown["total"] > first["total"]
    monkeypatch.setattr(module.CACHE, "limit", 2)
    contexts(client, [MEASURED, UNKNOWN, COMPACTED, ROUTE], name)
    assert len(module.CACHE) == 2


# --- P1.2: read-only ------------------------------------------------------------------------------

def _fingerprint(home: Path) -> dict[str, tuple]:
    out = {}
    for suffix in ("", "-wal", "-shm"):
        path = home / f"state.db{suffix}"
        if path.exists():
            st = path.stat()
            out[path.name] = (st.st_mtime_ns, st.st_size, hashlib.sha256(path.read_bytes()).hexdigest())
    return out


def test_p1_2_a_full_round_writes_nothing(client, ctx, module):
    rows(client)  # warm: one-time open work first (as the details test)
    contexts(client, ALL)
    module.CACHE.clear()  # the round below computes every estimate again
    probe = sqlite3.connect(f"file:{ctx / 'state.db'}?mode=ro", uri=True)
    try:
        version = probe.execute("PRAGMA data_version").fetchone()[0]
        before = _fingerprint(ctx)
        listed = rows(client)
        answered = contexts(client, ALL)
        after = _fingerprint(ctx)
        assert probe.execute("PRAGMA data_version").fetchone()[0] == version
    finally:
        probe.close()
    print(f"\nP1.2 files: {sorted(before)}; data_version {version} unchanged")
    assert listed[MEASURED]["context_measured"] and answered[ESTIMATE]["estimate"]
    assert after == before


# --- P1.4: cost -----------------------------------------------------------------------------------

@pytest.fixture(scope="module")
def clocked_500(tmp_path_factory, seeder) -> Path:
    """500 sessions, every one with a valid clock (the listing's worst case: one count per row)."""
    home = tmp_path_factory.mktemp("ctx-500")
    db = seeder.SessionDB(db_path=home / "state.db")
    try:
        for i in range(500):
            sid = f"st-c500-{i:04d}"
            db.create_session(sid, "desktop", model=seeder.CONTEXT_MODEL, model_config={"provider": seeder.CONTEXT_PROVIDER})
            db.append_message(sid, "user", f"question {i}", timestamp=time.time() - i)
            db.append_message(sid, "assistant", f"answer {i}", timestamp=time.time() - i + 1)
            db.update_token_counts(sid, cache_read_tokens=1000 + i, cache_write_tokens=10, model=seeder.CONTEXT_MODEL,
                                   prompt_cache_clock=seeder._clock_json(sid, 1000 + i, 10, generation=0))
    finally:
        db.close()
    return home


def test_p1_4_the_listing_time_added_on_500_rows_with_a_clock(client, plugin_api, clocked_500, monkeypatch):
    _serve(monkeypatch, plugin_api, "c500", clocked_500)
    module = plugin_api.session_context
    real = module.row_fields

    def listing(enabled: bool) -> float:
        monkeypatch.setattr(module, "row_fields", real if enabled else (lambda db, row, now: {}))
        started = time.perf_counter()
        got = client.get(f"{PREFIX}/sessions", params={"session_profile": "c500"}).json()["sessions"]
        elapsed = (time.perf_counter() - started) * 1000
        assert len(got) == 500
        assert all(row["context_measured"] for row in got) == enabled
        return elapsed

    listing(True), listing(False)  # warm
    with_fields = [listing(True) for _ in range(7)]
    without = [listing(False) for _ in range(7)]
    added = statistics.median(with_fields) - statistics.median(without)
    # The fields alone, without the HTTP round: row_fields over the 500 rows on one open.
    from hermes_cli.web_routers.profiles import _open_session_db_at_path

    db = _open_session_db_at_path(clocked_500 / "state.db", read_only=True)
    try:
        listed = db.list_sessions_rich(limit=500, offset=0, order_by_last_active=True, compact_rows=True,
                                       include_pinned=True, include_archived=False, archived_only=False)
        samples = []
        for _ in range(7):
            started = time.perf_counter()
            for row in listed:
                real(db, row, time.time())
            samples.append((time.perf_counter() - started) * 1000)
    finally:
        db.close()
    direct = statistics.median(samples)
    print(f"\nP1.4 /sessions on 500 clocked rows: median {statistics.median(with_fields):.1f} ms with the fields, "
          f"{statistics.median(without):.1f} ms without (added {added:.1f} ms); row_fields alone {direct:.1f} ms")
    assert direct < 50


def test_p1_4_the_estimate_cost_first_and_warm(client, ctx, module):
    samples = []
    for _ in range(5):
        module.CACHE.clear()
        started = time.perf_counter()
        contexts(client, [ESTIMATE])
        samples.append((time.perf_counter() - started) * 1000)
    started = time.perf_counter()
    contexts(client, [ESTIMATE])
    hit = (time.perf_counter() - started) * 1000
    print(f"\nP1.4 /sessions/context, one id: computed median {statistics.median(samples):.2f} ms "
          f"(first {samples[0]:.2f} ms), cached {hit:.2f} ms")
