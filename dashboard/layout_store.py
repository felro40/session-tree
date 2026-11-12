"""Session Tree's synced layout store (card 4, R16/R17): one JSON file, outside the package.

``<HERMES_HOME root>/session-tree/state.json`` holds what every window and device served by this
gateway shares: the view settings (``style``, ``snap``) and the block positions, keyed by profile
→ style → scope → block id, each ``{x, y, updated_at}``. Installs and updates replace the plugin
package, never this file.

Standard library only (no Hermes, no FastAPI), so the backend and a test's second process load
the same code.

* **Atomic:** every write goes to a temp file in the same folder, is fsynced, then ``os.replace``\\ d
  over ``state.json`` (and the folder fsynced). A killed writer leaves the old file or the new
  one, never a torn one; its temp file is ignored and removed by the next writer.
* **One writer at a time:** a process-level ``threading.Lock`` plus an exclusive ``fcntl.flock``
  on the sidecar ``state.lock`` (other processes: a second gateway worker, a plugin host child, a
  test). Each mutation re-reads the file under both locks, so no update is lost.
* **Last write wins per block, by server receive time:** an upsert stamps ``updated_at`` when it
  is applied under the lock; the later one replaces the earlier one for that block only.
* **Untrusted input:** ids, styles, scopes and coordinates are checked and every size is capped
  (batch, entries per layout, layouts per profile, profiles, file bytes).
* **Corrupt file:** a ``state.json`` that does not parse or validate is moved aside to
  ``state.json.corrupt-<time>.bak`` before anything else is written, and an empty state is
  served. A file of a newer schema is left alone: served as empty with ``read_only: true``, never
  overwritten (a write answers 409 ``newer_schema: …``).
* **Epoch:** a random id minted whenever a fresh ``state.json`` is written (first creation, after a
  corrupt file was moved aside, after the file was deleted). ``(epoch, rev)`` names a state: a
  ``rev`` alone restarts at 0 with a new file, so a client comparing revs only could take a new
  file for one it has. A file without ``epoch`` (written before it existed) still loads, as the
  one stable :data:`LEGACY_EPOCH`, until its next write persists a real one; no file at all is
  :data:`NO_EPOCH`. No schema bump: ``epoch`` is an optional key of schema 1.
* **Compression lineages** (card-4 review B2): a block's layout key is its compression lineage's
  root id. :meth:`LayoutStore.prune` canonicalises when the state is served: an entry keyed by
  another member of a lineage (an old tip) moves to the root key (the newer entry by
  ``updated_at`` wins when both exist), so a stored position survives a compaction and old tip
  keys do not pile up.
* **Backups** (``backups.json`` next to ``state.json``, its own schema, the same locks): a
  Re-arrange (:meth:`LayoutStore.delete_layout`) keeps the layout it forgets, and a restore of an
  earlier layout (:meth:`LayoutStore.replace_layout` with ``backup=True``) keeps the one it
  replaces. At most :data:`MAX_BACKUPS_PER_LAYOUT` per profile + style + scope (the oldest go
  first), :data:`MAX_BACKUPS` in all, within :data:`MAX_BACKUP_FILE_BYTES`. A separate file, so a
  Session Tree that predates it reads ``state.json`` exactly as before. The backup is written
  before ``state.json``: a writer killed in between leaves an extra backup, never a lost layout.
"""

from __future__ import annotations

import json
import math
import os
import re
import secrets
import threading
import time
from pathlib import Path
from typing import Any, Callable, Optional

try:  # POSIX; on a platform without flock only the thread lock applies.
    import fcntl
except ImportError:  # pragma: no cover - Windows
    fcntl = None  # type: ignore[assignment]

SCHEMA_VERSION = 1

#: The epoch of a ``state.json`` written before epochs existed (until its next write).
LEGACY_EPOCH = "legacy"
#: The epoch served while there is no ``state.json`` (nothing stored yet, or it was deleted).
NO_EPOCH = "none"
#: The epoch served for a file of a newer schema (read-only here).
NEWER_EPOCH = "newer"
#: The 409 detail prefix of a write refused because ``state.json`` has a newer schema.
NEWER_SCHEMA_CODE = "newer_schema"
#: A Re-arrange or restore refused because ``backups.json`` has a newer schema (not
#: ``newer_schema``: the page stays writable, only that one change is refused).
HISTORY_NEWER_CODE = "layout_history_newer"
_EPOCH_RE = re.compile(r"^[0-9a-f]{16,64}$")

#: Caps (module attributes so a test can lower them).
MAX_FILE_BYTES = 8 * 1024 * 1024
MAX_BATCH = 2000
MAX_ENTRIES_PER_LAYOUT = 5000
MAX_LAYOUTS_PER_PROFILE = 256
MAX_PROFILES = 64
MAX_BLOCK_ID = 600
MAX_SCOPE = 1024
MAX_COORD = 1e7
MAX_FORGET = 100

