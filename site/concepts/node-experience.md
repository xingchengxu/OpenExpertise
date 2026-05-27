# `experience` node

An experience node runs one OpenExpertise experience as a step inside another. It is the composition primitive: use it to break large workflows into named sub-flows, to reuse an existing experience as a building block, or to run a flow in complete state isolation.

---

## When to use it

- Your top-level graph is getting too large — extract a coherent phase into its own `experience.yaml` and call it as a node.
- You have an existing experience (e.g. `review-branch`) that you want to invoke as a step inside a larger pipeline (e.g. `release-gates`).
- You want full state isolation: the child experience has its own SQLite file, its own event log, and its results are returned via `edge_output` rather than written directly to the parent's state.
- You want to version sub-workflows independently and compose them without modifying the parent.

::: info One level of nesting in V1
Recursive nesting (an experience node inside an experience node inside another experience node) is not explicitly blocked, but multi-level nesting has not been smoke-tested. Two levels works; deeper nesting is unsupported in V1.
:::

---

## YAML fields

| Field         | Required | Type            | Description                                                                                                        |
| ------------- | -------- | --------------- | ------------------------------------------------------------------------------------------------------------------ |
| `id`          | yes      | string          | Unique node identifier.                                                                                            |
| `kind`        | yes      | `"experience"`  | Must be the literal string `"experience"`.                                                                         |
| `impl`        | yes      | string          | Path to the child `experience.yaml` file, relative to the parent's `experience.yaml`.                              |
| `args`        | no       | object          | Static arguments passed to the child experience. Also receives `_parent_run_id` and `_parent_state` automatically. |
| `state_scope` | no       | `"isolated"`    | V1 only supports `isolated` (the default). `shared` is reserved and will throw.                                    |
| `reads`       | no       | string[]        | Parent state fields to read (for documentation and TUI).                                                           |
| `writes`      | no       | string[]        | Not typically used — child results flow via `edge_output`, not `state_delta`.                                      |
| `phase`       | no       | string          | Phase grouping in the parent graph.                                                                                |
| `on_error`    | no       | `ErrorPolicy`   | `skip` \| `fail_run` \| `retry`.                                                                                   |
| `for_each`    | no       | `ForEachClause` | Run the sub-experience once per item in a parent state array.                                                      |

---

## The `state_scope` model

### `isolated` (V1, default)

Each invocation of an `experience` node creates a brand-new SQLite file at:

```
<parent-experience-dir>/.openexpertise/sub/<node-id>-<uuid>.sqlite
```

The child experience runs completely independently. Its state is private. When the child finishes, its `finalState` and `runId` are returned to the parent via `edge_output`:

```typescript
return {
  state_delta: {}, // nothing written to parent state directly
  edge_output: {
    runId: childResult.runId,
    status: childResult.status, // 'success' | 'failed' | 'partial'
    finalState: childResult.finalState,
  },
}
```

A downstream `tool` node can then read `_edge_inputs.<node-id>` to extract fields from `finalState` and write them to the parent's state.

### `shared` (not implemented in V1)

Setting `state_scope: shared` throws immediately:

```
Experience "<id>" requests state_scope=shared, which is not implemented in V1
```

