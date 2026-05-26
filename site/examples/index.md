---
title: Built-in examples
description: 12 ready-to-run experience templates covering every node kind, every fan-out pattern, and three real cognitive workflows.
---

# Built-in examples

OpenExpertise ships with 12 examples covering every node kind, every fan-out pattern, and three real cognitive workflows (deep research, systematic debugging, brainstorming).

Each example has a `README.md`, an `experience.yaml`, fixtures, and a mocked-LLM e2e test — no API key needed to validate the structure.

## Hero examples

<div class="example-grid">

[Review Branch](/examples/review-branch) ★
: The hero demo. Multi-dim code review + verifier + score + advisor evolution. Three reviewers (`bugs`/`perf`/`tests`) fan out, find issues, miss SQL injection — advisor proposes adding a `security` dimension.
: Nodes: `tool` + `agent` ×3

[Tri-CLI Orchestration](/examples/tri-cli-orchestration) ★
: Claude → Codex → Gemini in one DAG. The headline cross-vendor demo.
: Nodes: `cli-agent` ×3

[Deep Research](/examples/deep-research)
: Multi-vendor research: Claude Code WebSearch + Gemini Google Search → cited synthesis.
: Nodes: `tool` + `agent` + `cli-agent` ×2

[Systematic Debugging](/examples/systematic-debugging)
: The superpowers `systematic-debugging` skill as a YAML flow. Hypothesize → verify → fix via Claude Code → re-test.
: Nodes: `tool` ×2 + `agent` + `cli-agent`

[Brainstorming](/examples/brainstorming)
: The superpowers `brainstorming` skill: diverge across 3 angles → cluster → critique → synthesize top 3.
: Nodes: `tool` + `agent` ×2 + `cli-agent` ×2

</div>

## Primitive demos (one node kind at a time)

[Hello Tool](/examples/hello-tool) — Smallest possible flow. No LLM. `tool` only.

[Dataset Aggregate](/examples/dataset-aggregate) — Load CSV → aggregate. `dataset` + `tool`.

[Agent Echo](/examples/agent-echo) — Single agent with structured output. `agent`.

[Oncall Runbook](/examples/oncall-runbook) — Investigate an incident across 3 dimensions via `for_each` fan-out.

[Issue Triage](/examples/issue-triage) — Classify → search dupes → conditional dedup → route. Shows `when:` edges.

[Release Gates](/examples/release-gates) — License + changelog + coverage + Claude-Code security scan → release gate.

[CLI Orchestration](/examples/cli-orchestration) — Two providers: Claude Code summarizes, Codex critiques.

---

## All examples at a glance

| Example | Featuring | LLM required? | CLIs required? |
|---|---|---|---|
| [hello-tool](/examples/hello-tool) | `tool` node | no | no |
| [dataset-aggregate](/examples/dataset-aggregate) | `dataset` + `tool` | no | no |
| [agent-echo](/examples/agent-echo) | `agent` node | yes | no |
| [review-branch ★](/examples/review-branch) | `for_each`, `when:`, `array_append`, multi-phase | yes | no |
| [oncall-runbook](/examples/oncall-runbook) | `for_each` fan-out, synthesis pipeline | yes | no |
| [issue-triage](/examples/issue-triage) | `when:` conditional, skip-cascade | yes | no |
| [release-gates](/examples/release-gates) | `tool + cli-agent + agent` mix, fan-in | yes | `claude` |
| [cli-orchestration](/examples/cli-orchestration) | `cli-agent` chain, 2 providers | no | `claude`, `codex` |
| [tri-cli-orchestration ★](/examples/tri-cli-orchestration) | 3-provider CLI chain | no | `claude`, `codex`, `gemini` |
| [deep-research](/examples/deep-research) | dual `for_each`, fan-in, multi-vendor search | yes | `claude`, `gemini` |
| [systematic-debugging](/examples/systematic-debugging) | `cli-agent for_each`, 6-phase fix loop | yes | `claude` |
| [brainstorming](/examples/brainstorming) | `cli-agent` fan-out ×2, cluster + synthesize | yes | `claude` |

## Running any example

```bash
# Validate YAML schema (no LLM or CLIs needed)
oe validate examples/<name>

# Run with live dashboard
oe run examples/<name> --tui

# Run with args
oe run examples/<name> --args '{"key":"value"}'

# Inspect state after run
oe state <field>

# Full event log
oe inspect <run-id>

# Trigger evolution advisor
oe evolve <run-id>
```

---

Want to share your own experience? See [Sharing experiences](/guide/sharing) (coming soon).
