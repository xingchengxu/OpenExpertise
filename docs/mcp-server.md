# `@openexpertise/mcp-server`

A stdio MCP server that exposes OpenExpertise as 7 tools, callable from any MCP-aware CLI (Claude Code, Codex, Gemini, or other MCP clients).

## Tools

| Tool | Input | Output |
|---|---|---|
| `oe_validate` | `{ experience_path }` | `{ valid: bool, errors?: string[] }` |
| `oe_state` | `{ experience_path, field? }` | `{ field, value }` or `{ snapshot }` or `{ note }` |
| `oe_inspect` | `{ experience_path, run_id }` | `{ events: object[] }` |
| `oe_run` | `{ experience_path, args?, llm? }` | `{ run_id, status, final_state }` |
| `oe_evolve` | `{ experience_path, run_id, llm? }` | `{ proposal_md, proposal_count }` |
| `oe_ultra` | `{ task, draft_root? }` | `{ slug, draft_dir, validation, files_written, ... }` |
| `oe_ultra_revise` | `{ draft_dir, feedback, max_rounds? }` | `{ draft_dir, analysis, synthesis, validation, files_written, loop }` |

`oe_run` and `oe_evolve` use the same LLM provider resolution as `oe run` / `oe evolve` (env var auto-detect + optional `llm` flag).

## Install

```bash
# From workspace (post-build):
node packages/mcp-server/dist/bin.js   # for smoke

# Or via the workspace bin symlink:
./node_modules/.bin/oe-mcp
```

The canonical install is `npx -y @openexpertise/mcp-server`.

## Register with each CLI

### Claude Code

```bash
claude mcp add openexpertise -- npx -y @openexpertise/mcp-server
```

Inside a Claude Code session, you can then say "use the openexpertise tool to validate examples/hello-tool" or "run examples/review-branch".

### Codex CLI

Add to `~/.codex/config.toml`:

```toml
[mcp_servers.openexpertise]
command = "npx"
args = ["-y", "@openexpertise/mcp-server"]
```

(Exact config path/syntax follows Codex's MCP convention; check `codex --help` if unsure.)

### Gemini CLI

Gemini supports MCP via its extension/MCP config. See `gemini --help` for the latest registration command.

## Permission notes

- The server has no network surface — it's stdio-only, runs in the user's CLI process.
- Tools that hit disk (run, evolve) write to the experience's `.openexpertise/` dir.
- `oe_run` may spawn subprocesses if the experience uses `cli-agent` nodes — these inherit the user's environment.
- Only enable this MCP server in trusted CLI sessions.

## Testing

The server uses `@modelcontextprotocol/sdk`'s `InMemoryTransport` for in-process round-trips. See `packages/mcp-server/tests/server.test.ts` for the pattern.

## V1 limitations

- **No `oe_init` / `oe_resume` / `oe_diff` / `oe_reset-state` yet.** Could be added in a follow-up; the 7 shipped tools cover most agentic flows.
- **No streaming output.** `oe_run` blocks until the experience finishes, then returns the final state. Long runs may stress the MCP client's tool-call timeout.
- **No progress events.** MCP supports server-initiated notifications; not used yet. Future work could stream per-node `node.completed` events to the client.
- **No auth.** Trust model = the CLI session.
