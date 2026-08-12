import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { unstable_splitSqlQuery } from 'wrangler'

const testRoot = dirname(fileURLToPath(import.meta.url))
const migrationRoot = resolve(testRoot, '../migrations')
const identityMigrationNames = readdirSync(migrationRoot)
  .filter((name) => /^000[1-8]_.*\.sql$/u.test(name))
  .sort()
const identityMigrations = new Map(
  identityMigrationNames.map((name) => [name, readFileSync(resolve(migrationRoot, name), 'utf8')]),
)
const at = '2026-08-11T18:00:00.000Z'
const later = '2026-08-12T18:00:00.000Z'
const hash = (character) => character.repeat(64)

function migration(name) {
  const sql = identityMigrations.get(name)
  assert.ok(sql, `missing identity migration ${name}`)
  return sql
}

function executeBatch(database, statements) {
  database.exec('BEGIN IMMEDIATE')
  try {
    for (const statement of statements) {
      if (statement.trim()) database.exec(statement)
    }
    const violations = database.prepare('PRAGMA foreign_key_check').all().map((row) => ({ ...row }))
    if (violations.length > 0) {
      throw new Error(`deferred foreign-key violations: ${JSON.stringify(violations)}`)
    }
    database.exec('COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}

function applySql(database, sql) {
  executeBatch(database, unstable_splitSqlQuery(sql))
}

function openThrough(lastName) {
  const database = new DatabaseSync(':memory:')
  database.exec('PRAGMA foreign_keys = ON')
  for (const name of identityMigrationNames) {
    applySql(database, migration(name))
    if (name === lastName) break
  }
  return database
}

function insertLegacyAccount(database, { id, login, digest }) {
  database.prepare(
    `INSERT INTO public_accounts (
       account_id, github_identity_hmac_sha256, github_login, github_profile_url,
       github_avatar_url, created_at, last_authenticated_at
     ) VALUES (?, ?, ?, ?, NULL, ?, ?)`,
  ).run(id, digest, login, `https://github.com/${login}`, at, at)
}

function seedPopulatedV2(database) {
  insertLegacyAccount(database, { id: 'account-author', login: 'Author', digest: hash('a') })
  insertLegacyAccount(database, { id: 'account-operator', login: 'Operator', digest: hash('b') })

  database.prepare(
    `INSERT INTO public_sessions (
       session_token_sha256, csrf_token_sha256, account_id, created_at,
       expires_at, revoked_at, rotated_to_sha256
     ) VALUES (?, ?, 'account-author', ?, ?, NULL, NULL)`,
  ).run(hash('2'), hash('3'), at, later)
  database.prepare(
    `INSERT INTO public_sessions (
       session_token_sha256, csrf_token_sha256, account_id, created_at,
       expires_at, revoked_at, rotated_to_sha256
     ) VALUES (?, ?, 'account-author', ?, ?, ?, ?)`,
  ).run(hash('4'), hash('5'), at, later, at, hash('2'))

  database.prepare(
    `INSERT INTO proposals (
       proposal_id, proposal_kind, author_account_id, parent_proposal_id,
       parent_revision, created_at
     ) VALUES ('proposal-preserved', 'theoretical-model-member', 'account-author', NULL, NULL, ?)`,
  ).run(at)
  database.prepare(
    `INSERT INTO proposal_state_events (
       proposal_id, event_sequence, state_event_id, from_state, to_state,
       selected_revision, actor_account_id, rationale, source_timestamp, recorded_at
     ) VALUES ('proposal-preserved', 1, 'state-preserved-1', NULL, 'submitted',
               NULL, 'account-author', 'Public submission', ?, ?)`,
  ).run(at, at)
  database.prepare(
    `INSERT INTO proposal_revisions (
       proposal_id, revision, revision_id, author_account_id, title, summary,
       rationale, scope, content_sha256, source_timestamp, recorded_at
     ) VALUES ('proposal-preserved', 1, 'revision-preserved-1', 'account-author',
               'Preserved title', 'Preserved summary', 'Preserved rationale',
               'Preserved scope', ?, ?, ?)`,
  ).run(hash('6'), at, at)
  database.prepare(
    `INSERT INTO theoretical_model_details VALUES (
       'proposal-preserved', 1, 'preserved-model', 'Preserved model',
       'A typed model definition', 'A bounded computational claim', 'candidate'
     )`,
  ).run()
  database.prepare(
    `INSERT INTO proposal_evidence (
       evidence_id, proposal_id, revision, evidence_kind, summary,
       source_timestamp, recorded_at, author_account_id
     ) VALUES ('evidence-preserved', 'proposal-preserved', 1, 'argument',
               'Preserved evidence boundary', ?, ?, 'account-author')`,
  ).run(at, at)
  database.prepare(
    `INSERT INTO proposal_references (
       reference_id, proposal_id, revision, reference_kind, label,
       https_url, source_timestamp, recorded_at
     ) VALUES ('proposal-reference-preserved', 'proposal-preserved', 1,
               'primary-source', 'Preserved source', 'https://example.org/source', ?, ?)`,
  ).run(at, at)
  database.prepare(
    `INSERT INTO criticisms VALUES (
       'criticism-preserved', 'proposal-preserved', 1, 'account-author',
       'Preserved criticism', 'A bounded criticism', 'Revision 1 only', ?, ?
     )`,
  ).run(at, at)
  database.prepare(
    `INSERT INTO criticism_replies VALUES (
       'reply-preserved', 'criticism-preserved', 'proposal-preserved', 1,
       'account-author', 'A preserved reply', ?, ?
     )`,
  ).run(at, at)
  database.prepare(
    `INSERT INTO criticism_references (
       reference_id, criticism_id, label, https_url, recorded_at
     ) VALUES ('criticism-reference-preserved', 'criticism-preserved',
               'Preserved criticism source', 'https://example.org/criticism', ?)`,
  ).run(at)
  database.prepare(
    `INSERT INTO scoped_test_reports VALUES (
       'test-preserved', 'proposal-preserved', 1, 'account-author', 'Preserved test',
       'Frozen protocol', 'Observed result', 'Bounded interpretation', 'inconclusive', ?, ?
     )`,
  ).run(at, at)
  database.prepare(
    `INSERT INTO competing_interpretations VALUES (
       'interpretation-preserved', 'proposal-preserved', 1, 'account-author',
       'Preserved interpretation', 'A competing interpretation', 'Revision 1 only', ?, ?
     )`,
  ).run(at, at)
  database.prepare(
    `INSERT INTO test_report_references (
       reference_id, test_report_id, label, https_url, recorded_at
     ) VALUES ('test-reference-preserved', 'test-preserved',
               'Preserved test source', 'https://example.org/test', ?)`,
  ).run(at)

  database.prepare(
    `INSERT INTO moderation_actions (
       moderation_action_id, moderator_account_id, action_kind, target_kind,
       target_account_id, reason_code, explanation, source_timestamp, recorded_at
     ) VALUES ('moderation-preserved', 'account-operator', 'lock-contributor', 'account',
               'account-author', 'bounded-lock', 'A preserved lock event', ?, ?)`,
  ).run(at, at)
  database.prepare(
    `INSERT INTO appeals (
       appeal_id, moderation_action_id, appellant_account_id, appeal,
       source_timestamp, recorded_at
     ) VALUES ('appeal-preserved', 'moderation-preserved', 'account-author',
               'A preserved appeal', ?, ?)`,
  ).run(at, at)
  database.prepare(
    `INSERT INTO appeal_state_events (
       appeal_id, event_sequence, appeal_state_event_id, from_state, to_state,
       actor_account_id, rationale, source_timestamp, recorded_at
     ) VALUES ('appeal-preserved', 1, 'appeal-state-preserved-1', NULL, 'submitted',
               'account-author', 'Appeal submitted', ?, ?)`,
  ).run(at, at)

  database.prepare(
    `INSERT INTO write_idempotency_keys (
       account_id, operation, key_sha256, request_sha256, response_status,
       response_json, created_at, expires_at
     ) VALUES ('account-author', 'proposal', ?, ?, 201, '{}', ?, ?)`,
  ).run(hash('7'), hash('8'), at, later)
  database.prepare(
    `INSERT INTO quota_events (
       quota_event_id, account_id, ip_hmac_sha256, mutation_kind, recorded_at
     ) VALUES ('quota-preserved', 'account-author', ?, 'proposal', ?)`,
  ).run(hash('9'), at)

  database.prepare(
    `INSERT INTO account_role_events (
       role_event_id, account_id, role, action_kind, actor_account_id,
       authority_kind, authority_ref, rationale, source_timestamp, recorded_at
     ) VALUES ('role-preserved', 'account-operator', 'operator', 'granted', NULL,
               'deployment-bootstrap', 'preserved-bootstrap', 'Initial operator', ?, ?)`,
  ).run(at, at)

  database.prepare(
    `INSERT INTO proposal_state_events (
       proposal_id, event_sequence, state_event_id, from_state, to_state,
       selected_revision, actor_account_id, rationale, source_timestamp, recorded_at
     ) VALUES ('proposal-preserved', 2, 'state-preserved-2', 'submitted', 'triaged',
               NULL, 'account-operator', 'Triage', ?, ?)`,
  ).run(at, at)
  database.prepare(
    `INSERT INTO proposal_state_events (
       proposal_id, event_sequence, state_event_id, from_state, to_state,
       selected_revision, actor_account_id, rationale, source_timestamp, recorded_at
     ) VALUES ('proposal-preserved', 3, 'state-preserved-3', 'triaged', 'selected-for-export',
               1, 'account-operator', 'Select revision', ?, ?)`,
  ).run(at, at)
  database.prepare(
    `INSERT INTO maintainer_exports (
       export_id, proposal_id, selected_revision, selected_state_event_sequence,
       export_scope, criticisms_non_exhaustive, canonical_json, content_sha256,
       created_by_account_id, recorded_at
     ) VALUES ('export-preserved', 'proposal-preserved', 1, 3, 'Exact snapshot', 1,
               '{}', ?, 'account-operator', ?)`,
  ).run(hash('c'), at)
  database.prepare(
    `INSERT INTO admission_links (
       admission_link_id, export_id, canonical_admission_id, canonical_entry_id,
       canonical_commit_sha, linked_by_account_id, source_timestamp, recorded_at
     ) VALUES ('admission-link-preserved', 'export-preserved', 'admission-preserved',
               'entry-preserved', ?, 'account-operator', ?, ?)`,
  ).run('d'.repeat(40), at, at)
}

const preservedTables = [
  'public_accounts',
  'public_sessions',
  'proposals',
  'proposal_revisions',
  'theoretical_model_details',
  'physical_material_details',
  'physical_mechanism_details',
  'observation_interface_details',
  'existing_member_assessment_details',
  'existing_member_correction_details',
  'ontology_change_details',
  'proposal_evidence',
  'proposal_references',
  'criticisms',
  'criticism_replies',
  'criticism_references',
  'scoped_test_reports',
  'test_report_references',
  'competing_interpretations',
  'proposal_state_events',
  'moderation_actions',
  'appeals',
  'appeal_state_events',
  'write_idempotency_keys',
  'quota_events',
  'maintainer_exports',
  'admission_links',
  'account_role_events',
]

function quoted(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`
}

function snapshotLegacyRows(database, priorColumns = undefined) {
  return Object.fromEntries(preservedTables.map((table) => {
    const columns = priorColumns?.[table] ?? database
      .prepare(`PRAGMA table_info(${quoted(table)})`)
      .all()
      .map((column) => column.name)
    const rows = database
      .prepare(`SELECT ${columns.map(quoted).join(', ')} FROM ${quoted(table)} ORDER BY rowid`)
      .all()
      .map((row) => ({ ...row }))
    const json = JSON.stringify(rows)
    return [table, {
      columns,
      count: rows.length,
      hash: createHash('sha256').update(json).digest('hex'),
      rows,
    }]
  }))
}

function schemaDigest(database) {
  const objects = database.prepare(
    `SELECT type, name, tbl_name, sql
     FROM sqlite_master
     WHERE name NOT LIKE 'sqlite_%'
     ORDER BY type, name`,
  ).all().map((row) => ({ ...row }))
  return createHash('sha256').update(JSON.stringify(objects)).digest('hex')
}

function assertHealthy(database) {
  assert.equal(database.prepare('PRAGMA integrity_check').get().integrity_check, 'ok')
  assert.deepEqual(database.prepare('PRAGMA foreign_key_check').all(), [])
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM public_schema_violations').get().count, 0)
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM proposal_cache_drift').get().count, 0)
}

test('identity migrations split into complete D1 statements without trigger-body CASE', () => {
  for (const name of ['0005_contributor_principals.sql', '0006_principal_fk_cutover.sql']) {
    const statements = unstable_splitSqlQuery(migration(name))
    assert.ok(statements.length > 1, `${name} must split into a nontrivial D1 batch`)
    for (const statement of statements) {
      if (!/^\s*CREATE\s+TRIGGER\b/iu.test(statement)) continue
      assert.match(statement, /\bBEGIN\b[\s\S]*\bEND\s*$/u, `${name} emitted a truncated trigger`)
      assert.doesNotMatch(
        statement.slice(statement.search(/\bBEGIN\b/iu)),
        /\bCASE\b/iu,
        `${name} uses CASE inside a trigger compound statement`,
      )
    }
  }
})

test('empty identity expansion and cutover retain version 2 and retarget all legacy principal FKs', () => {
  const database = openThrough('0004_operator_roles.sql')
  assert.equal(
    database.prepare("SELECT metadata_value FROM public_schema_metadata WHERE metadata_key = 'schema_version'").get().metadata_value,
    '2',
  )
  applySql(database, migration('0005_contributor_principals.sql'))
  assert.equal(
    database.prepare("SELECT metadata_value FROM public_schema_metadata WHERE metadata_key = 'schema_version'").get().metadata_value,
    '2',
  )
  applySql(database, migration('0006_principal_fk_cutover.sql'))
  assert.equal(
    database.prepare("SELECT metadata_value FROM public_schema_metadata WHERE metadata_key = 'schema_version'").get().metadata_value,
    '2',
  )

  const expectedPrincipalFks = [
    ['public_sessions', 'account_id'],
    ['proposals', 'author_account_id'],
    ['proposal_revisions', 'author_account_id'],
    ['proposal_evidence', 'author_account_id'],
    ['criticisms', 'author_account_id'],
    ['criticism_replies', 'author_account_id'],
    ['scoped_test_reports', 'author_account_id'],
    ['competing_interpretations', 'author_account_id'],
    ['proposal_state_events', 'actor_account_id'],
    ['moderation_actions', 'moderator_account_id'],
    ['moderation_actions', 'target_account_id'],
    ['appeals', 'appellant_account_id'],
    ['appeal_state_events', 'actor_account_id'],
    ['write_idempotency_keys', 'account_id'],
    ['quota_events', 'account_id'],
    ['maintainer_exports', 'created_by_account_id'],
    ['admission_links', 'linked_by_account_id'],
    ['account_role_events', 'account_id'],
    ['account_role_events', 'actor_account_id'],
  ]
  for (const [table, column] of expectedPrincipalFks) {
    const match = database.prepare(`PRAGMA foreign_key_list(${quoted(table)})`).all()
      .find((foreignKey) => foreignKey.from === column)
    assert.ok(match, `missing ${table}.${column} foreign key`)
    assert.equal(match.table, 'contributor_principals', `${table}.${column} has the wrong target`)
    assert.equal(match.to, 'principal_id', `${table}.${column} has the wrong target column`)
  }
  assert.equal(expectedPrincipalFks.length, 19)

  const githubSubtypeFk = database.prepare('PRAGMA foreign_key_list(public_accounts)').all()
    .filter((foreignKey) => foreignKey.table === 'contributor_principals')
  assert.deepEqual(
    githubSubtypeFk.map((foreignKey) => [foreignKey.from, foreignKey.to]).sort(),
    [['account_id', 'principal_id'], ['principal_kind', 'principal_kind']],
  )
  const unexpectedAccountTargets = database.prepare(
    `SELECT name, sql FROM sqlite_master
     WHERE type = 'table' AND sql LIKE '%REFERENCES public_accounts%'`,
  ).all().map((row) => row.name)
  assert.deepEqual(unexpectedAccountTargets, ['principal_identity_link_events'])

  const requiredViews = [
    'current_account_locks',
    'current_account_roles',
    'current_principal_identity_links',
    'current_principal_locks',
    'current_principal_roles',
    'public_contributor_profiles',
    'public_proposal_summaries',
    'public_schema_violations',
  ]
  const views = new Set(database.prepare("SELECT name FROM sqlite_master WHERE type = 'view'").all().map((row) => row.name))
  requiredViews.forEach((view) => assert.ok(views.has(view), `missing view ${view}`))
  requiredViews.forEach((view) => database.prepare(`SELECT * FROM ${quoted(view)} LIMIT 1`).all())

  const shadowObjects = database.prepare(
    "SELECT name FROM sqlite_master WHERE name GLOB '_v3_*' OR name GLOB '_hold_*' ORDER BY name",
  ).all()
  assert.deepEqual(shadowObjects, [])
  const rebuilt = new Set(['public_accounts', ...preservedTables])
  const strictTables = new Map(database.prepare('PRAGMA table_list').all().map((row) => [row.name, row.strict]))
  rebuilt.forEach((table) => assert.equal(strictTables.get(table), 1, `${table} lost STRICT mode`))
  assertHealthy(database)
  database.close()
})

test('populated cutover preserves every legacy row and cache while backfilling principals and sessions', () => {
  const database = openThrough('0004_operator_roles.sql')
  seedPopulatedV2(database)
  const before = snapshotLegacyRows(database)
  const priorColumns = Object.fromEntries(Object.entries(before).map(([table, value]) => [table, value.columns]))

  applySql(database, migration('0005_contributor_principals.sql'))
  const sessionEventsBeforeCutover = database.prepare(
    `SELECT * FROM principal_session_events
     ORDER BY session_token_sha256, event_sequence`,
  ).all().map((row) => ({ ...row }))
  assert.equal(
    database.prepare("SELECT metadata_value FROM public_schema_metadata WHERE metadata_key = 'schema_version'").get().metadata_value,
    '2',
  )
  applySql(database, migration('0006_principal_fk_cutover.sql'))
  const after = snapshotLegacyRows(database, priorColumns)
  for (const table of preservedTables) {
    assert.equal(after[table].count, before[table].count, `${table} row count changed`)
    assert.equal(after[table].hash, before[table].hash, `${table} row hash changed`)
    assert.deepEqual(after[table].rows, before[table].rows, `${table} rows changed`)
  }

  assert.deepEqual(
    database.prepare(
      `SELECT principal_id, principal_kind, public_pseudonym, pseudonym_key_version
       FROM contributor_principals ORDER BY principal_id`,
    ).all().map((row) => ({ ...row })),
    [
      { principal_id: 'account-author', principal_kind: 'github', public_pseudonym: 'gh:author', pseudonym_key_version: 1 },
      { principal_id: 'account-operator', principal_kind: 'github', public_pseudonym: 'gh:operator', pseudonym_key_version: 1 },
    ],
  )
  assert.deepEqual(
    database.prepare(
      `SELECT auth_kind, transport, scope, COUNT(*) AS count
       FROM public_sessions GROUP BY auth_kind, transport, scope`,
    ).all().map((row) => ({ ...row })),
    [{ auth_kind: 'github', transport: 'browser-cookie', scope: 'public-contributor', count: 2 }],
  )
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM principal_session_events').get().count, 2)
  assert.deepEqual(
    database.prepare(
      `SELECT * FROM principal_session_events
       ORDER BY session_token_sha256, event_sequence`,
    ).all().map((row) => ({ ...row })),
    sessionEventsBeforeCutover,
  )
  assert.equal(database.prepare('SELECT seq FROM sqlite_sequence WHERE name = ?').get('moderation_actions').seq, 1)
  assert.equal(database.prepare('SELECT seq FROM sqlite_sequence WHERE name = ?').get('account_role_events').seq, 1)

  const nextModeration = database.prepare(
    `INSERT INTO moderation_actions (
       moderation_action_id, moderator_account_id, action_kind, target_kind,
       target_criticism_id, reason_code, explanation, source_timestamp, recorded_at
     ) VALUES ('moderation-next', 'account-operator', 'label', 'criticism',
               'criticism-preserved', 'bounded-label', 'Sequence preservation', ?, ?)`,
  ).run(at, at)
  assert.equal(Number(nextModeration.lastInsertRowid), 2)
  const nextRole = database.prepare(
    `INSERT INTO account_role_events (
       role_event_id, account_id, role, action_kind, actor_account_id,
       authority_kind, authority_ref, rationale, source_timestamp, recorded_at
     ) VALUES ('role-next', 'account-author', 'operator', 'granted', 'account-operator',
               'operator', 'preserved-api', 'Sequence preservation', ?, ?)`,
  ).run(at, at)
  assert.equal(Number(nextRole.lastInsertRowid), 2)

  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM public_proposal_summaries').get().count, 1)
  assert.equal(database.prepare(
    "SELECT target_principal_id FROM current_principal_locks WHERE moderation_action_id = 'moderation-preserved'",
  ).get().target_principal_id, 'account-author')
  assert.equal(database.prepare(
    "SELECT target_account_id FROM current_account_locks WHERE moderation_action_id = 'moderation-preserved'",
  ).get().target_account_id, 'account-author')
  assert.throws(
    () => database.prepare("UPDATE proposal_revisions SET title = 'rewrite'").run(),
    /immutable public record/u,
  )
  assertHealthy(database)
  database.close()
})

test('unchanged Task 4 GitHub INSERT and UPSERT create one stable generic principal', () => {
  const database = openThrough('0006_principal_fk_cutover.sql')
  const oauthSql = `INSERT INTO public_accounts (
      account_id, github_identity_hmac_sha256, github_login, github_profile_url,
      github_avatar_url, created_at, last_authenticated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(github_identity_hmac_sha256) DO UPDATE SET
      github_login = excluded.github_login,
      github_profile_url = excluded.github_profile_url,
      github_avatar_url = excluded.github_avatar_url,
      last_authenticated_at = excluded.last_authenticated_at`

  database.prepare(oauthSql).run(
    'account-oauth', hash('d'), 'FirstLogin', 'https://github.com/FirstLogin', null, at, at,
  )
  assert.deepEqual(
    { ...database.prepare(
      `SELECT principal_id, principal_kind, public_pseudonym, pseudonym_key_version, created_at
       FROM contributor_principals WHERE principal_id = 'account-oauth'`,
    ).get() },
    {
      principal_id: 'account-oauth',
      principal_kind: 'github',
      public_pseudonym: 'gh:firstlogin',
      pseudonym_key_version: 1,
      created_at: at,
    },
  )

  database.prepare(oauthSql).run(
    'ignored-conflict-id', hash('d'), 'RenamedLogin', 'https://github.com/RenamedLogin', null, at, later,
  )
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM public_accounts').get().count, 1)
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM contributor_principals').get().count, 1)
  assert.deepEqual(
    { ...database.prepare(
      `SELECT account.github_login, principal.public_pseudonym, principal.created_at
       FROM public_accounts account
       JOIN contributor_principals principal ON principal.principal_id = account.account_id`,
    ).get() },
    { github_login: 'RenamedLogin', public_pseudonym: 'gh:firstlogin', created_at: at },
  )
  assertHealthy(database)
  database.close()
})

function insertWallet(database, { id, pseudonym, addressDigest }) {
  database.prepare(
    `INSERT INTO contributor_principals (
       principal_id, principal_kind, public_pseudonym, pseudonym_key_version, created_at
     ) VALUES (?, 'base-wallet', ?, 1, ?)`,
  ).run(id, pseudonym, at)
  database.prepare(
    `INSERT INTO base_wallet_identities (
       principal_id, principal_kind, address_hmac_sha256, created_at, last_verified_at
     ) VALUES (?, 'base-wallet', ?, ?, ?)`,
  ).run(id, addressDigest, at, at)
}

function insertLinkEvent(database, {
  linkId,
  sequence,
  eventId,
  github,
  wallet,
  action,
  actor = github,
}) {
  database.prepare(
    `INSERT INTO principal_identity_link_events (
       link_id, event_sequence, link_event_id,
       github_principal_id, github_principal_kind,
       wallet_principal_id, wallet_principal_kind,
       action_kind, actor_principal_id, siwx_message_sha256, signature_sha256,
       rationale, source_timestamp, recorded_at
     ) VALUES (?, ?, ?, ?, 'github', ?, 'base-wallet', ?, ?, ?, ?,
               'Cryptographically verified identity relationship', ?, ?)`,
  ).run(linkId, sequence, eventId, github, wallet, action, actor, hash('e'), hash('f'), at, at)
}

test('wallet HMAC and pseudonym uniqueness plus link-state invariants are schema-enforced', () => {
  const database = openThrough('0006_principal_fk_cutover.sql')
  insertLegacyAccount(database, { id: 'account-one', login: 'one', digest: hash('1') })
  insertLegacyAccount(database, { id: 'account-two', login: 'two', digest: hash('2') })
  insertWallet(database, {
    id: 'wallet-one',
    pseudonym: `base:${'a'.repeat(12)}`,
    addressDigest: hash('3'),
  })
  insertWallet(database, {
    id: 'wallet-long-prefix',
    pseudonym: `base:${'b'.repeat(64)}`,
    addressDigest: hash('4'),
  })

  assert.throws(
    () => insertWallet(database, {
      id: 'wallet-short-prefix',
      pseudonym: `base:${'c'.repeat(11)}`,
      addressDigest: hash('5'),
    }),
    /CHECK constraint failed/u,
  )
  assert.throws(
    () => insertWallet(database, {
      id: 'wallet-longer-prefix',
      pseudonym: `base:${'d'.repeat(65)}`,
      addressDigest: hash('6'),
    }),
    /CHECK constraint failed/u,
  )
  database.prepare(
    `INSERT INTO contributor_principals (
       principal_id, principal_kind, public_pseudonym, pseudonym_key_version, created_at
     ) VALUES ('wallet-duplicate-address', 'base-wallet', ?, 1, ?)`,
  ).run(`base:${'c'.repeat(12)}`, at)
  assert.throws(
    () => database.prepare(
      `INSERT INTO base_wallet_identities (
         principal_id, address_hmac_sha256, created_at, last_verified_at
       ) VALUES ('wallet-duplicate-address', ?, ?, ?)`,
    ).run(hash('3'), at, at),
    /UNIQUE constraint failed/u,
  )

  insertLinkEvent(database, {
    linkId: 'link-one', sequence: 1, eventId: 'link-one-verified',
    github: 'account-one', wallet: 'wallet-one', action: 'verified',
  })
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM current_principal_identity_links').get().count, 1)
  assert.throws(
    () => insertLinkEvent(database, {
      linkId: 'link-one', sequence: 2, eventId: 'link-one-duplicate-verified',
      github: 'account-one', wallet: 'wallet-one', action: 'verified',
    }),
    /identity link actions must alternate/u,
  )
  assert.throws(
    () => insertLinkEvent(database, {
      linkId: 'link-one', sequence: 3, eventId: 'link-one-gap',
      github: 'account-one', wallet: 'wallet-one', action: 'revoked',
    }),
    /identity link events must be contiguous/u,
  )
  insertLinkEvent(database, {
    linkId: 'link-one', sequence: 2, eventId: 'link-one-revoked',
    github: 'account-one', wallet: 'wallet-one', action: 'revoked',
  })
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM current_principal_identity_links').get().count, 0)

  insertLinkEvent(database, {
    linkId: 'link-two', sequence: 1, eventId: 'link-two-verified',
    github: 'account-two', wallet: 'wallet-one', action: 'verified',
  })
  assert.throws(
    () => insertLinkEvent(database, {
      linkId: 'link-three', sequence: 1, eventId: 'link-three-verified',
      github: 'account-one', wallet: 'wallet-one', action: 'verified',
    }),
    /wallet already has an active GitHub link/u,
  )
  assert.throws(
    () => insertLinkEvent(database, {
      linkId: 'link-wrong-subtype', sequence: 1, eventId: 'link-wrong-subtype-verified',
      github: 'account-one', wallet: 'account-two', action: 'verified',
    }),
    /FOREIGN KEY constraint failed/u,
  )
  assert.throws(
    () => database.prepare(
      "UPDATE principal_identity_link_events SET rationale = 'rewrite' WHERE link_id = 'link-one'",
    ).run(),
    /immutable identity link event/u,
  )
  assert.throws(
    () => database.prepare("DELETE FROM principal_identity_link_events WHERE link_id = 'link-one'").run(),
    /immutable identity link event/u,
  )

  const privateColumns = database.prepare('PRAGMA table_info(base_wallet_identities)').all().map((row) => row.name)
  assert.ok(privateColumns.includes('address_hmac_sha256'))
  assert.ok(!privateColumns.includes('address') && !privateColumns.includes('wallet_address'))
  assertHealthy(database)
  database.close()
})

test('SIWX nonce and generalized session state keep raw proofs out and enforce transport semantics', () => {
  const database = openThrough('0006_principal_fk_cutover.sql')
  insertWallet(database, {
    id: 'wallet-session',
    pseudonym: `base:${'7'.repeat(12)}`,
    addressDigest: hash('8'),
  })

  database.prepare(
    `INSERT INTO siwx_nonces (
       nonce_digest_sha256, purpose, origin, uri, network, issued_at, expires_at, consumed_at
     ) VALUES (?, 'session', 'https://cintamani.example',
               'https://cintamani.example/api/auth/siwx', 'base-mainnet', ?, ?, NULL)`,
  ).run(hash('9'), at, later)
  assert.throws(
    () => database.prepare(
      "UPDATE siwx_nonces SET uri = 'https://cintamani.example/changed' WHERE nonce_digest_sha256 = ?",
    ).run(hash('9')),
    /SIWX (?:challenge is immutable|nonce may be consumed exactly once)/u,
  )
  database.prepare(
    `UPDATE siwx_nonces
     SET consumed_at = ?, verified_principal_id = 'wallet-session',
         message_sha256 = ?, signature_sha256 = ?
     WHERE nonce_digest_sha256 = ?`,
  ).run(at, hash('1'), hash('2'), hash('9'))
  assert.throws(
    () => database.prepare(
      `UPDATE siwx_nonces
       SET consumed_at = ?, verified_principal_id = 'wallet-session',
           message_sha256 = ?, signature_sha256 = ?
       WHERE nonce_digest_sha256 = ?`,
    ).run(at, hash('3'), hash('4'), hash('9')),
    /SIWX nonce may be consumed exactly once/u,
  )
  assert.throws(
    () => database.prepare('DELETE FROM siwx_nonces WHERE nonce_digest_sha256 = ?').run(hash('9')),
    /SIWX nonce cannot be deleted/u,
  )
  assert.throws(
    () => database.prepare(
      `INSERT INTO siwx_nonces (
         nonce_digest_sha256, purpose, origin, uri, network, issued_at, expires_at, consumed_at
       ) VALUES (?, 'session', 'https://cintamani.example',
                 'https://other.example/api/auth/siwx', 'base-mainnet', ?, ?, NULL)`,
    ).run(hash('a'), at, later),
    /CHECK constraint failed/u,
  )

  database.prepare(
    `INSERT INTO public_sessions (
       session_token_sha256, csrf_token_sha256, account_id, created_at, expires_at,
       revoked_at, rotated_to_sha256, auth_kind, transport, scope
     ) VALUES (?, NULL, 'wallet-session', ?, ?, NULL, NULL, 'siwx', 'agent-bearer',
               'public-contributor')`,
  ).run(hash('b'), at, later)
  assert.throws(
    () => database.prepare(
      `INSERT INTO public_sessions (
         session_token_sha256, csrf_token_sha256, account_id, created_at, expires_at,
         auth_kind, transport, scope
       ) VALUES (?, NULL, 'wallet-session', ?, ?, 'siwx', 'browser-cookie',
                 'public-contributor')`,
    ).run(hash('c'), at, later),
    /CHECK constraint failed/u,
  )
  assert.throws(
    () => database.prepare(
      `INSERT INTO public_sessions (
         session_token_sha256, csrf_token_sha256, account_id, created_at, expires_at,
         auth_kind, transport, scope
       ) VALUES (?, ?, 'wallet-session', ?, ?, 'siwx', 'agent-bearer',
                 'public-contributor')`,
    ).run(hash('d'), hash('e'), at, later),
    /CHECK constraint failed/u,
  )

  database.prepare(
    `INSERT INTO principal_session_events (
       session_token_sha256, event_sequence, session_event_id, principal_id,
       event_kind, rotated_to_sha256, rationale, source_timestamp, recorded_at
     ) VALUES (?, 1, 'wallet-session-issued', 'wallet-session', 'issued', NULL,
               'SIWX bearer issued', ?, ?)`,
  ).run(hash('b'), at, at)
  assert.throws(
    () => database.prepare(
      `INSERT INTO principal_session_events (
         session_token_sha256, event_sequence, session_event_id, principal_id,
         event_kind, rotated_to_sha256, rationale, source_timestamp, recorded_at
       ) VALUES (?, 3, 'wallet-session-gap', 'wallet-session', 'revoked', NULL,
                 'Invalid gap', ?, ?)`,
    ).run(hash('b'), at, at),
    /principal session events must be contiguous/u,
  )
  database.prepare(
    `INSERT INTO principal_session_events (
       session_token_sha256, event_sequence, session_event_id, principal_id,
       event_kind, rotated_to_sha256, rationale, source_timestamp, recorded_at
     ) VALUES (?, 2, 'wallet-session-revoked', 'wallet-session', 'revoked', NULL,
               'SIWX bearer revoked', ?, ?)`,
  ).run(hash('b'), at, at)
  assert.throws(
    () => database.prepare(
      `INSERT INTO principal_session_events (
         session_token_sha256, event_sequence, session_event_id, principal_id,
         event_kind, rotated_to_sha256, rationale, source_timestamp, recorded_at
       ) VALUES (?, 3, 'wallet-session-after-terminal', 'wallet-session', 'expired', NULL,
                 'Invalid terminal extension', ?, ?)`,
    ).run(hash('b'), at, at),
    /principal session already has a terminal event/u,
  )

  const persistedColumns = database.prepare(
    `SELECT m.name AS table_name, p.name AS column_name
     FROM sqlite_master m JOIN pragma_table_info(m.name) p
     WHERE m.type = 'table'
       AND (p.name LIKE '%raw%' OR p.name IN ('address', 'signature', 'message', 'nonce'))`,
  ).all()
  assert.deepEqual(persistedColumns, [])
  assert.deepEqual(
    { ...database.prepare(
      `SELECT verified_principal_id, length(message_sha256) AS message_length,
              length(signature_sha256) AS signature_length
       FROM siwx_nonces WHERE nonce_digest_sha256 = ?`,
    ).get(hash('9')) },
    { verified_principal_id: 'wallet-session', message_length: 64, signature_length: 64 },
  )
  assertHealthy(database)
  database.close()
})

test('every persisted 0005 statement prefix can replay before the atomic 0006 cutover', () => {
  const expansionStatements = unstable_splitSqlQuery(migration('0005_contributor_principals.sql'))
  const baseline = openThrough('0004_operator_roles.sql')
  applySql(baseline, migration('0005_contributor_principals.sql'))
  const expectedDigest = schemaDigest(baseline)
  baseline.close()

  for (let prefixLength = 0; prefixLength <= expansionStatements.length; prefixLength += 1) {
    const database = openThrough('0004_operator_roles.sql')
    for (const statement of expansionStatements.slice(0, prefixLength)) {
      if (statement.trim()) database.exec(statement)
    }
    applySql(database, migration('0005_contributor_principals.sql'))
    assert.equal(schemaDigest(database), expectedDigest, `0005 replay drift after prefix ${prefixLength}`)
    assert.equal(
      database.prepare("SELECT metadata_value FROM public_schema_metadata WHERE metadata_key = 'schema_version'").get().metadata_value,
      '2',
    )
    applySql(database, migration('0006_principal_fk_cutover.sql'))
    assertHealthy(database)
    database.close()
  }
})

test('a late failure in the D1-style 0006 batch rolls back all shadow cutover state', () => {
  const database = openThrough('0004_operator_roles.sql')
  seedPopulatedV2(database)
  applySql(database, migration('0005_contributor_principals.sql'))
  const beforeRows = snapshotLegacyRows(database)
  const beforeSchema = schemaDigest(database)
  const cutoverStatements = unstable_splitSqlQuery(migration('0006_principal_fk_cutover.sql'))

  assert.throws(
    () => executeBatch(database, [
      ...cutoverStatements.slice(0, -1),
      "INSERT INTO contributor_principals (principal_id, principal_kind, public_pseudonym, pseudonym_key_version, created_at) VALUES ('forced-failure', 'invalid-kind', 'invalid', 1, 'invalid')",
      cutoverStatements.at(-1),
    ]),
    /CHECK constraint failed/u,
  )

  const priorColumns = Object.fromEntries(Object.entries(beforeRows).map(([table, value]) => [table, value.columns]))
  const afterRows = snapshotLegacyRows(database, priorColumns)
  assert.equal(schemaDigest(database), beforeSchema)
  for (const table of preservedTables) {
    assert.equal(afterRows[table].hash, beforeRows[table].hash, `${table} changed after rollback`)
    assert.equal(afterRows[table].count, beforeRows[table].count, `${table} count changed after rollback`)
  }
  assert.deepEqual(
    database.prepare(
      "SELECT name FROM sqlite_master WHERE name GLOB '_v3_*' OR name GLOB '_hold_*' ORDER BY name",
    ).all(),
    [],
  )
  assert.equal(
    database.prepare("SELECT metadata_value FROM public_schema_metadata WHERE metadata_key = 'schema_version'").get().metadata_value,
    '2',
  )
  assert.equal(database.prepare('PRAGMA defer_foreign_keys').get().defer_foreign_keys, 0)
  assertHealthy(database)
  database.close()
})

test('every persisted 0008 prefix replays to schema v4 with linked-author trigger intact', () => {
  const statements = unstable_splitSqlQuery(migration('0008_linked_author_access.sql'))
  const baseline = openThrough('0007_x402_payment_saga.sql')
  applySql(baseline, migration('0008_linked_author_access.sql'))
  const expectedDigest = schemaDigest(baseline)
  baseline.close()
  for (let prefixLength = 0; prefixLength <= statements.length; prefixLength += 1) {
    const database = openThrough('0007_x402_payment_saga.sql')
    for (const statement of statements.slice(0, prefixLength)) if (statement.trim()) database.exec(statement)
    applySql(database, migration('0008_linked_author_access.sql'))
    assert.equal(schemaDigest(database), expectedDigest, `0008 replay drift after prefix ${prefixLength}`)
    assert.equal(database.prepare("SELECT metadata_value FROM public_schema_metadata WHERE metadata_key = 'schema_version'").get().metadata_value, '4')
    const trigger = database.prepare("SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = 'proposal_revisions_require_author'").get().sql
    assert.match(trigger, /current_principal_identity_links/u)
    assertHealthy(database)
    database.close()
  }
})