#: ``backups.json``: its own schema version (a separate file from ``state.json``).
BACKUP_SCHEMA_VERSION = 1
MAX_BACKUPS_PER_LAYOUT = 10
MAX_BACKUPS = 200
MAX_BACKUP_FILE_BYTES = 16 * 1024 * 1024
#: Why a backup was kept: a Re-arrange forgot the layout, or a restore replaced it.
BACKUP_REASONS = ("rearrange", "restore")
_BACKUP_ID_RE = re.compile(r"^[0-9a-f]{16}$")
_BACKUP_KEYS = {"id", "profile", "style", "scope", "created_at", "reason", "positions"}

#: A profile name (``hermes_cli.profiles``) or ``*`` (the "All profiles" view has its own layouts).
PROFILE_RE = re.compile(r"^(?:\*|[a-z0-9][a-z0-9_-]{0,63})$")
#: Style ids: the registered ones are ``dense``, ``swimlanes``, ``subway``, ``rich`` (R1); the page
#: falls back to its default for an id it does not know, so the store checks the shape only.
STYLE_RE = re.compile(r"^[a-z][a-z0-9-]{0,31}$")
#: Scope: ``all`` or a project id (an auto project's id is its repo path). Block ids: session
#: ids, ``<profile>/<id>``, ``missing:<profile>/<id>`` (a stand-in), ``group:<project>`` and its continuation
#: labels (``group:<project>\\x1f<n>``). No other control character.
_CONTROL_RE = re.compile(r"[\x00-\x1e\x7f]")
_SCOPE_CONTROL_RE = re.compile(r"[\x00-\x1f\x7f]")

GROUP_PREFIX = "group:"
STANDIN_PREFIX = "missing:"


def _temp_prefix(path: Path) -> str:
    """A writer's temp files of ``path`` (``.state.json.tmp-…``, ``.backups.json.tmp-…``)."""
    return f".{path.name}.tmp-"


class StoreError(Exception):
    """A refusal with the HTTP status the endpoint answers."""

    def __init__(self, status: int, detail: str) -> None:
        super().__init__(detail)
        self.status = status
        self.detail = detail


class CorruptState(Exception):
    pass


class NewerSchema(Exception):
    pass


# --- validation ---------------------------------------------------------------------------------

def check_profile(profile: Any) -> str:
    if not isinstance(profile, str) or not PROFILE_RE.fullmatch(profile):
        raise StoreError(400, "profile must be a profile name or '*'")
    return profile


def check_style(style: Any) -> str:
    if not isinstance(style, str) or not STYLE_RE.fullmatch(style):
        raise StoreError(400, "style must match [a-z][a-z0-9-]{0,31}")
    return style


def check_scope(scope: Any) -> str:
    if not isinstance(scope, str) or not 1 <= len(scope) <= MAX_SCOPE or _SCOPE_CONTROL_RE.search(scope):
        raise StoreError(400, f"scope must be 1-{MAX_SCOPE} characters without control characters")
    return scope


def check_block_id(block: Any) -> str:
    if not isinstance(block, str) or not 1 <= len(block) <= MAX_BLOCK_ID or _CONTROL_RE.search(block):
        raise StoreError(400, f"block id must be 1-{MAX_BLOCK_ID} characters without control characters")
    return block


def _coord(value: Any) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise StoreError(400, "x and y must be numbers")
    number = float(value)
    if not math.isfinite(number) or abs(number) > MAX_COORD:
        raise StoreError(400, f"x and y must be finite and within ±{MAX_COORD:g}")
    return number


def check_positions(entries: Any) -> list[tuple[str, float, float]]:
    """``[{id, x, y}, …]`` → ``[(id, x, y)]``; a repeated id keeps its last entry."""
    if not isinstance(entries, list):
        raise StoreError(400, "positions must be a list of {id, x, y}")
    if len(entries) > MAX_BATCH:
        raise StoreError(413, f"at most {MAX_BATCH} positions per request")
    out: dict[str, tuple[str, float, float]] = {}
    for entry in entries:
        if not isinstance(entry, dict) or set(entry) != {"id", "x", "y"}:
            raise StoreError(400, "each position is exactly {id, x, y}")
        block = check_block_id(entry["id"])
        out[block] = (block, _coord(entry["x"]), _coord(entry["y"]))
    return list(out.values())


def check_settings_patch(patch: Any) -> dict[str, Any]:
    if not isinstance(patch, dict) or not patch or set(patch) - {"style", "snap"}:
        raise StoreError(400, "settings take style and/or snap")
    out: dict[str, Any] = {}
    if "style" in patch:
        out["style"] = check_style(patch["style"])
    if "snap" in patch:
        if not isinstance(patch["snap"], bool):
            raise StoreError(400, "snap must be true or false")
        out["snap"] = patch["snap"]
    return out


def _empty() -> dict[str, Any]:
    return {"schema": SCHEMA_VERSION, "epoch": NO_EPOCH, "rev": 0, "settings": {"style": None, "snap": False}, "layouts": {}}


