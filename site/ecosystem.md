---
title: Ecosystem fit
description: How OpenExpertise relates to MCP, Anthropic SKILL.md packages, Anthropic /workflows, and the constellation of autonomous-agent CLIs.
---

# Where OpenExpertise fits in the ecosystem

OpenExpertise (OE) lives **above** the agent layer and **alongside** the protocol layer. It is not a competitor to MCP, Skills, Workflows, or autonomous agents — it is the **workflow orchestrator** that composes them.

This page explains the relationships honestly: what each piece is, what OE adds, and which integrations exist today vs roadmap.

## The picture

```
                ┌────────────────────────────────────────┐
                │      OpenExpertise (workflow graph)     │
                │   schema · state · scheduler · evolve   │
                └──────────────────┬─────────────────────┘
                                   │ composes ↓
        ┌──────────────────────────┼──────────────────────────┐
        ▼                          ▼                          ▼
  ┌──────────┐              ┌──────────┐         ┌────────────────────────┐
  │   MCP    │              │  Skills  │         │  Autonomous agents     │
  │ (protocol)│             │ (SKILL.md)│        │  (executors)           │
  │          │              │          │         │                        │
  │ tools +  │              │ reusable │         │ Claude Code, Codex,    │
  │ data bus │              │ LLM units │        │ Gemini CLI             │
  │          │              │          │         │ + OSS constellation    │
  └──────────┘              └──────────┘         └────────────────────────┘

         ▲                       ▲                          ▲
         └───────────────────────┼──────────────────────────┘
                                 │
        OE consumes each of them as graph nodes (dataset / skill / cli-agent).
        It ALSO exposes itself as MCP via `oe-mcp` — every agent can call
        an OpenExpertise experience from inside its own session.
```

OE is **not** a protocol (that is MCP). **Not** a reusable LLM unit (that is a Skill). **Not** an autonomous agent (that is Claude Code / Codex / Gemini / OpenHands / …). It is the orchestration layer that ties them together into a reproducible, persistent, self-improving workflow.

---

## OpenExpertise + MCP

**MCP** (the Model Context Protocol) is a wire protocol for exposing tools, data resources, and prompts to LLM clients. It is to LLM apps what HTTP is to the web — a transport layer, not a workflow shape.

OpenExpertise speaks **both sides** of MCP.

### Outbound — OE consumes MCP

A `dataset` node with `source.type: mcp-resource` reads from any MCP server:

```yaml
nodes:
  - id: load_runbooks
    kind: dataset
    source:
      type: mcp-resource
      server: 'runbooks-server'
      uri: 'runbooks://incident-response/payments'
    writes: [runbooks]
```

::: warning V0.1.0
The schema declares `mcp-resource` and `oe validate` passes — but the dispatcher is not yet wired. Using this source today will throw at runtime. Full wiring is planned for a later 0.x release. The bidirectional MCP story is real, but in V0.1.0 the inbound side is what works end-to-end.
:::

### Inbound — OE exposes MCP

The `@openexpertise/mcp-server` package ships a binary `oe-mcp` (a stdio MCP server) with seven tools:

| Tool              | Purpose                                                                |
| ----------------- | ---------------------------------------------------------------------- |
| `oe_validate`     | Validate an `experience.yaml`                                          |
| `oe_state`        | Read a field (or the snapshot) from a run's persistent state           |
| `oe_inspect`      | Reconstruct an event-ordered trace of a prior run                      |
| `oe_run`          | Execute an experience and return its `run_id`, status, and final state |
| `oe_evolve`       | Generate evolution proposals for a prior run                           |
| `oe_ultra`        | LLM-author a new experience from a natural-language task description   |
| `oe_ultra_revise` | Apply natural-language feedback to an existing draft                   |

Any MCP-aware client can register `oe-mcp` and call these tools. For instance, in a Claude Code session:

```jsonc
// .claude/mcp.json
{
  "openexpertise": {
    "command": "oe-mcp",
  },
}
```

After that, Claude Code (or Codex, or Gemini, or any MCP client) can do `Use oe_run on examples/review-branch` and the workflow graph executes, returning the final state into the conversation. The agent still drives the session — OE provides durable, replayable, evolvable workflows as **tools** that the agent can call.

**Why this matters:** with MCP, the workflow layer is no longer a closed box. Your Codex session can run an OpenExpertise flow whose middle step calls Claude Code, whose state survives the session and feeds the next day's run. The pieces talk.

---

## OpenExpertise + Skills (Anthropic SKILL.md)

