# `tool` node

A tool node runs a deterministic JavaScript/TypeScript module. It is the backbone of any OpenExpertise flow that does not need an LLM: file I/O, API calls, data transformation, aggregation, and any side-effects with predictable output.

---

## When to use it

- Parsing or transforming data before an LLM step (e.g. load a diff, flatten a CSV).
- Aggregating results after a `for_each` fan-out (sum totals, merge arrays).
- Any side-effect you want fully under your control: writing a file, calling a REST API, computing a hash.
- Seeding initial state from hard-coded or environment-derived values.
- Any step where you want 100% determinism and unit-testability without LLM involvement.

::: tip No API key required
A graph composed entirely of `tool` nodes runs with no LLM API key. `examples/hello-tool` and `examples/dataset-aggregate` both demonstrate this.
:::

---

## YAML fields

| Field      | Required | Type            | Description                                                                                         |
| ---------- | -------- | --------------- | --------------------------------------------------------------------------------------------------- |
| `id`       | yes      | string          | Unique node identifier within the graph.                                                            |
| `kind`     | yes      | `"tool"`        | Must be the literal string `"tool"`.                                                                |
| `impl`     | yes      | string          | Path to the `.mjs` (or `.js`) module, relative to `experience.yaml`.                                |
| `args`     | no       | object          | Static key-value pairs passed into the module's default export as part of the `args` argument.      |
| `reads`    | no       | string[]        | State fields to make available in `_state`. Declarative — does not restrict what `_state` contains. |
| `writes`   | no       | string[]        | State fields this node is expected to write. Must be declared in `state.schema`.                    |
| `phase`    | no       | string          | Phases group nodes in the TUI and in evolution proposals.                                           |
| `on_error` | no       | `ErrorPolicy`   | `skip` \| `fail_run` \| `retry`. Default is `fail_run`.                                             |
| `for_each` | no       | `ForEachClause` | Fans out: runs the node once per item in a state array.                                             |

---

## The implementation contract

The dispatcher (`ToolDispatcher` from `@openexpertise/node-kinds-tool`) resolves the module with `import()` and calls the `default` export:

```typescript
// Signature the dispatcher calls
type ToolFn = (args: ToolArgs) => Promise<NodeOutput> | NodeOutput

interface ToolArgs {
  // All static `args:` fields from the YAML node are spread at the top level.
  [key: string]: unknown

  // The current state snapshot, keyed by field name.
  _state: Record<string, unknown>

  // The outputs of direct predecessor nodes (from `reads:` + edge routing).
  _edge_inputs: Record<string, unknown>
}

interface NodeOutput {
  // Keys must match declared `writes:` fields and be declared in state.schema.
  state_delta: Record<string, unknown>

  // Optional: value passed to dependent nodes via edge_inputs.
  edge_output?: unknown

  // Optional: token/cost metrics (tool nodes typically omit this).
  metrics?: { tokens_in?: number; tokens_out?: number; cost_usd?: number }
}
```

The dispatcher validates:

1. The module has a `default` export.
2. The export is a function.
3. The function returns an object with at least a `state_delta` key.

If `state_delta` is empty (`{}`), no state is written. If it contains keys not declared in `state.schema`, the `StateStore.write()` call throws.

### Module format

Use ESM `.mjs` files. The loader calls `import()` with a `file://` URL, so `.mjs` is the safest extension. Plain `.js` works if your `package.json` has `"type": "module"`. TypeScript `.ts` files must be pre-compiled to `.mjs` — the dispatcher does not run `tsc` at runtime.

```javascript
// tools/my_tool.mjs  (minimal valid module)
export default async function myTool(args) {
  return { state_delta: { result: 'done' } }
}
```

---

## Full working example

Source: [`examples/hello-tool/`](/examples/hello-tool)

```yaml
# experience.yaml
name: hello-tool
version: 0.1.0

state:
  schema:
    name: { type: string }
    greeting: { type: string }

graph:
  nodes:
    - id: greet
      kind: tool
      impl: ./tools/greet.mjs
      args:
        name: World
      writes: [greeting]
  edges: []
```

