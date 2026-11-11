"""Card 6 (Rich cards): ``POST /sessions/details`` — the excerpt and the 7-day activity.

The content cases run against their own small Hermes home (``rich_home``: a ``state.db`` seeded
through ``SessionDB`` with ``scripts/seed-fixtures.py``'s ``seed_rich``), served as an extra
profile ``rich`` through the plugin's profile targets; the shared default home is only read.
"""

from __future__ import annotations

import hashlib
import math
import statistics
import sys
import time
from pathlib import Path

import pytest

from conftest import PREFIX, REPO, _load

RICH = "rich"


@pytest.fixture(scope="module")
def seeder(manifest):
    return sys.modules.get("session_tree_seed_fixtures") or _load("session_tree_seed_fixtures", REPO / "scripts" / "seed-fixtures.py")


@pytest.fixture(scope="module")
def rich_home(tmp_path_factory, seeder) -> Path:
    home = tmp_path_factory.mktemp("rich-home")
    db = seeder.SessionDB(db_path=home / "state.db")
    try:
        seeder.seed_rich(db)
    finally:
        db.close()
    return home


@pytest.fixture()
def rich(monkeypatch, plugin_api, rich_home):
    """The plugin sees one more profile, ``rich``, whose home is ``rich_home``."""
    original = plugin_api._profile_targets
    monkeypatch.setattr(plugin_api, "_profile_targets", lambda: [*original(), (RICH, rich_home)])
    return rich_home


def post(client, body: dict):
    return client.post(f"{PREFIX}/sessions/details", json=body)


def details(client, ids: list[str], profile: str = RICH, tz: int = 0) -> dict:
    response = post(client, {"profile": profile, "ids": ids, "tz_offset_minutes": tz})
    assert response.status_code == 200, response.text
    return response.json()


def _write_db(seeder, home: Path):
    return seeder.SessionDB(db_path=home / "state.db")


# --- the excerpt --------------------------------------------------------------------------------

@pytest.mark.parametrize(("sid", "expected", "role"), [
    ("st-rich-markdown", "Plan Bold move: see the docs and run npm test. first item second item quoted line", "assistant"),
    ("st-rich-code", "Here is the fix: def add(a, b): return a + b Done.", "assistant"),
    ("st-rich-html", "Bold & italic link 2 < 3 > 1", "user"),
    ("st-rich-toolcall", "I'll run the tests.", "assistant"),
])
def test_excerpt_is_the_last_message_as_plain_text(client, rich, sid, expected, role):
    got = details(client, [sid])["details"][sid]
    assert got["excerpt"] == expected
    assert got["excerpt_role"] == role


def test_excerpt_is_never_raw_html_and_drops_tool_payloads(client, rich):
    got = details(client, ["st-rich-html", "st-rich-toolcall"])["details"]
    html = got["st-rich-html"]["excerpt"]
    import re

    assert not re.search(r"</?[A-Za-z]", html), html  # no tag (escaped ones neither)
    assert "alert" not in html and "&amp;" not in html and "onerror" not in html
    tool = got["st-rich-toolcall"]["excerpt"]
    # Neither the tool_calls payload, the inline <tool_call> block nor the tool result.
    assert "terminal" not in tool and "{" not in tool and "242 passed" not in tool


def test_a_very_long_message_is_clipped_to_240_characters(client, rich, seeder):
    got = details(client, ["st-rich-long"])["details"]["st-rich-long"]["excerpt"]
    assert len(got) <= 240 and got.endswith("…")
    assert got.startswith("word000 word001") and seeder.RICH_LONG.startswith(got[:-1])


def test_no_text_in_the_newest_messages_gives_no_excerpt_and_the_row_keeps_the_first_prompt(client, rich, seeder):
    # A long tool run: the newest rows (one paged read) are tool calls and results only, so there is
    # no excerpt; the page then shows the row's ``preview``, the first prompt.
    got = details(client, ["st-rich-toolrun"])["details"]["st-rich-toolrun"]
    assert got == {"excerpt": None, "excerpt_role": None, "activity": got["activity"]}
    rows = client.get(f"{PREFIX}/sessions", params={"session_profile": RICH}).json()["sessions"]
    row = next(row for row in rows if row["id"] == "st-rich-toolrun")
    assert row["preview"] == seeder.RICH_TOOL_PROMPT


