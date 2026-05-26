# Concurrency + 429 retry

Run independent nodes in parallel, fan-out iterations concurrently, and automatically back off on rate-limit errors.

## When you need this

- Your graph has multiple nodes with no data dependency between them and you want them to run in parallel.
- A `for_each` fan-out calls an LLM and you want N simultaneous calls instead of sequential.
- You are hitting 429 rate-limit errors from the Anthropic or OpenAI API.
- You want to tune the wall-clock time of a multi-node experience.

## The minimal example

Enable global parallelism for the experience:

```yaml
runtime:
  concurrency: 4
```

All nodes whose predecessors have already completed are collected into a "wave" and dispatched up to `concurrency` at a time. No code changes required.

For `for_each` fan-outs, set concurrency per node:

```yaml
- id: review
  kind: agent
  prompt: ./prompts/review.md
  for_each:
    source: $.dimensions
    concurrency: 3
  reads: [diff, dimensions]
  writes: [findings]
```

## How it works

**ParallelScheduler** (`packages/core/src/graph/parallel-scheduler.ts`) extends `SequentialScheduler`. When `runtime.concurrency > 1`, it replaces the sequential topological walk with a wave-based loop:

1. Build a map of each node's unmet predecessor count (counting only nodes in the main DAG pass, excluding pipeline stage nodes and loop body nodes).
2. Collect all nodes where the unmet count is 0 — these are "ready".
3. Dispatch the ready wave through `runWithLimit(waveItems, concurrency, fn)`.
4. After the wave completes, decrement successor counts for each completed node.
5. Repeat until no nodes remain.

**`runWithLimit`** (`packages/core/src/graph/scheduler.ts`) is a simple worker-pool: it starts `min(limit, items.length)` concurrent workers, each pulling from a shared index. This gives natural backpressure — a new item starts only when a worker slot frees.

**`for_each.concurrency`** uses the same `runWithLimit` function, scoped to the iterations of a single node. The global `runtime.concurrency` and the per-node `for_each.concurrency` are independent — both apply simultaneously if set.

**Pipeline and loop nodes** are always run sequentially by the inherited pass, regardless of `runtime.concurrency`.

**429 retry** is handled in `AnthropicLLMClient.callWithRetry` and `OpenAILLMClient.callWithRetry`: up to 4 attempts by default, with exponential backoff starting at 1 second (`1s, 2s, 4s, 8s`). This is separate from the node-level `on_error: { policy: retry }` — it operates at the HTTP call level, transparently to the scheduler.

## Variations

**Sequential (default)** — omit `runtime` entirely, or set `concurrency: 1`:

```yaml
runtime:
  concurrency: 1
```

**Aggressive parallel with per-node fan-out:**

```yaml
runtime:
  concurrency: 8

graph:
  nodes:
    - id: fetch_issues
      kind: tool
      impl: ./tools/fetch.mjs
      writes: [issues]
    - id: triage
      kind: agent
      prompt: ./prompts/triage.md
      for_each:
        source: $.issues
        concurrency: 5
      reads: [issues]
      writes: [labels]
```

Here up to 8 top-level waves run in parallel, and within the `triage` node, up to 5 issue-triage calls run simultaneously.

**Custom retry settings** at the LLM-client level (programmatic API):

```ts
import { AnthropicLLMClient } from '@openexpertise/node-kinds-agent'

const client = new AnthropicLLMClient({
  retry: { max_attempts: 6, base_ms: 500 },
})
```

**Node-level retry** for transient errors (network flakes, not just 429s):

```yaml
- id: call_api
  kind: tool
  impl: ./tools/call-api.mjs
  on_error:
    policy: retry
    attempts: 3
    backoff: exponential
    base_ms: 200
```

## Gotchas

- **State writes are not transactional across concurrent nodes.** If two nodes write the same field simultaneously, the last write wins (SQLite serializes writes, but order is non-deterministic). Use `merge: array_append` for fields written by fan-out iterations.
- **`runtime.concurrency` applies to the main DAG pass only.** Pipeline stages and loop bodies are always sequential.
- **The 429 retry inside the LLM client is invisible to the scheduler.** A node does not emit `node.failed` during a 429 retry — it just takes longer. The node-level `on_error` retry fires only if the LLM client exhausts all its attempts and throws.
- **Setting `for_each.concurrency` high while `runtime.concurrency` is 1** means multiple iterations of that one node run in parallel, but no two different nodes run at the same time. Both dials are independent.

## See also

- [Scheduler concept](/concepts/scheduler)
- [Error policies (on_error)](/guide/on-error) — retry at the node level
- [Resume + cache](/guide/resume-cache) — skip completed nodes on re-run
- [`oe run` CLI reference](/reference/cli/run)
