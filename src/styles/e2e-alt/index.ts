/**
 * TEST ONLY: a second style for the card-4 e2e (the toolbar switcher, per-style positions, the
 * device override) while Dense is the only real one. Dense's blocks with wider spacing.
 *
 * Registered only when the build defines `__SESSION_TREE_TEST_STYLES__` true, which only
 * `node scripts/build.mjs --test-styles` (the e2e's own build, never the committed
 * desktop/plugin.js) does; `tests/js/guards.test.ts` proves the committed bundle has none of it.
 * A function, so that esbuild drops it entirely when the registry's branch is dead.
 */
import { denseStyle } from '../dense/index.ts'
import { denseLayoutSpec } from '../dense/spec.ts'
import type { StyleDefinition } from '../types.ts'

export function makeE2eAltStyle(): StyleDefinition {
  return {
    ...denseStyle,
    id: 'e2e-alt',
    label: 'E2E alt (test only)',
    layoutSpec: options => ({ ...denseLayoutSpec(options), columnGap: 120, rowGap: 30 })
  }
}
