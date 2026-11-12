"""Backend tests for dashboard/plugin_api.py against an isolated, seeded Hermes home."""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import time
from pathlib import Path

import pytest

from conftest import PREFIX, REPO

#: The SessionInfo fields /sessions must carry (card 1: lineage, flags, place, figures, text).
REQUIRED_FIELDS = {
    # lineage
    "id", "_branched_from", "_reset_from", "parent_session_id", "_lineage_root_id", "compacted_segments",
    # flags
    "is_internal_child", "source", "archived", "pinned", "unread", "is_active",
    # place
    "cwd", "git_repo_root", "profile",
    # figures
    "input_tokens", "output_tokens", "cache_read_tokens", "cache_write_tokens", "reasoning_tokens",
    "estimated_cost_usd", "actual_cost_usd", "model", "message_count", "tool_call_count",
    "started_at", "last_active",
    # text
    "title", "preview",
}


def get(client, path: str, **params):
    return client.get(f"{PREFIX}{path}", params=params)


def rows_of(client, **params) -> list[dict]:
    response = get(client, "/sessions", **params)
    assert response.status_code == 200, response.text
    return response.json()["sessions"]


def by_id(rows: list[dict]) -> dict[str, dict]:
    return {row["id"]: row for row in rows}


# --- /health ---------------------------------------------------------------------------------

def test_health_answers_for_a_known_profile(client):
    response = get(client, "/health", session_profile="default")
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True and body["plugin"] == "session-tree"
    assert body["profiles"] == ["default"]


def test_health_all_profiles(client):
    body = get(client, "/health", session_profile="*").json()
    assert {"default", "work", "scale"} <= set(body["profiles"])


@pytest.mark.parametrize("path", ["/health", "/sessions"])
def test_unknown_profile_is_refused(client, path):
    assert get(client, path, session_profile="nope").status_code == 404


@pytest.mark.parametrize("profile", ["../default", "DEFAULT", "a b", "x" * 65, ""])
@pytest.mark.parametrize("path", ["/health", "/sessions"])
def test_malformed_profile_is_refused(client, path, profile):
    assert get(client, path, session_profile=profile).status_code in (400, 422)


@pytest.mark.parametrize("path", ["/health", "/sessions"])
def test_profile_is_required(client, path):
    assert client.get(f"{PREFIX}{path}").status_code == 422


@pytest.mark.parametrize("path", ["/health", "/sessions"])
def test_gateway_profile_key_is_not_the_data_selector(client, path):
    # ``?profile=`` is the gateway's plugin-route profile selector (the Webapp sets it on every
    # ctx.rest call); the backend only reads ``session_profile``.
    assert get(client, path, profile="default").status_code == 422
    assert get(client, path, profile="nope", session_profile="default").status_code == 200


# --- /sessions: field set and lineage ---------------------------------------------------------

def test_every_row_carries_the_session_info_fields(client):
    rows = rows_of(client, session_profile="default")
    assert rows
    for row in rows:
        missing = REQUIRED_FIELDS - row.keys()
        assert not missing, f"{row['id']} lacks {sorted(missing)}"
        assert "system_prompt" not in row and "model_config" not in row  # heavy fields stripped


def test_branch_reset_and_compression_lineage(client, manifest):
    rows = by_id(rows_of(client, session_profile="default"))
    assert rows["st-sys-comments"]["_branched_from"] == "st-sys-tip"
    assert rows["st-sys-reply"]["_branched_from"] == "st-sys-comments"
    assert rows["st-sys-mcp"]["_branched_from"] == "st-sys-seg2"
    assert rows["st-md-v2"]["_reset_from"] == "st-md-tip"
    assert rows["st-md-v2"]["parent_session_id"] == "st-md-tip"

    compressed = manifest["compressed"]
    tip = rows[compressed["tip"]]
    assert tip["_lineage_root_id"] == compressed["root"]
    assert tip["_lineage_ids"] == compressed["lineage"]
    assert tip["compacted_segments"] == 3
    assert tip["title"] == "Hierarchical subsystems design"
    # Earlier segments are folded into the tip, never listed on their own.
    for segment in compressed["lineage"][:-1]:
        assert segment not in rows
    assert rows["st-md-tip"]["compacted_segments"] == 1
    assert rows["st-hp-root"]["compacted_segments"] == 0


