---
title: Retry with backoff
description: Use on_error to automatically retry a flaky node with linear or exponential backoff.
---

# Retry with backoff

## Problem

External API calls fail transiently. A tool node that hits GitHub's REST API, a database, or an internal service will occasionally return 5xx errors or time out. You want the run to succeed without manual intervention.

## Solution

```yaml
graph:
  nodes:
    - id: fetch_repo_metadata
      kind: tool
      impl: ./tools/github.mjs
      args:
        repo: 'org/name'
      writes: [repo_metadata]
      on_error:
        policy: retry
        max_attempts: 3
        backoff_ms: 500 # linear: 500 ms, then 1000 ms, then 1500 ms

    - id: fetch_coverage
      kind: tool
      impl: ./tools/coverage_api.mjs
      writes: [coverage]
      on_error:
        policy: retry
        max_attempts: 4
        backoff_ms: 1000
        backoff: exponential # 1000 ms, 2000 ms, 4000 ms

    - id: optional_enrichment
      kind: agent
      prompt: ./prompts/enrich.md
      reads: [repo_metadata]
      writes: [enriched]
      on_error:
        policy: skip # log + continue; downstream nodes tolerate missing field

  edges:
    - { from: fetch_repo_metadata, to: fetch_coverage }
    - { from: fetch_coverage, to: optional_enrichment }
```

## Walkthrough

`on_error.policy: retry` tells the runtime to re-execute the node on any thrown error or non-zero exit. The node's state delta from the failed attempt is discarded; the node runs again from scratch.

`backoff_ms` sets the base delay in milliseconds. With the default linear strategy, the wait before attempt `n` is `backoff_ms * n` — so 500 ms, 1 000 ms, 1 500 ms for three attempts. With `backoff: exponential` the wait is `backoff_ms * 2^(n-1)` — doubling each time.

After `max_attempts` all fail, the node enters the `failed` state and the error propagates normally (the run fails unless a parent node or the experience-level `on_error` catches it).

`policy: skip` is the other common choice: the node is marked `skipped`, its writes are not committed, and downstream nodes that read its output must tolerate missing values (e.g., by checking `when: '$.enriched != null'` on their edges).

The built-in Anthropic and OpenAI LLM clients handle HTTP 429 (rate limit) errors with their own exponential backoff independently of `on_error`. You don't need `on_error` on `kind: agent` nodes for rate-limit resilience — only for schema-validation failures or genuinely transient model errors.

## Variations

- **Fail-fast for deterministic errors:** Wrap the tool in a try/catch and re-throw only for retryable errors; throw a different sentinel error class for permanent failures that should not be retried.
<div v-pre>

- **Custom max_attempts per environment:** Use `args: { max_attempts: '{{$env.RETRY_ATTEMPTS}}' }` and set `RETRY_ATTEMPTS` in your environment to override at runtime.

</div>
- **Exponential with jitter:** The runtime doesn't add jitter natively. If you have many parallel retrying nodes and want to avoid thundering-herd, add jitter manually in the tool by sleeping `Math.random() * backoff_ms` before the actual API call.

## See also

- [Guide: Error policies (on_error)](/guide/on-error)
- [Guide: Concurrency + 429 retry](/guide/concurrency)
- [Concepts: Edges & control flow](/concepts/control-flow)
