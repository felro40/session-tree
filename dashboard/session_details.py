"""Session Tree backend, card 6 (Rich cards): what a card shows beyond its session row.

``details(db, ids, now, tz_offset_minutes)`` answers, per stored session id the profile has:

* ``excerpt``: the last user or assistant message as plain readable text, at most
  ``EXCERPT_MAX`` characters (Markdown syntax stripped, HTML tags removed, tool-call payloads and
  reasoning blocks dropped; never raw HTML). ``None`` when the newest ``EXCERPT_PAGE`` messages hold
  no such text (a long tool run, say): the page then shows the row's ``preview`` ("First prompt").
* ``excerpt_role``: ``user`` / ``assistant`` (``None`` with no excerpt).
* ``activity``: 7 integers, the user + assistant messages of each local day, oldest first, ending
  with today (``tz_offset_minutes`` is added to UTC to get local time).

Read-only and bounded per id, never a whole-transcript scan:

* the row: ``SessionDB.get_session`` (primary key); an id the profile does not have is omitted;
* the excerpt: Hermes's own paged read, ``SessionDB.get_messages(id, latest=True,
  limit=EXCERPT_PAGE)`` (``ORDER BY id DESC LIMIT`` on ``idx_messages_session_id``);
* the activity: one ``COUNT … GROUP BY`` day over the 7-day timestamp range on the
  ``(session_id, active, timestamp)`` index, through SessionDB's read-only reader (``_read_all``;
  Hermes has no per-day count API). It covers the conversation's compression lineage
  (``SessionDB.get_compression_lineage``, at most ``MAX_LINEAGE`` segments), counting a message
  carried into a later segment once (same role and timestamp).

The caller opens the database read-only (``_read_profile_db``); nothing here writes.
"""

from __future__ import annotations

import html
import math
import re
from datetime import datetime, timezone
from typing import Any, Iterable, Optional

#: Ids per request (the page batches its viewport in requests of at most this many).
MAX_IDS = 100
#: Excerpt length, ellipsis included.
EXCERPT_MAX = 240
#: Newest messages the excerpt read looks at (one paged read).
EXCERPT_PAGE = 60
ACTIVITY_DAYS = 7
DAY = 86400
#: Compression segments the activity count covers at most (newest kept).
MAX_LINEAGE = 32
#: Local time zone offsets in minutes (UTC−14:00 … UTC+14:00).
MAX_TZ_OFFSET = 14 * 60

_ROLES = ("user", "assistant")

# --- plain text --------------------------------------------------------------------------------

_DROP_BLOCKS = re.compile(
    r"<(tool_call|tool_calls|function_call|tool_result|think|thinking|reasoning|script|style)\b[^>]*>.*?(</\1\s*>|$)",
    re.IGNORECASE | re.DOTALL,
)
_FENCE = re.compile(r"(^|\n)[ \t]*(`{3,}|~{3,})[^\n]*\n(.*?)(\n[ \t]*\2[ \t]*(?=\n|$)|$)", re.DOTALL)
_IMAGE = re.compile(r"!\[([^\]]*)\]\([^)]*\)")
_LINK = re.compile(r"\[([^\]]+)\]\([^)]*\)")
_REF_LINK = re.compile(r"\[([^\]]+)\]\[[^\]]*\]")
_AUTOLINK = re.compile(r"<((?:https?|mailto|ftp):[^>\s]+)>", re.IGNORECASE)
_TAG = re.compile(r"</?[A-Za-z][A-Za-z0-9:-]*(?:\s[^<>]*)?/?>|<!--.*?-->", re.DOTALL)
_HEADING = re.compile(r"^[ \t]{0,3}#{1,6}[ \t]+", re.MULTILINE)
_HEADING_TAIL = re.compile(r"[ \t]+#+[ \t]*$", re.MULTILINE)
_QUOTE = re.compile(r"^[ \t]{0,3}(>[ \t]?)+", re.MULTILINE)
_LIST = re.compile(r"^[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+(\[[ xX]\][ \t]+)?", re.MULTILINE)
_RULE = re.compile(r"^[ \t]*([-*_])([ \t]*\1){2,}[ \t]*$", re.MULTILINE)
_TABLE_RULE = re.compile(r"^[ \t]*\|?[ \t]*:?-{2,}:?[ \t]*(\|[ \t]*:?-{2,}:?[ \t]*)*\|?[ \t]*$", re.MULTILINE)
_EMPHASIS = (
    re.compile(r"(\*\*|__)(?=\S)(.+?)(?<=\S)\1", re.DOTALL),
    re.compile(r"(?<![\w*])\*(?=\S)(.+?)(?<=\S)\*(?![\w*])", re.DOTALL),
    re.compile(r"(?<![\w_])_(?=\S)(.+?)(?<=\S)_(?![\w_])", re.DOTALL),
    re.compile(r"~~(?=\S)(.+?)(?<=\S)~~", re.DOTALL),
)
_INLINE_CODE = re.compile(r"(`+)(.+?)\1", re.DOTALL)
_SPACE = re.compile(r"\s+")


