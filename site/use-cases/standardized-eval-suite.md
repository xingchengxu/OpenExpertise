---
title: Reproducible LLM evaluation suite
description: Run the same eval graph against every model checkpoint — full token and prompt trace in SQLite, CI-gateable scores, no apples-to-oranges comparisons.
---

# Reproducible LLM evaluation suite

Evals drift. A score of 87% on checkpoint A and 84% on checkpoint B sounds like a regression — until you discover that checkpoint B's eval used a different judge prompt, a different temperature, and a model version that silently changed between Tuesday and Thursday. Most ML teams are comparing apples to oranges without knowing it.

The root cause is that eval runs are ephemeral: they happen in notebooks, the prompt versions aren't pinned, the judge model isn't versioned alongside the model under test. OpenExpertise treats the eval itself as a versioned artifact: the same YAML graph runs against every checkpoint, the full trace lives in `.openexpertise/runs/`, and every score is queryable with its exact prompt + token provenance.

## The shape

```
load_dataset (dataset node)          ← ./data/eval_cases.jsonl
      ↓
evaluate (agent,                     → scores[] (array_append)
  for_each: $.rows,
  concurrency: 8)
      ↓
judge (agent,                        → judgments[] (array_append)
  for_each: $.scores,
  concurrency: 8)
      ↓
aggregate (tool)                     → metrics { mean_score, pass_rate, p10, p90 }
      ↓
persist_metrics (tool)               → metrics_path (writes ./out/metrics.json)
```

The `evaluate` fan-out runs the model under test against each eval case in parallel. The `judge` fan-out runs the judge model against each raw score. The `aggregate` tool computes final metrics. Every run produces a metrics JSON you can diff between checkpoints.

## How OpenExpertise builds it

The `dataset` node loads `eval_cases.jsonl` and writes it to `rows` in state — no custom loader needed. The `evaluate` agent node iterates over `rows` with `for_each: { source: $.rows, concurrency: 8 }`, calling the model under test with each case's prompt and writing one result per case into `scores` via `merge: array_append`.

The `judge` agent does the same over `scores`: one judge call per evaluated case, accumulating `judgments`. Both fan-out phases are model-agnostic — the prompt template receives the case and the model's response via `{{$item}}` interpolation. Swapping the judge model is a one-flag change (`--llm openai`).

The `aggregate` tool reads `judgments`, computes mean score, pass rate, p10, and p90, and writes `metrics.json` to disk. The metrics path is stored in state so `oe state metrics_path` gives you the artifact location.

```yaml
name: eval-suite
description: Reproducible eval graph — model under test, judge, aggregate metrics.
version: 0.1.0

state:
  schema:
    rows: { type: array, items: { type: object } }
    scores: { type: array, items: { type: object }, merge: array_append }
    judgments: { type: array, items: { type: object }, merge: array_append }
    metrics: { type: object }
    metrics_path: { type: string }

graph:
  nodes:
    - id: load_dataset
      kind: dataset
      source:
        type: file
        uri: ./data/eval_cases.jsonl
        format: jsonl
      writes: [rows]
    - id: evaluate
      kind: agent
      phase: evaluate
      prompt: ./prompts/evaluate.md
      for_each: { source: $.rows, concurrency: 8 }
      reads: [rows]
      schema:
        type: object
        required: [scores]
        properties:
          scores:
            type: array
            items:
              type: object
              required: [case_id, response, raw_score]
              properties:
                case_id: { type: string }
                response: { type: string }
                raw_score: { type: number }
      writes: [scores]
    - id: judge
      kind: agent
      phase: judge
      prompt: ./prompts/judge.md
      for_each: { source: $.scores, concurrency: 8 }
      reads: [scores]
      schema:
        type: object
        required: [judgments]
        properties:
          judgments:
            type: array
            items:
              type: object
              required: [case_id, judgment, score]
              properties:
                case_id: { type: string }
                judgment: { type: string, enum: [pass, fail, borderline] }
                score: { type: number }
      writes: [judgments]
    - id: aggregate
      kind: tool
      phase: aggregate
      impl: ./tools/aggregate_metrics.mjs
      reads: [judgments]
      writes: [metrics]
    - id: persist_metrics
      kind: tool
      phase: aggregate
      impl: ./tools/persist_metrics.mjs
      reads: [metrics]
      writes: [metrics_path]
  edges:
    - { from: load_dataset, to: evaluate }
    - { from: evaluate, to: judge }
    - { from: judge, to: aggregate }
    - { from: aggregate, to: persist_metrics }
```

