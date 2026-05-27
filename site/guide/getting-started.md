# Install & first run

This page gets you from zero to a running experience in under 60 seconds.

## Prerequisites

- **Node.js 20, 22, or 24** — OpenExpertise's CI matrix tests all three.
- **pnpm 9+** — `corepack enable && corepack prepare pnpm@latest --activate` if you don't have it.
- A POSIX shell (macOS, Linux, or WSL on Windows).

You do **not** need an API key to run the hello-world example. You'll need one (Anthropic or OpenAI) to run anything that uses `agent` or `cli-agent` nodes.

## Clone and build

```bash
git clone https://github.com/xingchengxu/OpenExpertise && cd OpenExpertise
pnpm install
pnpm -r build
```

The build compiles 15 TypeScript packages into their `dist/` directories. You should see something like:

```
packages/schema build: Done
packages/core build: Done
... (15 lines)
packages/cli build: Done
```

::: tip
You can also use `npm install -g @openexpertise/cli` and run `oe` directly without cloning the repo. Clone + build is for developing or hacking on the runtime itself.
:::

## Run hello-tool — no API key required

```bash
oe run examples/hello-tool
```

You should see:

```
ⓘ run-... finished
  status: "success"
  finalState: {
    "greeting": "hello, World"
  }
```

What just happened? The CLI:

1. Parsed `examples/hello-tool/experience.yaml`.
2. Validated it against the schema (`oe validate` runs as part of `oe run`).
3. Built the DAG (1 node, no edges).
4. Loaded `examples/hello-tool/tools/greet.mjs`, called its default export.
5. Wrote the returned `state_delta.greeting` into the SQLite blackboard at `.openexpertise/state.sqlite`.
6. Emitted a JSONL event log at `.openexpertise/runs/<run-id>.jsonl`.

You now have a `.openexpertise/` directory inside `examples/hello-tool/`. Peek inside:

```bash
ls examples/hello-tool/.openexpertise/
# state.sqlite  runs/  cache/
```

That's the persistent state. Run it again — same output, plus a new run-id.

## Inspect the run

```bash
RUN_ID=$(ls examples/hello-tool/.openexpertise/runs/ | head -1 | sed 's/.jsonl//')
oe inspect $RUN_ID --experience examples/hello-tool
```

This dumps the event log (sorted by `ts`):

```
INFO: run.started run_id=... args={}
INFO: node.ready run_id=... node_id=greet
INFO: node.started run_id=... node_id=greet
INFO: state.write run_id=... node_id=greet field=greeting
INFO: node.finished run_id=... node_id=greet
INFO: run.finished run_id=... status=success
```

Every event is structured JSON. The same log replays the run for debugging or audit.

## Query the state

```bash
oe state --experience examples/hello-tool
# → full state snapshot

oe state greeting --experience examples/hello-tool
# → just the greeting field
```

## Run with the TUI

```bash
oe run examples/hello-tool --tui
```

You get an ink-rendered dashboard showing each node's status. For one-node `hello-tool` it's modest — try it on [`examples/review-branch`](/examples/review-branch) for the full htop-grade view.

## What to do next

| Path                                         | Page                                                     |
| -------------------------------------------- | -------------------------------------------------------- |
| Write your own first experience from scratch | [Your first experience](/guide/first-experience)         |
| Add an LLM agent node                        | [Run with an LLM](/guide/run-with-llm)                   |
| Have an LLM author the whole YAML for you    | [oe ultra — LLM authors for you](/guide/authoring-ultra) |
| Understand the model                         | [What is an experience?](/concepts/experiences)          |
| Pick an example that matches your use case   | [All examples](/examples/)                               |

## Common gotchas

**Node version mismatch on `better-sqlite3`.** If you switched Node versions, run `pnpm rebuild` to recompile the native module.

**ESM import errors.** OpenExpertise is fully ESM (`"type": "module"` in every package). Don't `require()` any of it from CommonJS.

**Workspace links.** If something complains about `@openexpertise/...` not being found when running from the cloned repo, you skipped `pnpm install` or you're outside the repo root. The CLI binary resolves workspace deps relative to the repo, so it must be invoked from inside the cloned tree.

→ Continue with [Your first experience](/guide/first-experience).
