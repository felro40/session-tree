/**
 * Layout history row text (card 10, A8): one history per profile + style, so each entry says
 * what it was taken before. No React and no SDK in here (unit tests).
 */

/** A project a backup names that `projects.tree` no longer has. */
export const REMOVED_PROJECT = 'a removed project'

export interface BackupKind {
  reason: 'rearrange' | 'restore'
  /** The project a scoped Re-arrange reset; `null` / absent: All projects (or a pre-card-10 backup). */
  project?: null | string
}

/**
 * "Before Re-arrange · All projects" (also every backup kept before card 10, which has no
 * project), "Before Re-arrange · <project label>" or "Before a restore".
 */
export function backupLabel(backup: BackupKind, projectLabel: (id: string) => string | undefined): string {
  if (backup.reason === 'restore') {
    return 'Before a restore'
  }

  return `Before Re-arrange · ${backup.project ? (projectLabel(backup.project) ?? REMOVED_PROJECT) : 'All projects'}`
}
