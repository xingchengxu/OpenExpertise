<p align="center">
  <img src="docs/assets/demo.svg" alt="animated demo: oe doctor → oe registry → oe init → oe run" width="720">
</p>

<div align="center">

# OpenExpertise

### Your team's best workflows — version-controlled, reproducible, self-improving.

[![npm](https://img.shields.io/npm/v/%40openexpertise%2Fcli?label=%40openexpertise%2Fcli&color=cb3837)](https://www.npmjs.com/package/@openexpertise/cli) [![CI](https://github.com/xingchengxu/OpenExpertise/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/xingchengxu/OpenExpertise/actions/workflows/ci.yml) [![docs](https://img.shields.io/badge/docs-xingchengxu.github.io%2FOpenExpertise-3b82f6)](https://xingchengxu.github.io/OpenExpertise/) [![tests](https://img.shields.io/badge/tests-310%20passing-brightgreen)](#) [![packages](https://img.shields.io/badge/packages-15-blueviolet)](#) [![license: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)

[**Install**](#install) · [**60-second demo**](#60-second-demo) · [**Why**](#why-openexpertise) · [**Examples**](#built-in-examples) · [**Compare**](#vs-the-alternatives) · [**Docs site →**](https://xingchengxu.github.io/OpenExpertise/)

</div>

---

## What it is (in one sentence)

**OpenExpertise is the AI-era Makefile: write your team's SOPs as YAML graphs, run them with deterministic flow + LLM-powered nodes, and let the LLM propose graph upgrades after each run.**

```yaml
# examples/review-branch/experience.yaml — 10 lines, real result:
graph:
  nodes:
    - { id: bugs, kind: agent, prompt: 'Find bugs in {{diff}}', writes: [findings] }
    - { id: security, kind: agent, prompt: 'Find injection flaws in {{diff}}', writes: [findings] }
    - { id: score, kind: agent, reads: [findings], writes: [risk_score] }
  edges:
    - { from: bugs, to: score }
    - { from: security, to: score }
```

- **Repeatable** — same DAG every run, JSONL audit log, SQLite state you can query hours later
- **Multi-vendor** — one graph calls Claude Code, Codex, and Gemini; state flows between all three
- **Self-improving** — `oe evolve <run-id>` reads what happened and proposes the next YAML patch

It's NOT an autonomous agent. It's the **orchestration layer** that lets you wire deterministic code, LLM agents, and CLI agents (Claude Code / Codex / Gemini) into reproducible, persistent, self-improving pipelines.

---

## Install

```bash
npm install -g @openexpertise/cli      # the `oe` command — Node 20+
oe doctor                              # verify env (CLI agents, API keys, write perms)
oe init my-first                       # scaffold a minimal no-LLM flow
oe init my-flow --template full-pipeline   # 4 templates: tool-only | agent | cli-agent | full-pipeline
oe registry                            # see 5 curated experiences (need API key to run)
oe demo                                # see pre-recorded runs of bundled examples (zero API key)
oe demo review-branch                  # preview the PR review flow + advisor's evolution proposal
```

> **Don't want to write YAML by hand?** Run `oe ultra "describe your task in one sentence"` and the LLM scaffolds the whole experience — graph, prompts, tool stubs with `// TODO:` markers, and validation. See the [30-min `oe ultra` tutorial](https://xingchengxu.github.io/OpenExpertise/guide/authoring-ultra).

> **New to OpenExpertise?** Walk through the [30-minute "Your first experience" tutorial](https://xingchengxu.github.io/OpenExpertise/guide/first-experience) — by the end you'll have a tested, registry-submittable flow you built yourself.

Pull any public GitHub repo with an `experience.yaml`:

```bash
oe install gh:owner/repo               # latest commit
oe install gh:owner/repo@v1.2.3        # pin to tag/SHA
oe submit --tags x,y                   # submit YOUR experience to the curated registry
```

Want yours discoverable via `oe install <name>`? Run `oe submit` inside your experience directory — opens a pre-filled GitHub issue with the registry entry generated for you.

📖 **Full docs: https://xingchengxu.github.io/OpenExpertise/** — guide, all 12 examples, 10-recipe cookbook, API reference, comparison vs LangGraph/CrewAI/Mastra/Inngest, operations playbook.

---

## 60-second demo

```bash
npm install -g @openexpertise/cli
git clone https://github.com/xingchengxu/OpenExpertise && cd OpenExpertise

export ANTHROPIC_API_KEY=sk-...        # or OPENAI_API_KEY=...
oe run examples/review-branch --tui
```

You'll see three reviewers (`bugs`/`perf`/`tests`) fan out over a Python diff. They find missing null-check + missing test + unclosed cursor — but **miss the SQL injection**.

```
ⓘ run-2026-05-26-a1b2c3 finished
  findings: 3 issues
  risk_score: 0.30
```

Now ask the evolution advisor what's missing:

```bash
oe evolve run-2026-05-26-a1b2c3
# → wrote .openexpertise/evolution/run-2026-05-26-a1b2c3.md
#   proposal: "Add `security` dimension — default reviewers focus on
#              logic/tests; injection bugs need a dedicated reviewer."
```

Apply the one-line YAML patch from the proposal and re-run:

```
ⓘ run-2026-05-26-d4e5f6 finished
  findings: 4 issues (+ SQL injection in /users/<id>)
  risk_score: 0.85
```

**The experience improved itself.** Author → run → evolve, all driven by the same LLM. That's the whole story.

---

## Why OpenExpertise

> **Five reasons it's different from every other AI workflow tool.**

|                                     | What it gets you                                                                                                                                                                                                  |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Code-as-Law**                     | YAML schema validates structure. LLMs only fill the gaps inside nodes — they can't rewrite the graph at runtime. No drift, no surprises.                                                                          |
| **6 node kinds in one graph**       | `tool` (deterministic code) · `agent` (LLM + structured output) · `skill` (SKILL.md packages) · `dataset` (file / SQLite / HTTP) · `experience` (nested) · `cli-agent` (delegate to Claude Code / Codex / Gemini) |
| **Persistent SQLite state**         | Every node's writes land in a typed blackboard. `oe state findings` works hours later. Resume with `oe resume <run-id>` and replay cached steps.                                                                  |
| **Self-improving**                  | `oe evolve <run-id>` reads the events + state diff and proposes graph upgrades as `git apply`-ready diffs. The author → run → evolve loop closes.                                                                 |
| **Two-way agentic-CLI integration** | **Outbound:** delegate a node to Claude Code / Codex / Gemini. **Inbound:** `oe-mcp` exposes 6 OE tools so the same CLIs can run experiences from inside their own sessions.                                      |

---

## vs the alternatives

|                                                        |                      OpenExpertise                       |   LangGraph   |    CrewAI     | `/workflows` (Anthropic) |  Claude Code   |
| ------------------------------------------------------ | :------------------------------------------------------: | :-----------: | :-----------: | :----------------------: | :------------: |
| Declarative YAML graph                                 |                            ✓                             | (Python code) | (Python code) |        (JS code)         |       —        |
| Schema validation of flow                              |                            ✓                             |       —       |       —       |         partial          |       —        |
| Persistent state across runs                           |                            ✓                             |       —       |       —       |            —             |       —        |
| Self-evolution (advisor)                               |                            ✓                             |       —       |       —       |            —             |       —        |
| Calls Claude Code / Codex / Gemini                     |                            ✓                             |       —       |       —       |            —             |    (is one)    |
| Callable AS MCP tool                                   |                            ✓                             |       —       |       —       |            —             | (consumes MCP) |
| 6 heterogeneous node kinds                             |                            ✓                             |  (functions)  | (agents only) |      (agents only)       |       —        |
| Multiple LLM providers                                 | ✓ (Anthropic + OpenAI + any OpenAI-compatible self-host) |       ✓       |       ✓       |       (Anthropic)        |  (Anthropic)   |
| Parallel + 429-aware                                   |                            ✓                             |       ✓       |    partial    |         unknown          |       —        |
| One-keyword authoring (`oe ultra` / `/ultraexpertise`) |                            ✓                             |       —       |       —       |     ✓ (`ultrawork`)      |       —        |

Full write-up: [`docs/comparison.md`](docs/comparison.md).

---

## Where OpenExpertise fits in the ecosystem

```
                    ┌────────────────────────────────────────┐
                    │   OpenExpertise — workflow orchestrator │
                    │   YAML graph · SQLite · scheduler · evolve │
                    └──────────────────┬─────────────────────┘
                                       │ composes
        ┌──────────────────────────────┼──────────────────────────────┐
        ▼                              ▼                              ▼
   ┌──────────┐                  ┌──────────┐              ┌──────────────────────┐
   │   MCP    │                  │  Skills  │              │  Autonomous agents   │
   │ protocol │                  │ SKILL.md │              │  (executors)         │
   │ for tools│                  │ reusable │              │  Claude Code · Codex │
   │ + data   │                  │ LLM units│              │  · Gemini CLI        │
   │          │                  │          │              │  + OSS frameworks    │
   └──────────┘                  └──────────┘              └──────────────────────┘

        ▲                              ▲                              ▲
        └──────────────────────────────┼──────────────────────────────┘
                                       │
                  OE composes all three into one durable, replayable graph.
                  Plus it exposes ITSELF as MCP tools (`oe-mcp`) so any agent
                  can call OpenExpertise from inside its own session.
```

OE is **not** a protocol (that's MCP), **not** a reusable LLM unit (that's a Skill), and **not** an autonomous agent (that's Claude Code / Codex / Gemini / OpenHands / …). It's the workflow layer that orchestrates those pieces.

### vs MCP — protocol bus, OE speaks both sides

MCP is a protocol for exposing tools, data, and prompts to LLMs. OpenExpertise rides on top:

- **Consumes MCP** — a `dataset` node with `source.type: mcp-resource` reads from any MCP server (declared in schema today; dispatcher wiring planned for a later 0.x).
- **Exposes MCP** — [`@openexpertise/mcp-server`](https://www.npmjs.com/package/@openexpertise/mcp-server) (binary `oe-mcp`) ships 6 tools (`oe_run`, `oe_validate`, `oe_state`, `oe_inspect`, `oe_evolve`, `oe_ultra`) so any MCP client — Claude Code, Codex, Gemini, or anything else — can run OpenExpertise experiences from inside its own session.

MCP is the wire format; OE is the workflow on top of the wire, AND offered ON the wire.

### vs Skills (Anthropic SKILL.md packages) — units, OE composes

A Skill is a packaged LLM capability: a `SKILL.md` system prompt + scripts + references + assets. Reusable across sessions, across projects.

OE has a `skill` node kind — runs SKILL.md as a graph step. Three of the bundled examples are direct YAML translations of Anthropic skills:

| Skill                  | Translated to OE                                                               | What it adds                                                                 |
| ---------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `systematic-debugging` | [`examples/systematic-debugging`](examples/systematic-debugging)               | Persistent hypothesis log + replay + auto-evolve the hypothesis prompt       |
| `brainstorming`        | [`examples/brainstorming`](examples/brainstorming)                             | 3-angle fan-out + per-cluster critique + synthesizable picks across sessions |
| `experience-creator`   | [`@openexpertise/skill-experience-creator`](packages/skill-experience-creator) | Itself a Skill — teaches an LLM how to author OE flows. Used by `oe ultra`.  |

Skills define what one LLM call does; OE arranges Skills (plus tools, agents, datasets, CLI agents) into a flow whose output is durable, replayable, and improvable.

### vs Anthropic /workflows — different tradeoffs

Anthropic's `/workflows` (the workflow-creator preview in Claude Code) is the first-party in-CLI option for multi-step procedures. It's the lightest path if you're already inside Claude Code and want a quick procedural sketch.

OE is broader: YAML-declared (vs JS-coded), persistent SQLite state across runs (vs in-session ephemeral), multi-vendor by design (one graph can call Claude Code AND Codex AND Gemini), and **self-improving** (`oe evolve` reads the events + state diff and proposes graph upgrades as `git apply`-ready diffs).

Different shapes for different jobs. Use `/workflows` for "I want to do this once-ish in Claude Code". Use OE for "this is my team's repeatable SOP, I want it version-controlled and getting better every quarter".

### vs autonomous agents — executors, OE wraps and chains them

"Autonomous agent" is a moving category: Claude Code, Codex CLI, Gemini CLI on the commercial side, plus the rapidly-growing OSS constellation — OpenHands, AutoGen, CrewAI agents, OpenClaw, Hermes Agent, OpenHuman, more launching every month.

An agent is "AI bash": improvises each run, opaque trajectory, no shared state across invocations. OpenExpertise is "AI Makefile": same DAG every run, persistent state, replayable.

OE's `cli-agent` node wraps any of these autonomous agents as a single graph step. Today, three providers ship: `claude-code`, `codex`, `gemini`. The same pattern (spawn a subprocess, capture stdout, parse JSON) is what makes the broader OSS constellation viable as future providers — adding `openhands`, `autogen`, `crewai`, `openclaw`, `hermes`, `openhuman` providers is roadmap work, not a re-architecture.

**Bidirectional integration is the point.** Any agent can call OE back via `oe-mcp` (or just `oe run` in their shell). So you can run a Claude Code session that, when it hits "I need the team's SOP for incident triage", calls `oe_run` on `examples/oncall-runbook` — and the result of THAT graph (which itself called Gemini and Codex along the way) flows back into the Claude Code conversation. Each layer remembers, each layer is replayable, and the same graph improves itself over time.

The two categories don't compete. Agents execute. OpenExpertise orchestrates, persists, and evolves.

---

## Verified end-to-end (not just unit-tested)

Every built-in example has been smoke-run against **real APIs** — not just mocks. Three real framework bugs surfaced by the live runs and all three were fixed + regression-tested before this README was written.

| Provider                                                       | Status | Verified path                                                                                                                                                      |
| -------------------------------------------------------------- | :----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Anthropic** (`claude-sonnet-4-6`, `claude-opus-4-7`)         |   ✓    | Default `agent` kind. 429-aware exponential retry.                                                                                                                 |
| **OpenAI** (`gpt-4o-2024-11-20`)                               |   ✓    | `--llm openai`. Same `llm-factory`, same lazy proxy.                                                                                                               |
| **Any OpenAI-compatible endpoint** (vLLM / Ollama / LM Studio) |   ✓    | Smoke-tested live against vLLM-served reasoning model. Set `OPENAI_BASE_URL=...` and go.                                                                           |
| **Claude Code CLI** (`claude -p`)                              |   ✓    | `cli-agent` provider. Lets the graph delegate a step to a Claude Code subprocess.                                                                                  |
| **OpenAI Codex CLI** (`codex exec`)                            |   ✓    | `cli-agent` provider. Same.                                                                                                                                        |
| **Gemini CLI** (`gemini --prompt`)                             |   ✓    | `cli-agent` provider. Live-tested in a 3-CLI chain: Claude summarized → Codex critiqued → **Gemini delivered the final verdict**, state flowing between all three. |

**Smoke-test coverage:** all **9 example experiences** (`hello-tool`, `dataset-aggregate`, `agent-echo`, `oncall-runbook`, `issue-triage`, `review-branch`, `cli-orchestration`, `release-gates`, **`tri-cli-orchestration`**) pass end-to-end with real APIs and real CLIs. The mocked e2e suites are the safety net; the live smokes are the proof.

### One graph, three rival AI coding CLIs talking to each other

No other workflow framework does this today. The hero `cli-agent` demo:

```yaml
# examples/tri-cli-orchestration/experience.yaml (excerpt)
graph:
  nodes:
    - {
        id: summarize,
        kind: cli-agent,
        provider: claude-code,
        prompt: 'Summarize this topic in one sentence: {{topic}}',
        args: { topic: 'In-memory caching for HTTP APIs' },
        writes: [summary],
      }
    - {
        id: critique,
        kind: cli-agent,
        provider: codex,
        prompt: 'What does this summary miss? {{summary}}',
        reads: [summary],
        writes: [critique],
      }
    - {
        id: verdict,
        kind: cli-agent,
        provider: gemini,
        prompt: 'Verdict on production-readiness given: {{summary}} + {{critique}}',
        reads: [summary, critique],
        writes: [verdict],
      }
  edges:
    - { from: summarize, to: critique }
    - { from: critique, to: verdict }
```

Real run (state captured live, 37s wall time):

> **Claude Code →** _"In-memory caching strategies for HTTP APIs store frequently requested response data directly in application memory to reduce latency, lower backend load, and improve throughput, using techniques like time-based expiration, LRU eviction, and cache invalidation on writes."_
>
> **Codex →** _"It misses that in-memory caches are per-process, so horizontally scaled APIs can serve inconsistent or stale data across instances unless you add coordination or use a distributed cache."_
>
> **Gemini →** _"**No**; specify that in-memory caches are per-process, which can lead to data inconsistency across horizontally scaled API instances."_

One DAG, three vendors, shared SQLite state, replayable event log. Run it yourself: [`examples/tri-cli-orchestration/`](examples/tri-cli-orchestration/).

### Self-host your LLM

Because `--llm openai` honors `OPENAI_BASE_URL`, anything that speaks the OpenAI chat-completions API works as a drop-in — vLLM, Ollama, LM Studio, llama.cpp's server, your own internal endpoint. No code change needed in OpenExpertise.

```bash
export OPENAI_API_KEY=anything-the-server-accepts
export OPENAI_BASE_URL=http://your-vllm-host:8000/v1
oe run examples/oncall-runbook --llm openai
```

That same flow handles reasoning-style models that prefix tool-call arguments with `<think>...</think>` blocks (auto-stripped by the client) and Claude Code's JSON envelopes (auto-unwrapped by the cli-agent parser).

---

## Install & first run (under 60 seconds)

```bash
npm install -g @openexpertise/cli
oe doctor                              # verify env
oe init my-first-experience            # scaffold a minimal flow (no API key needed)
cd my-first-experience && oe run .
# → finalState: { greeting: "Hello, OpenExpertise!" }
```

Want one of the bundled flagship flows? `oe registry` lists 5 curated experiences (`oe install deep-research`, `review-branch`, etc.) — those need an API key. Or pull any GitHub repo: `oe install gh:owner/repo`.

Prefer source? Clone + build for hacking on the runtime:

```bash
git clone https://github.com/xingchengxu/OpenExpertise && cd OpenExpertise
pnpm install && pnpm -r build
node packages/cli/dist/bin.js run examples/hello-tool
```

---

## Built-in examples

> Pick the one closest to your use case. Each ships with fixtures and a mocked-LLM e2e test in `e2e/` — no real API key required to validate the structure.

| Example                                                      | What it shows                                                                                                      | Nodes                             |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | --------------------------------- |
| [`hello-tool`](examples/hello-tool/)                         | Smallest possible flow. No LLM.                                                                                    | `tool`                            |
| [`dataset-aggregate`](examples/dataset-aggregate/)           | Load CSV → aggregate.                                                                                              | `dataset` + `tool`                |
| [`agent-echo`](examples/agent-echo/)                         | Single agent with structured output.                                                                               | `agent`                           |
| [`review-branch`](examples/review-branch/) ★                 | The hero demo. Multi-dim review + verifier + score + evolution.                                                    | `tool` + `agent` ×3               |
| [`oncall-runbook`](examples/oncall-runbook/)                 | Investigate an incident across 3 dimensions via `for_each` fan-out.                                                | `tool` + `agent`                  |
| [`issue-triage`](examples/issue-triage/)                     | Classify → search dupes → conditional dedup → route. Shows `when:` edges.                                          | `tool` + `agent`                  |
| [`release-gates`](examples/release-gates/)                   | License + changelog + coverage + Claude-Code security scan → release gate.                                         | `tool` + `cli-agent` + `agent`    |
| [`cli-orchestration`](examples/cli-orchestration/)           | Claude Code summarizes; Codex critiques. Two providers in one flow.                                                | `cli-agent` ×2                    |
| [`tri-cli-orchestration`](examples/tri-cli-orchestration/) ★ | Claude → Codex → Gemini in one DAG. The headline cross-vendor demo.                                                | `cli-agent` ×3                    |
| [`deep-research`](examples/deep-research/)                   | Multi-vendor research: Claude Code WebSearch + Gemini Google Search → cited synthesis.                             | `tool` + `agent` + `cli-agent` ×2 |
| [`systematic-debugging`](examples/systematic-debugging/)     | The superpowers `systematic-debugging` skill as a YAML flow. Hypothesize → verify → fix via Claude Code → re-test. | `tool` ×2 + `agent` + `cli-agent` |
| [`brainstorming`](examples/brainstorming/)                   | The superpowers `brainstorming` skill as a YAML flow. Diverge → cluster → critique → synthesize top 3.             | `tool` + `cli-agent` ×2 + `agent` |

---

## Architecture at a glance

```
                  experience.yaml                 .openexpertise/
                                                  ├─ state.sqlite   (typed blackboard, persistent)
                                                  ├─ runs/<id>.jsonl (event log, replayable)
                                                  ├─ cache/         (per-node memo, resume-able)
                                                  └─ evolution/     (advisor proposals)
                            │
                            ▼
            ┌─────────────────────────────────────┐
            │  Sequential or Parallel Scheduler   │ ◀── --concurrency N
            │  (topological waves, bounded)        │      runtime.concurrency in YAML
            └─────────────────────────────────────┘
                            │
        ┌───────────┬───────┼────────┬───────────────┐
        ▼           ▼       ▼        ▼               ▼
   ┌────────┐ ┌────────┐ ┌─────┐ ┌────────┐  ┌──────────────┐
   │ tool   │ │ agent  │ │skill│ │dataset │  │  cli-agent   │
   │        │ │ (LLM)  │ │     │ │(file/  │  │ (claude-code │
   │        │ │        │ │     │ │sqlite/ │  │  / codex /   │
   │        │ │        │ │     │ │ http)  │  │  gemini)     │
   └────────┘ └────────┘ └─────┘ └────────┘  └──────────────┘
        │           │      │        │               │
        └───────────┴──────┼────────┴───────────────┘
                            ▼
                   state writes + events
                   (merge: array_append | set_once | last_wins)
```

LLM clients (`@openexpertise/node-kinds-agent`, `@openexpertise/llm-openai`) retry on HTTP 429 with exponential backoff. Both wire through the same `llm-factory` used by `oe run`, `oe evolve`, AND `oe ultra` (authoring) — author/run/evolve is one closed loop.

---

## Two ways to author

### 1. Hand-write the YAML (full control)

```yaml
name: my-sop
version: 0.1.0
state:
  schema:
    input: { type: string }
    output: { type: string }
graph:
  nodes:
    - id: do_thing
      kind: tool
      impl: ./tools/do_thing.mjs
      writes: [output]
  edges: []
```

`oe validate` checks it; `oe run` executes it.

### 2. One-keyword authoring (LLM writes the YAML)

```bash
oe ultra "Review pull requests for SOC2 compliance and produce a risk score"
```

Behind the scenes, two LLM passes — **analyze** (decompose into phases + nodes + state schema) then **synthesize** (emit experience.yaml + tool stubs + prompts) — land a validated draft in `.openexpertise/drafts/<slug>/`. Inspect, run, promote with `mv`.

From Claude Code:

```
/ultraexpertise Review pull requests for SOC2 compliance
```

Reference: [`docs/ultraexpertise.md`](docs/ultraexpertise.md).

---

## Use OpenExpertise FROM Claude Code (and Codex, Gemini)

Register the MCP server once:

```bash
claude mcp add openexpertise -- node $PWD/packages/mcp-server/dist/bin.js
```

Then inside any Claude Code session:

> _"Use oe_run on examples/review-branch"_
> _"Use oe_evolve on the last run id"_

Six MCP tools are exposed: `oe_validate`, `oe_state`, `oe_inspect`, `oe_run`, `oe_evolve`, `oe_ultra`. Reference: [`docs/mcp-server.md`](docs/mcp-server.md).

---

## CLI reference

> First time? Run `oe doctor` to verify your environment.

| Command                | Purpose                                                                                   |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| `oe doctor`            | Check environment readiness (Node, pnpm, CLIs, API keys, writable dirs)                   |
| `oe init <name>`       | Scaffold a new experience directory                                                       |
| `oe validate [path]`   | Validate `experience.yaml`                                                                |
| `oe run [path]`        | Execute an experience (`--tui`, `--evolve`, `--concurrency N`, `--llm anthropic\|openai`) |
| `oe resume <run-id>`   | Re-run with cache replay                                                                  |
| `oe inspect <run-id>`  | Replay a run's event log (sorted by ts)                                                   |
| `oe state [field]`     | Inspect blackboard                                                                        |
| `oe reset-state --yes` | Wipe blackboard                                                                           |
| `oe evolve <run-id>`   | Generate evolution proposals                                                              |
| `oe diff`              | List pending evolution proposals                                                          |
| `oe ultra "<task>"`    | LLM authors a new experience from natural language                                        |

### `--tui` dashboard

A live ink-based dashboard showing each node's status, current activity (`calling claude-sonnet-4-6`, `spawning codex`, `parsing JSON output`), accumulated per-node tokens, and a header line with the run total. htop-grade observability for graph runs.

### `--concurrency N`

Independent DAG nodes (and `for_each` iterations whose `concurrency: N` is set) run in parallel up to the ceiling. Defaults to 1. Combine with `runtime.concurrency: N` in YAML to make a flow parallel-by-default.

---

## Docs

**📖 Full docs site: https://xingchengxu.github.io/OpenExpertise/** — 90 pages across 11 sections (guide, concepts, examples, cookbook, reference, comparisons, operations, FAQ, glossary, roadmap).

In-repo quick references:

| Doc                                                                              | What's inside                                                              |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| [Docs site `/guide`](https://xingchengxu.github.io/OpenExpertise/guide/)         | Hands-on path: install → first experience → authoring → running → evolving |
| [Docs site `/examples`](https://xingchengxu.github.io/OpenExpertise/examples/)   | Walkthroughs for all 12 shipped examples + gallery                         |
| [Docs site `/cookbook`](https://xingchengxu.github.io/OpenExpertise/cookbook/)   | 10 self-contained recipes — copy/paste YAML for common patterns            |
| [Docs site `/compare`](https://xingchengxu.github.io/OpenExpertise/compare/)     | vs LangGraph / CrewAI / Mastra / Inngest / Workflows / Claude Code         |
| [`docs/cli-agent.md`](docs/cli-agent.md)                                         | `cli-agent` node kind: providers, command shapes, JSON-mode caveats        |
| [`docs/mcp-server.md`](docs/mcp-server.md)                                       | MCP server tools + per-CLI registration                                    |
| [`docs/ultraexpertise.md`](docs/ultraexpertise.md)                               | Auto-SOP authoring — `oe ultra`, slash command, MCP `oe_ultra`             |
| [`docs/registry.md`](docs/registry.md)                                           | `oe install` / `oe registry` and how to submit your experience             |
| [Docs site `/concepts`](https://xingchengxu.github.io/OpenExpertise/concepts/)   | Mental model: code-as-law, state, dispatchers, control flow, 6 node kinds  |
| [Docs site `/reference`](https://xingchengxu.github.io/OpenExpertise/reference/) | CLI command pages + API surface + full YAML schema                         |

---

## Should I use OpenExpertise?

```
Are you trying to ...

   automate a recurring, multi-step process
   that mixes deterministic logic + LLM judgment?
                          │
                  ┌───────┴────────┐
                 YES               NO
                  │                 │
           ┌──────┴──────┐    Use Claude Code
           │             │    or Codex directly.
   Need it durable,     One-shot
   reproducible,        exploration?
   evolvable?           │
   │                    └─ Use Claude Code.
   └─ ▶ Use OpenExpertise.
```

If your team has a SOP that someone has to follow every Monday morning — code review, incident triage, release gates, compliance check, customer onboarding — and you want it to **run the same way every time, leave a trail, and get better at it** — OpenExpertise is for you.

If you want a chat-based assistant or one-off task automation, use the underlying CLI directly (Claude Code, Codex, Gemini). OpenExpertise sits **above** those tools, not next to them.

---

## Development

```bash
pnpm test            # 265 unit + e2e tests
pnpm typecheck       # strict TS across all packages
pnpm lint            # eslint (0 errors)
pnpm format:check    # prettier
pnpm format          # prettier --write
pnpm -r build        # tsc -b across the monorepo
```

The repo is a pnpm workspace with 15 publishable packages. New features land via spec → plan → subagent-driven execution (see [`CONTRIBUTING.md`](CONTRIBUTING.md)).

---

## Contributing

PRs welcome. The path of least friction:

1. Open an issue describing the use case or bug.
2. For features, expect to brainstorm a spec before implementation.
3. For bug fixes, a failing test + minimal patch.

This project is built largely via [Claude Code](https://claude.com/claude-code)-driven [superpowers](https://github.com/anthropics/claude-superpowers) workflows; subagent dispatch + two-stage review per task. The same discipline applies to community contributions.

---

## Community

- [Contributing guide](CONTRIBUTING.md) — setup, conventions, the spec → plan → execute rhythm.
- [Code of Conduct](CODE_OF_CONDUCT.md) — we follow Contributor Covenant 2.1.
- [Security policy](SECURITY.md) — how to report vulnerabilities.
- [Changelog](CHANGELOG.md) — what's in each release.

---

## License

[MIT](LICENSE) © 2026 OpenExpertise.

---

<div align="center">

If OpenExpertise saved you from writing the same workflow twice — **★ the repo**.

</div>
