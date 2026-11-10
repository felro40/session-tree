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
  served. A file of a newer schema is left alone: served as empty, never overwritten (409).
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

_TEMP_PREFIX = ".state.json.tmp-"


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
    return {"schema": SCHEMA_VERSION, "rev": 0, "settings": {"style": None, "snap": False}, "layouts": {}}


def _validate_file(raw: Any) -> dict[str, Any]:
    """The parsed file, checked as strictly as input (a hand edit is untrusted too)."""
    if not isinstance(raw, dict):
        raise CorruptState("not an object")
    schema = raw.get("schema")
    if isinstance(schema, int) and not isinstance(schema, bool) and schema > SCHEMA_VERSION:
        raise NewerSchema(str(schema))
    if schema != SCHEMA_VERSION or set(raw) != {"schema", "rev", "settings", "layouts"}:
        raise CorruptState("schema")
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
            self._backup_corrupt()
            return _empty()
        except NewerSchema as exc:
            if for_write:
                raise StoreError(409, f"state.json has schema {exc}; this Session Tree writes schema {SCHEMA_VERSION}") from exc
            return _empty()

    def _backup_corrupt(self) -> None:
        if not self.path.exists():
            return
        stamp = time.strftime("%Y%m%dT%H%M%S", time.gmtime())
        target = self.path.with_name(f"state.json.corrupt-{stamp}-{secrets.token_hex(3)}.bak")
        os.replace(self.path, target)
        _fsync_dir(self.path.parent)

    def _remove_stale_temps(self) -> None:
        # Every writer holds the locks while its temp file exists: under them, any temp is stale.
        for stale in self.path.parent.glob(f"{_TEMP_PREFIX}*"):
            try:
                stale.unlink()
            except OSError:
                pass

    def _write_locked(self, state: dict[str, Any]) -> None:
        data = json.dumps(state, ensure_ascii=False, separators=(",", ":"), sort_keys=True, allow_nan=False).encode("utf-8")
        if len(data) > MAX_FILE_BYTES:
            raise StoreError(413, f"the layout store would exceed {MAX_FILE_BYTES} bytes")
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._remove_stale_temps()
        temp = self.path.with_name(f"{_TEMP_PREFIX}{os.getpid()}-{secrets.token_hex(4)}")
        try:
            with open(temp, "wb") as handle:
                handle.write(data)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temp, self.path)
        except BaseException:
            try:
                temp.unlink()
            except OSError:
                pass
            raise
        _fsync_dir(self.path.parent)

    def _stamp(self) -> float:
        """Server receive time, strictly increasing within this process (a tie cannot reorder)."""
        now = float(self._clock())
        if now <= self._last_stamp:
            now = math.nextafter(self._last_stamp, math.inf)
        self._last_stamp = now
        return now

    def _mutate(self, change: Callable[[dict[str, Any], float], bool]) -> tuple[dict[str, Any], bool]:
        """Re-read under the locks, apply ``change`` (False: nothing changed), bump rev, write; (state, changed)."""
        with self._locked():
            state = self._load_locked(for_write=True)
            stamp = self._stamp()
            # Another process may have stamped later than this process's clock reads.
            stamp = max(stamp, math.nextafter(_max_stamp(state), math.inf))
            self._last_stamp = stamp
            changed = bool(change(state, stamp))
            if changed:
                state["rev"] += 1
                self._write_locked(state)
            return state, changed

    # reads ------------------------------------------------------------------------------------

    def read(self) -> dict[str, Any]:
        """The whole state. A corrupt file is moved aside (under the locks) and reads as empty."""
        try:
            return self._read_file()
        except NewerSchema:
            return _empty()
        except CorruptState:
            with self._locked():
                return self._load_locked(for_write=False)

    def revision(self) -> int:
        return self.read()["rev"]

    def snapshot(self, profile: str) -> dict[str, Any]:
        """What one profile's page needs: schema, rev, settings, that profile's layouts."""
        check_profile(profile)
        state = self.read()
        return {"schema": SCHEMA_VERSION, "rev": state["rev"], "settings": dict(state["settings"]),
                "layouts": state["layouts"].get(profile, {})}

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
        return {"ok": True, "rev": state["rev"], "changed": changed, **counts}

    def set_settings(self, patch: Any) -> dict[str, Any]:
        values = check_settings_patch(patch)

        def change(state: dict[str, Any], _stamp: float) -> bool:
            if all(state["settings"].get(key) == value for key, value in values.items()):
                return False
            state["settings"].update(values)
            return True

        state, changed = self._mutate(change)
        return {"ok": True, "rev": state["rev"], "changed": changed, "settings": dict(state["settings"])}

    def delete_layout(self, profile: str, style: str, scope: str) -> dict[str, Any]:
        """Re-arrange: forget one style + scope layout; answers what was removed (for Undo)."""
        check_profile(profile)
        check_style(style)
        check_scope(scope)
        removed: dict[str, Any] = {}

        def change(state: dict[str, Any], _stamp: float) -> bool:
            styles = state["layouts"].get(profile, {})
            blocks = styles.get(style, {}).pop(scope, None)
            if blocks is None:
                return False
            removed.update(blocks)
            _drop_empty(state, profile, style)
            return True

        state, changed = self._mutate(change)
        return {"ok": True, "rev": state["rev"], "changed": changed, "removed": removed}

    def replace_layout(self, profile: str, style: str, scope: str, entries: Any) -> dict[str, Any]:
        """Undo of a Re-arrange: this style + scope layout becomes exactly ``entries``."""
        check_profile(profile)
        check_style(style)
        check_scope(scope)
        # A whole layout may be larger than one upsert batch: it is capped by the layout cap.
        if not isinstance(entries, list):
            raise StoreError(400, "positions must be a list of {id, x, y}")
        if len(entries) > MAX_ENTRIES_PER_LAYOUT:
            raise StoreError(413, f"at most {MAX_ENTRIES_PER_LAYOUT} positions per layout")
        items = _check_many(entries)

        def change(state: dict[str, Any], stamp: float) -> bool:
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

        state, changed = self._mutate(change)
        return {"ok": True, "rev": state["rev"], "changed": changed, "count": len(items)}

    def forget_blocks(self, profile: str, ids: Any) -> dict[str, Any]:
        """A session moved to another project: drop these blocks from every layout of
        ``profile``, so each layout places them anew (in their new project's band)."""
        check_profile(profile)
        if not isinstance(ids, list) or not ids or len(ids) > MAX_FORGET:
            raise StoreError(400 if not isinstance(ids, list) or not ids else 413, f"ids must be a list of 1-{MAX_FORGET} block ids")
        wanted = {check_block_id(block) for block in ids}
        removed = [0]

        def change(state: dict[str, Any], _stamp: float) -> bool:
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
        return {"ok": True, "rev": state["rev"], "changed": changed, "removed": removed[0]}

    def prune(self, profile: str, existing: Callable[[dict[Optional[str], set[str]]], Optional[dict[Optional[str], set[str]]]]) -> int:
        """Drop the positions of sessions that no longer exist from ``profile``'s layouts.

        ``existing({profile_or_None: {ids}})`` answers which of those ids still exist (archived
        ones too), per key; ``None`` key = bare ids of the view's own profile(s). It answers
        ``None`` when that cannot be known (a store read failed): then nothing is pruned. Group
        labels and stand-ins are not sessions and stay.
        """
        check_profile(profile)
        candidates = _session_candidates(self.read(), profile)
        if not candidates:
            return 0
        alive = existing({key: set(ids) for key, ids in candidates.items()})
        if alive is None:
            return 0
        if all(ids <= alive.get(key, set()) for key, ids in candidates.items()):
            return 0
        removed = [0]

        def change(state: dict[str, Any], _stamp: float) -> bool:
            for style, scopes in list(state["layouts"].get(profile, {}).items()):
                for scope, blocks in list(scopes.items()):
                    for block in list(blocks):
                        if not is_session_entry(block):
                            continue
                        key, sid = split_session_entry(block)
                        if key in candidates and sid in candidates[key] and sid not in alive.get(key, set()):
                            del blocks[block]
                            removed[0] += 1
                    if not blocks:
                        del scopes[scope]
                _drop_empty(state, profile, style)
            return removed[0] > 0

        self._mutate(change)
        return removed[0]


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
