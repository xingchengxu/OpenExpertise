---
title: StateStore
---

# `StateStore`

The SQLite-backed blackboard that persists every state field across nodes and runs. Enforces the type and merge strategy declared in `state.schema`, and records a full audit history of every write.

## Import

```ts
import { StateStore } from '@openexpertise/core'
```

## Signature

```ts
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
  constructor(opts: StateStoreOpts)
  get(field: string): unknown
  snapshot(fields?: string[]): Record<string, unknown>
  history(field: string): HistoryRow[]
  write(delta: Record<string, unknown>, meta: WriteMeta): void
  close(): void
}
```

## Constructor options

| Name     | Type             | Required | Description                                                            |
| -------- | ---------------- | -------- | ---------------------------------------------------------------------- |
| `dbPath` | `string`         | ✓        | Absolute path to the SQLite file. Created if it does not exist.        |
| `spec`   | `ExperienceSpec` | ✓        | Experience spec used to validate field names and types on every write. |

On construction, `StateStore` opens the database with WAL journal mode and ensures the `state_snapshot` and `state_history` tables exist (idempotent `CREATE TABLE IF NOT EXISTS`).

## Methods

### `get(field)`

```ts
get(field: string): unknown
```

Returns the current value of `field` from `state_snapshot`, JSON-deserialized. Returns `undefined` if the field has never been written.

### `snapshot(fields?)`

```ts
snapshot(fields?: string[]): Record<string, unknown>
```

Returns a plain object containing the current value of every field in `fields`. When `fields` is omitted, it defaults to all keys in `spec.state.schema`. Missing fields return `undefined`.

### `history(field)`

```ts
history(field: string): HistoryRow[]
```

Returns the complete write history for `field`, oldest first. Each row includes `value_old`, `value_new`, `node_id`, `run_id`, and `ts` (ISO-8601).

### `write(delta, meta)`

```ts
write(delta: Record<string, unknown>, meta: WriteMeta): void
```

Persists all fields in `delta` in a single SQLite transaction:

1. Validates that each key is declared in `spec.state.schema`. Throws on undeclared keys.
2. Validates that each value matches the declared `type`. Throws on type mismatch.
3. Applies the field's merge strategy (see below).
4. Upserts `state_snapshot`.
5. Appends a row to `state_history`.

| Parameter     | Type                      | Description                                                |
| ------------- | ------------------------- | ---------------------------------------------------------- |
| `delta`       | `Record<string, unknown>` | Fields and their new (or incoming) values.                 |
| `meta.runId`  | `string`                  | Run identifier written to `state_history` for provenance.  |
| `meta.nodeId` | `string`                  | Node identifier written to `state_history` for provenance. |

### `close()`

```ts
close(): void
```

Closes the underlying `better-sqlite3` database handle. Called automatically by `runExperience` in its `finally` block.

## Merge strategies

The merge strategy is declared per-field in YAML (`state.schema.<field>.merge`):

| Strategy              | Behavior                                                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `last_wins` (default) | The incoming value completely replaces the existing value.                                                                                 |
| `set_once`            | The field is written only if it currently has no value (`undefined`). Subsequent writes are silently ignored.                              |
| `array_append`        | The existing array and the incoming array (or single value wrapped in an array) are concatenated. Requires the field `type` to be `array`. |

## Example

```ts
import { StateStore } from '@openexpertise/core'
import { parseExperienceYaml } from '@openexpertise/schema'
import { readFileSync } from 'node:fs'

const spec = parseExperienceYaml(readFileSync('experience.yaml', 'utf8'))
const store = new StateStore({ dbPath: '/tmp/my-run.sqlite', spec })

// Write a value
store.write({ results: ['item-a', 'item-b'] }, { runId: 'run-1', nodeId: 'gather' })

// Read it back
console.log(store.get('results')) // ['item-a', 'item-b']

// Snapshot all fields
console.log(store.snapshot()) // { results: [...], status: undefined, ... }

// Audit trail
const rows = store.history('results')
console.log(rows[0]?.node_id) // 'gather'

store.close()
```

## Behavior notes

**WAL mode.** The database is opened with `PRAGMA journal_mode = WAL`, which allows one writer and multiple concurrent readers. This is safe for the parallel scheduler.

**Transactional writes.** Every call to `write` wraps all field upserts in a single `better-sqlite3` transaction. Either all fields in `delta` commit or none do.

**Type checking.** Type assertions are structural and lenient: `null` and `undefined` pass any type check. `$ref`-only schemas (without a `type` property) skip type checking. This behaviour is documented as a V1 limitation in the source.

**Schema enforcement.** Writing to a field not declared in `state.schema` throws immediately with a descriptive error message. This prevents silent key typos from going undetected.

**History is append-only.** `state_history` rows are never updated or deleted. Use `oe inspect` or `oe state` from the CLI to browse history interactively.

## Database schema

```sql
CREATE TABLE state_snapshot (
  field         TEXT PRIMARY KEY,
  value         TEXT NOT NULL,        -- JSON-serialized
  updated_at    TEXT NOT NULL,        -- ISO-8601
  updated_by_node TEXT NOT NULL,
  updated_by_run  TEXT NOT NULL
);

CREATE TABLE state_history (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  field     TEXT    NOT NULL,
  value_old TEXT,                     -- NULL on first write
  value_new TEXT    NOT NULL,
  node_id   TEXT    NOT NULL,
  run_id    TEXT    NOT NULL,
  ts        TEXT    NOT NULL
);

CREATE INDEX idx_history_field ON state_history(field);
CREATE INDEX idx_history_run   ON state_history(run_id);
```

## Source

[packages/core/src/state/store.ts](https://github.com/xingchengxu/OpenExpertise/blob/main/packages/core/src/state/store.ts)
