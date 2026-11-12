"""The synced layout store (card 4): ``dashboard/layout_store.py`` on its own, no Hermes needed.

Atomic writes against a killed writer, lost-update freedom across threads and processes, last
write wins per block, schema and size rejection, the corrupt-file backup, prune, and the
delete / restore round trip.
"""

from __future__ import annotations

import json
import os
import random
import signal
import subprocess
import sys
import threading
import time
from pathlib import Path

import pytest

from conftest import REPO, _load

store_mod = _load("session_tree_layout_store_test", REPO / "dashboard" / "layout_store.py")
LayoutStore = store_mod.LayoutStore
StoreError = store_mod.StoreError


@pytest.fixture
def store(tmp_path: Path):
    return LayoutStore(tmp_path / "session-tree" / "state.json")


def pos(entries):
    return [{"id": block, "x": x, "y": y} for block, x, y in entries]


# --- basics ---------------------------------------------------------------------------------

def test_empty_store_serves_a_valid_empty_state(store):
    snap = store.snapshot("default")
    assert snap == {"schema": store_mod.SCHEMA_VERSION, "epoch": "none", "rev": 0, "settings": {"style": None, "snap": False},
                    "layouts": {}, "read_only": False}
    assert not store.path.exists()  # a read writes nothing


def test_upsert_then_snapshot_per_profile_and_style(store):
    result = store.upsert_positions("default", "dense", "all", pos([("a", 1, 2), ("b", 3.5, -4)]))
    assert result["applied"] == 2 and result["rev"] == 1
    store.upsert_positions("work", "dense", "all", pos([("a", 9, 9)]))
    store.upsert_positions("default", "rich", "all", pos([("a", 5, 5)]))
    snap = store.snapshot("default")
    layout = snap["layouts"]["dense"]["all"]
    assert {k: (v["x"], v["y"]) for k, v in layout.items()} == {"a": (1, 2), "b": (3.5, -4)}
    assert snap["layouts"]["rich"]["all"]["a"]["x"] == 5
    assert store.snapshot("work")["layouts"]["dense"]["all"]["a"]["x"] == 9
    assert all(isinstance(entry["updated_at"], float) for entry in layout.values())
    # The file on disk is the documented shape, with the schema version.
    raw = json.loads(store.path.read_text("utf-8"))
    assert raw["schema"] == store_mod.SCHEMA_VERSION and raw["rev"] == 3
    assert raw["layouts"]["default"]["dense"]["all"]["b"]["y"] == -4


def test_if_absent_never_overwrites_a_stored_block(store):
    store.upsert_positions("default", "dense", "all", pos([("a", 1, 1)]))
    result = store.upsert_positions("default", "dense", "all", pos([("a", 50, 50), ("b", 2, 2)]), if_absent=True)
    assert result["applied"] == 1 and result["skipped"] == 1
    layout = store.snapshot("default")["layouts"]["dense"]["all"]
    assert (layout["a"]["x"], layout["b"]["x"]) == (1, 2)


def test_an_if_absent_batch_that_changes_nothing_does_not_bump_the_revision(store):
    store.upsert_positions("default", "dense", "all", pos([("a", 1, 1)]))
    result = store.upsert_positions("default", "dense", "all", pos([("a", 7, 7)]), if_absent=True)
    assert result["applied"] == 0 and result["rev"] == 1


def test_settings_patch(store):
    assert store.set_settings({"style": "dense"})["settings"] == {"style": "dense", "snap": False}
    assert store.set_settings({"snap": True})["settings"] == {"style": "dense", "snap": True}
    assert store.snapshot("default")["settings"] == {"style": "dense", "snap": True}


def test_delete_then_restore_round_trip(store):
    store.upsert_positions("default", "dense", "all", pos([("a", 1, 2), ("b", 3, 4)]))
    store.upsert_positions("default", "rich", "all", pos([("a", 7, 7)]))
    before = store.snapshot("default")["layouts"]["dense"]["all"]
    removed = store.delete_layout("default", "dense", "all")["removed"]
    assert removed == before
    snap = store.snapshot("default")
    assert "dense" not in snap["layouts"] and snap["layouts"]["rich"]["all"]["a"]["x"] == 7
    # Re-arrange then saves a fresh layout; Undo replaces it with what was removed.
    store.upsert_positions("default", "dense", "all", pos([("a", 100, 100), ("c", 5, 5)]))
    store.replace_layout("default", "dense", "all", [{"id": k, "x": v["x"], "y": v["y"]} for k, v in removed.items()])
    restored = store.snapshot("default")["layouts"]["dense"]["all"]
    assert {k: (v["x"], v["y"]) for k, v in restored.items()} == {"a": (1, 2), "b": (3, 4)}


