import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { resolve } from 'node:path'

function row(value) {
  return value ? { ...value } : null
}

class SQLiteD1Statement {
  constructor(owner, sql, bindings = []) {
    this.owner = owner
    this.sql = sql
    this.bindings = bindings
  }

  bind(...bindings) {
    return new SQLiteD1Statement(this.owner, this.sql, bindings)
  }

  async first(column = undefined) {
    const result = row(this.owner.database.prepare(this.sql).get(...this.bindings))
    return column === undefined ? result : result?.[column] ?? null
  }

  async all() {
    return {
      success: true,
      results: this.owner.database.prepare(this.sql).all(...this.bindings).map(row),
      meta: {},
    }
  }

  async run() {
    return this.runSync()
  }

  runSync() {
    const result = this.owner.database.prepare(this.sql).run(...this.bindings)
    return { success: true, results: [], meta: { changes: result.changes, last_row_id: result.lastInsertRowid } }
  }
}

export class SQLiteD1 {
  constructor() {
    this.database = new DatabaseSync(':memory:')
    this.database.exec('PRAGMA foreign_keys = ON')
  }

  prepare(sql) {
    return new SQLiteD1Statement(this, sql)
  }

  async batch(statements) {
    this.database.exec('BEGIN IMMEDIATE')
    try {
      const results = statements.map((statement) => statement.runSync())
      this.database.exec('COMMIT')
      return results
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }

  migrate(siteRoot) {
    const migrationRoot = resolve(siteRoot, 'migrations')
    for (const name of readdirSync(migrationRoot).filter((file) => file.endsWith('.sql')).sort()) {
      this.database.exec(readFileSync(resolve(migrationRoot, name), 'utf8'))
    }
  }

  close() {
    this.database.close()
  }
}
