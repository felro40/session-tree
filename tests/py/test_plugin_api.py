"""Backend tests for dashboard/plugin_api.py against an isolated, seeded Hermes home."""

from __future__ import annotations

import hashlib
from pathlib import Path

import pytest

from conftest import PREFIX

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
    # A pinned row past the window is back-filled like the core list, so >= 5 before the cut.
    assert len(body["sessions"]) == 5 and body["limit"] == 5 and body["truncated"] is True
    capped = get(client, "/sessions", session_profile="*", limit=999999).json()
    assert capped["limit"] == 2000 and capped["truncated"] is False
    assert get(client, "/sessions", session_profile="default", limit=0).status_code == 422
    assert get(client, "/sessions", session_profile="default", limit="many").status_code == 422


def test_rows_are_most_recent_first(client):
    rows = rows_of(client, session_profile="default")
    recency = [row["last_active"] or row["started_at"] for row in rows]
    assert recency == sorted(recency, reverse=True)


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
    assert _fingerprint(hermes_home) == before


def test_router_exposes_only_reads(plugin_api):
    methods = {method for route in plugin_api.router.routes for method in getattr(route, "methods", set())}
    assert methods <= {"GET", "HEAD"}
