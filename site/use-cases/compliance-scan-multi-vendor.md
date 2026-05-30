---
title: Multi-vendor compliance scan
description: Cross-check security findings across Claude Code and Codex before release — reduce single-model false positives and false negatives with a structured multi-vendor verdict.
---

# Multi-vendor compliance scan

Security and compliance teams face a reliability problem with single-model AI scanning: the false-positive rate is high enough to create alert fatigue, and the false-negative rate is high enough that teams can't gate releases on a single model's verdict. The dominant workaround — running two scans manually and diffing the results — doesn't scale past one engineer doing it by hand.

The cross-vendor orchestration pattern solves this: two models scan the same diff independently, a third synthesizes their findings into a structured verdict, and the result feeds directly into your ticket system. The 30% cost overhead (vs. one model) is routinely worth it for findings that gate a release.

## The shape

```
fetch_diff (tool)
      ↓
claude_scan (cli-agent, provider: claude-code)  → summary
      ↓
codex_crosscheck (cli-agent, provider: codex)   → critique
      ↓
verdict_synthesis (agent)                       → verdict (structured JSON)
      ↓
create_ticket (tool)                            → ticket_url
```

The first two nodes run sequentially: Claude Code summarizes the security surface, Codex is given the summary and the diff and asked to challenge it. The synthesis agent consolidates both into a structured finding with cite, severity, and remediation. The last tool posts to your ticket system.

## How OpenExpertise builds it

`cli-agent` nodes drive full coding assistants — Claude Code, Codex, Gemini — as first-class graph citizens, with the same `reads:` / `writes:` state contracts as any other node. The shared SQLite blackboard is what lets three different AI systems exchange context without a custom API: Claude Code writes `summary` to state, Codex reads it and writes `critique`, the synthesis agent reads both.

The synthesis `agent` node uses structured output to enforce a consistent finding schema — `cite`, `severity` (an enum: `low / medium / high / critical`), and `remediation`. AJV validates the output before it reaches `create_ticket`. Invalid LLM output fails loudly rather than silently producing a malformed ticket.

The `create_ticket` tool stub posts to Jira / Linear / GitHub Security Advisories — whichever your team uses. The stub is the one place real integration work happens.

```yaml
name: compliance-scan-multi-vendor
description: Cross-vendor security scan — Claude Code summarizes, Codex cross-checks,
  Anthropic API synthesizes verdict.
version: 0.1.0

state:
  schema:
    diff: { type: string }
    summary: { type: string }
    critique: { type: string }
    verdict: { type: object }
    ticket_url: { type: string }

graph:
  nodes:
    - id: fetch_diff
      kind: tool
      phase: collect
      impl: ./tools/fetch_diff.mjs
      writes: [diff]
    - id: claude_scan
      kind: cli-agent
      provider: claude-code
      prompt: |
        You are a security reviewer. Summarize the security surface of this diff
        in 3-5 bullet points. Flag any SQL injection, auth bypass, or secrets
        in plaintext. Be specific: cite file + line range.

        Diff: {{diff}}
      reads: [diff]
      writes: [summary]
      timeout_ms: 120000
    - id: codex_crosscheck
      kind: cli-agent
      provider: codex
      prompt: |
        A security reviewer summarized this diff: {{summary}}

        Original diff for reference: {{diff}}

        In 2-3 sentences, identify anything the summary missed or overstated.
        Be specific: cite file + line range if you find something new.
      reads: [diff, summary]
      writes: [critique]
      timeout_ms: 120000
    - id: verdict_synthesis
      kind: agent
      phase: synthesize
      prompt: ./prompts/verdict.md
      reads: [summary, critique]
      schema:
        type: object
        required: [verdict]
        properties:
          verdict:
            type: object
            required: [findings]
            properties:
              findings:
                type: array
                items:
                  type: object
                  required: [title, severity, cite, remediation]
                  properties:
                    title: { type: string }
                    severity: { type: string, enum: [low, medium, high, critical] }
                    cite: { type: string }
                    remediation: { type: string }
      writes: [verdict]
    - id: create_ticket
      kind: tool
      phase: deliver
      impl: ./tools/create_ticket.mjs
      reads: [verdict]
      writes: [ticket_url]
  edges:
    - { from: fetch_diff, to: claude_scan }
    - { from: claude_scan, to: codex_crosscheck }
    - { from: codex_crosscheck, to: verdict_synthesis }
    - { from: verdict_synthesis, to: create_ticket, when: 'length($.verdict.findings) > 0' }
```