This blends the `dataset` loading pattern from [`examples/dataset-aggregate`](https://github.com/xingchengxu/OpenExpertise/tree/main/examples/dataset-aggregate) with the fan-out structure from [`examples/oncall-runbook`](https://github.com/xingchengxu/OpenExpertise/tree/main/examples/oncall-runbook).

## What you'd see after 5 real runs

For a 100-case eval set at `concurrency: 8`, wall time is roughly 3-5 minutes depending on model latency. The TUI shows two fan-out waves — 100 evaluate calls, then 100 judge calls — completing in bursts of 8.

After the run, `oe state metrics` gives you the structured score object:

```json
{
  "mean_score": 0.847,
  "pass_rate": 0.83,
  "p10": 0.61,
  "p90": 0.97,
  "total_cases": 100,
  "failed_cases": 17
}
```

After 5 checkpoints, `oe evolve <run-id>` typically proposes: "Add a `borderline_review` agent after `aggregate` that fetches the 10 lowest-scoring cases and produces a 3-bullet diagnosis of failure patterns — gives the model team a specific signal rather than just a number."

To compare checkpoint A vs. checkpoint B: `diff <(oe inspect run-id-A | jq '.finalState.metrics') <(oe inspect run-id-B | jq '.finalState.metrics')`. Both runs used the same graph version, the same judge prompt, the same eval set. The numbers are comparable.

## Why this is durable (and not just a one-off script)

- **Every score is traceable.** `oe inspect <run-id>` shows the exact prompt sent to the model under test, the exact judge prompt, and the per-case token counts. No "what prompt did we use for checkpoint 34?" question.
- **Swap the model under test in one flag.** Change the `evaluate` node's `reads:` to point at a different model config, or run `oe run . --args model=gpt-4o`. The judge stays the same.
- **CI-gateable.** A GitHub Actions step that runs `oe run` and checks `oe state metrics | jq '.pass_rate >= 0.85'` gives you a numeric quality gate. Model releases that drop below threshold are blocked before they ship.
- **Resume from checkpoints.** If the judge phase fails midway (e.g., rate limit), `oe resume <run-id>` replays from the checkpoint — the 60 evaluate calls you already paid for are not re-run.
- **Full eval history in one directory.** `.openexpertise/runs/` accumulates every eval run. Query across runs with `oe inspect` or raw SQL against the SQLite store.

## Estimated time investment

|                                                      | Time           | Note                             |
| ---------------------------------------------------- | -------------- | -------------------------------- |
| First scaffold (adapt `dataset-aggregate` + fan-out) | ~15 min        |                                  |
| Prepare your eval dataset as JSONL                   | varies         | The one place real work happens  |
| Write the `evaluate.md` and `judge.md` prompts       | ~45 min        | Iterate against a 10-case subset |
| First useful run (100 cases)                         | ~2 hours total |                                  |
| CI integration (model release gate)                  | ~1 hour        |                                  |
| Production-ready (score drift alerting)              | ~1 day         |                                  |

## See also

- [examples/dataset-aggregate](/examples/dataset-aggregate) — the `dataset` node loading pattern
- [examples/oncall-runbook](/examples/oncall-runbook) — the fan-out + synthesis structure
- [Fan-out with concurrency](/cookbook/fan-out-with-concurrency) — tuning `concurrency` for your rate limits
- [Merge strategies](/cookbook/merge-strategies) — how `array_append` accumulates per-case scores
- [Resume + cache](/guide/resume-cache) — checkpoint recovery for long eval runs
