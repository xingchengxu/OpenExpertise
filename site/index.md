---
layout: home

hero:
  name: OpenExpertise
  text: AI-era Makefile
  tagline: Codify expert workflows as version-controlled YAML graphs. Run them with deterministic flow + LLM-powered nodes. Let the LLM evolve the graph after each run.
  image:
    src: /logo.svg
    alt: OpenExpertise
  actions:
    - theme: brand
      text: 60-second demo
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/xingchengxu/OpenExpertise
    - theme: alt
      text: Why OpenExpertise
      link: /concepts/experiences

features:
  - icon: 🧱
    title: Code-as-Law
    details: YAML schema validates the graph structure before runtime. LLMs only fill the gaps inside nodes — they can't rewrite the flow at runtime. No drift, no surprises, the same DAG every run.
  - icon: 🧩
    title: 6 node kinds, one graph
    details: tool (deterministic code) · agent (LLM with structured output) · skill (SKILL.md packages) · dataset (file / SQLite / HTTP) · experience (nested) · cli-agent (Claude Code / Codex / Gemini).
  - icon: 💾
    title: Persistent SQLite state
    details: Every node's writes land in a typed blackboard. <code>oe state findings</code> works hours later. Resume with <code>oe resume &lt;run-id&gt;</code> and replay cached steps.
  - icon: 🧬
    title: Self-improving
    details: <code>oe evolve &lt;run-id&gt;</code> reads the events + state diff and proposes graph upgrades as <code>git apply</code>-ready diffs. The author → run → evolve loop closes.
  - icon: 🔗
    title: Two-way agentic-CLI integration
    details: Outbound — delegate a node to Claude Code / Codex / Gemini. Inbound — <code>oe-mcp</code> exposes 5 OE tools so the same CLIs can run experiences from their own sessions.
  - icon: ⚡
    title: Parallel + 429-aware
    details: <code>--concurrency N</code> runs independent nodes (and <code>for_each</code> iterations) in parallel. Both Anthropic and OpenAI clients retry on HTTP 429 with exponential backoff.
  - icon: 🎯
    title: One-keyword authoring
    details: <code>oe ultra "&lt;task&gt;"</code> — an LLM agent analyzes your task and synthesizes a complete <code>experience.yaml</code> plus tool stubs and prompts into a validated draft directory.
  - icon: 🪟
    title: htop-grade observability
    details: <code>--tui</code> shows each node's live status, current activity ("calling claude-sonnet-4-6"), accumulated per-node tokens, and a run-level total in the header.
  - icon: 📦
    title: Multi-LLM provider
    details: Anthropic + OpenAI out of the box. <code>OPENAI_BASE_URL</code> redirects OpenAI calls to any compatible endpoint — vLLM, Ollama, LM Studio, your own internal API.
---

<style>
.tag-row { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; margin: 24px 0 0; }
.tag-row span { font-size: 0.85em; color: var(--vp-c-text-2); }
.tag-row .pill { padding: 4px 12px; }
</style>

<div class="tag-row">
  <span class="pill pill-ok">227 tests</span>
  <span class="pill pill-ok">15 packages</span>
  <span class="pill pill-ok">11 examples</span>
  <span class="pill pill-ok">MIT licensed</span>
  <span class="pill pill-ok">Node 20 / 22 / 24</span>
  <span class="pill pill-ok">live-API verified</span>
</div>

---

## What is it, really?

OpenExpertise is **the orchestration layer above Claude Code, Codex, and Gemini.**

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

It is **not** an autonomous agent. It is the orchestration layer that lets you wire **deterministic code**, **LLM agents**, and **CLI agents** into reproducible, persistent, self-improving pipelines.

If your team has a SOP that someone has to follow every Monday morning — code review, incident triage, release gates, compliance check, customer onboarding — and you want it to **run the same way every time, leave a trail, and get better at it** — this is for you.

---

## The 60-second story