def test_plain_text_rules(plugin_api):
    plain = plugin_api.session_details.plain_text
    assert plain([{"type": "text", "text": "**a**"}, {"type": "image_url", "image_url": {"url": "x"}}]) == "a"
    assert plain("<think>secret</think>visible") == "visible"
    assert plain("![alt](http://x/y.png) <https://example.com>") == "alt https://example.com"
    assert plain("| a | b |\n|---|---|\n| 1 | 2 |") == "a b 1 2"
    assert plain("~~old~~ new\n\n---\n\n1. one") == "old new one"
    assert plain(None) == "" and plain(42) == ""


# --- the activity -------------------------------------------------------------------------------

def _noonish_offset(now: float) -> int:
    """A non-zero offset (minutes) that puts local time near noon, so 'today' is well inside."""
    minutes = round((43200 - (now % 86400)) / 60)
    minutes = (minutes + 720) % 1440 - 720
    return minutes or 60


def test_activity_counts_per_local_day_across_a_day_boundary_and_an_offset(client, rich, seeder):
    now = time.time()
    tz = _noonish_offset(now)
    offset = tz * 60
    midnight = math.floor((now + offset) / 86400) * 86400 - offset  # today's local midnight, UTC
    db = _write_db(seeder, rich)
    try:
        db.create_session("st-act-days", "desktop", model="m")
        for role, ts in [("user", midnight - 6 * 86400 - 10),   # 7 days back: outside at tz
                         ("user", midnight - 6 * 86400 + 10),   # the first day
                         ("user", midnight - 60),               # yesterday, a minute before midnight
                         ("assistant", midnight + 60),          # today
                         ("tool", midnight + 30)]:              # not a user/assistant message
            db.append_message("st-act-days", role, "x", timestamp=ts)
    finally:
        db.close()
    at_tz = details(client, ["st-act-days"], tz=tz)
    assert at_tz["details"]["st-act-days"]["activity"] == [1, 0, 0, 0, 0, 1, 1]
    assert len(at_tz["days"]) == 7 and at_tz["tz_offset_minutes"] == tz
    # Two hours further east: the minute-before-midnight message is today, and the 7-days-back one
    # is inside the window's first day.
    east = details(client, ["st-act-days"], tz=tz + 120)["details"]["st-act-days"]["activity"]
    assert east == [2, 0, 0, 0, 0, 0, 2]


def test_activity_covers_the_compression_lineage_and_counts_a_carried_message_once(client, rich, seeder):
    now = time.time()
    db = _write_db(seeder, rich)
    try:
        db.create_session("st-act-root", "desktop", model="m")
        db.append_message("st-act-root", "user", "before compaction", timestamp=now - 60)
        tip = seeder.compact("st-act-root", "st-act-tip", db=db)["continuation"]
        # The continuation carries the root's message (same role and timestamp): counted once.
        db.append_message(tip, "user", "before compaction", timestamp=now - 60)
    finally:
        db.close()
    activity = details(client, [tip], tz=0)["details"][tip]["activity"]
    # The carried message once, plus the continuation's own "Continue after compaction".
    assert activity[-1] == 2 and sum(activity) == 2


# --- request rules -----------------------------------------------------------------------------

def test_unknown_ids_are_omitted_and_duplicates_answered_once(client, rich):
    got = details(client, ["st-rich-code", "st-nope", "st-rich-code"])
    assert list(got["details"]) == ["st-rich-code"]


def test_the_100_id_cap(client, rich):
    assert post(client, {"profile": RICH, "ids": [f"st-x-{i}" for i in range(100)]}).status_code == 200
    assert post(client, {"profile": RICH, "ids": [f"st-x-{i}" for i in range(101)]}).status_code == 422


