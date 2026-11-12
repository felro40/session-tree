"""Card 10: one shared layout per style (``dashboard/layout_store.py``).

The one-time migration (on a copy of the user's real store, the card's attachment), the 409
``scope_layout_retired`` refusal of a per-project write, the scoped Re-arrange op
(``set_project_blocks``) and Layout history per style.

The migration fixture is a copy of the real ``state.json`` attached to the card (read-only; it
is copied into ``tmp_path``). ``SESSION_TREE_REAL_STATE`` names another copy; when neither exists
a synthetic store of the same shape (22 layouts of ~150 blocks) is used instead, so the tests
always run.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import random
import signal
import subprocess
import sys
from pathlib import Path

import pytest

from conftest import REPO, _load

store_mod = _load("session_tree_layout_store_card10", REPO / "dashboard" / "layout_store.py")
LayoutStore = store_mod.LayoutStore
StoreError = store_mod.StoreError

REAL_STATE = Path(os.environ.get("SESSION_TREE_REAL_STATE",
                                 "/home/david/.hermes/kanban/attachments/t_7773fc8c/real-state-2026-11-12.json"))


def pos(entries):
    return [{"id": block, "x": x, "y": y} for block, x, y in entries]


def _synthetic_state() -> bytes:
    rng = random.Random(10)
    scopes = {"dense": ["all", "__no_project__", "p_0213b737", "p_259e178a", "p_33aa0d71", "p_57bb3a5c", "p_9128ca53",
                        "p_a4428e45", "p_c3eaaecf", "p_da0b04ab", "/home/u/work/mdesign"],
              "subway": ["all", "__no_project__", "p_0213b737", "p_33aa0d71", "p_57bb3a5c", "p_9128ca53", "p_c3eaaecf",
                         "p_da0b04ab"],
              "rich": ["all", "p_57bb3a5c", "p_c3eaaecf"]}
    layouts: dict = {"default": {}, "*": {"subway": {"all": {}}}}
    stamp = 1_794_000_000.0
    for style, keys in scopes.items():
        layouts["default"][style] = {}
        for scope in keys:
            blocks = {}
            for n in range(150 + rng.randrange(17)):
                stamp += 0.25
                blocks[f"s{n:04d}"] = {"x": rng.randrange(-400, 4000) + 0.5, "y": rng.randrange(0, 9000) / 3, "updated_at": stamp}
            layouts["default"][style][scope] = blocks
    layouts["*"]["subway"]["all"] = {"default/s0001": {"x": 1.0, "y": 2.0, "updated_at": stamp}}
    state = {"schema": 1, "epoch": "a1d9b96e15d86a57", "rev": 105, "settings": {"style": "subway", "snap": False}, "layouts": layouts}
    return json.dumps(state, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode("utf-8")


def _fixture_bytes() -> bytes:
    return REAL_STATE.read_bytes() if REAL_STATE.is_file() else _synthetic_state()


def _all_layouts(state: dict) -> dict:
    """``{(profile, style): the 'all' layout}``."""
    return {(profile, style): scopes["all"] for profile, styles in state["layouts"].items()
            for style, scopes in styles.items() if "all" in scopes}


def _canon(value) -> bytes:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True, allow_nan=False).encode("utf-8")


@pytest.fixture
def real_home(tmp_path: Path):
    """A copy of the real store, plus a ``backups.json`` with a backup of another scope (and one of ``all``)."""
    folder = tmp_path / "session-tree"
    folder.mkdir()
    data = _fixture_bytes()
    (folder / "state.json").write_bytes(data)
    state = json.loads(data)
    project_scope = next(scope for scope in state["layouts"]["default"]["dense"] if scope != "all")
    backups = {"schema": 1, "backups": [
        {"id": "0123456789abcdef", "profile": "default", "style": "dense", "scope": project_scope, "created_at": 1.0,
         "reason": "rearrange", "positions": {"s-old": {"x": 1, "y": 2}}},
        {"id": "fedcba9876543210", "profile": "default", "style": "dense", "scope": "all", "created_at": 2.0,
         "reason": "rearrange", "positions": {"s-kept": {"x": 3, "y": 4}}},
    ]}
    (folder / "backups.json").write_bytes(_canon(backups))
    return folder, state


# --- the migration (A2) -------------------------------------------------------------------------

def test_the_fixture_holds_per_project_layouts(real_home):
    _folder, state = real_home
    retired = [(p, s, scope) for p, styles in state["layouts"].items() for s, scopes in styles.items() for scope in scopes if scope != "all"]
    assert len(retired) >= 10  # the real store: 19 per-project layouts beside 5 'all' ones


def test_migration_keeps_only_all_byte_identical_and_drops_other_scopes_and_their_backups(real_home, caplog):
    folder, before = real_home
    store = LayoutStore(folder / "state.json")
    expected = _all_layouts(before)
    with caplog.at_level(logging.INFO, logger="session_tree.layout_store"):
        snap = store.snapshot("default")
        for _ in range(3):  # later loads and writes find nothing to drop
            store.snapshot("default")
            store.snapshot("*")
            store.list_backups("default", "dense")
        store.upsert_positions("default", "dense", "all", pos([("s-new", 1, 1)]))
    lines = [record.getMessage() for record in caplog.records if record.name == "session_tree.layout_store"]
    assert len(lines) == 1 and "dropped" in lines[0]
    # Only 'all' remains per style, in the served snapshot and in the file.
    assert all(set(scopes) == {"all"} for scopes in snap["layouts"].values())
    after = json.loads((folder / "state.json").read_bytes())
    assert all(set(scopes) == {"all"} for styles in after["layouts"].values() for scopes in styles.values())
    # Every 'all' layout is byte for byte what it was (the new drop aside).
    del after["layouts"]["default"]["dense"]["all"]["s-new"]
    assert {key: _canon(value) for key, value in _all_layouts(after).items()} == {key: _canon(value) for key, value in expected.items()}
    assert after["settings"] == before["settings"] and after["epoch"] == before["epoch"]
    # The other scope's backup is gone; the 'all' one stays (now schema 2, project null).
    backups = json.loads((folder / "backups.json").read_bytes())
    assert [each["id"] for each in backups["backups"]] == ["fedcba9876543210"]
    assert [each["id"] for each in store.list_backups("default", "dense")["backups"]] == ["fedcba9876543210"]


def test_the_first_poll_after_the_migration_sees_a_new_revision(real_home):
    folder, before = real_home
    store = LayoutStore(folder / "state.json")
    epoch, rev = store.version()
    assert (epoch, rev) == (before["epoch"], before["rev"] + 1)
    assert store.version() == (epoch, rev)


def test_a_backups_file_with_another_scope_is_migrated_on_its_first_read(tmp_path, caplog):
    folder = tmp_path / "session-tree"
    folder.mkdir()
    store = LayoutStore(folder / "state.json")
    store.upsert_positions("default", "dense", "all", pos([("a", 1, 1)]))
    (folder / "backups.json").write_bytes(_canon({"schema": 1, "backups": [
        {"id": "0123456789abcdef", "profile": "default", "style": "dense", "scope": "p1", "created_at": 1.0,
         "reason": "rearrange", "positions": {"a": {"x": 1, "y": 2}}}]}))
    with caplog.at_level(logging.INFO, logger="session_tree.layout_store"):
        assert store.list_backups("default", "dense")["backups"] == []
        with pytest.raises(StoreError):
            store.get_backup("default", "0123456789abcdef")
    assert json.loads((folder / "backups.json").read_bytes())["backups"] == []
    assert sum(record.name == "session_tree.layout_store" for record in caplog.records) == 1


@pytest.mark.parametrize("stage", ["backups.json", "state.json"])
def test_a_migration_that_fails_midway_never_loses_all(real_home, monkeypatch, stage):
    folder, before = real_home
    original = (folder / "state.json").read_bytes()
    store = LayoutStore(folder / "state.json")
    real_replace = store_mod.os.replace

    def die(src, dst):
        if Path(dst).name == stage:
            raise OSError("killed")
        return real_replace(src, dst)

    monkeypatch.setattr(store_mod.os, "replace", die)
    with pytest.raises(OSError):
        store.snapshot("default")
    monkeypatch.undo()
    # The state file is the old one, whole (its 'all' layouts included); no temp file is left.
    assert (folder / "state.json").read_bytes() == original
    assert not list(folder.glob(".state.json.tmp-*")) and not list(folder.glob(".backups.json.tmp-*"))
    # The next load finishes the migration.
    after = store.snapshot("default")
    assert {("default", style): scopes["all"] for style, scopes in after["layouts"].items()} == \
        {key: value for key, value in _all_layouts(before).items() if key[0] == "default"}


KILLED_MIGRATION = r"""
import importlib.util, os, signal, sys
spec = importlib.util.spec_from_file_location("st_store_killed_migration", sys.argv[1])
mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
store = mod.LayoutStore(__import__("pathlib").Path(sys.argv[2]))
real_replace = os.replace
def replace(src, dst):
    if os.path.basename(dst) == sys.argv[3]:
        os.kill(os.getpid(), signal.SIGKILL)  # killed with its temp file written, before the rename
    return real_replace(src, dst)
