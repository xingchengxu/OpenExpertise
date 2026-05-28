# {{NAME}}

A starter `cli-agent` flow — delegates one step to a Claude Code subprocess. Useful when you want the agent's full tool palette (file edits, web search, etc.) for a single step in a larger graph.

## Prereqs

- `claude` CLI on PATH and authenticated. Verify with `oe doctor`.

## Run

```bash
oe validate
oe run .
oe state answer
```

## What this demonstrates

- The `cli-agent` node kind — spawns the agent's CLI as a subprocess, captures stdout, parses output, writes to state.
- `output_format: text` (the default) — free-form text. Use `output_format: json` + a `schema:` for structured output.
- `timeout_ms` — bound the subprocess. Defaults to 600s; we override to 2 min here.

## Variations

- Swap `provider: claude-code` for `codex` or `gemini` — same node shape works.
- Add `for_each: { source: $.questions, concurrency: 2 }` to fan out across multiple questions in parallel.
- Combine with an `agent` node that synthesizes the cli-agent's free-form answer into structured data.

## Next steps

- See [`examples/cli-orchestration`](https://github.com/xingchengxu/OpenExpertise/tree/main/examples/cli-orchestration) for a two-CLI flow.
- See [`examples/tri-cli-orchestration`](https://github.com/xingchengxu/OpenExpertise/tree/main/examples/tri-cli-orchestration) for all three rival CLIs in one graph.
