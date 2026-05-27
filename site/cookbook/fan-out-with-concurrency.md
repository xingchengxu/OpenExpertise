---
title: Fan-out with concurrency
description: Use for_each over an array to run N parallel LLM calls with a bounded concurrency limit.
---

# Fan-out with concurrency

## Problem

You have an array of items — dimensions, repos, tickets, rows — and you want each one processed by an independent LLM call. Running them one-at-a-time is too slow; running all of them at once can exhaust rate limits. You need bounded parallelism.

## Solution

```yaml
state:
  schema:
    dimensions:
      type: array
      items: { type: object }
      merge: set_once # written once by the seed node
    findings:
      type: array
      items: { type: object }
      merge: array_append # each parallel iteration appends its result

graph:
  nodes:
    - id: list_dimensions
      kind: tool
      impl: ./tools/list_dimensions.mjs
      writes: [dimensions]

    - id: investigate
      kind: agent
      prompt: ./prompts/investigate.md
      reads: [incident]
      for_each:
        source: $.dimensions # JSONPath into state — must resolve to an array
        concurrency: 4 # at most 4 LLM calls in flight at once
      schema:
        type: object
        properties:
          findings:
            type: array
            items:
              type: object
              properties:
                severity: { type: number, minimum: 0, maximum: 1 }
                detail: { type: string }
              required: [severity, detail]
        required: [findings]
        additionalProperties: false
      writes: [findings]

    - id: aggregate
      kind: tool
      impl: ./tools/aggregate.mjs
      reads: [findings]
      writes: [summary]

  edges:
    - { from: list_dimensions, to: investigate }
    - { from: investigate, to: aggregate }
```

## Walkthrough

`list_dimensions` produces an array and writes it into state with `merge: set_once` — the value is written once and never overwritten by later nodes. This is a safeguard: if `investigate` ever tried to write `dimensions` it would be rejected.

<div v-pre>

`for_each.source: $.dimensions` tells the runtime to take that array and spawn one instance of `investigate` per element. Inside the prompt you can reference `{{$item.key}}` for the current element and `{{$index}}` for its zero-based position. Each instance receives a _copy_ of the state snapshot at dispatch time — no shared mutable state between iterations.

</div>

`concurrency: 4` means at most four `investigate` nodes run simultaneously. The default is 1 (sequential). Setting it to the array length runs all at once — fine for small arrays, risky for large ones under API rate limits. The runtime's built-in 429 retry with exponential backoff handles transient throttling automatically regardless of this setting.

Because `findings` uses `merge: array_append`, every iteration appends its own `findings` array to the global list. The `aggregate` tool node downstream then sees the full flat list.

## Variations

- **Skip empty arrays:** Add `when: 'length($.dimensions) > 0'` on the edge from `list_dimensions` to `investigate` to skip the fan-out entirely when there is nothing to process.
- **Per-item conditional:** Within the prompt you can gate work via `when:` expressions on edges downstream of `investigate`; the scheduler handles the partial-skip correctly.
- **Nested fan-out:** A `for_each` node can itself spawn a sub-experience (via `kind: experience`) that contains another `for_each`. State scopes keep the iterations isolated.

## See also

- [Concepts: Edges & control flow](/concepts/control-flow)
- [Concepts: State](/concepts/state)
- [Guide: Concurrency + 429 retry](/guide/concurrency)
- [Example: oncall-runbook](/examples/oncall-runbook)
