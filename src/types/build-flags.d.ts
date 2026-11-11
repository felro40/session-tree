/**
 * Build-time constants (esbuild `define`, scripts/build.mjs).
 *
 * `__SESSION_TREE_TEST_STYLES__`: true only in the e2e's own build (`--test-styles`), which
 * registers the test-only `e2e-alt` style; false in `npm run build` (the committed bundle).
 */
declare const __SESSION_TREE_TEST_STYLES__: boolean | undefined
