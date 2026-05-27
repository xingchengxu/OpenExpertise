---
title: release-gates
description: Four parallel pre-release checks — license, changelog, coverage, security (via Claude Code) — fan into one go/no-go decision.
---

# release-gates

_Four independent pre-release checks run in the `scan` phase — license compliance, changelog breaking-change scan, test-coverage delta, and a Claude Code security review — then a single `score` agent fans them in and returns a release/no-release recommendation._

## What it demonstrates

- Mixing [`tool`](/concepts/node-tool), [`cli-agent`](/concepts/node-cli-agent), and [`agent`](/concepts/node-agent) in a single experience
- Fan-in pattern: four sibling nodes all pointing to one downstream node
- `cli-agent` with `provider: claude-code` and `output_format: json` — structured JSON output from a CLI tool
- No `for_each`: this is parallelism by sibling topology, not iteration
- Real `claude` CLI call for security review (mocked in CI)

## The graph

```
┌──────────────┐  ┌────────────────┐  ┌────────────────┐  ┌──────────────┐
│ license_check│  │ changelog_scan │  │ coverage_diff  │  │security_scan │
│   (tool)     │  │   (tool)       │  │   (tool)       │  │(cli-agent)   │
└──────┬───────┘  └───────┬────────┘  └───────┬────────┘  └──────┬───────┘
       │                  │                    │                   │
       └──────────────────┴────────────────────┴───────────────────┘
                                       │
                                       ▼
                                 ┌──────────┐
                                 │  score   │
                                 │ (agent)  │
                                 └──────────┘
```

Phases: `scan` → `gate`.

## State schema

| Field               | Type            | Merge          | Description                                                  |
| ------------------- | --------------- | -------------- | ------------------------------------------------------------ |
| `license_issues`    | `array<object>` | `array_append` | Non-allowlisted dependencies                                 |
| `breaking_changes`  | `array<object>` | `array_append` | Changelog lines flagged `[BREAKING]`                         |
| `coverage_delta`    | `object`        | —              | `{before, after, delta}` coverage numbers                    |
| `security_findings` | `array<object>` | `array_append` | From Claude Code's security review                           |
| `decision`          | `object`        | —              | `{ready_to_release, score, blocking_issues, recommendation}` |

## How it runs

```bash
export ANTHROPIC_API_KEY=sk-...        # for the score agent
# claude CLI must be on PATH and authenticated
oe run examples/release-gates --tui
```

::: warning Claude CLI required
The `security_scan` node invokes the `claude` CLI directly. Install and authenticate it before running. The other three `scan` nodes are pure tools — no CLI needed.
:::

## What happens

1. **scan phase** — all four nodes are independent; V1's sequential scheduler runs them in definition order, but a parallel scheduler would run them concurrently:
   - `license_check` reads `fixtures/deps.json` against an allowlist (`MIT, BSD-3-Clause, Apache-2.0, ISC`). Flags any others.
   - `changelog_scan` reads `fixtures/changelog.md` and flags lines containing `[BREAKING]` or `BREAKING CHANGE`.
   - `coverage_diff` compares `fixtures/coverage_before.json` vs `fixtures/coverage_after.json` and returns the delta.
   - `security_scan` spawns `claude` with the diff at `fixtures/diff.txt` and asks for JSON-structured security findings.

2. **gate phase** — `score` receives all four outputs and returns:

```json
{
  "ready_to_release": false,
  "score": 0.62,
  "blocking_issues": ["SQL injection in get_user endpoint"],
  "recommendation": "Fix the security finding before releasing."
}
```

## The security_scan node

```yaml
- id: security_scan
  kind: cli-agent
  provider: claude-code
  output_format: json
  prompt: |
    Review the diff at fixtures/diff.txt for security issues. Return JSON
    matching this schema: {"security_findings": [{"title": "...", "severity": "low|medium|high"}]}.
    If you find none, return {"security_findings": []}.
  writes: [security_findings]
  timeout_ms: 300000
```

This is how you hand off a security review to Claude Code from within an OE graph and get back structured data. The `output_format: json` binding tells the `CliAgentDispatcher` to parse stdout as JSON and merge it into state.

## Try it: variations

**1. Swap the diff fixture.**
Replace `fixtures/diff.txt` with the actual unified diff of your release branch (`git diff origin/main...HEAD > /tmp/release.diff`).

**2. Add a fourth scan: SBOM check.**
Add a `sbom_check` tool node in the `scan` phase. Add an edge `{ from: sbom_check, to: score }`. Update the `score` prompt to weight SBOM issues.

**3. Make it block CI.**
Wrap `oe run examples/release-gates` in a CI step. Check `oe state decision` with `jq '.ready_to_release'` and exit non-zero if false.

## Source

[examples/release-gates/](https://github.com/xingchengxu/OpenExpertise/tree/main/examples/release-gates)
