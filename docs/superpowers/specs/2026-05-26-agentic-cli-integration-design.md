# Agentic CLI Integration — Design Spec

Date: 2026-05-26
Status: Approved (post-brainstorm via AskUserQuestion)
Position: Post-V1+polish — first true V2 differentiator.

## Why this exists

Today OpenExpertise integrates with LLMs at the raw SDK layer (`@anthropic-ai/sdk`, `openai`). That gets us structured tool calls but throws away the most powerful thing about modern Claude / GPT / Gemini deployments: their **agentic CLIs** — `claude` (Claude Code), `codex` (OpenAI Codex), `gemini` (Gemini CLI) — each of which ships with a file-system tool ecosystem, a skill/plugin system, and MCP support.

This spec adds two-way integration:

- **Outbound:** a new `cli-agent` node kind so an experience can delegate a step to one of these CLIs. The CLI does its own tool use; OpenExpertise only sees the final structured output.
- **Inbound:** an MCP server (`@openexpertise/mcp-server`) so any of those CLIs can invoke OpenExpertise as a tool. Run an experience from inside Claude Code, query the blackboard from inside Codex, etc.

The story: **OpenExpertise is the orchestration engine for multi-CLI agentic workflows, and is itself a tool any agentic CLI can call.** No competitor (LangGraph, CrewAI, Mastra, Inngest) does either direction.

## Goals

1. New node kind `cli-agent` with provider `claude-code | codex | gemini`. Stateless (one CLI subprocess per node run). Supports prompt templating from state, JSON or text output, schema validation, timeouts, on_error.
2. New package `@openexpertise/mcp-server` exposing 5 tools (`oe_run`, `oe_validate`, `oe_state`, `oe_inspect`, `oe_evolve`) over MCP. Installable in any MCP client via standard `claude mcp add` / equivalent.
3. Tests using a subprocess mock for the cli-agent path; tests using an in-process MCP harness for the server.
4. Example or polish: at minimum, a sample `cli-agent`-driven experience demonstrating the new node kind.
5. Updated docs: README mentions both directions; new `docs/cli-agent.md` and `docs/mcp-server.md`.

## Non-goals (named to avoid scope creep)

- **Session-mode** CLI invocation (long-running subprocess fed multiple prompts). Stateless only for V1. Session is V2 if demand emerges.
- **Concurrent** CLI invocations within one node. Each node runs one subprocess; existing `for_each` provides fan-out but stays sequential per the V1 scheduler.
- **Streaming** CLI output. We wait for the subprocess to finish, then parse stdout.
- **Wrapping each CLI as an LLMClient** for the existing `agent` kind. The `agent` kind stays SDK-only. The `cli-agent` kind is its own thing.
- **Apply-proposal automation** from MCP (`oe_evolve --apply`).
- **Authentication for the MCP server.** It's stdio-only, runs in the user's CLI; no network surface.
- **Per-CLI provider packages.** All three providers ship in one `node-kinds-cli-agent` package; per-CLI plugin packages are not needed at this scale.
- **CLI version compatibility shims.** We pin the invocation conventions we know work; if a CLI release breaks them, we fix forward.

## Outbound: `cli-agent` node kind

### Package: `@openexpertise/node-kinds-cli-agent`

```
packages/node-kinds-cli-agent/
├── package.json                   # deps: @openexpertise/core, @openexpertise/schema
├── tsconfig.json
├── src/
│   ├── index.ts                   # exports CliAgentDispatcher + types
│   ├── dispatcher.ts              # CliAgentDispatcher (NodeDispatcher)
│   ├── runner.ts                  # spawn subprocess; capture stdout; respect timeout; injectable spawn for tests
│   ├── parse.ts                   # JSON vs text output parsing + AJV schema validation
│   └── providers/
│       ├── index.ts               # provider registry
│       ├── types.ts               # CliAgentProvider interface
│       ├── claude-code.ts         # ClaudeCodeProvider
│       ├── codex.ts               # CodexProvider
│       └── gemini.ts              # GeminiProvider
└── tests/
    ├── runner.test.ts             # subprocess mock + timeout behavior
    ├── claude-code.test.ts        # command construction + output parsing
    ├── codex.test.ts
    ├── gemini.test.ts
    └── dispatcher.test.ts         # end-to-end with mocked spawn
```

### YAML schema additions

New `cli-agent` variant in the `node` oneOf in `experience.schema.json`:

```json
{
  "allOf": [
    { "$ref": "#/$defs/nodeBase" },
    {
      "type": "object",
      "required": ["provider", "prompt"],
      "properties": {
        "kind": { "const": "cli-agent" },
        "provider": { "enum": ["claude-code", "codex", "gemini"] },
        "prompt": { "type": "string" },
        "model": { "type": "string" },
        "workdir": { "type": "string" },
        "output_format": { "enum": ["text", "json"] },
        "schema": {},
        "timeout_ms": { "type": "integer", "minimum": 1000 },
        "extra_args": { "type": "array", "items": { "type": "string" } }
      }
    }
  ]
}
```