def test_orphaned_branch_child_keeps_its_marker(client, manifest):
    rows = by_id(rows_of(client, session_profile="default"))
    orphan = manifest["orphan"]
    assert manifest["orphan"]["deleted_parent"] not in rows
    assert rows[orphan["child"]]["_branched_from"] == orphan["deleted_parent"]


def test_flags_and_raw_machine_sources(client):
    rows = by_id(rows_of(client, session_profile="default"))
    # Raw rows: the graph model (not the backend) hides cron/kanban/tool sessions.
    assert rows["st-hidden-cron"]["source"] == "cron"
    assert rows["st-hidden-kanban"]["source"] == "kanban"
    assert rows["st-hidden-tool"]["source"] == "tool"
    # The core listing never surfaces delegate_task runs (sessions.show_subagents is off).
    assert "st-hidden-delegate" not in rows
    assert all(row["is_internal_child"] is False for row in rows.values())
    assert rows["st-hp-root"]["pinned"] is True
    assert isinstance(rows["st-sys-pairing"]["is_active"], bool)
    assert rows["st-sys-comments"]["git_repo_root"].endswith("/syscanvas")
    assert rows["st-sys-comments"]["profile"] == "default"
    assert rows["st-sys-comments"]["message_count"] == 6
    assert rows["st-sys-comments"]["input_tokens"] == 12000
    assert rows["st-sys-comments"]["preview"].startswith("Let's work on")


# --- /sessions: archived, profiles, limit -----------------------------------------------------

def test_archived_hidden_by_default_and_included_on_request(client, manifest):
    default_ids = set(by_id(rows_of(client, session_profile="default")))
    with_archived = by_id(rows_of(client, session_profile="default", include_archived="true"))
    for sid in manifest["archived"]:
        assert sid not in default_ids
        assert with_archived[sid]["archived"] is True
    assert set(with_archived) - default_ids == set(manifest["archived"])


def test_profile_filtering(client):
    default_rows = rows_of(client, session_profile="default")
    work_rows = rows_of(client, session_profile="work")
    every = rows_of(client, session_profile="*")
    assert {row["profile"] for row in default_rows} == {"default"}
    assert {row["profile"] for row in work_rows} == {"work"} and len(work_rows) == 3
    assert {"default", "work", "scale"} <= {row["profile"] for row in every}
    assert len(every) == len(default_rows) + len(work_rows) + len(rows_of(client, session_profile="scale"))


def test_limit_caps_and_reports_truncation(client):
    response = get(client, "/sessions", session_profile="default", limit=5)
    body = response.json()
    # The only pinned row (st-hp-root, 2 h old) is among the 5 most recent, so nothing is
    # back-filled past the window here (see the limit=3 test below for the back-fill).
    assert len(body["sessions"]) == 5 and body["limit"] == 5 and body["truncated"] is True
    capped = get(client, "/sessions", session_profile="*", limit=999999).json()
    assert capped["limit"] == 2000 and capped["truncated"] is False
    assert get(client, "/sessions", session_profile="default", limit=0).status_code == 422
    assert get(client, "/sessions", session_profile="default", limit="many").status_code == 422


def test_rows_are_most_recent_first(client):
    rows = rows_of(client, session_profile="default")
    recency = [row["last_active"] or row["started_at"] for row in rows]
    assert recency == sorted(recency, reverse=True)


def test_pinned_row_past_the_limit_is_back_filled(client):
    # Card-1 review item 1: the window is the core ``_pinned_window``, not a plain cut. The 3 most
    # recent rows are st-sys-pairing, st-hp-mockup and st-hp-routing; the pinned st-hp-root (2 h)
    # is past them and must still arrive, after the window.
    body = get(client, "/sessions", session_profile="default", limit=3).json()
    ids = [row["id"] for row in body["sessions"]]
    assert ids[:3] == ["st-sys-pairing", "st-hp-mockup", "st-hp-routing"]
    assert "st-hp-root" in ids and ids.index("st-hp-root") >= 3
    assert body["sessions"][ids.index("st-hp-root")]["pinned"] is True
    assert body["truncated"] is True


def _visible_ids(rows: list[dict]) -> list[str]:
    """The desktop half's own ``visibleRows`` (src/model/sessions.ts), run by node."""
    node = os.environ.get("SESSION_TREE_NODE")
    if not node:
        pytest.fail("SESSION_TREE_NODE is not set (scripts/run-pytest.sh passes it)")
    out = subprocess.run([node, str(REPO / "tests" / "py" / "visible-rows-cli.ts")], input=json.dumps(rows),
                         capture_output=True, text=True, timeout=60, check=True)
    return json.loads(out.stdout)


