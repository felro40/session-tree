// Reads backend session rows (JSON) on stdin and prints the ids the graph model keeps
// (`visibleRows`, src/model/sessions.ts). Used by tests/py/test_plugin_api.py so the backend's
// flags are checked against the desktop half's own filter, not a Python copy of it.
import { readFileSync } from 'node:fs'

import { visibleRows } from '../../src/model/sessions.ts'
import type { SessionRow } from '../../src/model/sessions.ts'

const rows = JSON.parse(readFileSync(0, 'utf8')) as SessionRow[]

process.stdout.write(JSON.stringify(visibleRows(rows).map(row => row.id)))