def _newer(exc: "NewerSchema") -> dict[str, Any]:
    """What a newer-schema file reads as here: empty, read-only, with that file's schema."""
    return {**_empty(), "epoch": NEWER_EPOCH, "store_schema": int(str(exc))}


def new_epoch() -> str:
    return secrets.token_hex(8)


def _validate_file(raw: Any) -> dict[str, Any]:
    """The parsed file, checked as strictly as input (a hand edit is untrusted too)."""
    if not isinstance(raw, dict):
        raise CorruptState("not an object")
    schema = raw.get("schema")
    if isinstance(schema, int) and not isinstance(schema, bool) and schema > SCHEMA_VERSION:
        raise NewerSchema(str(schema))
    keys = set(raw)
    if schema != SCHEMA_VERSION or keys - {"epoch"} != {"schema", "rev", "settings", "layouts"}:
        raise CorruptState("schema")
    if "epoch" in keys:
        if not isinstance(raw["epoch"], str) or not _EPOCH_RE.fullmatch(raw["epoch"]):
            raise CorruptState("epoch")
    else:
        raw["epoch"] = LEGACY_EPOCH
    rev = raw["rev"]
    if isinstance(rev, bool) or not isinstance(rev, int) or rev < 0:
        raise CorruptState("rev")
    settings = raw["settings"]
    if not isinstance(settings, dict) or set(settings) != {"style", "snap"}:
        raise CorruptState("settings")
    if settings["style"] is not None and not (isinstance(settings["style"], str) and STYLE_RE.fullmatch(settings["style"])):
        raise CorruptState("settings.style")
    if not isinstance(settings["snap"], bool):
        raise CorruptState("settings.snap")
    layouts = raw["layouts"]
    if not isinstance(layouts, dict) or len(layouts) > MAX_PROFILES:
        raise CorruptState("layouts")
    try:
        for profile, styles in layouts.items():
            check_profile(profile)
            if not isinstance(styles, dict):
                raise CorruptState("styles")
            for style, scopes in styles.items():
                check_style(style)
                if not isinstance(scopes, dict):
                    raise CorruptState("scopes")
                for scope, blocks in scopes.items():
                    check_scope(scope)
                    if not isinstance(blocks, dict):
                        raise CorruptState("blocks")
                    for block, entry in blocks.items():
                        check_block_id(block)
                        if not isinstance(entry, dict) or set(entry) != {"x", "y", "updated_at"}:
                            raise CorruptState("entry")
                        _coord(entry["x"])
                        _coord(entry["y"])
                        stamp = entry["updated_at"]
                        if isinstance(stamp, bool) or not isinstance(stamp, (int, float)) or not math.isfinite(stamp):
                            raise CorruptState("updated_at")
    except StoreError as exc:
        raise CorruptState(exc.detail) from exc
    return raw


def _empty_backups() -> dict[str, Any]:
    return {"schema": BACKUP_SCHEMA_VERSION, "backups": []}


def new_backup_id() -> str:
    return secrets.token_hex(8)


def _validate_backups(raw: Any) -> dict[str, Any]:
    """The parsed ``backups.json``, checked as strictly as ``state.json``."""
    if not isinstance(raw, dict):
        raise CorruptState("not an object")
    schema = raw.get("schema")
    if isinstance(schema, int) and not isinstance(schema, bool) and schema > BACKUP_SCHEMA_VERSION:
        raise NewerSchema(str(schema))
    if schema != BACKUP_SCHEMA_VERSION or set(raw) != {"schema", "backups"}:
        raise CorruptState("schema")
    backups = raw["backups"]
    if not isinstance(backups, list) or len(backups) > MAX_BACKUPS:
        raise CorruptState("backups")
    seen: set[str] = set()
    try:
        for each in backups:
            if not isinstance(each, dict) or set(each) != _BACKUP_KEYS:
                raise CorruptState("backup")
            if not isinstance(each["id"], str) or not _BACKUP_ID_RE.fullmatch(each["id"]) or each["id"] in seen:
                raise CorruptState("backup.id")
            seen.add(each["id"])
            check_profile(each["profile"])
            check_style(each["style"])
            check_scope(each["scope"])
            stamp = each["created_at"]
            if isinstance(stamp, bool) or not isinstance(stamp, (int, float)) or not math.isfinite(stamp):
                raise CorruptState("backup.created_at")
            if each["reason"] not in BACKUP_REASONS:
                raise CorruptState("backup.reason")
            positions = each["positions"]
            if not isinstance(positions, dict) or not 1 <= len(positions) <= MAX_ENTRIES_PER_LAYOUT:
                raise CorruptState("backup.positions")
            for block, point in positions.items():
                check_block_id(block)
                if not isinstance(point, dict) or set(point) != {"x", "y"}:
                    raise CorruptState("backup.point")
                _coord(point["x"])
                _coord(point["y"])
    except StoreError as exc:
        raise CorruptState(exc.detail) from exc
    return raw


def _encode(data: dict[str, Any]) -> bytes:
    return json.dumps(data, ensure_ascii=False, separators=(",", ":"), sort_keys=True, allow_nan=False).encode("utf-8")


