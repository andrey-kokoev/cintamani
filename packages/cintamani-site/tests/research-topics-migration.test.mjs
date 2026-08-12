import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { unstable_splitSqlQuery } from 'wrangler'

const root = dirname(fileURLToPath(import.meta.url))
const migrationRoot = resolve(root, '../migrations')
const names = readdirSync(migrationRoot).filter((name) => name.endsWith('.sql')).sort()
const sql = new Map(names.map((name) => [name, readFileSync(resolve(migrationRoot, name), 'utf8')]))
const migrationName = '0010_research_topics.sql'
const at = '2026-08-12T00:00:00.000Z'

function batch(database, statements) {
  database.exec('BEGIN IMMEDIATE')
  try {
    for (const [index, statement] of statements.entries()) {
      if (!statement.trim()) continue
      try {
        database.exec(statement)
      } catch (error) {
        throw new Error(`statement ${index + 1} failed: ${error.message}`, { cause: error })
      }
    }
    const violations = database.prepare('PRAGMA foreign_key_check').all()
    if (violations.length > 0) throw new Error(`foreign-key violations: ${JSON.stringify(violations)}`)
    try {
      database.exec('COMMIT')
    } catch (error) {
      const deferred = database.prepare('PRAGMA defer_foreign_keys').get()
      const foreignKeys = database.prepare('PRAGMA foreign_keys').get()
      throw new Error(`commit failed after clean foreign-key check: ${error.message}; defer=${JSON.stringify(deferred)} foreign_keys=${JSON.stringify(foreignKeys)}`, { cause: error })
    }
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}

function apply(database, name) {
  batch(database, unstable_splitSqlQuery(sql.get(name)))
}

function openThrough(lastName) {
  const database = new DatabaseSync(':memory:')
  database.exec('PRAGMA foreign_keys=ON')
  for (const name of names) {
    apply(database, name)
    if (name === lastName) break
  }
  return database
}

function digest(database, tables) {
  const hash = createHash('sha256')
  for (const table of tables) {
    const columns = database.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name)
    hash.update(table)
    hash.update(JSON.stringify(database.prepare(`SELECT * FROM ${table} ORDER BY ${columns.join(',')}`).all()))
  }
  return hash.digest('hex')
}

function seedV5(database) {
  database.exec(`
    INSERT INTO contributor_principals VALUES ('principal-v5','github','gh:v5',1,'${at}');
    INSERT INTO proposals (proposal_id,proposal_kind,author_account_id,created_at)
      VALUES ('conjecture-v5','explanatory-conjecture','principal-v5','${at}');
    INSERT INTO proposal_state_events VALUES
      ('conjecture-v5',1,'state-v5',NULL,'submitted',NULL,'principal-v5','Initial state','${at}','${at}');
    INSERT INTO proposal_revisions VALUES
      ('conjecture-v5',1,'revision-v5','principal-v5','Legacy conjecture','Legacy summary',
       'Legacy rationale','Legacy scope','${'a'.repeat(64)}','${at}','${at}');
    INSERT INTO explanatory_conjecture_details VALUES
      ('conjecture-v5',1,'Legacy problem','Legacy explanation','Legacy mechanism',
       'Legacy explanation scope','Legacy failure condition');
    INSERT INTO explanatory_conjecture_assumptions VALUES
      ('assumption-v5','conjecture-v5',1,1,'Legacy assumption');
    INSERT INTO criticisms (
      criticism_id,proposal_id,target_revision,author_account_id,title,criticism,scope,
      source_timestamp,recorded_at,focus_kind,focus_ref
    ) VALUES ('criticism-v5','conjecture-v5',1,'principal-v5','Legacy criticism',
              'Legacy content','Legacy scope','${at}','${at}','assumption','assumption-v5');
  `)
}

const preservedTables = [
  'proposals',
  'proposal_revisions',
  'proposal_state_events',
  'explanatory_conjecture_details',
  'explanatory_conjecture_assumptions',
  'criticisms',
]