def test_delete_of_an_empty_layout_removes_nothing(store):
    assert store.delete_layout("default", "dense", "all")["removed"] == {}


# --- backups (a Re-arrange keeps what it forgets) ---------------------------------------------

def layout_of(store, profile="default", style="dense", scope="all"):
    blocks = store.snapshot(profile)["layouts"].get(style, {}).get(scope, {})
    return {block: (entry["x"], entry["y"]) for block, entry in blocks.items()}


def test_a_rearrange_keeps_a_backup_that_restores_the_layout(store):
    store.upsert_positions("default", "dense", "all", pos([("a", 1, 2), ("b", 3, 4)]))
    deleted = store.delete_layout("default", "dense", "all")
    assert deleted["backup_id"]
    listing = store.list_backups("default", "dense", "all")
    assert [(each["id"], each["reason"], each["count"], each["project"]) for each in listing["backups"]] == [
        (deleted["backup_id"], "rearrange", 2, None)]
    assert listing["read_only"] is False
    # Card 10 (A8): one history per profile + style; the scope an older page names is ignored.
    assert store.list_backups("default", "dense", "p1")["backups"] == listing["backups"]
    assert store.list_backups("default", "dense")["backups"] == listing["backups"]
    # Another style or profile has none.
    assert store.list_backups("default", "rich", "all")["backups"] == []
    assert store.list_backups("work", "dense", "all")["backups"] == []
    backup = store.get_backup("default", deleted["backup_id"])
    assert (backup["style"], backup["scope"]) == ("dense", "all")
    # The auto-layout saved something since; the restore brings the arrangement back exactly.
    store.upsert_positions("default", "dense", "all", pos([("a", 100, 100), ("c", 5, 5)]), if_absent=True)
    restored = store.replace_layout("default", "dense", "all", backup["positions"], backup=True)
    assert layout_of(store) == {"a": (1, 2), "b": (3, 4)}
    # The restore kept what it replaced: the restore itself can be undone from the list.
    listing = store.list_backups("default", "dense", "all")["backups"]
    assert [each["reason"] for each in listing] == ["restore", "rearrange"]
    assert listing[0]["id"] == restored["backup_id"] and listing[0]["count"] == 2
    assert {p["id"]: (p["x"], p["y"]) for p in store.get_backup("default", restored["backup_id"])["positions"]} == {"a": (100, 100), "c": (5, 5)}


def test_undo_does_not_keep_a_backup_and_a_rearrange_of_nothing_keeps_none(store):
    assert store.delete_layout("default", "dense", "all")["backup_id"] is None
    store.upsert_positions("default", "dense", "all", pos([("a", 1, 2)]))
    removed = store.delete_layout("default", "dense", "all")["removed"]
    undo = store.replace_layout("default", "dense", "all", [{"id": k, "x": v["x"], "y": v["y"]} for k, v in removed.items()])
    assert undo["backup_id"] is None
    assert len(store.list_backups("default", "dense", "all")["backups"]) == 1


def test_the_same_arrangement_is_backed_up_once_and_moves_to_the_top(store):
    store.upsert_positions("default", "dense", "all", pos([("a", 1, 2)]))
    first = store.delete_layout("default", "dense", "all")
    store.replace_layout("default", "dense", "all", pos([("a", 1, 2)]))  # Undo
    second = store.delete_layout("default", "dense", "all")  # the same Re-arrange again
    assert second["backup_id"] == first["backup_id"]
    assert len(store.list_backups("default", "dense", "all")["backups"]) == 1


def test_backups_are_capped_per_layout_newest_kept(store, monkeypatch):
    monkeypatch.setattr(store_mod, "MAX_BACKUPS_PER_LAYOUT", 3)
    ids = []
    for n in range(5):
        store.upsert_positions("default", "dense", "all", pos([("a", n, n)]))
        ids.append(store.delete_layout("default", "dense", "all")["backup_id"])
    store.upsert_positions("default", "rich", "all", pos([("a", 9, 9)]))
    other = store.delete_layout("default", "rich", "all")["backup_id"]
    assert [each["id"] for each in store.list_backups("default", "dense", "all")["backups"]] == ids[:1:-1]
    assert [each["id"] for each in store.list_backups("default", "rich", "all")["backups"]] == [other]
    with pytest.raises(StoreError) as error:
        store.get_backup("default", ids[0])
    assert error.value.status == 404


