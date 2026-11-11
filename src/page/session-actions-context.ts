/**
 * The session actions (R14) as the page's components see them: the canvas menu, the blocks'
 * ⋯ buttons and the inspector's buttons all call the same functions (`session-actions.tsx`).
 */
import { createContext, useContext } from 'react'

import type { GraphNode } from '../model/graph.ts'
import type { ProjectInfo } from '../model/projects.ts'
import type { LiveStatus } from '../model/status.ts'

export interface SessionActions {
  /** In-scope session blocks only (R5, R7). */
  canAct(node: GraphNode | undefined): boolean
  statusOf(node: GraphNode): LiveStatus | undefined
  /** Direct `/branch` children (the delete note). */
  branchCount(node: GraphNode): number
  /** Projects a session can move to (not its own, not folderless). */
  moveTargets(node: GraphNode): ProjectInfo[]
  /** The colour this page set for the session (the SDK has no colour read verb). */
  colorOf(node: GraphNode): null | string

  rename(node: GraphNode): void
  togglePin(node: GraphNode): void
  toggleUnread(node: GraphNode): Promise<void>
  setColor(node: GraphNode, color: null | string): void
  copied(node: GraphNode): void
  copyFailed(error: unknown): void
  branch(node: GraphNode): Promise<void>
  exportSession(node: GraphNode): Promise<void>
  moveTo(node: GraphNode, project: ProjectInfo): Promise<void>
  toggleArchive(node: GraphNode): Promise<void>
  /** Opens the delete confirmation. */
  remove(node: GraphNode): void

  /** Opens the block menu for `nodeId`, anchored under `anchor` (the ⋯ buttons). */
  openMenuFor(nodeId: string, anchor: Element): void
  /** The canvas registers the element its menu trigger sits on. */
  setMenuHost(element: HTMLElement | null): void
  /** The node a programmatic open asked for (read once by the trigger). */
  takeRequestedMenuNode(): null | string
  /** A dialog is opening from the menu: the menu must not take the focus back (read once). */
  dialogOpening(): boolean
  /** The menu's Rename… / Delete call this first (the app's `suppressCloseFocusRef`). */
  noteDialogFromMenu(): void
}

export const SessionActionsCtx = createContext<null | SessionActions>(null)

/** The page's actions, or null outside a page (blocks then render without a ⋯ button). */
export function useSessionActions(): null | SessionActions {
  return useContext(SessionActionsCtx)
}