test('0010 preserves populated v5 histories and admits only structurally complete topic proposals', () => {
  const database = openThrough('0009_problem_led_frontier.sql')
  seedV5(database)
  const before = digest(database, preservedTables)
  apply(database, migrationName)
  assert.equal(digest(database, preservedTables), before)
  assert.equal(database.prepare("SELECT metadata_value FROM public_schema_metadata WHERE metadata_key='schema_version'").get().metadata_value, '6')
  assert.deepEqual(database.prepare('PRAGMA foreign_key_check').all(), [])
  assert.equal(database.prepare('SELECT COUNT(*) count FROM public_schema_violations').get().count, 0)

  database.exec(`
    INSERT INTO proposals (proposal_id,proposal_kind,author_account_id,created_at)
      VALUES ('topic-one','research-topic','principal-v5','${at}');
    INSERT INTO proposal_state_events VALUES
      ('topic-one',1,'topic-state-one',NULL,'submitted',NULL,'principal-v5','Initial state','${at}','${at}');
    INSERT INTO proposal_revisions VALUES
      ('topic-one',1,'topic-revision-one','principal-v5','Open topic','Topic summary',
       'Organizational rationale','Bounded scope','${'b'.repeat(64)}','${at}','${at}');
    INSERT INTO research_topic_details VALUES
      ('topic-one',1,'Open problem','Why it remains open','Bounded topic scope',
       'Run the discriminating test','No scientific result or roadmap authority');
    INSERT INTO research_topic_loci VALUES ('topic-locus-one','topic-one',1,1,'theoretical');
    INSERT INTO research_topic_origins VALUES
      ('topic-origin-one','topic-one',1,1,'public-explanatory-conjecture-revision',
       NULL,NULL,'conjecture-v5',1,'derived-from','Exact public conjecture revision');
  `)
  assert.equal(database.prepare('SELECT COUNT(*) count FROM public_schema_violations').get().count, 0)
  assert.throws(
    () => database.prepare("UPDATE research_topic_details SET why_open='changed'").run(),
    /immutable public record/u,
  )
  assert.throws(
    () => database.prepare(`
      INSERT INTO research_topic_origins VALUES
        ('bad-origin','topic-one',1,2,'canonical-problem-version','p-v1','q-v1',NULL,NULL,
         'derived-from','Invalid mixed union')
    `).run(),
    /constraint failed/u,
  )
  database.close()
})

test('0010 is splitter-safe, rolls back late failure, and contains no trigger-body CASE', () => {
  const statements = unstable_splitSqlQuery(sql.get(migrationName)).filter((statement) => statement.trim())
  for (const statement of statements.filter((statement) => /^CREATE\s+TRIGGER\b/iu.test(statement))) {
    assert.doesNotMatch(statement.slice(statement.search(/\bBEGIN\b/iu)), /\bCASE\b/iu)
  }
  const database = openThrough('0009_problem_led_frontier.sql')
  seedV5(database)
  const before = digest(database, preservedTables)
  assert.throws(() => batch(database, [...statements.slice(0, -1), 'SELECT * FROM missing_v6_table']), /missing_v6_table/u)
  assert.equal(digest(database, preservedTables), before)
  assert.equal(database.prepare("SELECT metadata_value FROM public_schema_metadata WHERE metadata_key='schema_version'").get().metadata_value, '5')
  database.close()
})

test('0010 rejected or persisted splitter prefixes replay to one lossless schema-v6 result', () => {
  const statements = unstable_splitSqlQuery(sql.get(migrationName)).filter((statement) => statement.trim())
  const boundaryPatterns = [
    /CREATE TABLE IF NOT EXISTS _v6_hold_proposals/iu,
    /CREATE TABLE IF NOT EXISTS _v6_proposals/iu,
    /DELETE FROM proposal_state_events/iu,
    /ALTER TABLE _v6_proposals RENAME TO proposals/iu,
    /CREATE TABLE IF NOT EXISTS research_topic_details/iu,
    /CREATE VIEW public_schema_violations/iu,
    /UPDATE public_schema_metadata SET metadata_value='6'/iu,
  ]
  const prefixLengths = new Set([1, Math.floor(statements.length / 2), statements.length - 1])
  for (const pattern of boundaryPatterns) {
    const index = statements.findIndex((statement) => pattern.test(statement))
    assert.notEqual(index, -1, `missing migration boundary ${pattern}`)
    prefixLengths.add(index + 1)
  }

  for (const prefixLength of [...prefixLengths].sort((left, right) => left - right)) {
    const database = openThrough('0009_problem_led_frontier.sql')
    seedV5(database)
    const before = digest(database, preservedTables)
    try {
      batch(database, statements.slice(0, prefixLength))
    } catch {
      assert.equal(digest(database, preservedTables), before, `rejected prefix ${prefixLength} did not roll back`)
    }
    apply(database, migrationName)
    assert.equal(digest(database, preservedTables), before, `prefix ${prefixLength} changed preserved history`)
    assert.equal(database.prepare("SELECT metadata_value FROM public_schema_metadata WHERE metadata_key='schema_version'").get().metadata_value, '6')
    assert.deepEqual(database.prepare('PRAGMA foreign_key_check').all(), [], `prefix ${prefixLength}`)
    assert.equal(database.prepare('SELECT COUNT(*) count FROM public_schema_violations').get().count, 0)
    database.close()
  }
})