`@openexpertise/schema` also gets a `CliAgentNodeSpec` TypeScript type mirroring this. Added to the `NodeSpec` union.

Example YAML usage:

```yaml
- id: security_review
  kind: cli-agent
  provider: claude-code
  workdir: ./checkout
  prompt: |
    Review the diff in $diff.txt for security issues.
    Return structured JSON: {"findings": [{"title": "...", "severity": "..."}]}
  output_format: json
  schema:
    type: object
    required: [findings]
    properties:
      findings: { type: array }
  reads: [diff]
  writes: [findings]
  timeout_ms: 300000
```

### Dispatcher contract

`CliAgentDispatcher implements NodeDispatcher`:

- `kind = 'cli-agent'`
- `resolve(node, ctx)` — selects the provider implementation; substitutes `{{state}}` / `{{$item}}` / `{{args}}` in `prompt` using the existing resolver from `@openexpertise/core`
- `run(impl, bundle, ctx)`:
  1. Look up provider by `node.provider`.
  2. Provider builds `{ cmd, args, env }` from the resolved prompt + node config.
  3. Runner spawns the subprocess in `workdir` (default: experience dir), passes the prompt either on argv or via stdin depending on provider, captures stdout/stderr, enforces `timeout_ms` (default 600_000).
  4. Parser handles `output_format`:
     - `'text'` (default): result is `{ [firstWriteField]: stdout }` — first entry in `writes:` gets the raw text; if no writes, returns `{}`.
     - `'json'`: `JSON.parse(stdout)`. If `schema` is provided, validate with AJV; on failure, throw to trigger on_error.
  5. Return `{ state_delta }` or apply on_error policy on subprocess failure.

### Provider implementations

Each provider exports:

```ts
interface CliAgentProvider {
  name: 'claude-code' | 'codex' | 'gemini'
  buildCommand(opts: BuildCommandOpts): SpawnSpec
}

interface BuildCommandOpts {
  prompt: string
  model?: string
  workdir: string
  extra_args?: string[]
}

interface SpawnSpec {
  cmd: string
  args: string[]
  env?: Record<string, string>
  stdin?: string         // if set, pipe prompt to stdin; else prompt is on argv
}
```

**ClaudeCodeProvider:**
- `cmd = 'claude'`, args `['-p', prompt, '--output-format', outputFormat === 'json' ? 'json' : 'text']`
- Honors `model` via `--model <id>` if set
- `extra_args` appended

**CodexProvider:**
- `cmd = 'codex'`, args `['exec', '--quiet', prompt]`
- Honors `model` via `--model <id>` if set
- `extra_args` appended

**GeminiProvider:**
- `cmd = 'gemini'`, args `['--prompt', prompt]`
- Honors `model` via `--model <id>` if set
- `extra_args` appended

Exact CLI flags will be confirmed in plan implementation by reading the installed `--help` output during dev. If any provider lacks a non-interactive flag, fall back to stdin piping.

### Subprocess runner

A small, testable wrapper around `node:child_process.spawn`:

```ts
interface SubprocessRunner {
  run(spec: SpawnSpec, opts: { timeoutMs: number; cwd: string }): Promise<{ stdout: string; stderr: string; exitCode: number; timedOut: boolean }>
}
```

Default impl uses `spawn` and accumulates output. The dispatcher takes the runner via DI so tests inject a `FakeRunner` returning scripted output. Mirrors the AnthropicLLMClient/OpenAILLMClient pattern.

Timeout: if exceeded, send `SIGTERM`, wait 2s, then `SIGKILL`. Set `timedOut: true`. The dispatcher converts this to a thrown error → on_error policy applies.

### CLI integration

`packages/cli/src/commands/run.ts` registers the new dispatcher with no extra config — it doesn't need an LLMClient. It does need a `SubprocessRunner`; default is the real `spawn`-based one.

### Testing

- `runner.test.ts`: real subprocess with `node -e "process.stdout.write('hello'); process.exit(0)"` proves spawn → stdout capture works; another test forces timeout
- per-provider tests: assert command + args construction
- `dispatcher.test.ts`: scripted runner returns canned stdout; dispatcher returns expected state_delta; validate schema-validation failure path