def test_backups_are_capped_in_all_and_by_size(store, monkeypatch):
    monkeypatch.setattr(store_mod, "MAX_BACKUPS", 2)
    for style in ("s1", "s2", "s3"):
        store.upsert_positions("default", style, "all", pos([("a", 1, 1)]))
        store.delete_layout("default", style, "all")
    assert [len(store.list_backups("default", style, "all")["backups"]) for style in ("s1", "s2", "s3")] == [0, 1, 1]
    monkeypatch.setattr(store_mod, "MAX_BACKUPS", 200)
    size = store.backups_path.stat().st_size
    monkeypatch.setattr(store_mod, "MAX_BACKUP_FILE_BYTES", size + 10)
    store.upsert_positions("default", "s4", "all", pos([("a", 1, 1)]))
    newest = store.delete_layout("default", "s4", "all")["backup_id"]
    assert store.backups_path.stat().st_size <= size + 10
    assert [each["id"] for each in store.list_backups("default", "s4", "all")["backups"]] == [newest]
    assert store.list_backups("default", "s2", "all")["backups"] == []


def test_the_global_caps_take_old_backups_of_busy_layouts_before_another_layouts_only_one(store, monkeypatch):
    # Review t_c044054d N2: 21 scopes × 10 Re-arranges evicted the first scope's only backup
    # (card 10: per style now).
    monkeypatch.setattr(store_mod, "MAX_BACKUPS", 6)
    store.upsert_positions("default", "quiet", "all", pos([("a", 1, 1)]))
    quiet = store.delete_layout("default", "quiet", "all")["backup_id"]
    for n in range(8):
        store.upsert_positions("default", "busy", "all", pos([("a", n, n)]))
        store.delete_layout("default", "busy", "all")
    assert [each["id"] for each in store.list_backups("default", "quiet", "all")["backups"]] == [quiet]
    assert len(store.list_backups("default", "busy", "all")["backups"]) == 5
    assert len(json.loads(store.backups_path.read_text("utf-8"))["backups"]) == 6


def test_a_restore_of_an_arrangement_already_kept_adds_no_copy(store):
    # Review t_c044054d N5: the dedupe looked at the newest backup only.
    store.upsert_positions("default", "dense", "all", pos([("a", 1, 1)]))
    first = store.delete_layout("default", "dense", "all")["backup_id"]
    store.upsert_positions("default", "dense", "all", pos([("a", 2, 2)]))
    store.delete_layout("default", "dense", "all")
    store.replace_layout("default", "dense", "all", pos([("a", 1, 1)]))
    # Restoring the second arrangement keeps the current one (the first), already kept: one copy.
    again = store.replace_layout("default", "dense", "all", pos([("a", 2, 2)]), backup=True)["backup_id"]
    listing = store.list_backups("default", "dense", "all")["backups"]
    assert again == first and [each["id"] for each in listing][0] == first and len(listing) == 2


def test_a_backup_of_another_profile_is_not_served(store):
    store.upsert_positions("work", "dense", "all", pos([("a", 1, 1)]))
    backup_id = store.delete_layout("work", "dense", "all")["backup_id"]
    with pytest.raises(StoreError) as error:
        store.get_backup("default", backup_id)
    assert error.value.status == 404
    for bad in ("", "xyz", "0" * 15, "G" * 16, None, 7):
        with pytest.raises(StoreError) as error:
            store.get_backup("work", bad)
        assert error.value.status == 400


def test_forget_blocks_drops_them_from_the_backups_too(store):
    store.upsert_positions("default", "dense", "all", pos([("a", 1, 1), ("b", 2, 2)]))
    keep = store.delete_layout("default", "dense", "all")["backup_id"]
    store.upsert_positions("default", "rich", "all", pos([("a", 3, 3)]))
    gone = store.delete_layout("default", "rich", "all")["backup_id"]
    store.upsert_positions("work", "dense", "all", pos([("a", 4, 4)]))
    other = store.delete_layout("work", "dense", "all")["backup_id"]
    store.forget_blocks("default", ["a"])
    assert [p["id"] for p in store.get_backup("default", keep)["positions"]] == ["b"]
    with pytest.raises(StoreError):
        store.get_backup("default", gone)  # it held only "a"
    assert [p["id"] for p in store.get_backup("work", other)["positions"]] == ["a"]


@pytest.mark.parametrize("content", [
    b"{not json",
    b'{"schema": 1, "backups": [{"id": "nothex"}]}',
    b'{"schema": 1, "backups": {}}',
])
def test_a_corrupt_backups_file_is_kept_as_bak_and_never_blocks_a_rearrange(store, content):
    store.upsert_positions("default", "dense", "all", pos([("a", 1, 1)]))
    store.backups_path.write_bytes(content)
    assert store.list_backups("default", "dense", "all")["backups"] == []
    kept = sorted(store.path.parent.glob("backups.json.corrupt-*.bak"))
    assert len(kept) == 1 and kept[0].read_bytes() == content
    assert store.delete_layout("default", "dense", "all")["backup_id"]
    assert len(store.list_backups("default", "dense", "all")["backups"]) == 1


