"""Card 11: the kept-on-canvas markers (``kept.json`` beside ``state.json``).

The store on its own (validation and caps, atomic writes, two processes at once, prune, a
corrupt or newer file), the ``POST /state/kept`` endpoint against the seeded tmp Hermes home
(unknown profiles refused, a missing session refused, prune on serving, the push), and the
compatibility promise: after marker writes, the base commit's ``dashboard/layout_store.py``
still loads ``state.json`` unchanged, and ``state.json`` keeps the schema-1 shape.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

from conftest import PREFIX, REPO, _load

store_mod = _load("session_tree_layout_store_kept_test", REPO / "dashboard" / "layout_store.py")
LayoutStore = store_mod.LayoutStore
StoreError = store_mod.StoreError

#: The commit card 11 was cut from: its layout store predates ``kept.json``.
BASE_COMMIT = "5d660bed5129d3fbf217b3ac67b90dcdf2a06ded"
SCHEMA1_KEYS = {"schema", "epoch", "rev", "settings", "layouts"}


@pytest.fixture
def store(tmp_path: Path):
    return LayoutStore(tmp_path / "session-tree" / "state.json")


def alive_of(ids_by_owner):
    """An ``existing`` callback: per owner, the ids that exist (each its own lineage root)."""
    def existing(candidates):
        return {key: {sid: sid for sid in ids if sid in ids_by_owner.get(key, set())} for key, ids in candidates.items()}
    return existing


# --- the store ------------------------------------------------------------------------------

def test_keep_writes_kept_json_and_bumps_only_the_state_revision(store):
    store.upsert_positions("default", "dense", "all", [{"id": "a", "x": 1, "y": 2}])
    before = json.loads(store.path.read_text("utf-8"))
    result = store.keep_sessions("default", ["s1", "s2", "s1"])
    assert result["changed"] and result["added"] == 2 and result["rev"] == before["rev"] + 1
    after = json.loads(store.path.read_text("utf-8"))
    # state.json: the same keys and content, only rev moved.
    assert set(after) == SCHEMA1_KEYS
    assert {**after, "rev": before["rev"]} == before
    kept = json.loads(store.kept_path.read_text("utf-8"))
    assert set(kept) == {"schema", "kept"} and kept["schema"] == store_mod.KEPT_SCHEMA_VERSION
    assert set(kept["kept"]["default"]) == {"s1", "s2"}
    assert all(set(entry) == {"created_at"} for entry in kept["kept"]["default"].values())
    assert store.kept_snapshot("default") == {"default": ["s1", "s2"]}


def test_keeping_a_kept_session_again_changes_nothing(store):
    store.keep_sessions("default", ["s1"])
    rev = store.revision()
    again = store.keep_sessions("default", ["s1"])
    assert not again["changed"] and again["rev"] == rev and again["added"] == 0


def test_the_snapshot_of_a_profile_shows_its_own_markers_and_all_profiles_shows_every_owner(store):
    store.keep_sessions("default", ["d1"])
    store.keep_sessions("work", ["w1"])
    assert store.kept_snapshot("default") == {"default": ["d1"]}
    assert store.kept_snapshot("work") == {"work": ["w1"]}
    assert store.kept_snapshot("*") == {"default": ["d1"], "work": ["w1"]}
    assert store.kept_snapshot("scale") == {}


@pytest.mark.parametrize("profile", ["*", "", "Bad", "a/b", None, 7])
def test_a_marker_needs_one_named_profile(store, profile):
    with pytest.raises(StoreError) as caught:
        store.keep_sessions(profile, ["s1"])
    assert caught.value.status == 400


@pytest.mark.parametrize("ids", [[], "s1", [""], ["a/b"], ["-x"], ["x" * 201], [None], [1], ["a\nb"]])
def test_ids_are_validated(store, ids):
    with pytest.raises(StoreError) as caught:
        store.keep_sessions("default", ids)
    assert caught.value.status == 400
    assert not store.kept_path.exists()


def test_caps(store, monkeypatch):
    with pytest.raises(StoreError) as caught:
        store.keep_sessions("default", [f"s{i}" for i in range(store_mod.MAX_KEPT_BATCH + 1)])
    assert caught.value.status == 413
    monkeypatch.setattr(store_mod, "MAX_KEPT_PER_PROFILE", 3)
    store.keep_sessions("default", ["a", "b"])
    with pytest.raises(StoreError) as caught:
        store.keep_sessions("default", ["c", "d"])
    assert caught.value.status == 413
    assert store.kept_snapshot("default") == {"default": ["a", "b"]}
    monkeypatch.setattr(store_mod, "MAX_PROFILES", 1)
    with pytest.raises(StoreError) as caught:
        store.keep_sessions("work", ["w"])
    assert caught.value.status == 413


def test_a_failed_write_leaves_both_files_as_they_were(store, monkeypatch):
    store.keep_sessions("default", ["s1"])
    kept_before = store.kept_path.read_bytes()
    state_before = store.path.read_bytes()
    real = os.replace

    def failing(src, dst):
        if str(dst) == str(store.kept_path):
            raise OSError("disk full")
        return real(src, dst)

    monkeypatch.setattr(store_mod.os, "replace", failing)
    with pytest.raises(OSError):
        store.keep_sessions("default", ["s2"])
    monkeypatch.setattr(store_mod.os, "replace", real)
    assert store.kept_path.read_bytes() == kept_before and store.path.read_bytes() == state_before
    # No temp file is left behind.
    assert not list(store.path.parent.glob(".kept.json.tmp-*"))


def test_a_stale_temp_file_is_removed_by_the_next_writer(store):
    store.keep_sessions("default", ["s1"])
    stale = store.kept_path.with_name(".kept.json.tmp-999-dead")
    stale.write_bytes(b'{"schema": 1, "ke')
    store.keep_sessions("default", ["s2"])
    assert not stale.exists()
    assert store.kept_snapshot("default") == {"default": ["s1", "s2"]}


def test_a_corrupt_kept_file_is_moved_aside_and_reads_as_empty(store):
    store.path.parent.mkdir(parents=True, exist_ok=True)
    store.kept_path.write_text('{"schema": 1, "kept": {"default": {"s1": {"created_at": 1, "extra": 2}}}}', "utf-8")
    assert store.kept_snapshot("default") == {}
    assert len(list(store.path.parent.glob("kept.json.corrupt-*.bak"))) == 1
    store.keep_sessions("default", ["s2"])
    assert store.kept_snapshot("default") == {"default": ["s2"]}


def test_a_newer_kept_file_reads_as_empty_and_is_never_overwritten(store):
    store.path.parent.mkdir(parents=True, exist_ok=True)
    newer = b'{"schema": 2, "kept": {}, "more": true}'
    store.kept_path.write_bytes(newer)
    assert store.kept_snapshot("default") == {}
    with pytest.raises(StoreError) as caught:
        store.keep_sessions("default", ["s1"])
    assert caught.value.status == 409 and caught.value.detail.startswith(store_mod.KEPT_NEWER_CODE)
    assert store.prune_kept("default", alive_of({})) == 0
    assert store.kept_path.read_bytes() == newer


WRITER = r"""
import importlib.util, sys
spec = importlib.util.spec_from_file_location("st_store_kept_writer", sys.argv[1])
mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
store = mod.LayoutStore(__import__("pathlib").Path(sys.argv[2]))
tag, count = sys.argv[3], int(sys.argv[4])
for i in range(count):
    store.keep_sessions("default", [f"{tag}-{i}"])
    store.upsert_positions("default", "dense", "all", [{"id": f"{tag}-{i}", "x": i, "y": 0}])