No live CLI invocation in CI (we don't depend on `claude` / `codex` / `gemini` being installed).

## Inbound: `@openexpertise/mcp-server`

### Package

```
packages/mcp-server/
├── package.json                   # deps: @openexpertise/cli (or directly the command modules), @modelcontextprotocol/sdk
├── tsconfig.json
├── src/
│   ├── index.ts                   # MCP server entry; tool registration
│   ├── bin.ts                     # CLI binary entrypoint (#!/usr/bin/env node)
│   └── tools/
│       ├── run.ts                 # oe_run handler
│       ├── validate.ts            # oe_validate handler
│       ├── state.ts               # oe_state handler
│       ├── inspect.ts             # oe_inspect handler
│       └── evolve.ts              # oe_evolve handler
└── tests/
    └── server.test.ts             # in-process MCP harness round-trips each tool
```

`package.json` declares `bin: { "oe-mcp": "./dist/bin.js" }`.

### Tools exposed

All input/output schemas are JSON Schema, returned via `listTools`.

| Tool | Input | Output |
|---|---|---|
| `oe_run` | `{ experience_path: string, args?: object, evolve?: boolean }` | `{ run_id, status, final_state, error? }` |
| `oe_validate` | `{ experience_path: string }` | `{ valid: boolean, errors?: string[] }` |
| `oe_state` | `{ experience_path: string, field?: string }` | `{ field?: string, value: unknown }` or `{ fields: Record<string, unknown> }` |
| `oe_inspect` | `{ experience_path: string, run_id: string }` | `{ events: unknown[] }` (parsed JSONL) |
| `oe_evolve` | `{ experience_path: string, run_id: string }` | `{ proposal_md: string, proposal_count: number }` |

Each handler is a thin wrapper around the existing CLI command logic — we refactor `runCommand`/`validateCommand`/etc to return values rather than only logging, so the MCP server can consume them directly without reparsing log output.

Refactor scope (minimal):
- `runCommand` already returns exit code; refactor to also return the final state object (or extract a `runExperienceFromPath()` helper that does the work and returns it).
- Other commands similar.

### Binary

`oe-mcp` is the binary. Starts a stdio MCP server on stdin/stdout per MCP convention.

Installation in any of the three CLIs:

```bash
# Claude Code
claude mcp add openexpertise -- npx -y @openexpertise/mcp-server

# Codex (assumed mcp_servers section in ~/.codex/config.toml)
# [mcp_servers.openexpertise]
# command = "npx"
# args = ["-y", "@openexpertise/mcp-server"]

# Gemini CLI (assumed --mcp flag or settings)
gemini --mcp openexpertise=npx:@openexpertise/mcp-server
```

Exact registration syntax confirmed during plan implementation.

### Testing

The MCP server is testable via the SDK's in-process server-client pair:
- Spawn the server in-process
- Connect a client
- Call each tool with a sample input
- Assert returned shape

No file I/O outside a tmp dir. Each test creates a tmp experience and asserts the tool returns expected structure.

## Implementation order

Two separate plans, one per direction. Outbound first (it's the bigger differentiator + the user has all three CLIs installed locally).

**Plan A: cli-agent** (8-10 tasks)
- Scaffold package
- Subprocess runner + tests
- Schema additions for cli-agent node kind
- CliAgentProvider interface + claude-code provider
- Codex + Gemini providers (parallel)
- Dispatcher + tests
- CLI registration
- Sample experience (`examples/cli-orchestration/` — security review delegated to Claude Code, performance review delegated to Codex; or pick one CLI for V1 simplicity)
- e2e with scripted runner
- Docs: `docs/cli-agent.md`

**Plan B: MCP server** (6-8 tasks)
- Scaffold package
- Refactor command modules to return values (minimal touch)
- Server skeleton with `@modelcontextprotocol/sdk`
- Implement 5 tool handlers (one task each or batched into 2-3 tasks)
- Bin script
- In-process round-trip tests
- Install instructions per CLI in `docs/mcp-server.md`
- README mention

After both plans land:
- Bump root README "Why OpenExpertise" with a bullet on each
- Record a second hero GIF showing a Claude Code session calling `oe_run` via MCP

## Risks

1. **CLI flag conventions change.** All three CLIs are pre-1.0; their `--help` shape may evolve. Mitigation: small, focused provider files; if a release breaks us, one file changes.
2. **MCP SDK version churn.** `@modelcontextprotocol/sdk` is still under heavy iteration. Pin a known-good version; bump deliberately.
3. **Cross-CLI prompt-format expectations differ.** Claude Code's `-p` takes a free-form string; Codex's `exec` may expect more structure. We expose `extra_args` and `output_format` to give users escape hatches.
4. **stdin-piped prompts on Windows.** Less reliable than argv. V1 prefers argv; fall back to stdin only if a provider requires it. Document Windows caveat if any provider needs stdin.
5. **MCP server permission model.** Each tool runs anything the CLI invoker could run (it spawns CLI commands, writes to the experience dir's `.openexpertise/`). The server has no separate authz layer. Document that the MCP server should only be enabled in trusted client sessions.

## Success criteria

- After Plan A: `oe validate examples/<new-example>` passes; the e2e test for the new example runs green with mocked subprocesses; manual run with installed `claude`/`codex`/`gemini` produces structured output and state writes.
- After Plan B: `claude mcp add openexpertise -- npx -y @openexpertise/mcp-server` registers; from inside a Claude Code session, calling `oe_run` on a test experience returns final state; same flow works in Codex (assuming MCP config) and Gemini.
- `pnpm test` stays green: existing 119 + ~20 new = ~140.
- `pnpm typecheck && pnpm lint && pnpm format:check` clean.
- Naming: no `llm-` prefix on either new package.