def test_delegate_child_is_flagged_and_dropped_by_visible_rows(client, hermes_home):
    # Card-1 review item 2: with ``sessions.show_subagents: true`` the core listing includes
    # delegate_task runs; the backend flags them and the graph model's visibleRows drops them.
    config = hermes_home / "config.yaml"
    original = config.read_text(encoding="utf-8")
    try:
        config.write_text(original + "sessions:\n  show_subagents: true\n", encoding="utf-8")
        later = time.time_ns() + 5_000_000_000
        os.utime(config, ns=(later, later))  # a fresh mtime for any mtime-keyed config cache
        rows = rows_of(client, session_profile="default")
    finally:
        config.write_text(original, encoding="utf-8")
        latest = time.time_ns() + 10_000_000_000
        os.utime(config, ns=(latest, latest))
    delegate = by_id(rows).get("st-hidden-delegate")
    assert delegate is not None, "show_subagents did not surface the delegate run"
    assert delegate["is_internal_child"] is True
    assert all(row["is_internal_child"] is False for row in rows if row["id"] != "st-hidden-delegate")
    visible = _visible_ids(rows)
    assert "st-hidden-delegate" not in visible
    assert "st-hp-root" in visible
    # Back to the default shape: the delegate run is gone again.
    assert "st-hidden-delegate" not in by_id(rows_of(client, session_profile="default"))


# --- read-only --------------------------------------------------------------------------------

def _fingerprint(home: Path) -> dict[str, tuple]:
    out = {}
    for db in [home / "state.db", home / "profiles" / "work" / "state.db"]:
        for path in (db, Path(f"{db}-wal")):
            if path.exists():
                st = path.stat()
                out[str(path)] = (st.st_mtime_ns, st.st_size, hashlib.sha256(path.read_bytes()).hexdigest())
    return out


def test_reads_never_write_the_session_store(client, hermes_home):
    rows_of(client, session_profile="*")  # warm: any one-time open work happens before the baseline
    before = _fingerprint(hermes_home)
    assert before
    for params in ({"session_profile": "default"}, {"session_profile": "*", "include_archived": "true"}, {"session_profile": "work"}):
        rows_of(client, **params)
    get(client, "/health", session_profile="*")
    # The session actions' reads: the fence snapshot and the export.
    get(client, "/sessions/st-sys-tip/mutation-snapshot", session_profile="default")
    get(client, "/sessions/st-sys-tip/export", session_profile="default")
    assert _fingerprint(hermes_home) == before


def test_router_mutations_are_only_the_fenced_session_actions(plugin_api):
    # Card 3: the only state.db writes are rename, read state, archive and delete, each through the
    # core's own fenced mutation path (``_mutate_session_request`` / ``delete_session_endpoint``).
    # Card 4 adds the layout store's writes, which touch only the plugin's own state.json
    # (``test_state_api.py::test_layout_writes_never_touch_the_session_store``). Card 6's
    # ``POST /sessions/details`` is a read (the id list is a body): ``test_details_are_read_only``.
    writes = sorted((route.path, method) for route in plugin_api.router.routes
                    for method in getattr(route, "methods", set()) if method not in {"GET", "HEAD"})
    assert writes == [("/sessions/details", "POST"), ("/sessions/{session_id}/archive", "POST"), ("/sessions/{session_id}/delete", "POST"),
                      ("/sessions/{session_id}/read", "POST"), ("/sessions/{session_id}/rename", "POST"),
                      ("/settings", "PATCH"), ("/state/forget", "POST"), ("/state/layout", "DELETE"),
                      ("/state/layout", "PUT"), ("/state/layout/project", "PUT"), ("/state/positions", "PATCH")]


# --- session actions: rename, read state, export (card 3) -------------------------------------

def _auth() -> dict[str, str]:
    """The loopback session token a dashboard / Webapp request carries (the core identity check)."""
    from hermes_cli.web_server import _SESSION_HEADER_NAME, _SESSION_TOKEN

    return {_SESSION_HEADER_NAME: _SESSION_TOKEN}


def _snapshot(client, sid: str, profile: str = "default"):
    return client.get(f"{PREFIX}/sessions/{sid}/mutation-snapshot", params={"session_profile": profile}, headers=_auth())


