/**
 * The style registry. Card 2 registers Dense + inspector, card 5 Project swimlanes, card 6 Rich
 * cards, card 7 Subway map (in R1's order). Card 4: the synced choice with a per-device override
 * (`resolveStyleId`), and a test-only second style behind a build-time flag.
 */
import { denseStyle } from './dense/index.ts'
import { makeE2eAltStyle } from './e2e-alt/index.ts'
import { richStyle } from './rich/index.ts'
import { subwayStyle } from './subway/index.ts'
import { swimlanesStyle } from './swimlanes/index.ts'
import type { StyleDefinition, StyleId } from './types.ts'

/** Default for a new install (R1). */
export const DEFAULT_STYLE_ID: StyleId = 'dense'

/**
 * The test style is registered only when `__SESSION_TREE_TEST_STYLES__` is true: in the e2e's
 * own build (`scripts/build.mjs --test-styles`). `npm run build` (the committed desktop/plugin.js)
 * defines it false, so esbuild folds this branch away and drops the test style's code; the
 * unit tests run the sources directly, where it is undefined (false). Written inline, so the
 * define is folded at the use site.
 */
const STYLES = new Map<StyleId, StyleDefinition>([
  [denseStyle.id, denseStyle],
  [swimlanesStyle.id, swimlanesStyle],
  [subwayStyle.id, subwayStyle],
  [richStyle.id, richStyle],
  ...(typeof __SESSION_TREE_TEST_STYLES__ !== 'undefined' && __SESSION_TREE_TEST_STYLES__
    ? ([['e2e-alt', makeE2eAltStyle()]] as [StyleId, StyleDefinition][])
    : [])
])

export function registeredStyles(): StyleDefinition[] {
  return [...STYLES.values()]
}

export function isRegisteredStyle(id: null | string | undefined): id is StyleId {
  return typeof id === 'string' && STYLES.has(id as StyleId)
}

/** The style for `id`, falling back to the default for an unknown or not-yet-built style. */
export function getStyle(id: string | undefined): StyleDefinition {
  return STYLES.get(id as StyleId) ?? STYLES.get(DEFAULT_STYLE_ID)!
}

/**
 * R18: this device's override when it names a registered style, else the synced style when it
 * does, else the default.
 */
export function resolveStyleId(override: null | string, synced: null | string): StyleId {
  if (isRegisteredStyle(override)) {
    return override
  }

  return isRegisteredStyle(synced) ? synced : DEFAULT_STYLE_ID
}
