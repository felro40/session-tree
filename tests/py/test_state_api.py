"""The layout store's HTTP surface in ``dashboard/plugin_api.py`` (card 4): ``/state``,
``/state/positions``, ``/settings``, ``/state/layout``. Against the seeded tmp Hermes home."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from conftest import PREFIX


@pytest.fixture
def state_file(plugin_api, hermes_home: Path):
    path = plugin_api._state_store().path
    for leftover in path.parent.glob("state.json*"):
        leftover.unlink()
    yield path
    for leftover in path.parent.glob("state.json*"):
        leftover.unlink()


@pytest.fixture
def events(plugin_api, monkeypatch):
    sent: list[tuple[str, dict]] = []
    monkeypatch.setattr(plugin_api, "_emit_plugin_event", lambda name, payload: sent.append((name, payload)))
    return sent


def state(client, profile="default", **params):
    return client.get(f"{PREFIX}/state", params={"session_profile": profile, **params})


def patch_positions(client, body, profile="default"):
    return client.patch(f"{PREFIX}/state/positions", params={"session_profile": profile}, json=body)


def test_the_state_file_lives_in_the_hermes_root_outside_the_package(plugin_api, hermes_home, state_file):
    assert state_file == hermes_home / "session-tree" / "state.json"


def test_get_state_of_a_fresh_install(client, state_file):
    response = state(client)
    assert response.status_code == 200
    assert response.json() == {"schema": 1, "epoch": "none", "rev": 0, "settings": {"style": None, "snap": False}, "layouts": {},
                               "read_only": False}


def test_positions_round_trip_and_push_event(client, state_file, events):
    body = {"style": "dense", "scope": "all", "mode": "set",
            "positions": [{"id": "st-split-root", "x": 10, "y": 20.5}, {"id": "group:__no_project__", "x": 0, "y": 0}]}
    response = patch_positions(client, body)
    assert response.status_code == 200, response.text
    assert response.json()["applied"] == 2 and response.json()["rev"] == 1
    layout = state(client).json()["layouts"]["dense"]["all"]
    assert (layout["st-split-root"]["x"], layout["st-split-root"]["y"]) == (10, 20.5)
    epoch = response.json()["epoch"]
    assert len(epoch) == 16 and epoch not in ("none", "legacy")
    assert events == [("layout.changed", {"epoch": epoch, "rev": 1, "profile": "default", "kind": "positions"})]


def test_if_absent_mode(client, state_file):
    patch_positions(client, {"style": "dense", "scope": "all", "mode": "set", "positions": [{"id": "st-split-root", "x": 1, "y": 1}]})
    response = patch_positions(client, {"style": "dense", "scope": "all", "mode": "if_absent",
                                        "positions": [{"id": "st-split-root", "x": 9, "y": 9}, {"id": "st-hp-root", "x": 2, "y": 2}]})
    assert (response.json()["applied"], response.json()["skipped"]) == (1, 1)
    layout = state(client).json()["layouts"]["dense"]["all"]
    assert layout["st-split-root"]["x"] == 1 and layout["st-hp-root"]["x"] == 2


def test_since_rev_answers_unchanged_without_the_layouts(client, state_file):
    epoch = patch_positions(client, {"style": "dense", "scope": "all", "mode": "set", "positions": [{"id": "st-split-root", "x": 1, "y": 1}]}).json()["epoch"]
    assert state(client, since_rev=1, epoch=epoch).json() == {"schema": 1, "epoch": epoch, "rev": 1, "unchanged": True}
    assert "layouts" in state(client, since_rev=0, epoch=epoch).json()
    # NB2 of the card-4 review: a rev alone is not enough (a fresh file restarts it at 0).
    assert "layouts" in state(client, since_rev=1).json()
    assert "layouts" in state(client, since_rev=1, epoch="0123456789abcdef").json()


def test_settings_patch_and_read_back(client, state_file, events):
    response = client.patch(f"{PREFIX}/settings", params={"session_profile": "default"}, json={"style": "dense", "snap": True})
    assert response.status_code == 200, response.text
    assert response.json()["settings"] == {"style": "dense", "snap": True}
    assert state(client, "work").json()["settings"] == {"style": "dense", "snap": True}  # global, not per profile
    assert events[-1] == ("layout.changed", {"epoch": response.json()["epoch"], "rev": 1, "profile": "*", "kind": "settings"})


def test_delete_then_put_restores_the_layout(client, state_file, events):
    patch_positions(client, {"style": "dense", "scope": "/p/x", "mode": "set",
                             "positions": [{"id": "st-split-root", "x": 1, "y": 2}, {"id": "st-hp-root", "x": 3, "y": 4}]})
    deleted = client.delete(f"{PREFIX}/state/layout", params={"session_profile": "default", "style": "dense", "scope": "/p/x"})
    assert deleted.status_code == 200, deleted.text
    removed = deleted.json()["removed"]
    assert set(removed) == {"st-split-root", "st-hp-root"}
    assert "dense" not in state(client).json()["layouts"]
    restore = [{"id": block, "x": entry["x"], "y": entry["y"]} for block, entry in removed.items()]
    put = client.put(f"{PREFIX}/state/layout", params={"session_profile": "default"},
                     json={"style": "dense", "scope": "/p/x", "positions": restore})
    assert put.status_code == 200, put.text
    layout = state(client).json()["layouts"]["dense"]["/p/x"]
    assert {block: (entry["x"], entry["y"]) for block, entry in layout.items()} == {"st-split-root": (1, 2), "st-hp-root": (3, 4)}
    assert [payload["kind"] for _name, payload in events] == ["positions", "rearrange", "restore"]


def test_forget_endpoint(client, state_file, events):
    patch_positions(client, {"style": "dense", "scope": "all", "mode": "set", "positions": [{"id": "st-split-root", "x": 1, "y": 1}]})
    response = client.post(f"{PREFIX}/state/forget", params={"session_profile": "default"}, json={"ids": ["st-split-root"]})
    assert response.status_code == 200 and response.json()["removed"] == 1
    assert state(client).json()["layouts"] == {}
    assert events[-1][1]["kind"] == "forget"
    assert client.post(f"{PREFIX}/state/forget", params={"session_profile": "default"}, json={"ids": []}).status_code == 400


def test_prune_on_serving_drops_deleted_sessions_and_keeps_archived_ones(client, state_file, manifest):
    archived = manifest["archived"][0]
    positions = [{"id": "st-split-root", "x": 1, "y": 1}, {"id": "st-never-existed", "x": 2, "y": 2},
                 {"id": "work/st-never-existed", "x": 3, "y": 3}, {"id": "missing:default/st-deleted-parent", "x": 4, "y": 4},
                 {"id": "group:__no_project__", "x": 0, "y": 0}, {"id": archived, "x": 5, "y": 5}]
    patch_positions(client, {"style": "dense", "scope": "all", "mode": "set", "positions": positions})
    layout = state(client).json()["layouts"]["dense"]["all"]
    assert "st-never-existed" not in layout and "work/st-never-existed" not in layout
    assert {"st-split-root", "missing:default/st-deleted-parent", "group:__no_project__"} <= set(layout)
    assert archived in layout
    # Pruned on disk too.
    on_disk = json.loads(state_file.read_text("utf-8"))["layouts"]["default"]["dense"]["all"]
    assert "st-never-existed" not in on_disk


def test_prune_in_the_all_profiles_view(client, state_file, manifest):
    work_id = "st-work-0000"  # seed_profile("work", 3)
    positions = [{"id": "st-split-root", "x": 1, "y": 1}, {"id": "st-never-existed", "x": 2, "y": 2},
                 {"id": work_id, "x": 3, "y": 3}, {"id": f"work/{work_id}", "x": 4, "y": 4},
                 {"id": f"default/{work_id}", "x": 5, "y": 5}]
    patch_positions(client, {"style": "dense", "scope": "all", "mode": "set", "positions": positions}, profile="*")
    layout = state(client, "*").json()["layouts"]["dense"]["all"]
    assert "st-split-root" in layout and "st-never-existed" not in layout
    assert work_id in layout and f"work/{work_id}" in layout and f"default/{work_id}" not in layout


def test_a_corrupt_state_file_serves_an_empty_state_and_keeps_a_bak(client, state_file):
    state_file.parent.mkdir(parents=True, exist_ok=True)
    state_file.write_bytes(b'{"schema": 1, "rev": 4, "layo')
    response = state(client)
    assert response.status_code == 200
    assert response.json()["layouts"] == {} and response.json()["rev"] == 0
    backups = list(state_file.parent.glob("state.json.corrupt-*.bak"))
    assert len(backups) == 1 and backups[0].read_bytes() == b'{"schema": 1, "rev": 4, "layo'
    assert patch_positions(client, {"style": "dense", "scope": "all", "mode": "set",
                                    "positions": [{"id": "st-split-root", "x": 1, "y": 1}]}).status_code == 200


@pytest.mark.parametrize("profile,status", [("nope", 404), ("../x", 400), ("", 400)])
@pytest.mark.parametrize("call", [
    lambda c, p: c.get(f"{PREFIX}/state", params={"session_profile": p}),
    lambda c, p: c.patch(f"{PREFIX}/state/positions", params={"session_profile": p},
                         json={"style": "dense", "scope": "all", "mode": "set", "positions": []}),
    lambda c, p: c.patch(f"{PREFIX}/settings", params={"session_profile": p}, json={"snap": True}),
    lambda c, p: c.delete(f"{PREFIX}/state/layout", params={"session_profile": p, "style": "dense", "scope": "all"}),
    lambda c, p: c.put(f"{PREFIX}/state/layout", params={"session_profile": p}, json={"style": "dense", "scope": "all", "positions": []}),
])
def test_state_endpoints_refuse_unknown_and_malformed_profiles(client, state_file, call, profile, status):
    assert call(client, profile).status_code in (status, 422)
    assert not state_file.exists()


@pytest.mark.parametrize("body", [
    {"style": "dense", "scope": "all", "mode": "set", "positions": [{"id": "a", "x": "1", "y": 2}]},
    {"style": "dense", "scope": "all", "mode": "sometimes", "positions": []},
    {"style": "Dense", "scope": "all", "mode": "set", "positions": []},
    {"style": "dense", "scope": "all", "mode": "set", "positions": [{"id": "a", "x": 1, "y": 2}], "extra": 1},
    {"style": "dense", "scope": "", "mode": "set", "positions": []},
    {"style": "dense", "scope": "all", "mode": "set", "positions": [{"id": "a\u0000", "x": 1, "y": 2}]},
    {"style": "dense", "scope": "all", "mode": "set", "positions": [{"id": "a", "x": 1e9, "y": 2}]},
])
def test_positions_input_is_validated(client, state_file, body):
    assert patch_positions(client, body).status_code in (400, 422)
    assert not state_file.exists()


def test_non_finite_coordinates_in_the_raw_body_are_refused(client, state_file):
    raw = '{"style": "dense", "scope": "all", "mode": "set", "positions": [{"id": "a", "x": NaN, "y": Infinity}]}'
    response = client.patch(f"{PREFIX}/state/positions", params={"session_profile": "default"}, content=raw,
                            headers={"content-type": "application/json"})
    assert response.status_code in (400, 422)
    assert not state_file.exists()


def test_batch_cap_is_413(client, state_file, plugin_api):
    big = [{"id": f"b{i}", "x": i, "y": i} for i in range(plugin_api.layout_store.MAX_BATCH + 1)]
    assert patch_positions(client, {"style": "dense", "scope": "all", "mode": "set", "positions": big}).status_code == 413


def test_settings_input_is_validated(client, state_file):
    for body in ({"style": "no spaces"}, {"snap": "on"}, {}, {"colour": 1}):
        assert client.patch(f"{PREFIX}/settings", params={"session_profile": "default"}, json=body).status_code in (400, 422)
    assert not state_file.exists()


def test_layout_writes_never_touch_the_session_store(client, state_file, hermes_home):
    from test_plugin_api import _fingerprint

    state(client)
    before = _fingerprint(hermes_home)
    patch_positions(client, {"style": "dense", "scope": "all", "mode": "set", "positions": [{"id": "st-split-root", "x": 1, "y": 1}]})
    client.patch(f"{PREFIX}/settings", params={"session_profile": "default"}, json={"snap": True})
    client.delete(f"{PREFIX}/state/layout", params={"session_profile": "default", "style": "dense", "scope": "all"})
    state(client)
    assert _fingerprint(hermes_home) == before


# --- compression lineages through real SessionDB rows (card-4 review B2 + NB3) ------------------

@pytest.fixture(scope="module")
def lineage(manifest, hermes_home: Path):
    """An own two-segment conversation (root ended ``compression``, an open tip), so compacting
    it does not change the shared fixtures."""
    import sys

    seeder = sys.modules["session_tree_seed_fixtures"]
    db = seeder.SessionDB(db_path=hermes_home / "state.db")
    try:
        s = seeder.Seeder(db, "default")
        s.session("st-b2-root", "B2 lineage", project="syscanvas", age_h=50, end_reason="compression")
        s.session("st-b2-tip", "B2 lineage", project="syscanvas", age_h=40, parent="st-b2-root", ended=False, titled=False)
    finally:
        db.close()
    return {"seeder": seeder, "root": "st-b2-root", "tip": "st-b2-tip"}


def _row(client, sid_or_root):
    rows = client.get(f"{PREFIX}/sessions", params={"session_profile": "default"}).json()["sessions"]
    return next(row for row in rows if sid_or_root in (row["id"], row.get("_lineage_root_id")))


def _points(layout):
    return {block: (entry["x"], entry["y"]) for block, entry in layout.items()}


def test_the_listing_names_a_compacted_block_by_its_tip_and_reports_the_lineage_root(client, lineage):
    # Where the page's layout key comes from: the core list's ``_lineage_root_id``.
    row = _row(client, lineage["root"])
    assert row["id"] == lineage["tip"] and row["_lineage_root_id"] == lineage["root"]


def test_migration_a_position_stored_under_an_old_tip_key_comes_back_under_the_root_key(client, state_file, lineage):
    patch_positions(client, {"style": "dense", "scope": "all", "mode": "set",
                             "positions": [{"id": lineage["tip"], "x": 125.6, "y": 2.4}]})
    served = state(client).json()["layouts"]["dense"]["all"]
    assert _points(served) == {lineage["root"]: (125.6, 2.4)}
    on_disk = json.loads(state_file.read_text("utf-8"))["layouts"]["default"]["dense"]["all"]
    assert set(on_disk) == {lineage["root"]}


def test_a_compaction_keeps_the_root_key_and_a_stale_member_key_is_folded_in_newest_first(client, state_file, lineage, events):
    patch_positions(client, {"style": "dense", "scope": "all", "mode": "set",
                             "positions": [{"id": lineage["root"], "x": 300, "y": 40}]})
    done = lineage["seeder"].compact(lineage["tip"], "st-b2-seg3")
    assert done["created"] and done["root"] == lineage["root"] and done["lineage"][-1] == "st-b2-seg3"
    assert _row(client, lineage["root"])["id"] == "st-b2-seg3"  # the block's tip id changed
    # The root key stays put across the compaction (prune keeps a root key).
    assert _points(state(client).json()["layouts"]["dense"]["all"]) == {lineage["root"]: (300, 40)}
    # An old window still keyed by the former tip (now a middle segment) saves later: the newer
    # entry wins, under the root key; the member key never survives a served state.
    patch_positions(client, {"style": "dense", "scope": "all", "mode": "set",
                             "positions": [{"id": lineage["tip"], "x": 5, "y": 6}]})
    assert _points(state(client).json()["layouts"]["dense"]["all"]) == {lineage["root"]: (5, 6)}
    assert events[-1][1]["kind"] == "prune"
    on_disk = json.loads(state_file.read_text("utf-8"))["layouts"]["default"]["dense"]["all"]
    assert set(on_disk) == {lineage["root"]}


def test_a_newer_schema_file_is_served_read_only_and_writes_answer_409_newer_schema(client, state_file):
    state_file.parent.mkdir(parents=True, exist_ok=True)
    original = '{"schema":2,"rev":3,"settings":{"style":"dense","snap":false},"layouts":{},"extra":{}}'
    state_file.write_text(original, encoding="utf-8")
    served = state(client).json()
    assert served["read_only"] is True and served["store_schema"] == 2
    response = patch_positions(client, {"style": "dense", "scope": "all", "mode": "if_absent",
                                        "positions": [{"id": "st-split-root", "x": 1, "y": 1}]})
    assert response.status_code == 409 and response.json()["detail"].startswith("newer_schema: ")
    assert state_file.read_text("utf-8") == original


def test_the_poll_is_unchanged_only_for_the_same_epoch_after_the_file_is_recreated(client, state_file):
    first = patch_positions(client, {"style": "dense", "scope": "all", "mode": "set",
                                     "positions": [{"id": "st-split-root", "x": 1, "y": 1}]}).json()
    state_file.unlink()
    second = patch_positions(client, {"style": "dense", "scope": "all", "mode": "set",
                                      "positions": [{"id": "st-hp-root", "x": 2, "y": 2}]}).json()
    # The same rev (1) under a new epoch: a window holding the old file's rev 1 gets the layouts.
    assert first["rev"] == second["rev"] == 1 and first["epoch"] != second["epoch"]
    assert "layouts" in state(client, since_rev=1, epoch=first["epoch"]).json()
    assert state(client, since_rev=1, epoch=second["epoch"]).json()["unchanged"] is True
