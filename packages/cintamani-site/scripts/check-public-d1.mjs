import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

assert.ok(process.env.npm_execpath, 'pnpm npm_execpath is required')
const stateRoot = mkdtempSync(join(tmpdir(), 'cintamani-d1-check-'))

function wrangler(arguments_, { json = false } = {}) {
  const result = spawnSync(
    process.execPath,
    [process.env.npm_execpath, 'exec', 'wrangler', 'd1', ...arguments_, '--local', '--persist-to', stateRoot],
    {
      cwd: new URL('..', import.meta.url),
      encoding: 'utf8',
      timeout: 60_000,
      windowsHide: true,
    },
  )
  assert.equal(result.error, undefined, `wrangler subprocess failed: ${result.error?.message ?? result.error}`)
  assert.equal(result.status, 0, `${result.error ?? ''}\n${result.stdout}\n${result.stderr}`)
  if (!json) return result.stdout
  const parsed = JSON.parse(result.stdout)
  assert.equal(parsed.length, 1)
  assert.equal(parsed[0].success, true)
  return parsed[0].results
}

try {
  wrangler(['migrations', 'apply', 'PROPOSALS_DB'])
  const metadata = wrangler(
    [
      'execute',
      'PROPOSALS_DB',
      '--command',
      "SELECT metadata_key, metadata_value FROM public_schema_metadata ORDER BY metadata_key",
      '--json',
    ],
    { json: true },
  )
  assert.deepEqual(metadata, [
    { metadata_key: 'projection_kind', metadata_value: 'cintamani-public-proposals' },
    { metadata_key: 'schema_version', metadata_value: '2' },
  ])

  const violations = wrangler(
    ['execute', 'PROPOSALS_DB', '--command', 'SELECT COUNT(*) AS count FROM public_schema_violations', '--json'],
    { json: true },
  )
  assert.equal(violations[0].count, 0)

  const operatorRoles = wrangler(
    [
      'execute',
      'PROPOSALS_DB',
      '--command',
      "SELECT (SELECT COUNT(*) FROM account_role_events) AS events, (SELECT COUNT(*) FROM current_account_roles) AS active",
      '--json',
    ],
    { json: true },
  )
  assert.deepEqual(operatorRoles, [{ events: 0, active: 0 }])

  const foreignKeys = wrangler(
    ['execute', 'PROPOSALS_DB', '--command', 'PRAGMA foreign_key_check', '--json'],
    { json: true },
  )
  assert.deepEqual(foreignKeys, [])
  process.stdout.write('public D1 schema: migration, identity, operator roles, invariants, and foreign keys verified\n')
} finally {
  rmSync(stateRoot, { recursive: true, force: true })
}
