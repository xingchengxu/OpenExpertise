---
title: runExperience
---

# `runExperience`

Validates, schedules, and executes every node in an `ExperienceSpec`, writing state to SQLite and emitting structured events throughout the run.

## Import

```ts
import { runExperience } from '@openexpertise/core'
```

## Signature

```ts
export async function runExperience(opts: RunOpts): Promise<RunResult>
```

### `RunOpts`

```ts
export interface RunOpts {
  spec: ExperienceSpec
  experienceDir: string
  dispatchers: DispatcherRegistry
  events?: EventBus
  args?: Record<string, unknown>
  dbPath?: string
  runId?: string
  eventLogPath?: string
  cache?: boolean
  concurrency?: number
}
```

### `RunResult`

```ts
export interface RunResult {
  runId: string
  status: 'success' | 'failed' | 'partial'
  finalState: Record<string, unknown>
}
```

## Parameters

| Name | Type | Required | Description |
|---|---|---|---|
| `spec` | `ExperienceSpec` | ✓ | Parsed and validated experience specification. Use `parseExperienceYaml` from `@openexpertise/schema` to obtain it. |
| `experienceDir` | `string` | ✓ | Absolute path to the directory containing `experience.yaml`. Used to resolve relative `impl` paths, tool modules, and sub-experience YAML files. |
| `dispatchers` | `DispatcherRegistry` | ✓ | Registry containing one `NodeDispatcher` per node kind used in the spec. The runner throws at dispatch time if a required kind is missing. |
| `events` | `EventBus` | — | An existing `EventBus` to attach to. If omitted, a fresh bus is created internally. Subscribers attached before calling `runExperience` will receive all events. |
| `args` | `Record<string, unknown>` | — | Runtime arguments passed into every node's `NodeInputBundle.args`. Defaults to `{}`. |
| `dbPath` | `string` | — | Path for the SQLite state database. Defaults to `<experienceDir>/.openexpertise/state.sqlite`. |
| `runId` | `string` | — | Stable identifier for this run. Defaults to a random UUID. Supply a deterministic value for idempotent resume semantics. |
| `eventLogPath` | `string` | — | Path for the `.jsonl` event log. Defaults to `<experienceDir>/.openexpertise/runs/<runId>.jsonl`. |
| `cache` | `boolean` | — | Enable node-output memoization. Defaults to `true`. Pass `false` to disable. |
| `concurrency` | `number` | — | Maximum number of nodes that may execute in parallel. Overrides `runtime.concurrency` in the YAML. Defaults to `1` (sequential). |

## Returns

| Field | Type | Description |
|---|---|---|
| `runId` | `string` | The UUID for this run (may have been generated internally). |
| `status` | `'success' \| 'failed' \| 'partial'` | `success` — all nodes finished; `failed` — at least one node triggered `fail_run` policy; `partial` — at least one node was skipped due to a `skip` error policy but no fatal failure. |
| `finalState` | `Record<string, unknown>` | Snapshot of the entire state blackboard at run completion. Keys are the field names declared in `state.schema`. |

## Example

```ts
import { runExperience, DispatcherRegistry, EventBus } from '@openexpertise/core'
import { parseExperienceYaml } from '@openexpertise/schema'
import { ToolDispatcher } from '@openexpertise/node-kinds-tool'
import { AgentDispatcher, AnthropicLLMClient } from '@openexpertise/node-kinds-agent'
import { readFileSync } from 'node:fs'

const spec = parseExperienceYaml(readFileSync('experience.yaml', 'utf8'))

const bus = new EventBus()
bus.subscribe((e) => {
  if (e.type === 'node.finished') console.log('done:', e.node_id)
})

const dispatchers = new DispatcherRegistry()
dispatchers.register(new ToolDispatcher())
dispatchers.register(new AgentDispatcher({ client: new AnthropicLLMClient() }))

const result = await runExperience({
  spec,
  experienceDir: '/path/to/my-experience',
  dispatchers,
  events: bus,
  concurrency: 4,
})

console.log(result.status)      // 'success'
console.log(result.finalState)  // { field1: ..., field2: ... }
```

## Behavior notes

**Validation.** `runExperience` calls `validateExperienceSpec` from `@openexpertise/schema` at the top of every invocation. Passing an invalid spec throws synchronously before any state is mutated.

**Event log.** All events emitted to the internal (or provided) `EventBus` are automatically tee'd to a `.jsonl` file. The file is created lazily when the first event fires. The sink is flushed and closed in the `finally` block even if the run throws.

**Scheduler selection.** When `effectiveConcurrency > 1` (resolved as `opts.concurrency ?? spec.runtime?.concurrency ?? 1`), a `ParallelScheduler` is used; otherwise a `SequentialScheduler` runs nodes one at a time in topological order.

**Cache.** By default a `CacheStore` is initialized under `<experienceDir>/.openexpertise/cache/`. A node whose inputs hash to a cached key is returned immediately without calling its dispatcher. Pass `cache: false` to skip this entirely.

**State isolation.** Each call to `runExperience` opens its own `StateStore` (SQLite connection). The database file persists between runs, enabling resume semantics — nodes that wrote their outputs in a previous run can be skipped when cache is enabled.

**Error handling.** Errors thrown inside a node are caught by the scheduler and routed through the node's `on_error` policy. If no policy is declared, the default is `fail_run`. The `finally` block always runs: the event sink is closed and the SQLite connection is released regardless of outcome.

## Source

[packages/core/src/runner.ts](https://github.com/xingchengxu/OpenExpertise/blob/main/packages/core/src/runner.ts)
