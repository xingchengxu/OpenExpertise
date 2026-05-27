# Cache key + memoization

Every node's run is **memoized** to a per-node cache under `.openexpertise/cache/`. If the same node, with the same inputs, has been seen before, the cached output is returned and no work is done. This makes `oe resume` instant and saves real money on LLM-backed nodes.

## What's cached

The cache stores `NodeOutput` (the `{ state_delta, edge_output?, metrics? }` triple) keyed by a content-addressed hash of:

- The node's `id`
- The node's `kind`
- The node's full spec (everything in the YAML node definition)
- The `RUNTIME_VERSION` constant (bumped to invalidate caches on breaking changes)
- The `bundle.state_view` (every field the node reads)
- The `bundle.edge_inputs` (every upstream `edge_output`)
- The `bundle.args` (resolved per-node args)
- For `for_each` iterations, the `$item` value too

See `packages/core/src/cache/key.ts` for the exact construction. It uses `object-hash` for stable hashing.

## How it's used

The scheduler checks the cache **before** invoking the dispatcher:

```ts
const cacheKey = computeCacheKey({ node, bundle, ... })
const hit = cache.get(cacheKey)
if (hit) {
  // emit node.started, apply state_delta from cache, emit node.finished
  // — no dispatcher call, no LLM call, no subprocess spawn
  return
}
// otherwise: dispatcher.run(...) and cache.set(cacheKey, output)
```

For deterministic tool nodes, this is harmless and useful. For LLM-backed nodes, it's a real cost saving — the same prompt + state combination won't call the LLM twice.

## When the cache is a hit

The cache hits when **every byte of the input bundle hashes the same**. Concretely:

- The node spec hasn't changed (no YAML edits).
- The reads-list values in state are byte-identical.
- The args resolve to the same values.
- The upstream edge outputs are identical.
- The `RUNTIME_VERSION` constant hasn't been bumped.

If you tweak the prompt by one character — that's a different node spec — cache miss.
If an upstream `tool` produces a slightly different output — cache miss for the downstream agent.

## `oe resume` uses this aggressively

```bash
oe resume r-abc123
```

Re-runs the experience pretending the prior run never failed at node X. Every successful node before X has a cache entry; resume just replays their state writes and proceeds to X. Only X (and any downstream nodes) actually execute.

This is most useful for long-running flows where you fix a bug in a late-stage node and don't want to re-pay the LLM bill for the early stages.

## Disabling the cache

Per-run:

```ts
await runExperience({ ..., cache: false })
```

There's no CLI flag yet (V1 ships cache-on; opt-out via API). To force a re-run of everything from the CLI today, the simplest thing is:

```bash
rm -rf .openexpertise/cache
oe run .
```

## What's NOT cached

- `cli-agent` nodes — the subprocess spawn is treated as non-deterministic. Caching here would require the parent flow to assume the CLI returns the same output for identical args, which it explicitly doesn't (Claude Code searches your codebase live, etc.).
- Nodes inside `for_each` iterations — actually these ARE cached, but per-iteration: each `$item` gets its own cache entry.
- Random-by-design tools — if your tool reads `Math.random()` or `Date.now()` and outputs based on it, the cache will hit on the SECOND run because the input bundle is identical but your tool would have produced a different value. Cache `false` if you need true non-determinism, or make the non-determinism an explicit input (e.g., pass a `seed` arg).

## Cache layout on disk

```
.openexpertise/cache/
├── <hash-1>.json
├── <hash-2>.json
└── ...
```

Each file is a single `NodeOutput` serialization. The cache is bounded only by disk space — it has no expiry policy in V1. If your experience grows large, periodically `rm -rf .openexpertise/cache` to reset.

## When caches go stale

The cache invalidates automatically on:

- **Node spec changes** — different hash key.
- **State changes** — different `state_view` hash.
- **Upstream edge changes** — different `edge_inputs` hash.
- **`RUNTIME_VERSION` bumps** — when OpenExpertise itself ships a breaking runtime change, the constant in `packages/core/src/graph/scheduler.ts` is bumped, invalidating everything.

The cache does **NOT** invalidate on:

- Time. A cached LLM response from a month ago is still served today if the inputs match.
- Model changes. If you change `model: claude-sonnet-4-6 → gpt-4o-2024-11-20` in the node spec, that IS a spec change and invalidates. But environment-level changes (different `ANTHROPIC_API_KEY`, different system prompt at the API level, model upgrades on the provider side) do not invalidate.

## Why this design

The cache exists because:

1. **LLM calls are expensive.** A 10-minute review-branch run costs cents per agent node. Across 20 reviews a day that's real money.
2. **Reproducibility.** Replaying a run yields the same intermediate state. Useful for debugging — you can mutate a prompt and only the downstream nodes rerun.
3. **Resume on failure.** When a late-stage node fails, fixing it shouldn't cost the upstream nodes again.

The trade-off is **silent staleness**. The cache won't know your model improved last week, or your fixture file rotated overnight, or your prompt is "almost the same" but a comma was added. The mitigation is `rm -rf .openexpertise/cache` when in doubt.

→ Continue with [Evolution loop](/concepts/evolution-loop).
