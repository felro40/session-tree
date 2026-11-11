import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import { HOME_VARIANTS } from '../../scripts/e2e/harness.ts'

const scripts = join(import.meta.dirname, '..', '..', 'scripts')
const suites = readdirSync(scripts).filter(name => /^e2e-.*\.ts$/.test(name))

// Review t_899e3936 N4: every suite's test home shares the role's ports, so each suite stops the
// others first. A suite with its own stop list missed the homes added after it.
describe('the e2e test homes', () => {
  it('HOME_VARIANTS lists every variant home a suite uses', () => {
    const used = suites.flatMap(name => [...readFileSync(join(scripts, name), 'utf8').matchAll(/variant: '([a-z][a-z0-9-]*)'/g)].map(match => match[1]))

    assert.ok(used.length >= 8, `variants found: ${used}`)
    assert.deepEqual(used.filter(variant => !(HOME_VARIANTS as readonly string[]).includes(variant)), [])
  })

  it('every suite stops the role\'s other homes through stopRoleHomes, none with a list of its own', () => {
    for (const name of suites) {
      const source = readFileSync(join(scripts, name), 'utf8')

      assert.ok(source.includes('stopRoleHomes(t)'), `${name} does not call stopRoleHomes(t)`)
      assert.ok(!/for \(const variant of \[/.test(source), `${name} keeps its own list of homes`)
    }
  })
})
