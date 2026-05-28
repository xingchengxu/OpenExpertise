---
title: Multi-dimensional PR review
description: Fan out N specialized reviewers across the same diff, verify each finding before counting it, and let the advisor add missed dimensions over time.
---

# Multi-dimensional PR review

Every non-trivial PR touches security, performance, test coverage, and business logic at the same time. A single human reviewer scanning for all of these simultaneously degrades in quality after the second hour of review — they mentally triage to the most obvious category and miss the rest. The current state of the art is a mix of CI linting (catches style, not semantics) and ad-hoc LLM prompts that produce inconsistent depth because they run in isolation.

## The shape

```
fetch_diff (tool)
     ↓
seed_dimensions (tool)   ← ["bugs", "perf", "tests", "security"]
     ↓
bug_review (agent, for_each: $.dimensions, concurrency: 4)
     ↓                         → findings[] (array_append)
verify_finding (agent, for_each: $.findings)
     ↓                         → verified_findings[] (array_append)
score (agent)
     ↓
risk_score (number, 0–100)
```

Each dimension spawns one LLM call. The verifier re-reads the diff to check that each raw finding is real (not a hallucination). The scorer aggregates into a 0-100 risk score.

## How OpenExpertise builds it

The experience is a four-phase DAG: `collect → review → verify → score`. The two fan-out nodes (`bug_review` and `verify_finding`) use `merge: array_append` on their output fields so every parallel LLM call contributes one entry to the accumulated array, rather than each call overwriting the previous.

The `seed_dimensions` tool returns a static list by default — `["bugs", "perf", "tests", "security"]`. That list is itself a state field, which means you can add a `security` dimension after your first missed SQL injection and it propagates on every future run without touching the agent node.

The verifier node does the work of distinguishing hallucinated findings from real ones: it re-reads the full `diff` with each raw finding and returns `is_real: true/false`. Only real findings count toward the risk score.

```yaml
name: review-branch
description: Review a code diff across dimensions; verify each finding before counting it.
version: 0.1.0

state:
  schema:
    pr_id: { type: string }
    diff: { type: string }
    dimensions: { type: array, items: { type: object } }
    findings: { type: array, items: { type: object }, merge: array_append }
    verified_findings: { type: array, items: { type: object }, merge: array_append }
    risk_score: { type: number }

graph:
  nodes:
    - id: fetch_diff
      kind: tool
      phase: collect
      impl: ./tools/fetch_diff.mjs
      writes: [diff]
    - id: seed_dimensions
      kind: tool
      phase: collect
      impl: ./tools/list_dimensions.mjs
      writes: [dimensions]
    - id: bug_review
      kind: agent
      phase: review
      prompt: ./prompts/review.md
      for_each: { source: $.dimensions }
      reads: [diff]
      schema:
        type: object
        required: [findings]
        properties:
          findings:
            type: array
            items:
              type: object
              required: [title, severity]
              properties:
                title: { type: string }
                severity: { type: string }
      writes: [findings]
    - id: verify_finding
      kind: agent
      phase: verify
      prompt: ./prompts/verify.md
      for_each: { source: $.findings }
      reads: [diff]
      schema:
        type: object
        required: [verified_findings]
        properties:
          verified_findings:
            type: array
            items:
              type: object
              required: [is_real]
              properties:
                is_real: { type: boolean }
      writes: [verified_findings]
    - id: score
      kind: agent
      phase: score
      prompt: ./prompts/score.md
      reads: [verified_findings]
      schema:
        type: object
        required: [risk_score]
        properties:
          risk_score: { type: number }
      writes: [risk_score]
  edges:
    - { from: fetch_diff, to: seed_dimensions }
    - { from: seed_dimensions, to: bug_review }
    - { from: bug_review, to: verify_finding }
    - { from: verify_finding, to: score, when: 'length($.findings) > 0' }
```

The canonical implementation is at [`examples/review-branch`](https://github.com/xingchengxu/OpenExpertise/tree/main/examples/review-branch).

## What you'd see after 5 real runs

The TUI shows four concurrent LLM calls in the review phase — one per dimension — completing in roughly 10-15 seconds at `concurrency: 4`. The verify phase spawns one call per raw finding (typically 3-8 total). The score phase is a single quick call.

After the run, `oe state risk_score` gives you the numeric verdict. `oe state verified_findings` shows the deduplicated, verified list. A post-run `oe inspect <run-id>` reveals the exact per-finding token counts — useful for tuning which dimensions are expensive.

After 5 runs, `oe evolve <run-id>` typically proposes: "Add a `security` dimension to `list_dimensions.mjs` — the current diff touched SQL query construction and no security review fired." The proposal is a `git apply`-ready diff you can review and apply in 30 seconds. This is the canonical story behind `examples/review-branch` — the SQL injection miss that the advisor caught.

## Why this is durable (and not just a one-off script)

- **Replay any past PR** with `oe run . --args pr_id=142` — the diff is fetched fresh, but the graph shape and prompt versions are pinned to whatever you had at run time. No "what prompt did we use last Tuesday?" problem.
- **Add dimensions without touching agents.** Update `list_dimensions.mjs` and every future run picks up the new dimension. The fan-out is data-driven.
- **Cross-vendor option.** The `bug_review` agent runs against your default provider. Swap to `--llm openai` or `--llm anthropic` in one flag if one provider is down or you want a second opinion on a risky PR.
- **Advisor-driven growth.** The evolution advisor reads which findings were verified vs. rejected and proposes prompt improvements to reduce false positives — a compounding quality improvement over time.

## Estimated time investment

|                                                     | Time          | Note                            |
| --------------------------------------------------- | ------------- | ------------------------------- |
| First scaffold (`oe init --template` or `oe ultra`) | ~5 min        |                                 |
| Wire `fetch_diff` to your GitHub token              | ~20 min       | The one place real work happens |
| Tune the `review.md` and `verify.md` prompts        | ~30 min       | Iterate against real diffs      |
| First useful run on a live PR                       | ~45 min total |                                 |
| Add CI integration (GitHub Actions PR event)        | ~1 hour       |                                 |
| Production-ready (e2e tests, dimension tuning)      | ~3 hours      |                                 |

## See also

- [examples/review-branch](/examples/review-branch) — the bundled reference implementation with SQL-injection scenario
- [Fan-out with concurrency](/cookbook/fan-out-with-concurrency) — the specific pattern this leans on
- [Merge strategies](/cookbook/merge-strategies) — how `array_append` accumulates fan-out results
- [The advisor](/guide/evolution-advisor) — how `oe evolve` proposes new dimensions