Shared state (child writes directly into the parent's SQLite) is planned for V2.

---

## The implementation contract

`ExperienceDispatcher` from `@openexpertise/node-kinds-experience` accepts `runExperience` as a constructor injection to avoid a circular dependency with `@openexpertise/core`:

```typescript
export interface ExperienceDispatcherOpts {
  runExperience: (opts: {
    spec: ExperienceSpec
    experienceDir: string
    dispatchers: DispatcherRegistry
    args?: Record<string, unknown>
    dbPath?: string
    runId?: string
  }) => Promise<{
    runId: string
    status: 'success' | 'failed' | 'partial'
    finalState: Record<string, unknown>
  }>
}
```

During `resolve`, the dispatcher reads and parses the child `experience.yaml`. During `run`, it:

1. Creates a sub-directory `.openexpertise/sub/` in the parent experience directory.
2. Generates a UUID for the child run.
3. Creates a dedicated SQLite file for the child state.
4. Calls `runExperience` with the child spec, the child's experience directory, the same `DispatcherRegistry` as the parent, and merged args.
5. Returns the child result as `edge_output`.

The child's event log is written to the child experience's `.openexpertise/runs/` directory.

---

## Full working example

Calling `review-branch` as a sub-experience inside a `release-gates` flow:

```yaml
# release-gates/experience.yaml
name: release-gates
version: 0.1.0

state:
  schema:
    pr_diff: { type: string }
    review_run_id: { type: string }
    review_status: { type: string }
    risk_score: { type: number }
    gate_decision: { type: string }

graph:
  nodes:
    - id: run_review
      kind: experience
      impl: ../review-branch/experience.yaml
      reads: [pr_diff]
      phase: review

    - id: extract_result
      kind: tool
      impl: ./tools/extract_review_result.mjs
      phase: gate

    - id: decide_gate
      kind: agent
      prompt: ./prompts/gate_decision.md
      reads: [risk_score]
      writes: [gate_decision]
      phase: gate

  edges:
    - { from: run_review, to: extract_result }
    - { from: extract_result, to: decide_gate }
```

```javascript
// tools/extract_review_result.mjs
export default async function extractReviewResult(args) {
  // The child experience's result comes through _edge_inputs.run_review
  const childResult = args._edge_inputs?.run_review
  return {
    state_delta: {
      review_run_id: childResult?.runId ?? null,
      review_status: childResult?.status ?? 'unknown',
      risk_score: childResult?.finalState?.risk_score ?? 0,
    },
  }
}
```

---

## Variations

### Fan-out: run a sub-experience per item

```yaml
- id: per_service_check
  kind: experience
  impl: ./checks/service-health.yaml
  for_each: { source: $.services }
  reads: [services]
```

Each iteration creates its own isolated SQLite file. Results accumulate via `merge: array_append` on the parent state if you declare it that way on the `writes` field.

### Passing parent context to the child

Use `args:` to inject parent state into the child as run-level arguments:

```yaml
- id: run_triage
  kind: experience
  impl: ../issue-triage/experience.yaml
  args:
    pr_id: '{{pr_id}}'
  reads: [pr_id]
```

::: warning `args:` values are static YAML
In V1, `args:` values in an `experience` node are not interpolated at runtime. To pass dynamic parent state, use a `tool` node before the `experience` node to write the values to parent state fields, then the child will inherit them via `_parent_state`.
:::

### With `on_error: skip`

```yaml
- id: optional_deep_scan
  kind: experience
  impl: ./deep-scan/experience.yaml
  on_error: { policy: skip }
```

---

## Gotchas

1. **Child results land in `edge_output`, not `state_delta`** — The experience node writes nothing to the parent's state directly. You must add a downstream `tool` node to extract fields from `_edge_inputs.<experience-node-id>.finalState` and write them to parent state.

2. **`state_scope: shared` throws** — Do not set it. It is reserved for V2.

3. **Child event log is separate** — The child run's events go to the child experience directory's `.openexpertise/runs/`. They are not interleaved with the parent's event log. Use `oe inspect <child-run-id> --experience <child-dir>` to read them.

4. **`impl` path is relative to the parent `experience.yaml`** — Not the CWD. Use `../sibling/experience.yaml` for sibling directories.

5. **The child uses the parent's `DispatcherRegistry`** — The same set of dispatchers is shared. This is usually correct, but means you cannot configure per-child dispatcher options (e.g. a different LLM client for the child) in V1.

---

## See also

- [The 6 node kinds](/concepts/node-kinds)
- [Concepts: State (SQLite blackboard)](/concepts/state)
- [Concepts: Edges and control flow](/concepts/control-flow)
- [`tool` node](/concepts/node-tool) — use a tool node to extract child results into parent state
- [Examples: release-gates](/examples/release-gates)