def _trimmed_backups(backups: list[dict[str, Any]], newest: str) -> list[dict[str, Any]]:
    """Oldest first in, oldest first out: at most :data:`MAX_BACKUPS_PER_LAYOUT` per layout,
    :data:`MAX_BACKUPS` in all, the file within :data:`MAX_BACKUP_FILE_BYTES` (``newest`` stays).
    The global caps drop the oldest backup of a layout that has more than one first, so every
    layout keeps its newest backup while it can."""
    per_layout: dict[tuple[str, str, str], int] = {}
    kept: list[dict[str, Any]] = []
    for each in reversed(backups):
        layout = (each["profile"], each["style"], each["scope"])
        per_layout[layout] = per_layout.get(layout, 0) + 1
        if per_layout[layout] <= MAX_BACKUPS_PER_LAYOUT:
            kept.append(each)
    kept.reverse()
    sizes = [len(_encode(each)) + 1 for each in kept]
    total = len(_encode(_empty_backups())) + sum(sizes)
    counts: dict[tuple[str, str, str], int] = {}
    for each in kept:
        layout = (each["profile"], each["style"], each["scope"])
        counts[layout] = counts.get(layout, 0) + 1
    while len(kept) > 1 and (len(kept) > MAX_BACKUPS or total > MAX_BACKUP_FILE_BYTES):
        layouts = [(each["profile"], each["style"], each["scope"]) for each in kept]
        oldest = next((index for index, each in enumerate(kept) if each["id"] != newest and counts[layouts[index]] > 1), None)
        if oldest is None:
            oldest = next(index for index, each in enumerate(kept) if each["id"] != newest)
        counts[layouts[oldest]] -= 1
        total -= sizes.pop(oldest)
        del kept[oldest]
    return kept


def is_session_entry(block: str) -> bool:
    return not block.startswith(GROUP_PREFIX) and not block.startswith(STANDIN_PREFIX)


def split_session_entry(block: str) -> tuple[Optional[str], str]:
    """``<profile>/<id>`` → (profile, id); a bare id → (None, id). Session ids hold no ``/``."""
    profile, sep, sid = block.partition("/")
    return (profile, sid) if sep else (None, block)


# --- the store ----------------------------------------------------------------------------------