def _fence(snapshot: dict) -> dict:
    import uuid

    return {"request_id": uuid.uuid4().hex, "expected_revision": snapshot["runtime_revision"],
            "expected_generation": snapshot["runtime_generation"]}


def _post(client, sid: str, action: str, body: dict, profile: str = "default"):
    return client.post(f"{PREFIX}/sessions/{sid}/{action}", params={"session_profile": profile}, json=body, headers=_auth())


def _stored(home: Path, sid: str) -> dict:
    """The row through Hermes's own read path (a read-only SessionDB)."""
    from hermes_state import SessionDB

    db = SessionDB(db_path=home / "state.db", read_only=True)
    try:
        return db.get_session(sid) or {}
    finally:
        db.close()


def test_rename_reads_back_and_a_stale_snapshot_is_refused(client, hermes_home):
    first = _snapshot(client, "st-single-05")
    assert first.status_code == 200, first.text
    snap = first.json()
    assert snap["exists"] is True
    renamed = _post(client, "st-single-05", "rename", {"title": "KaTeX subsetting plan", **_fence(snap)})
    assert renamed.status_code == 200, renamed.text
    assert renamed.json()["ok"] is True and renamed.json()["title"] == "KaTeX subsetting plan"
    assert _stored(hermes_home, "st-single-05")["title"] == "KaTeX subsetting plan"
    assert by_id(rows_of(client, session_profile="default"))["st-single-05"]["title"] == "KaTeX subsetting plan"
    # The revision moved on: an edit prepared from the old snapshot is refused by the core fence.
    assert _snapshot(client, "st-single-05").json()["runtime_revision"] > snap["runtime_revision"]
    stale = _post(client, "st-single-05", "rename", {"title": "Stale write", **_fence(snap)})
    assert stale.status_code == 409 and "revision_conflict" in stale.text
    assert _stored(hermes_home, "st-single-05")["title"] == "KaTeX subsetting plan"


def test_a_mutation_without_the_fence_is_refused_by_the_core_guard(client, hermes_home):
    response = _post(client, "st-single-06", "rename", {"title": "No fence"})
    assert response.status_code == 409
    assert _stored(hermes_home, "st-single-06")["title"] == "Zsh prompt cleanup"


def test_read_state_toggles_and_reads_back(client, hermes_home):
    from hermes_state import SessionDB

    marked = _post(client, "st-single-07", "read", {"unread": True, **_fence(_snapshot(client, "st-single-07").json())})
    assert marked.status_code == 200, marked.text
    assert by_id(rows_of(client, session_profile="default"))["st-single-07"]["unread"] is True
    db = SessionDB(db_path=hermes_home / "state.db", read_only=True)
    try:
        assert db.session_unread(db.get_session("st-single-07")) is True
    finally:
        db.close()
    read = _post(client, "st-single-07", "read", {"unread": False, **_fence(_snapshot(client, "st-single-07").json())})
    assert read.status_code == 200, read.text
    assert by_id(rows_of(client, session_profile="default"))["st-single-07"]["unread"] is False


def test_archive_unpins_reads_back_and_unarchive_restores(client, hermes_home):
    archived = _post(client, "st-hp-root", "archive", {"archived": True, **_fence(_snapshot(client, "st-hp-root").json())})
    assert archived.status_code == 200, archived.text
    stored = _stored(hermes_home, "st-hp-root")
    # The app's setSessionArchived: archiving also drops the pin (the auto-archive "keep" flag).
    assert stored["archived"] and not stored["pinned"]
    assert "st-hp-root" not in by_id(rows_of(client, session_profile="default"))
    assert by_id(rows_of(client, session_profile="default", include_archived="true"))["st-hp-root"]["archived"] is True
    restored = _post(client, "st-hp-root", "archive", {"archived": False, **_fence(_snapshot(client, "st-hp-root").json())})
    assert restored.status_code == 200, restored.text
    assert not _stored(hermes_home, "st-hp-root")["archived"]
    assert by_id(rows_of(client, session_profile="default"))["st-hp-root"]["archived"] is False


