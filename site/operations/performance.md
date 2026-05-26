---
title: Performance & cost
description: Hard numbers from the test suite — duration, tokens, USD cost per example — plus the levers you have to tune them.
---

# Performance & cost

What does a run actually cost? Hard numbers from the test suite, plus the levers you have when you need to bring those numbers down.

::: warning Numbers are reference, not contract
All numbers below come from runs against `claude-sonnet-4-6` (Anthropic) and `gpt-4o` (OpenAI) on representative fixtures shipped in `examples/`. Your specific costs depend on your prompts, your data sizes, and your provider's pricing at the time you read this. Use these as **order-of-magnitude** signal.
:::

## Cost by example

| Example | Real wall time | Tokens (in / out) | Cost (USD, Claude 3.5 Sonnet) | Cost (USD, gpt-4o) |
| --- | --- | --- | --- | --- |
| [`hello-tool`](/examples/hello-tool) | <1s | 0 / 0 | $0.000 | $0.000 |
| [`dataset-aggregate`](/examples/dataset-aggregate) | ~2s | 0 / 0 | $0.000 | $0.000 |
| [`agent-echo`](/examples/agent-echo) | ~3s | ~600 / ~80 | $0.003 | $0.002 |
| [`review-branch`](/examples/review-branch) ★ | ~45s | ~12K / ~2K | $0.07 | $0.05 |
| [`oncall-runbook`](/examples/oncall-runbook) | ~30s | ~8K / ~1.5K | $0.05 | $0.04 |
| [`issue-triage`](/examples/issue-triage) | ~12s | ~3K / ~500 | $0.02 | $0.01 |
| [`release-gates`](/examples/release-gates) | ~60s | ~5K / ~1K | $0.04 | $0.03 |
| [`cli-orchestration`](/examples/cli-orchestration) | ~25s | (Tokens inside CLI sessions, not exposed) | varies | varies |
| [`tri-cli-orchestration`](/examples/tri-cli-orchestration) ★ | ~37s | (Tokens inside CLI sessions, not exposed) | varies | varies |
| [`deep-research`](/examples/deep-research) | ~90s | ~40K / ~6K | $0.20 | $0.15 |
| [`systematic-debugging`](/examples/systematic-debugging) | ~50s | ~10K / ~2K | $0.07 | $0.05 |
| [`brainstorming`](/examples/brainstorming) | ~45s | ~15K / ~3K | $0.10 | $0.07 |

`★` = hero examples worth running first.

For `cli-agent` flows we can't expose token counts from the CLI subprocess (Claude Code / Codex / Gemini own that data). Use your provider's billing dashboard for those.

## The big levers

If your run is too slow or too expensive, here's the priority order:

### 1. Add concurrency

Default scheduler is sequential. **Set `runtime.concurrency: 4`** (or pass `--concurrency 4`) to run independent nodes in parallel.

For fan-out, set `for_each.concurrency: N`:

```yaml
- id: investigate
  kind: agent
  for_each:
    source: $.dimensions
    concurrency: 4 # ← 4 LLM calls in flight at once
```

Wall time for `review-branch` drops from ~45s → ~12s when `for_each.concurrency` goes from 1 → 3 (3 reviewers, all in flight).

→ [Concurrency + 429 retry](/guide/concurrency)

### 2. Tighten schemas + prompts

Most expensive thing in an `agent` node is the output tokens. AJV schemas constrain the shape — use them aggressively:

```yaml
schema:
  type: object
  properties:
    findings:
      type: array
      maxItems: 5 # ← cap output size
      items:
        type: object
        properties:
          severity: { type: string, enum: ['low', 'med', 'high'] } # ← enum > free text
          summary: { type: string, maxLength: 120 } # ← cap each field
        required: [severity, summary]
        additionalProperties: false
  required: [findings]
  additionalProperties: false
```

`maxLength`, `maxItems`, and `enum` reliably shrink token output by 30–60%.

### 3. Cache + resume

Re-running an experience? `oe resume <run-id>` skips cached steps. The content-hash cache key is `node_id × inputs_hash × impl_hash`. As long as inputs and code haven't changed, the cached `NodeOutput` is reused — zero LLM call.

This matters a lot in CI: if your pre-merge check runs `review-branch` and the PR didn't change since the last run, the LLM cost is **$0**.

→ [Resume + cache](/guide/resume-cache) · [Cache concept](/concepts/cache)

### 4. Drop to a cheaper model

The default `agent` model is `claude-sonnet-4-6`. For many classification / extraction tasks, `claude-haiku-4-5` is 4–8× cheaper at equivalent quality.

```yaml
- id: classify
  kind: agent
  prompt: ./prompts/classify.md
  model: claude-haiku-4-5 # ← override per-node
  schema: { ... }
  writes: [classification]
```

For self-hosted: point `OPENAI_BASE_URL` at vLLM/Ollama. Marginal cost per token approaches **zero** if you own the inference hardware (electricity + amortized GPU).

→ [Self-hosted LLMs](/guide/self-hosted-llm)

### 5. Conditional skip the expensive nodes

```yaml
edges:
  - { from: classify, to: deep_review, when: '$.risk_score > 0.5' }
```

If 70% of inputs have `risk_score <= 0.5`, you skip the expensive `deep_review` 70% of the time.

→ [Control flow](/concepts/control-flow)

### 6. Run with `cli-agent` for very long sessions

For tasks that need many turns of agentic reasoning, a `cli-agent` node (Claude Code / Codex) is often cheaper than an `agent` node looping internally — the CLI's session caching is more sophisticated than ours.

The tradeoff: you lose `node.tokens` visibility (tokens spent inside the CLI's session).

→ [cli-agent guide](/guide/cli-agent-usage)

## When OE adds overhead

OE is **not free**. Per-node overhead from the dispatcher + state writes + event emission is roughly:

| Operation | Time |
| --- | --- |
| Dispatcher resolve (one-time per node) | ~2–10ms |
| State write per field | ~1–3ms (better-sqlite3 sync) |
| Event emit + JSONL append | <1ms |
| Cache lookup | ~2ms |
| AJV validate (agent output) | ~1–5ms |

For a flow with 10 nodes and ~20 state writes, total framework overhead is **<100ms**. The LLM call dwarfs this entirely.

If you have a hot path with thousands of pure-tool nodes per second, OE is the wrong tool — use a streaming framework instead. OE shines when **each step is a meaningful unit of work** (an LLM call, a structured tool, a dataset load).

## Memory profile

The runtime is mostly stateless — state lives in SQLite, events in JSONL. The Node process holds:

- The parsed `ExperienceSpec` (~10KB–100KB per experience)
- The dispatcher registry (~100KB once)
- In-flight node bundles (proportional to `concurrency` × per-node state size)
- LLM client connection pool (negligible)

A typical run holds **<50MB resident**. Long-running services embedding `runExperience` stay flat — the framework doesn't accumulate.

If you're seeing growth across many runs, suspects in order: (1) you're not cleaning up `events` subscribers between runs, (2) you're keeping `RunResult` objects in memory, (3) you have a large state field that's getting array-appended on every run without reset.

## Benchmark methodology

The numbers above come from running `pnpm test:e2e` against the live API. They're not synthetic. The harness:

1. Wipes `.openexpertise/` per example
2. Runs `oe run <example>` 3 times
3. Records wall time, tokens (via `node.tokens` events), retries
4. Picks the median run

Numbers are conservative because the test harness has some overhead. Real runs from a warm process are usually **15–25% faster**.

→ Want to reproduce? `pnpm test:e2e --benchmark` (results land in `.openexpertise/bench/`).
