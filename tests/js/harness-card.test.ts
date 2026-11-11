/**
 * Card 7 fix r1 B1 / B3: the test harness's card number has one source of truth, and a full
 * `npm run test:e2e` resets the shared home itself.
 *
 * B1: `scripts/run-pytest.sh` defaulted SESSION_TREE_CARD to 6 while `scripts/e2e/harness.ts`
 * (and so `scripts/test-hermes`) defaulted to 7; in a clean environment `npm run test:py` exec'd a
 * c6 launcher that did not exist (exit 127). Now `scripts/e2e/CARD` is the only place the number
 * lives: the harness reads it, and the two shell entry points take their root from the harness.
 * These tests fail if any of the three grows a default of its own or resolves another root.
 *
 * Everything runs on a scratch e2e root (SESSION_TREE_E2E_ROOT), never on ~/.hermes.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { after, describe, it } from 'node:test'

const REPO = resolve(import.meta.dirname, '..', '..')
const read = (path: string): string => readFileSync(join(REPO, path), 'utf8')
const CARD_FILE = Number(read('scripts/e2e/CARD').trim())
const scratch = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'st-card-'))

after(() => rmSync(scratch, { recursive: true, force: true }))

/** A clean environment: no SESSION_TREE_* variable inherited from whoever runs the tests. */
function cleanEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}

  for (const [name, value] of Object.entries(process.env)) {
    if (!name.startsWith('SESSION_TREE_')) {
      env[name] = value
    }
  }

  return { ...env, NODE: process.execPath, SESSION_TREE_E2E_ROOT: scratch, ...extra }
}

function launcherVia(command: string[], extra: Record<string, string> = {}): string {
  const result = spawnSync(command[0], command.slice(1), { cwd: REPO, env: cleanEnv(extra), encoding: 'utf8' })

  assert.equal(result.status, 0, result.stderr)

  return result.stdout.trim().split('\n').pop() ?? ''
}

describe('test harness: one card number (B1)', () => {
  it('scripts/e2e/CARD holds a card of the set', () => {
    assert.ok(Number.isInteger(CARD_FILE) && CARD_FILE >= 1 && CARD_FILE <= 9, `CARD = ${CARD_FILE}`)
  })

  it('the harness default is the CARD file', async () => {
    const { DEFAULT_CARD } = await import('../../scripts/e2e/harness.ts')

    assert.equal(DEFAULT_CARD, CARD_FILE)
  })

  it('scripts/test-hermes and test-hermes-cli.ts resolve the CARD file\'s root with SESSION_TREE_CARD unset', () => {
    const expected = join(scratch, `c${CARD_FILE}-coder`, 'hermes')

    assert.equal(launcherVia(['sh', 'scripts/test-hermes', 'launcher']), expected)
    assert.equal(launcherVia([process.execPath, 'scripts/e2e/test-hermes-cli.ts', 'launcher']), expected)
    // The override still works, and the role too.
    assert.equal(launcherVia(['sh', 'scripts/test-hermes', 'launcher'], { SESSION_TREE_CARD: '6', SESSION_TREE_ROLE: 'reviewer' }), join(scratch, 'c6-reviewer', 'hermes'))
  })

  it('scripts/run-pytest.sh has no card number of its own: its root is the harness launcher\'s directory', () => {
    const script = read('scripts/run-pytest.sh')
    const code = script
      .split('\n')
      .filter(line => !line.trimStart().startsWith('#'))
      .join('\n')

    assert.doesNotMatch(code, /SESSION_TREE_CARD/, 'run-pytest.sh reads the card itself')
    assert.doesNotMatch(code, /\/c\$\{?card/, 'run-pytest.sh builds a c<card> root itself')
    assert.match(code, /launcher=\$\("\$NODE" "\$repo\/scripts\/e2e\/test-hermes-cli\.ts" launcher\)/)
    assert.match(code, /root=\$\(dirname "\$launcher"\)/)
  })

  it('no entry point carries a literal default card', () => {
    for (const path of ['scripts/run-pytest.sh', 'scripts/test-hermes', 'scripts/run-e2e.sh', 'scripts/e2e/harness.ts', 'scripts/e2e/test-hermes-cli.ts']) {
      const code = read(path)

      assert.doesNotMatch(code, /SESSION_TREE_CARD:-\d|SESSION_TREE_CARD \?\? \d/, `${path} has a literal default card`)
    }
  })
})

describe('npm run test:e2e resets the shared home first (B3)', () => {
  it('run-e2e.sh runs `test-hermes-cli.ts reset` before the first suite and stops if it fails', () => {
    const script = read('scripts/run-e2e.sh')
    const reset = script.indexOf('"$NODE" "$repo/scripts/e2e/test-hermes-cli.ts" reset || exit 1')
    const loop = script.indexOf('for suite in e2e-foundation')

    assert.ok(reset > 0, 'no reset step')
    assert.ok(loop > reset, 'the reset runs after the suites start')
  })

  it('reset moves the role\'s root to the trash (scratch root)', () => {
    const env = cleanEnv()
    const made = launcherVia([process.execPath, 'scripts/e2e/test-hermes-cli.ts', 'launcher'])
    const result = spawnSync(process.execPath, ['scripts/e2e/test-hermes-cli.ts', 'reset'], { cwd: REPO, env, encoding: 'utf8' })

    assert.equal(result.status, 0, result.stderr)
    assert.equal(spawnSync('test', ['-e', made]).status, 1, 'the launcher is still in place')
    assert.equal(spawnSync('sh', ['-c', `ls "${join(scratch, 'trash')}" | grep -c "^c${CARD_FILE}-coder-"`], { encoding: 'utf8' }).stdout.trim(), '1')
  })
})
