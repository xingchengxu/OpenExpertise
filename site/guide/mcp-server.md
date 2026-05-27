# MCP server — use OE from Claude Code

Expose OpenExpertise as MCP tools so any MCP-aware CLI (Claude Code, Codex, Gemini) can validate, run, inspect, and evolve experiences without leaving the conversation.

## When you need this

- You want to say "run examples/review-branch" inside Claude Code and have it actually run.
- You are using Codex or Gemini and want the same `oe_run` / `oe_evolve` capabilities.
- You want an agent to inspect run state (`oe_state`) and decide what to do next based on real values.
- You want to validate a generated `experience.yaml` in-flight before writing it to disk.

## The minimal example

Register with Claude Code:

```bash
claude mcp add openexpertise -- npx -y @openexpertise/mcp-server
```

Then in a Claude Code session:

```
Validate examples/hello-tool, then run it and show me the final state.
```

Claude Code calls `oe_validate`, then `oe_run`, then reads the `final_state` from the response.

## How it works

The MCP server (`packages/mcp-server/src/server.ts`) is a stdio MCP server built on `@modelcontextprotocol/sdk`. It exposes **6 tools**:

| Tool          | Input                               | Output                                                |
| ------------- | ----------------------------------- | ----------------------------------------------------- |
| `oe_validate` | `{ experience_path }`               | `{ valid: bool, errors?: string[] }`                  |
| `oe_state`    | `{ experience_path, field? }`       | `{ field, value }` or `{ snapshot }`                  |
| `oe_inspect`  | `{ experience_path, run_id }`       | `{ events: object[] }`                                |
| `oe_run`      | `{ experience_path, args?, llm? }`  | `{ run_id, status, final_state }`                     |
| `oe_evolve`   | `{ experience_path, run_id, llm? }` | `{ proposal_md, proposal_count }`                     |
| `oe_ultra`    | `{ task, draft_root? }`             | `{ slug, draft_dir, validation, files_written, ... }` |

All tools run in the user's process (stdio MCP, no network surface). Tools that write to disk (`oe_run`, `oe_evolve`) write to the experience's `.openexpertise/` directory. `oe_run` may spawn subprocesses if the experience uses `cli-agent` nodes.

`oe_run` and `oe_evolve` use the same LLM provider auto-detection as `oe run` and `oe evolve` — env vars `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` are read from the shell that started the MCP server.

## Registration

### Claude Code

```bash
claude mcp add openexpertise -- npx -y @openexpertise/mcp-server
```

From the workspace (post-build), skip the `npx` step:

```bash
claude mcp add openexpertise -- node packages/mcp-server/dist/bin.js
```

### Codex CLI

Add to `~/.codex/config.toml`:

```toml
[mcp_servers.openexpertise]
command = "npx"
args = ["-y", "@openexpertise/mcp-server"]
```

### Gemini CLI

Gemini supports MCP via its extension/MCP config. Check `gemini --help` for the current registration syntax. The command is the same: `npx -y @openexpertise/mcp-server`.

## Variations

**Run from a specific working directory** by passing an absolute path in `experience_path`:

```
Run the experience at /home/user/projects/my-sop
```

`oe_run` accepts any absolute path, not just relative paths from the repo root.

**Check state after a run:**

```
After running examples/review-branch, what is the value of the findings field?
```

Claude Code calls `oe_state({ experience_path: "...", field: "findings" })`.

**Author and immediately run:**

```
Author an experience for weekly Slack digest summarization, then run it.
```

Claude Code calls `oe_ultra` (gets the draft path), then `oe_run` on that path.

**Inspect a specific run:**

```
Show me the events from run abc123 of examples/review-branch.
```

Claude Code calls `oe_inspect({ experience_path: "...", run_id: "abc123" })`.

## Gotchas

- **`oe_run` blocks until the experience finishes.** Long experiences (multi-minute LLM chains) may stress the MCP client's tool-call timeout. The default MCP timeout in Claude Code is 5 minutes; use `oe run` directly for long-running experiences.
- **No streaming progress.** `oe_run` returns only after all nodes complete. There are no intermediate progress events in the MCP response.
- **Trust model = the CLI session.** The MCP server has no auth. Only register it in trusted sessions; it can write to disk and spawn subprocesses.
- **`oe_resume`, `oe_init`, `oe_diff`, and `oe_reset-state` are not yet MCP tools.** Use the CLI for these.

## See also

- [cli-agent node](/guide/cli-agent-usage) — the inverse direction: calling CLIs _from_ an OE experience
- [Author → run → evolve loop](/guide/closed-loop) — running the full loop via the MCP server
- [`/ultraexpertise` slash command](/guide/authoring-slash-command) — authoring from inside Claude Code without the MCP server
