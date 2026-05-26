---
title: Use cases
description: Concrete scenarios where OpenExpertise pays off — engineering, security, ops, ML platform, data, product. Each links to the relevant example.
---

# Use cases

OpenExpertise isn't general-purpose AI infrastructure. It's specifically the right tool when:

1. **The same multi-step process runs over and over** (every Monday, every PR, every incident).
2. **The process mixes deterministic logic with LLM judgment** (parse + classify, fetch + summarize, lint + review).
3. **You want the same outcome every time** — and a trail showing why.

If that's you, here are the scenarios where the project pays off the fastest, organized by role.

## Engineering leads

### PR review with multiple specialized reviewers

You want every PR scanned by a `bugs` reviewer, a `perf` reviewer, and a `tests` reviewer — and missed dimensions added by the advisor over time.

→ [examples/review-branch](/examples/review-branch) — the canonical demo. Three reviewers fan out, find issues, miss SQL injection; the advisor proposes adding a `security` dimension; re-run catches it.

**Why OE wins here**: hand-coding this as a serial loop costs a day. As a "let Claude Code review" call, you get inconsistent depth and zero institutional memory. As an OE flow, every PR gets the same triple-pass + the system learns missed dimensions.

### Release-gate enforcement

License check + changelog check + coverage check + Claude-Code security scan, **all required to pass before merge**.

→ [examples/release-gates](/examples/release-gates) — gate orchestration with mixed `tool` (license, coverage) + `cli-agent` (Claude security scan) + `agent` (final gate decision). 8 minutes to author, runs on every release branch.

### Issue triage with dedup

New issue → classify → search similar → if dupes exist, route the dedup decision through an LLM; otherwise auto-assign labels and route to the right team.

→ [examples/issue-triage](/examples/issue-triage) — demonstrates the `when:` edge for conditional dedup with skip-cascade-breaking via direct edges.

## SRE / ops

### Incident triage runbook

Page fires → fetch logs from 3 sources → run a parallel investigation across `latency`, `errors`, and `saturation` dimensions → cross-reference findings → assign severity → notify oncall.

→ [examples/oncall-runbook](/examples/oncall-runbook) — `for_each` fan-out across dimensions with `concurrency: 3`. Runs in ~45s, leaves a JSONL trail for the post-mortem.

**Why this is hard without OE**: incident runbooks usually rot. Wikis go stale; the on-call engineer rediscovers the same dashboards every time. OE makes the runbook **executable, version-controlled, and instrumented**.

### Pre-deploy gate

License compliance + change manifest + smoke test results + LLM-summarized risk → human-readable verdict file.

→ Variant of [examples/release-gates](/examples/release-gates) — same shape, can be re-pointed at deploy artifacts.

### Capacity / cost report

Scheduled `oe run` against your billing API → aggregate → LLM-written exec summary → POST to Slack.

→ Pattern from [examples/dataset-aggregate](/examples/dataset-aggregate) + an `agent` summary node + a `tool` Slack-poster. Wire as a cron job.

## Security teams

### Compliance scan with structured reporting

Run a Claude-Code-driven security audit + a Codex-driven cross-check + an Anthropic-API verdict synthesizer. Each finding has cite, severity, and remediation in a JSON shape that feeds straight into your ticket system.

→ Variant of [examples/tri-cli-orchestration](/examples/tri-cli-orchestration) — but with security prompts and a structured-output `agent` that consolidates the cross-vendor findings.

**Why two vendors**: cross-checking reduces single-model false positives + false negatives. The 30% cost overhead is worth it for findings that gate releases.

### Audit log of every AI-touched decision

Every node touching an LLM emits `node.tokens` + `node.activity` events to JSONL. Pipe the JSONL into your SIEM. Now every AI-influenced decision in your org has a per-token trail.

→ See [Observability](/operations/observability) for the integration recipe (Datadog / Splunk / Elastic).

## ML platform / AI engineering

### Standardized eval suite as YAML

Define an eval graph: `dataset → for_each agent (the model under test) → for_each agent (the judge) → aggregate metrics → persist`. Same DAG runs for every model checkpoint.

→ Pattern from [examples/dataset-aggregate](/examples/dataset-aggregate) + fan-out agent. Reproducibility is the win: every eval run lives in `.openexpertise/runs/` with full token + prompt trace.

### Multi-vendor cross-judging