def test_delete_removes_the_row_keeps_its_branch_children_and_refuses_a_stale_fence(client, hermes_home):
    snap = _snapshot(client, "st-md-katex").json()
    # A stale fence first: the revision moves on with an edit, the delete prepared before it is refused.
    assert _post(client, "st-md-katex", "read", {"unread": True, **_fence(snap)}).status_code == 200
    stale = _post(client, "st-md-katex", "delete", _fence(snap))
    assert stale.status_code == 409 and "revision_conflict" in stale.text
    assert _stored(hermes_home, "st-md-katex")
    # st-md-tip has branch children (katex, redline) and a /new successor (v2).
    deleted = _post(client, "st-md-tip", "delete", _fence(_snapshot(client, "st-md-tip").json()))
    assert deleted.status_code == 200, deleted.text
    # The block's whole conversation goes (its compression chain), nothing that hangs off it.
    assert "st-md-tip" in deleted.json()["deleted_ids"]
    assert set(deleted.json()["deleted_ids"]) <= {"st-md-tip", "st-md-root"}
    assert _stored(hermes_home, "st-md-tip") == {}
    rows = by_id(rows_of(client, session_profile="default"))
    assert "st-md-tip" not in rows
    for child in ("st-md-katex", "st-md-redline"):
        assert rows[child]["_branched_from"] == "st-md-tip"  # orphaned, never cascaded
    # Already gone, no fence: the core guard answers first (409), not a plugin 404.
    assert _post(client, "st-md-tip", "delete", {}).status_code == 409


def test_delete_of_an_already_absent_row_is_the_core_idempotent_success(client, hermes_home):
    # NB3: no plugin-side 404 pre-check; the core DELETE decides, and an id that is already gone
    # answers {ok: true, already_absent: true} (hermes_cli/web_routers/sessions.py delete_session_endpoint).
    import uuid

    assert _stored(hermes_home, "st-orphan-parent") == {}  # deleted by the seeder
    gone = _post(client, "st-orphan-parent", "delete",
                 {"request_id": uuid.uuid4().hex, "expected_revision": 0, "expected_generation": 0})
    assert gone.status_code == 200, gone.text
    assert gone.json() == {"ok": True, "already_absent": True}
    # A row deleted elsewhere after the page read its fence (a new request): the same answer.
    snap = _snapshot(client, "st-single-11").json()
    first = _post(client, "st-single-11", "delete", _fence(snap))
    assert first.status_code == 200 and "st-single-11" in first.json()["deleted_ids"]
    again = _post(client, "st-single-11", "delete", _fence(snap))
    assert again.status_code == 200, again.text
    assert again.json() == {"ok": True, "already_absent": True}
    assert _stored(hermes_home, "st-single-11") == {}


def test_a_title_over_hermes_cap_is_refused_not_truncated(client, hermes_home):
    # NB2: the core refuses 101-400 characters (400 "Title too long"); the plugin refuses more
    # than 400 before Hermes sees it (422). Neither saves a cut title.
    before = _stored(hermes_home, "st-single-12")["title"]
    core = _post(client, "st-single-12", "rename", {"title": "x" * 150, **_fence(_snapshot(client, "st-single-12").json())})
    assert core.status_code == 400 and "Title too long" in core.json()["detail"], core.text
    ours = _post(client, "st-single-12", "rename", {"title": "y" * 5000, **_fence(_snapshot(client, "st-single-12").json())})
    assert ours.status_code == 422
    assert ours.json()["detail"][0]["type"] == "string_too_long" and ours.json()["detail"][0]["loc"][-1] == "title"
    assert _stored(hermes_home, "st-single-12")["title"] == before


def _core_export(sid: str) -> bytes:
    """The bytes the core ``GET /api/sessions/{id}/export`` sends, in-process."""
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from hermes_cli.web_routers.sessions import export_session_endpoint

    core = FastAPI()
    core.add_api_route("/api/sessions/{session_id}/export", export_session_endpoint, methods=["GET"])
    with TestClient(core) as core_client:
        theirs = core_client.get(f"/api/sessions/{sid}/export", params={"profile": "default"})
    assert theirs.status_code == 200, theirs.text
    return theirs.content


def _page_bytes(client, sid: str) -> bytes:
    """What the page writes to the file: the envelope's body, base64-decoded (decodeExportEnvelope)."""
    import base64
    import hashlib

    ours = client.get(f"{PREFIX}/sessions/{sid}/export", params={"session_profile": "default"})
    assert ours.status_code == 200, ours.text
    assert ours.headers["content-type"].startswith("application/json")
    envelope = ours.json()
    assert envelope["ok"] is True and envelope["session_id"] == sid and envelope["encoding"] == "base64"
    data = base64.b64decode(envelope["body"], validate=True)
    assert envelope["bytes"] == len(data) and envelope["sha256"] == hashlib.sha256(data).hexdigest()
    assert envelope["content_type"] == "application/json"
    return data


