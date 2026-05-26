---
title: YAML schema reference
---

# YAML schema reference

The complete grammar of `experience.yaml`. Validated by AJV (draft-07) from `packages/schema/src/schemas/experience.schema.json`.

Use `oe validate` to check a file before running it, or call `validateExperienceSpec` from `@openexpertise/schema` in your own code.

---

## Top-level fields

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | `string` (minLength: 1) | ✓ | Machine-readable name of the experience. Displayed in logs, TUI, and event streams. |
| `version` | `string` (pattern: `^\d+\.\d+\.\d+$`) | ✓ | Semantic version string (e.g. `"1.0.0"`). Used in cache keys and evolution diffs. |
| `description` | `string` | — | Human-readable summary. Shown in `oe inspect` output and generated docs. |
| `state` | `object` | ✓ | Declares the blackboard schema. See [State schema](#state-schema). |
| `phases` | `array` | — | Ordered list of named phases for visual grouping. See [Phases](#phases). |
| `graph` | `object` | ✓ | Contains nodes, edges, and optional pipelines/loops. See [Graph schema](#graph-schema). |
| `runtime` | `object` | — | Runtime tuning knobs. See [Runtime](#runtime). |

Minimal valid example:

```yaml
name: hello
version: 0.1.0
state:
  schema: {}
graph:
  nodes:
    - id: greet
      kind: tool
      impl: ./tools/greet.mjs
  edges: []
```

---

## State schema

`state` has one required sub-key (`schema`) and one optional sub-key (`store`).

```yaml
state:
  schema:
    <field-name>:
      type: string          # one of: string, number, boolean, object, array, null
      description: "..."    # optional human note
      merge: last_wins      # one of: last_wins (default), set_once, array_append
  store: custom-store-id    # optional; reserved for future pluggable stores
```

### `state.schema`

Each key under `state.schema` is a field name. The value is a **state field definition**:

| Property | Type / Values | Required | Description |
|---|---|---|---|
| `type` | `string \| number \| boolean \| object \| array \| null` | — | JSON type the field holds. The runtime enforces this on every write. Omit to allow any type. |
| `description` | `string` | — | Free-text note for documentation. Not validated at runtime. |
| `merge` | `last_wins \| set_once \| array_append` | — | Merge strategy applied when a node writes to this field. Defaults to `last_wins`. |

#### Merge strategies

| Value | Behaviour |
|---|---|
| `last_wins` | Each new write replaces the existing value entirely. |
| `set_once` | The field is only written on the first write; subsequent writes to the same field in any run are silently ignored. Useful for IDs generated once. |
| `array_append` | The existing array and the incoming value are concatenated. The field `type` must be `array`. Useful for accumulating results across fan-out nodes. |

```yaml
state:
  schema:
    run_id:
      type: string
      merge: set_once
    results:
      type: array
      merge: array_append
    status:
      type: string
      merge: last_wins
```

### `state.store`

Optional string. Reserved for future pluggable state backends. Has no effect in V1 (the runtime always uses the built-in SQLite store).

---

## Phases

`phases` is an optional array of phase declarations. Phases are purely organizational — they provide labels for the TUI dashboard and `oe inspect` output. They do not affect execution order; that is determined entirely by the edge graph.

```yaml
phases:
  - id: gather
    title: "Data Gathering"
  - id: analyse
    title: "Analysis"
  - id: report
    title: "Report Generation"
```

### Phase fields

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `string` | ✓ | Machine-readable phase identifier. Referenced by nodes via `phase: <id>`. |
| `title` | `string` | — | Human-readable display name. Shown in TUI and inspect output. |

Nodes opt in to a phase by declaring `phase: <id>` on the node. Phases are not validated against the `phases` list — an undeclared phase ID in a node is silently accepted.

---

## Graph schema

`graph` is the main structural element of an experience.

```yaml
graph:
  nodes: [...]       # required, minItems: 1
  edges: [...]       # required (can be empty)
  pipelines: [...]   # optional
  loops: [...]       # optional
```

| Field | Type | Required | Description |
|---|---|---|---|
| `nodes` | `array` | ✓ | Ordered list of node definitions. At least one node is required. |
| `edges` | `array` | ✓ | Directed edges between nodes. Can be empty for single-node experiences. |
| `pipelines` | `array` | — | Named sequential pipelines — syntactic sugar over edges. |
| `loops` | `array` | — | Bounded iteration over a sub-graph. |

---

## Edges

An edge declares a dependency from one node to another. The scheduler will not start `to` until `from` has finished.

```yaml
edges:
  - from: node-a
    to:   node-b
  - from: node-b
    to:   node-c
    when: "$.results.length > 0"
```

### Edge fields

| Field | Type | Required | Description |
|---|---|---|---|
| `from` | `string` | ✓ | `id` of the upstream node. |
| `to` | `string` | ✓ | `id` of the downstream node. |
| `when` | `string` | — | JSONPath / expression evaluated against the current state snapshot. When the expression is falsy, the edge is not traversed and `node-c` is emitted as `node.skipped`. |

The `when` expression is evaluated after `from` finishes. The expression context is the full state snapshot at that point. Use JSONPath syntax (`$.field`) or simple comparisons. See [Edges & control flow](/concepts/control-flow) for the full expression syntax.

---

## Pipelines

A `pipeline` defines a linear sequence of nodes that each process a single item from a collection. It is syntactic sugar: the runtime expands it into a series of `for_each`-capable nodes connected by edges.

```yaml
graph:
  pipelines:
    - id: review-pipeline
      items: "$.pull_requests"   # JSONPath into state
      stages:
        - run-tests
        - post-comment
      phase: review
```

### Pipeline fields

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `string` | ✓ | Unique identifier for this pipeline declaration. |
| `items` | `string` | ✓ | JSONPath expression that resolves to the array to iterate over. |
| `stages` | `string[]` | ✓ | Ordered list of node IDs that form the pipeline stages. At least one stage is required. |
| `phase` | `string` | — | Phase to assign to all stages in this pipeline. |

---

## Loops

A `loop` runs a sub-graph body node repeatedly until a condition is met or a maximum iteration count is reached.

```yaml
graph:
  loops:
    - id: retry-loop
      body: attempt-node
      until: "$.success == true"
      max_iters: 10
      budget: 5000
      phase: execution
```

### Loop fields

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `string` | ✓ | Unique identifier for this loop. |
| `body` | `string` | ✓ | `id` of the node to execute on each iteration. |
| `until` | `string` | — | Expression evaluated after each iteration. Loop exits when the expression is truthy. |
| `max_iters` | `integer` (≥ 1) | — | Hard cap on the number of iterations. Loop exits after this many regardless of `until`. |
| `budget` | `integer` (≥ 0) | — | Maximum cumulative token budget (in tokens) for all iterations. Loop exits when exceeded. |
| `phase` | `string` | — | Phase to assign the loop node. |

::: warning Loop support is partial in V1
`loops` entries are accepted by the schema validator but the scheduler does not yet expand them into actual iteration logic. Attempting to run an experience with a `loops` entry will execute the body node exactly once. Full loop support is planned for a future release.
:::

---

## Common node fields (`nodeBase`)

Every node kind shares these base fields:

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `string` (pattern: `^[a-zA-Z_][a-zA-Z0-9_]*$`) | ✓ | Unique node identifier within the experience. Used in edges, events, and state history. |
| `kind` | `string` | ✓ | Determines which dispatcher handles the node. One of: `tool`, `agent`, `skill`, `dataset`, `experience`, `cli-agent`. |
| `phase` | `string` | — | Phase this node belongs to (for display purposes). |
| `reads` | `string[]` | — | State fields this node reads. The runtime provides only these fields in `NodeInputBundle.state_view`. |
| `writes` | `string[]` | — | State fields this node writes. The runtime validates that `state_delta` only contains declared keys. |
| `on_error` | `object` | — | Error handling policy. See [`on_error`](#on_error). |
| `for_each` | `object` | — | Fan-out execution over an array. See [`for_each`](#for_each). |

---

### `on_error`

Controls what happens when a node's dispatcher throws. Three exclusive variants:

#### `skip`

```yaml
on_error:
  policy: skip
```

The node is marked `skipped`. The run continues. Downstream nodes that depend solely on this node are also skipped.

#### `fail_run`

```yaml
on_error:
  policy: fail_run
```

The run is aborted with `status: 'failed'`. All pending nodes are cancelled. This is the **default** when `on_error` is omitted.

#### `retry`

```yaml
on_error:
  policy: retry
  attempts: 3
  backoff: exponential   # or: linear
  base_ms: 1000
```

The node is retried up to `attempts` times before the error propagates (and triggers the parent `on_error` policy, defaulting to `fail_run`).

| Field | Type | Required | Description |
|---|---|---|---|
| `policy` | `'retry'` | ✓ | |
| `attempts` | `integer` (1–20) | ✓ | Total number of attempts (including the first). |
| `backoff` | `'linear' \| 'exponential'` | — | Back-off strategy between retries. Defaults to no back-off when omitted. |
| `base_ms` | `integer` (≥ 0) | — | Base delay in milliseconds. For `exponential`, delay = `base_ms * 2^(attempt-1)`. For `linear`, delay = `base_ms * attempt`. |

See [Error policies guide](/guide/on-error) for worked examples.

---

### `for_each`

Fans the node out over each element of an array in state, running the node once per element.

```yaml
for_each:
  source: "$.pull_requests"   # JSONPath into state
  concurrency: 4              # optional; how many items to process in parallel
```

| Field | Type | Required | Description |
|---|---|---|---|
| `source` | `string` | ✓ | JSONPath expression that resolves to an array in the current state snapshot. |
| `concurrency` | `integer` (≥ 1) | — | Maximum number of items processed in parallel within this fan-out. Defaults to `1`. |

Each iteration receives its array item merged into `NodeInputBundle.args` as `_item`. State writes from each iteration are applied with the node's declared merge strategy.

---

## Node kinds (the `oneOf` variants)

The `kind` field on a node selects which variant of the `oneOf` discriminated union applies. Each variant extends `nodeBase` and adds kind-specific required and optional fields.

---

### `kind: tool`

Executes a JavaScript/TypeScript module exported from an `.mjs` (or `.js`) file. The default export must be a function.

```yaml
- id: gather-data
  kind: tool
  impl: ./tools/gather.mjs
  args:
    max_items: 50
  reads: []
  writes: [raw_data]
```

| Field | Type | Required | Description |
|---|---|---|---|
| `impl` | `string` | ✓ | Path to the module file, relative to `experienceDir`. Must have a default-exported async function. |
| `args` | `object` | — | Static key-value pairs merged into `NodeInputBundle.args` at runtime. |

The tool function receives `{ ...args, _edge_inputs, _state }` and must return an object with at least `{ state_delta: Record<string, unknown> }`. It may also return `edge_output` and `metrics`.

See [Tool stubs guide](/guide/tool-stubs) for the full contract and stub generation.

---

### `kind: agent`

Sends a prompt to an LLM and writes the text response to state. Requires an `AgentDispatcher` registered with an `LLMClient`.

```yaml
- id: summarise
  kind: agent
  prompt: ./prompts/summarise.md      # path to a prompt file, OR inline text
  model: claude-sonnet-4-6
  reads: [raw_data]
  writes: [summary]
  on_error:
    policy: retry
    attempts: 3
    backoff: exponential
    base_ms: 1000
```

| Field | Type | Required | Description |
|---|---|---|---|
| `prompt` | `string` | ✓ | Path to a `.md` prompt file (relative to `experienceDir`) or an inline prompt string. Template variables `{{field}}` are interpolated from state. |
| `model` | `string` | — | Model identifier. Falls back to `AgentDispatcher`'s `defaultModel`. |
| `schema` | `any` | — | JSON Schema for structured output. When provided, the dispatcher instructs the LLM to return a JSON object conforming to this schema. Reserved; full implementation in a future plan. |
| `args` | `object` | — | Additional static variables for prompt interpolation. |

---

### `kind: skill`

Sends the full state context to an LLM guided by a SKILL.md file. Simpler than `agent` — no prompt template, no tool use. Requires a `SkillDispatcher`.

```yaml
- id: classify
  kind: skill
  impl: ./skills/classifier.md
  model: claude-haiku-4-5
  reads: [raw_data]
  writes: [category]
```

| Field | Type | Required | Description |
|---|---|---|---|
| `impl` | `string` | ✓ | Path to a SKILL.md file relative to `experienceDir`. The file's body (excluding frontmatter) becomes the system prompt. |
| `model` | `string` | — | Model override. Falls back to `SkillDispatcher`'s `defaultModel`. |
| `inputs` | `object` | — | Static inputs merged into the JSON payload sent as the user message. |
| `schema` | `any` | — | Reserved for structured output in a future plan. |

The `SkillDispatcher` sends the entire `{ state_view, edge_inputs, args, ...inputs }` payload as the user message, JSON-serialized. The model's text response is written to the single field declared in `writes`.

::: warning Exactly one `writes` field required
In V1, `skill` nodes must declare exactly one field in `writes`. The entire text response is stored there. Structured-output skills (multiple writes) are planned for a later release.
:::

See [Skills guide](/guide/skills) for SKILL.md format.

---

### `kind: dataset`

Loads a collection of records from an external source and writes them as an array to state. Requires a `DatasetDispatcher`.

```yaml
- id: load-prs
  kind: dataset
  source:
    type: file
    uri: ./data/pull_requests.json
    format: json
  writes: [pull_requests]
```

::: warning Exactly one `writes` field required
`dataset` nodes must declare exactly one field in `writes`. All loaded rows are stored in that field as an array.
:::

The `source` object is a discriminated union on `source.type`:

#### `source.type: file`

```yaml
source:
  type: file
  uri: ./data/items.json    # relative to experienceDir, or absolute
  format: json              # or: jsonl, csv, tsv
```

| Field | Type | Required | Description |
|---|---|---|---|
| `uri` | `string` | ✓ | Path to the data file. Resolved relative to `experienceDir`. |
| `format` | `string` | — | `json` (array), `jsonl` (one object per line), `csv`, `tsv`. Defaults to `json`. |

#### `source.type: sqlite`

```yaml
source:
  type: sqlite
  uri: ./db/app.sqlite      # relative to experienceDir
  query: "SELECT * FROM issues WHERE status = 'open'"
```

| Field | Type | Required | Description |
|---|---|---|---|
| `uri` | `string` | ✓ | Path to the SQLite file. |
| `query` | `string` | ✓ | SQL `SELECT` statement. Rows are returned as an array of plain objects. |

#### `source.type: http`

```yaml
source:
  type: http
  url: https://api.example.com/items
  method: GET
  body: null
```

| Field | Type | Required | Description |
|---|---|---|---|
| `url` | `string` | ✓ | Full URL to request. |
| `method` | `string` | — | HTTP method. Defaults to `GET`. |
| `body` | `any` | — | Request body, JSON-serialized. |

The response body is parsed as JSON. If the response is a JSON array, the rows are that array. If it is an object, it is wrapped in a single-element array.

#### `source.type: mcp-resource`

```yaml
source:
  type: mcp-resource
  # ... fields TBD
```

::: warning Not implemented in V1
`mcp-resource` sources are defined in the schema but not yet implemented. Using this source type will throw at runtime.
:::

---

### `kind: experience`

Runs a nested `experience.yaml` as a sub-experience. Enables composition of reusable sub-workflows. Requires an `ExperienceDispatcher`.

```yaml
- id: sub-review
  kind: experience
  impl: ./sub-experiences/review/experience.yaml
  args:
    pr_number: 42
  state_scope: isolated
```

| Field | Type | Required | Description |
|---|---|---|---|
| `impl` | `string` | ✓ | Path to the child `experience.yaml`, relative to `experienceDir` or absolute. |
| `args` | `object` | — | Arguments forwarded to the child run as `NodeInputBundle.args`. |
| `state_scope` | `'shared' \| 'isolated'` | — | `isolated` (default): the child run gets its own SQLite database under `.openexpertise/sub/`. `shared` is reserved for a future plan. |

The child run's `finalState` and `status` are forwarded as `edge_output` to downstream nodes. The child's state is not merged back into the parent by default.

::: warning `state_scope: shared` is not implemented in V1
Declaring `state_scope: shared` throws at runtime. Use `isolated` (or omit `state_scope`) until this is implemented.
:::

---

### `kind: cli-agent`

Spawns an external agentic CLI tool (Claude Code, OpenAI Codex CLI, or Gemini CLI) as a subprocess, passing a prompt and capturing the output. Requires a `CliAgentDispatcher`.

```yaml
- id: run-codex
  kind: cli-agent
  provider: codex
  prompt: "Fix the failing tests in {{repo_path}}"
  model: o4-mini
  workdir: ./workspace
  output_format: text
  timeout_ms: 120000
  extra_args: ["--quiet"]
  reads: [repo_path]
  writes: [codex_output]
```

| Field | Type | Required | Description |
|---|---|---|---|
| `provider` | `'claude-code' \| 'codex' \| 'gemini'` | ✓ | Which CLI binary to invoke. |
| `prompt` | `string` (minLength: 1) | ✓ | Prompt string. `{{field}}` template variables are interpolated from state, edge inputs, and args before the process is spawned. |
| `model` | `string` | — | Model passed to the CLI via its model flag. Provider-specific. |
| `workdir` | `string` | — | Working directory for the subprocess. Resolved relative to `experienceDir`. Defaults to `experienceDir`. |
| `output_format` | `'text' \| 'json'` | — | How to interpret the subprocess stdout. `text` writes the raw string; `json` parses and maps to `writes` fields. Defaults to `text`. |
| `schema` | `any` | — | JSON Schema used to validate JSON output when `output_format: json`. |
| `timeout_ms` | `integer` (≥ 1000) | — | Maximum wall-clock time for the subprocess in milliseconds. Defaults to 600 000 ms (10 min). |
| `extra_args` | `string[]` | — | Additional CLI flags appended to the command. |

The dispatcher emits `node.activity` events at spawn time and at output-parsing time so the TUI can show live status.

If the subprocess exits with a non-zero exit code, the dispatcher throws with the first 500 characters of stderr included in the error message.

See [cli-agent node guide](/guide/cli-agent-usage) and [tri-cli-orchestration example](/examples/tri-cli-orchestration) for multi-provider orchestration patterns.

---

## Runtime

`runtime` contains optional tuning parameters that apply to the entire run.

```yaml
runtime:
  concurrency: 4
```

| Field | Type | Required | Description |
|---|---|---|---|
| `concurrency` | `integer` (≥ 1) | — | Maximum number of nodes that may execute in parallel. Defaults to `1` (sequential). The CLI `--concurrency` flag overrides this value. |

When `concurrency: 1` (or omitted), the `SequentialScheduler` is used. When `concurrency > 1`, the `ParallelScheduler` is used and nodes whose dependencies are satisfied run concurrently up to the limit.

See [Concurrency guide](/guide/concurrency) for rate-limit retry interaction and best practices.

---

## Complete annotated example

```yaml
name: pr-review-pipeline
version: 1.0.0
description: >
  Loads open PRs, runs tests for each, then posts a
  review comment summarising the results.

state:
  schema:
    pull_requests:
      type: array
      merge: last_wins
    test_results:
      type: array
      merge: array_append
    final_report:
      type: string
      merge: last_wins

phases:
  - id: load
    title: "Load Data"
  - id: test
    title: "Run Tests"
  - id: report
    title: "Post Report"

graph:
  nodes:
    - id: load_prs
      kind: dataset
      phase: load
      source:
        type: http
        url: https://api.github.com/repos/owner/repo/pulls
      writes: [pull_requests]

    - id: run_tests
      kind: tool
      phase: test
      impl: ./tools/run-tests.mjs
      reads: [pull_requests]
      writes: [test_results]
      for_each:
        source: "$.pull_requests"
        concurrency: 3
      on_error:
        policy: retry
        attempts: 2
        backoff: exponential
        base_ms: 2000

    - id: summarise
      kind: agent
      phase: report
      prompt: ./prompts/summarise.md
      model: claude-sonnet-4-6
      reads: [test_results]
      writes: [final_report]

    - id: post_comment
      kind: cli-agent
      phase: report
      provider: claude-code
      prompt: "Post this review comment to GitHub: {{final_report}}"
      timeout_ms: 60000
      reads: [final_report]
      writes: []

  edges:
    - from: load_prs
      to: run_tests
    - from: run_tests
      to: summarise
      when: "$.test_results.length > 0"
    - from: summarise
      to: post_comment

runtime:
  concurrency: 4
```
