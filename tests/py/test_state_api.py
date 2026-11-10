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
    assert response.json() == {"schema": 1, "rev": 0, "settings": {"style": None, "snap": False}, "layouts": {}}


def test_positions_round_trip_and_push_event(client, state_file, events):
    body = {"style": "dense", "scope": "all", "mode": "set",
            "positions": [{"id": "st-sys-tip", "x": 10, "y": 20.5}, {"id": "group:__no_project__", "x": 0, "y": 0}]}
    response = patch_positions(client, body)
    assert response.status_code == 200, response.text
    assert response.json()["applied"] == 2 and response.json()["rev"] == 1
    layout = state(client).json()["layouts"]["dense"]["all"]
    assert (layout["st-sys-tip"]["x"], layout["st-sys-tip"]["y"]) == (10, 20.5)
    assert events == [("layout.changed", {"rev": 1, "profile": "default", "kind": "positions"})]


def test_if_absent_mode(client, state_file):
    patch_positions(client, {"style": "dense", "scope": "all", "mode": "set", "positions": [{"id": "st-sys-tip", "x": 1, "y": 1}]})
    response = patch_positions(client, {"style": "dense", "scope": "all", "mode": "if_absent",
                                        "positions": [{"id": "st-sys-tip", "x": 9, "y": 9}, {"id": "st-hp-root", "x": 2, "y": 2}]})
    assert (response.json()["applied"], response.json()["skipped"]) == (1, 1)
    layout = state(client).json()["layouts"]["dense"]["all"]
    assert layout["st-sys-tip"]["x"] == 1 and layout["st-hp-root"]["x"] == 2


def test_since_rev_answers_unchanged_without_the_layouts(client, state_file):
    patch_positions(client, {"style": "dense", "scope": "all", "mode": "set", "positions": [{"id": "st-sys-tip", "x": 1, "y": 1}]})
    assert state(client, since_rev=1).json() == {"schema": 1, "rev": 1, "unchanged": True}
    assert "layouts" in state(client, since_rev=0).json()


def test_settings_patch_and_read_back(client, state_file, events):
    response = client.patch(f"{PREFIX}/settings", params={"session_profile": "default"}, json={"style": "dense", "snap": True})
    assert response.status_code == 200, response.text
    assert response.json()["settings"] == {"style": "dense", "snap": True}
    assert state(client, "work").json()["settings"] == {"style": "dense", "snap": True}  # global, not per profile
    assert events[-1] == ("layout.changed", {"rev": 1, "profile": "*", "kind": "settings"})


def test_delete_then_put_restores_the_layout(client, state_file, events):
    patch_positions(client, {"style": "dense", "scope": "/p/x", "mode": "set",
                             "positions": [{"id": "st-sys-tip", "x": 1, "y": 2}, {"id": "st-hp-root", "x": 3, "y": 4}]})
    deleted = client.delete(f"{PREFIX}/state/layout", params={"session_profile": "default", "style": "dense", "scope": "/p/x"})
    assert deleted.status_code == 200, deleted.text
    removed = deleted.json()["removed"]
    assert set(removed) == {"st-sys-tip", "st-hp-root"}
    assert "dense" not in state(client).json()["layouts"]
    restore = [{"id": block, "x": entry["x"], "y": entry["y"]} for block, entry in removed.items()]
    put = client.put(f"{PREFIX}/state/layout", params={"session_profile": "default"},
                     json={"style": "dense", "scope": "/p/x", "positions": restore})
    assert put.status_code == 200, put.text
    layout = state(client).json()["layouts"]["dense"]["/p/x"]
    assert {block: (entry["x"], entry["y"]) for block, entry in layout.items()} == {"st-sys-tip": (1, 2), "st-hp-root": (3, 4)}
    assert [payload["kind"] for _name, payload in events] == ["positions", "rearrange", "restore"]


def test_forget_endpoint(client, state_file, events):
    patch_positions(client, {"style": "dense", "scope": "all", "mode": "set", "positions": [{"id": "st-sys-tip", "x": 1, "y": 1}]})
    response = client.post(f"{PREFIX}/state/forget", params={"session_profile": "default"}, json={"ids": ["st-sys-tip"]})
    assert response.status_code == 200 and response.json()["removed"] == 1
    assert state(client).json()["layouts"] == {}
    assert events[-1][1]["kind"] == "forget"
    assert client.post(f"{PREFIX}/state/forget", params={"session_profile": "default"}, json={"ids": []}).status_code == 400


def test_prune_on_serving_drops_deleted_sessions_and_keeps_archived_ones(client, state_file, manifest):
    archived = manifest["archived"][0]
    positions = [{"id": "st-sys-tip", "x": 1, "y": 1}, {"id": "st-never-existed", "x": 2, "y": 2},
                 {"id": "work/st-never-existed", "x": 3, "y": 3}, {"id": "missing:default/st-deleted-parent", "x": 4, "y": 4},
                 {"id": "group:__no_project__", "x": 0, "y": 0}, {"id": archived, "x": 5, "y": 5}]
    patch_positions(client, {"style": "dense", "scope": "all", "mode": "set", "positions": positions})
    layout = state(client).json()["layouts"]["dense"]["all"]
    assert "st-never-existed" not in layout and "work/st-never-existed" not in layout
    assert {"st-sys-tip", "missing:default/st-deleted-parent", "group:__no_project__"} <= set(layout)
    assert archived in layout
    # Pruned on disk too.
    on_disk = json.loads(state_file.read_text("utf-8"))["layouts"]["default"]["dense"]["all"]
    assert "st-never-existed" not in on_disk


def test_prune_in_the_all_profiles_view(client, state_file, manifest):
    work_id = "st-work-0000"  # seed_profile("work", 3)
    positions = [{"id": "st-sys-tip", "x": 1, "y": 1}, {"id": "st-never-existed", "x": 2, "y": 2},
                 {"id": work_id, "x": 3, "y": 3}, {"id": f"work/{work_id}", "x": 4, "y": 4},
                 {"id": f"default/{work_id}", "x": 5, "y": 5}]
    patch_positions(client, {"style": "dense", "scope": "all", "mode": "set", "positions": positions}, profile="*")
    layout = state(client, "*").json()["layouts"]["dense"]["all"]
    assert "st-sys-tip" in layout and "st-never-existed" not in layout
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
                                    "positions": [{"id": "st-sys-tip", "x": 1, "y": 1}]}).status_code == 200


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
    patch_positions(client, {"style": "dense", "scope": "all", "mode": "set", "positions": [{"id": "st-sys-tip", "x": 1, "y": 1}]})
    client.patch(f"{PREFIX}/settings", params={"session_profile": "default"}, json={"snap": True})
    client.delete(f"{PREFIX}/state/layout", params={"session_profile": "default", "style": "dense", "scope": "all"})
    state(client)
    assert _fingerprint(hermes_home) == before