"""


def test_two_processes_lose_no_marker_and_no_position(store, tmp_path):
    script = tmp_path / "writer.py"
    script.write_text(WRITER, "utf-8")
    store.path.parent.mkdir(parents=True, exist_ok=True)
    count = 40
    procs = [subprocess.Popen([sys.executable, "-I", str(script), str(store_mod.__file__), str(store.path), tag, str(count)],
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True) for tag in ("A", "B")]
    for proc in procs:
        _out, err = proc.communicate(timeout=120)
        assert proc.returncode == 0, err
    wanted = {f"{tag}-{i}" for tag in "AB" for i in range(count)}
    assert set(store.kept_snapshot("default")["default"]) == wanted
    assert set(store.snapshot("default")["layouts"]["dense"]["all"]) == wanted
    assert store.revision() == 4 * count


def test_prune_drops_the_markers_of_sessions_that_no_longer_exist(store):
    store.keep_sessions("default", ["alive", "gone"])
    store.keep_sessions("work", ["w-gone"])
    assert store.prune_kept("default", alive_of({"default": {"alive"}})) == 1
    assert store.kept_snapshot("*") == {"default": ["alive"], "work": ["w-gone"]}
    # The All profiles view prunes every owner.
    assert store.prune_kept("*", alive_of({"default": {"alive"}})) == 1
    assert store.kept_snapshot("*") == {"default": ["alive"]}
    # Nothing to drop: no write, no new revision.
    rev = store.revision()
    assert store.prune_kept("*", alive_of({"default": {"alive"}})) == 0 and store.revision() == rev


def test_prune_moves_a_lineage_member_to_the_root_key_and_skips_an_unknown_answer(store):
    store.keep_sessions("default", ["tip"])
    assert store.prune_kept("default", lambda candidates: None) == 0
    assert store.prune_kept("default", lambda candidates: {"default": {"tip": "root"}}) == 1
    assert store.kept_snapshot("default") == {"default": ["root"]}


def test_prune_leaves_a_read_only_state_alone(store):
    store.keep_sessions("default", ["gone"])
    store.path.write_text('{"schema": 2, "rev": 1, "settings": {}, "layouts": {}}', "utf-8")
    assert store.prune_kept("default", alive_of({})) == 0
    assert store.kept_snapshot("default") == {"default": ["gone"]}


# --- compatibility with the base commit's store ---------------------------------------------

def _base_store_module(tmp_path: Path):
    source = subprocess.run(["git", "-C", str(REPO), "show", f"{BASE_COMMIT}:dashboard/layout_store.py"],
                            capture_output=True, text=True, check=True).stdout
    assert "kept.json" not in source  # the store from before card 11
    path = tmp_path / "base_layout_store.py"
    path.write_text(source, "utf-8")
    return _load("session_tree_layout_store_base_commit", path)


def test_the_base_commits_store_loads_state_json_unchanged_after_marker_writes(store, tmp_path):
    store.upsert_positions("default", "dense", "all", [{"id": "a", "x": 1, "y": 2}, {"id": "group:p", "x": 0, "y": 0}])
    store.set_settings({"style": "dense", "snap": True})
    store.keep_sessions("default", ["a", "b"])
    store.keep_sessions("work", ["w"])
    raw = json.loads(store.path.read_text("utf-8"))
    assert set(raw) == SCHEMA1_KEYS and raw["schema"] == 1
    for styles in raw["layouts"].values():
        for scopes in styles.values():
            for blocks in scopes.values():
                assert all(set(entry) == {"x", "y", "updated_at"} for entry in blocks.values())
    # On a copy: the base build reads it as it is, moves nothing aside and serves the same state.
    copy_dir = tmp_path / "copy" / "session-tree"
    copy_dir.mkdir(parents=True)
    for name in ("state.json", "kept.json"):
        (copy_dir / name).write_bytes((store.path.parent / name).read_bytes())
    original = (copy_dir / "state.json").read_bytes()
    base = _base_store_module(tmp_path).LayoutStore(copy_dir / "state.json")
    assert base.read() == store.read()
    assert base.snapshot("default") == store.snapshot("default")
    assert (copy_dir / "state.json").read_bytes() == original
    assert not list(copy_dir.glob("*.bak"))
    # And it keeps writing it as before; the markers stay for this build.
    base.upsert_positions("default", "dense", "all", [{"id": "c", "x": 3, "y": 3}])
    assert not list(copy_dir.glob("*.bak"))
    assert LayoutStore(copy_dir / "state.json").kept_snapshot("*") == {"default": ["a", "b"], "work": ["w"]}


# --- the endpoint ---------------------------------------------------------------------------

@pytest.fixture
def state_file(plugin_api, hermes_home: Path):
    path = plugin_api._state_store().path

    def clear():
        for pattern in ("state.json*", "backups.json*", "kept.json*"):
            for leftover in path.parent.glob(pattern):
                leftover.unlink()

    clear()
    yield path
    clear()


@pytest.fixture
def events(plugin_api, monkeypatch):
    sent: list[tuple[str, dict]] = []
    monkeypatch.setattr(plugin_api, "_emit_plugin_event", lambda name, payload: sent.append((name, payload)))
    return sent


def keep(client, ids, profile="default"):
    return client.post(f"{PREFIX}/state/kept", params={"session_profile": profile}, json={"ids": ids})


def state(client, profile="default"):
    return client.get(f"{PREFIX}/state", params={"session_profile": profile})


def test_keep_round_trip_in_the_profile_and_all_profiles_views_and_the_push(client, state_file, events):
    assert "kept" not in state(client).json()  # none yet: the key is absent (an older page sees no change)
    response = keep(client, ["st-split-root"])
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["changed"] and body["added"] == 1
    assert events[-1] == ("layout.changed", {"epoch": body["epoch"], "rev": body["rev"], "profile": "*", "kind": "kept"})
    assert state(client).json()["kept"] == {"default": ["st-split-root"]}
    assert state(client, "*").json()["kept"] == {"default": ["st-split-root"]}
    assert "kept" not in state(client, "work").json()
    work = keep(client, ["st-work-0000"], profile="work")
    assert work.status_code == 200, work.text
    assert state(client, "*").json()["kept"] == {"default": ["st-split-root"], "work": ["st-work-0000"]}
    # Kept again: nothing changes, nothing is pushed.
    count = len(events)
    assert keep(client, ["st-split-root"]).json()["changed"] is False and len(events) == count


@pytest.mark.parametrize("profile, status", [("*", 400), ("nobody", 404), ("Bad Name", 400)])
def test_keep_refuses_all_profiles_and_unknown_or_malformed_profiles(client, state_file, profile, status):
    assert keep(client, ["st-split-root"], profile=profile).status_code == status
    assert not state_file.with_name("kept.json").exists()


@pytest.mark.parametrize("body, status", [({"ids": ["st-never-existed"]}, 404), ({"ids": []}, 400), ({"ids": ["a/b"]}, 400),
                                          ({"ids": [f"s{i}" for i in range(101)]}, 413), ({"ids": "st-split-root"}, 422),
                                          ({"ids": ["st-split-root"], "extra": 1}, 422)])
def test_keep_validates_its_input_and_needs_a_stored_session(client, state_file, body, status):
    response = client.post(f"{PREFIX}/state/kept", params={"session_profile": "default"}, json=body)
    assert response.status_code == status, response.text
    assert not state_file.with_name("kept.json").exists()


def test_serving_the_state_prunes_the_markers_of_sessions_that_no_longer_exist(client, state_file, plugin_api, events):
    keep(client, ["st-split-root"])
    # A marker whose session is gone (deleted, or removed by "Delete empty sessions").
    plugin_api._state_store().keep_sessions("default", ["st-never-existed"])
    plugin_api._state_store().keep_sessions("work", ["st-never-existed"])
    assert state(client).json()["kept"] == {"default": ["st-split-root"]}
    assert events[-1][1]["kind"] == "prune"
    assert state(client, "*").json()["kept"] == {"default": ["st-split-root"]}
    on_disk = json.loads(state_file.with_name("kept.json").read_text("utf-8"))
    assert on_disk["kept"] == {"default": {"st-split-root": on_disk["kept"]["default"]["st-split-root"]}}


def test_keeping_never_touches_the_session_store(client, state_file, hermes_home):
    from test_plugin_api import _fingerprint

    state(client)
    before = _fingerprint(hermes_home)
    keep(client, ["st-split-root"])
    state(client)
    assert _fingerprint(hermes_home) == before