```bash
git clone https://github.com/xingchengxu/OpenExpertise && cd OpenExpertise
pnpm install && pnpm -r build

export ANTHROPIC_API_KEY=sk-...
node packages/cli/dist/bin.js run examples/review-branch --tui
```

Three reviewers (`bugs` / `perf` / `tests`) fan out over a Python diff. They find a missing null-check, a missing test, and an unclosed cursor — but they **miss the SQL injection**.

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

**The experience improved itself.** Author → run → evolve, all driven by the same LLM provider.

→ Full walkthrough: [`examples/review-branch`](/examples/review-branch).

---

## Three rival AI coding CLIs talking to each other, in one graph

No other workflow framework does this today.

```yaml
graph:
  nodes:
    - {
        id: summarize,
        kind: cli-agent,
        provider: claude-code,
        prompt: 'Summarize this topic in one sentence: {{topic}}',
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

One DAG, three vendors, shared SQLite state, replayable event log. **37s real wall time, three CLIs, one trace.**

→ See it in action: [`examples/tri-cli-orchestration`](/examples/tri-cli-orchestration).

---

## Pick the example closest to your use case

| Example                                                      | What it shows                                                     | Featuring                      |
| ------------------------------------------------------------ | ----------------------------------------------------------------- | ------------------------------ |
| [`hello-tool`](/examples/hello-tool)                         | Smallest possible flow                                            | `tool`                         |
| [`agent-echo`](/examples/agent-echo)                         | Single LLM agent with structured output                           | `agent`                        |
| [`dataset-aggregate`](/examples/dataset-aggregate)           | Load CSV → aggregate                                              | `dataset` + `tool`             |
| [`review-branch`](/examples/review-branch) ★                 | The hero demo — multi-dim review + verifier + score + evolution   | `tool` + `agent` ×3            |
| [`oncall-runbook`](/examples/oncall-runbook)                 | Fan out an investigation across 3 dimensions                      | `for_each`                     |
| [`issue-triage`](/examples/issue-triage)                     | Classify → search dupes → conditional dedup → route               | `when:` edges                  |
| [`release-gates`](/examples/release-gates)                   | License + changelog + coverage + Claude-Code security scan → gate | `tool` + `cli-agent` + `agent` |
| [`cli-orchestration`](/examples/cli-orchestration)           | Claude Code summarizes; Codex critiques                           | `cli-agent` ×2                 |
| [`tri-cli-orchestration`](/examples/tri-cli-orchestration) ★ | Claude → Codex → Gemini in one DAG                                | `cli-agent` ×3                 |
| [`deep-research`](/examples/deep-research)                   | Multi-source research with cross-referencing                      | `agent` fan-in                 |
| [`systematic-debugging`](/examples/systematic-debugging)     | Hypothesize → localize → fix → verify loop                        | `tool` + `agent`               |

All 11 examples ship with mocked-LLM e2e tests so the structure is verifiable without API keys.

---

## When should I reach for OpenExpertise?

<div class="diagram">
Are you trying to ...

automate a recurring, multi-step process
that mixes deterministic logic + LLM judgment?
│
┌───────┴────────┐
YES NO
│ │
┌──────┴──────┐ Use Claude Code
│ │ or Codex directly.
Need it durable, One-shot
reproducible, exploration?
evolvable? │
│ └─ Use Claude Code.
└─ ▶ Use OpenExpertise.

</div>

If you want a chat-based assistant or one-off task automation, **use the underlying CLI directly** (Claude Code, Codex, Gemini). OpenExpertise sits **above** those tools, not beside them.

→ Compare in detail: [vs the alternatives](/compare/).

---

<div style="text-align: center; padding: 32px 0 8px;">
  <p style="color: var(--vp-c-text-2); font-size: 0.95em;">Build expert workflows once. Run them forever. Watch them get better at it.</p>
  <p>
    <a href="/OpenExpertise/guide/getting-started" style="font-weight: 600;">Start building →</a>
  </p>
</div>