def test_export_bytes_equal_the_core_export_endpoint(client):
    for sid in ("st-sys-tip", "st-md-v2"):
        data = _page_bytes(client, sid)
        assert data == _core_export(sid)
        body = json.loads(data)
        assert body["id"] == sid and len(body["messages"]) == body["message_count"]


def test_export_keeps_a_whole_number_float_byte_for_byte(client, hermes_home):
    # B1: a parse + JSON.stringify round trip writes Python's 2.0 as 2; the envelope does not.
    seeder = sys.modules["session_tree_seed_fixtures"]
    made = seeder.add_branch("st-export-whole", "st-hp-root", "Whole-number cost", cost=2.0)
    assert made["created"] is True
    data = _page_bytes(client, "st-export-whole")
    assert data == _core_export("st-export-whole")
    assert b'"estimated_cost_usd":2.0' in data
    assert json.loads(data)["estimated_cost_usd"] == 2.0


def test_export_keeps_a_non_finite_float_byte_for_byte(client, hermes_home):
    # Hermes stores an infinite cost (NaN it cannot: SQLite turns it into NULL and the NOT NULL
    # usage column refuses it), and the core export writes it as ``Infinity``, which JSON.parse
    # refuses. The envelope still carries the exact bytes. The row is removed again afterwards.
    from hermes_state import SessionDB

    seeder = sys.modules["session_tree_seed_fixtures"]
    seeder.add_branch("st-export-inf", "st-hp-root", "Infinite cost", cost=float("inf"))
    try:
        data = _page_bytes(client, "st-export-inf")
        assert data == _core_export("st-export-inf")
        assert b'"estimated_cost_usd":Infinity' in data
    finally:
        db = SessionDB(db_path=hermes_home / "state.db")
        try:
            db.delete_session("st-export-inf")
        finally:
            db.close()
    assert _stored(hermes_home, "st-export-inf") == {}


@pytest.mark.parametrize("path,method,body", [
    ("/sessions/st-nope/mutation-snapshot", "GET", None),
    ("/sessions/st-nope/rename", "POST", {"title": "x"}),
    ("/sessions/st-nope/read", "POST", {"unread": True}),
    ("/sessions/st-nope/archive", "POST", {"archived": True}),
    ("/sessions/st-nope/export", "GET", None),
])
def test_actions_404_on_an_unknown_session(client, path, method, body):
    # Delete is not here: the core's delete of an absent id is an idempotent success (NB3).
    response = client.request(method, f"{PREFIX}{path}", params={"session_profile": "default"}, json=body, headers=_auth())
    assert response.status_code == 404


@pytest.mark.parametrize("profile,status", [("nope", 404), ("*", 400), ("../default", 400), ("x" * 65, 422)])
@pytest.mark.parametrize("path,method,body", [
    ("/sessions/st-single-08/mutation-snapshot", "GET", None),
    ("/sessions/st-single-08/rename", "POST", {"title": "x"}),
    ("/sessions/st-single-08/read", "POST", {"unread": True}),
    ("/sessions/st-single-08/archive", "POST", {"archived": True}),
    ("/sessions/st-single-08/delete", "POST", {}),
    ("/sessions/st-single-08/export", "GET", None),
])
def test_actions_refuse_an_unknown_or_malformed_profile(client, hermes_home, path, method, body, profile, status):
    response = client.request(method, f"{PREFIX}{path}", params={"session_profile": profile}, json=body, headers=_auth())
    assert response.status_code == status
    assert _stored(hermes_home, "st-single-08")["title"] == "Postgres vacuum tuning"


@pytest.mark.parametrize("action,body", [
    ("rename", {"title": "t" * 401}),
    ("rename", {"title": 5}),
    ("rename", {"title": "ok", "extra": 1}),
    ("rename", {"title": "ok", "expected_revision": -1}),
    ("rename", {"title": "ok", "request_id": "r" * 129}),
    ("read", {"unread": "yes"}),
    ("read", {}),
    ("archive", {"archived": 1}),
    ("archive", {}),
    ("delete", {"expected_generation": "x"}),
])
def test_action_input_is_validated(client, action, body):
    assert _post(client, "st-single-09", action, body).status_code == 422


def test_a_malformed_session_id_is_refused(client):
    assert _snapshot(client, "bad id!").status_code == 400
    assert client.get(f"{PREFIX}/sessions/{'a' * 201}/export", params={"session_profile": "default"}).status_code == 400
