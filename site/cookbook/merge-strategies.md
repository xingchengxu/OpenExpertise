---
title: Merge strategies
description: How array_append, last_wins, and set_once control what happens when multiple nodes write the same state field.
---

# Merge strategies

## Problem

In a parallel `for_each` flow, every iteration writes to the same state field. Without explicit rules, concurrent writes would silently overwrite each other. OpenExpertise's merge strategies declare the intended behaviour at schema definition time, so the runtime enforces it automatically.

## Solution

```yaml
state:
  schema:
    # ---- array_append: each write appends to the list ----
    findings:
      type: array
      items: { type: object }
      merge: array_append

    # ---- set_once: first write wins; subsequent writes are rejected ----
    config:
      type: object
      merge: set_once

    # ---- last_wins: most-recent write replaces the previous value ----
    status:
      type: string
      enum: [pending, running, done, failed]
      merge: last_wins # default for scalar types; explicit here for clarity

    # ---- No merge key = last_wins (the default) ----
    summary:
      type: string

graph:
  nodes:
    - id: seed_config
      kind: tool
      impl: ./tools/load_config.mjs
      writes: [config] # set_once: safe to write once

    - id: investigate
      kind: agent
      prompt: ./prompts/investigate.md
      for_each:
        source: $.items
        concurrency: 4
      schema:
        type: object
        properties:
          findings:
            type: array
            items: { type: object }
        required: [findings]
      writes: [findings] # array_append: each iteration appends

    - id: mark_done
      kind: tool
      impl: ./tools/mark_done.mjs
      writes: [status] # last_wins: overwrites whatever was there

  edges:
    - { from: seed_config, to: investigate }
    - { from: investigate, to: mark_done }
```

## Walkthrough

**`array_append`** is the go-to strategy for fan-out flows. Each parallel `investigate` iteration produces its own `findings` array. The runtime holds per-iteration deltas in memory and flushes them to the SQLite state store in order after each iteration completes. The result is a flat list containing every finding from every iteration, in completion order (which is non-deterministic under parallelism — sort in your aggregate tool if order matters).

**`set_once`** is for initialization nodes. `seed_config` runs once at the start; writing `config` a second time would be a runtime error rather than a silent overwrite. This catches accidental double-writes and makes the graph's "who owns this field" contract explicit.

**`last_wins`** (the default for scalars) means each write replaces the previous value. Use it for rolling status fields, counters that are always recomputed in full, or any field where "latest wins" semantics are correct. If two nodes write `last_wins` fields concurrently, the winner is whichever completes last — fine for independent scalar updates, wrong for accumulations (use `array_append` instead).

## Variations

- **Custom merge in a tool node:** If the built-in strategies don't fit, read the current value in your tool via `state.get('field')`, compute the merge manually, and return the merged result in `state_delta`. The merge strategy on the field is still enforced — if the field is `set_once` your tool will see an error if something already wrote it.
- **Resetting a `set_once` field between runs:** `oe reset-state --field config` clears the field so the next run can write it again.

## See also

- [Concepts: State](/concepts/state)
- [Cookbook: fan-out-with-concurrency](./fan-out-with-concurrency)
- [Guide: Concurrency + 429 retry](/guide/concurrency)
