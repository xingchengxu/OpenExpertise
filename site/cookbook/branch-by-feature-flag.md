---
title: Branch by feature flag
description: 'Use when: edges to route the graph at runtime based on a state value.'
---

# Branch by feature flag

## Problem

Not every run should execute every node. Sometimes a preceding node produces a value — a flag, a classification, a score — and you want to take different paths through the graph depending on what it is.

## Solution

```yaml
state:
  schema:
    issue_text: { type: string }
    classification:
      type: string
      enum: [bug, enhancement, question, duplicate]
    is_duplicate: { type: boolean }
    similar_issues:
      type: array
      items: { type: object }
      merge: set_once
    dedup_note: { type: string }
    route_result: { type: string }

graph:
  nodes:
    - id: classify
      kind: agent
      prompt: ./prompts/classify.md
      reads: [issue_text]
      schema:
        type: object
        properties:
          classification:
            type: string
            enum: [bug, enhancement, question, duplicate]
          is_duplicate: { type: boolean }
        required: [classification, is_duplicate]
        additionalProperties: false
      writes: [classification, is_duplicate]

    - id: search_similar
      kind: tool
      impl: ./tools/search_github.mjs
      reads: [issue_text]
      writes: [similar_issues]

    - id: dedup
      kind: agent
      prompt: ./prompts/dedup.md
      reads: [issue_text, similar_issues]
      schema:
        type: object
        properties:
          dedup_note: { type: string }
        required: [dedup_note]
        additionalProperties: false
      writes: [dedup_note]

    - id: route
      kind: tool
      impl: ./tools/route.mjs
      reads: [classification, is_duplicate, dedup_note]
      writes: [route_result]

  edges:
    - { from: classify, to: search_similar }
    # Only enter dedup if there are similar issues AND it looks like a duplicate
    - from: search_similar
      to: dedup
      when: 'length($.similar_issues) > 0 && $.is_duplicate == true'
    # route runs regardless of whether dedup ran
    - { from: search_similar, to: route }
    - { from: dedup, to: route }
```

## Walkthrough

`classify` runs first and writes two fields: a `classification` enum and an `is_duplicate` boolean. These are used by downstream `when:` expressions to decide which edges are live.

The edge from `search_similar` to `dedup` carries a compound `when:` guard: it only fires if there are similar issues in state _and_ `classify` already flagged the issue as a duplicate. If either condition is false, `dedup` is skipped entirely. Its successors are not automatically skipped — the edge from `search_similar` to `route` ensures `route` runs either way.

`when:` expressions are evaluated as JSONPath predicates against the current state snapshot at the moment an edge is about to be traversed. The full expression grammar is documented in [Concepts: Edges & control flow](/concepts/control-flow).

Common patterns:

```yaml
when: '$.risk_score > 0.5'
when: '$.classification == "bug"'
when: '!$.skipped_by_user'
when: 'length($.findings) > 0 && $.risk_score > 0.5'
```

## Variations

- **Multi-way branch:** Add multiple outgoing edges from a single node, each with a mutually exclusive `when:`. Only the matching branch fires; the rest are skipped.
- **Default branch:** Leave one outgoing edge without a `when:` — it always fires, acting as the "else" case.
- **Skip cascade:** If a skipped node is the _only_ predecessor of a downstream node, that downstream node is also skipped. To break the cascade, add a second edge from a live predecessor (see the `route` pattern above).

## See also

- [Concepts: Edges & control flow](/concepts/control-flow)
- [Example: issue-triage](/examples/issue-triage)
- [Cookbook: fan-out-with-concurrency](./fan-out-with-concurrency)
