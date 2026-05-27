# Resume + cache

Skip nodes that already succeeded in a previous run — continue from where a failed or interrupted experience left off.

## When you need this

- A long-running experience failed halfway through and you want to re-run without paying for LLM calls that already succeeded.
- You are iterating on a late node and don't want to re-execute the expensive data-collection phase each time.
- You want to understand which nodes will be re-dispatched after a change to state or args.

## The minimal example

Resume a previous run:

```bash
oe resume examples/review-branch --run-id <run-id>
```

Find available run IDs:

```bash
ls examples/review-branch/.openexpertise/runs/
```

Or use the first run implicitly (most recent):

```bash
oe resume examples/review-branch
```

The cache is enabled automatically on `oe resume`. For `oe run`, you can opt in explicitly (it is also on by default in the CLI):

```bash
oe run examples/review-branch   # cache is on by default in the CLI
```

## How it works

**Cache key** (`packages/core/src/cache/key.ts`): computed as a SHA-256 hash over:

- The full node spec (kind, id, impl/prompt/provider, args, reads, writes, on_error, for_each)
- The `state_view` — the snapshot of declared `reads:` fields at dispatch time
- The `edge_inputs` — values forwarded from predecessor nodes
- The assembled `args`
- The runtime version string (currently `"0.1.0"`)

Any change to any of these inputs produces a different cache key and forces a re-dispatch.

**Cache store** (`packages/core/src/cache/store.ts`): each cache entry is a JSON file stored at `.openexpertise/cache/<sha256>.json` inside the experience directory. The file contains the full `NodeOutput` — `state_delta`, `edge_output`, and `metrics`. On a cache hit, the output is replayed: `state_delta` is written to the SQLite store, events are emitted, and `edge_output` is propagated to successors — as if the node had run.

**`oe resume`** (`packages/cli/src/commands/resume.ts`): reads `experience.yaml`, recovers the original `args` from the first event line in the run log (`.openexpertise/runs/<run-id>.jsonl`), then calls `runExperience` with `cache: true`. Nodes that already succeeded in the previous run have a matching cache key and are skipped. Nodes that failed or were skipped receive no cache hit and are dispatched fresh.

## Variations

**Inspect what's in the cache:**

```bash
ls examples/review-branch/.openexpertise/cache/
```

Each `.json` file is a node output keyed by SHA-256.

**Invalidate the cache for a specific node** by changing anything in the node spec — even adding a trailing space to a prompt file path. More commonly, just delete the cache directory:

```bash
rm -rf examples/review-branch/.openexpertise/cache/
oe run examples/review-branch
```

**Programmatic API** — pass `cache: true` (or a `CacheStore` instance):

```ts
import { runExperience, CacheStore } from '@openexpertise/core'

const result = await runExperience({
  spec,
  experienceDir: '/path/to/experience',
  dispatchers,
  events,
  args: {},
  cache: true, // uses the default .openexpertise/cache/ path
})
```

Or supply a custom cache directory:

```ts
import { CacheStore } from '@openexpertise/core'

const cache = new CacheStore({ dir: '/tmp/my-cache' })
await runExperience({ ..., cache })
```

## Gotchas

- **The cache key includes the state view at dispatch time.** If an upstream node's output changed (different `state_delta`), downstream nodes get new cache keys automatically. You don't need to manually invalidate downstream entries.
- **`for_each` iterations each get their own cache entry.** If you add a new item to the list, only the new iteration is dispatched; existing iterations are served from cache (assuming their `$item` and `$index` are the same).
- **`oe resume` recovers args from the run log, not from `--args`.** If you pass `--args` to `oe resume`, those args are ignored — the original run's args are always used for consistency.
- **Cache entries are never auto-expired.** If you want the experience to always re-run everything, pass `cache: false` or delete `.openexpertise/cache/` before each run.

## See also

- [Cache key + memoization concept](/concepts/cache)
- [Error policies (on_error)](/guide/on-error) — retry vs cache interaction
- [`oe resume` CLI reference](/reference/cli/resume)
- [Concurrency + 429 retry](/guide/concurrency)
