import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import test from 'node:test'
import { unstable_splitSqlQuery } from 'wrangler'
import { validateIllustrativeCatalog, illustrativeExperimentCatalog } from '../src/lib/experiments.mjs'

const root = dirname(fileURLToPath(import.meta.url))
const migrationRoot = resolve(root, '../migrations')
const names = readdirSync(migrationRoot).filter((name) => name.endsWith('.sql')).sort()
const sql = new Map(names.map((name) => [name, readFileSync(resolve(migrationRoot, name), 'utf8')]))
const at = '2026-08-12T00:00:00.000Z'
const hash = (value) => value.repeat(64)
const taskCompoundSelectBudget = 48

function database() {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys=ON')
  return db
}

function apply(db, name) {
  for (const statement of unstable_splitSqlQuery(sql.get(name)).filter((value) => value.trim())) db.exec(statement)
}

function applyThroughTen(db) {
  for (const name of names.filter((value) => value < '0011_experiments_equipment.sql')) apply(db, name)
}

function seedPopulatedProposal(db) {
  db.prepare(`INSERT INTO public_accounts (
    account_id, github_identity_hmac_sha256, github_login, github_profile_url,
    github_avatar_url, created_at, last_authenticated_at
  ) VALUES (?, ?, ?, ?, NULL, ?, ?)`).run('account-author', hash('a'), 'author', 'https://github.com/author', at, at)
  db.prepare(`INSERT INTO proposals (
    proposal_id, proposal_kind, author_account_id, parent_proposal_id,
    parent_revision, created_at
  ) VALUES (?, ?, ?, NULL, NULL, ?)`).run('proposal-preserved', 'theoretical-model-member', 'account-author', at)
  db.prepare(`INSERT INTO proposal_state_events (
    proposal_id, event_sequence, state_event_id, from_state, to_state,
    selected_revision, actor_account_id, rationale, source_timestamp, recorded_at
  ) VALUES (?, 1, ?, NULL, 'submitted', NULL, ?, 'Seeded populated migration row', ?, ?)`).run(
    'proposal-preserved', 'state-proposal-preserved-1', 'account-author', at, at,
  )
  db.prepare(`INSERT INTO proposal_revisions (
    proposal_id, revision, revision_id, author_account_id, title, summary,
    rationale, scope, content_sha256, source_timestamp, recorded_at
  ) VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'proposal-preserved', 'proposal-preserved-revision-1', 'account-author',
    'Preserved proposal', 'A populated row used for migration retry coverage.',
    'The row must remain byte-identical.', 'Migration test only.', hash('b'), at, at,
  )
  db.prepare(`INSERT INTO theoretical_model_details (
    proposal_id, revision, member_id, member_name, model_definition,
    computational_claim, initial_epistemic_status
  ) VALUES (?, 1, ?, ?, ?, ?, ?)`).run(
    'proposal-preserved', 'preserved-model', 'Preserved model', 'A bounded model.', 'No result.', 'candidate',
  )
}

function preservedDigest(db) {
  return JSON.stringify({
    proposal: db.prepare('SELECT * FROM proposals WHERE proposal_id=?').get('proposal-preserved'),
    revision: db.prepare('SELECT * FROM proposal_revisions WHERE proposal_id=?').get('proposal-preserved'),
    detail: db.prepare('SELECT * FROM theoretical_model_details WHERE proposal_id=?').get('proposal-preserved'),
  })
}

test('illustrative experiment catalog covers every supplied proposal family without admission flags', () => {
  assert.equal(validateIllustrativeCatalog(), true)
  assert.equal(illustrativeExperimentCatalog.items.length, 10)
  const titles = illustrativeExperimentCatalog.items.map((item) => item.title).join(' ')
  for (const phrase of ['chiral-nematic', 'graphene', 'OAM', 'femtosecond', 'mixed-halide', 'RF/acoustic', 'FPGA', 'HVM']) {
    assert.match(titles, new RegExp(phrase, 'iu'))
  }
  assert.equal(illustrativeExperimentCatalog.origin_story.status, 'clearly-conjectural')
})

test('0011 preserves populated public history, adds typed experiment/equipment proposals, and is immutable', () => {
  const db = database()
  applyThroughTen(db)
  seedPopulatedProposal(db)
  const before = preservedDigest(db)
  apply(db, '0011_experiments_equipment.sql')
  assert.equal(db.prepare('SELECT metadata_value FROM public_schema_metadata WHERE metadata_key=\'schema_version\'').get().metadata_value, '7')
  assert.equal(preservedDigest(db), before)

  db.prepare(`INSERT INTO proposals (proposal_id, proposal_kind, author_account_id, created_at) VALUES (?, ?, ?, ?)`).run(
    'proposal-experiment', 'proposed-experiment', 'account-author', at,
  )
  db.prepare(`INSERT INTO proposal_state_events (
    proposal_id, event_sequence, state_event_id, from_state, to_state,
    selected_revision, actor_account_id, rationale, source_timestamp, recorded_at
  ) VALUES (?, 1, ?, NULL, 'submitted', NULL, ?, 'Experiment proposal', ?, ?)`).run(
    'proposal-experiment', 'state-proposal-experiment-1', 'account-author', at, at,
  )
  db.prepare(`INSERT INTO proposal_revisions (
    proposal_id, revision, revision_id, author_account_id, title, summary,
    rationale, scope, content_sha256, source_timestamp, recorded_at
  ) VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'proposal-experiment', 'proposal-experiment-revision-1', 'account-author',
    'Experiment proposal', 'A complete proposal.', 'A falsifiable rationale.', 'A bounded scope.', hash('c'), at, at,
  )
  const empty = JSON.stringify([])
  const detail = {
    targets_json: JSON.stringify([{ target_id: 'target-1', target_kind: 'external-reference', target_label: 'Operator target' }]),
    protocols_json: JSON.stringify([{ protocol_id: 'protocol-1', minimal_decisive_test: 'Smallest test' }]),
    controls_json: JSON.stringify([]),
    observables_json: JSON.stringify([{ observable_id: 'observable-1', units: 'dimensionless' }]),
    calibration_json: empty,
    repetitions_json: JSON.stringify({ repetition_id: 'repetition-1' }),
    uncertainty_json: JSON.stringify({ uncertainty_id: 'uncertainty-1' }),
    criteria_json: JSON.stringify([
      { criterion_id: 'success-1', criterion_kind: 'success' },
      { criterion_id: 'falsifier-1', criterion_kind: 'falsifier' },
    ]),
    confounds_json: empty,
    raw_artifacts_json: JSON.stringify([{ raw_artifact_id: 'raw-1' }]),
    nonclaims_json: JSON.stringify(['No run or result is claimed.']),
    dependencies_json: empty,
    relations_json: empty,
    equipment_requirements_json: JSON.stringify([{ requirement_id: 'equipment-1', group_id: 'group-1', capability: 'calibrated readout' }]),
    topic_links_json: empty,
  }
  db.prepare(`INSERT INTO proposed_experiment_details (
    proposal_id, revision, experiment_id, experiment_version, experiment_kind, intent,
    targets_json, protocols_json, controls_json, observables_json, calibration_json,
    repetitions_json, uncertainty_json, criteria_json, confounds_json, raw_artifacts_json,
    nonclaims_json, dependencies_json, relations_json, equipment_requirements_json, topic_links_json
  ) VALUES (?, 1, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'proposal-experiment', 'proposed-experiment', 'physical', 'falsification',
    detail.targets_json, detail.protocols_json, detail.controls_json, detail.observables_json,
    detail.calibration_json, detail.repetitions_json, detail.uncertainty_json, detail.criteria_json,
    detail.confounds_json, detail.raw_artifacts_json, detail.nonclaims_json, detail.dependencies_json,
    detail.relations_json, detail.equipment_requirements_json, detail.topic_links_json,
  )
  assert.equal(db.prepare('SELECT matching_detail_count FROM proposal_revision_detail_counts WHERE proposal_id=?').get('proposal-experiment').matching_detail_count, 1)
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM public_schema_violations').get().count, 0)
  assert.throws(() => db.prepare('UPDATE proposed_experiment_details SET experiment_kind=\'simulation\' WHERE proposal_id=\'proposal-experiment\'').run(), /immutable public record/u)
  assert.throws(() => db.prepare('DELETE FROM proposed_experiment_details WHERE proposal_id=\'proposal-experiment\'').run(), /immutable public record/u)
})

test('0011 replays after a persisted statement prefix and rolls back a late failure', () => {
  const db = database()
  applyThroughTen(db)
  seedPopulatedProposal(db)
  const before = preservedDigest(db)
  const statements = unstable_splitSqlQuery(sql.get('0011_experiments_equipment.sql')).filter((value) => value.trim())
  for (const statement of statements.slice(0, 18)) db.exec(statement)
  for (const statement of statements) db.exec(statement)
  assert.equal(db.prepare('SELECT metadata_value FROM public_schema_metadata WHERE metadata_key=\'schema_version\'').get().metadata_value, '7')
  assert.equal(preservedDigest(db), before)
  const compoundTerms = statements
    .filter((statement) => /\bSELECT\b/iu.test(statement))
    .map((statement) => 1 + (statement.match(/\bUNION(?:\s+ALL)?\b/giu) ?? []).length)
  assert.ok(compoundTerms.length > 0)
  assert.ok(Math.max(...compoundTerms) <= taskCompoundSelectBudget)

  const rollbackDb = database()
  applyThroughTen(rollbackDb)
  rollbackDb.exec('BEGIN IMMEDIATE')
  assert.throws(() => {
    for (const statement of statements) rollbackDb.exec(statement)
    rollbackDb.exec('SELECT * FROM missing_task_9_table')
  }, /missing_task_9_table/u)
  rollbackDb.exec('ROLLBACK')
  assert.equal(rollbackDb.prepare('SELECT metadata_value FROM public_schema_metadata WHERE metadata_key=\'schema_version\'').get().metadata_value, '6')
  assert.equal(rollbackDb.prepare('SELECT COUNT(*) AS count FROM sqlite_master WHERE name=\'proposed_experiment_details\'').get().count, 0)
})

function shellSql(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

function createWranglerFixture() {
  const rootPath = mkdtempSync(resolve(tmpdir(), 'cintamani-task9-wrangler-'))
  const migrationsPath = resolve(rootPath, 'migrations')
  mkdirSync(migrationsPath)
  for (const name of names.filter((value) => value < '0011_experiments_equipment.sql')) {
    copyFileSync(resolve(migrationRoot, name), resolve(migrationsPath, name))
  }
  const configPath = resolve(rootPath, 'wrangler.jsonc')
  writeFileSync(configPath, `${JSON.stringify({
    name: 'cintamani-task9-populated-d1',
    compatibility_date: '2026-08-11',
    d1_databases: [{
      binding: 'PROPOSALS_DB',
      database_name: 'cintamani-task9-populated-d1',
      database_id: '562103ed-5b70-4409-9135-198da6677452',
      migrations_dir: 'migrations',
    }],
  }, null, 2)}\n`)
  return { rootPath, migrationsPath, configPath, stateRoot: resolve(rootPath, 'state') }
}

function wranglerCommand() {
  return [process.execPath, resolve(root, '..', 'node_modules', 'wrangler', 'bin', 'wrangler.js')]
}

function runWrangler(fixture, arguments_, { json = false } = {}) {
  const wrangler = wranglerCommand()
  const result = spawnSync(
    wrangler[0],
    [...wrangler.slice(1), 'd1', ...arguments_, '--config', fixture.configPath, '--local', '--persist-to', fixture.stateRoot],
    { cwd: resolve(root, '..'), encoding: 'utf8', timeout: 120_000, windowsHide: true },
  )
  assert.equal(result.error, undefined, result.error?.message ?? '')
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  if (!json) return result.stdout
  const envelope = JSON.parse(result.stdout)
  assert.equal(envelope.length, 1)
  assert.equal(envelope[0].success, true)
  return envelope[0].results
}

function seedWranglerProposal(fixture) {
  const seedPath = resolve(fixture.rootPath, 'seed.sql')
  writeFileSync(seedPath, `${[
    `INSERT INTO public_accounts (
    account_id, github_identity_hmac_sha256, github_login, github_profile_url,
    github_avatar_url, created_at, last_authenticated_at
  ) VALUES ('account-wrangler', ${shellSql(hash('w'))}, 'wrangler-author', 'https://github.com/wrangler-author', NULL, ${shellSql(at)}, ${shellSql(at)})`,
    `INSERT INTO proposals (
    proposal_id, proposal_kind, author_account_id, parent_proposal_id,
    parent_revision, created_at
  ) VALUES ('proposal-wrangler-preserved', 'theoretical-model-member', 'account-wrangler', NULL, NULL, ${shellSql(at)})`,
    `INSERT INTO proposal_state_events (
    proposal_id, event_sequence, state_event_id, from_state, to_state,
    selected_revision, actor_account_id, rationale, source_timestamp, recorded_at
  ) VALUES ('proposal-wrangler-preserved', 1, 'state-wrangler-preserved-1', NULL, 'submitted', NULL, 'account-wrangler', 'Seeded populated Wrangler migration row', ${shellSql(at)}, ${shellSql(at)})`,
    `INSERT INTO proposal_revisions (
    proposal_id, revision, revision_id, author_account_id, title, summary,
    rationale, scope, content_sha256, source_timestamp, recorded_at
  ) VALUES ('proposal-wrangler-preserved', 1, 'proposal-wrangler-preserved-revision-1', 'account-wrangler',
    'Wrangler preserved proposal', 'A populated row used for actual migration retry coverage.',
    'The row must remain byte-identical.', 'Migration test only.', ${shellSql(hash('x'))}, ${shellSql(at)}, ${shellSql(at)})`,
    `INSERT INTO theoretical_model_details (
    proposal_id, revision, member_id, member_name, model_definition,
    computational_claim, initial_epistemic_status
  ) VALUES ('proposal-wrangler-preserved', 1, 'wrangler-preserved-model', 'Wrangler preserved model', 'A bounded model.', 'No result.', 'candidate')`,
  ].join(';\n')}\n`)
  runWrangler(fixture, ['execute', 'PROPOSALS_DB', '--file', seedPath])
}

function wranglerPreservedDigest(fixture) {
  return {
    proposal: runWrangler(fixture, ['execute', 'PROPOSALS_DB', '--command', "SELECT proposal_id, proposal_kind, author_account_id, parent_proposal_id, parent_revision, created_at, current_revision, current_state_event_sequence, current_admin_state FROM proposals WHERE proposal_id='proposal-wrangler-preserved'", '--json'], { json: true }),
    revision: runWrangler(fixture, ['execute', 'PROPOSALS_DB', '--command', "SELECT proposal_id, revision, revision_id, author_account_id, title, summary, rationale, scope, content_sha256, source_timestamp, recorded_at FROM proposal_revisions WHERE proposal_id='proposal-wrangler-preserved'", '--json'], { json: true }),
    detail: runWrangler(fixture, ['execute', 'PROPOSALS_DB', '--command', "SELECT proposal_id, revision, member_id, member_name, model_definition, computational_claim, initial_epistemic_status FROM theoretical_model_details WHERE proposal_id='proposal-wrangler-preserved'", '--json'], { json: true }),
  }
}

test('actual Wrangler local D1 migrates a populated v6 database and retries 0011 without byte drift', () => {
  const fixture = createWranglerFixture()
  let completed = false
  try {
    runWrangler(fixture, ['migrations', 'apply', 'PROPOSALS_DB'])
    seedWranglerProposal(fixture)
    const before = wranglerPreservedDigest(fixture)
    copyFileSync(resolve(migrationRoot, '0011_experiments_equipment.sql'), resolve(fixture.migrationsPath, '0011_experiments_equipment.sql'))
    runWrangler(fixture, ['migrations', 'apply', 'PROPOSALS_DB'])
    assert.deepEqual(wranglerPreservedDigest(fixture), before)
    assert.deepEqual(
      runWrangler(fixture, ['execute', 'PROPOSALS_DB', '--command', "SELECT metadata_key, metadata_value FROM public_schema_metadata ORDER BY metadata_key", '--json'], { json: true }),
      [
        { metadata_key: 'projection_kind', metadata_value: 'cintamani-public-proposals' },
        { metadata_key: 'schema_version', metadata_value: '7' },
      ],
    )
    assert.deepEqual(
      runWrangler(fixture, ['execute', 'PROPOSALS_DB', '--command', 'SELECT COUNT(*) AS count FROM public_schema_violations', '--json'], { json: true }),
      [{ count: 0 }],
    )
    assert.deepEqual(runWrangler(fixture, ['execute', 'PROPOSALS_DB', '--command', 'PRAGMA foreign_key_check', '--json'], { json: true }), [])
    const migrationRows = runWrangler(fixture, ['execute', 'PROPOSALS_DB', '--command', 'SELECT id, name FROM d1_migrations ORDER BY id', '--json'], { json: true })
    const taskMigration = migrationRows.find((row) => String(row.name).includes('0011_experiments_equipment'))
    assert.ok(taskMigration)
    runWrangler(fixture, ['execute', 'PROPOSALS_DB', '--command', `DELETE FROM d1_migrations WHERE id=${Number(taskMigration.id)}`])
    runWrangler(fixture, ['migrations', 'apply', 'PROPOSALS_DB'])
    assert.deepEqual(wranglerPreservedDigest(fixture), before)
    assert.deepEqual(
      runWrangler(fixture, ['execute', 'PROPOSALS_DB', '--command', 'SELECT COUNT(*) AS count FROM public_schema_violations', '--json'], { json: true }),
      [{ count: 0 }],
    )
    completed = true
  } finally {
    if (completed) rmSync(fixture.rootPath, { recursive: true, force: true })
    else process.stderr.write(`retained Wrangler fixture for diagnosis: ${fixture.rootPath}\n`)
  }
})
