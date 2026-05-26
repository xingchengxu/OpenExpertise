---
title: issue-triage
description: Classify, de-duplicate, label, and route an incoming GitHub issue through a conditional pipeline.
---

# issue-triage

_Triage an incoming GitHub issue: classify it, optionally check for duplicates, assign labels, and suggest an owner — with a [`when:`](/concepts/control-flow) conditional edge that skips the dedup step when no similar issues exist._

## What it demonstrates

- Three-phase pipeline: `classify → dedup → route`
- `when:` conditional edge — `dedup` only runs if `length($.similar_issues) > 0`
- Enum-constrained structured output (`type`, `severity`, `area`)
- Independent branches: `assign_labels` does NOT depend on `dedup` (skipped-node cascade awareness)
- Tool stub for similarity search (`search_similar.mjs`)

## The graph

```
load_issue → classify ──────────────────────────────┐
                  │                                  │
                  ▼                                  ▼
           search_similar                      assign_labels
                  │                                  │
                  │ when: length($.similar_issues)>0 ▼
                  ▼                            suggest_owner
              dedup
```

Phases: `classify` → `dedup` → `route`.

## State schema

| Field             | Type            | Description                                        |
| ----------------- | --------------- | -------------------------------------------------- |
| `issue`           | `object`        | Raw issue payload from `fixtures/issue.json`       |
| `classification`  | `object`        | `{type, severity, area}` from the `classify` agent |
| `similar_issues`  | `array<object>` | Candidates from the similarity search tool         |
| `is_duplicate`    | `boolean`       | Set by `dedup` agent (if it runs)                  |
| `duplicate_of`    | `string`        | Issue ID if duplicate (optional)                   |
| `labels`          | `array<string>` | Proposed labels (`merge: array_append`)            |
| `suggested_owner` | `string`        | GitHub handle for routing                          |

## How it runs

```bash
export ANTHROPIC_API_KEY=sk-...
oe run examples/issue-triage --tui
```

## What happens

1. `load_issue` reads `fixtures/issue.json` and writes the issue to state.
2. `classify` returns a structured classification. The enum constraints (`bug | feature | question | docs | chore`, `low | medium | high`) are enforced by the agent's JSON schema.
3. `search_similar` queries `fixtures/historical_issues.json` for issues with overlapping text. Writes `similar_issues`.
4. **Conditional edge:** if `similar_issues` is non-empty, `dedup` runs and sets `is_duplicate` + `duplicate_of`. If empty, `dedup` is skipped — and because `assign_labels` does _not_ depend on `dedup`, label assignment proceeds unconditionally.
5. `assign_labels` and `suggest_owner` complete the routing pass.

::: tip Why assign_labels doesn't depend on dedup
This is a deliberate design: if `assign_labels` depended on `dedup`, the scheduler would cascade `skipped` through to `assign_labels` whenever `similar_issues` was empty. By depending only on `classify`, labeling always runs. The comment in `experience.yaml` explains this pattern.
:::

## Try it: variations

**1. Swap the issue fixture.**
Replace `fixtures/issue.json` with a real GitHub issue payload (title + body + existing labels). Observe how the classification changes.

**2. Make the similarity search real.**
Replace `search_similar.mjs` with a call to your vector store or the GitHub search API. The rest of the graph is unchanged.

**3. Add a `close_duplicate` tool.**
After `dedup`, add a tool node with `when: '$.is_duplicate == true'` that calls the GitHub API to close the issue and post a comment linking to `duplicate_of`.

## Source

[examples/issue-triage/](https://github.com/xingchengxu/OpenExpertise/tree/main/examples/issue-triage)
