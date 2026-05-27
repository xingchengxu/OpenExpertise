# The TUI dashboard

`oe run --tui` opens an ink-rendered terminal dashboard. It is the same render you'd build with `tail -f` on the event log, except live, structured, and per-node.

## What you see

```
OpenExpertise run — running  · Σ in=2847 out=412

▶ fetch_diff      [collect]  · running …
▶ seed_dimensions [collect]  · running
▶ bug_review      [review]   · calling claude-sonnet-4-6  · 1024/187
▶ verify_finding  [verify]   · validating structured output  · 823/189
· score           [score]
```

Anatomy:

- **Header line** — overall run status (`starting` / `running` / `finished: success`) plus run-total tokens (`Σ in=<input> out=<output>`).
- **Per-node row** — status glyph, node id, phase tag, current activity string, accumulated tokens.

### Status glyphs

| Glyph | Status  | Color  |
| :---: | ------- | ------ |
|  `·`  | pending | gray   |
|  `▶`  | running | cyan   |
|  `✓`  | done    | green  |
|  `✗`  | failed  | red    |
|  `–`  | skipped | yellow |

### Activity strings

Each LLM-touching dispatcher emits a `node.activity` event at meaningful transitions. The TUI shows the **latest** activity per node:

| Provider                  | Activities you'll see                                                                    |
| ------------------------- | ---------------------------------------------------------------------------------------- |
| `agent` (LLM)             | `calling <model>` → `validating structured output` / `parsing text output`               |
| `skill` (SKILL.md)        | `calling <model> (skill: <name>)` → `parsing text output`                                |
| `cli-agent` (CLI process) | `spawning <provider> (timeout <ms>)` → `parsing JSON output` / `parsing text output`     |
| `tool`                    | (none — tools don't emit activity events because they're synchronous deterministic code) |

### Tokens

`node.tokens` events carry `{ input_tokens, output_tokens, model }`. The TUI accumulates per node (since one node may make multiple LLM calls via `for_each` or retries) and adds them to the run-level total in the header.

CLI agents (Claude Code, Codex, Gemini) don't expose token usage, so their nodes only show activity — no token counter.

## Trade-offs and notes

- The TUI buffers output. While it's running, normal `pino` log lines do **not** appear in your terminal — they still flow into the JSONL event log on disk. Run `oe inspect <run-id>` after the fact to see the full structured log.
- The TUI flushes on completion (~100ms after `run.finished`) and unmounts. The final state is the last visible frame.
- For very long runs with hundreds of nodes, the TUI will scroll past your terminal height. The full event log is the source of truth.
- The TUI is implemented in `@openexpertise/tui` (ink + React). The state model is a pure reducer (`packages/tui/src/reducer.ts`) — easily unit-testable, and easy to swap out for an alternative renderer.

## Programmatic use

If you're running OE from your own Node code (not through the CLI), call `startTui` directly:

```ts
import { startTui } from '@openexpertise/tui'
import { runExperience, EventBus } from '@openexpertise/core'

const events = new EventBus()
const tui = startTui({
  events,
  nodes: spec.graph.nodes.map((n) => ({ id: n.id, phase: n.phase })),
})

try {
  const result = await runExperience({ spec, experienceDir, dispatchers, events, args: {} })
  // wait for one render cycle so the final 'finished' state lands
  await new Promise((r) => setTimeout(r, 100))
} finally {
  tui.unmount()
}
```

## Future enhancements

- `oe inspect --tui` to replay a finished run in the same dashboard.
- Pinned summary widgets (cost estimate, retry count).
- A "drill into a node" view showing that node's emitted activity timeline.
- Pause / step / drop into REPL.

Not in V1.

→ Continue with [Hand-writing experience.yaml](/guide/authoring-yaml) or jump to [oe ultra — LLM authors for you](/guide/authoring-ultra).
