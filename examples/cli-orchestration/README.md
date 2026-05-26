# cli-orchestration

Smallest demo of the `cli-agent` node kind. Two nodes:

1. `summarize` — Claude Code writes a 3-sentence summary
2. `critique` — Codex critiques it

## Prereqs

Both `claude` and `codex` must be on `PATH` and authenticated. Run `claude` and `codex` once interactively first if you haven't.

## Run

```bash
node packages/cli/dist/bin.js run examples/cli-orchestration \
  --args '{"topic":"In-memory caching strategies for HTTP APIs"}'
```

## What it shows

- Two providers in one graph
- State flow: `summary` written by node 1 is read by node 2 via `{{summary}}`
- Sequential edge ordering (`summarize → critique`)
