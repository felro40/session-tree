"""Card 6 fix r1 (review r1 B1): the excerpt has a bounded cost on pathological 200 KB messages.

The old ``plain_text`` ran lazy patterns over the whole message: from every opener without a closer
(``_x``, ``**x``, ``[x``, …) they scanned to the end, so 200 KB of ``_x `` took 73 s and a 200 KB
pasted-code message 8 s through the real API. Now the input is capped (``INPUT_MAX``) and every
pattern is linear; these tests hold both, through ``plain_text``, every compiled pattern on the
*uncapped* body, ``details`` and the endpoint.

The bodies are ``scripts/seed-fixtures.py``'s ``PATHOLOGICAL`` (the e2e seeds the same ones), in a
home of their own served as an extra profile ``patho``.
"""

from __future__ import annotations

import re
import statistics
import sys
import time
from pathlib import Path
from typing import Any

import pytest

from conftest import PREFIX, REPO, _load

PATHO = "patho"
#: The card's per-id bar (ms of processing per id), and the 100-id request's wall bar (s).
PER_ID_MS = 50
HUNDRED_S = 2.0


@pytest.fixture(scope="module")
def seeder(manifest):
    return sys.modules.get("session_tree_seed_fixtures") or _load("session_tree_seed_fixtures", REPO / "scripts" / "seed-fixtures.py")


@pytest.fixture(scope="module")
def patho_home(tmp_path_factory, seeder) -> Path:
    home = tmp_path_factory.mktemp("patho-home")
    db = seeder.SessionDB(db_path=home / "state.db")
    try:
        seeder.seed_pathological(db)                                  # st-patho-<name>
        seeder.seed_pathological(db, prefix="st-p100", copies=5)      # 5 × 20 = 100 ids
    finally:
        db.close()
    return home


@pytest.fixture()
def patho(monkeypatch, plugin_api, patho_home):
    original = plugin_api._profile_targets
    monkeypatch.setattr(plugin_api, "_profile_targets", lambda: [*original(), (PATHO, patho_home)])
    return patho_home


def _ms(fn, runs: int = 3) -> tuple[float, Any]:
    samples, out = [], None
    for _ in range(runs):
        started = time.perf_counter()
        out = fn()
        samples.append((time.perf_counter() - started) * 1000)
    return statistics.median(samples), out


#: ``PATHOLOGICAL``'s names (the seeder itself is loaded by the fixtures, once the home is set up).
NAMES = ["underscore", "strong", "star", "strike", "bracket", "link-open", "backtick", "angle", "fence",
         "pasted-code", "strong-under", "image-open", "comment-open", "autolink-open", "think-open",
         "tool-call-open", "blanks", "heading-tail", "dashes", "table"]


@pytest.fixture(scope="module")
def bodies(seeder) -> dict[str, str]:
    assert list(seeder.PATHOLOGICAL) == NAMES
    return seeder.PATHOLOGICAL


@pytest.mark.parametrize("name", NAMES)
def test_plain_text_on_a_200_kb_pathological_body_is_under_50_ms(plugin_api, bodies, name):
    sd = plugin_api.session_details
    body = bodies[name]
    assert len(body) >= 200_000
    ms, out = _ms(lambda: sd.plain_text(body))
    print(f"\nplain_text {name}: {ms:.2f} ms -> {out[:40]!r}")
    assert ms < PER_ID_MS
    excerpt = sd.clip(out)
    assert len(excerpt) <= sd.EXCERPT_MAX
    assert not re.search(r"<[!/]?[A-Za-z][^<>]*>", excerpt), excerpt  # never a tag


