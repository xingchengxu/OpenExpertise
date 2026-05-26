---
title: agent-echo
description: The smallest LLM-backed OpenExpertise experience — one agent node greets by name.
---

# agent-echo

*The smallest LLM-backed experience: one [`agent`](/concepts/node-agent) node reads a name from args and writes a one-sentence greeting.*

## What it demonstrates

- A single `agent` node with a prompt file
- Prompt interpolation: `{{name}}` resolved from node args
- `ANTHROPIC_API_KEY` as the minimal LLM requirement
- Structured output via the agent's `writes` contract

## The graph

```yaml
graph:
  nodes:
    - id: greet
      kind: agent
      prompt: ./prompts/echo.md
      args:
        name: World
      writes: [greeting]
  edges: []
```

## State schema

| Field | Type | Direction | Description |
|---|---|---|---|
| `name` | `string` | in (via node args) | Who to greet |
| `greeting` | `string` | out | Model's one-sentence reply |

## How it runs

Requires `ANTHROPIC_API_KEY`:

```bash
export ANTHROPIC_API_KEY=sk-...
oe run examples/agent-echo
```

To greet a specific name:

```bash
oe run examples/agent-echo --args '{"name":"Alice"}'
```

::: warning LLM required
This is the first example that makes a real API call. Make sure your `ANTHROPIC_API_KEY` is set before running.
:::

## What happens

1. The scheduler dispatches `greet` to `AgentDispatcher`.
2. The dispatcher loads `prompts/echo.md`, interpolates `{{name}}` → `"World"` (or whatever was passed).
3. The model receives: _"Say a friendly hello to World. Keep it short — one sentence."_
4. The model's text response is written to the `greeting` field in state.

```
$ oe state greeting
Hello, World! Wishing you a wonderful day ahead.
```

## The prompt

```md
Say a friendly hello to {{name}}. Keep it short — one sentence.
```

Prompt files live in `prompts/` and use `{{field}}` interpolation. This one is the simplest possible: a single sentence instruction with one variable.

## Try it: variations

**1. Change the prompt.**
Edit `prompts/echo.md` to ask for a different style — e.g., _"Greet {{name}} in the style of a pirate."_ No schema changes needed.

**2. Add a second agent.**
Add a `farewell` agent node that reads `greeting` and writes `goodbye`. The node can reference `{{greeting}}` in its prompt. Add edge `{ from: greet, to: farewell }`.

**3. Use a different model.**
By default the `AgentDispatcher` uses whatever model your client is configured for. Pass `--model claude-3-5-haiku-20241022` (or the equivalent CLI flag) to use a faster/cheaper model for this toy example.

::: tip Compare with hello-tool
[hello-tool](/examples/hello-tool) does the same thing without a model call. Compare the two to understand exactly what the `agent` node kind adds.
:::

## Source

[examples/agent-echo/](https://github.com/xingchengxu/OpenExpertise/tree/main/examples/agent-echo)
