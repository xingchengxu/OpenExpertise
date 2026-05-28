---
title: MCP resource as a dataset source
description: 'Read from an MCP server as a dataset node source: mcp.json config, row normalization, and error handling.'
---

# MCP resource as a dataset source

## When to use this

- **Existing MCP servers you already have.** If you maintain a team runbook server, a docs server, or any other MCP-compatible server, wiring it as a `dataset` source lets your flow reuse it without wrapping it in a custom tool.
- **MCP beats HTTP dataset** when the content lives behind a server that already speaks the MCP `resources/read` protocol — you avoid a round-trip auth layer and get URI-addressed access for free.
- **MCP beats a custom tool** when you want to keep the data-access logic in a language- or framework-agnostic server that other clients (Claude Code, Cursor) can also connect to.

## Setup: `mcp.json`

Create `mcp.json` next to `experience.yaml`. The shape is identical to Claude Desktop and Cursor — if you already have an `mcp.json` for those tools you can copy it here unchanged.

```json
{
  "servers": {
    "runbooks": {
      "command": "node",
      "args": ["./mcp-servers/runbooks.mjs"],
      "env": { "RUNBOOKS_DIR": "./data" }
    },
    "company-docs": {
      "command": "uvx",
      "args": ["@example/mcp-company-docs"]
    }
  }
}
```

The top-level keys (`runbooks`, `company-docs`) are the server names referenced by dataset nodes. `command` + `args` is the stdio spawn command; `env` is merged into the child process environment.

## The dataset node

Reference a server by name and provide an MCP resource URI:

```yaml
nodes:
  - id: load_runbooks
    kind: dataset
    source:
      type: mcp-resource
      server: 'runbooks'
      uri: 'runbooks://incident-response/payments'
    writes: [runbooks]
```

`server` must match a key in `mcp.json`. `uri` is passed verbatim to the server's `resources/read` RPC. The `runbooks` state field will contain the normalized rows (see below).

## How rows are normalized

The dispatcher converts whatever the server returns into a uniform array of objects:

| Server response | Rows written to state                           |
| --------------- | ----------------------------------------------- |
| JSON array      | Spread as-is — each element becomes one row     |
| JSON object     | Wrapped in a 1-element array: `[{ ...object }]` |
| Plain text      | `[{ text: "<the text>" }]`                      |
| Blob (base64)   | `[{ blob: "<base64>", mimeType: "<type>" }]`    |

Downstream nodes receive a consistent array regardless of server response format. An `agent` node reading `runbooks` can always iterate over `$.runbooks` as an array.

## When the server fails

The dispatcher emits one of five error messages. Each appears in the event log (`oe inspect`) and causes the node to enter the `failed` state unless the node declares `on_error`:

- **`mcp.json not found`** — no `mcp.json` exists next to `experience.yaml`. Fix: create the file at the experience root.
- **`unknown server "<name>"`** — the `server:` value in the dataset node does not match any key in `mcp.json`. Fix: check spelling; keys are case-sensitive.
- **`spawn failure: <details>`** — the `command` could not be launched (not on PATH, permission denied, missing runtime). Fix: verify the command runs outside OE; check `env` entries.
- **`init failure: <details>`** — the server process started but did not complete the MCP initialization handshake. Fix: inspect the server's stderr output with `DEBUG=oe:mcp oe run`.
- **`read failure: <uri> — <details>`** — the server responded to init but returned an error for the specific `resources/read` call. Fix: confirm the URI is valid for that server; check server logs.

## Variations

- **Multiple MCP servers in one flow.** Declare both in `mcp.json` and add a separate `kind: dataset` node for each server. The runtime spawns each server process once and reuses the connection for all dataset nodes that reference it within the same run.
- **Paginated resources.** MCP servers that return paginated resources currently require one `dataset` node per URI. Full pagination support (cursor-based iteration) is on the post-0.2 roadmap.
- **HTTP transport.** Stdio is the only supported transport in 0.1.x. HTTP transport for remote MCP servers is planned for 0.2.x.

## Limits in 0.1.x

Be aware of the following constraints in the current release:

- **Stdio only.** There is no HTTP or WebSocket MCP transport. The `command` field is required; there is no `url` field yet.
- **No streaming resources.** The `resources/read` call is a single request-response. MCP streaming resource subscriptions are not supported.
- **One URI per node.** Each `kind: dataset` node reads one URI. To read multiple URIs from the same server, add multiple dataset nodes.

## See also

- [YAML schema: source.type mcp-resource](/reference/schema#sourcetype-mcp-resource)
- [Ecosystem: OE + MCP](/ecosystem)
- [MCP specification](https://modelcontextprotocol.io)
- [Guide: Your first experience](/guide/first-experience) — a different shape but uses dataset nodes
