# Edges & control flow

The graph's `edges` declare dependencies. The scheduler honors them, plus three control-flow primitives — `when:`, `for_each`, and the (Plan 4-era) `pipelines:` + `loops:` blocks — to express conditional, parallel, and iterative flow without code.

## The simple case: dependency edges

```yaml
graph:
  nodes:
    - { id: fetch_diff, kind: tool, ... }
    - { id: seed_dimensions, kind: tool, ... }
    - { id: bug_review, kind: agent, ... }
  edges:
    - { from: fetch_diff, to: seed_dimensions }
    - { from: seed_dimensions, to: bug_review }
```

A node is **ready** when all its predecessors are `done` or `skipped`. The sequential scheduler runs ready nodes in topological order. The parallel scheduler runs all ready-at-the-same-wave nodes concurrently up to `runtime.concurrency`.

## Edge semantics

- **Edges declare DAG dependencies.** No cycles allowed. Validator-enforced.
- **Edges can carry an `edge_output`.** A tool can `return { state_delta, edge_output }`. The next node receives `_edge_inputs: { <upstream_id>: <edge_output> }`. This is useful when you don't want to commit to state (e.g., transient or per-edge data).
- **Edges can carry a `when:` expression.** See below.

## Conditional edges: `when:`

```yaml
edges:
  - { from: search_similar, to: dedup, when: 'length($.similar_issues) > 0' }
```

The expression is evaluated against current state (post upstream's writes). If false, **the target node is skipped**. The skip cascades through edges from the skipped node, unless those edges have their own (truthy) `when:` clauses.

Expression syntax (a tiny JSONPath-ish DSL):

- `$.field` — a state field.
- `$.field.subfield` — nested object lookup.
- `length($.array)` — array length.
- `!`, `==`, `!=`, `<`, `>`, `<=`, `>=`, `&&`, `||` — JS-ish operators.

Examples:

```yaml
when: '$.is_duplicate == true'
when: 'length($.findings) > 0 && $.risk_score > 0.5'
when: '!$.skipped_by_user'
```

The full grammar is at `packages/core/src/expressions/evaluate.ts`.

::: tip
A `when:` clause that evaluates false skips the **target** node. If you want to keep a downstream node running even when an intermediate is skipped, give the downstream a direct edge from an earlier node. See [issue-triage](/examples/issue-triage) for the exact pattern.
:::

## Fan-out: `for_each`

```yaml
- id: investigate
  kind: agent
  for_each:
    source: $.dimensions # JSONPath into state — must be array
    concurrency: 4 # optional; default 1 = sequential
  reads: [incident]
  writes: [findings]
```

The node runs **once per element** in `$.dimensions`, with the item available in the prompt or tool input as `$item` (and the zero-based position as `$index`). Each iteration sees the same `_state` snapshot at fan-out start.

Writes accumulate per the field's merge strategy. For `findings: { ..., merge: array_append }`, ten iterations × one finding each = ten total findings.

Inside an agent prompt:

```markdown
You are investigating from the **{{$item.key}}** angle.

Focus: {{$item.focus}}
```

`$item` references the current iteration's element; `$index` references its position.

Concurrency:

- `concurrency: 1` (default) — sequential.
- `concurrency: 4` — up to 4 iterations in flight simultaneously. Backed by `runWithLimit` in `packages/core/src/graph/scheduler.ts`.
- Set `runtime.concurrency: N` at the top level to make the **outer** scheduler parallel too (independent nodes across the DAG).

## Pipelines

A `pipeline` groups several nodes into a per-item pass:

```yaml
graph:
  nodes:
    - { id: load, kind: dataset, ... }
    - { id: filter, kind: tool, ... }
    - { id: enrich, kind: agent, ... }
    - { id: persist, kind: tool, ... }
  pipelines:
    - id: row_pipeline
      items: $.rows # JSONPath to the items array
      stages: [filter, enrich, persist]
      phase: process
```

Each row in `$.rows` flows through `filter → enrich → persist` before the next row starts. Stage outputs carry across via `edge_output`/`_edge_inputs`. Useful for ETL-style flows where rows must be processed end-to-end before the next.

(In V1, pipelines run **sequentially** — the parallel scheduler only parallelizes the main pass, not pipelines or loops.)

## Loops

A `loop` repeats one body node until a condition or budget:

```yaml
graph:
  nodes:
    - { id: refine, kind: agent, ... }
  loops:
    - id: refine_loop
      body: refine
      until: '$.refined_count >= 3' # boolean expression
      max_iters: 10 # safety cap
      phase: refine
```

The body runs, the condition is checked, repeats. Useful for "refine until good enough" patterns.

## Skip cascading

When a node is skipped (because of `when: false` on an incoming edge, or because all its predecessors were skipped), its successors are typically skipped too. This is the conservative default — you usually want the cascade.

To **break the cascade** — keep a downstream node running even when an intermediate is skipped — give the downstream a direct edge from a still-live ancestor:

```yaml
graph:
  nodes:
    - { id: classify, ... }
    - { id: search_similar, ... }
    - { id: dedup, ... } # conditional on similar_issues > 0
    - { id: assign_labels, ... } # we still want this even when dedup is skipped
  edges:
    - { from: classify, to: search_similar }
    - { from: search_similar, to: dedup, when: 'length($.similar_issues) > 0' }
    - { from: classify, to: assign_labels } # ← direct edge, bypasses dedup
```

See [issue-triage](/examples/issue-triage) for the exact pattern.

## What edges don't do

- **No data transport.** Edges express dependency, not value flow. To pass a value from A to B, write it to state in A and read it in B. (Or use `edge_output`/`_edge_inputs` if you want it transient.)
- **No automatic retry.** Retries are per-node via `on_error: retry`. An edge doesn't retry on its own.
- **No fan-in semantics.** A node with N predecessors waits for all of them. There's no "any-of" — model that with `when:` clauses if you need it.

## Putting it together

A common pattern: `tool → fan-out agent → tool → conditional agent → tool`:

```yaml
graph:
  nodes:
    - id: load
      kind: tool
      impl: ./tools/load.mjs
      writes: [items]
    - id: process
      kind: agent
      prompt: ./prompts/process.md
      reads: [items]
      schema: { ... }
      for_each: { source: $.items, concurrency: 4 }
      writes: [processed]
    - id: aggregate
      kind: tool
      impl: ./tools/aggregate.mjs
      reads: [processed]
      writes: [summary]
    - id: refine
      kind: agent
      prompt: ./prompts/refine.md
      reads: [summary]
      schema: { ... }
      writes: [refined_summary]
    - id: persist
      kind: tool
      impl: ./tools/persist.mjs
      reads: [refined_summary]
  edges:
    - { from: load, to: process }
    - { from: process, to: aggregate }
    - { from: aggregate, to: refine, when: 'length($.summary.flags) > 0' }
    - { from: aggregate, to: persist } # persist regardless
    - { from: refine, to: persist } # if refine ran, persist after it
```

See [oncall-runbook](/examples/oncall-runbook) for a real working version.

→ Continue with [Events & event log](/concepts/events).
