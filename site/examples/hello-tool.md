---
title: hello-tool
description: The smallest possible OpenExpertise experience — one tool node, no LLM required.
---

# hello-tool

_The smallest possible OpenExpertise experience: one [tool](/concepts/node-tool) node writes a greeting to [state](/concepts/state)._

## What it demonstrates

- A single `tool` node as the complete graph
- The `state.schema` contract: `name` in, `greeting` out
- How a tool returns `state_delta` to the runtime
- Baseline event log structure (run.started → state.write → run.finished)

## The graph

```yaml
graph:
  nodes:
    - id: greet
      kind: tool
      impl: ./tools/greet.mjs
      args:
        name: World
      writes: [greeting]
  edges: []
```

No edges — a single node is a valid DAG.

## State schema

| Field      | Type     | Direction         | Description             |
| ---------- | -------- | ----------------- | ----------------------- |
| `name`     | `string` | in (via `--args`) | Subject of the greeting |
| `greeting` | `string` | out               | Produced by `greet.mjs` |

## How it runs

```bash
oe validate examples/hello-tool
oe run examples/hello-tool --args '{}'
```

No `ANTHROPIC_API_KEY` required. No external CLIs required.

To greet someone specific:

```bash
oe run examples/hello-tool --args '{"name":"Alice"}'
```

## What happens

1. The scheduler starts a run, emits `run.started`.
2. `greet` is dispatched to `ToolDispatcher`, which calls `greet.mjs`.
3. `greet.mjs` returns `{ state_delta: { greeting: "hello, World" } }`.
4. The runtime writes `greeting` to the SQLite blackboard, emits `state.write`.
5. Run finishes, emits `run.finished`.

```
$ oe state greeting
hello, World
```

The event log at `.openexpertise/runs/<run-id>.jsonl` has exactly three events — easy to read through when you're learning how OpenExpertise works.

## How `greet.mjs` is implemented

```js
export default async function greet(args) {
  return { state_delta: { greeting: `hello, ${args.name}` } }
}
```

The function receives the node's `args` bundle and must return an object with a `state_delta` key. Fields in `state_delta` are merged into state.

## Try it: variations

**1. Change the greeting message.**
Edit `greet.mjs` to return `HELLO, ${args.name.toUpperCase()}!`. Re-run — no schema changes needed.

**2. Add a second tool node.**
Add a `farewell` node that reads `greeting` and writes `goodbye`. Add an edge `{ from: greet, to: farewell }`. This shows sequential tool chaining without any LLM.

**3. Pass a dynamic name at run time.**
Change `args.name` to `"{{name}}"` in the YAML. Then run with `--args '{"name":"Bob"}'`. (Note: you'll need a seed tool node to write `name` into state first, since V1 `--args` are not auto-propagated into node bundles — see the [cli-orchestration](/examples/cli-orchestration) walkthrough for the pattern.)

::: tip Start here
`hello-tool` is the best first example to read if you want to understand how nodes, state, and the event log fit together before touching an LLM.
:::

## Source

[examples/hello-tool/](https://github.com/xingchengxu/OpenExpertise/tree/main/examples/hello-tool)