class LayoutStore:
    """See the module docstring. One instance per state file per process."""

    def __init__(self, path: Path, *, clock: Callable[[], float] = time.time) -> None:
        self.path = Path(path)
        self.lock_path = self.path.with_name("state.lock")
        self.backups_path = self.path.with_name("backups.json")
        self._clock = clock
        self._thread_lock = threading.Lock()
        self._last_stamp = 0.0

    # locking ----------------------------------------------------------------------------------

    class _Locked:
        def __init__(self, store: "LayoutStore") -> None:
            self.store = store
            self.handle = None

        def __enter__(self):
            self.store._thread_lock.acquire()
            try:
                if fcntl is not None:
                    self.store.path.parent.mkdir(parents=True, exist_ok=True)
                    self.handle = open(self.store.lock_path, "a+b")
                    fcntl.flock(self.handle.fileno(), fcntl.LOCK_EX)
            except BaseException:
                self.store._thread_lock.release()
                raise
            return self

        def __exit__(self, *exc):
            try:
                if self.handle is not None and fcntl is not None:
                    fcntl.flock(self.handle.fileno(), fcntl.LOCK_UN)
                    self.handle.close()
            finally:
                self.store._thread_lock.release()

    def _locked(self) -> "LayoutStore._Locked":
        return LayoutStore._Locked(self)

    # file I/O ---------------------------------------------------------------------------------

    def _read_file(self) -> dict[str, Any]:
        """The current state; raises CorruptState / NewerSchema. No lock: ``os.replace`` is atomic."""
        try:
            data = self.path.read_bytes()
        except FileNotFoundError:
            return _empty()
        if len(data) > MAX_FILE_BYTES:
            raise CorruptState("too large")
        try:
            raw = json.loads(data.decode("utf-8"), parse_constant=_refuse_constant)
        except (UnicodeDecodeError, ValueError) as exc:
            raise CorruptState(str(exc)) from exc
        return _validate_file(raw)

    def _load_locked(self, *, for_write: bool) -> dict[str, Any]:
        """Under the locks: the state, a corrupt file moved aside first (``.bak``)."""
        try:
            return self._read_file()
        except CorruptState:
            self._backup_corrupt(self.path)
            return _empty()
        except NewerSchema as exc:
            if for_write:
                raise StoreError(409, f"{NEWER_SCHEMA_CODE}: state.json has schema {exc}; this Session Tree writes schema {SCHEMA_VERSION}") from exc
            return _newer(exc)

    def _backup_corrupt(self, path: Path) -> None:
        if not path.exists():
            return
        stamp = time.strftime("%Y%m%dT%H%M%S", time.gmtime())
        target = path.with_name(f"{path.name}.corrupt-{stamp}-{secrets.token_hex(3)}.bak")
        os.replace(path, target)
        _fsync_dir(path.parent)

    def _remove_stale_temps(self, path: Path) -> None:
        # Every writer holds the locks while its temp file exists: under them, any temp is stale.
        for stale in path.parent.glob(f"{_temp_prefix(path)}*"):
            try:
                stale.unlink()
            except OSError:
                pass

    def _write_locked(self, state: dict[str, Any]) -> None:
        data = json.dumps(state, ensure_ascii=False, separators=(",", ":"), sort_keys=True, allow_nan=False).encode("utf-8")
        if len(data) > MAX_FILE_BYTES:
            raise StoreError(413, f"the layout store would exceed {MAX_FILE_BYTES} bytes")
        self._replace_file_locked(self.path, data)

    def _replace_file_locked(self, path: Path, data: bytes) -> None:
        """Under the locks: ``path`` becomes ``data`` atomically (temp file, fsync, ``os.replace``)."""
        path.parent.mkdir(parents=True, exist_ok=True)
        self._remove_stale_temps(path)
        temp = path.with_name(f"{_temp_prefix(path)}{os.getpid()}-{secrets.token_hex(4)}")
        try:
            with open(temp, "wb") as handle:
                handle.write(data)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temp, path)
        except BaseException:
            try:
                temp.unlink()
            except OSError:
                pass
            raise
        _fsync_dir(path.parent)

    def _stamp(self) -> float:
        """Server receive time, strictly increasing within this process (a tie cannot reorder)."""
        now = float(self._clock())
        if now <= self._last_stamp:
            now = math.nextafter(self._last_stamp, math.inf)
        self._last_stamp = now
        return now

    def _mutate(self, change: Callable[[dict[str, Any], float], bool],
                before_write: Optional[Callable[[float], None]] = None) -> tuple[dict[str, Any], bool]:
        """Re-read under the locks, apply ``change`` (False: nothing changed), bump rev, write; (state, changed).
        ``before_write(stamp)`` runs under the same locks once ``change`` changed something, before
        ``state.json`` is written (a backup of what the change removed); it may refuse (raise)."""
        with self._locked():
            state = self._load_locked(for_write=True)
            stamp = self._stamp()
            # Another process may have stamped later than this process's clock reads.
            stamp = max(stamp, math.nextafter(_max_stamp(state), math.inf))
            self._last_stamp = stamp
            changed = bool(change(state, stamp))
            if changed:
                if before_write is not None:
                    before_write(stamp)
                state["rev"] += 1
                if state["epoch"] in (NO_EPOCH, LEGACY_EPOCH):
                    # A fresh file (first write, after a corrupt one or a deletion), or the first
                    # write of a pre-epoch file: a new epoch.
                    state["epoch"] = new_epoch()
                self._write_locked(state)
            return state, changed

    # backups ----------------------------------------------------------------------------------

    def _read_backups_file(self) -> dict[str, Any]:
        """``backups.json``; raises CorruptState / NewerSchema. No lock: ``os.replace`` is atomic."""
        try:
            data = self.backups_path.read_bytes()
        except FileNotFoundError:
            return _empty_backups()
        if len(data) > MAX_BACKUP_FILE_BYTES:
            raise CorruptState("too large")
        try:
            raw = json.loads(data.decode("utf-8"), parse_constant=_refuse_constant)
        except (UnicodeDecodeError, ValueError) as exc:
            raise CorruptState(str(exc)) from exc
        return _validate_backups(raw)

    def _load_backups_locked(self, *, for_write: bool) -> dict[str, Any]:
        """Under the locks: the backups, a corrupt file moved aside first (``.bak``)."""
        try:
            return self._read_backups_file()
        except CorruptState:
            self._backup_corrupt(self.backups_path)
            return _empty_backups()
        except NewerSchema as exc:
            if for_write:
                # Not ``newer_schema``: that one turns the page read-only (state.json is fine).
                raise StoreError(409, f"{HISTORY_NEWER_CODE}: Layout history (backups.json, schema {exc}) was written by a newer "
                                      f"Session Tree; this one writes schema {BACKUP_SCHEMA_VERSION}, so it does not re-arrange "
                                      f"or restore a layout it could not keep a backup of") from exc
            return {**_empty_backups(), "read_only": True}

    def _read_backups(self) -> dict[str, Any]:
        try:
            return self._read_backups_file()
        except NewerSchema:
            return {**_empty_backups(), "read_only": True}
        except CorruptState:
            with self._locked():
                return self._load_backups_locked(for_write=False)

    def _keep_backup_locked(self, profile: str, style: str, scope: str, blocks: dict[str, Any], reason: str,
                            stamp: float) -> Optional[str]:
        """Under the locks: keep ``blocks`` (one layout's stored entries) as a backup; its id.
        An arrangement that layout already has a backup of keeps one copy, now the newest."""
        if not blocks:
            return None
        data = self._load_backups_locked(for_write=True)
        positions = {block: {"x": entry["x"], "y": entry["y"]} for block, entry in blocks.items()}
        same = [each for each in data["backups"]
                if (each["profile"], each["style"], each["scope"]) == (profile, style, scope) and each["positions"] == positions]
        taken = {each["id"] for each in data["backups"]}
        if same:
            # The same arrangement again (a Re-arrange after an Undo): one backup, now the newest.
            backup_id = same[-1]["id"]
            data["backups"] = [each for each in data["backups"] if each not in same]
        else:
            backup_id = new_backup_id()
            while backup_id in taken:
                backup_id = new_backup_id()
        data["backups"].append({"id": backup_id, "profile": profile, "style": style, "scope": scope,
                                "created_at": stamp, "reason": reason, "positions": positions})
        data["backups"] = _trimmed_backups(data["backups"], backup_id)
        self._replace_file_locked(self.backups_path, _encode(data))
        return backup_id

    def list_backups(self, profile: str, style: str, scope: str) -> dict[str, Any]:
        """One layout's backups, newest first, without their positions."""
        check_profile(profile)
        check_style(style)
        check_scope(scope)
        data = self._read_backups()
        items = [{"id": each["id"], "created_at": each["created_at"], "reason": each["reason"], "count": len(each["positions"])}
                 for each in reversed(data["backups"])
                 if (each["profile"], each["style"], each["scope"]) == (profile, style, scope)]
        return {"ok": True, "backups": items, "read_only": bool(data.get("read_only"))}

    def get_backup(self, profile: str, backup_id: Any) -> dict[str, Any]:
        """One backup of ``profile`` with its positions (``[{id, x, y}]``, what ``replace_layout`` takes)."""
        check_profile(profile)
        if not isinstance(backup_id, str) or not _BACKUP_ID_RE.fullmatch(backup_id):
            raise StoreError(400, "backup id must be 16 hex characters")
        for each in self._read_backups()["backups"]:
            if each["id"] == backup_id and each["profile"] == profile:
                return {"ok": True, "id": each["id"], "style": each["style"], "scope": each["scope"],
                        "created_at": each["created_at"], "reason": each["reason"],
                        "positions": [{"id": block, "x": point["x"], "y": point["y"]} for block, point in each["positions"].items()]}
        raise StoreError(404, "no such backup")

    # reads ------------------------------------------------------------------------------------

    def read(self) -> dict[str, Any]:
        """The whole state. A corrupt file is moved aside (under the locks) and reads as empty."""
        try:
            return self._read_file()
        except NewerSchema as exc:
            return _newer(exc)
        except CorruptState:
            with self._locked():
                return self._load_locked(for_write=False)

    def revision(self) -> int:
        return self.read()["rev"]

    def version(self) -> tuple[str, int]:
        """``(epoch, rev)``: what names the served state (the ``since_rev`` + ``epoch`` poll)."""
        state = self.read()
        return state["epoch"], state["rev"]

    def snapshot(self, profile: str) -> dict[str, Any]:
        """What one profile's page needs: schema, epoch, rev, settings, that profile's layouts,
        and ``read_only`` (the file has a newer schema, ``store_schema``: every write answers 409)."""
        check_profile(profile)
        state = self.read()
        out = {"schema": SCHEMA_VERSION, "epoch": state["epoch"], "rev": state["rev"], "settings": dict(state["settings"]),
               "layouts": state["layouts"].get(profile, {}), "read_only": "store_schema" in state}
        if "store_schema" in state:
            out["store_schema"] = state["store_schema"]
        return out

    # writes -----------------------------------------------------------------------------------

    def upsert_positions(self, profile: str, style: str, scope: str, entries: Any, *, if_absent: bool = False) -> dict[str, Any]:
        """A batch of block positions. ``if_absent``: only blocks with no stored entry (what an
        auto-layout placed); otherwise each one replaces the stored entry (a drop)."""
        check_profile(profile)
        check_style(style)
        check_scope(scope)
        items = check_positions(entries)
        counts = {"applied": 0, "skipped": 0, "updated_at": None}

        def change(state: dict[str, Any], stamp: float) -> bool:
            blocks = _layout(state, profile, style, scope, create=True)
            for block, x, y in items:
                if if_absent and block in blocks:
                    counts["skipped"] += 1
                    continue
                blocks[block] = {"x": x, "y": y, "updated_at": stamp}
                counts["applied"] += 1
            if len(blocks) > MAX_ENTRIES_PER_LAYOUT:
                raise StoreError(413, f"at most {MAX_ENTRIES_PER_LAYOUT} positions per layout")
            if counts["applied"] == 0:
                return False
            counts["updated_at"] = stamp
            return True

        state, changed = self._mutate(change)
        return {"ok": True, "epoch": state["epoch"], "rev": state["rev"], "changed": changed, **counts}

    def set_settings(self, patch: Any) -> dict[str, Any]:
        values = check_settings_patch(patch)

        def change(state: dict[str, Any], _stamp: float) -> bool:
            if all(state["settings"].get(key) == value for key, value in values.items()):
                return False
            state["settings"].update(values)
            return True

        state, changed = self._mutate(change)
        return {"ok": True, "epoch": state["epoch"], "rev": state["rev"], "changed": changed, "settings": dict(state["settings"])}

    def delete_layout(self, profile: str, style: str, scope: str) -> dict[str, Any]:
        """Re-arrange: forget one style + scope layout; answers what was removed (for Undo) and
        the backup kept of it (``backup_id``; ``None`` when there was nothing stored)."""
        check_profile(profile)
        check_style(style)
        check_scope(scope)
        removed: dict[str, Any] = {}
        kept: list[Optional[str]] = [None]

        def change(state: dict[str, Any], _stamp: float) -> bool:
            styles = state["layouts"].get(profile, {})
            blocks = styles.get(style, {}).pop(scope, None)
            if blocks is None:
                return False
            removed.update(blocks)
            _drop_empty(state, profile, style)
            return True

        def keep(stamp: float) -> None:
            kept[0] = self._keep_backup_locked(profile, style, scope, removed, "rearrange", stamp)

        state, changed = self._mutate(change, keep)
        return {"ok": True, "epoch": state["epoch"], "rev": state["rev"], "changed": changed, "removed": removed, "backup_id": kept[0]}

    def replace_layout(self, profile: str, style: str, scope: str, entries: Any, *, backup: bool = False) -> dict[str, Any]:
        """Undo of a Re-arrange, or a restore of a backup: this style + scope layout becomes
        exactly ``entries``. ``backup``: the layout it replaces is kept as a backup first (a
        restore is itself restorable); ``backup_id`` names it."""
        check_profile(profile)
        check_style(style)
        check_scope(scope)
        # A whole layout may be larger than one upsert batch: it is capped by the layout cap.
        if not isinstance(entries, list):
            raise StoreError(400, "positions must be a list of {id, x, y}")
        if len(entries) > MAX_ENTRIES_PER_LAYOUT:
            raise StoreError(413, f"at most {MAX_ENTRIES_PER_LAYOUT} positions per layout")
        items = _check_many(entries)
        replaced: dict[str, Any] = {}
        kept: list[Optional[str]] = [None]

        def change(state: dict[str, Any], stamp: float) -> bool:
            replaced.update(state["layouts"].get(profile, {}).get(style, {}).get(scope, {}))
            if not items:
                had = scope in state["layouts"].get(profile, {}).get(style, {})
                state["layouts"].get(profile, {}).get(style, {}).pop(scope, None)
                _drop_empty(state, profile, style)
                return had
            blocks = _layout(state, profile, style, scope, create=True)
            blocks.clear()
            for block, x, y in items:
                blocks[block] = {"x": x, "y": y, "updated_at": stamp}
            return True

        def keep(stamp: float) -> None:
            if backup:
                kept[0] = self._keep_backup_locked(profile, style, scope, replaced, "restore", stamp)

        state, changed = self._mutate(change, keep)
        return {"ok": True, "epoch": state["epoch"], "rev": state["rev"], "changed": changed, "count": len(items), "backup_id": kept[0]}

    def forget_blocks(self, profile: str, ids: Any) -> dict[str, Any]:
        """A session moved to another project: drop these blocks from every layout of
        ``profile``, so each layout places them anew (in their new project's band)."""
        check_profile(profile)
        if not isinstance(ids, list) or not ids or len(ids) > MAX_FORGET:
            raise StoreError(400 if not isinstance(ids, list) or not ids else 413, f"ids must be a list of 1-{MAX_FORGET} block ids")
        wanted = {check_block_id(block) for block in ids}
        removed = [0]

        def change(state: dict[str, Any], _stamp: float) -> bool:
            # A restored backup must not put the block back in its old project's band either
            # (also when no current layout holds it).
            self._forget_in_backups_locked(profile, wanted)
            for style, scopes in list(state["layouts"].get(profile, {}).items()):
                for scope, blocks in list(scopes.items()):
                    for block in wanted & set(blocks):
                        del blocks[block]
                        removed[0] += 1
                    if not blocks:
                        del scopes[scope]
                _drop_empty(state, profile, style)
            return removed[0] > 0

        state, changed = self._mutate(change)
        return {"ok": True, "epoch": state["epoch"], "rev": state["rev"], "changed": changed, "removed": removed[0]}

    def _forget_in_backups_locked(self, profile: str, wanted: set[str]) -> None:
        try:
            data = self._read_backups_file()
        except CorruptState:
            self._backup_corrupt(self.backups_path)
            return
        except NewerSchema:
            # A newer Session Tree's history: not ours to rewrite, and no reason to refuse a move.
            return
        changed = False
        kept: list[dict[str, Any]] = []
        for each in data["backups"]:
            if each["profile"] == profile and wanted & set(each["positions"]):
                changed = True
                each["positions"] = {block: point for block, point in each["positions"].items() if block not in wanted}
                if not each["positions"]:
                    continue
            kept.append(each)
        if changed:
            data["backups"] = kept
            self._replace_file_locked(self.backups_path, _encode(data))

    def prune(self, profile: str, existing: Callable[[dict[Optional[str], set[str]]], Optional[dict[Optional[str], Any]]]) -> int:
        """Drop the positions of sessions that no longer exist from ``profile``'s layouts, and
        canonicalise compression lineages to their root key (card-4 review B2 + NB3).

        ``existing({profile_or_None: {ids}})`` answers, per key, the ids that still exist
        (archived ones too) as ``{id: lineage_root_id}`` (a plain set means every id is its own
        root); ``None`` key = bare ids of the view's own profile(s). It answers ``None`` when that
        cannot be known (a store read failed): then nothing is pruned or moved. Group labels and
        stand-ins are not sessions and stay.

        An entry keyed by a non-root member of a lineage (an old tip, a middle segment) moves to
        the root's key; when the root key already has an entry the newer by ``updated_at`` wins,
        and the member key is dropped either way. Answers how many entries were dropped or moved.
        """
        check_profile(profile)
        candidates = _session_candidates(self.read(), profile)
        if not candidates:
            return 0
        answer = existing({key: set(ids) for key, ids in candidates.items()})
        if answer is None:
            return 0
        alive: dict[Optional[str], dict[str, str]] = {
            key: (dict(found) if isinstance(found, dict) else {sid: sid for sid in found}) for key, found in answer.items()}

        def settled(key: Optional[str], sid: str) -> bool:
            return alive.get(key, {}).get(sid) == sid

        if all(settled(key, sid) for key, ids in candidates.items() for sid in ids):
            return 0
        changes = [0]

        def change(state: dict[str, Any], _stamp: float) -> bool:
            for style, scopes in list(state["layouts"].get(profile, {}).items()):
                for scope, blocks in list(scopes.items()):
                    for block in list(blocks):
                        if not is_session_entry(block) or block not in blocks:
                            continue
                        key, sid = split_session_entry(block)
                        if key not in candidates or sid not in candidates[key]:
                            continue  # stored after the existence check: next time
                        if sid not in alive.get(key, {}):
                            del blocks[block]
                            changes[0] += 1
                            continue
                        root = alive[key][sid]
                        if not root or root == sid:
                            continue
                        target = f"{key}/{root}" if key is not None else root
                        entry = blocks.pop(block)
                        held = blocks.get(target)
                        if held is None or entry["updated_at"] > held["updated_at"]:
                            blocks[target] = entry
                        changes[0] += 1
                    if not blocks:
                        del scopes[scope]
                _drop_empty(state, profile, style)
            return changes[0] > 0

        self._mutate(change)
        return changes[0]


