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
without the owner stamp (the actions e2e's real ``permission_denied`` refusal); ``--whole-cost-branch``
adds an owned ``/branch`` child with ``estimated_cost_usd=2.0`` (a whole-number float: the byte-exact export check).
``--inf-cost-branch`` adds one with an infinite cost (card 4: the core JSON answer for such a row fails,
the page must end in an error state with Retry); ``--delete ID`` removes a row through ``delete_session``.
``--compact ID [NEW_ID]`` compacts the conversation ID names once more (its tip ends ``compression``,
a continuation row takes over; card-4 review B2). ``--append ID [PROFILE]`` appends one user/assistant
message pair to ID through ``append_message`` (a chat turn; card-5 review r2 B1-r2).
``--activate ID`` re-opens a
session and stamps its last activity now (fixture-only direct SQL on timestamps, like the backdating),
so the core list's 300 s ``is_active`` heuristic reports it. ``--rich`` (card 6) adds the Rich cards
family ``st-rich-*`` whose last messages hold Markdown, a code block, HTML-looking text, a very long
message, a tool call and a long tool run (``seed_rich``). Prints a JSON manifest of what it created.

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


#: Card 6 (Rich cards): last messages the details endpoint turns into plain-text excerpts.
RICH_MARKDOWN = ("## Plan\n\n**Bold** move: see [the docs](https://example.com/docs) and run `npm test`.\n\n"
                 "- first item\n- second _item_\n\n> quoted line")
RICH_CODE = "Here is the fix:\n\n```python\ndef add(a, b):\n    return a + b\n```\n\nDone."
RICH_HTML = ('<script>alert("x")</script><b>Bold</b> &amp; <i>italic</i> &lt;img src=x onerror=alert(1)&gt; '
             '<a href="https://example.com">link</a> 2 < 3 > 1')
RICH_LONG = " ".join(f"word{i:03d}" for i in range(400))
RICH_TOOL_PROMPT = "Run the full test suite and fix every failure"
#: Tool-call rounds in the tool-run fixture: 2 rows each, more than the excerpt's paged read.
RICH_TOOL_ROUNDS = 35

#: Card 6 fix r1 (review r1 B1): 200 KB last messages that made the old excerpt patterns
#: super-linear (every opener without a closer scanned to the end of the text). The first ten
#: are the review's list; the rest cover the other patterns of ``session_details.py``.
PATHOLOGICAL_SIZE = 200_000
PASTED_CODE = "    value = self._cache.get(key_name, None)  # look up _cache\n"


def _repeat(unit: str, size: int = PATHOLOGICAL_SIZE) -> str:
    return (unit * (size // len(unit) + 1))[:size]


PATHOLOGICAL = {
    "underscore": _repeat("_x "),
    "strong": _repeat("**x "),
    "star": _repeat("*x "),
    "strike": _repeat("~~x "),
    "bracket": _repeat("[x "),
    "link-open": _repeat("[x]("),
    "backtick": _repeat("`x "),
    "angle": _repeat("<x "),
    "fence": "```python\n" + _repeat("x = 1\n"),
    "pasted-code": PASTED_CODE * 4000,  # the review's real-API case (~244 KB)
    "strong-under": _repeat("__x "),
    "image-open": _repeat("![x "),
    "comment-open": _repeat("<!--x "),
    "autolink-open": _repeat("<http:"),
    "think-open": _repeat("<think "),
    "tool-call-open": "<tool_call>" + _repeat("{\"a\": 1} "),
    "blanks": _repeat(" \t") + "x",
    "heading-tail": _repeat("#  "),
    "dashes": _repeat("- "),
    "table": _repeat("| -- "),
}

#: Card 7 (card-6 review r2 NB1): 200 KB messages that *start* with blocks the excerpt drops
#: (reasoning, a tool call, style / script), then the text to show. The cap must apply after them.
LEADING = {
    "think": "<think>" + _repeat("I weigh the options once more. ") + "</think>The answer is 42.",
    "tool-call": "<tool_call>" + _repeat("{\"path\": \"notes.md\", \"text\": \"x\"} ") + "</tool_call>\nSaved the file: notes.md",
    "style-script": "<STYLE>" + _repeat("a { color: red } ", 100_000) + "</style>  <script type=\"x\">" + _repeat("let a = 1; ", 100_000) + "</script>Rendered the page.",
    "many": ("<think>" + _repeat("step ", 7_200) + "</think>\n") * 28 + "Final words.",
    "unclosed": "<thinking>" + _repeat("still thinking "),
}
#: The excerpt each ``LEADING`` body gives (the unclosed one falls back to the user message).
LEADING_EXCERPT = {
    "think": "The answer is 42.",
    "tool-call": "Saved the file: notes.md",
    "style-script": "Rendered the page.",
    "many": "Final words.",
    "unclosed": "Paste lead-unclosed",
}


def seed_pathological(db: SessionDB, prefix: str = "st-patho", copies: int = 1) -> dict:
    """``--pathological``: one session per ``PATHOLOGICAL`` body (``copies`` of each), the body its
    last (assistant) message. Through ``create_session`` / ``append_message``."""
    ids: dict[str, str] = {}
    stamp = NOW - HOUR
    for copy in range(copies):
        for name, body in PATHOLOGICAL.items():
            sid = f"{prefix}-{name}" if copies == 1 else f"{prefix}-{copy}-{name}"
            db.create_session(sid, "desktop", model="fixture-model")
            db.append_message(sid, "user", f"Paste {name}", timestamp=stamp)
            db.append_message(sid, "assistant", body, timestamp=stamp + 1)
            ids[sid] = name
    if copies == 1:
        # Card 7: the leading-block bodies, ``<prefix>-lead-<name>``.
        for name, body in LEADING.items():
            sid = f"{prefix}-lead-{name}"
            db.create_session(sid, "desktop", model="fixture-model")
            db.append_message(sid, "user", f"Paste lead-{name}", timestamp=stamp)
            db.append_message(sid, "assistant", body, timestamp=stamp + 1)
            ids[sid] = f"lead-{name}"
    return ids


def seed_rich(db: SessionDB, *, age_h: float = 30) -> dict:
    """``--rich``: one hermes-plugins family whose children end with Markdown, a code block, HTML-
    looking text, a very long message, a tool call with text and a long tool run (no text in the
    newest messages: the card falls back to the first prompt). Through ``append_message``."""
    s = Seeder(db, "default")
    root = s.session("st-rich-root", "Rich cards fixtures", project="hermes-plugins", age_h=age_h, messages=2)
    out: dict = {"root": root, "children": {}}

    def child(sid: str, title: str, last: list[tuple[str, dict]]) -> None:
        s.branch(sid, title, root, project="hermes-plugins", age_h=age_h - 1, messages=2)
        stamp = NOW - (age_h - 1) * HOUR
        for i, (role, fields) in enumerate(last):
            db.append_message(sid, role, timestamp=stamp + i, **fields)
        out["children"][sid] = title

    child("st-rich-markdown", "Markdown reply", [("assistant", {"content": RICH_MARKDOWN})])
    child("st-rich-code", "Code block reply", [("assistant", {"content": RICH_CODE})])
    child("st-rich-html", "HTML-looking prompt", [("user", {"content": RICH_HTML})])
    child("st-rich-long", "Very long reply", [("assistant", {"content": RICH_LONG})])
    child("st-rich-toolcall", "Tool call with text", [
        ("assistant", {"content": "I'll run the tests. <tool_call>{\"name\": \"terminal\"}</tool_call>",
                       "tool_calls": [{"id": "call_1", "type": "function",
                                       "function": {"name": "terminal", "arguments": "{\"command\": \"npm test\"}"}}]}),
        ("tool", {"content": "{\"exit_code\": 0, \"output\": \"242 passed\"}", "tool_call_id": "call_1", "tool_name": "terminal"}),
    ])
    # A long tool run: the prompt, then only tool calls and results (no text in the newest rows).
    s.branch("st-rich-toolrun", "Long tool run", root, project="hermes-plugins", age_h=age_h - 1, messages=0,
             first_prompt=RICH_TOOL_PROMPT)
    stamp = NOW - (age_h - 1) * HOUR
    db.append_message("st-rich-toolrun", "user", RICH_TOOL_PROMPT, timestamp=stamp)
    for i in range(RICH_TOOL_ROUNDS):
        call = f"call_{i}"
        db.append_message("st-rich-toolrun", "assistant", "", timestamp=stamp + 1 + 2 * i,
                          tool_calls=[{"id": call, "type": "function", "function": {"name": "terminal", "arguments": "{}"}}])
        db.append_message("st-rich-toolrun", "tool", f"ok {i}", tool_call_id=call, tool_name="terminal", timestamp=stamp + 2 + 2 * i)
    out["children"]["st-rich-toolrun"] = "Long tool run"
    out["tool_prompt"] = RICH_TOOL_PROMPT
    return out


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


def add_branch(new_id: str, parent: str, title: str, *, owned: bool = True, cost: float = 0.12) -> dict:
    """A ``/branch`` child of a seeded session, created now (the e2e's live-refresh probe). With
    ``owned=False`` it carries no owner stamp, like a row an older CLI wrote: the core refuses a
    Webapp login's edits of it (``permission_denied``), the actions e2e's real refusal. ``cost``
    is its ``estimated_cost_usd`` (``--whole-cost-branch``: ``2.0``, a whole-number float the
    core export writes as ``2.0``, the byte-exact export check)."""
    db = SessionDB(db_path=HOME / "state.db")
    try:
        if db.get_session(parent) is None:
            sys.exit(f"no session {parent}")
        if db.get_session(new_id) is not None:
            return {"branch": new_id, "parent": parent, "created": False}
        parent_row = db.get_session(parent)
        project = Path(parent_row["git_repo_root"]).name if parent_row.get("git_repo_root") else None
        Seeder(db, "default").branch(new_id, title, parent, project=project, age_h=0.02, messages=2,
                                     owner=OWNER if owned else None, cost=cost)
        # An infinite cost is reported as text: the manifest is strict JSON.
        return {"branch": new_id, "parent": parent, "created": True, "owned": owned, "cost": cost if cost != float("inf") else "inf"}
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


def compact(sid: str, new_id: str | None = None, *, db: SessionDB | None = None) -> dict:
    """Compact the conversation *sid* names (its root, a segment or its live tip) once more, the
    way a real compaction leaves it in ``state.db`` (``SessionDB`` API): the live tip ends with
    ``compression`` and a continuation row takes over (``parent_session_id`` = the old tip, no
    fork marker), with one message. The lineage root stays; the listing's tip id changes (the
    card-4 review B2 check: a placed block must stay put). Fixture-only direct SQL re-opens a tip
    that is already ended (``end_session`` keeps a first end), like ``--activate``."""
    own = db is None
    db = db or SessionDB(db_path=HOME / "state.db")
    try:
        if db.get_session(sid) is None:
            sys.exit(f"no session {sid}")
        tip = db.get_compression_tip(sid) or sid
        lineage = db.get_compression_lineage(tip)
        new_id = new_id or f"{lineage[0]}-c{len(lineage)}"
        if db.get_session(new_id) is not None:
            return {"compacted": tip, "continuation": new_id, "root": lineage[0], "created": False}
        row = db.get_session(tip) or {}

        def reopen(conn):
            conn.execute("UPDATE sessions SET ended_at=NULL, end_reason=NULL WHERE id=?", (tip,))
        db._execute_write(reopen)
        db.end_session(tip, "compression")
        db.create_session(new_id, row.get("source") or "desktop", model=row.get("model"), parent_session_id=tip,
                          cwd=row.get("cwd"), git_repo_root=row.get("git_repo_root"), user_id=OWNER)
        db.append_message(new_id, "user", "Continue after compaction", timestamp=time.time())
        return {"compacted": tip, "continuation": new_id, "root": db.get_compression_lineage(new_id)[0], "created": True,
                "lineage": db.get_compression_lineage(new_id)}
    finally:
        if own:
            db.close()


def append_turn(sid: str, profile: str | None = None) -> dict:
    """One user/assistant message pair in *sid* (``append_message``, as a chat turn writes it):
    a content-only change, the swimlanes e2e's no-re-route check (card-5 review r2, B1-r2)."""
    home = HOME / "profiles" / profile if profile and profile != "default" else HOME
    db = SessionDB(db_path=home / "state.db")
    try:
        before = db.get_session(sid)
        if before is None:
            sys.exit(f"no session {sid}")
        db.append_message(sid, "user", "Session Tree e2e ping", timestamp=time.time())
        db.append_message(sid, "assistant", "Session Tree e2e pong", timestamp=time.time())
        after = db.get_session(sid) or {}
        return {"appended": sid, "profile": profile or "default", "before": before.get("message_count"), "after": after.get("message_count")}
    finally:
        db.close()


def main() -> None:
    if "--rich" in sys.argv:
        db = SessionDB(db_path=HOME / "state.db")
        try:
            if db.get_session("st-rich-root") is not None:
                print(json.dumps({"rich": "st-rich-root", "created": False}))
                return
            print(json.dumps({**seed_rich(db), "created": True}))
        finally:
            db.close()
        return
    if "--pathological" in sys.argv:
        args = sys.argv[sys.argv.index("--pathological") + 1:]
        profile = args[0] if args else None
        home = HOME / "profiles" / profile if profile and profile != "default" else HOME
        db = SessionDB(db_path=home / "state.db")
        try:
            print(json.dumps({"profile": profile or "default", "ids": seed_pathological(db)}))
        finally:
            db.close()
        return
    if "--touch" in sys.argv:
        print(json.dumps(touch()))
        return
    if "--append" in sys.argv:
        args = sys.argv[sys.argv.index("--append") + 1:]
        if not args:
            sys.exit("usage: --append ID [PROFILE]")
        print(json.dumps(append_turn(args[0], args[1] if len(args) > 1 else None)))
        return
    if "--compact" in sys.argv:
        args = sys.argv[sys.argv.index("--compact") + 1:]
        if not args:
            sys.exit("usage: --compact ID [NEW_ID]")
        print(json.dumps(compact(args[0], args[1] if len(args) > 1 else None)))
        return
    if "--branch" in sys.argv or "--unowned-branch" in sys.argv or "--whole-cost-branch" in sys.argv or "--inf-cost-branch" in sys.argv:
        flag = next(f for f in ("--branch", "--unowned-branch", "--whole-cost-branch", "--inf-cost-branch") if f in sys.argv)
        args = sys.argv[sys.argv.index(flag) + 1:]
        if len(args) < 2:
            sys.exit(f"usage: {flag} NEW_ID PARENT_ID [TITLE]")
        title = args[2] if len(args) > 2 else f"Live branch {args[0]}"
        cost = {"--whole-cost-branch": 2.0, "--inf-cost-branch": float("inf")}.get(flag, 0.12)
        print(json.dumps(add_branch(args[0], args[1], title, owned=flag != "--unowned-branch", cost=cost)))
        return
    if "--delete" in sys.argv:
        args = sys.argv[sys.argv.index("--delete") + 1:]
        if not args:
            sys.exit("usage: --delete ID")
        db = SessionDB(db_path=HOME / "state.db")
        try:
            print(json.dumps({"deleted": args[0], "ok": bool(db.delete_session(args[0]))}))
        finally:
            db.close()
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
