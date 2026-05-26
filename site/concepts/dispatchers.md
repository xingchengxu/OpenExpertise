# Dispatchers

A **dispatcher** is the runtime component that knows how to execute one specific node kind. The scheduler doesn't care what a node does — it just hands the node to the right dispatcher. There's one dispatcher per node kind:

| Kind         | Dispatcher                                      | Package                                  |
| ------------ | ----------------------------------------------- | ---------------------------------------- |
| `tool`       | `ToolDispatcher`                                | `@openexpertise/node-kinds-tool`         |
| `agent`      | `AgentDispatcher`                               | `@openexpertise/node-kinds-agent`        |
| `skill`      | `SkillDispatcher`                               | `@openexpertise/node-kinds-skill`        |
| `dataset`    | `DatasetDispatcher`                             | `@openexpertise/node-kinds-dataset`      |
| `experience` | `ExperienceDispatcher`                          | `@openexpertise/node-kinds-experience`   |
| `cli-agent`  | `CliAgentDispatcher`                            | `@openexpertise/node-kinds-cli-agent`    |

## The interface

Every dispatcher implements `NodeDispatcher`:

```ts
interface NodeDispatcher {
  readonly kind: NodeKind                        // 'tool' | 'agent' | ...

  resolve(node: NodeSpec, ctx: RunContext):
    Promise<ResolvedImpl>

  run(impl: ResolvedImpl, bundle: NodeInputBundle, ctx: RunContext):
    Promise<NodeOutput>
}
```

The two-phase split (resolve + run) lets the scheduler:

1. **`resolve()`** — load the implementation (read the .mjs file, compile the AJV validator, look up the provider) ONCE per node. This is cached.
2. **`run()`** — execute, possibly many times if the node has `for_each`. Re-uses the resolved implementation.

## The bundle

What the dispatcher sees in `run()`:

```ts
interface NodeInputBundle {
  state_view: Record<string, unknown>     // values of fields in node.reads
  edge_inputs: Record<string, unknown>     // upstream nodes' edge_outputs by their id
  args: Record<string, unknown>            // node.spec.args (literal values, $resolved)
}
```

Plus `for_each` items, which are injected as `$item` / `$index` into the args bundle.

## The output

```ts
interface NodeOutput {
  state_delta: Record<string, unknown>
  edge_output?: unknown
  metrics?: { tokens_in?: number; tokens_out?: number; cost_usd?: number }
}
```

`state_delta` is merged into the SQLite blackboard via the field's merge strategy. `edge_output` is passed to successor nodes via their `_edge_inputs`. `metrics` becomes the `node.finished` event's `metrics` field.

## Dispatcher registry

A `DispatcherRegistry` is a `Map<NodeKind, NodeDispatcher>`. The CLI wires one in `oe run`:

```ts
const dispatchers = new DispatcherRegistry()
dispatchers.register(new ToolDispatcher())
dispatchers.register(new AgentDispatcher({ client: llm, defaultModel }))
dispatchers.register(new SkillDispatcher({ client: llm, defaultModel }))
dispatchers.register(new DatasetDispatcher())
dispatchers.register(new ExperienceDispatcher({ runExperience }))
dispatchers.register(new CliAgentDispatcher())
```

…and then `runExperience({ dispatchers, ... })` uses them. **You can replace any of these** when calling `runExperience` programmatically. Want to mock the LLM? Inject a `FakeLLMClient` into `AgentDispatcher`. Want to swap the cli-agent runner? Pass your own `SubprocessRunner`.

## Writing your own dispatcher

You can. The pattern:

```ts
import type { NodeDispatcher, NodeInputBundle, NodeOutput, ResolvedImpl, RunContext } from '@openexpertise/core'

class MyKindDispatcher implements NodeDispatcher {
  readonly kind = 'my-kind' as const

  async resolve(node, ctx): Promise<ResolvedImpl> {
    // load .impl, compile validators, etc.
    return { /* whatever the run() needs */ } as ResolvedImpl
  }

  async run(impl, bundle, ctx): Promise<NodeOutput> {
    // do the thing
    return { state_delta: { ... } }
  }
}
```

Then register it, and add `'my-kind'` to the `NodeKind` union (which today is a closed enum in `@openexpertise/schema/types`). For V1 that means forking the schema package.

V2 (not yet committed) will likely expose `NodeKind` as `string` and let dispatchers self-declare, allowing third-party kinds without forking.

## Per-kind behavior summary

| Dispatcher              | Key behavior                                                                                                                 |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `ToolDispatcher`        | Dynamic-imports the .mjs file via `pathToFileURL`. Calls its default export with `{ ...args, _edge_inputs, _state }`.        |
| `AgentDispatcher`       | Compiles the inline AJV schema once. Calls `LLMClient.complete()` with the `structured_output` tool forced. Validates result.|
| `SkillDispatcher`       | Reads SKILL.md (with frontmatter via gray-matter), invokes the LLM with the body as system prompt. Returns text or struct.   |
| `DatasetDispatcher`     | Branches on `source.type` (file / sqlite / http / mcp-resource) and loads rows.                                              |
| `ExperienceDispatcher`  | Calls `runExperience()` recursively on the nested YAML. State is isolated by default.                                        |
| `CliAgentDispatcher`    | Spawns a subprocess via injectable `SubprocessRunner`. Parses stdout (text or JSON with optional AJV).                       |

For the full per-kind YAML and dispatcher details, see the [6 node kinds](/concepts/node-kinds) index page.

## Two-stage emit pattern (for LLM-touching dispatchers)

`AgentDispatcher`, `SkillDispatcher`, `CliAgentDispatcher` emit `node.activity` events at key transitions and `node.tokens` after each LLM call (only for the SDK-based ones — CLI agents don't expose tokens):

```ts
ctx.events.emit({ type: 'node.activity', activity: 'calling claude-sonnet-4-6', ... })
const result = await this.opts.client.complete(...)
if (result.usage) {
  ctx.events.emit({ type: 'node.tokens', input_tokens: result.usage.input_tokens, ... })
}
ctx.events.emit({ type: 'node.activity', activity: 'validating structured output', ... })
```

This is what powers the live TUI rows.

## Testing dispatchers

Every shipped dispatcher has unit tests with scripted clients/runners:

- `AgentDispatcher` + `FakeLLM` → see `packages/node-kinds-agent/tests/`
- `CliAgentDispatcher` + `FakeRunner` → see `packages/node-kinds-cli-agent/tests/`

If you write your own, follow that pattern: take a client/runner as constructor opt, scripted clients in tests, real ones in production.

→ Continue with [Cache key + memoization](/concepts/cache).
