# State (SQLite blackboard)

State is the persistent, typed, queryable record of every value every node ever produced. It lives in `.openexpertise/state.sqlite` inside the experience directory.

## The shape of state

`state.schema` in your `experience.yaml` declares every field:

```yaml
state:
  schema:
    pr_id: { type: string }
    dimensions: { type: array, items: { type: object } }
    findings: { type: array, items: { type: object }, merge: array_append }
    verified_findings: { type: array, items: { type: object }, merge: array_append }
    risk_score: { type: number }
  store: ./custom-path.sqlite    # optional; defaults to .openexpertise/state.sqlite
```

Each field has:

- A **type** — `string`, `number`, `boolean`, `object`, `array`, `null`, plus the JSON-Schema niceties (`items`, `properties`, `required`, `description`).
- A **merge strategy** — controls what happens when multiple nodes write to the field.
- Optionally, a **`$ref`** to an external JSON Schema file.

The runtime enforces this schema. A node that tries to write a field not in `state.schema` fails at validation time. A node that writes the wrong type fails at run time.

## Merge strategies

When multiple nodes (or multiple `for_each` iterations of one node) write to the same field, the merge strategy decides:

| Strategy       | Behavior                                                                                  | Use case                                                              |
| -------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `set_once`     | First write wins; subsequent writes throw.                                                | Constants like `pr_id` that should only ever be set once.             |
| `last_wins` (default) | The latest write replaces the prior value.                                         | Scalars that get refined: `risk_score`, `summary`.                    |
| `array_append` | Each write appends to an array. Order is write-arrival order.                             | Fan-out collections: `findings`, `events`, `prioritized_findings`.    |

For a fan-out node:

```yaml
- id: bug_review
  kind: agent
  for_each: { source: $.dimensions }
  writes: [findings]
```

…with `findings: { ..., merge: array_append }`, three dimensions become three writes, and the final array has three entries.

## The blackboard, in practice

After a run, you can query state from the CLI:

```bash
oe state                 # full snapshot
oe state findings        # just the findings array
oe state risk_score      # just one scalar
```

Or from your own Node code:

```ts
import { StateStore } from '@openexpertise/core'

const store = new StateStore({ dbPath, spec })
const findings = store.get('findings')
const snapshot = store.snapshot()
const history = store.history('findings')   // every write, oldest-first
store.close()
```

## Write history

Every write fires a `state.write` event AND adds a row to a write-log table. So you can ask:

- "When did `risk_score` first exceed 0.5?"
- "Which node wrote `findings` for run-id `r-abc123`?"
- "Show me the value of `summary` from yesterday's run."

The `oe evolve` advisor uses this — it diffs `before` and `after` per field across the entire run to figure out what changed.

## State lives WITH the experience

By default, `.openexpertise/state.sqlite` is created inside the experience directory:

```
examples/review-branch/
├── experience.yaml
├── tools/
├── prompts/
├── fixtures/
└── .openexpertise/                ← created on first run
    ├── state.sqlite
    ├── runs/<run-id>.jsonl
    ├── cache/
    └── evolution/
```

So you can clone an experience to another machine and its state goes with it. Or commit `.openexpertise/runs/` to git as part of your audit trail.

To use a different path:

```yaml
state:
  store: /var/lib/openexpertise/my-flow.sqlite
```

Or per-run via the `dbPath` opt to `runExperience()`.

## Resetting state

When you want a clean slate:

```bash
oe reset-state --yes
```

This deletes `.openexpertise/state.sqlite`. Run logs and cache are not touched. (To wipe everything, `rm -rf .openexpertise`.)

## Atomicity and concurrency

`better-sqlite3` is synchronous (no async overhead) and the JavaScript event loop serializes writes. With the parallel scheduler running multiple nodes concurrently, **two nodes that write to the same field WILL see the merge strategy applied**:

- `array_append` is safe — append order is deterministic per write-arrival order.
- `last_wins` is safe — the JS runtime serializes writes, so the latest writer wins.
- `set_once` is safe — the second writer fails loudly.

There's no race on the database level. The merge happens in JS before the SQLite write.

## Patterns: when state isn't enough

If you need state that lives **across experiences** (e.g., a shared findings table queried by multiple flows), point each experience at the same `state.sqlite`:

```yaml
state:
  store: /var/lib/openexpertise/shared.sqlite
```

Combined with `state_scope: shared` on `experience` (nested-experience) nodes, you can build complex multi-experience state-sharing topologies. (`shared` scope is reserved for V1.1+; right now nested experiences are always `isolated`.)

→ Continue with [Edges & control flow](/concepts/control-flow).