@pytest.mark.parametrize(("body", "status"), [
    ({"profile": "nope", "ids": []}, 404),
    ({"profile": "../default", "ids": []}, 400),
    ({"profile": "*", "ids": []}, 400),
    ({"ids": []}, 422),
    ({"profile": "default", "ids": ["../etc"]}, 400),
    ({"profile": "default", "ids": [1]}, 422),
    ({"profile": "default", "ids": [], "tz_offset_minutes": 841}, 422),
    ({"profile": "default", "ids": [], "tz_offset_minutes": "60"}, 422),
    ({"profile": "default", "ids": [], "extra": True}, 422),
])
def test_input_is_validated(client, body, status):
    assert post(client, body).status_code == status


def test_default_profile_fixtures_answer(client, manifest):
    got = details(client, ["st-sys-tip", "st-single-00"], profile="default")["details"]
    assert got["st-sys-tip"]["excerpt"] == "Reply 3 about Hierarchical subsystems design."
    assert got["st-sys-tip"]["excerpt_role"] == "assistant"
    assert all(len(each["activity"]) == 7 and all(isinstance(n, int) and n >= 0 for n in each["activity"]) for each in got.values())


def _fingerprint(*homes: Path) -> dict[str, tuple]:
    out = {}
    for home in homes:
        for path in (home / "state.db", home / "state.db-wal"):
            if path.exists():
                st = path.stat()
                out[str(path)] = (st.st_mtime_ns, st.st_size, hashlib.sha256(path.read_bytes()).hexdigest())
    return out


def test_details_are_read_only(client, hermes_home, rich):
    details(client, ["st-sys-tip"], profile="default")  # warm: one-time open work first
    details(client, ["st-rich-code"])
    before = _fingerprint(hermes_home, rich)
    assert before
    details(client, ["st-sys-tip", "st-md-tip", "st-single-03"], profile="default", tz=330)
    details(client, ["st-rich-code", "st-rich-toolrun", "st-rich-long"], tz=-480)
    assert _fingerprint(hermes_home, rich) == before


# --- the per-id cost ---------------------------------------------------------------------------

def test_per_id_cost_on_a_5000_message_session_is_under_50_ms(client, rich, seeder, plugin_api):
    from hermes_cli.web_routers.profiles import _open_session_db_at_path

    now = time.time()
    db = _write_db(seeder, rich)
    try:
        db.create_session("st-big", "desktop", model="m")
        # 5,000 messages over the last 10 days, newest last.
        rows = [{"role": "user" if i % 2 == 0 else "assistant", "content": f"**message** {i} " + "text " * 20,
                 "timestamp": now - 10 * 86400 + i * (10 * 86400 / 5000)} for i in range(5000)]
        db.append_messages_batch("st-big", rows, chunk_rows=1000)
    finally:
        db.close()
    ro = _open_session_db_at_path(rich / "state.db", read_only=True)
    try:
        assert ro.get_session("st-big")["message_count"] == 5000
        samples = []
        for _ in range(7):
            started = time.perf_counter()
            got = plugin_api.session_details.details(ro, ["st-big"], now, 60)
            samples.append((time.perf_counter() - started) * 1000)
    finally:
        ro.close()
    per_id = statistics.median(samples)
    print(f"\nper-id details on a 5,000-message session: median {per_id:.2f} ms, max {max(samples):.2f} ms")
    assert got["st-big"]["excerpt"].startswith("message 4999")
    first_day = (math.floor((now + 3600) / 86400) - 6) * 86400 - 3600
    assert sum(got["st-big"]["activity"]) == sum(1 for row in rows if row["timestamp"] >= first_day)
    assert per_id < 50
    # Through the endpoint (one read-only open + the read), for the record.
    started = time.perf_counter()
    details(client, ["st-big"], tz=60)
    print(f"POST /sessions/details for it: {(time.perf_counter() - started) * 1000:.2f} ms")