def test_a_newer_backups_schema_reads_as_read_only_and_refuses_only_a_rearrange_or_restore(store):
    store.upsert_positions("default", "dense", "all", pos([("a", 1, 1)]))
    future = json.dumps({"schema": store_mod.BACKUP_SCHEMA_VERSION + 1, "backups": "?"}).encode()
    store.backups_path.write_bytes(future)
    assert store.list_backups("default", "dense", "all") == {"ok": True, "backups": [], "read_only": True}
    # A Re-arrange or restore that cannot keep its backup changes nothing; its own code, not
    # newer_schema (which would turn the page read-only though state.json is fine).
    for change in (lambda: store.delete_layout("default", "dense", "all"),
                   lambda: store.replace_layout("default", "dense", "all", pos([("a", 5, 5)]), backup=True)):
        with pytest.raises(StoreError) as error:
            change()
        assert error.value.status == 409 and error.value.detail.startswith(store_mod.HISTORY_NEWER_CODE)
        assert store_mod.NEWER_SCHEMA_CODE not in error.value.detail
    assert layout_of(store) == {"a": (1, 1)}
    # Drops, an Undo (no backup) and a move to another project still work.
    store.upsert_positions("default", "dense", "all", pos([("b", 2, 2)]))
    store.replace_layout("default", "dense", "all", pos([("a", 3, 3), ("b", 2, 2)]))
    assert store.forget_blocks("default", ["b"])["changed"] is True
    assert layout_of(store) == {"a": (3, 3)}
    assert store.backups_path.read_bytes() == future


def test_a_backup_written_before_a_killed_state_write_is_still_there(store, monkeypatch):
    store.upsert_positions("default", "dense", "all", pos([("a", 1, 2)]))

    def die(_state):
        raise OSError("killed")

    monkeypatch.setattr(store, "_write_locked", die)
    with pytest.raises(OSError):
        store.delete_layout("default", "dense", "all")
    monkeypatch.undo()
    # The layout is still stored, and its backup exists: nothing was lost.
    assert layout_of(store) == {"a": (1, 2)}
    assert [each["count"] for each in store.list_backups("default", "dense", "all")["backups"]] == [1]


def test_the_backups_file_is_the_documented_shape(store):
    store.upsert_positions("default", "dense", "all", pos([("a", 1, 2)]))
    store.delete_layout("default", "dense", "all")
    raw = json.loads(store.backups_path.read_text("utf-8"))
    assert raw["schema"] == store_mod.BACKUP_SCHEMA_VERSION and len(raw["backups"]) == 1
    entry = raw["backups"][0]
    assert set(entry) == {"id", "profile", "style", "scope", "project", "created_at", "reason", "positions"}
    assert entry["positions"] == {"a": {"x": 1, "y": 2}} and entry["scope"] == "all" and entry["project"] is None
    # state.json is unchanged in shape: an older Session Tree reads it as before.
    assert set(json.loads(store.path.read_text("utf-8"))) == {"schema", "epoch", "rev", "settings", "layouts"}


# --- validation (untrusted input) -------------------------------------------------------------

@pytest.mark.parametrize("call", [
    lambda s: s.upsert_positions("Default", "dense", "all", pos([("a", 1, 1)])),
    lambda s: s.upsert_positions("default", "Dense!", "all", pos([("a", 1, 1)])),
    lambda s: s.upsert_positions("default", "dense", "", pos([("a", 1, 1)])),
    lambda s: s.upsert_positions("default", "dense", "x" * 1025, pos([("a", 1, 1)])),
    lambda s: s.upsert_positions("default", "dense", "a\nb", pos([("a", 1, 1)])),
    lambda s: s.upsert_positions("default", "dense", "all", pos([("", 1, 1)])),
    lambda s: s.upsert_positions("default", "dense", "all", pos([("a\x00", 1, 1)])),
    lambda s: s.upsert_positions("default", "dense", "all", pos([("x" * 601, 1, 1)])),
    lambda s: s.upsert_positions("default", "dense", "all", pos([("a", float("nan"), 1)])),
    lambda s: s.upsert_positions("default", "dense", "all", pos([("a", float("inf"), 1)])),
    lambda s: s.upsert_positions("default", "dense", "all", pos([("a", 1e8, 1)])),
    lambda s: s.upsert_positions("default", "dense", "all", pos([("a", True, 1)])),
    lambda s: s.upsert_positions("default", "dense", "all", pos([("a", "1", 1)])),
    lambda s: s.upsert_positions("default", "dense", "all", [{"id": "a", "x": 1}]),
    lambda s: s.upsert_positions("default", "dense", "all", [{"id": "a", "x": 1, "y": 2, "z": 3}]),
    lambda s: s.upsert_positions("default", "dense", "all", "nope"),
    lambda s: s.set_settings({"style": "Bad Style"}),
    lambda s: s.set_settings({"snap": "yes"}),
    lambda s: s.set_settings({"colour": "red"}),
])
def test_malformed_input_is_refused_and_nothing_is_written(store, call):
    with pytest.raises(StoreError) as error:
        call(store)
    assert error.value.status in (400, 422)
    assert not store.path.exists()


