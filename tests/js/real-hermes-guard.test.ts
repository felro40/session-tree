/**
 * Card 6 carry-forward (card-5 review r4 N1): the e2e's real-Hermes guard must not trip on the
 * user's own live gateway rewriting runtime state under ~/.hermes/plugins (an atomic rewrite of
 * `hermes-pwa/push_delivery_state.json` moves the file and its directory's mtime), yet still see
 * a new link, a removed entry or a changed file. Runs on a scratch tree, never on ~/.hermes.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'

import { pluginsListing } from '../../scripts/e2e/real-hermes-guard.ts'

const root = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'st-guard-'))
const plugins = join(root, 'plugins')

after(() => rmSync(root, { recursive: true, force: true }))

describe('real-Hermes guard: the ~/.hermes/plugins listing', () => {
  mkdirSync(join(plugins, 'hermes-pwa', '__pycache__'), { recursive: true })
  writeFileSync(join(plugins, 'hermes-pwa', 'push_delivery_state.json'), '{"n":1}')
  writeFileSync(join(plugins, 'hermes-pwa', 'plugin.yaml'), 'name: hermes-pwa\n')
  const base = pluginsListing(plugins).join('\n')

  it('ignores an atomic rewrite of a *_state.json file and __pycache__ churn', () => {
    const tmp = join(plugins, 'hermes-pwa', '.push_delivery_state.json.tmp')

    writeFileSync(tmp, '{"n":2, "longer": true}')
    renameSync(tmp, join(plugins, 'hermes-pwa', 'push_delivery_state.json'))
    writeFileSync(join(plugins, 'hermes-pwa', '__pycache__', 'x.pyc'), 'x')
    assert.equal(pluginsListing(plugins).join('\n'), base)
  })

  it('still sees a new link (the package linked in), and a changed file', () => {
    symlinkSync(root, join(plugins, 'session-tree'))
    assert.notEqual(pluginsListing(plugins).join('\n'), base)
    rmSync(join(plugins, 'session-tree'))
    assert.equal(pluginsListing(plugins).join('\n'), base)
    writeFileSync(join(plugins, 'hermes-pwa', 'plugin.yaml'), 'name: hermes-pwa\nversion: 2\n')
    assert.notEqual(pluginsListing(plugins).join('\n'), base)
  })
})
