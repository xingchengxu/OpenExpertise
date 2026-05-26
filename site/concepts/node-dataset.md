# `dataset` node

A dataset node loads data from an external source and writes it as an array into state. It is the standard way to seed a flow with rows from a file, a SQLite database, an HTTP endpoint, or an MCP resource.

---

## When to use it

- Loading a CSV, JSON, or JSONL file before a processing or aggregation step.
- Querying a SQLite database to feed rows into an LLM fan-out.
- Fetching a JSON API response that returns a top-level array.
- Any time you want to load tabular or list data into state without writing custom tool code.

::: tip Pair with `for_each`
The most common pattern is `dataset → agent/tool with for_each`. The dataset node populates a state array, then a downstream node fans out over it.
:::

---

## YAML fields

| Field      | Required | Type            | Description                                                           |
| ---------- | -------- | --------------- | --------------------------------------------------------------------- |
| `id`       | yes      | string          | Unique node identifier.                                               |
| `kind`     | yes      | `"dataset"`     | Must be the literal string `"dataset"`.                               |
| `source`   | yes      | `DatasetSource` | Describes where and how to load the data. See source variants below.  |
| `reads`    | no       | string[]        | Declarative — documents dependencies.                                 |
| `writes`   | no       | string[]        | Must be exactly one field. The loaded array is written to this field. |
| `phase`    | no       | string          | Phase grouping.                                                       |
| `on_error` | no       | `ErrorPolicy`   | `skip` \| `fail_run` \| `retry`.                                      |
| `for_each` | no       | `ForEachClause` | Unusual for dataset nodes but valid.                                  |

---

## The 4 source variants

### `type: file`

Loads a file from disk. Supported formats: `json`, `jsonl`, `csv`. Parquet is reserved for V2.

```yaml
source:
  type: file
  uri: ./data/sample.csv # relative to experience.yaml
  format: csv # optional: inferred from extension if omitted
```

Format inference rules:

| Extension             | Inferred format                    |
| --------------------- | ---------------------------------- |
| `.json`               | `json` (must be a top-level array) |
| `.jsonl` or `.ndjson` | `jsonl` (one JSON value per line)  |
| `.csv`                | `csv` (first row = column headers) |

If the extension is ambiguous, set `format:` explicitly. Parquet files will throw until V2.

```typescript
// Loader (packages/node-kinds-dataset/src/sources/file.ts)
case 'csv':
  return parseCsv(source, { columns: true, skip_empty_lines: true })
case 'jsonl':
  return source.split('\n').filter(Boolean).map(line => JSON.parse(line))
```

### `type: sqlite`

Executes a read-only SQL query against a SQLite database and returns all rows.

```yaml
source:
  type: sqlite
  uri: ./data/metrics.db # relative to experience.yaml
  query: "SELECT * FROM events WHERE ts > '2026-01-01' ORDER BY ts DESC LIMIT 100"
```

The database is opened in read-only mode (`{ readonly: true }`). The query is run via `better-sqlite3`'s `.prepare().all()`. The result is an array of plain objects, one per row.

### `type: http`

Fetches a URL and parses the response as a JSON array. Uses the Node.js native `fetch`.

```yaml
source:
  type: http
  url: https://api.example.com/issues
  method: GET # optional, default GET
```

For POST requests with a body:

```yaml
source:
  type: http
  url: https://api.example.com/search
  method: POST
  body:
    query: 'status:open label:bug'
    limit: 50
```

The response body must be a top-level JSON array. If the API wraps results in an object (e.g. `{ "items": [...] }`), use a `tool` node instead — `loadHttpSource` is not a general-purpose HTTP client.

### `type: mcp-resource`

::: warning Not implemented in V1
MCP resource sources are planned but not yet implemented. The dispatcher throws immediately with `mcp-resource dataset source is not implemented in V1`. Use a `tool` node with an MCP client SDK for now.
:::

```yaml
# reserved for V2
source:
  type: mcp-resource
  server: my-mcp-server
  uri: resource://my-resource
```