def test_batch_size_cap(store):
    entries = pos([(f"b{i}", i, i) for i in range(store_mod.MAX_BATCH + 1)])
    with pytest.raises(StoreError) as error:
        store.upsert_positions("default", "dense", "all", entries)
    assert error.value.status == 413


def test_layout_entry_cap(store, monkeypatch):
    monkeypatch.setattr(store_mod, "MAX_ENTRIES_PER_LAYOUT", 10)
    store.upsert_positions("default", "dense", "all", pos([(f"b{i}", i, i) for i in range(10)]))
    with pytest.raises(StoreError) as error:
        store.upsert_positions("default", "dense", "all", pos([("one-more", 1, 1)]))
    assert error.value.status == 413
    assert len(store.snapshot("default")["layouts"]["dense"]["all"]) == 10


def test_file_size_cap(store, monkeypatch):
    monkeypatch.setattr(store_mod, "MAX_FILE_BYTES", 4000)
    with pytest.raises(StoreError) as error:
        store.upsert_positions("default", "dense", "all", pos([(f"block-{i:04d}", i, i) for i in range(200)]))
    assert error.value.status == 413
    assert not store.path.exists()


def test_layout_count_cap(store, monkeypatch):
    monkeypatch.setattr(store_mod, "MAX_LAYOUTS_PER_PROFILE", 3)
    for style in ("s1", "s2", "s3"):
        store.upsert_positions("default", style, "all", pos([("a", 1, 1)]))
    with pytest.raises(StoreError) as error:
        store.upsert_positions("default", "s4", "all", pos([("a", 1, 1)]))
    assert error.value.status == 413


# --- corrupt / foreign files ------------------------------------------------------------------

@pytest.mark.parametrize("content", [
    b"{not json",
    b"",
    b"[]",
    b'{"schema": 1, "rev": "x", "settings": {}, "layouts": {}}',
    b'{"schema": 1, "rev": 3, "settings": {"style": null, "snap": false}, "layouts": {"default": {"dense": {"all": {"a": {"x": "1", "y": 2, "updated_at": 1}}}}}}',
    b"\xff\xfe garbage",
])
def test_a_corrupt_file_serves_an_empty_state_and_is_kept_as_bak_before_any_write(store, content):
    store.path.parent.mkdir(parents=True)
    store.path.write_bytes(content)
    snap = store.snapshot("default")
    assert snap["layouts"] == {} and snap["rev"] == 0
    backups = sorted(store.path.parent.glob("state.json.corrupt-*.bak"))
    assert len(backups) == 1 and backups[0].read_bytes() == content
    # The next write makes a fresh, valid file; the backup stays.
    store.upsert_positions("default", "dense", "all", pos([("a", 1, 1)]))
    assert json.loads(store.path.read_text("utf-8"))["rev"] == 1
    assert backups[0].exists() and backups[0].read_bytes() == content


def test_a_newer_schema_is_never_overwritten(store):
    store.path.parent.mkdir(parents=True)
    future = json.dumps({"schema": store_mod.SCHEMA_VERSION + 1, "rev": 9, "whatever": True}).encode()
    store.path.write_bytes(future)
    assert store.snapshot("default")["layouts"] == {}
    with pytest.raises(StoreError) as error:
        store.upsert_positions("default", "dense", "all", pos([("a", 1, 1)]))
    assert error.value.status == 409
    assert store.path.read_bytes() == future


def test_a_stale_temp_file_from_a_dead_writer_is_ignored_and_cleaned(store):
    store.upsert_positions("default", "dense", "all", pos([("a", 1, 1)]))
    stale = store.path.parent / ".state.json.tmp-99999-dead"
    stale.write_bytes(b'{"half": ')
    assert store.snapshot("default")["layouts"]["dense"]["all"]["a"]["x"] == 1
    store.upsert_positions("default", "dense", "all", pos([("b", 2, 2)]))
    assert not stale.exists()


# --- prune ------------------------------------------------------------------------------------

def test_forget_blocks_drops_them_from_every_layout_of_the_profile_only(store):
    store.upsert_positions("default", "dense", "all", pos([("a", 1, 1), ("b", 2, 2)]))
    store.upsert_positions("default", "rich", "all", pos([("a", 3, 3)]))
    store.upsert_positions("work", "dense", "all", pos([("a", 4, 4)]))
    result = store.forget_blocks("default", ["a"])
    assert result["removed"] == 2 and result["changed"] is True
    layouts = store.snapshot("default")["layouts"]
    assert set(layouts) == {"dense"} and set(layouts["dense"]["all"]) == {"b"}
    assert "a" in store.snapshot("work")["layouts"]["dense"]["all"]
    assert store.forget_blocks("default", ["a"])["changed"] is False
    for bad in ([], "a", ["x" * 601], ["a"] * (store_mod.MAX_FORGET + 1)):
        with pytest.raises(StoreError):
            store.forget_blocks("default", bad)