def _text_of(content: Any) -> str:
    """The text of a message's content: a string, or the text parts of a multimodal list."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for part in content:
            if isinstance(part, str):
                parts.append(part)
            elif isinstance(part, dict) and part.get("type") in {"text", "input_text", "output_text"} and isinstance(part.get("text"), str):
                parts.append(part["text"])
        return "\n".join(parts)
    return ""


def plain_text(content: Any) -> str:
    """Markdown / HTML-looking message text as plain readable text on one line."""
    text = _text_of(content)
    if not text:
        return ""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = _DROP_BLOCKS.sub(" ", text)
    # Fenced code keeps its code (fences and the language tag go).
    text = _FENCE.sub(lambda m: f"{m.group(1)}{m.group(3)}\n", text)
    text = _INLINE_CODE.sub(lambda m: m.group(2).strip(), text)
    text = _IMAGE.sub(lambda m: m.group(1), text)
    text = _LINK.sub(lambda m: m.group(1), text)
    text = _REF_LINK.sub(lambda m: m.group(1), text)
    text = _AUTOLINK.sub(lambda m: m.group(1), text)
    text = _TAG.sub(" ", text)
    text = html.unescape(text)
    # An entity-escaped tag (``&lt;b&gt;``) is a tag again after unescaping: remove it too.
    text = _TAG.sub(" ", text)
    text = _TABLE_RULE.sub(" ", text)
    text = _RULE.sub(" ", text)
    text = _HEADING_TAIL.sub("", _HEADING.sub("", text))
    text = _QUOTE.sub("", text)
    text = _LIST.sub("", text)
    for pattern in _EMPHASIS:
        text = pattern.sub(lambda m: m.group(m.lastindex or 0), text)
    text = text.replace("|", " ")
    return _SPACE.sub(" ", text).strip()


def clip(text: str, limit: int = EXCERPT_MAX) -> str:
    """``text`` cut to ``limit`` characters (ellipsis included), at a word end when one is near."""
    if len(text) <= limit:
        return text
    cut = text[: limit - 1]
    space = cut.rfind(" ")
    if space >= limit * 0.7:
        cut = cut[:space]
    return cut.rstrip(" ,;:.-") + "…"


# --- per-session reads --------------------------------------------------------------------------

def excerpt_of(db: Any, session_id: str) -> tuple[Optional[str], Optional[str]]:
    """(excerpt, role) of the newest user / assistant message with text, from one paged read."""
    messages = db.get_messages(session_id, latest=True, limit=EXCERPT_PAGE)
    for message in reversed(messages):
        if message.get("role") not in _ROLES or message.get("_compressed_summary"):
            continue
        text = plain_text(message.get("content"))
        if text:
            return clip(text), message["role"]
    return None, None


def day_index(epoch: float, tz_offset_minutes: int) -> int:
    """The local day number of an instant (days since 1970-01-01 in local time)."""
    return math.floor((epoch + tz_offset_minutes * 60) / DAY)


def activity_days(now: float, tz_offset_minutes: int) -> list[str]:
    """The 7 local dates (``YYYY-MM-DD``) ``activity`` counts, oldest first, today last."""
    today = day_index(now, tz_offset_minutes)
    return [datetime.fromtimestamp((today - back) * DAY, tz=timezone.utc).strftime("%Y-%m-%d")
            for back in range(ACTIVITY_DAYS - 1, -1, -1)]


def activity_of(db: Any, segments: list[str], now: float, tz_offset_minutes: int) -> list[int]:
    """User + assistant messages per local day over the last 7 days (oldest first)."""
    offset = tz_offset_minutes * 60
    today = day_index(now, tz_offset_minutes)
    first = today - (ACTIVITY_DAYS - 1)
    start = first * DAY - offset
    end = (today + 1) * DAY - offset
    marks = ",".join("?" for _ in segments)
    rows = db._read_all(
        f"""SELECT CAST((timestamp + ?) / {DAY} AS INTEGER) AS day, COUNT(DISTINCT role || ':' || timestamp) AS n
            FROM messages
            WHERE session_id IN ({marks}) AND (active = 1 OR compacted = 1)
              AND timestamp >= ? AND timestamp < ? AND role IN ('user', 'assistant')
            GROUP BY day""",
        (offset, *segments, start, end),
    )
    counts = [0] * ACTIVITY_DAYS
    for row in rows:
        index = int(row[0]) - first
        if 0 <= index < ACTIVITY_DAYS:
            counts[index] = int(row[1])
    return counts


def lineage_of(db: Any, session_id: str) -> list[str]:
    """The conversation's compression segments (root → this id), newest ``MAX_LINEAGE`` kept."""
    lineage = db.get_compression_lineage(session_id) or [session_id]
    if session_id not in lineage:
        lineage = [*lineage, session_id]
    return lineage[-MAX_LINEAGE:]


def details(db: Any, ids: Iterable[str], now: float, tz_offset_minutes: int) -> dict[str, dict[str, Any]]:
    """Per id the profile has: excerpt, excerpt_role and activity. Unknown ids are omitted."""
    out: dict[str, dict[str, Any]] = {}
    for session_id in ids:
        if session_id in out or not db.get_session(session_id):
            continue
        excerpt, role = excerpt_of(db, session_id)
        out[session_id] = {
            "excerpt": excerpt,
            "excerpt_role": role,
            "activity": activity_of(db, lineage_of(db, session_id), now, tz_offset_minutes),
        }
    return out