---

## The implementation contract

`DatasetDispatcher` from `@openexpertise/node-kinds-dataset` is the simplest dispatcher. The `resolve` step is a no-op (no files to pre-load). The `run` step:

1. Validates that exactly one `writes:` field is declared.
2. Dispatches to the appropriate source loader based on `source.type`.
3. Returns `{ state_delta: { [writeField]: rows } }`.

```typescript
// From packages/node-kinds-dataset/src/dataset-dispatcher.ts
const writeField = writes[0]
let rows: unknown[]
switch (src.type) {
  case 'file':
    rows = loadFileSource({ uri, format, experienceDir })
    break
  case 'sqlite':
    rows = loadSqliteSource({ uri, query, experienceDir })
    break
  case 'http':
    rows = await loadHttpSource({ url, method, body })
    break
  case 'mcp-resource':
    throw new Error('not implemented in V1')
}
return { state_delta: { [writeField]: rows } }
```

---

## Full working example

Source: [`examples/dataset-aggregate/`](/examples/dataset-aggregate)

```yaml
# experience.yaml
name: dataset-aggregate
version: 0.1.0

state:
  schema:
    rows: { type: array, items: { type: object } }
    total: { type: number }

graph:
  nodes:
    - id: load_rows
      kind: dataset
      source:
        type: file
        uri: ./data/sample.csv
        format: csv
      writes: [rows]

    - id: aggregate
      kind: tool
      impl: ./tools/aggregate.mjs
      reads: [rows]
      writes: [total]

  edges:
    - { from: load_rows, to: aggregate }
```

```javascript
// tools/aggregate.mjs
export default async function aggregate(args) {
  const rows = args._state?.rows ?? []
  const total = rows.reduce((acc, r) => acc + Number(r.amount ?? 0), 0)
  return { state_delta: { total } }
}
```

```bash
node packages/cli/dist/bin.js run examples/dataset-aggregate
# finalState: { rows: [...], total: 123.45 }
```

---

## Variations

### SQLite query as input to a fan-out

```yaml
- id: load_issues
  kind: dataset
  source:
    type: sqlite
    uri: ./data/tracker.db
    query: "SELECT id, title, body FROM issues WHERE status = 'open'"
  writes: [issues]

- id: triage
  kind: agent
  prompt: ./prompts/triage.md
  for_each: { source: $.issues }
  reads: [issues]
  writes: [triage_results]
```

### HTTP API feed

```yaml
- id: fetch_alerts
  kind: dataset
  source:
    type: http
    url: https://monitoring.internal/api/alerts/active
  writes: [alerts]
```

### JSONL log file

```yaml
- id: load_events
  kind: dataset
  source:
    type: file
    uri: ./logs/events.jsonl
    format: jsonl
  writes: [events]
```

### Skip on HTTP errors

```yaml
- id: fetch_optional_data
  kind: dataset
  source:
    type: http
    url: https://optional-service.example.com/data
  on_error: { policy: skip }
  writes: [optional_data]
```

---

## Gotchas

1. **Exactly one `writes:` field** — The dispatcher enforces this at runtime. The entire loaded array goes into that one field.

2. **`type: json` files must be a top-level array** — If the file is `{"items": [...]}`, the loader throws. Unwrap with a downstream `tool` node or restructure the file.

3. **HTTP responses must be top-level arrays** — Same constraint applies. The `loadHttpSource` function calls `Array.isArray(parsed)` and throws if false.

4. **SQLite URIs are read-only** — You cannot use a `dataset` node to write to a database. For writes, use a `tool` node with `better-sqlite3`.

5. **File paths are relative to `experience.yaml`** — Not relative to the current working directory when `oe run` is invoked. This matches the behavior of all other node kinds.

---

## See also

- [The 6 node kinds](/concepts/node-kinds)
- [Concepts: Edges and control flow](/concepts/control-flow)
- [`tool` node](/concepts/node-tool)
- [Examples: dataset-aggregate](/examples/dataset-aggregate)
