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
const v5Name = '0009_problem_led_frontier.sql'
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
    database.exec('COMMIT')
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

function seedV4(database) {
  database.exec(`
    INSERT INTO contributor_principals VALUES ('principal-v4','github','gh:v4',1,'${at}');
    INSERT INTO proposals (proposal_id,proposal_kind,author_account_id,created_at)
      VALUES ('proposal-v4','ontology-change','principal-v4','${at}');
    INSERT INTO proposal_state_events VALUES
      ('proposal-v4',1,'state-v4',NULL,'submitted',NULL,'principal-v4','Legacy state','${at}','${at}');
    INSERT INTO proposal_revisions VALUES
      ('proposal-v4',1,'revision-v4','principal-v4','Legacy title','Legacy summary',
       'Legacy rationale','Legacy scope','${'a'.repeat(64)}','${at}','${at}');
    INSERT INTO ontology_change_details VALUES
      ('proposal-v4',1,'other-explicit',NULL,'Legacy definition','Legacy effect','Legacy requirements');
    INSERT INTO criticisms (
      criticism_id,proposal_id,target_revision,author_account_id,title,criticism,scope,
      source_timestamp,recorded_at
    ) VALUES ('criticism-v4','proposal-v4',1,'principal-v4','Legacy criticism',
              'Legacy content','Legacy scope','${at}','${at}');
  `)
}

test('0009 preserves populated v4 proposal/history bytes while adding focused problem-led records', () => {
  const database = openThrough('0008_linked_author_access.sql')
  seedV4(database)
  const preservedTables = ['proposals', 'proposal_revisions', 'proposal_state_events', 'ontology_change_details']
  const before = digest(database, preservedTables)
  apply(database, v5Name)
  assert.equal(digest(database, preservedTables), before)
  assert.equal(database.prepare("SELECT metadata_value FROM public_schema_metadata WHERE metadata_key='schema_version'").get().metadata_value, '5')
  assert.deepEqual(database.prepare('PRAGMA foreign_key_check').all(), [])
  assert.equal(database.prepare('SELECT COUNT(*) count FROM public_schema_violations').get().count, 0)
  assert.deepEqual(
    { ...database.prepare("SELECT focus_kind,focus_ref FROM criticisms WHERE criticism_id='criticism-v4'").get() },
    { focus_kind: 'whole-proposal', focus_ref: null },
  )
  assert.throws(() => database.prepare("UPDATE criticisms SET focus_kind='other-explicit'").run(), /immutable public record/u)
  database.close()
})

test('0009 uses D1-complete statements, rolls back late failure, and has no trigger-body CASE', () => {
  const statements = unstable_splitSqlQuery(sql.get(v5Name)).filter((statement) => statement.trim())
  for (const statement of statements.filter((statement) => /^CREATE\s+TRIGGER\b/iu.test(statement))) {
    assert.doesNotMatch(statement.slice(statement.search(/\bBEGIN\b/iu)), /\bCASE\b/iu)
  }
  const database = openThrough('0008_linked_author_access.sql')
  seedV4(database)
  const before = digest(database, ['proposals', 'proposal_revisions', 'criticisms'])
  assert.throws(() => batch(database, [...statements.slice(0, -1), 'SELECT * FROM missing_v5_table']), /missing_v5_table/u)
  assert.equal(digest(database, ['proposals', 'proposal_revisions', 'criticisms']), before)
  assert.equal(database.prepare("SELECT metadata_value FROM public_schema_metadata WHERE metadata_key='schema_version'").get().metadata_value, '4')
  database.close()
})

test('0009 either rolls back or converges after representative persisted splitter prefixes', () => {
  const statements = unstable_splitSqlQuery(sql.get(v5Name)).filter((statement) => statement.trim())
  const boundaryPatterns = [
    /CREATE TABLE IF NOT EXISTS _v5_hold_proposals/iu,
    /DELETE FROM proposal_state_events/iu,
    /CREATE TABLE IF NOT EXISTS _v5_proposals/iu,
    /DROP TABLE IF EXISTS proposals/iu,
    /ALTER TABLE _v5_proposals RENAME TO proposals/iu,
    /CREATE TABLE IF NOT EXISTS explanatory_conjecture_details/iu,
    /INSERT INTO proposal_state_events/iu,
    /DROP TABLE (?:IF EXISTS )?_v5_hold_proposals/iu,
    /CREATE VIEW public_schema_violations/iu,
    /UPDATE public_schema_metadata SET metadata_value='5'/iu,
  ]
  const prefixLengths = new Set([1, Math.floor(statements.length / 2), statements.length - 1])
  for (const pattern of boundaryPatterns) {
    const index = statements.findIndex((statement) => pattern.test(statement))
    assert.notEqual(index, -1, `missing migration boundary ${pattern}`)
    prefixLengths.add(index + 1)
  }

  for (const prefixLength of [...prefixLengths].sort((left, right) => left - right)) {
    const database = openThrough('0008_linked_author_access.sql')
    seedV4(database)
    const before = digest(database, ['proposals', 'proposal_revisions', 'criticisms'])
    try {
      batch(database, statements.slice(0, prefixLength))
    } catch {
      assert.equal(
        digest(database, ['proposals', 'proposal_revisions', 'criticisms']),
        before,
        `rejected prefix ${prefixLength} did not roll back`,
      )
    }
    try {
      apply(database, v5Name)
    } catch (error) {
      throw new Error(`prefix ${prefixLength} did not replay: ${error.message}`, { cause: error })
    }
    assert.equal(
      database.prepare("SELECT metadata_value FROM public_schema_metadata WHERE metadata_key='schema_version'").get().metadata_value,
      '5',
      `prefix ${prefixLength} did not converge`,
    )
    assert.deepEqual(database.prepare('PRAGMA foreign_key_check').all(), [], `prefix ${prefixLength}`)
    assert.equal(database.prepare('SELECT COUNT(*) count FROM public_schema_violations').get().count, 0)
    assert.equal(database.prepare("SELECT COUNT(*) count FROM proposals WHERE proposal_id='proposal-v4'").get().count, 1)
    assert.equal(database.prepare("SELECT COUNT(*) count FROM criticisms WHERE criticism_id='criticism-v4'").get().count, 1)
    database.close()
  }
})
