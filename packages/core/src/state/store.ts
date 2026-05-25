import Database from 'better-sqlite3'
import type { Database as DB } from 'better-sqlite3'
import type { ExperienceSpec, StateFieldSchema } from '@openexpertise/schema'
import { applyMerge } from './merge.js'

export interface StateStoreOpts {
  dbPath: string
  spec: ExperienceSpec
}

export interface WriteMeta {
  runId: string
  nodeId: string
}

export interface HistoryRow {
  id: number
  field: string
  value_old: unknown
  value_new: unknown
  node_id: string
  run_id: string
  ts: string
}

export class StateStore {
  private readonly db: DB
  private readonly spec: ExperienceSpec
  private readonly dbPath: string

  constructor(opts: StateStoreOpts) {
    this.dbPath = opts.dbPath
    this.spec = opts.spec
    this.db = new Database(opts.dbPath)
    this.db.pragma('journal_mode = WAL')
    this.initSchema()
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS state_snapshot (
        field TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        updated_by_node TEXT NOT NULL,
        updated_by_run TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS state_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        field TEXT NOT NULL,
        value_old TEXT,
        value_new TEXT NOT NULL,
        node_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        ts TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_history_field ON state_history(field);
      CREATE INDEX IF NOT EXISTS idx_history_run ON state_history(run_id);
    `)
  }

  get(field: string): unknown {
    const row = this.db
      .prepare('SELECT value FROM state_snapshot WHERE field = ?')
      .get(field) as { value: string } | undefined
    return row ? JSON.parse(row.value) : undefined
  }

  snapshot(fields?: string[]): Record<string, unknown> {
    const list = fields ?? Object.keys(this.spec.state.schema)
    const out: Record<string, unknown> = {}
    for (const f of list) out[f] = this.get(f)
    return out
  }

  history(field: string): HistoryRow[] {
    const rows = this.db
      .prepare(
        'SELECT id, field, value_old, value_new, node_id, run_id, ts FROM state_history WHERE field = ? ORDER BY id ASC',
      )
      .all(field) as Array<{
        id: number
        field: string
        value_old: string | null
        value_new: string
        node_id: string
        run_id: string
        ts: string
      }>
    return rows.map((r) => ({
      id: r.id,
      field: r.field,
      value_old: r.value_old === null ? undefined : JSON.parse(r.value_old),
      value_new: JSON.parse(r.value_new),
      node_id: r.node_id,
      run_id: r.run_id,
      ts: r.ts,
    }))
  }

  write(delta: Record<string, unknown>, meta: WriteMeta): void {
    const schema = this.spec.state.schema
    const now = new Date().toISOString()

    const tx = this.db.transaction(() => {
      for (const [field, incoming] of Object.entries(delta)) {
        const fieldSchema: StateFieldSchema | undefined = schema[field]
        if (!fieldSchema) {
          throw new Error(`Write to undeclared state field "${field}". Declare it in state.schema.`)
        }
        this.assertTypeMatches(field, fieldSchema, incoming)

        const existing = this.get(field)
        const merged = applyMerge({ field, schema: fieldSchema, existing, incoming })

        this.db
          .prepare(
            `INSERT INTO state_snapshot (field, value, updated_at, updated_by_node, updated_by_run)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(field) DO UPDATE SET
               value = excluded.value,
               updated_at = excluded.updated_at,
               updated_by_node = excluded.updated_by_node,
               updated_by_run = excluded.updated_by_run`,
          )
          .run(field, JSON.stringify(merged), now, meta.nodeId, meta.runId)

        this.db
          .prepare(
            `INSERT INTO state_history (field, value_old, value_new, node_id, run_id, ts)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .run(
            field,
            existing === undefined ? null : JSON.stringify(existing),
            JSON.stringify(merged),
            meta.nodeId,
            meta.runId,
            now,
          )
      }
    })

    tx()
  }

  close(): void {
    this.db.close()
  }

  private assertTypeMatches(field: string, schema: StateFieldSchema, value: unknown): void {
    if (value === null || value === undefined) return // null tolerated unless explicitly disallowed
    // $ref-only schemas defer type checking to the referenced schema (not implemented in Plan 1).
    if (!('type' in schema)) return
    const t = schema.type
    if (!t) return
    if (t === 'array' && !Array.isArray(value)) {
      throw new Error(`Field "${field}" expects type array; got ${typeof value}`)
    }
    if (t === 'object' && (typeof value !== 'object' || Array.isArray(value))) {
      throw new Error(`Field "${field}" expects type object; got ${typeof value}`)
    }
    if (t === 'string' && typeof value !== 'string') {
      throw new Error(`Field "${field}" expects type string; got ${typeof value}`)
    }
    if (t === 'number' && typeof value !== 'number') {
      throw new Error(`Field "${field}" expects type number; got ${typeof value}`)
    }
    if (t === 'boolean' && typeof value !== 'boolean') {
      throw new Error(`Field "${field}" expects type boolean; got ${typeof value}`)
    }
  }
}
