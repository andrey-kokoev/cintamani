import assert from 'node:assert/strict'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'
import { unstable_splitSqlQuery } from 'wrangler'

const siteRoot = fileURLToPath(new URL('..', import.meta.url))
const wranglerScript = resolve(siteRoot, 'node_modules/wrangler/bin/wrangler.js')
const fixtureRoot = mkdtempSync(join(process.env.TEMP ?? process.env.TMP ?? '.', 'cintamani-d1-populated-'))
const migrationRoot = join(fixtureRoot, 'migrations')
const stateRoot = join(fixtureRoot, 'state')
const configPath = join(fixtureRoot, 'wrangler.jsonc')
const databaseId = '00000000-0000-4000-8000-000000000009'
const at = '2026-08-12T00:00:00.000Z'
const hash = (value) => value.repeat(64)

function invoke(arguments_) {
  const result = spawnSync(
    process.execPath,
    [wranglerScript, '--config', configPath, '--local', '--persist-to', stateRoot, ...arguments_],
    { cwd: siteRoot, encoding: 'utf8', timeout: 120_000, windowsHide: true },
  )
  assert.equal(result.error, undefined, `wrangler subprocess failed: ${result.error?.message ?? result.error}`)
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  return result.stdout
}

function execute(command, { json = false } = {}) {
  const output = invoke(['d1', 'execute', 'PROPOSALS_DB', '--command', command.trim(), ...(json ? ['--json'] : [])])
  if (!json) return output
  const parsed = JSON.parse(output)
  assert.equal(parsed.length, 1)
  assert.equal(parsed[0].success, true)
  return parsed[0].results
}

function applyMigrations() {
  invoke(['d1', 'migrations', 'apply', 'PROPOSALS_DB'])
}

try {
  mkdirSync(migrationRoot, { recursive: true })
  const migrationNames = readdirSync(resolve(siteRoot, 'migrations')).filter((name) => name.endsWith('.sql')).sort()
  for (const name of migrationNames.filter((value) => value < '0011_experiments_equipment.sql')) {
    cpSync(resolve(siteRoot, 'migrations', name), join(migrationRoot, name))
  }
  writeFileSync(configPath, JSON.stringify({
    name: 'cintamani-task-9-populated-check',
    d1_databases: [{
      binding: 'PROPOSALS_DB',
      database_name: 'cintamani-task-9-populated-check',
      database_id: databaseId,
      migrations_dir: 'migrations',
    }],
  }, null, 2))
  applyMigrations()

  execute(`
    INSERT INTO public_accounts (
      account_id, github_identity_hmac_sha256, github_login, github_profile_url,
      github_avatar_url, created_at, last_authenticated_at
    ) VALUES ('account-populated', '${hash('a')}', 'populated', 'https://github.com/populated', NULL, '${at}', '${at}');
    INSERT INTO proposals (
      proposal_id, proposal_kind, author_account_id, parent_proposal_id, parent_revision, created_at
    ) VALUES ('proposal-populated', 'theoretical-model-member', 'account-populated', NULL, NULL, '${at}');
    INSERT INTO proposal_state_events (
      proposal_id, event_sequence, state_event_id, from_state, to_state, selected_revision,
      actor_account_id, rationale, source_timestamp, recorded_at
    ) VALUES ('proposal-populated', 1, 'state-populated-1', NULL, 'submitted', NULL, 'account-populated', 'Seeded Wrangler-local-D1 migration fixture', '${at}', '${at}');
    INSERT INTO proposal_revisions (
      proposal_id, revision, revision_id, author_account_id, title, summary, rationale, scope,
      content_sha256, source_timestamp, recorded_at
    ) VALUES ('proposal-populated', 1, 'proposal-populated-revision-1', 'account-populated',
      'Populated migration fixture', 'This row must survive the migration cutover.',
      'Retry and preservation coverage.', 'Task #9 local D1 check.', '${hash('b')}', '${at}', '${at}');
    INSERT INTO theoretical_model_details (
      proposal_id, revision, member_id, member_name, model_definition,
      computational_claim, initial_epistemic_status
    ) VALUES ('proposal-populated', 1, 'populated-model', 'Populated model',
      'A bounded migration fixture.', 'No scientific result is claimed.', 'candidate');
  `)
  const before = execute(`
    SELECT p.proposal_id, p.proposal_kind, r.revision_id, r.title, d.member_id
    FROM proposals p JOIN proposal_revisions r USING (proposal_id)
    JOIN theoretical_model_details d USING (proposal_id, revision)
    WHERE p.proposal_id='proposal-populated'
  `, { json: true })

  const finalMigration = resolve(siteRoot, 'migrations/0011_experiments_equipment.sql')
  const finalSql = readFileSync(finalMigration, 'utf8')
  if (process.env.CINTAMANI_SKIP_PREFIX !== '1') {
    for (const statement of unstable_splitSqlQuery(finalSql).filter((value) => value.trim()).slice(0, 18)) {
      execute(statement)
    }
  }
  cpSync(finalMigration, join(migrationRoot, '0011_experiments_equipment.sql'))
  applyMigrations()

  const after = execute(`
    SELECT p.proposal_id, p.proposal_kind, r.revision_id, r.title, d.member_id
    FROM proposals p JOIN proposal_revisions r USING (proposal_id)
    JOIN theoretical_model_details d USING (proposal_id, revision)
    WHERE p.proposal_id='proposal-populated'
  `, { json: true })
  assert.deepEqual(after, before)
  assert.deepEqual(execute("SELECT metadata_key, metadata_value FROM public_schema_metadata ORDER BY metadata_key", { json: true }), [
    { metadata_key: 'projection_kind', metadata_value: 'cintamani-public-proposals' },
    { metadata_key: 'schema_version', metadata_value: '7' },
  ])
  assert.deepEqual(execute('SELECT COUNT(*) AS count FROM public_schema_violations', { json: true }), [{ count: 0 }])
  assert.deepEqual(execute('PRAGMA foreign_key_check', { json: true }), [])
  assert.deepEqual(execute('SELECT COUNT(*) AS count FROM proposed_experiment_details', { json: true }), [{ count: 0 }])
  process.stdout.write('populated Wrangler-local-D1 migration, persisted-prefix retry, preservation, invariants, and foreign keys verified\n')
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true })
}
