# Scheduler (Sequential + Parallel)

The scheduler is the part of the runtime that walks the DAG and dispatches nodes. OpenExpertise ships two:

- **`SequentialScheduler`** — runs ready nodes one at a time in topological order. The default.
- **`ParallelScheduler`** — runs all ready nodes in the current wave concurrently, bounded by `runtime.concurrency`. Subclasses `SequentialScheduler` to inherit pipeline + loop passes.

Both implement `run(): Promise<{ status, results }>`. The runner picks one based on configuration.

## Scheduler selection

```
runner.ts:
  cliConcurrency = opts.concurrency           ← --concurrency N
  yamlConcurrency = spec.runtime?.concurrency  ← runtime.concurrency in YAML
  effective = cliConcurrency ?? yamlConcurrency ?? 1
  scheduler = effective > 1
    ? new ParallelScheduler(dag, ctx, effective)
    : new SequentialScheduler(dag, ctx)
```

The CLI flag overrides YAML. YAML overrides the default of 1. **Concurrency = 1 means sequential**, no parallelism, regardless of what your DAG looks like.

## What "ready" means

A node is **ready** when:

- All its predecessors are in state `done` or `skipped` (not pending, not running, not failed).
- No incoming edge with `when:` evaluates to false.

Skipped predecessors cascade: by default, a node with at least one skipped predecessor is itself skipped. (To break the cascade, give the node a direct edge from a still-live earlier node. See [Control flow](/concepts/control-flow).)

## Sequential execution

The simple model:

```
for node in topological_order:
    if any predecessor was skipped:
        emit node.skipped
        continue
    if any when: edge is false:
        emit node.skipped
        continue
    if node has for_each:
        for item in source_array:
            await runNodeOnce(node, { $item: item, $index: idx })
    else:
        await runNodeOnce(node, {})
```

This is what you get with `runtime.concurrency: 1` (or unset).

## Parallel execution: waves

The parallel scheduler processes the DAG in **waves**:

- Wave 1: all nodes whose predecessor count (in the main pass) is 0
- Wave 2: all nodes whose predecessors are all in wave 1
- Wave 3: all nodes whose predecessors are all in waves 1+2
- ...

Each wave is dispatched with a bounded worker pool. The pool size is `min(runtime.concurrency, waveSize)`.

```
Wave 1:  [a, b, c, d]    — 4 independent siblings, up to 4 workers
Wave 2:  [e]             — depends on a
Wave 3:  [f]             — depends on e
```

For the example above, `runtime.concurrency: 4` gives you roughly `(50ms × 1) + 50ms + 50ms = ~150ms` (vs `4 × 50ms + ...` = ~200ms sequentially), saving ~25%.

The algorithm uses an `unmetCount` map. When a node finishes, its successors' counts decrement. When a count hits 0 the successor is ready.

```ts
while (unmetCount.size > 0) {
  const ready = [...wave nodes with count 0]
  if (ready.length === 0) break
  await runWithLimit(ready, this.concurrency, runOneInWave)
  for (const node of ready) {
    for (const succ of node.successors) unmetCount[succ]--
  }
}
```

See `packages/core/src/graph/parallel-scheduler.ts` for the full implementation (~130 LOC).

## `for_each` and concurrency

Two **independent** concurrency levers:

- **`runtime.concurrency`** — how many distinct nodes can be running in parallel.
- **`for_each.concurrency`** — how many iterations of one fanned-out node can be in flight.

They compose: `runtime.concurrency: 4` + a single node with `for_each.concurrency: 8` means up to **8** iterations of that one node are running (because there's only one node), all consuming workers from the same Node.js event loop.

The `runWithLimit` helper (exported from `packages/core/src/graph/scheduler.ts`) is what both layers use.

## Pipelines + loops

Both schedulers run **pipelines** and **loops** in the same way (sequential). The parallel scheduler inherits `runPipelineAndLoopPasses()` from the sequential one — only the main topo pass is parallelized.

This is a deliberate V1 choice. Pipelines have stronger per-item ordering semantics (item-1 must finish all stages before item-2 starts) that are harder to parallelize correctly. Loops have an inherent dependency between iterations.

If you want a parallel pipeline today, model it as `for_each` instead — same parallelism, different semantics.

## What's NOT in V1

- **Work-stealing.** Once a worker is assigned to a wave node, it doesn't get reassigned mid-flight.
- **Inter-node cancellation.** If node A fails, in-flight wave-mates keep running to completion. Only **future** waves see the failure (and by default skip).
- **Streaming / pipelining.** Wave 2 starts only after wave 1 is fully done — even if a wave-1 node finished early, wave 2 doesn't peek.
- **Custom schedulers.** You can write one (the interface is `{ run(): Promise<{...}> }`), but the runner doesn't expose a pluggability hook in V1.

## Throughput vs determinism

The parallel scheduler can speed up wide DAGs significantly (the [release-gates example](/examples/release-gates) has 4 independent scan nodes — 4× speedup with concurrency: 4). But it adds two flavors of non-determinism:

1. **Event ordering.** Two nodes finishing "at the same time" may interleave their `state.write` events. `oe inspect` sorts by `ts` to give you a stable read-back.
2. **State write order on the same field.** With `array_append`, the order of array elements depends on the order wave workers commit their writes. For most use cases that doesn't matter; if it does, switch to sequential or use `set_once` / `last_wins`.

→ Continue with [Dispatchers](/concepts/dispatchers).
