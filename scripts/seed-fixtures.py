#!/usr/bin/env python3
"""Seed the isolated test Hermes with Session Tree fixtures. NEVER run it against a real home.

Usage (the harness runs it; see scripts/e2e/harness.ts ``seedFixtures``)::

    HERMES_HOME=<test home> HERMES_AGENT_DIR=<hermes checkout> SESSION_TREE_PROJECTS_DIR=<dir> \\
        <hermes venv python> scripts/seed-fixtures.py [--touch]

Rows are created through Hermes's own ``SessionDB`` API (``create_session`` with the same
``model_config`` markers the real code paths write, ``append_message``, ``update_token_counts``,
``end_session``, ``set_session_title``, ``set_session_archived``, ``set_session_pinned``,
``delete_session``), so they carry real lineage markers:

* ``/branch`` child:  ``model_config={'_branched_from': parent}`` + ``parent_session_id``
  (``hermes_state_mutation_branch.branch_in_transaction``).
* ``/new`` reset:     ``model_config={'_reset_from': prev}`` + ``parent_session_id``, predecessor ended
  ``session_reset`` (``hermes_state_mutation_reset.reset_in_transaction``).
* compression:        predecessor ended ``compression``, continuation has ``parent_session_id`` only.
* delegate child:     ``model_config={'_delegate_from': parent}`` + ``parent_session_id``.

DIRECT SQL is used only on this isolated fixture DB, and only for fields no API sets: backdating
``started_at`` / ``last_activity_at`` / ``ended_at`` so rows have realistic ages.

``--touch`` renames one fixture through ``set_session_title`` (a real state.db change, used by the
e2e to provoke ``sessions.changed``). ``--branch NEW_ID PARENT_ID [TITLE]`` adds a ``/branch`` child
of a seeded session through the same API (the live-refresh check); ``--unowned-branch`` does the same
without the owner stamp (the actions e2e's real ``permission_denied`` refusal). ``--activate ID`` re-opens a
session and stamps its last activity now (fixture-only direct SQL on timestamps, like the backdating),
so the core list's 300 s ``is_active`` heuristic reports it. Prints a JSON manifest of what it created.

Every row carries the owner stamp a signed-in Webapp tab gives the rows it creates (``user_id`` = the
host owner's subject, see ``OWNER``), so the core accepts that login's sidebar edits of them.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path

HOME = Path(os.environ["HERMES_HOME"]).resolve()
if HOME == (Path.home() / ".hermes").resolve() or "/.hermes" in str(HOME):
    sys.exit("refusing to seed a home under ~/.hermes")
sys.path.insert(0, os.environ.get("HERMES_AGENT_DIR", str(Path.home() / ".hermes" / "hermes-agent")))

from hermes_state import SessionDB  # noqa: E402
from gateway.owner_identity import host_owner_subject  # noqa: E402

#: The owner stamp a session created from a signed-in Webapp tab carries
#: (``tui_gateway/session_transports.py`` ``_transport_auth_user_id``: the host owner's OS
#: subject). The core refuses sidebar edits (rename, archive, pin, read state) of unowned
#: history from a Webapp login (``gateway/session_local_migration.py`` ``require_history_claim``),
#: so the fixtures carry it like real rows do.
OWNER = host_owner_subject()

PROJECTS_DIR = Path(os.environ.get("SESSION_TREE_PROJECTS_DIR", HOME.parent / "projects")).resolve()
PROJECTS = ("syscanvas", "mdesign", "hermes-plugins")
NOW = time.time()
HOUR = 3600.0
DAY = 24 * HOUR
MARKER = "st-fixture-root"
SECOND_PROFILE = "work"
SCALE_PROFILE = "scale"


def project_dir(name: str | None) -> str | None:
    return str(PROJECTS_DIR / name) if name else None


def ensure_repos() -> None:
    """Real git repos, so ``projects.tree`` groups the sessions by repo root."""
    for name in PROJECTS:
        path = PROJECTS_DIR / name
        path.mkdir(parents=True, exist_ok=True)
        if not (path / ".git").exists():
            subprocess.run(["git", "init", "-q", "-b", "main", str(path)], check=True)
        (path / "README.md").write_text(f"# {name}\n", encoding="utf-8")


class Seeder:
    def __init__(self, db: SessionDB, profile: str):
        self.db = db
        self.profile = profile
        self.created: list[str] = []

    def _backdate(self, sid: str, started: float, last: float, ended: float | None) -> None:
        # Fixture-only direct SQL: no SessionDB API sets historical timestamps.
        def write(conn):
            conn.execute("UPDATE sessions SET started_at=?, last_activity_at=? WHERE id=?", (started, last, sid))
            if ended is not None:
                conn.execute("UPDATE sessions SET ended_at=? WHERE id=?", (ended, sid))
        self.db._execute_write(write)

    def session(self, sid: str, title: str, *, project: str | None, age_h: float, span_h: float = 1.0,
                messages: int = 6, source: str = "desktop", model: str = "claude-opus-4.1",
                parent: str | None = None, marker: dict | None = None, tokens: tuple[int, int] = (12000, 3000),
                cost: float = 0.12, ended: bool = True, end_reason: str = "user_exit", cwd: str | None = None,
                first_prompt: str | None = None, titled: bool = True, owner: str | None = OWNER) -> str:
        last = NOW - age_h * HOUR
        started = last - span_h * HOUR
        self.db.create_session(sid, source, model=model, model_config=marker or None,
                               parent_session_id=parent, cwd=cwd or project_dir(project),
                               git_repo_root=project_dir(project), user_id=owner)
        prompt = first_prompt or f"Let's work on: {title}"
        for i in range(messages):
            role = "user" if i % 2 == 0 else "assistant"
            content = prompt if i == 0 else (f"Follow-up {i // 2} on {title}" if role == "user" else f"Reply {i // 2} about {title}.")
            self.db.append_message(sid, role, content, timestamp=started + (i + 1) * (span_h * HOUR) / (messages + 1))
        self.db.update_token_counts(sid, input_tokens=tokens[0], output_tokens=tokens[1], model=model,
                                    estimated_cost_usd=cost, source=source)
        if titled:
            # A compression continuation keeps no title of its own: the list projects the root's.
            self.db.set_session_title(sid, title)
        if ended:
            self.db.end_session(sid, end_reason)
        self._backdate(sid, started, last, last if ended else None)
        self.created.append(sid)
        return sid

    def branch(self, sid: str, title: str, parent: str, **kw) -> str:
        return self.session(sid, title, parent=parent, marker={"_branched_from": parent}, **kw)


def seed_default(db: SessionDB) -> dict:
    s = Seeder(db, "default")
    m: dict = {"profile": "default", "hidden": [], "archived": [], "branch_links": [], "reset_links": []}

    # syscanvas: a 4-segment conversation (3 earlier compression segments → "compacted ×3").
    seg = ["st-sys-root", "st-sys-seg2", "st-sys-seg3", "st-sys-tip"]
    s.session(seg[0], "Hierarchical subsystems design", project="syscanvas", age_h=96, messages=8,
              end_reason="compression", tokens=(400000, 80000), cost=2.4)
    for i in range(1, 4):
        s.session(seg[i], "Hierarchical subsystems design", project="syscanvas", age_h=96 - 24 * i,
                  messages=8, parent=seg[i - 1], ended=i < 3, end_reason="compression",
                  tokens=(250000, 50000), cost=1.5, titled=False)
    m["compressed"] = {"root": seg[0], "tip": seg[3], "segments": 3, "lineage": seg}
    s.branch("st-sys-comments", "Comments: storage in the document", seg[3], project="syscanvas", age_h=24)
    s.branch("st-sys-reply", "Reply/resolve permissions", "st-sys-comments", project="syscanvas", age_h=20)
    # Running: open, last message seconds ago (the core 300 s ``is_active`` window).
    s.branch("st-sys-pairing", "One-click pairing edge cases", seg[3], project="syscanvas", age_h=0.01,
             span_h=0.5, ended=False)
    # Branched from a MIDDLE segment id: must nest under the conversation's visible block.
    s.branch("st-sys-mcp", "MCP tools for hierarchy", seg[1], project="syscanvas", age_h=5)
    m["branch_links"] += [[seg[3], "st-sys-comments"], ["st-sys-comments", "st-sys-reply"],
                          [seg[3], "st-sys-pairing"], [seg[3], "st-sys-mcp"]]
    m["running"] = "st-sys-pairing"

    # mdesign: compacted ×1, two branches, and a /new reset chain.
    s.session("st-md-root", "Side panel toggle", project="mdesign", age_h=120, end_reason="compression")
    s.session("st-md-tip", "Side panel toggle", project="mdesign", age_h=96, parent="st-md-root",
              end_reason="session_reset", titled=False)
    s.branch("st-md-katex", "Math page weight (KaTeX)", "st-md-tip", project="mdesign", age_h=48)
    s.branch("st-md-redline", "Redline comparison", "st-md-tip", project="mdesign", age_h=47)
    s.session("st-md-v2", "Side panel v2 polish", project="mdesign", age_h=9, parent="st-md-tip",
              marker={"_reset_from": "st-md-tip"})
    m["branch_links"] += [["st-md-tip", "st-md-katex"], ["st-md-tip", "st-md-redline"]]
    m["reset_links"] += [["st-md-tip", "st-md-v2"]]

    # hermes-plugins: pinned root with two branches.
    s.session("st-hp-root", "Session tree plugin", project="hermes-plugins", age_h=2)
    db.set_session_pinned("st-hp-root", True)
    s.branch("st-hp-routing", "Edge routing: libavoid", "st-hp-root", project="hermes-plugins", age_h=1)
    s.branch("st-hp-mockup", "Mockup of session tree", "st-hp-root", project="hermes-plugins", age_h=0.05)
    m["branch_links"] += [["st-hp-root", "st-hp-routing"], ["st-hp-root", "st-hp-mockup"]]

    # A branch whose parent was deleted (delete orphans branch children).
    s.session("st-orphan-parent", "MATLAB bridge (deleted parent)", project=None, age_h=200)
    s.branch("st-orphan-child", "MATLAB bridge overhaul", "st-orphan-parent", project=None, age_h=144)
    db.delete_session("st-orphan-parent")
    m["orphan"] = {"child": "st-orphan-child", "deleted_parent": "st-orphan-parent"}

    # One family split across two projects.
    s.session("st-split-root", "Cross-project refactor", project="syscanvas", age_h=30)
    s.branch("st-split-child", "Port refactor to mdesign", "st-split-root", project="mdesign", age_h=28)
    m["branch_links"] += [["st-split-root", "st-split-child"]]

    # Singles across the three projects and no project.
    single_titles = [
        "Debian rpmbuild fix", "Caddy HTTPS for webapp", "Telegram topic setup", "Weekly review",
        "tldraw offline pairing bug", "KaTeX font subsetting", "Zsh prompt cleanup", "Nginx log rotation",
        "Postgres vacuum tuning", "Rust borrow checker question", "SVG export sizing", "Docker layer cache",
        "Calendar sync script", "Invoice template", "Grafana alert noise", "Keyboard remap",
        "Python 3.14 upgrade notes", "Mermaid diagram styles", "Backup rotation policy", "WireGuard peers",
        "CSS container queries", "Git bisect walkthrough", "Image resize pipeline", "Markdown lint rules",
    ]
    projects_cycle = ["syscanvas", "mdesign", "hermes-plugins", None]
    singles = []
    for i, title in enumerate(single_titles):
        sid = f"st-single-{i:02d}"
        s.session(sid, title, project=projects_cycle[i % 4], age_h=6 + i * 7, messages=4)
        singles.append(sid)
    m["singles"] = singles

    # Two archived sessions.
    for i, title in enumerate(["Old archived spike", "Archived notes"]):
        sid = f"st-archived-{i}"
        s.session(sid, title, project="mdesign", age_h=300 + i * 10)
        db.set_session_archived(sid, True)
        m["archived"].append(sid)

    # Kinds that must never become blocks.
    s.session("st-hidden-delegate", "Delegate: research subtask", project="syscanvas", age_h=3,
              source="subagent", parent="st-hp-root", marker={"_delegate_from": "st-hp-root"})
    s.session("st-hidden-cron", "Nightly digest (cron)", project=None, age_h=4, source="cron")
    s.session("st-hidden-kanban", "Kanban worker run", project=None, age_h=4.5, source="kanban")
    s.session("st-hidden-tool", "Tool-spawned session", project=None, age_h=5.5, source="tool")
    m["hidden"] = ["st-hidden-delegate", "st-hidden-cron", "st-hidden-kanban", "st-hidden-tool"]
    m["created"] = s.created
    return m


def seed_profile(name: str, count: int, *, families: int = 0) -> dict:
    home = HOME / "profiles" / name
    if not home.is_dir():
        sys.exit(f"profile {name} does not exist; the harness creates it with `hermes profile create`")
    db = SessionDB(db_path=home / "state.db")
    try:
        s = Seeder(db, name)
        for i in range(count):
            sid = f"st-{name}-{i:04d}"
            parent = f"st-{name}-{i - 1:04d}" if i % 10 and i < families * 10 else None
            if parent:
                s.branch(sid, f"{name} branch {i}", parent, project=PROJECTS[i % 3], age_h=1 + i * 0.5, messages=2)
            else:
                s.session(sid, f"{name} session {i}", project=PROJECTS[i % 3], age_h=1 + i * 0.5, messages=2)
        return {"profile": name, "created": len(s.created)}
    finally:
        db.close()


def touch() -> dict:
    db = SessionDB(db_path=HOME / "state.db")
    try:
        current = db.get_session_title("st-single-03")
        title = "Weekly review" if current != "Weekly review" else "Weekly review (renamed)"
        db.set_session_title("st-single-03", title)
        return {"touched": "st-single-03", "title": title}
    finally:
        db.close()


def add_branch(new_id: str, parent: str, title: str, *, owned: bool = True) -> dict:
    """A ``/branch`` child of a seeded session, created now (the e2e's live-refresh probe). With
    ``owned=False`` it carries no owner stamp, like a row an older CLI wrote: the core refuses a
    Webapp login's edits of it (``permission_denied``), the actions e2e's real refusal."""
    db = SessionDB(db_path=HOME / "state.db")
    try:
        if db.get_session(parent) is None:
            sys.exit(f"no session {parent}")
        if db.get_session(new_id) is not None:
            return {"branch": new_id, "parent": parent, "created": False}
        parent_row = db.get_session(parent)
        project = Path(parent_row["git_repo_root"]).name if parent_row.get("git_repo_root") else None
        Seeder(db, "default").branch(new_id, title, parent, project=project, age_h=0.02, messages=2,
                                     owner=OWNER if owned else None)
        return {"branch": new_id, "parent": parent, "created": True, "owned": owned}
    finally:
        db.close()


def activate(sid: str) -> dict:
    """Re-open *sid* with its last activity now. Fixture-only direct SQL (timestamps have no API)."""
    db = SessionDB(db_path=HOME / "state.db")
    try:
        if db.get_session(sid) is None:
            sys.exit(f"no session {sid}")
        now = time.time()

        def write(conn):
            conn.execute("UPDATE sessions SET ended_at=NULL, end_reason=NULL, last_activity_at=? WHERE id=?", (now, sid))
        db._execute_write(write)
        return {"activated": sid, "at": now}
    finally:
        db.close()


def main() -> None:
    if "--touch" in sys.argv:
        print(json.dumps(touch()))
        return
    if "--branch" in sys.argv or "--unowned-branch" in sys.argv:
        flag = "--branch" if "--branch" in sys.argv else "--unowned-branch"
        args = sys.argv[sys.argv.index(flag) + 1:]
        if len(args) < 2:
            sys.exit(f"usage: {flag} NEW_ID PARENT_ID [TITLE]")
        title = args[2] if len(args) > 2 else f"Live branch {args[0]}"
        print(json.dumps(add_branch(args[0], args[1], title, owned=flag == "--branch")))
        return
    if "--activate" in sys.argv:
        args = sys.argv[sys.argv.index("--activate") + 1:]
        if not args:
            sys.exit("usage: --activate ID")
        print(json.dumps(activate(args[0])))
        return
    ensure_repos()
    manifest_file = HOME.parent / "fixtures-manifest.json"
    db = SessionDB(db_path=HOME / "state.db")
    try:
        if db.get_session("st-sys-root") is not None:
            if not manifest_file.exists():
                sys.exit("partial fixture seed found (no manifest): reset the test home and seed again")
            print(json.dumps({**manifest_path_read(), "seeded": False}))
            return
        manifest = seed_default(db)
    finally:
        db.close()
    manifest["second_profile"] = seed_profile(SECOND_PROFILE, 3)
    manifest["scale_profile"] = seed_profile(SCALE_PROFILE, 500, families=10)
    manifest["seeded"] = True
    manifest_file.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps(manifest))


def manifest_path_read() -> dict:
    path = HOME.parent / "fixtures-manifest.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


if __name__ == "__main__":
    main()
