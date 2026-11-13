/**
 * Card 11: the project areas of the style on screen, from what it drew (D5), and how the canvas
 * names a project. No React and no SDK (node:test runs it); `model/create.ts` has `projectAt`.
 */
import type { CanvasAreas } from '../model/create.ts'
import type { GraphModel } from '../model/graph.ts'
import { labelSpans } from '../model/layout.ts'
import type { GroupLabel, Point } from '../model/layout.ts'
import { NO_PROJECT_ID } from '../model/projects.ts'
import type { ProjectInfo } from '../model/projects.ts'
import { shelfSegments } from '../styles/rich/layout.ts'
import type { FrameLayout, StyleDefinition } from '../styles/types.ts'

/**
 * The areas a style's right-click reads its project from: Swimlanes its lanes; Rich cards its
 * shelf segments (`shelfSegments`); the others the bands under the drawn group labels
 * (`labelSpans`). The same functions the merge layouts place blocks with.
 */
export function canvasAreas(
  style: Pick<StyleDefinition, 'areas' | 'frame'>,
  positions: ReadonlyMap<string, Point>,
  labels: readonly GroupLabel[],
  frameLayout?: FrameLayout
): CanvasAreas {
  if (style.frame && frameLayout) {
    return { kind: 'lanes', lanes: style.frame.lanes?.(frameLayout).lanes ?? [] }
  }

  const drawn = labels.flatMap(label => {
    const point = positions.get(label.id)

    return point ? [[label.id, point] as const] : []
  })

  return style.areas === 'shelves' ? { kind: 'shelves', segments: shelfSegments(drawn) } : { kind: 'bands', spans: labelSpans(drawn) }
}

/** The project as the canvas's own group label (or lane) names it. */
export function projectLabelOf(model: GraphModel, projectId: string, framed: boolean): string {
  const noProject = model.projects.find(project => project.isNoProject)

  if (projectId === NO_PROJECT_ID) {
    return noProject?.label ?? (framed ? 'Home' : 'No project')
  }

  return model.projects.find(project => project.id === projectId)?.label ?? projectId
}

export function projectInfoOf(model: GraphModel, projectId: string): ProjectInfo | undefined {
  return projectId === NO_PROJECT_ID ? model.projects.find(project => project.isNoProject) : model.projects.find(project => project.id === projectId)
}
