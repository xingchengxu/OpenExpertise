---
title: Nested experiences
description: Invoke a reusable sub-experience from a parent flow using the experience node kind.
---

# Nested experiences

## Problem

Two or more flows share a common sub-workflow — issue triage, a quality gate, a data enrichment pipeline. You want to factor it out once and call it from both parents, without duplicating YAML or duplicating state fields.

## Solution

```yaml
# parent/experience.yaml
state:
  schema:
    issue_id: { type: string }
    triage_result: { type: object, merge: set_once }
    route_result: { type: string }

graph:
  nodes:
    - id: load_issue
      kind: tool
      impl: ./tools/load_issue.mjs
      writes: [issue_id]

    - id: triage_issue
      kind: experience
      path: ./sub-experiences/triage # relative to this experience.yaml
      args:
        issue_id: $.issue_id # JSONPath from parent state
      state_scope: isolated # sub-experience gets its own state namespace
      writes: [triage_result] # result promoted into parent state

    - id: route
      kind: tool
      impl: ./tools/route.mjs
      reads: [triage_result]
      writes: [route_result]

  edges:
    - { from: load_issue, to: triage_issue }
    - { from: triage_issue, to: route }
```

```yaml
# sub-experiences/triage/experience.yaml
state:
  schema:
    issue_id: { type: string }
    classification: { type: string }
    severity: { type: number }

graph:
  nodes:
    - id: classify
      kind: agent
      prompt: ./prompts/classify.md
      reads: [issue_id]
      schema:
        type: object
        properties:
          classification: { type: string }
          severity: { type: number }
        required: [classification, severity]
        additionalProperties: false
      writes: [classification, severity]

  # The sub-experience exposes its final state as its return value.
  # The parent's `writes: [triage_result]` captures the whole final snapshot.
```

## Walkthrough

The `kind: experience` node invokes a separate `experience.yaml` as a callable sub-workflow. The `args` map passes values from the parent's state (via JSONPath) into the sub-experience's initial state, so `issue_id` is available to `classify` inside.

`state_scope: isolated` (the default) means the sub-experience runs with its own state namespace. Reads and writes inside it do not touch the parent's SQLite state at all. When the sub-experience completes, its final state is serialized and written into the parent state under the field named in `writes`.

If `state_scope: shared` is used instead, the sub-experience reads and writes directly into the parent's state namespace. This is useful for thin "run this group of nodes" compositions where the sub-experience is just organizational, not truly reusable. Use `isolated` for reusable sub-workflows that should be testable on their own.

The sub-experience is cached the same way as any other node: its cache key is derived from its input args and the content hash of its `experience.yaml`. `oe resume` can re-enter a parent run that failed inside a sub-experience without re-running already-completed sub-experiences.

## Variations

- **Pass multiple args:** `args` is a plain object; add as many key-value pairs as needed.
- **Multiple sub-experiences in parallel:** Put two `kind: experience` nodes with no edges between them — the scheduler will dispatch them concurrently (subject to the parent's `concurrency` setting).
- **Registry-installed sub-experience:** `path` can be an absolute path or a registry name: `path: oe:triage-v2` if `triage-v2` is installed via `oe install`.

## See also

- [Concepts: The 6 node kinds](/concepts/node-kinds)
- [Concepts: node-experience](/concepts/node-experience)
- [Guide: Resume + cache](/guide/resume-cache)
- [Example: issue-triage](/examples/issue-triage)
