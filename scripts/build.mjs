// Bundles src/ (TypeScript + JSX) into one ESM file, desktop/plugin.js.
// Run with `npm run build`. The output is committed so the package installs
// without a build step.
import { build } from 'esbuild'
import { mkdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
/**
 * `--test-styles` (the e2e's own build only) defines `__SESSION_TREE_TEST_STYLES__` true, which
 * registers the test-only `e2e-alt` style; it must name an `--outfile` outside desktop/, so the
 * committed bundle is always the production build (`npm run build`: the flag is false).
 */
const testStyles = process.argv.includes('--test-styles')
const outArg = process.argv.indexOf('--outfile')
const outfile = outArg === -1 ? join(root, 'desktop', 'plugin.js') : resolve(process.argv[outArg + 1])

if (testStyles && (outArg === -1 || outfile === join(root, 'desktop', 'plugin.js'))) {
  throw new Error('--test-styles needs an --outfile outside desktop/ (the committed bundle never has the test style)')
}

/** The only specifiers the Hermes plugin loader resolves for a disk plugin. */
export const ALLOWED_EXTERNALS = ['@hermes/plugin-sdk', 'react', 'react/jsx-runtime']

/**
 * CommonJS dependencies (use-sync-external-store, via zustand) `require('react')`.
 * An external `require` would become esbuild's throwing `__require` stub in an
 * ESM bundle, so such a require resolves to a tiny ESM module that re-exports
 * the host's `react` through a real `import` instead.
 */
const reactForCommonJs = {
  name: 'react-for-commonjs',
  setup(pluginBuild) {
    pluginBuild.onResolve({ filter: /^react$/ }, args =>
      args.kind === 'require-call' ? { path: 'react', namespace: 'react-cjs' } : undefined
    )
    pluginBuild.onLoad({ filter: /.*/, namespace: 'react-cjs' }, () => ({
      contents: "import * as React from 'react'\nexport default React\nexport * from 'react'\n",
      loader: 'js',
      resolveDir: root
    }))
  }
}

mkdirSync(dirname(outfile), { recursive: true })

const result = await build({
  absWorkingDir: root,
  entryPoints: [join(root, 'src', 'plugin.tsx')],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  external: ALLOWED_EXTERNALS,
  // Pre-check 1, path (a): React Flow's `createPortal` comes from a local
  // shim, so the bundle never imports react-dom (not in the loader's map).
  alias: { 'react-dom': './src/shims/react-dom.ts' },
  loader: { '.css': 'text' },
  define: {
    'process.env.NODE_ENV': '"production"',
    'import.meta.env': '{"MODE":"production"}',
    __SESSION_TREE_TEST_STYLES__: testStyles ? 'true' : 'false'
  },
  // Syntax-only minification drops the development branches of zustand and
  // use-sync-external-store. Identifiers and whitespace stay readable.
  minifySyntax: true,
  legalComments: 'eof',
  charset: 'utf8',
  metafile: true,
  plugins: [reactForCommonJs],
  logLevel: 'warning'
})

const inputs = Object.keys(result.metafile.inputs)
const bytes = statSync(outfile).size
const reactDom = inputs.filter(input => input.includes('node_modules/react-dom/'))

if (reactDom.length > 0) {
  throw new Error(`react-dom leaked into the bundle: ${reactDom.join(', ')}`)
}

// Every third-party package that lands in the bundle, with its license. Copyleft fails the build.
const PERMISSIVE = new Set(['MIT', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0', '0BSD'])
const bundled = new Map()

for (const input of inputs) {
  const match = /node_modules\/((?:@[^/]+\/)?[^/]+)\//.exec(input)

  if (match && !bundled.has(match[1])) {
    const pkg = JSON.parse(readFileSync(join(root, 'node_modules', match[1], 'package.json'), 'utf8'))

    bundled.set(match[1], { version: pkg.version, license: pkg.license })
  }
}

for (const [name, { license }] of bundled) {
  if (!PERMISSIVE.has(license)) {
    throw new Error(`${name} has license ${license}: not on the permissive allowlist`)
  }
}

if (process.argv.includes('--licenses')) {
  for (const [name, { version, license }] of [...bundled].sort()) {
    console.log(`| ${name} | ${version} | ${license} |`)
  }
}

console.log(`${testStyles ? `${outfile} (test styles)` : 'desktop/plugin.js'}: ${bytes} bytes from ${inputs.length} inputs`)