def test_prune_drops_sessions_that_no_longer_exist_and_keeps_labels_and_standins(store):
    store.upsert_positions("default", "dense", "all", pos([
        ("alive", 1, 1), ("gone", 2, 2), ("work/alive", 3, 3), ("work/gone", 4, 4),
        ("group:/projects/x", 0, 0), ("group:/projects/x\x1f2", 0, 900), ("missing:default/gone", 5, 5),
    ]))
    store.upsert_positions("default", "rich", "all", pos([("gone", 1, 1)]))
    seen: list[tuple[str | None, frozenset]] = []

    def existing(qualified: dict[str | None, set[str]]) -> dict[str | None, set[str]] | None:
        for profile, ids in qualified.items():
            seen.append((profile, frozenset(ids)))
        return {None: {"alive"} & qualified.get(None, set()), "work": {"alive"} & qualified.get("work", set())}

    removed = store.prune("default", existing)
    assert removed == 3
    layouts = store.snapshot("default")["layouts"]
    assert set(layouts["dense"]["all"]) == {"alive", "work/alive", "group:/projects/x", "group:/projects/x\x1f2", "missing:default/gone"}
    assert "rich" not in layouts  # an emptied layout goes away
    assert (None, frozenset({"alive", "gone"})) in seen and ("work", frozenset({"alive", "gone"})) in seen


def test_prune_does_nothing_when_existence_is_unknown(store):
    store.upsert_positions("default", "dense", "all", pos([("a", 1, 1)]))
    assert store.prune("default", lambda qualified: None) == 0
    assert "a" in store.snapshot("default")["layouts"]["dense"]["all"]


def test_prune_without_anything_to_drop_writes_nothing(store):
    store.upsert_positions("default", "dense", "all", pos([("a", 1, 1)]))
    mtime = store.path.stat().st_mtime_ns
    assert store.prune("default", lambda qualified: {None: {"a"}}) == 0
    assert store.path.stat().st_mtime_ns == mtime and store.snapshot("default")["rev"] == 1


# --- compression lineages (card-4 review B2 + NB3) ---------------------------------------------

def _lineages(roots: dict[str, str]):
    """An ``existing`` callback: every id in ``roots`` exists, with that lineage root."""
    def existing(qualified):
        return {key: {sid: roots[sid] for sid in ids if sid in roots} for key, ids in qualified.items()}
    return existing


def test_canonicalise_moves_a_tip_key_to_the_lineage_root(store):
    # Stored before the fix (or before a compaction): keyed by the tip.
    store.upsert_positions("default", "dense", "all", pos([("tip", 125.6, 2.4), ("plain", 7, 7)]))
    store.upsert_positions("default", "rich", "all", pos([("work/tip", 3, 4)]))
    changed = store.prune("default", _lineages({"tip": "root", "plain": "plain"}))
    assert changed == 2
    layouts = store.snapshot("default")["layouts"]
    assert {k: (v["x"], v["y"]) for k, v in layouts["dense"]["all"].items()} == {"root": (125.6, 2.4), "plain": (7, 7)}
    # A profile-qualified key keeps its profile.
    assert set(layouts["rich"]["all"]) == {"work/root"}
    # The root key is settled: nothing more to do, nothing written.
    mtime = store.path.stat().st_mtime_ns
    assert store.prune("default", _lineages({"root": "root", "plain": "plain"})) == 0
    assert store.path.stat().st_mtime_ns == mtime


def test_canonicalise_conflict_keeps_the_newer_entry_and_drops_every_member_key(store):
    # all: the root entry is older than the tip's -> the tip's spot wins.
    store.upsert_positions("default", "dense", "all", pos([("root", 1, 1)]))
    store.upsert_positions("default", "dense", "all", pos([("tip", 2, 2)]))
    # rich: the tip's entry is older than the root's -> the root's spot stays.
    store.upsert_positions("default", "rich", "all", pos([("tip", 3, 3)]))
    store.upsert_positions("default", "rich", "all", pos([("root", 4, 4)]))
    # subway: an old middle segment and an old tip both stored (keys piling up, NB3): one root entry.
    store.upsert_positions("default", "subway", "all", pos([("seg2", 5, 5)]))
    store.upsert_positions("default", "subway", "all", pos([("tip", 6, 6)]))
    store.prune("default", _lineages({"root": "root", "seg2": "root", "tip": "root"}))
    layouts = store.snapshot("default")["layouts"]
    assert {k: (v["x"], v["y"]) for k, v in layouts["dense"]["all"].items()} == {"root": (2, 2)}
    assert {k: (v["x"], v["y"]) for k, v in layouts["rich"]["all"].items()} == {"root": (4, 4)}
    assert {k: (v["x"], v["y"]) for k, v in layouts["subway"]["all"].items()} == {"root": (6, 6)}