def _check_many(entries: list[Any]) -> list[tuple[str, float, float]]:
    out: list[tuple[str, float, float]] = []
    for start in range(0, len(entries), MAX_BATCH):
        out.extend(check_positions(entries[start:start + MAX_BATCH]))
    return list({block: (block, x, y) for block, x, y in out}.values())


def _session_candidates(state: dict[str, Any], profile: str) -> dict[Optional[str], set[str]]:
    out: dict[Optional[str], set[str]] = {}
    for scopes in state["layouts"].get(profile, {}).values():
        for blocks in scopes.values():
            for block in blocks:
                if is_session_entry(block):
                    key, sid = split_session_entry(block)
                    out.setdefault(key, set()).add(sid)
    return out


def _layout(state: dict[str, Any], profile: str, style: str, scope: str, *, create: bool) -> dict[str, Any]:
    layouts = state["layouts"]
    if profile not in layouts:
        if len(layouts) >= MAX_PROFILES:
            raise StoreError(413, f"at most {MAX_PROFILES} profiles in the layout store")
        layouts[profile] = {}
    styles = layouts[profile]
    scopes = styles.setdefault(style, {})
    if scope not in scopes:
        if sum(len(each) for each in styles.values()) >= MAX_LAYOUTS_PER_PROFILE:
            raise StoreError(413, f"at most {MAX_LAYOUTS_PER_PROFILE} layouts per profile")
        scopes[scope] = {}
    return scopes[scope]


def _drop_empty(state: dict[str, Any], profile: str, style: str) -> None:
    styles = state["layouts"].get(profile)
    if styles is None:
        return
    if not styles.get(style):
        styles.pop(style, None)
    if not styles:
        state["layouts"].pop(profile, None)


def _max_stamp(state: dict[str, Any]) -> float:
    best = 0.0
    for styles in state["layouts"].values():
        for scopes in styles.values():
            for blocks in scopes.values():
                for entry in blocks.values():
                    if entry["updated_at"] > best:
                        best = float(entry["updated_at"])
    return best


def _refuse_constant(name: str) -> Any:
    raise ValueError(f"{name} is not valid in state.json")


def _fsync_dir(folder: Path) -> None:
    try:
        fd = os.open(folder, os.O_RDONLY)
    except OSError:
        return
    try:
        os.fsync(fd)
    except OSError:
        pass
    finally:
        os.close(fd)
