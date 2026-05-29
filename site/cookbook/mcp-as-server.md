---
title: Using oe-mcp from an external agent
description: Expose OpenExpertise flows as MCP tools so Claude Code, Codex, or any MCP client can invoke them bidirectionally.
---

# Using oe-mcp from an external agent

## Problem

You're working in Claude Code (or any MCP-aware client) and want to trigger an OpenExpertise flow, inspect its state, or evolve it — without leaving your CLI session. Or you want to embed OE flows as callable tools inside a larger agentic pipeline.

## Solution

```bash
# 1. Start the MCP server in one terminal
npx @openexpertise/mcp --experience ./experience.yaml --port 3100

# 2. In Claude Code's MCP config (~/.claude/mcp.json), add:
```

```json
{
  "mcpServers": {
    "openexpertise": {
      "command": "npx",
      "args": ["@openexpertise/mcp", "--experience", "/abs/path/to/experience.yaml"]
    }
  }
}
```

Once registered, the following tools appear in your Claude Code session:

| Tool              | Description                                                 |
| ----------------- | ----------------------------------------------------------- |
| `oe_validate`     | Parse and validate `experience.yaml`; returns errors        |
| `oe_run`          | Start a run; returns `run_id`                               |
| `oe_state`        | Read one or all state fields from a run                     |
| `oe_inspect`      | Return the event timeline for a run                         |
| `oe_evolve`       | Trigger the evolution advisor on a completed run            |
| `oe_ultra`        | Author a new experience from a natural-language description |
| `oe_ultra_revise` | Apply natural-language feedback to an existing draft        |

Example MCP session from inside Claude Code:

```
> /mcp openexpertise oe_validate
✓ experience.yaml is valid (4 nodes, 3 edges)

> /mcp openexpertise oe_run input='{"pr_url":"https://github.com/org/repo/pull/42"}'
run_id: run_def456

> /mcp openexpertise oe_state run_id=run_def456 field=risk_score
0.73

> /mcp openexpertise oe_inspect run_id=run_def456
[... timeline JSON ...]
```

## Walkthrough

`@openexpertise/mcp` is a standalone Node.js process that implements the Model Context Protocol server interface. It wraps the same `runExperience` / `StateStore` / `EventBus` APIs used by the CLI, so everything you can do with `oe run` you can do via MCP.

The server runs in the same filesystem context as the experience — it can read prompt files, tool `.mjs` files, and state from `.openexpertise/`. The Claude Code session communicates with it over stdio (the default transport) or TCP if `--port` is set.

`oe_run` is asynchronous: it starts the run and returns a `run_id` immediately. You can poll state with `oe_state` or call `oe_inspect` after the run completes. For blocking behavior, pass `wait: true` in the tool input — the server holds the MCP call open until the run finishes (suitable for short runs; not recommended for multi-hour flows).

`oe_ultra` lets the LLM author a new experience on the fly: pass a natural-language description and the tool returns a draft `experience.yaml` string that you can review and write to disk.

## Variations

- **Multi-experience server:** Pass multiple `--experience` flags to expose several experiences as distinct `oe_run_<name>` tool variants.
- **Embed in a larger agent flow:** Use OE as the orchestration layer inside a Claude Code session that also has web-search and file-edit tools — call `oe_run` from a Claude Code tool use block to delegate structured work to a pre-defined OE flow.
- **Programmatic integration:** Skip the MCP server and call the OE Node.js API directly from `@openexpertise/core` in your own TypeScript service. See [EventBus API](/reference/api/event-bus).

## See also

- [Guide: MCP server](/guide/mcp-server)
- [Guide: cli-agent node](/guide/cli-agent-usage)
- [Reference: API overview](/reference/api/)
- [Example: tri-cli-orchestration](/examples/tri-cli-orchestration)