Three judges (Claude, Codex, Gemini) score the same output. Disagreement → flag for human review. No other framework gives you cross-vendor orchestration this cleanly.

→ [examples/tri-cli-orchestration](/examples/tri-cli-orchestration) is the structural template.

### Cost-aware retry policy

LLM call fails on the expensive model → fallback to a cheaper model with `on_error: retry` + provider-swap in the prompt args. Cost visibility comes from the `node.tokens` events.

→ See [error policies](/guide/on-error) + the [run-with-llm guide](/guide/run-with-llm).

## DevRel / Documentation teams

### Continuous doc-from-source

Source files change → trigger an OE run → load the relevant section → an agent summarizes the changes → write a draft changelog entry → human reviews. Better than `npm-version` because the summary captures intent, not just file paths.

→ Pattern: [examples/dataset-aggregate](/examples/dataset-aggregate) + an `agent` summarizer + a `tool` writer. Wire to GitHub Actions on push.

### Repo audit ("does our README still match reality?")

Compare README.md claims to `package.json` + actual source files + actual tests. LLM verifies. Surface drift.

→ Build with `tool` (read files) → `agent` (compare claims) → `tool` (write audit report). Run weekly via cron.

## Data engineering

### Row-level enrichment with model-based classification

Load 10k rows → fan-out an LLM classifier (`for_each` with `concurrency: 16`) → aggregate stats → persist. Same shape every Monday morning.

→ [examples/dataset-aggregate](/examples/dataset-aggregate) for the structural template. Swap the dataset source to your warehouse via `source: { type: sqlite, ... }` or write a small `tool` that wraps your warehouse client.

### LLM-augmented ETL

The "T" step in ETL gets an LLM column (entity resolution, sentiment, classification) without rewriting your existing pipeline.

→ Wire OE as the agent layer your existing `airflow` / `dagster` task calls via `oe run` subprocess. See [Deployment](/operations/deployment).

## Product / customer ops

### Onboarding workflow with quality gates

New customer signs up → fetch their org data → run a `dataset` node loading from your CRM → an `agent` writes a personalized welcome plan → another `agent` reviews it for tone + accuracy → if approved, `tool` posts to Slack.

→ Pattern: `tool → dataset → agent → agent (reviewer) → conditional tool`. See [cookbook fan-out + conditional skip](/cookbook/#conditional-skip-only-run-b-if-a-produced-something).

### Tier-1 support routing

Incoming ticket → classify (urgency × topic) → search KB → if duplicate, auto-reply with link; else route to the right human queue. The "if duplicate" branch uses an LLM to write the response in the customer's tone.

→ Direct adaptation of [examples/issue-triage](/examples/issue-triage) — swap GitHub issue source for your ticketing source.

## Knowledge work meta-loops

### Three superpowers skills already shipped as OE flows

The `superpowers` skills repository contains battle-tested cognitive workflows. We've ported the three most evolution-friendly ones to runnable OE experiences:

- [`brainstorming`](/examples/brainstorming) — diverge across 3 angles → cluster → critique → synthesize top 3
- [`systematic-debugging`](/examples/systematic-debugging) — hypothesize → verify → fix → re-test
- [`deep-research`](/examples/deep-research) — multi-source research with cross-vendor cross-referencing

These are open invitations: take a skill that works for your team, port the steps to YAML, let evolution refine it.

---

## When OpenExpertise is **not** the answer

| Scenario                                                    | Use this instead                                     |
| ----------------------------------------------------------- | ---------------------------------------------------- |
| One-shot exploration ("help me understand X")               | Claude Code / Cursor / Codex / Gemini direct         |
| You want an autonomous agent that reasons freely            | Claude Code / Codex / Gemini direct                  |
| Real-time chat assistant                                    | Vercel AI SDK / OpenAI Assistants / Anthropic Claude |
| Embedding / vector DB pipelines (no agentic step)           | LangChain / LlamaIndex                               |
| Pure deterministic data pipeline (no LLM)                   | Dagster / Airflow / Prefect                          |
| You need durable execution > 24 hr with retries on every op | Inngest / Temporal (or layer OE on top of them)      |

OpenExpertise sits **above** Claude Code / Codex / Gemini, not beside them. It sits **adjacent** to LangGraph / CrewAI / Mastra (different design, similar problem space). See [Compare](/compare/) for the full matrix.

---

→ **Start with the example closest to your shape**, then bend it to your data. The [cookbook](/cookbook/) has the most-reused patterns extracted.
