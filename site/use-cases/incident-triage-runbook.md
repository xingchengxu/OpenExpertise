---
title: Executable on-call runbook
description: Replace wiki rot with a versioned, replayable incident triage flow — parallel investigation across latency, errors, and saturation, resolved in under a minute.
---

# Executable on-call runbook

Runbooks rot in wikis. An on-call engineer paged at 2 AM rediscovers the same Grafana dashboards, the same Datadog queries, the same Slack channels — from memory, under pressure, every single incident. The "institutional knowledge" is locked in the heads of senior engineers who've been paged before. The dominant incident response pattern is "fight fire from scratch" with some notes left behind afterward, often incomplete.

The cost compounds: each re-discovery of the same dashboard wastes 5-10 minutes. In a 60-minute P1 incident, that's 10-17% of wall time spent on navigation that should be instantaneous. `oe run` collapses that to zero.

## The shape

```
fetch_incident (tool)           ← PagerDuty payload or fixture
      ↓
seed_dimensions (tool)          ← ["latency", "errors", "saturation"]
      ↓
investigate (agent,             → findings[] (array_append)
  for_each: $.dimensions,
  concurrency: 3)
      ↓
prioritize (agent)              → prioritized_findings[]
      ↓
summary (agent)                 → summary (one-page text)
```

Three investigation threads run in parallel — one per dimension. The prioritizer cross-references the three finding sets into a ranked list. The summary agent writes the one-pager the on-call hands to their manager at 3 AM.

## How OpenExpertise builds it

The triage phase (`fetch_incident`, `seed_dimensions`, `investigate`) and the synthesis phase (`prioritize`, `summary`) map directly to OpenExpertise's phase model. The `investigate` fan-out is what makes this fast: three LLM calls run concurrently against the same incident data, each looking for a different failure signal.

`findings` uses `merge: array_append` — as each dimension's investigation completes, its findings array is appended to the accumulated list. The `prioritize` node receives the full, merged findings list and ranks them by severity × blast-radius.

The tool stubs in the bundled example fetch from local fixture files. In production, you point `fetch_incident` at your PagerDuty/Opsgenie webhook payload and `list_dimensions` at your runbook's standard investigation axes.

```yaml
name: oncall-runbook
description: 'When an incident fires — fetch it, investigate across multiple dimensions,
  prioritize, and produce a one-page summary for the oncall.'
version: 0.1.0

state:
  schema:
    incident: { type: object }
    dimensions: { type: array, items: { type: object } }
    findings: { type: array, items: { type: object }, merge: array_append }
    prioritized_findings: { type: array, items: { type: object } }
    summary: { type: string }

graph:
  nodes:
    - id: fetch_incident
      kind: tool
      phase: triage
      impl: ./tools/fetch_incident.mjs
      writes: [incident]
    - id: seed_dimensions
      kind: tool
      phase: triage
      impl: ./tools/list_dimensions.mjs
      writes: [dimensions]
    - id: investigate
      kind: agent
      phase: triage
      prompt: ./prompts/investigate.md
      for_each: { source: $.dimensions, concurrency: 3 }
      reads: [incident]
      schema:
        type: object
        required: [findings]
        properties:
          findings:
            type: array
            items:
              type: object
              required: [title, evidence, impact]
              properties:
                title: { type: string }
                evidence: { type: string }
                impact: { type: string }
      writes: [findings]
    - id: prioritize
      kind: agent
      phase: synthesis
      prompt: ./prompts/prioritize.md
      reads: [findings, incident]
      schema:
        type: object
        required: [prioritized_findings]
        properties:
          prioritized_findings:
            type: array
            items:
              type: object
              required: [title, priority]
              properties:
                title: { type: string }
                priority: { type: string }
      writes: [prioritized_findings]
    - id: summary
      kind: agent
      phase: synthesis
      prompt: ./prompts/summary.md
      reads: [incident, prioritized_findings]
      schema:
        type: object
        required: [summary]
        properties:
          summary: { type: string }
      writes: [summary]
  edges:
    - { from: fetch_incident, to: seed_dimensions }
    - { from: seed_dimensions, to: investigate }
    - { from: investigate, to: prioritize }
    - { from: prioritize, to: summary }
```

The canonical implementation is at [`examples/oncall-runbook`](https://github.com/xingchengxu/OpenExpertise/tree/main/examples/oncall-runbook).

## What you'd see after 5 real runs

Wall time is roughly 45 seconds for a standard 3-dimension runbook at `concurrency: 3`. The TUI shows the three investigation threads launching simultaneously in the triage phase, completing within a few seconds of each other, then the prioritize and summary calls completing sequentially.

`oe state summary` prints the one-pager immediately after the run. For a typical latency spike incident, it reads something like: _"P95 latency spiked to 2400ms at 02:14 UTC. Likely cause: connection pool exhaustion on the orders-db replica (saturation finding, high confidence). Error rate spiked 90 seconds later as queries timed out. Saturation finding: pool size config has not been updated since the Q1 replica count doubled. Immediate action: raise pool size or rollback the Q1 replica change."_

After 5 real incidents, `oe evolve <run-id>` typically proposes: "Add a `recent_deploys` context field — 3 of 5 incidents had a deploy within 30 minutes of the page; including this in the investigate prompt would improve root-cause confidence."

The JSONL event log is the post-mortem artifact. Every token spent, every finding produced, every prioritization decision — all queryable with `oe inspect <run-id>` and pipeable to your SIEM.

## Why this is durable (and not just a one-off script)

- **Replay any past incident** with `oe run . --args incident_id=INC-4421`. The investigation runs fresh against current data, but the graph shape and prompts are pinned — you can see exactly what the runbook would have said at that moment.
- **Version control your runbook.** The `prompts/investigate.md` and `list_dimensions.mjs` files live in git. PR review on runbook changes. Changelog for every update. No more "what version of the runbook did we run last Tuesday?"
- **Resume from cached results.** If the `investigate` phase completed but `prioritize` failed (e.g., LLM timeout), `oe resume <run-id>` replays from the checkpoint — the three investigation calls are not re-run.
- **Add dimensions without changing agents.** Update `list_dimensions.mjs` to add a `disk_saturation` dimension and every future run includes it. The fan-out is data-driven, not code-driven.
- **Wire to PagerDuty webhook.** A GitHub Actions workflow that triggers `oe run` on PagerDuty webhook events turns this into a fully automated first-responder that fires before the on-call engineer is even awake.

## Estimated time investment

|                                                         | Time          | Note                                       |
| ------------------------------------------------------- | ------------- | ------------------------------------------ |
| First scaffold (clone `examples/oncall-runbook`)        | ~5 min        |                                            |
| Point `fetch_incident` at your alert system             | ~30 min       | PagerDuty webhook or Opsgenie API          |
| Tune the `investigate.md` prompt for your stack         | ~45 min       | Add context about your specific dashboards |
| First useful run on a real incident                     | ~90 min total |                                            |
| Wire to PagerDuty webhook (GitHub Actions)              | ~1 hour       |                                            |
| Production-ready (post-mortem integration, SIEM export) | ~4 hours      |                                            |

## See also

- [examples/oncall-runbook](/examples/oncall-runbook) — the bundled reference implementation
- [Fan-out with concurrency](/cookbook/fan-out-with-concurrency) — how `for_each` + `concurrency` works
- [Resume + cache](/guide/resume-cache) — checkpoint recovery when one dimension times out
- [Observability](/operations/observability) — piping the JSONL trail to Datadog, Splunk, or Elastic