def test_prune_keeps_root_keys_and_drops_keys_of_sessions_that_are_gone(store):
    store.upsert_positions("default", "dense", "all", pos([("root", 1, 1), ("gone-tip", 2, 2), ("group:x", 0, 0)]))
    assert store.prune("default", _lineages({"root": "root"})) == 1
    assert set(store.snapshot("default")["layouts"]["dense"]["all"]) == {"root", "group:x"}


# --- epoch (card-4 review NB2) ------------------------------------------------------------------

def test_a_fresh_file_gets_an_epoch_that_stays_until_the_file_is_recreated(store):
    assert store.version() == ("none", 0)
    first = store.upsert_positions("default", "dense", "all", pos([("a", 1, 1)]))["epoch"]
    assert len(first) == 16 and store.version() == (first, 1)
    store.upsert_positions("default", "dense", "all", pos([("b", 1, 1)]))
    assert store.version() == (first, 2)
    assert json.loads(store.path.read_text("utf-8"))["epoch"] == first
    # Deleted: no epoch, and the next write mints a new one (its rev restarts at 1).
    store.path.unlink()
    assert store.version() == ("none", 0)
    second = store.upsert_positions("default", "dense", "all", pos([("a", 1, 1)]))["epoch"]
    assert second != first and store.version() == (second, 1)
    # Corrupt: moved aside, and the next write mints another one.
    store.path.write_text('{"schema": 1, "rev": 9, "lay', encoding="utf-8")
    assert store.version() == ("none", 0)
    third = store.upsert_positions("default", "dense", "all", pos([("a", 1, 1)]))["epoch"]
    assert third not in (first, second)


def test_a_file_without_an_epoch_still_loads_as_one_stable_legacy_epoch(store):
    store.path.parent.mkdir(parents=True, exist_ok=True)
    legacy = {"schema": 1, "rev": 5, "settings": {"style": "dense", "snap": True},
              "layouts": {"default": {"dense": {"all": {"a": {"x": 1, "y": 2, "updated_at": 1.0}}}}}}
    store.path.write_text(json.dumps(legacy), encoding="utf-8")
    assert store.version() == ("legacy", 5) and store.version() == ("legacy", 5)
    snap = store.snapshot("default")
    assert snap["epoch"] == "legacy" and snap["layouts"]["dense"]["all"]["a"]["x"] == 1
    assert not list(store.path.parent.glob("state.json.corrupt-*"))
    # The next write persists a real epoch (and keeps everything else).
    epoch = store.set_settings({"snap": False})["epoch"]
    raw = json.loads(store.path.read_text("utf-8"))
    assert epoch not in ("legacy", "none") and raw["epoch"] == epoch and raw["rev"] == 6
    assert raw["layouts"]["default"]["dense"]["all"]["a"]["y"] == 2


@pytest.mark.parametrize("epoch", ["", "XYZ", 7, "a" * 65])
def test_a_malformed_epoch_is_a_corrupt_file(store, epoch):
    store.path.parent.mkdir(parents=True, exist_ok=True)
    store.path.write_text(json.dumps({"schema": 1, "epoch": epoch, "rev": 1, "settings": {"style": None, "snap": False},
                                      "layouts": {}}), encoding="utf-8")
    assert store.snapshot("default")["epoch"] == "none"
    assert len(list(store.path.parent.glob("state.json.corrupt-*.bak"))) == 1


def test_a_newer_schema_reads_as_read_only_and_refuses_writes_with_the_newer_schema_code(store):
    store.path.parent.mkdir(parents=True, exist_ok=True)
    original = '{"schema":2,"rev":3,"settings":{"style":"dense","snap":false},"layouts":{},"extra":{}}'
    store.path.write_text(original, encoding="utf-8")
    snap = store.snapshot("default")
    assert snap["read_only"] is True and snap["store_schema"] == 2 and snap["layouts"] == {}
    for write in (lambda: store.upsert_positions("default", "dense", "all", pos([("a", 1, 1)]), if_absent=True),
                  lambda: store.set_settings({"snap": True}),
                  lambda: store.replace_layout("default", "dense", "all", pos([("a", 1, 1)]))):
        with pytest.raises(StoreError) as error:
            write()
        assert error.value.status == 409 and error.value.detail.startswith("newer_schema: ")
    assert store.path.read_text("utf-8") == original


# --- concurrency ------------------------------------------------------------------------------

