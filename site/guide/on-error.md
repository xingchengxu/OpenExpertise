# Error policies (on_error)

Control what happens when a node throws — skip it, abort the run, or retry with backoff.

## When you need this

- A network call in a `tool` node is flaky and you want automatic retries.
- A `cli-agent` node calls an external CLI and sometimes times out — you want to retry 3 times before giving up.
- One non-critical node failing should not abort the rest of the graph.
- A mandatory step failing should stop the run immediately instead of continuing with incomplete state.

## The minimal example

Retry a flaky node up to 3 times with exponential backoff:

```yaml
- id: call_api
  kind: tool
  impl: ./tools/call-api.mjs
  on_error:
    policy: retry
    attempts: 3
    backoff: exponential
    base_ms: 500
  writes: [api_result]
```

Attempt timeline: immediate → 500 ms → 1 s → give up and apply the fallback (skip or propagate, depending on downstream).

## How it works

The `on_error` block is evaluated inside `SequentialScheduler.runNodeOnce` (and the parallel equivalent). The three policies are:

**`skip` (default)** — if a node throws, it is marked as `failed`, a `node.failed` event is emitted, and all downstream nodes in the same topological path are skipped with reason `"predecessor failed or skipped"`. The run finishes with status `partial` rather than `success`. This is safe for non-critical steps.

**`fail_run`** — if the node throws, an error is thrown immediately, bubbling up and aborting the entire run. Use this for mandatory steps (e.g., a setup node that must succeed before any LLM calls).

**`retry`** — the scheduler loops `attempts` times. On each failure it sleeps before the next attempt:

- `backoff: linear` (default): `base_ms * attempt` — 100 ms, 200 ms, 300 ms, …
- `backoff: exponential`: `base_ms * 2^(attempt-1)` — 100 ms, 200 ms, 400 ms, …

`base_ms` defaults to `100`. After all attempts are exhausted, the node is treated as failed and the skip/fail_run cascade proceeds based on whether there is a nested policy — if `on_error` is `retry`, after exhausting attempts the node is skipped (same as `skip` policy). If you want exhaustion to abort the run, chain `fail_run` logic by setting `attempts` low and accepting the skip.

**Cascade semantics:** when a node fails and is skipped, all nodes that have it as a predecessor are also skipped, transitively. This means a failure in phase 1 will skip phases 2, 3, and 4 unless those nodes have independent predecessors or their own `on_error: { policy: skip }` (which is the default anyway — they are skipped, not failed).

## Variations

**Abort the run if a mandatory step fails:**

```yaml
- id: load_config
  kind: tool
  impl: ./tools/load-config.mjs
  on_error:
    policy: fail_run
  writes: [config]
```

**Retry a CLI call that sometimes times out:**

```yaml
- id: gemini_review
  kind: cli-agent
  provider: gemini
  prompt: |
    Review this diff for security issues: {{diff}}
  reads: [diff]
  writes: [security_findings]
  timeout_ms: 120000
  on_error:
    policy: retry
    attempts: 3
    backoff: exponential
    base_ms: 1000
```

**Linear backoff for a rate-limited API:**

```yaml
on_error:
  policy: retry
  attempts: 5
  backoff: linear
  base_ms: 2000 # 2s, 4s, 6s, 8s, 10s
```

**No error policy** (omit `on_error`) — equivalent to `{ policy: skip }`:

```yaml
- id: optional_enrichment
  kind: agent
  prompt: ./prompts/enrich.md
  writes: [enrichment]
  # no on_error — defaults to skip
```

## Gotchas

- **The default policy is `skip`, not `fail_run`.** Forgetting `on_error` on a mandatory node means a silent skip; downstream state is incomplete and the run ends as `partial` without an error message.
- **`retry` exhaustion does not abort the run.** After exhausting attempts, the node is skipped unless the overall run detects all nodes failed. Use `fail_run` explicitly if you want exhaustion to abort.
- **`base_ms` applies to the node-level retry sleep, not the LLM-client 429 retry.** The LLM client has its own backoff (default 4 attempts, starting at 1 s). Both are independent.
- **The schema enforces `attempts: 1..20`.** Setting `attempts: 0` or `attempts: 21` will fail `oe validate`.

## See also

- [Concurrency + 429 retry](/guide/concurrency) — LLM-client level retry
- [Resume + cache](/guide/resume-cache) — re-run from a checkpoint instead of retrying
- [Scheduler concept](/concepts/scheduler)
- [YAML schema reference](/reference/schema)
