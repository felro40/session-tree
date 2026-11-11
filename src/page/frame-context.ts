/**
 * A framed style's extra flow nodes (Swimlanes: the lane chips) tell the canvas they were
 * activated through this context; the canvas hands the active one to the style's overlay.
 */
import { createContext, useContext } from 'react'

export interface FrameUi {
  /** The extra node `id` was activated from `element` (a click on a lane chip): toggles it. */
  activate(id: string, element: Element): void
  activeId: null | string
}

export const FrameUiCtx = createContext<FrameUi | null>(null)

export function useFrameUi(): FrameUi | null {
  return useContext(FrameUiCtx)
}