def test_threads_lose_no_update_for_distinct_blocks_and_last_write_wins_per_block(store):
    errors: list[BaseException] = []
    stamps: dict[int, list[tuple[float, int, int]]] = {}

    def writer(n: int) -> None:
        try:
            for i in range(25):
                store.upsert_positions("default", "dense", "all", pos([(f"t{n}-{i}", n, i)]))
                result = store.upsert_positions("default", "dense", "all", pos([("shared", n, i)]))
                stamps.setdefault(n, []).append((result["updated_at"], n, i))
        except BaseException as exc:  # noqa: BLE001 - surfaced below
            errors.append(exc)

    threads = [threading.Thread(target=writer, args=(n,)) for n in range(8)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert not errors
    layout = store.snapshot("default")["layouts"]["dense"]["all"]
    assert {f"t{n}-{i}" for n in range(8) for i in range(25)} <= set(layout)
    last = max(stamp for values in stamps.values() for stamp in values)
    assert (layout["shared"]["x"], layout["shared"]["y"]) == (last[1], last[2])
    assert layout["shared"]["updated_at"] == last[0]


WRITER = r"""
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("st_store_writer", sys.argv[1])
mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
store = mod.LayoutStore(__import__("pathlib").Path(sys.argv[2]))
tag, count = sys.argv[3], int(sys.argv[4])
log = []
for i in range(count):
    store.upsert_positions("default", "dense", "all", [{"id": f"{tag}-{i}", "x": i, "y": 0}])
    r = store.upsert_positions("default", "dense", "all", [{"id": "shared", "x": i, "y": 1 if tag == "A" else 2}])
    log.append([r["updated_at"], i, 1 if tag == "A" else 2])
print(json.dumps(log))
"""


def test_two_processes_lose_no_update_for_distinct_blocks_and_resolve_per_block_by_last_write(store, tmp_path):
    script = tmp_path / "writer.py"
    script.write_text(WRITER, "utf-8")
    store.path.parent.mkdir(parents=True, exist_ok=True)
    count = 60
    procs = [subprocess.Popen([sys.executable, "-I", str(script), str(store_mod.__file__), str(store.path), tag, str(count)],
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True) for tag in ("A", "B")]
    logs = []
    for proc in procs:
        out, err = proc.communicate(timeout=120)
        assert proc.returncode == 0, err
        logs.extend(json.loads(out))
    layout = store.snapshot("default")["layouts"]["dense"]["all"]
    assert {f"{tag}-{i}" for tag in "AB" for i in range(count)} <= set(layout)
    last = max(logs)
    assert (layout["shared"]["x"], layout["shared"]["y"]) == (last[1], last[2])
    assert store.snapshot("default")["rev"] == 4 * count


KILLED = r"""
import importlib.util, sys
spec = importlib.util.spec_from_file_location("st_store_killed", sys.argv[1])
mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
store = mod.LayoutStore(__import__("pathlib").Path(sys.argv[2]))
generation = 0
print("ready", flush=True)
while True:
    generation += 1
    store.replace_layout("default", "dense", "all",
                         [{"id": f"block-{i:05d}-{'x' * 40}", "x": generation, "y": i} for i in range(4000)])
"""


def test_an_atomic_write_survives_a_killed_writer(store, tmp_path, monkeypatch):
    monkeypatch.setattr(store_mod, "MAX_ENTRIES_PER_LAYOUT", 10_000)
    script = tmp_path / "killed.py"
    script.write_text(KILLED, "utf-8")
    store.path.parent.mkdir(parents=True, exist_ok=True)
    rng = random.Random(4)
    generations = set()
    torn_temps = 0
    for _round in range(30):
        proc = subprocess.Popen([sys.executable, "-I", str(script), str(store_mod.__file__), str(store.path)],
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        assert proc.stdout.readline().strip() == "ready"
        time.sleep(rng.uniform(0.05, 0.4))
        os.kill(proc.pid, signal.SIGKILL)
        proc.wait(timeout=30)
        torn_temps += len(list(store.path.parent.glob(".state.json.tmp-*")))
        if not store.path.exists():
            continue
        # Old or new, never torn: the file parses, validates, and is one whole generation.
        raw = json.loads(store.path.read_bytes())
        layout = raw["layouts"]["default"]["dense"]["all"]
        assert len(layout) == 4000
        xs = {entry["x"] for entry in layout.values()}
        assert len(xs) == 1
        generations.add(xs.pop())
        assert store.snapshot("default")["layouts"]["dense"]["all"]  # the store itself reads it
        assert not list(store.path.parent.glob("state.json.corrupt-*.bak"))
    assert generations, "no generation was ever committed"
    # At least one kill landed mid-write (a temp file left behind), so the old-or-new claim was exercised.
    assert torn_temps > 0