```javascript
// tools/greet.mjs
export default async function greet(args) {
  return { state_delta: { greeting: `hello, ${args.name}` } }
}
```

```bash
node packages/cli/dist/bin.js run examples/hello-tool
# finalState: { greeting: "hello, World" }
```

A more realistic example — loading state from a predecessor via `_state`:

Source: [`examples/dataset-aggregate/tools/aggregate.mjs`](/examples/dataset-aggregate)

```javascript
export default async function aggregate(args) {
  const rows = args._state?.rows ?? []
  const total = rows.reduce((acc, r) => acc + Number(r.amount ?? 0), 0)
  return { state_delta: { total } }
}
```

---

## Variations

### With `for_each`

Fan out a tool across every item in a state array. The node runs once per item; `args._item` contains the current element.

```yaml
- id: process_row
  kind: tool
  impl: ./tools/process.mjs
  for_each: { source: $.rows }
  reads: [rows]
  writes: [results]
```

```javascript
// tools/process.mjs
export default async function process(args) {
  const row = args._item // current item from the for_each array
  const idx = args._item_index // 0-based index
  return { state_delta: { results: [{ id: row.id, processed: true }] } }
}
```

Declare `results` with `merge: array_append` in `state.schema` so each iteration's output accumulates.

### With `on_error: skip`

Continue the run even if this node throws. Useful for best-effort enrichment steps.

```yaml
- id: enrich_data
  kind: tool
  impl: ./tools/enrich.mjs
  on_error: { policy: skip }
  writes: [enriched]
```

### With `on_error: retry`

Retry up to 3 times with exponential backoff — useful for flaky external API calls.

```yaml
- id: call_api
  kind: tool
  impl: ./tools/call_api.mjs
  on_error:
    policy: retry
    attempts: 3
    backoff: exponential
    base_ms: 500
  writes: [api_result]
```

### Reads-only (no writes)

A tool can read state without writing — useful for validation or side-effect-only operations like writing a file.

```yaml
- id: write_report
  kind: tool
  impl: ./tools/write_report.mjs
  reads: [findings, risk_score]
  # no writes: key
```

```javascript
export default async function writeReport(args) {
  const findings = args._state.findings ?? []
  // write to disk, send Slack message, etc.
  return { state_delta: {} }
}
```

### With `edge_output`

Pass structured data directly to dependent nodes without writing to the shared state:

```javascript
export default async function fetchData(args) {
  const data = await callApi(args.endpoint)
  return {
    state_delta: {}, // nothing persisted
    edge_output: data, // available to downstream nodes as _edge_inputs.fetch_data
  }
}
```

---

## Gotchas

1. **`.mjs` extension, not `.ts`** — The dispatcher calls `import()` at runtime. TypeScript files must be compiled first. Run `pnpm -r build` or compile the tools directory with `tsc`.

2. **Every write key must be declared in `state.schema`** — If `state_delta` contains an undeclared key, the `StateStore` throws. Add the key to `state.schema` before running.

3. **`_state` is a snapshot, not a live reference** — Mutations to `args._state` have no effect. The only way to write state is via `state_delta`.

4. **`reads:` is declarative, not a filter** — `_state` always contains the full state snapshot. The `reads:` field is metadata for the scheduler and TUI, not an access control list.

5. **Empty `state_delta` is valid** — Return `{ state_delta: {} }` for side-effect-only nodes. The dispatcher accepts it.

---

## See also

- [Guide: Tool stubs in .mjs](/guide/tool-stubs)
- [The 6 node kinds](/concepts/node-kinds)
- [State (SQLite blackboard)](/concepts/state)
- [Edges and control flow](/concepts/control-flow)
- [Examples: hello-tool](/examples/hello-tool)
- [Examples: dataset-aggregate](/examples/dataset-aggregate)
