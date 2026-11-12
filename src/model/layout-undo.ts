/**
 * What an Undo puts back (review t_5e9be878 N1). The Undo of a Re-arrange (a project scope or All
 * projects) and of a restore from Layout history never puts back the stored spot of a block
 * whose project changed after the action it undoes: "Move to project" forgot that block's spot,
 * so the auto-layout placed it anew in its new band, and its old spot belongs to the old one.
 * Every other entry (group labels included) is put back exactly.
 *
 * A block's project is read from the page's graph model: once when the action runs, once when
 * Undo is clicked (the model follows the other device's changes too). A block missing from
 * either model (archived, deleted, another profile) has no known move and is put back.
 *
 * No React and no SDK in here (unit tests).
 */
import type { GraphModel } from './graph.ts'
import type { Point } from './layout.ts'
import type { ProjectUndo } from './layout-sync.ts'
import { NO_PROJECT_ID } from './projects.ts'

/** Layout key → project id (`__no_project__`: none) of every block of `model`, stand-ins too. */
export type BlockProjects = ReadonlyMap<string, string>

export function blockProjects(model: GraphModel): Map<string, string> {
  return new Map(model.nodes.map(node => [node.layoutKey, node.projectId ?? NO_PROJECT_ID]))
}

/** The block keyed `key` is in another project now than when the action ran. */
const movedSince = (key: string, then: BlockProjects, now: BlockProjects) => then.has(key) && now.has(key) && then.get(key) !== now.get(key)

/**
 * The shared filter: `previous` (layout key → spot) without the blocks moved to another project
 * since (`then`: when the action ran, `now`: at Undo). Group-label keys are always kept.
 */
export function undoPositions(previous: ReadonlyMap<string, Point>, then: BlockProjects, now: BlockProjects): Map<string, Point> {
  return new Map([...previous].filter(([key]) => !movedSince(key, then, now)).map(([key, point]) => [key, { x: point.x, y: point.y }] as const))
}

/** The project Undo without the moved blocks: such a block gets neither an entry nor a remove. */
export function undoProject(undo: ProjectUndo, then: BlockProjects, now: BlockProjects): ProjectUndo {
  return { project: undo.project, previous: undoPositions(undo.previous, then, now), touched: undo.touched.filter(key => !movedSince(key, then, now)) }
}