def test_every_pattern_is_linear_even_on_the_uncapped_body(plugin_api, bodies):
    # Without the cap: a quadratic pattern takes seconds (the old ones 8–73 s) at 200 KB; a linear
    # one milliseconds (a bounded span costs at most SPAN steps per opener).
    sd = plugin_api.session_details
    patterns = {name: value for name, value in vars(sd).items() if isinstance(value, re.Pattern)}
    patterns.update({f"_EMPHASIS[{i}]": p for i, p in enumerate(sd._EMPHASIS)})
    assert len(patterns) >= 20
    worst: dict[str, tuple[float, str]] = {}
    for pname, pattern in patterns.items():
        for name, body in bodies.items():
            started = time.perf_counter()
            pattern.sub(" ", body)
            ms = (time.perf_counter() - started) * 1000
            if ms > worst.get(pname, (0.0, ""))[0]:
                worst[pname] = (ms, name)
    print("\nworst per pattern on an uncapped 200 KB body:", {k: f"{v[0]:.1f} ms ({v[1]})" for k, v in worst.items()})
    assert all(ms < 1000 for ms, _ in worst.values()), worst


def test_normal_content_keeps_its_plain_text(plugin_api):
    plain = plugin_api.session_details.plain_text
    assert plain("**bold** and *it* and _under_ and __strong__ and ~~gone~~") == "bold and it and under and strong and gone"
    assert plain("use `a_b` and ``x ` y``") == "use a_b and x ` y"
    assert plain("_snake_case words_ stay") == "snake_case words stay"
    assert plain("see [the docs](https://e.x/a_(b)) now") == "see the docs now"
    assert plain("<!-- note --> visible") == "visible"
    assert plain("# Title #\n\n- [x] done") == "Title done"
    # A fence cut open (by the cap, or a truncated message) keeps its code as text.
    assert plain("```js\nconst a = 1") == "const a = 1"


def test_links_with_parentheses_and_reference_definitions(plugin_api):
    # r1 N2: the target may hold one level of parentheses; a reference definition is not text.
    plain = plugin_api.session_details.plain_text
    assert plain("[click me](javascript:alert(document.domain)) raw anchor") == "click me raw anchor"
    assert plain("see [one][1]\n\n[1]: javascript:alert(4)") == "see one"


def test_the_cap_leaves_a_cut_payload_inert(plugin_api):
    sd = plugin_api.session_details
    # A tool-call payload cut by the cap is dropped (no closer: to the end), a tag cut open goes.
    assert sd.plain_text("Running it. <tool_call>" + "{\"cmd\": \"x\"} " * 2000 + "</tool_call> after") == "Running it."
    cut = "a" * (sd.INPUT_MAX - 10) + ' <img src=x onerror="alert(1)">'
    assert sd.plain_text(cut).endswith("a") and "onerror" not in sd.plain_text(cut)
    assert sd.plain_text("x" * 300_000) == "x" * sd.INPUT_MAX


@pytest.mark.parametrize("name", NAMES)
def test_one_id_with_a_pathological_last_message_is_under_50_ms_per_id(client, patho, plugin_api, name):
    from hermes_cli.web_routers.profiles import _open_session_db_at_path

    sid = f"st-patho-{name}"
    ro = _open_session_db_at_path(patho / "state.db", read_only=True)
    try:
        processing, got = _ms(lambda: plugin_api.session_details.details(ro, [sid], time.time(), 0))
    finally:
        ro.close()
    wall, response = _ms(lambda: client.post(f"{PREFIX}/sessions/details", json={"profile": PATHO, "ids": [sid]}))
    print(f"\n{name}: processing {processing:.2f} ms/id, endpoint {wall:.2f} ms")
    assert response.status_code == 200
    assert response.json()["details"][sid]["excerpt"] == got[sid]["excerpt"]
    assert got[sid]["excerpt_role"] in {"assistant", "user"}
    assert processing < PER_ID_MS


def test_100_ids_each_with_a_200_kb_pathological_last_message_in_one_request_under_2_s(client, patho):
    ids = [f"st-p100-{copy}-{name}" for copy in range(5) for name in NAMES]
    assert len(ids) == 100
    client.post(f"{PREFIX}/sessions/details", json={"profile": PATHO, "ids": ids[:1]})  # warm the open
    started = time.perf_counter()
    response = client.post(f"{PREFIX}/sessions/details", json={"profile": PATHO, "ids": ids})
    wall = time.perf_counter() - started
    print(f"\n100 pathological ids in one request: {wall * 1000:.0f} ms")
    assert response.status_code == 200 and len(response.json()["details"]) == 100
    assert wall < HUNDRED_S
