---
title: EventBus
---

# `EventBus`

A lightweight in-process pub/sub bus that carries structured `RunEvent` values throughout a run. Every significant lifecycle milestone — run start/finish, node state transitions, token usage, and activity updates — is emitted as a typed event.

## Import

```ts
import { EventBus } from '@openexpertise/core'
import type { RunEvent, EventListener } from '@openexpertise/core'
```

## Signature

```ts
export type EventListener = (event: RunEvent) => void

export class EventBus {
  subscribe(listener: EventListener): () => void
  emit(event: RunEvent): void
}
```

## Methods

### `subscribe(listener)`

```ts
subscribe(listener: EventListener): () => void
```

Registers `listener` to receive every future event. Returns an unsubscribe function — call it to remove the listener.

### `emit(event)`

```ts
emit(event: RunEvent): void
```

Synchronously calls every registered listener with `event`. Listener errors are caught, logged to `process.stderr`, and do not abort the run or prevent other listeners from receiving the event.

## `RunEvent` variants

```ts
export type RunEvent =
  | { type: 'run.started';  run_id: string; ts: string; args?: unknown }
  | { type: 'run.finished'; run_id: string; ts: string; status: 'success' | 'failed' | 'partial' }
  | { type: 'node.ready';   run_id: string; node_id: string; ts: string; phase?: string }
  | { type: 'node.started'; run_id: string; node_id: string; ts: string; phase?: string }
  | {
      type: 'node.finished'
      run_id: string
      node_id: string
      ts: string
      phase?: string
      metrics?: { tokens_in?: number; tokens_out?: number; cost_usd?: number }
    }
  | { type: 'node.failed';   run_id: string; node_id: string; ts: string; phase?: string; error: string }
  | { type: 'node.skipped';  run_id: string; node_id: string; ts: string; phase?: string; reason: string }
  | { type: 'state.write';   run_id: string; node_id: string; field: string; ts: string }
  | {
      type: 'node.tokens'
      run_id: string
      node_id: string
      ts: string
      input_tokens: number
      output_tokens: number
      model?: string
    }
  | { type: 'node.activity'; run_id: string; node_id: string; ts: string; activity: string }
```

### Event reference

| `type` | Emitted by | Key fields | Description |
|---|---|---|---|
| `run.started` | `runExperience` | `args` | Emitted at the very start of a run, before any node executes. |
| `run.finished` | `runExperience` | `status` | Emitted after all nodes have settled (success, failure, or partial). |
| `node.ready` | Scheduler | `node_id`, `phase` | Emitted when a node's upstream dependencies are satisfied and it is queued for execution. |
| `node.started` | Scheduler | `node_id`, `phase` | Emitted immediately before the dispatcher's `run` method is called. |
| `node.finished` | Scheduler | `node_id`, `phase`, `metrics` | Emitted after the dispatcher's `run` returns successfully. |
| `node.failed` | Scheduler | `node_id`, `error` | Emitted when the dispatcher throws an unhandled error. |
| `node.skipped` | Scheduler | `node_id`, `reason` | Emitted when a node is skipped due to a `skip` error policy or an unsatisfied `when:` edge condition. |
| `state.write` | `StateStore` | `node_id`, `field` | Emitted once per field on every call to `StateStore.write`. |
| `node.tokens` | Dispatchers | `input_tokens`, `output_tokens`, `model` | Emitted by LLM-backed dispatchers (`agent`, `skill`, `cli-agent`) after a completion call. |
| `node.activity` | Dispatchers | `activity` | Free-form status string emitted by dispatchers at key internal steps (e.g. `"spawning claude-code (timeout 600000ms)"`). Used by the TUI for live progress display. |

## Common fields

All `RunEvent` variants include:

| Field | Type | Description |
|---|---|---|
| `type` | `string` | Discriminant. Use it to narrow the union. |
| `run_id` | `string` | UUID of the run that emitted the event. |
| `ts` | `string` | ISO-8601 timestamp at the moment of emission. |

## Example

```ts
import { EventBus, runExperience } from '@openexpertise/core'
import type { RunEvent } from '@openexpertise/core'

const bus = new EventBus()

// Track token usage across the run
let totalTokensIn = 0
let totalTokensOut = 0

const unsub = bus.subscribe((e: RunEvent) => {
  if (e.type === 'node.tokens') {
    totalTokensIn  += e.input_tokens
    totalTokensOut += e.output_tokens
  }
  if (e.type === 'node.failed') {
    console.error(`Node ${e.node_id} failed: ${e.error}`)
  }
  if (e.type === 'run.finished') {
    console.log(`Run ${e.run_id} ${e.status}`)
    console.log(`Total tokens: ${totalTokensIn} in / ${totalTokensOut} out`)
    unsub()  // clean up
  }
})

await runExperience({ spec, experienceDir, dispatchers, events: bus })
```

## Event log

`runExperience` automatically tee's all events to a `.jsonl` file at `<experienceDir>/.openexpertise/runs/<runId>.jsonl`. Each line is a JSON-serialized `RunEvent`. The sink is flushed and closed in the `finally` block regardless of run outcome.

To read the log after a run:

```ts
import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'

const events: RunEvent[] = []
const rl = createInterface({ input: createReadStream('.openexpertise/runs/my-run-id.jsonl') })
for await (const line of rl) {
  events.push(JSON.parse(line) as RunEvent)
}
```

## Behavior notes

**Synchronous dispatch.** `emit` calls all listeners synchronously in insertion order. Do not perform blocking I/O inside a listener — it will delay the emit call and could stall the run.

**Error isolation.** If a listener throws, the error is written to `process.stderr` and the next listener is called regardless. This means a buggy subscriber cannot crash a run.

**Multiple buses.** `runExperience` creates its own internal `EventBus` when none is provided. Pass a custom bus to receive events in your application without needing to re-create the registry or spec.

**Unsubscribe.** The function returned by `subscribe` is idempotent — calling it more than once is safe.

## Source

[packages/core/src/events/bus.ts](https://github.com/xingchengxu/OpenExpertise/blob/main/packages/core/src/events/bus.ts)
