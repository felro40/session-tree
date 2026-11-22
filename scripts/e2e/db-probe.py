"""Card 12 P1.2, in the plugin host's own test home: is ``state.db`` written during a round?

Run through the test-Hermes launcher (``<root>/hermes --run-path``). Opens ``state.db`` read-only
and holds that connection; prints one JSON line (``PRAGMA data_version`` on the held connection,
and mtime / size / sha256 of ``state.db``, ``-wal`` and ``-shm``), waits for a line on stdin
(the e2e runs its ``/sessions`` + ``/sessions/context`` round meanwhile), then prints the same
again. ``data_version`` changes on the held connection whenever another connection commits.
Usage: ``db-probe.py <profile home>``. Reads only.
"""

import hashlib
import json
import sqlite3
import sys
from pathlib import Path

home = Path(sys.argv[1])
db = home / "state.db"
conn = sqlite3.connect(f"file:{db}?mode=ro", uri=True)


def snapshot() -> dict:
    files = {}
    for suffix in ("", "-wal", "-shm"):
        path = home / f"state.db{suffix}"
        if path.exists():
            st = path.stat()
            files[path.name] = [st.st_mtime_ns, st.st_size, hashlib.sha256(path.read_bytes()).hexdigest()]
    return {"data_version": conn.execute("PRAGMA data_version").fetchone()[0], "files": files}


print(json.dumps(snapshot()), flush=True)
sys.stdin.readline()
print(json.dumps(snapshot()), flush=True)
conn.close()
