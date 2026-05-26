---
title: NodeDispatcher
---

# `NodeDispatcher`

The interface every node kind must implement to plug into the OpenExpertise runtime. The scheduler calls `resolve` once per node (cached after the first call) and `run` each time the node executes.

## Import

```ts
import type { NodeDispatcher, NodeInputBundle, NodeOutput, ResolvedImpl } from '@openexpertise/core'
```

All four types are also re-exported from `@openexpertise/core` via `packages/core/src/dispatcher/registry.ts`.

## Signature

```ts
export interface NodeInputBundle {
  state_view: Readonly<Record<string, unknown>>
  edge_inputs: Record<string, unknown>
  args: Record<string, unknown>
}

export interface NodeOutput {
  state_delta: Record<string, unknown>
  edge_output?: unknown
  metrics?: { tokens_in?: number; tokens_out?: number; cost_usd?: number }
}

export interface ResolvedImpl {
  /* opaque to the runtime; each dispatcher fills it as needed */
  [k: string]: unknown
}

export interface NodeDispatcher {
  readonly kind: NodeKind
  resolve(node: NodeSpec, ctx: RunContext): Promise<ResolvedImpl>
  run(impl: ResolvedImpl, bundle: NodeInputBundle, ctx: RunContext): Promise<NodeOutput>
}
```

## `NodeDispatcher` fields

| Name | Type | Description |
|---|---|---|
| `kind` | `NodeKind` | Identifies which YAML `kind:` value this dispatcher handles. Must be unique within a `DispatcherRegistry`. |
| `resolve` | `(node, ctx) => Promise<ResolvedImpl>` | Loads, validates, and caches any static resources needed to run the node (e.g. dynamic imports, file reads). Called once per node spec before the first execution. |
| `run` | `(impl, bundle, ctx) => Promise<NodeOutput>` | Executes the node's logic. Called each time the scheduler fires the node, including on retry. |

## `NodeInputBundle` fields

| Name | Type | Description |
|---|---|---|
| `state_view` | `Readonly<Record<string, unknown>>` | A read-only snapshot of the fields listed in the node's `reads` declaration. Keys outside `reads` are not present. |
| `edge_inputs` | `Record<string, unknown>` | `edge_output` values forwarded from upstream nodes via edges that target this node. |
| `args` | `Record<string, unknown>` | The `args` passed to `runExperience`, merged with any static `args` declared on the node in YAML. |

## `NodeOutput` fields

| Name | Type | Required | Description |
|---|---|---|---|
| `state_delta` | `Record<string, unknown>` | ✓ | Fields to write back to the state blackboard. Only keys declared in `writes` are accepted; writing an undeclared key throws. Pass `{}` for nodes that produce no state. |
| `edge_output` | `unknown` | — | Value to forward to downstream nodes via edges originating from this node. |
| `metrics` | `{ tokens_in?, tokens_out?, cost_usd? }` | — | Optional usage metrics. The runtime emits a `node.finished` event that includes these values. |

## `DispatcherRegistry`

Manages the mapping from `NodeKind` to `NodeDispatcher`.

```ts
export class DispatcherRegistry {
  register(dispatcher: NodeDispatcher): void
  get(kind: NodeKind): NodeDispatcher
  has(kind: NodeKind): boolean
}
```

| Method | Throws | Description |
|---|---|---|
| `register(d)` | If a dispatcher for `d.kind` is already registered | Adds the dispatcher to the registry. |
| `get(kind)` | If no dispatcher is registered for `kind` | Returns the dispatcher for the given kind. |
| `has(kind)` | Never | Returns `true` if a dispatcher is registered for the kind. |

## Built-in dispatcher classes

| Package | Class | `kind` |
|---|---|---|
| `@openexpertise/node-kinds-tool` | `ToolDispatcher` | `'tool'` |
| `@openexpertise/node-kinds-agent` | `AgentDispatcher` | `'agent'` |
| `@openexpertise/node-kinds-skill` | `SkillDispatcher` | `'skill'` |
| `@openexpertise/node-kinds-dataset` | `DatasetDispatcher` | `'dataset'` |
| `@openexpertise/node-kinds-experience` | `ExperienceDispatcher` | `'experience'` |
| `@openexpertise/node-kinds-cli-agent` | `CliAgentDispatcher` | `'cli-agent'` |

## Writing your own dispatcher

```ts
import type {
  NodeDispatcher,
  NodeInputBundle,
  NodeOutput,
  ResolvedImpl,
  RunContext,
} from '@openexpertise/core'
import type { NodeSpec } from '@openexpertise/schema'

interface MyImpl extends ResolvedImpl {
  config: { endpoint: string }
  nodeId: string
}

export class MyDispatcher implements NodeDispatcher {
  readonly kind = 'tool' as const  // or a custom kind registered in schema

  async resolve(node: NodeSpec, _ctx: RunContext): Promise<MyImpl> {
    // Load config, validate, open connections...
    return { config: { endpoint: 'https://...' }, nodeId: node.id }
  }

  async run(impl: ResolvedImpl, bundle: NodeInputBundle, _ctx: RunContext): Promise<NodeOutput> {
    const mi = impl as MyImpl
    const result = await fetch(mi.config.endpoint, {
      method: 'POST',
      body: JSON.stringify(bundle.state_view),
    })
    const data = await result.json()
    return {
      state_delta: { my_output: data },
      metrics: { cost_usd: 0 },
    }
  }
}
```

Then register:

```ts
const dispatchers = new DispatcherRegistry()
dispatchers.register(new MyDispatcher())
```

## Behavior notes

**`resolve` caching.** The runtime calls `resolve` once per node spec per run and reuses the returned `ResolvedImpl` for every subsequent call to `run` (including retries). Put expensive initialization — dynamic imports, file reads, schema compilation — in `resolve`, not in `run`.

**`ResolvedImpl` is opaque.** The runtime treats `ResolvedImpl` as an opaque blob and never inspects its contents. Cast it to a concrete type in your `run` implementation.

**Concurrency.** When `concurrency > 1`, `run` may be called for different nodes simultaneously. Dispatchers must be safe for concurrent use. The `StateStore.write` method is transactional, so concurrent writes to different fields are safe.

**Error handling.** Throw a plain `Error` from `run` to signal failure. The scheduler intercepts the error and applies the node's `on_error` policy (see [on_error guide](/guide/on-error)).

## Source

- [packages/core/src/dispatcher/types.ts](https://github.com/xingchengxu/OpenExpertise/blob/main/packages/core/src/dispatcher/types.ts)
- [packages/core/src/dispatcher/registry.ts](https://github.com/xingchengxu/OpenExpertise/blob/main/packages/core/src/dispatcher/registry.ts)
