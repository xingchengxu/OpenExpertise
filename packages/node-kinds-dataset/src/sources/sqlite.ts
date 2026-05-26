import Database from 'better-sqlite3'
import { resolve, isAbsolute } from 'node:path'
import { existsSync } from 'node:fs'

export interface SqliteSourceOpts {
  uri: string
  query: string
  experienceDir: string
}

export function loadSqliteSource(opts: SqliteSourceOpts): unknown[] {
  const abs = isAbsolute(opts.uri) ? opts.uri : resolve(opts.experienceDir, opts.uri)
  if (!existsSync(abs)) {
    throw new Error(`Dataset sqlite file not found: ${abs} (declared as "${opts.uri}")`)
  }
  const db = new Database(abs, { readonly: true })
  try {
    const rows = db.prepare(opts.query).all() as unknown[]
    return rows
  } finally {
    db.close()
  }
}
