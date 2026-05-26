# OpenExpertise vs Anthropic /workflows

OpenExpertise is a stable, open-source orchestration layer you can use today; Anthropic `/workflows` is an unreleased preview feature baking the same "code-as-law" idea directly into Claude Code.

## What /workflows is

Anthropic's `/workflows` is an unreleased feature surfaced in Claude Code v2.1.147–v2.1.148 and in a community preview repository (`ray-amjad/claude-code-workflow-creator`). It is not officially documented. Activation requires setting the environment variable `CLAUDE_CODE_WORKFLOWS=1` and typing the keyword `ultrawork` inside a Claude Code session.

When triggered, Claude Code acts as an "architect agent": it generates a context analysis file, then writes a JavaScript control script (~300 lines for a real-world PR review) on the fly. That JS script is the workflow — a deterministic Node.js program that calls agent sub-processes inside its own loops. The model only runs inside explicitly defined `agent()` nodes; the outer control flow is pure code. This is the same "Code as Law" insight that OpenExpertise is built on.

The `/workflows` TUI is notably polished for a preview feature: a htop-style interactive dashboard shows each agent's status, elapsed time, live token count, and active MCP tool call. Generated scripts default to a 3-day ephemeral lifetime and must be explicitly promoted to a permanent path by the user. Anthropic's framing: LLM-generated scripts are "temporary assets" — test them, then promote.

## Where they overlap

- **Code-as-law philosophy** — deterministic outer control flow, LLM confined to discrete nodes.
- **One-keyword authoring** — `/workflows` uses `ultrawork`; OpenExpertise uses `oe ultra` or `/ultraexpertise` inside Claude Code.
- **TUI observability** — both show real-time per-node status, token consumption, and active tool calls.
- **Multi-agent fan-out** — both can spawn parallel agent sub-processes within a single run.
- **Claude Code as the underlying substrate** — `/workflows` lives inside Claude Code; OpenExpertise can call Claude Code as a `cli-agent` node.

## Where OpenExpertise differs

| Dimension | OpenExpertise | Anthropic /workflows |
|---|---|---|
| Format | Declarative YAML — human-readable, diff-able, version-controlled | JS script generated per-run; not inherently VCS-friendly |
| Schema validation | `oe validate` checks AJV schema before any code runs | No pre-run validation; errors surface at runtime |
| Persistent state | SQLite blackboard, resumable via `oe resume <run-id>` | Ephemeral by default; 3-day TTL unless manually promoted |
| Self-evolution | `oe evolve` reads event log + state diff, proposes YAML patches | Not present |
| Multi-CLI | Calls Claude Code, OpenAI Codex, and Gemini CLI as node kinds | Anthropic-only |
| Multiple LLM providers | Anthropic + OpenAI + any OpenAI-compatible endpoint | Anthropic only |
| Availability | Stable, open-source, npm-installable today | Unreleased preview; no public ETA |
| Authoring artifact | A YAML file you own and evolve over time | LLM-generated JS script; may or may not survive 3 days |
| MCP server | Exposes 6 OE tools so Claude Code can orchestrate OE | Runs inside Claude Code; not callable externally |

## When to pick /workflows over OpenExpertise

- Your entire workflow lives inside Claude Code and you want zero context-switch to an external tool.
- You want to stay on native Anthropic tooling and prefer generated JS over hand-authored YAML.
- The Anthropic team ships `/workflows` GA with durability, versioning, and multi-provider support — at that point it may cover most of OE's surface for Claude Code users.

## When to pick OpenExpertise over /workflows

- You need it today, with stability guarantees.
- You need multi-provider support (OpenAI, Gemini, vLLM, Ollama).
- Your SOP must survive across months, be version-controlled in git, and be reviewed by non-engineers.
- You need the evolution loop: run → observe → propose upgrade → apply.
- You want to call the orchestrator from outside Claude Code (via MCP server, programmatic API, or CI/CD).

## Specific positioning

Both projects share the same core conviction — code controls flow, LLMs execute within nodes — but they serve different integration points. `/workflows` is Anthropic's first-party answer for Claude Code power users; OpenExpertise is the open-source answer for teams that need a stable, provider-agnostic, self-improving SOP runtime they can own.
