# Hand-writing experience.yaml

Write a complete `experience.yaml` from scratch — understanding every section before running a single line.

## When you need this

- You want full control over the graph topology, state schema, and node configuration.
- You are adapting an existing SOP document into an OpenExpertise experience.
- You need a node combination (e.g., `dataset` + `for_each` + conditional `when:` edges) that `oe ultra` didn't generate correctly.
- You are reviewing or editing a generated YAML to understand what each field does.

## The minimal example

The absolute minimum is four top-level keys: `name`, `version`, `state`, and `graph`. This is `examples/agent-echo/experience.yaml`:

```yaml
name: agent-echo
description: Smallest LLM-backed experience — one agent node echoes a greeting.
version: 0.1.0

state:
  schema:
    name:
      type: string
      description: Subject to greet; passed via --args
    greeting:
      type: string
      description: Agent's response

graph:
  nodes:
    - id: greet
      kind: agent
      prompt: ./prompts/echo.md
      args:
        name: World
      writes: [greeting]
  edges: []
```

Run it:

```bash
oe run examples/agent-echo
```

## How it works

**State schema** is the SQLite blackboard — every field any node reads or writes must appear here. The `type` field accepts `string`, `number`, `boolean`, `object`, `array`, or `null`. Add `merge: array_append` when multiple nodes (or `for_each` iterations) write the same field and you want all values accumulated; `set_once` refuses a second write; `last_wins` is the default.

**Graph** contains `nodes` (an array of node specs) and `edges` (an array of `{ from, to }` pairs). Nodes are sorted topologically at runtime — cycles are rejected at `oe validate` time. Edges with a `when:` key are conditional: the downstream node is skipped if the expression evaluates falsy.

**Node fields** common to every kind:

| Field | Required | Description |
|---|---|---|
| `id` | yes | Unique identifier; `[a-zA-Z_][a-zA-Z0-9_]*` |
| `kind` | yes | `tool \| agent \| skill \| dataset \| experience \| cli-agent` |
| `reads` | no | State fields the node may read (visible in `bundle._state`) |
| `writes` | no | State fields the node may write |
| `phase` | no | Groups nodes visually in the TUI |
| `on_error` | no | `{ policy: skip }` (default), `fail_run`, or `retry` |
| `for_each` | no | `{ source: '$.list_field', concurrency?: N }` |

## Variations

**Add phases** to group nodes visually:

```yaml
phases:
  - id: collect
  - id: analyze
  - id: report

graph:
  nodes:
    - id: fetch_data
      kind: tool
      impl: ./tools/fetch.mjs
      phase: collect
      writes: [raw_data]
    - id: analyze_data
      kind: agent
      prompt: ./prompts/analyze.md
      phase: analyze
      reads: [raw_data]
      writes: [findings]
```

**Fan out over a list** — runs the node once per item in `$.dimensions`:

```yaml
- id: review
  kind: agent
  prompt: ./prompts/review.md
  for_each:
    source: $.dimensions
    concurrency: 3
  reads: [diff, dimensions]
  writes: [findings]
```

**Conditional edge** — skip the report node if there are no findings:

```yaml
edges:
  - from: analyze
    to: report
    when: 'length($.findings) > 0'
```

**Custom state store path:**

```yaml
state:
  schema:
    result: { type: string }
  store: ./.openexpertise/my-state.sqlite
```

**Set global concurrency** — run up to 4 nodes in parallel (those with no mutual dependency):

```yaml
runtime:
  concurrency: 4
```

## Gotchas

- **`reads` and `writes` are not enforced by the schema validator** — they are declarations for the runtime's state-view assembly. Forgetting `reads: [foo]` means `bundle._state.foo` is `undefined` even if `foo` exists in the database.
- **`id` must match `^[a-zA-Z_][a-zA-Z0-9_]*$`** — hyphens are invalid. Use `fetch_data`, not `fetch-data`.
- **`version` must be semver** (`0.1.0`, not `1` or `v0.1.0`).
- **`edges: []` is required** when there are no edges — the key cannot be omitted.

## See also

- [Tool stubs in .mjs](/guide/tool-stubs) — implement a `tool` node
- [Prompt files](/guide/prompt-files) — write `agent` node prompts
- [The 6 node kinds](/concepts/node-kinds)
- [State (SQLite blackboard)](/concepts/state)
- [Edges & control flow](/concepts/control-flow)
- [YAML schema reference](/reference/schema)