mod.os.replace = replace
store.snapshot("default")
"""


@pytest.mark.parametrize("stage", ["backups.json", "state.json"])
def test_a_writer_killed_in_the_middle_of_the_migration_never_loses_all(real_home, tmp_path, stage):
    folder, before = real_home
    original = (folder / "state.json").read_bytes()
    script = tmp_path / "killed.py"
    script.write_text(KILLED_MIGRATION, "utf-8")
    proc = subprocess.run([sys.executable, "-I", str(script), str(store_mod.__file__), str(folder / "state.json"), stage],
                          capture_output=True, text=True, timeout=60)
    assert proc.returncode == -signal.SIGKILL, proc.stderr
    assert (folder / "state.json").read_bytes() == original
    store = LayoutStore(folder / "state.json")
    after = json.loads(_canon(store.read()))
    assert {key: _canon(value) for key, value in _all_layouts(after).items()} == \
        {key: _canon(value) for key, value in _all_layouts(before).items()}
    assert not list(folder.glob(".state.json.tmp-*"))  # the next writer removed the dead one's temp file


def test_a_store_with_only_all_layouts_is_never_rewritten_by_a_read(tmp_path):
    store = LayoutStore(tmp_path / "session-tree" / "state.json")
    store.upsert_positions("default", "dense", "all", pos([("a", 1, 1)]))
    mtime = store.path.stat().st_mtime_ns
    for _ in range(3):
        store.snapshot("default")
        store.list_backups("default", "dense")
    assert store.path.stat().st_mtime_ns == mtime and not store.backups_path.exists()


# --- retired scopes (A3) ------------------------------------------------------------------------

@pytest.mark.parametrize("call", [
    lambda s: s.upsert_positions("default", "dense", "p1", pos([("a", 5, 5)])),
    lambda s: s.upsert_positions("default", "dense", "p1", pos([("a", 5, 5)]), if_absent=True),
    lambda s: s.replace_layout("default", "dense", "p1", pos([("a", 5, 5)])),
    lambda s: s.replace_layout("default", "dense", "p1", pos([("a", 5, 5)]), backup=True),
    lambda s: s.delete_layout("default", "dense", "p1"),
    lambda s: s.set_project_blocks("default", "dense", "p1", "p1", pos([("a", 5, 5)]), [], backup=True),
])
def test_a_write_to_a_retired_scope_is_refused_with_409_and_changes_nothing(tmp_path, call):
    store = LayoutStore(tmp_path / "session-tree" / "state.json")
    store.upsert_positions("default", "dense", "all", pos([("a", 1, 1)]))
    store.delete_layout("default", "dense", "all")
    store.upsert_positions("default", "dense", "all", pos([("a", 2, 2)]))
    files = {path.name: path.read_bytes() for path in store.path.parent.iterdir()}
    with pytest.raises(StoreError) as error:
        call(store)
    assert error.value.status == 409 and error.value.detail.startswith(store_mod.SCOPE_RETIRED_CODE + ":")
    assert store_mod.NEWER_SCHEMA_CODE not in error.value.detail
    assert {path.name: path.read_bytes() for path in store.path.parent.iterdir()} == files


def test_a_malformed_scope_is_still_400_not_409(tmp_path):
    store = LayoutStore(tmp_path / "session-tree" / "state.json")
    for scope in ("", "a\nb", "x" * 1025, None):
        with pytest.raises(StoreError) as error:
            store.upsert_positions("default", "dense", scope, pos([("a", 1, 1)]))
        assert error.value.status == 400


# --- the scoped Re-arrange (A5, A6) -------------------------------------------------------------

@pytest.fixture
def store(tmp_path: Path):
    return LayoutStore(tmp_path / "session-tree" / "state.json")


def stored(store, style="dense"):
    return store.snapshot("default")["layouts"].get(style, {}).get("all", {})


def test_a_scoped_rearrange_changes_only_the_given_blocks_and_keeps_the_whole_layout_first(store):
    store.upsert_positions("default", "dense", "all", pos([("p-a", 1, 1), ("p-b", 2, 2), ("o-a", 3, 3), ("o-b", 4, 4)]))
    others = {key: dict(entry) for key, entry in stored(store).items() if key.startswith("o-")}
    result = store.set_project_blocks("default", "dense", "all", "proj", pos([("p-a", 10, 10), ("p-b", 2, 2), ("p-c", 30, 30)]),
                                      [], backup=True)
    assert result["changed"] is True and result["applied"] == 2 and result["removed"] == 0
    layout = stored(store)
    assert {key: (entry["x"], entry["y"]) for key, entry in layout.items() if key.startswith("p-")} == {
        "p-a": (10, 10), "p-b": (2, 2), "p-c": (30, 30)}
    # Every other block's entry is exactly what it was (its updated_at too).
    assert {key: entry for key, entry in layout.items() if key.startswith("o-")} == others
    # The whole style layout as it was is in Layout history, with the project.
    listing = store.list_backups("default", "dense")["backups"]
    assert [(each["id"], each["reason"], each["project"], each["count"]) for each in listing] == [(result["backup_id"], "rearrange", "proj", 4)]
    assert {p["id"]: (p["x"], p["y"]) for p in store.get_backup("default", result["backup_id"])["positions"]} == {
        "p-a": (1, 1), "p-b": (2, 2), "o-a": (3, 3), "o-b": (4, 4)}


def test_a_scoped_rearrange_that_moves_nothing_keeps_no_backup_and_no_revision(store):
    store.upsert_positions("default", "dense", "all", pos([("p-a", 1, 1), ("o-a", 3, 3)]))
    rev = store.snapshot("default")["rev"]
    result = store.set_project_blocks("default", "dense", "all", "proj", pos([("p-a", 1, 1)]), [], backup=True)
    assert (result["changed"], result["backup_id"], result["rev"]) == (False, None, rev)
    assert store.list_backups("default", "dense")["backups"] == [] and not store.backups_path.exists()


def test_another_devices_concurrent_move_of_another_projects_block_survives(store):
    store.upsert_positions("default", "dense", "all", pos([("p-a", 1, 1), ("o-a", 3, 3)]))
    # The page computed its op from this layout; meanwhile another device moves o-a.
    store.upsert_positions("default", "dense", "all", pos([("o-a", 99, 99)]))
    store.set_project_blocks("default", "dense", "all", "proj", pos([("p-a", 10, 10)]), [], backup=True)
    assert (stored(store)["o-a"]["x"], stored(store)["o-a"]["y"]) == (99, 99)


def test_undo_puts_back_exactly_the_projects_entries_and_removes_what_the_rearrange_added(store):
    store.upsert_positions("default", "dense", "all", pos([("p-a", 1, 1), ("o-a", 3, 3)]))
    store.set_project_blocks("default", "dense", "all", "proj", pos([("p-a", 10, 10), ("p-new", 5, 5)]), [], backup=True)
    store.upsert_positions("default", "dense", "all", pos([("o-a", 7, 7)]))  # another block moved since
    before = len(store.list_backups("default", "dense")["backups"])
    undo = store.set_project_blocks("default", "dense", "all", "proj", pos([("p-a", 1, 1)]), ["p-new"])
    assert undo["changed"] is True and undo["backup_id"] is None and undo["removed"] == 1
    assert {key: (entry["x"], entry["y"]) for key, entry in stored(store).items()} == {"p-a": (1, 1), "o-a": (7, 7)}
    assert len(store.list_backups("default", "dense")["backups"]) == before  # an Undo keeps no backup


def test_the_backup_is_written_before_the_state_and_under_the_same_lock(store, monkeypatch):
    store.upsert_positions("default", "dense", "all", pos([("p-a", 1, 2), ("o-a", 3, 3)]))
    order: list[str] = []
    locked = {"held": False}
    real_keep = store._keep_backup_locked
    real_locked = store._locked

    class Spy:
        def __enter__(self):
            self.inner = real_locked()
            self.inner.__enter__()
            locked["held"] = True
            return self

        def __exit__(self, *exc):
            locked["held"] = False
            return self.inner.__exit__(*exc)

    def keep(*args, **kwargs):
        order.append(f"backup:{locked['held']}")
        return real_keep(*args, **kwargs)

    def write(state):
        order.append(f"state:{locked['held']}")
        raise OSError("killed")

    monkeypatch.setattr(store, "_locked", lambda: Spy())
    monkeypatch.setattr(store, "_keep_backup_locked", keep)
    monkeypatch.setattr(store, "_write_locked", write)
    with pytest.raises(OSError):
        store.set_project_blocks("default", "dense", "all", "proj", pos([("p-a", 10, 10)]), [], backup=True)
    monkeypatch.undo()
    assert order == ["backup:True", "state:True"]
    assert {key: (entry["x"], entry["y"]) for key, entry in stored(store).items()} == {"p-a": (1, 2), "o-a": (3, 3)}
    assert [(each["project"], each["count"]) for each in store.list_backups("default", "dense")["backups"]] == [("proj", 2)]


def test_a_newer_backups_file_refuses_a_scoped_rearrange_like_a_rearrange(store):
    store.upsert_positions("default", "dense", "all", pos([("p-a", 1, 1)]))
    future = json.dumps({"schema": store_mod.BACKUP_SCHEMA_VERSION + 1, "backups": "?"}).encode()
    store.backups_path.write_bytes(future)
    state = store.path.read_bytes()
    with pytest.raises(StoreError) as error:
        store.set_project_blocks("default", "dense", "all", "proj", pos([("p-a", 5, 5)]), [], backup=True)
    assert error.value.status == 409 and error.value.detail.startswith(store_mod.HISTORY_NEWER_CODE)
    assert store.path.read_bytes() == state and store.backups_path.read_bytes() == future
    # Its Undo (no backup) still works.
    store.set_project_blocks("default", "dense", "all", "proj", pos([("p-a", 2, 2)]), [])
    assert stored(store)["p-a"]["x"] == 2


@pytest.mark.parametrize("call,status", [
    (lambda s: s.set_project_blocks("Default", "dense", "all", "proj", pos([("a", 1, 1)]), []), 400),
    (lambda s: s.set_project_blocks("default", "Dense", "all", "proj", pos([("a", 1, 1)]), []), 400),
    (lambda s: s.set_project_blocks("default", "dense", "", "proj", pos([("a", 1, 1)]), []), 400),
    (lambda s: s.set_project_blocks("default", "dense", "all", "", pos([("a", 1, 1)]), []), 400),
    (lambda s: s.set_project_blocks("default", "dense", "all", "all", pos([("a", 1, 1)]), []), 400),
    (lambda s: s.set_project_blocks("default", "dense", "all", "a\x00b", pos([("a", 1, 1)]), []), 400),
    (lambda s: s.set_project_blocks("default", "dense", "all", 7, pos([("a", 1, 1)]), []), 400),
    (lambda s: s.set_project_blocks("default", "dense", "all", "x" * 1025, pos([("a", 1, 1)]), []), 400),
    (lambda s: s.set_project_blocks("default", "dense", "all", "proj", "a", []), 400),
    (lambda s: s.set_project_blocks("default", "dense", "all", "proj", [{"id": "a", "x": "1", "y": 1}], []), 400),
    (lambda s: s.set_project_blocks("default", "dense", "all", "proj", [{"id": "a", "x": float("nan"), "y": 1}], []), 400),
    (lambda s: s.set_project_blocks("default", "dense", "all", "proj", [{"id": "a", "x": 1, "y": 1, "z": 0}], []), 400),
    (lambda s: s.set_project_blocks("default", "dense", "all", "proj", pos([("", 1, 1)]), []), 400),
    (lambda s: s.set_project_blocks("default", "dense", "all", "proj", pos([("a", 1, 1)]), "b"), 400),
    (lambda s: s.set_project_blocks("default", "dense", "all", "proj", pos([("a", 1, 1)]), ["b\x01"]), 400),
    (lambda s: s.set_project_blocks("default", "dense", "all", "proj", pos([("a", 1, 1)]), ["a"]), 400),
    (lambda s: s.set_project_blocks("default", "dense", "all", "proj", pos([(f"b{i}", i, i) for i in range(5001)]), []), 413),
    (lambda s: s.set_project_blocks("default", "dense", "all", "proj", [], [f"b{i}" for i in range(5001)]), 413),
])
def test_the_scoped_rearrange_validates_its_input_as_untrusted(store, call, status):
    store.upsert_positions("default", "dense", "all", pos([("a", 1, 1)]))
    files = {path.name: path.read_bytes() for path in store.path.parent.iterdir()}
    with pytest.raises(StoreError) as error:
        call(store)
    assert error.value.status == status
    assert {path.name: path.read_bytes() for path in store.path.parent.iterdir()} == files


def test_the_scoped_rearrange_respects_the_layout_entry_cap(store, monkeypatch):
    monkeypatch.setattr(store_mod, "MAX_ENTRIES_PER_LAYOUT", 3)
    store.upsert_positions("default", "dense", "all", pos([("a", 1, 1), ("b", 2, 2)]))
    with pytest.raises(StoreError) as error:
        store.set_project_blocks("default", "dense", "all", "proj", pos([("c", 3, 3), ("d", 4, 4)]), [], backup=True)
    assert error.value.status == 413 and set(stored(store)) == {"a", "b"}


# --- Layout history per style (A8) --------------------------------------------------------------

def test_history_lists_all_and_project_rearranges_and_restores_of_a_style_together_newest_first(store):
    store.upsert_positions("default", "dense", "all", pos([("p-a", 1, 1), ("o-a", 3, 3)]))
    first = store.delete_layout("default", "dense", "all")["backup_id"]
    store.upsert_positions("default", "dense", "all", pos([("p-a", 2, 2), ("o-a", 4, 4)]))
    scoped = store.set_project_blocks("default", "dense", "all", "proj", pos([("p-a", 9, 9)]), [], backup=True)["backup_id"]
    restored = store.replace_layout("default", "dense", "all", pos([("p-a", 1, 1), ("o-a", 3, 3)]), backup=True)["backup_id"]
    store.upsert_positions("default", "rich", "all", pos([("p-a", 1, 1)]))
    store.delete_layout("default", "rich", "all")
    listing = store.list_backups("default", "dense")["backups"]
    assert [(each["id"], each["reason"], each["project"]) for each in listing] == [
        (restored, "restore", None), (scoped, "rearrange", "proj"), (first, "rearrange", None)]
    assert all(listing[i]["created_at"] > listing[i + 1]["created_at"] for i in range(len(listing) - 1))
    assert store.get_backup("default", scoped)["project"] == "proj"
    assert len(store.list_backups("default", "rich")["backups"]) == 1


def test_the_history_caps_apply_per_profile_and_style(store, monkeypatch):
    monkeypatch.setattr(store_mod, "MAX_BACKUPS_PER_LAYOUT", 3)
    ids = []
    for n in range(3):
        store.upsert_positions("default", "dense", "all", pos([("p-a", n, n), ("o-a", 50, 50)]))
        ids.append(store.set_project_blocks("default", "dense", "all", "proj", pos([("p-a", 100 + n, 0)]), [], backup=True)["backup_id"])
        store.upsert_positions("default", "dense", "all", pos([("o-a", n, 7)]))
        ids.append(store.delete_layout("default", "dense", "all")["backup_id"])
    store.upsert_positions("default", "rich", "all", pos([("a", 1, 1)]))
    rich = store.delete_layout("default", "rich", "all")["backup_id"]
    assert [each["id"] for each in store.list_backups("default", "dense")["backups"]] == ids[:-4:-1]
    assert [each["id"] for each in store.list_backups("default", "rich")["backups"]] == [rich]


def test_a_schema_1_backups_file_reads_as_project_null_and_is_written_back_as_schema_2(store):
    store.upsert_positions("default", "dense", "all", pos([("a", 1, 1)]))
    store.backups_path.write_bytes(_canon({"schema": 1, "backups": [
        {"id": "0123456789abcdef", "profile": "default", "style": "dense", "scope": "all", "created_at": 1.0,
         "reason": "rearrange", "positions": {"a": {"x": 5, "y": 6}}}]}))
    assert [(each["id"], each["project"]) for each in store.list_backups("default", "dense")["backups"]] == [("0123456789abcdef", None)]
    store.delete_layout("default", "dense", "all")
    raw = json.loads(store.backups_path.read_bytes())
    assert raw["schema"] == 2 and [each["project"] for each in raw["backups"]] == [None, None]


@pytest.mark.parametrize("project", ["", "all", 7, "a\x00"])
def test_a_schema_2_backup_with_a_malformed_project_is_a_corrupt_file(store, project):
    store.backups_path.parent.mkdir(parents=True, exist_ok=True)
    content = _canon({"schema": 2, "backups": [
        {"id": "0123456789abcdef", "profile": "default", "style": "dense", "scope": "all", "project": project,
         "created_at": 1.0, "reason": "rearrange", "positions": {"a": {"x": 5, "y": 6}}}]})
    store.backups_path.write_bytes(content)
    assert store.list_backups("default", "dense")["backups"] == []
    kept = sorted(store.path.parent.glob("backups.json.corrupt-*.bak"))
    assert len(kept) == 1 and hashlib.sha256(kept[0].read_bytes()).digest() == hashlib.sha256(content).digest()
