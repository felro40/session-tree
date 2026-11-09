/**
 * The style registry. Card 2 registers Dense + inspector; cards 5–7 add Project swimlanes,
 * Rich cards and Subway map; card 4 adds switching and the synced choice.
 */
import { denseStyle } from './dense/index.ts'
import type { StyleDefinition, StyleId } from './types.ts'

/** Default for a new install (R1). */
export const DEFAULT_STYLE_ID: StyleId = 'dense'

const STYLES = new Map<StyleId, StyleDefinition>([[denseStyle.id, denseStyle]])

export function registeredStyles(): StyleDefinition[] {
  return [...STYLES.values()]
}

/** The style for `id`, falling back to the default for an unknown or not-yet-built style. */
export function getStyle(id: string | undefined): StyleDefinition {
  return STYLES.get(id as StyleId) ?? STYLES.get(DEFAULT_STYLE_ID)!
}
