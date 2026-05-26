# Tool stubs in .mjs

Implement a `tool` node as a plain ESM module — deterministic code that reads state and returns a state delta.

## When you need this

- Your graph step is deterministic: fetch data, parse a file, call an API, compute a score.
- You want to avoid an LLM call for something that doesn't require judgment.
- You are wiring up a generated stub from `oe ultra` (filling in the `// TODO:` marker).
- You are building a fan-out step that seeds a list field so downstream `agent` nodes can iterate over it.

## The minimal example

`examples/hello-tool/tools/greet.mjs`:

```js
export default async function greet(args) {
  return { state_delta: { greeting: `hello, ${args.name}` } }
}
```

Referenced in `experience.yaml`:

```yaml
- id: greet
  kind: tool
  impl: ./tools/greet.mjs
  args:
    name: World
  writes: [greeting]
```

Run it: `oe run examples/hello-tool` → `finalState: { greeting: "hello, World" }`.

## How it works

The `ToolDispatcher` (`packages/node-kinds-tool/src/index.ts`) loads your module with a dynamic `import()`, calls its `default` export, and expects an object back. The function receives a single `args` argument that is the assembled input bundle — see the fields below.

**Input bundle fields available in `args`:**

| Field | Type | Source |
|---|---|---|
| `_state` | `Record<string, unknown>` | Frozen snapshot of declared `reads:` fields |
| `_edge_inputs` | `Record<string, unknown>` | Values forwarded from predecessor nodes via `edge_output` |
| `$item` | `unknown` | Current item when inside `for_each` |
| `$index` | `number` | Current index when inside `for_each` |
| Any declared `args:` key | `unknown` | Static args from the YAML node spec |

**Return shape:**

```js
return {
  state_delta: { field_name: value },   // required (may be empty {})
  edge_output: anything,                 // optional — forwarded to successor nodes
  metrics: {                             // optional — shown in TUI and events
    tokens_in: 0,
    tokens_out: 0,
    duration_ms: 42,
  },
}
```

The runtime writes every key in `state_delta` to the SQLite store and emits a `state.write` event per field. If `edge_output` is set it is passed to every direct successor as `bundle._edge_inputs[this_node_id]`.

## Variations

**Read from state and compute:**

```js
export default async function score(args) {
  const findings = args._state.findings ?? []
  const highCount = findings.filter(f => f.severity === 'high').length
  return { state_delta: { risk_score: highCount * 10 } }
}
```

**Fetch from an API:**

```js
import { fetch } from 'node:http'   // or use undici / node-fetch

export default async function fetchPR(args) {
  // TODO: replace with real GitHub API call
  const diff = `--- a/README.md\n+++ b/README.md\n@@ -1 +1 @@\n-old\n+new`
  return { state_delta: { diff } }
}
```

**Pass data forward without touching state** (use `edge_output`):

```js
export default async function parse(args) {
  const rows = JSON.parse(args._state.raw_json)
  return {
    state_delta: {},        // nothing to persist
    edge_output: rows,      // forwarded to downstream nodes
  }
}
```

**Seed a list for a `for_each` fan-out:**

```js
export default async function seedDimensions(_args) {
  return {
    state_delta: {
      dimensions: [
        { key: 'security', focus: 'injection and auth vulnerabilities' },
        { key: 'performance', focus: 'N+1 queries and missing indexes' },
        { key: 'style', focus: 'naming and formatting' },
      ]
    }
  }
}
```

**Emit custom metrics:**

```js
export default async function analyze(args) {
  const start = Date.now()
  // ... work ...
  return {
    state_delta: { result: 'done' },
    metrics: { duration_ms: Date.now() - start },
  }
}
```

## Gotchas

- **Must use ESM (`export default`), not CommonJS (`module.exports`).** The loader uses `import()` — CJS modules that lack a default export will throw at runtime.
- **The return value must be an object with at least `state_delta`.** Returning `null`, `undefined`, or a string throws: `Tool "X" default export must return an object with at least { state_delta }`.
- **`_state` only contains fields declared in `reads:`.** If your tool reads `args._state.foo` but the node doesn't declare `reads: [foo]`, the field is `undefined`. Declare all reads.
- **Imports must use bare `node:` specifiers or npm packages installed in the workspace.** The module is loaded from the experience directory, not the CLI's directory. Relative imports from `../` can break.

## See also

- [Hand-writing experience.yaml](/guide/authoring-yaml) — how the `tool` node spec is declared
- [Prompt files](/guide/prompt-files) — the equivalent for `agent` nodes
- [tool node concept](/concepts/node-tool)
- [hello-tool example](/examples/hello-tool)
