/**
 * Layout history row text (card 10, A8): one history per profile + style, so each entry says
 * what it was taken before. Also the Re-arrange confirm's text (review t_5e9be878 N4). No React
 * and no SDK in here (unit tests).
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

/** What the Re-arrange confirm says, and whether its Re-arrange button can be used. */
export interface RearrangeText {
  text: string
  /** False: nothing to re-arrange; the button is disabled, so no op is sent. */
  canConfirm: boolean
}

const KEPT = 'The current arrangement is kept in Layout history, so you can bring it back.'

/**
 * The Re-arrange confirm text. `project`: a project scope, with `count` the blocks of it the op
 * moves on the canvas (`projectReset().blocks`, group labels not counted; review t_5e9be878 N4);
 * absent: All projects of the `viewLabel` view.
 */
export function rearrangeText(viewLabel: string, project?: { label: string; count: number }): RearrangeText {
  if (!project) {
    return { text: `Every block in ${viewLabel} goes back to the automatic layout. ${KEPT}`, canConfirm: true }
  }

  if (project.count === 0) {
    return { text: `No block of ${project.label} is on the canvas, so there is nothing to re-arrange.`, canConfirm: false }
  }

  const blocks = project.count === 1 ? `The 1 block of ${project.label} goes back to its automatic spot` : `The ${project.count} blocks of ${project.label} go back to their automatic spots`

  return { text: `${blocks}; other projects stay where they are. ${KEPT}`, canConfirm: true }
}
