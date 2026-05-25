# experience.yaml — API Reference (v0.1.0)

## Top-level shape

```yaml
name: string                  # required, non-empty
description: string           # optional, human-readable
version: string               # required, semver "x.y.z"

state:
  schema:                     # required: map of field-name → schema
    <field>:
      type: ...
      merge: ...
      description: ...
  store: string               # optional, defaults to .openexpertise/state.sqlite

phases:                       # optional, cosmetic grouping for UI/TUI
  - id: collect
  - id: review
  - id: score

graph:
  nodes: [...]                # required, ≥1
  edges: [...]                # required (may be empty)
  pipelines: [...]            # optional
  loops: [...]                # optional
```

## State schema

A field may be either an inline schema or a `$ref` to an external JSON Schema:

```yaml
state:
  schema:
    pr_id:
      type: string
    findings:
      type: array
      items: { type: object }
      merge: array_append
    incident:
      $ref: ./schemas/incident.json
```

Merge strategies:
- `array_append` — concat the incoming array onto the existing one
- `set_once` — only one write allowed; second write throws
- `last_wins` (default) — overwrite

## Node shapes (oneOf, discriminated on `kind`)

### `tool`

```yaml
- id: my_tool
  kind: tool
  phase: collect          # optional
  impl: ./tools/foo.mjs   # required, path relative to experience.yaml
  args: { k: v }          # optional, supports $.field interpolation
  reads: [field1]         # optional
  writes: [field2]        # optional, declared state fields
  on_error: { policy: retry, attempts: 3, backoff: exponential, base_ms: 500 }
  for_each: { source: $.list, concurrency: 1 }  # optional
```

The default export of `impl` is `async (args, ctx) => ({ state_delta, edge_output?, metrics? })`.

### `agent`

```yaml
- id: bug_review
  kind: agent
  prompt: ./prompts/review.md
  model: claude-sonnet-4-5         # optional override; default = inherit
  schema:                          # optional; forces structured output
    type: object
    required: [findings]
    properties:
      findings: { type: array }
  reads: [changed_files]
  writes: [findings]
  on_error: { ... }
  for_each: { source: $.dimensions }
```

Without `schema`, the agent returns text and writes it to `writes[0]` (must be a single field).
With `schema`, the agent's tool call's structured output IS the `state_delta`.

Prompt templates support `{{fieldName}}` placeholders. They're filled from the resolved input bundle (state_view ∪ edge_inputs ∪ args). When `for_each` is set, `{{$item}}` and `{{$index}}` are available.

### `skill`

```yaml
- id: classify
  kind: skill
  impl: ./skills/classify     # directory with SKILL.md
  inputs: { utterance: $.last_message }
  model: claude-sonnet-4-5    # optional
  writes: [label]
```

The SKILL.md body becomes the system prompt; inputs become the user message (JSON-stringified).

### `dataset`

```yaml
- id: load_incidents
  kind: dataset
  source:
    type: sqlite              # or: file | http
    uri: ./datasets/incidents.db
    query: "SELECT * FROM incidents WHERE date > date('now','-180 days')"
  writes: [past_incidents]
```

File sources accept `format: json | jsonl | csv` (inferred from extension if omitted).
HTTP sources accept `method`, `body` (POST), and return JSON arrays.

### `experience` (nested)

```yaml
- id: deep_audit
  kind: experience
  impl: ./sub-experiences/deep-audit/experience.yaml
  args: { pr_id: $.pr_id }
  state_scope: isolated       # V1: only isolated supported
  writes: [audit_result]      # state_delta is {}; edge_output carries child's finalState
```

## Edges

```yaml
edges:
  - { from: a, to: b }
  - { from: c, to: d, when: '$.findings.length > 0 && $.severity == "high"' }
```

The `when:` predicate is evaluated against the full state at scheduling time.
If false, the downstream node is skipped (status: skipped, not failed).
Supported operators: `== != > < >= <= && ||`, plus `length(...)`.

## Pipelines

```yaml
graph:
  pipelines:
    - id: review_then_verify
      items: $.dimensions
      stages: [bug_review, verify_finding]
      phase: review
```

Each item flows through every stage. Stage outputs (`edge_output`) become the next stage's `edge_inputs`.

## Loops

```yaml
graph:
  loops:
    - id: refine_until_clean
      body: refine_node
      until: '$.error_count == 0'
      max_iters: 5
```

Runs `body` repeatedly. Terminates on `until` (true) or `max_iters` (whichever first). At least one of `until` / `max_iters` is required.

## on_error policies

```yaml
on_error: { policy: skip }                                       # default; downstream skipped
on_error: { policy: fail_run }                                   # abort whole run on failure
on_error: { policy: retry, attempts: 3, backoff: exponential, base_ms: 500 }
```