This is a direct adaptation of [`examples/tri-cli-orchestration`](https://github.com/xingchengxu/OpenExpertise/tree/main/examples/tri-cli-orchestration), reframed for security scanning with a structured-output synthesis step and a ticket-creation tail.

## What you'd see after 5 real runs

Wall time is typically 90-180 seconds per scan, dominated by the two CLI agent calls (Claude Code and Codex both need to spin up). The TUI shows each node completing sequentially, with the `verdict_synthesis` agent producing the structured JSON finding list.

`oe state verdict` prints the structured finding list immediately after the run. A typical `critical` finding looks like:

```json
{
  "title": "SQL injection in order search endpoint",
  "severity": "critical",
  "cite": "src/api/orders.ts:142",
  "remediation": "Use parameterized queries. Replace string interpolation with prepared statement."
}
```

After 5 runs, `oe evolve <run-id>` typically proposes: "Add a `false_positive_check` agent before `create_ticket` — 2 of 5 `medium` findings were contested by engineers. A third-pass verifier reading the full file context (not just the diff) would reduce ticket noise."

## Why this is durable (and not just a one-off script)

- **Every finding has a full trace.** `oe inspect <run-id>` shows which model said what, the exact prompt versions, and the token counts. Auditors can replay any finding's provenance. For a hand-off artifact, `oe inspect <run-id> --html -o scan-report.html` emits a self-contained run report (the DAG coloured by node status + a per-node duration & token table) you can attach to the audit ticket.
- **Swap vendors without touching prompts.** If Codex is down, change `provider: codex` to `provider: gemini` in one line. The state contract (`summary` → `critique`) is vendor-neutral.
- **Resume after failure.** If Claude Code times out mid-scan, `oe resume <run-id>` replays from the checkpoint. You don't re-run the Codex call you already paid for.
- **Gate releases in CI.** A GitHub Actions step that runs `oe run` and checks `oe state verdict | jq '.findings | map(select(.severity == "critical")) | length'` gives you a numeric gate with a full audit trail.
- **Integration points.** `create_ticket.mjs` supports Jira, Linear, GitHub Security Advisories, and Slack webhooks — whichever your security team lives in.

## Estimated time investment

|                                                | Time           | Note                            |
| ---------------------------------------------- | -------------- | ------------------------------- |
| First scaffold (adapt `tri-cli-orchestration`) | ~10 min        |                                 |
| Install and auth Claude Code + Codex CLIs      | ~30 min        | One-time setup                  |
| Wire `create_ticket` to your ticket system     | ~1 hour        | The one place real work happens |
| Tune the `verdict.md` synthesis prompt         | ~30 min        | Iterate against real diffs      |
| First useful run on a real PR                  | ~2 hours total |                                 |
| CI integration (release gate)                  | ~1 hour        |                                 |
| Production-ready (false-positive tuning)       | ~1 day         |                                 |

## See also

- [examples/tri-cli-orchestration](/examples/tri-cli-orchestration) — the structural template this adapts
- [CLI agent with file edits](/cookbook/cli-agent-with-edits) — how `cli-agent` nodes call full coding assistants
- [Hybrid LLM routing](/cookbook/hybrid-llm-routing) — when to route to which provider
- [Structured output schemas](/cookbook/structured-output-schemas) — enforcing the finding schema with AJV
