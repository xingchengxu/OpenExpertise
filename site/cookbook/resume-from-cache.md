---
title: Resume from cache
description: Use oe resume to restart a failed or partial run from where it stopped, reusing completed-node results.
---

# Resume from cache

## Problem

A long-running experience with 10+ nodes fails on node 7 after 40 minutes of LLM calls. You fix the bug and want to continue from node 7 — not replay nodes 1-6.

## Solution

```yaml
# experience.yaml — nothing special needed; caching is on by default
state:
  schema:
    pr_url: { type: string }
    diff: { type: string }
    dimensions: { type: array, items: { type: object }, merge: set_once }
    findings: { type: array, items: { type: object }, merge: array_append }
    risk_score: { type: number }
    gate_result: { type: object }

graph:
  nodes:
    - id: fetch_diff
      kind: tool
      impl: ./tools/fetch_diff.mjs
      reads: [pr_url]
      writes: [diff]

    - id: list_dimensions
      kind: tool
      impl: ./tools/list_dimensions.mjs
      writes: [dimensions]

    - id: investigate
      kind: agent
      prompt: ./prompts/investigate.md
      reads: [diff]
      for_each:
        source: $.dimensions
        concurrency: 4
      schema:
        type: object
        properties:
          findings:
            type: array
            items: { type: object }
        required: [findings]
      writes: [findings]

    - id: score
      kind: tool
      impl: ./tools/score.mjs
      reads: [findings]
      writes: [risk_score]

    - id: gate
      kind: agent
      prompt: ./prompts/gate.md
      reads: [risk_score, findings]
      schema:
        type: object
        properties:
          gate_result: { type: object }
        required: [gate_result]
      writes: [gate_result]

  edges:
    - { from: fetch_diff, to: list_dimensions }
    - { from: list_dimensions, to: investigate }
    - { from: investigate, to: score }
    - { from: score, to: gate }
```

```bash
# First run — fails at the `gate` node
oe run experience.yaml --input pr_url=https://github.com/org/repo/pull/42
# → run-id: run_abc123

# Check what happened
oe inspect run_abc123

# Fix the prompt, then resume from the last checkpoint
oe resume run_abc123
```

## Walkthrough

Every completed node writes its output to `.openexpertise/runs/<run-id>/state.sqlite`. The cache key for each node is a deterministic hash of: the node's YAML definition (id, kind, prompt path, schema, args), the content hash of any prompt files or tool `.mjs` files it references, and the values of its `reads` fields from state at dispatch time.

When `oe resume <run-id>` is called, it reads the existing state from the run directory. Nodes whose cache key matches a previously-completed entry are skipped; their state delta is re-applied from the cache. Nodes that failed or were never reached are executed fresh.

This means: if you fix the `gate` prompt file, only `gate` re-runs. The four `investigate` iterations (and the LLM calls they made) are reused. If you change the `investigate` prompt, all `investigate` iterations re-run plus `score` and `gate` (because they depend on `findings`, which changed).

**Cache invalidation** happens automatically: changing any file that feeds into a node's cache key busts that node and all of its transitive successors.

To force a full re-run ignoring the cache: `oe run experience.yaml --no-cache`.

To re-run only a specific node: `oe resume <run-id> --from score` (re-runs `score` and everything downstream).

## Variations

- **Pin cache across runs:** Add `cache_key_extra: v2` to a node definition to namespace the cache. Bumping it from `v2` to `v3` busts the node for new runs without invalidating old run directories.
- **Disable caching for a node:** Set `cache: false` on a node that must never be memoized (e.g., a `fetch_current_time` tool).
- **Inspect cache hits:** `oe inspect <run-id>` shows `cached: true` in the timeline for each node that was served from cache.

## See also

- [Guide: Resume + cache](/guide/resume-cache)
- [Concepts: Cache key + memoization](/concepts/cache)
- [Reference: oe resume](/reference/cli/resume)
- [Reference: oe inspect](/reference/cli/inspect)
