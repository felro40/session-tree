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
    assert snap == {"schema": store_mod.SCHEMA_VERSION, "rev": 0, "settings": {"style": None, "snap": False},
                    "layouts": {}}
    assert not store.path.exists()  # a read writes nothing


def test_upsert_then_snapshot_per_profile_style_scope(store):
    result = store.upsert_positions("default", "dense", "all", pos([("a", 1, 2), ("b", 3.5, -4)]))
    assert result["applied"] == 2 and result["rev"] == 1
    store.upsert_positions("work", "dense", "all", pos([("a", 9, 9)]))
    store.upsert_positions("default", "dense", "/projects/syscanvas", pos([("a", 5, 5)]))
    snap = store.snapshot("default")
    layout = snap["layouts"]["dense"]["all"]
    assert {k: (v["x"], v["y"]) for k, v in layout.items()} == {"a": (1, 2), "b": (3.5, -4)}
    assert snap["layouts"]["dense"]["/projects/syscanvas"]["a"]["x"] == 5
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
    store.upsert_positions("default", "dense", "p1", pos([("a", 7, 7)]))
    before = store.snapshot("default")["layouts"]["dense"]["all"]
    removed = store.delete_layout("default", "dense", "all")["removed"]
    assert removed == before
    snap = store.snapshot("default")
    assert "all" not in snap["layouts"]["dense"] and snap["layouts"]["dense"]["p1"]["a"]["x"] == 7
    # Re-arrange then saves a fresh layout; Undo replaces it with what was removed.
    store.upsert_positions("default", "dense", "all", pos([("a", 100, 100), ("c", 5, 5)]))
    store.replace_layout("default", "dense", "all", [{"id": k, "x": v["x"], "y": v["y"]} for k, v in removed.items()])
    restored = store.snapshot("default")["layouts"]["dense"]["all"]
    assert {k: (v["x"], v["y"]) for k, v in restored.items()} == {"a": (1, 2), "b": (3, 4)}


def test_delete_of_an_empty_layout_removes_nothing(store):
    assert store.delete_layout("default", "dense", "all")["removed"] == {}


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
    for scope in ("s1", "s2", "s3"):
        store.upsert_positions("default", "dense", scope, pos([("a", 1, 1)]))
    with pytest.raises(StoreError) as error:
        store.upsert_positions("default", "dense", "s4", pos([("a", 1, 1)]))
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
    store.upsert_positions("default", "dense", "p1", pos([("a", 3, 3)]))
    store.upsert_positions("work", "dense", "all", pos([("a", 4, 4)]))
    result = store.forget_blocks("default", ["a"])
    assert result["removed"] == 2 and result["changed"] is True
    layouts = store.snapshot("default")["layouts"]["dense"]
    assert set(layouts) == {"all"} and set(layouts["all"]) == {"b"}
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
    store.upsert_positions("default", "dense", "p1", pos([("gone", 1, 1)]))
    seen: list[tuple[str | None, frozenset]] = []

    def existing(qualified: dict[str | None, set[str]]) -> dict[str | None, set[str]] | None:
        for profile, ids in qualified.items():
            seen.append((profile, frozenset(ids)))
        return {None: {"alive"} & qualified.get(None, set()), "work": {"alive"} & qualified.get("work", set())}

    removed = store.prune("default", existing)
    assert removed == 3
    layout = store.snapshot("default")["layouts"]["dense"]
    assert set(layout["all"]) == {"alive", "work/alive", "group:/projects/x", "group:/projects/x\x1f2", "missing:default/gone"}
    assert "p1" not in layout  # an emptied layout goes away
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
