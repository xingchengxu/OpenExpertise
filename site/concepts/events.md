# Events & event log

Every meaningful runtime moment in an OpenExpertise run fires an **event**. Events are:

- **Emitted** via `EventBus.emit()` from the scheduler, dispatchers, and StateStore.
- **Subscribed** by any number of listeners — `pino` for stdout logging, `JsonlEventSink` for the durable log, the TUI Dashboard for live render.
- **Stored** as one JSON object per line in `.openexpertise/runs/<run-id>.jsonl`.

## The event types

```ts
type RunEvent =
  | { type: 'run.started'; run_id; ts; args? }
  | { type: 'run.finished'; run_id; ts; status: 'success' | 'failed' | 'partial' }
  | { type: 'node.ready'; run_id; node_id; ts; phase? }
  | { type: 'node.started'; run_id; node_id; ts; phase? }
  | { type: 'node.finished'; run_id; node_id; ts; phase?; metrics? }
  | { type: 'node.failed'; run_id; node_id; ts; phase?; error: string }
  | { type: 'node.skipped'; run_id; node_id; ts; phase?; reason: string }
  | { type: 'state.write'; run_id; node_id; field; ts }
  | { type: 'node.tokens'; run_id; node_id; ts; input_tokens; output_tokens; model? }
  | { type: 'node.activity'; run_id; node_id; ts; activity: string }
```

Every event has `type` and `ts`. Every node-scoped event has `node_id`. The schema is exhaustive — adding a new event type is a deliberate change to `packages/core/src/events/bus.ts`.

## Where each event comes from

| Event           | Emitter                                                                     |
| --------------- | --------------------------------------------------------------------------- |
| `run.started`   | `runExperience()` before the scheduler runs                                 |
| `run.finished`  | `runExperience()` after the scheduler returns                               |
| `node.ready`    | Scheduler when all predecessors are done                                    |
| `node.started`  | Scheduler before invoking a dispatcher                                      |
| `node.finished` | Scheduler after a successful dispatcher run; includes `metrics` if returned |
| `node.failed`   | Scheduler when a dispatcher throws (and `on_error` doesn't recover)         |
| `node.skipped`  | Scheduler when a predecessor failed/skipped, or `when:` evaluated false     |
| `state.write`   | `StateStore` on every successful write to a field                           |
| `node.activity` | LLM-touching dispatchers (agent, skill, cli-agent) at activity transitions  |
| `node.tokens`   | Agent + skill dispatchers after each LLM call, using `result.usage`         |

## Reading the log back

The JSONL file is one event per line. Order is **write order**, which with the parallel scheduler can be non-chronological. `oe inspect` sorts by `ts` before rendering:

```bash
oe inspect r-abc123 --experience examples/review-branch
```

Output (sorted by `ts` ascending):

```
INFO: run.started     run_id=r-abc123 args={pr_id:"PR-1"}
INFO: node.ready      node_id=fetch_diff
INFO: node.started    node_id=fetch_diff
INFO: node.activity   node_id=fetch_diff activity="reading fixture"
INFO: state.write     node_id=fetch_diff field=diff
INFO: node.finished   node_id=fetch_diff
INFO: node.ready      node_id=seed_dimensions
INFO: node.started    node_id=seed_dimensions
INFO: state.write     node_id=seed_dimensions field=dimensions
INFO: node.finished   node_id=seed_dimensions
INFO: node.activity   node_id=bug_review activity="calling claude-sonnet-4-6"
INFO: node.tokens     node_id=bug_review input_tokens=1240 output_tokens=187
INFO: node.activity   node_id=bug_review activity="validating structured output"
INFO: state.write     node_id=bug_review field=findings
INFO: node.finished   node_id=bug_review
... etc ...
INFO: run.finished    status=success
```

Pipe to `jq` or `grep` for analysis:

```bash
cat .openexpertise/runs/r-abc123.jsonl | jq -c 'select(.type=="state.write")'
# → every state-mutation event
```

## Why JSONL?

- One line = one event. Append-only writes are atomic at the OS level.
- Trivially `grep`-able, `jq`-able, `awk`-able.
- The event log survives crashes — `JsonlEventSink` uses synchronous `appendFileSync` for crash-safety.
- Replayable — you can deserialize and re-render any past run.

## Subscribing programmatically

```ts
import { EventBus, runExperience } from '@openexpertise/core'

const events = new EventBus()

events.subscribe((event) => {
  if (event.type === 'node.tokens') {
    metrics.incrementCounter('tokens_in', event.input_tokens)
    metrics.incrementCounter('tokens_out', event.output_tokens)
  }
  if (event.type === 'node.failed') {
    pagerDuty.alert({ runId: event.run_id, nodeId: event.node_id, error: event.error })
  }
})

await runExperience({ ..., events })
```

The bus is in-process pub-sub. Any number of subscribers can attach; errors in one don't abort the run.

## Custom event subscribers

A subscriber is just a function. Some useful ones:

- **Prometheus metrics** — bump counters on `node.tokens` and gauges on `node.finished.metrics.cost_usd`.
- **PagerDuty** — alert on `node.failed`.
- **Audit log** — write `state.write` events to an immutable external store.
- **Cost tracker** — sum `node.tokens` across runs to compute provider spend.

None of these are built into OpenExpertise V1 — they're three to ten lines of integration each.

## What's NOT an event

Things the runtime does **not** emit:

- **Per-byte LLM token output.** No streaming. If you want token-by-token rendering, you need a streaming LLM client (not in V1).
- **Tool internals.** When a tool runs `fetch()` or queries a database, no event fires. Tool implementations are your code; instrument them yourself if you need it.
- **Scheduler internal state.** "How many nodes are in the ready queue right now?" — not exposed.

→ Continue with [Scheduler](/concepts/scheduler).
