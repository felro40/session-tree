/** Fixture loaders for the unit tests (captured by scripts/capture-fixtures.ts). */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { parseProjectsTree } from '../../src/model/projects.ts'
import type { ProjectInfo } from '../../src/model/projects.ts'
import type { SessionRow } from '../../src/model/sessions.ts'

export interface Fixture {
  rows: SessionRow[]
  projects: ProjectInfo[]
}

export function loadFixture(name: 'default' | 'scale'): Fixture {
  const raw = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', `${name}.json`), 'utf8')) as {
    rows: SessionRow[]
    projectsTree: unknown
  }

  return { rows: raw.rows, projects: parseProjectsTree(raw.projectsTree) }
}

/** A plain visible row. */
export const row = (id: string, extra: Partial<SessionRow> = {}): SessionRow => ({
  id,
  title: id,
  source: 'desktop',
  profile: 'default',
  message_count: 4,
  started_at: 1000,
  last_active: 2000,
  ...extra
})

export const project = (id: string, sessionIds: string[], extra: Partial<ProjectInfo> = {}): ProjectInfo => ({
  id,
  label: id,
  color: null,
  icon: null,
  isNoProject: false,
  isAuto: true,
  path: `/repos/${id}`,
  repoPaths: [`/repos/${id}`],
  sessionIds,
  ...extra
})
