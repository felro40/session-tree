// Static guards on the built desktop/plugin.js (Shared requirement 2).
// Run `npm run build` first; `npm test` reads the committed/built file.
import assert from 'node:assert/strict'
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import { init, parse } from 'es-module-lexer'

const root = join(import.meta.dirname, '..', '..')
const bundlePath = join(root, 'desktop', 'plugin.js')
const source = readFileSync(bundlePath, 'utf8')

const ALLOWED = new Set(['@hermes/plugin-sdk', 'react', 'react/jsx-runtime'])
/** The loader's import-map cap (runtime-loader.ts PLUGIN_SOURCE_MAX_BYTES). */
const LOADER_CAP_BYTES = 16 * 1024 * 1024
/** "Well under" the cap: this plugin budgets itself 2 MiB. */
const SIZE_BUDGET_BYTES = 2 * 1024 * 1024

describe('desktop/plugin.js static guards', () => {
  it('imports only @hermes/plugin-sdk, react and react/jsx-runtime (real specifiers, not strings or comments)', async () => {
    await init
    const [imports] = parse(source)
    const specifiers = imports.filter(entry => entry.type !== 'import-meta').map(entry => entry.specifier)

    assert.ok(specifiers.length > 0, 'the bundle has imports')

    for (const spec of specifiers) {
      assert.ok(typeof spec === 'string', 'no dynamic import with a computed specifier')
      assert.ok(ALLOWED.has(spec), `unexpected import specifier: ${spec}`)
    }

    // No dynamic import() at all, and no `export * from` another module.
    assert.deepEqual(
      imports.filter(entry => entry.type !== 'static').map(entry => `${entry.type}:${entry.specifier}`),
      [],
      'only static imports'
    )
  })

  it('never imports react-dom, even through the shim', () => {
    assert.doesNotMatch(source, /from\s*["']react-dom/)
    assert.doesNotMatch(source, /node_modules\/react-dom\//)
  })

  it('has no eval( or new Function (Webapp CSP has no unsafe-eval)', () => {
    assert.doesNotMatch(source, /\beval\s*\(/)
    assert.doesNotMatch(source, /new\s+Function\b/)
    assert.doesNotMatch(source, /\bFunction\s*\(\s*["'`]/)
  })

  it('has no CommonJS require stub left (it would throw in an ESM bundle)', () => {
    assert.doesNotMatch(source, /__require\(/)
  })

  it('default-exports the plugin object', () => {
    assert.match(source, /export\s*\{[^}]*\bdefault\b[^}]*\}/)
  })

  it(`stays well under the loader's 16 MiB cap (budget ${SIZE_BUDGET_BYTES} bytes)`, () => {
    const bytes = statSync(bundlePath).size

    assert.ok(bytes < SIZE_BUDGET_BYTES, `bundle is ${bytes} bytes`)
    assert.ok(bytes < LOADER_CAP_BYTES)
  })
})