[Anthropic skills](https://github.com/anthropics/skills) are packaged LLM capabilities: a `SKILL.md` system prompt plus an optional `scripts/`, `references/`, and `assets/` directory. They are reusable across sessions and across projects.

OpenExpertise has a `skill` node kind: a skill **runs as a step in a workflow graph**. The `SKILL.md` becomes the system prompt, declared `reads:` fields become the user message bundle, and the LLM's structured output flows back into state.

```yaml
nodes:
  - id: investigate
    kind: skill
    impl: ./skills/incident-triage # directory containing SKILL.md
    reads: [pagerduty_alert]
    writes: [diagnosis]
```

### Skills translated into OpenExpertise flows

Three of the 12 bundled examples are direct translations of Anthropic skills into YAML workflows:

| Anthropic skill        | OpenExpertise example                                                                                              | What the workflow adds                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `systematic-debugging` | [`examples/systematic-debugging`](/examples/systematic-debugging)                                                  | Persistent hypothesis log + per-cluster verification (fan-out) + replay + evolve the hypothesis prompt over time                    |
| `brainstorming`        | [`examples/brainstorming`](/examples/brainstorming)                                                                | 3-angle divergent ideation + cluster + critique + synthesized picks — all reproducible across runs                                  |
| `experience-creator`   | [`@openexpertise/skill-experience-creator`](https://www.npmjs.com/package/@openexpertise/skill-experience-creator) | Itself a Skill. Teaches an LLM to author OE flows. Used by `oe ultra` to scaffold an experience from a natural-language description |

### The general pattern

A Skill defines **what one LLM call does**. OpenExpertise arranges Skills (plus tools, agents, datasets, CLI agents) into a flow whose output is:

- **Durable** — every node's writes land in SQLite; `oe state diagnosis` works hours after the run finished.
- **Replayable** — full JSONL event log via `oe inspect <run-id>`.
- **Evolvable** — `oe evolve <run-id>` proposes graph upgrades (including changes to the Skill prompts) as `git apply`-ready diffs.

If you have a Skill you use often, wrapping it in an OpenExpertise flow is a natural next step. The Skill stays portable; the workflow adds state, structure, and evolution.

---

## OpenExpertise vs Anthropic /workflows

Anthropic's `/workflows` (the workflow-creator preview in Claude Code, surfaced in CC v2.1.147+) is the first-party in-CLI option for multi-step procedures. It is the lightest path if you are already inside Claude Code and want a quick procedural sketch.

OpenExpertise occupies a different point in the design space:

|                                                                | `/workflows` (Anthropic)      | OpenExpertise                                          |
| -------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------ |
| Declaration shape                                              | JS code, in-session           | YAML, version-controlled                               |
| Persistence across runs                                        | Ephemeral within a CC session | SQLite blackboard + JSONL event log                    |
| Replay / inspect a past run                                    | —                             | `oe inspect <run-id>`                                  |
| Resume from a cached step                                      | —                             | `oe resume <run-id>`                                   |
| Self-improvement loop                                          | —                             | `oe evolve <run-id>` writes a git-apply-ready proposal |
| Multi-vendor LLM in one flow                                   | Anthropic-only                | Anthropic + OpenAI + any OpenAI-compatible self-hosted |
| Multi-CLI orchestration (Claude + Codex + Gemini in one graph) | —                             | Native — `cli-agent` provider per step                 |
| One-keyword authoring                                          | ✓ (`ultrawork`)               | ✓ (`oe ultra`)                                         |
| Inside Claude Code's UI                                        | ✓                             | — (CLI + TUI + MCP server)                             |

**Different tradeoffs for different jobs:**

- `/workflows` is the right pick if you want a quick multi-step thing inside one Claude Code session and you do not need it to survive the session.
- OpenExpertise is the right pick if you are codifying your team's repeatable SOPs — the same code review on every PR, the same incident triage every page, the same release gate every Friday — and want them version-controlled, persistent, and improving over quarters.

The two co-exist. You can also run an OpenExpertise experience from inside a Claude Code session via `oe-mcp` (above), which means even if you live in Claude Code, you can still reach for OE when you need durability.

---

## OpenExpertise + autonomous agents (Claude Code, Codex, Gemini CLI, and the OSS constellation)

The "autonomous agent" category is a moving target. Today's well-known agentic CLIs:

| Agent           | Vendor    | Role in OpenExpertise V0.1.0                                       |
| --------------- | --------- | ------------------------------------------------------------------ |
| **Claude Code** | Anthropic | `cli-agent` provider `claude-code` — production, smoke-tested live |
| **Codex CLI**   | OpenAI    | `cli-agent` provider `codex` — production, smoke-tested live       |
| **Gemini CLI**  | Google    | `cli-agent` provider `gemini` — production, smoke-tested live      |

And the open-source constellation, growing every month:

| Project          | Note                                           |
| ---------------- | ---------------------------------------------- |
| **OpenHands**    | The former OpenDevin — autonomous coding agent |
| **AutoGen**      | Microsoft's multi-agent conversation framework |
| **CrewAI**       | Role-based agent orchestrator                  |
| **OpenClaw**     | Open-source agent framework                    |
| **Hermes Agent** | Open-source agent runtime                      |
| **OpenHuman**    | Open-source human-in-the-loop agent project    |
| (+ many more)    | New OSS launches monthly                       |

### What OE does with them today

OE wraps an autonomous-agent CLI as a single graph step via the `cli-agent` node kind. The dispatcher pattern is:

1. Spawn the agent's CLI as a subprocess (`claude -p`, `codex exec`, `gemini --prompt`, …).
2. Stream stdout into the run's event log.
3. Capture the final output (text or JSON).
4. Validate JSON against an AJV schema if `output_format: json`.
5. Write fields into state per the node's `writes:` list.

The interface is provider-agnostic — every CLI agent that takes a prompt and emits text/JSON fits this shape.

### What OE will do — roadmap

Adding new providers (`openhands`, `autogen`, `crewai`, `openclaw`, `hermes`, `openhuman`, …) is **not** a re-architecture. It is one adapter per provider: spawn the right command, normalize the output format, surface provider-specific knobs. The same `cli-agent` node kind will accept the new `provider:` value.

Tentative timeline:

- **0.1.x** — Current: `claude-code`, `codex`, `gemini`.
- **0.2.x** — Add OSS providers based on community demand. Open an issue with the project's repo URL + a smoke command and we will scope an adapter.
- **0.3.x+** — Beyond CLI subprocess: explore native HTTP/MCP-based provider adapters so OE can call agents that do not ship as a CLI.

### Bidirectional enhancement — the part that compounds

Each agent can also call **OpenExpertise back**, via `oe-mcp` (the MCP server) or simply by shelling out to `oe run <experience>`. This is what makes the ecosystem composable instead of layered.

Concrete examples of bidirectional flows:

```
Claude Code session             OpenExpertise flow
  │                                │
  │ "Run my team's PR review SOP"  │
  ├──── oe_run examples/review ────▶│
  │                                │ tool: load_diff
  │                                │ agent: bugs reviewer
  │                                │ cli-agent: gemini security audit
  │                                │ agent: score + verdict
  │                                │
  │◀─── final state ───────────────┤
  │ findings: [...]                │
  │ risk_score: 0.85               │
  │ run_id: a1b2c3                  │
  │                                │
  │ continues conversation         │
```

Or:

```
OpenExpertise flow              Codex CLI agent
  │                                │
  │ cli-agent node                 │
  ├──── spawn codex exec ──────────▶│
  │                                │ improvises across the code
  │                                │ proposes a refactor
  │◀─── stdout JSON ───────────────┤
  │ writes: [refactor_proposal]    │
```

Or both at once — a Claude Code session calls `oe_run`, which calls `cli-agent: codex`, which produces output that flows back into OE state, which flows back into the Claude Code conversation. Each layer remembers what it did. Each layer is replayable. The graph improves itself over time.

**The two categories are complementary, not competitive.** Agents execute. OpenExpertise orchestrates, persists, and evolves.

---

## Summary cheatsheet

| Adjacent thing                                                              | What it is                               | What OE does with it                                                                                                   |
| --------------------------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **MCP**                                                                     | Wire protocol for tools + data + prompts | Consumes (dataset/mcp-resource, planned) + exposes (`oe-mcp` ships now)                                                |
| **Skills (SKILL.md)**                                                       | Reusable LLM-capability packages         | `skill` node kind runs them as graph steps; 3 bundled examples ARE translations                                        |
| **`/workflows`**                                                            | Anthropic's in-CLI workflow declarations | Different tradeoffs — see comparison table above                                                                       |
| **Claude Code / Codex / Gemini CLI**                                        | Commercial autonomous-agent CLIs         | `cli-agent` providers — 3 ship today, smoke-tested live                                                                |
| **OSS agents** (OpenHands, AutoGen, CrewAI, OpenClaw, Hermes, OpenHuman, …) | OSS autonomous-agent frameworks          | `cli-agent` provider adapters on the 0.2.x roadmap. Bidirectional via MCP today (call OE) and roadmap (OE calls them). |

If you are deciding whether to use OpenExpertise, the question is not "do I use this OR MCP / OR a Skill / OR Claude Code". The question is "do I want my multi-step process to be durable, replayable, evolvable, and team-shared". If yes — OE composes with everything else you already use.

## See also

- [`/compare`](/compare/) — comparison vs LangGraph, CrewAI, Mastra, Inngest, /workflows, Claude Code
- [`/concepts/dispatchers`](/concepts/dispatchers) — how the 6 node kinds get dispatched
- [`/guide/mcp-server`](/guide/mcp-server) — running `oe-mcp` and registering it in MCP clients
- [`docs/registry.md`](https://github.com/xingchengxu/OpenExpertise/blob/main/docs/registry.md) — sharing your own experiences across the ecosystem
