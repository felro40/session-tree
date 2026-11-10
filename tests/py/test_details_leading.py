"""Card 7 (card-6 review r2 NB1): a message that *starts* with a block the excerpt drops.

``plain_text`` reads only the first ``INPUT_MAX`` characters (review r1 B1). It used to apply that
cap before ``_DROP_BLOCKS``, so a leading ``<think>`` / ``<tool_call>`` / ``<style>`` / ``<script>``
block longer than the cap left nothing: ``'<think>' + 6.4 KB + '</think>The answer is 42.'`` gave
``''`` and the card fell back to an older message. Now leading dropped blocks are skipped first
(a bounded linear scan: an opener at the current position, its closer searched once), then the
cap applies to what follows. Every body is 200 KB; the B1 bounds still hold, through
``plain_text``, ``details`` and the endpoint.
"""

from __future__ import annotations

import statistics
import sys
import time
from pathlib import Path
from typing import Any

import pytest

from conftest import PREFIX, REPO, _load

PATHO = "patho"
#: The card's per-id bar (ms), as in test_details_bounds.py, and the target the review gave (~15 ms).
PER_ID_MS = 50
TARGET_MS = 15


@pytest.fixture(scope="module")
def seeder(manifest):
    return sys.modules.get("session_tree_seed_fixtures") or _load("session_tree_seed_fixtures", REPO / "scripts" / "seed-fixtures.py")


@pytest.fixture(scope="module")
def lead_home(tmp_path_factory, seeder) -> Path:
    home = tmp_path_factory.mktemp("lead-home")
    db = seeder.SessionDB(db_path=home / "state.db")
    try:
        seeder.seed_pathological(db)  # st-patho-<name> and st-patho-lead-<name>
    finally:
        db.close()
    return home


@pytest.fixture()
def lead(monkeypatch, plugin_api, lead_home):
    original = plugin_api._profile_targets
    monkeypatch.setattr(plugin_api, "_profile_targets", lambda: [*original(), (PATHO, lead_home)])
    return lead_home


def _ms(fn, runs: int = 3) -> tuple[float, Any]:
    samples, out = [], None
    for _ in range(runs):
        started = time.perf_counter()
        out = fn()
        samples.append((time.perf_counter() - started) * 1000)
    return statistics.median(samples), out


NAMES = ["think", "tool-call", "style-script", "many", "unclosed"]


def test_the_review_repro(plugin_api):
    plain = plugin_api.session_details.plain_text
    assert plain("<think>" + "x" * 6400 + "</think>The answer is 42.") == "The answer is 42."
    # Mixed case, attributes, blanks between blocks, the other names.
    assert plain("  <THINK reason='a'>" + "y" * 9000 + "</think >\n<tool_call>" + "{}" * 3000 + "</tool_call>Done.") == "Done."
    assert plain("<style>" + "a{}" * 3000 + "</style><script>" + ";" * 5000 + "</script> Shown") == "Shown"
    # Text before the block: unchanged behaviour (the cap may cut the block; what is before stays).
    assert plain("Hi <think>" + "z" * 9000 + "</think> there") == "Hi"
    # An unclosed leading block drops everything (as before): the caller falls back.
    assert plain("<think>" + "w" * 9000) == ""
    # More leading blocks than LEAD_BLOCKS_MAX: the scan stops (bounded); what is left is capped as before.
    sd = plugin_api.session_details
    many = "<think>a</think>" * (sd.LEAD_BLOCKS_MAX + 5) + "tail"
    assert sd._skip_leading_blocks(many) == len("<think>a</think>") * sd.LEAD_BLOCKS_MAX
    assert plain(many) == "tail"


def test_a_multimodal_list_skips_leading_blocks_in_its_first_text_part(plugin_api):
    plain = plugin_api.session_details.plain_text
    parts = [{"type": "text", "text": "<think>" + "r" * 8000 + "</think>"}, {"type": "image_url", "image_url": {"url": "x"}}, {"type": "text", "text": "Caption here"}]
    assert plain(parts) == "Caption here"
    assert plain([{"type": "text", "text": "<think>" + "r" * 8000 + "</think>Answer"}]) == "Answer"


@pytest.mark.parametrize("name", NAMES)
def test_plain_text_on_a_200_kb_leading_block_body(plugin_api, seeder, name):
    sd = plugin_api.session_details
    body = seeder.LEADING[name]
    assert len(body) >= 200_000
    ms, out = _ms(lambda: sd.plain_text(body))
    print(f"\nplain_text lead-{name}: {ms:.2f} ms -> {out[:40]!r}")
    assert ms < PER_ID_MS
    expected = seeder.LEADING_EXCERPT[name]
    assert out == ("" if name == "unclosed" else expected)


@pytest.mark.parametrize("name", NAMES)
def test_one_id_through_details_and_the_endpoint(client, lead, plugin_api, seeder, name):
    from hermes_cli.web_routers.profiles import _open_session_db_at_path

    sid = f"st-patho-lead-{name}"
    ro = _open_session_db_at_path(lead / "state.db", read_only=True)
    try:
        processing, got = _ms(lambda: plugin_api.session_details.details(ro, [sid], time.time(), 0))
    finally:
        ro.close()
    wall, response = _ms(lambda: client.post(f"{PREFIX}/sessions/details", json={"profile": PATHO, "ids": [sid]}))
    print(f"\nlead-{name}: processing {processing:.2f} ms/id, endpoint {wall:.2f} ms")
    assert response.status_code == 200
    answer = response.json()["details"][sid]
    assert answer["excerpt"] == seeder.LEADING_EXCERPT[name] == got[sid]["excerpt"]
    assert answer["excerpt_role"] == ("user" if name == "unclosed" else "assistant")
    assert processing < PER_ID_MS


def test_the_leading_bodies_with_the_other_pathological_ones_in_one_request(client, lead, seeder):
    ids = [f"st-patho-{name}" for name in seeder.PATHOLOGICAL] + [f"st-patho-lead-{name}" for name in NAMES]
    client.post(f"{PREFIX}/sessions/details", json={"profile": PATHO, "ids": ids[:1]})  # warm the open
    started = time.perf_counter()
    response = client.post(f"{PREFIX}/sessions/details", json={"profile": PATHO, "ids": ids})
    wall = (time.perf_counter() - started) * 1000
    per_id = wall / len(ids)
    print(f"\n{len(ids)} pathological ids (leading blocks included) in one request: {wall:.0f} ms, {per_id:.1f} ms/id")
    assert response.status_code == 200 and len(response.json()["details"]) == len(ids)
    assert per_id < TARGET_MS
