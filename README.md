<div align="center">

# OpenExpertise

### **AI-era Makefile.** Codify expert workflows as runnable, evolving graphs.

[![tests](https://img.shields.io/badge/tests-225%20passing-brightgreen)](#) [![typecheck](https://img.shields.io/badge/typecheck-strict-blue)](#) [![packages](https://img.shields.io/badge/packages-14-blueviolet)](#) [![license: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)

[**60-second demo**](#60-second-demo) · [**Why**](#why-openexpertise) · [**Examples**](#built-in-examples) · [**Compare**](#vs-the-alternatives) · [**Docs**](#docs)

</div>

---

## What it is (in one sentence)

**OpenExpertise turns a team's standard operating procedures into version-controlled YAML graphs, runs them with deterministic flow + LLM-powered nodes, and uses the LLM again to evolve the graph after each run.**

```
┌─────────────────────────────────────┐    ┌───────────────────────────────────────┐
│   Claude Code / Codex / Gemini      │    │   OpenExpertise                       │
│   "AI bash"                         │    │   "AI Makefile"                       │
│                                     │ vs │                                       │
│   - improvised each run             │    │   - same DAG every run                │
│   - opaque trajectory               │    │   - JSONL event log + SQLite state    │
│   - one-shot, no memory             │    │   - evolves itself across runs        │
│   - general-purpose                 │    │   - codifies a specific SOP           │
└─────────────────────────────────────┘    └───────────────────────────────────────┘

           autonomous worker                            workflow conductor
                                                       (can call the workers)
```

It's NOT an autonomous agent. It's the **orchestration layer** that lets you wire deterministic code, LLM agents, and CLI agents (Claude Code / Codex / Gemini) into reproducible, persistent, self-improving pipelines.

---

## 60-second demo

```bash
git clone <repo-url> && cd OpenExpertise
pnpm install && pnpm -r build

export ANTHROPIC_API_KEY=sk-...        # or OPENAI_API_KEY=...
node packages/cli/dist/bin.js run examples/review-branch --tui
```

You'll see three reviewers (`bugs`/`perf`/`tests`) fan out over a Python diff. They find missing null-check + missing test + unclosed cursor — but **miss the SQL injection**.

```
ⓘ run-2026-05-26-a1b2c3 finished
  findings: 3 issues
  risk_score: 0.30
```

Now ask the evolution advisor what's missing:

```bash
node packages/cli/dist/bin.js evolve run-2026-05-26-a1b2c3
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
| **Two-way agentic-CLI integration** | **Outbound:** delegate a node to Claude Code / Codex / Gemini. **Inbound:** `oe-mcp` exposes 5 OE tools so the same CLIs can run experiences from inside their own sessions.                                      |

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
node packages/cli/dist/bin.js run examples/oncall-runbook --llm openai
```

That same flow handles reasoning-style models that prefix tool-call arguments with `<think>...</think>` blocks (auto-stripped by the client) and Claude Code's JSON envelopes (auto-unwrapped by the cli-agent parser).

---

## Install & first run (under 60 seconds)

```bash
git clone <repo-url> && cd OpenExpertise
pnpm install && pnpm -r build

# Hello world — pure tool, no API key needed:
node packages/cli/dist/bin.js run examples/hello-tool
# → finalState: { greeting: "hello, World" }
```

When npm-published: `npm i -g @openexpertise/cli` → `oe run examples/hello-tool`.

---

## Built-in examples

> Pick the one closest to your use case. Each ships with fixtures and a mocked-LLM e2e test in `e2e/` — no real API key required to validate the structure.

| Example                                                      | What it shows                                                              | Nodes                          |
| ------------------------------------------------------------ | -------------------------------------------------------------------------- | ------------------------------ |
| [`hello-tool`](examples/hello-tool/)                         | Smallest possible flow. No LLM.                                            | `tool`                         |
| [`dataset-aggregate`](examples/dataset-aggregate/)           | Load CSV → aggregate.                                                      | `dataset` + `tool`             |
| [`agent-echo`](examples/agent-echo/)                         | Single agent with structured output.                                       | `agent`                        |
| [`review-branch`](examples/review-branch/) ★                 | The hero demo. Multi-dim review + verifier + score + evolution.            | `tool` + `agent` ×3            |
| [`oncall-runbook`](examples/oncall-runbook/)                 | Investigate an incident across 3 dimensions via `for_each` fan-out.        | `tool` + `agent`               |
| [`issue-triage`](examples/issue-triage/)                     | Classify → search dupes → conditional dedup → route. Shows `when:` edges.  | `tool` + `agent`               |
| [`release-gates`](examples/release-gates/)                   | License + changelog + coverage + Claude-Code security scan → release gate. | `tool` + `cli-agent` + `agent` |
| [`cli-orchestration`](examples/cli-orchestration/)           | Claude Code summarizes; Codex critiques. Two providers in one flow.        | `cli-agent` ×2                 |
| [`tri-cli-orchestration`](examples/tri-cli-orchestration/) ★ | Claude → Codex → Gemini in one DAG. The headline cross-vendor demo.        | `cli-agent` ×3                 |

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

Five MCP tools are exposed: `oe_validate`, `oe_state`, `oe_inspect`, `oe_run`, `oe_evolve`, `oe_ultra`. Reference: [`docs/mcp-server.md`](docs/mcp-server.md).

---

## CLI reference

| Command                | Purpose                                                                                   |
| ---------------------- | ----------------------------------------------------------------------------------------- |
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

| Doc                                                  | What's inside                                                       |
| ---------------------------------------------------- | ------------------------------------------------------------------- |
| [`docs/cli-agent.md`](docs/cli-agent.md)             | `cli-agent` node kind: providers, command shapes, JSON-mode caveats |
| [`docs/mcp-server.md`](docs/mcp-server.md)           | MCP server tools + per-CLI registration                             |
| [`docs/ultraexpertise.md`](docs/ultraexpertise.md)   | Auto-SOP authoring — `oe ultra`, slash command, MCP `oe_ultra`      |
| [`docs/comparison.md`](docs/comparison.md)           | Position vs LangGraph / CrewAI / Mastra / Inngest                   |
| [`docs/demo-script.md`](docs/demo-script.md)         | Recording script for the hero GIF                                   |
| [`docs/superpowers/specs/`](docs/superpowers/specs/) | Architecture decisions                                              |

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
pnpm test            # 223 unit + e2e tests
pnpm typecheck       # strict TS across all packages
pnpm lint            # eslint (0 errors)
pnpm format:check    # prettier
pnpm format          # prettier --write
pnpm -r build        # tsc -b across the monorepo
```

The repo is a pnpm workspace with 14 packages. New features land via spec → plan → subagent-driven execution; the cumulative history is in `docs/superpowers/overnight-progress.md`.

---

## Contributing

PRs welcome. The path of least friction:

1. Open an issue describing the use case or bug.
2. For features, expect to brainstorm a spec before implementation.
3. For bug fixes, a failing test + minimal patch.

This project is built largely via [Claude Code](https://claude.com/claude-code)-driven [superpowers](https://github.com/anthropics/claude-superpowers) workflows; subagent dispatch + two-stage review per task. The same discipline applies to community contributions.

---

## License

[MIT](LICENSE) © 2026 OpenExpertise.

---

<div align="center">

If OpenExpertise saved you from writing the same workflow twice — **★ the repo**.

</div>
