// Lint: typescript-eslint (recommended) + React hooks rules, plus the plugin's own fences.
import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['desktop/**', 'node_modules/**', 'test-results/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // The Webapp CSP has no 'unsafe-eval'.
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      // Hot reload re-evaluates the module: timers/listeners must go through ctx.*.
      'no-restricted-globals': [
        'error',
        { name: 'setInterval', message: 'Use ctx.setInterval (tracked, cleared on unload).' },
        { name: 'setTimeout', message: 'Use ctx.setTimeout (tracked, cleared on unload).' },
        { name: 'addEventListener', message: 'Use ctx.addEventListener (tracked, cleared on unload).' }
      ],
      'no-restricted-properties': [
        'error',
        { object: 'window', property: 'setInterval', message: 'Use ctx.setInterval.' },
        { object: 'window', property: 'setTimeout', message: 'Use ctx.setTimeout.' },
        { object: 'window', property: 'addEventListener', message: 'Use ctx.addEventListener.' }
      ],
      // Only the loader's import map; react-dom is aliased to src/shims/react-dom.ts at build time.
      'no-restricted-imports': ['error', { paths: [{ name: 'react-dom', message: 'Not in the plugin import map.' }] }]
    }
  },
  {
    files: ['scripts/**/*.{ts,mjs}', 'tests/**/*.ts', 'eslint.config.js'],
    languageOptions: { globals: globals.node }
  }
)
