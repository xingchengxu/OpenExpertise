# Plan D — Parallel Scheduler + 429 Handling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bounded-concurrency execution at two levels (within a `for_each` fan-out, and across independent DAG nodes), plus 429-aware retry on both LLM clients, plus stable event-log ordering in `oe inspect`.

**Architecture:** A small bounded-parallel helper (`runWithLimit`) handles concurrent iteration. The existing `SequentialScheduler` gains support for `for_each.concurrency: N`. A new `ParallelScheduler` processes the DAG in waves (each wave = nodes whose predecessors are all complete) with `runtime.concurrency` ceiling. `runExperience` picks the scheduler based on config + CLI flag. LLM clients gain a `retry` constructor option with exponential backoff on 429 / `rate_limit_error`. `oe inspect` sorts JSONL events by `ts` before rendering.

**Tech Stack:** TypeScript, no new external deps. Existing AJV / vitest patterns.

**Spec:** `docs/superpowers/specs/2026-05-26-ultraexpertise-and-v2-polish-design.md` (Plan D section)

---

## File Structure

**Modified:**

- `packages/schema/src/types.ts` — add `RuntimeSpec` interface + `runtime?: RuntimeSpec` on `ExperienceSpec`.
- `packages/schema/src/schemas/experience.schema.json` — add `runtime.concurrency` to root.
- `packages/schema/tests/validator.test.ts` — accept-valid + reject-invalid cases.
- `packages/core/src/graph/scheduler.ts` — honor `for_each.concurrency` via a new internal `runWithLimit` helper.
- `packages/core/tests/scheduler-concurrency.test.ts` (new) — verifies for_each runs in parallel.
- `packages/core/src/graph/parallel-scheduler.ts` (new) — wave-based DAG executor with bounded concurrency.
- `packages/core/tests/parallel-scheduler.test.ts` (new) — verifies independent nodes run concurrently.
- `packages/core/src/runner.ts` — choose Sequential or Parallel based on config + opts.
- `packages/core/src/index.ts` — export `ParallelScheduler`.
- `packages/cli/src/index.ts` — add `--concurrency <n>` flag to `oe run`.
- `packages/cli/src/commands/run.ts` — pass flag through to `runExperience`.
- `packages/node-kinds-agent/src/anthropic-client.ts` — retry on 429.
- `packages/node-kinds-agent/tests/anthropic-client.test.ts` — TDD retry behavior.
- `packages/llm-openai/src/client.ts` — retry on 429.
- `packages/llm-openai/tests/client.test.ts` — TDD retry behavior.
- `packages/cli/src/commands/inspect.ts` — sort events by `ts` before logging.

---

## Task 1: Schema — `runtime.concurrency`

**Files:**

- Modify: `packages/schema/src/types.ts`
- Modify: `packages/schema/src/schemas/experience.schema.json`
- Modify: `packages/schema/tests/validator.test.ts`

- [ ] **Step 1: Append failing tests to `validator.test.ts`**

```ts
describe('runtime.concurrency', () => {
  const base = {
    name: 'r',
    version: '0.1.0',
    state: { schema: { x: { type: 'string' } } },
    graph: {
      nodes: [{ id: 'n', kind: 'tool', impl: './n.mjs', writes: ['x'] }],
      edges: [],
    },
  }

  it('accepts a missing runtime block', () => {
    expect(() => validateExperienceSpec(structuredClone(base))).not.toThrow()
  })

  it('accepts runtime.concurrency: integer ≥ 1', () => {
    for (const c of [1, 2, 8, 64]) {
      const spec = structuredClone(base) as Record<string, unknown>
      spec.runtime = { concurrency: c }
      expect(() => validateExperienceSpec(spec)).not.toThrow()
    }
  })

  it('rejects runtime.concurrency: 0', () => {
    const spec = structuredClone(base) as Record<string, unknown>
    spec.runtime = { concurrency: 0 }
    expect(() => validateExperienceSpec(spec)).toThrow(/Schema validation failed/)
  })

  it('rejects runtime.concurrency: -1', () => {
    const spec = structuredClone(base) as Record<string, unknown>
    spec.runtime = { concurrency: -1 }
    expect(() => validateExperienceSpec(spec)).toThrow(/Schema validation failed/)
  })

  it('rejects runtime.concurrency: "4" (string)', () => {
    const spec = structuredClone(base) as Record<string, unknown>
    spec.runtime = { concurrency: '4' }
    expect(() => validateExperienceSpec(spec)).toThrow(/Schema validation failed/)
  })
})
```

- [ ] **Step 2: Confirm RED**

```bash
pnpm --filter @openexpertise/schema build && pnpm --filter @openexpertise/schema test 2>&1 | tail -15
```

- [ ] **Step 3: Add `RuntimeSpec` to `types.ts`**

In `packages/schema/src/types.ts`, find the `ExperienceSpec` interface (near the bottom). Add this BEFORE `ExperienceSpec`:

```ts
export interface RuntimeSpec {
  concurrency?: number // node-level concurrency ceiling; default 1
}
```

Then modify `ExperienceSpec` to add `runtime?: RuntimeSpec`:

```ts
export interface ExperienceSpec {
  name: string
  description?: string
  version: string
  state: StateSpec
  phases?: PhaseSpec[]
  graph: GraphSpec
  runtime?: RuntimeSpec
}
```

- [ ] **Step 4: Add `runtime` property to the JSON Schema**

In `packages/schema/src/schemas/experience.schema.json`, find the top-level `"properties": { ... }` block (under root). Add a `runtime` property alongside `name`, `version`, `state`, `graph`, etc.:

```json
    "runtime": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "concurrency": { "type": "integer", "minimum": 1 }
      }
    },
```

Make sure the surrounding commas are correct.

- [ ] **Step 5: Confirm GREEN**

```bash
pnpm --filter @openexpertise/schema build && pnpm --filter @openexpertise/schema test 2>&1 | tail -10
```

Expected: 5 new tests pass.

- [ ] **Step 6: Full suite — no regressions**

```bash
pnpm test 2>&1 | tail -5
```

Expected: 202 baseline + 5 new = **207 passing**.

- [ ] **Step 7: Commit**

```bash
git add packages/schema/src/types.ts packages/schema/src/schemas/experience.schema.json packages/schema/tests/validator.test.ts
git commit -m "feat(schema): add runtime.concurrency to ExperienceSpec"
```

---

## Task 2: `runWithLimit` helper + `for_each.concurrency` honored

**Files:**

- Modify: `packages/core/src/graph/scheduler.ts`
- Create: `packages/core/tests/scheduler-concurrency.test.ts`

The existing `for_each` loop in `SequentialScheduler.run()` (around line 84) is a plain `for` over items. Replace it with a bounded-parallel helper that respects `forEach.concurrency` (default 1, preserving current behavior).

- [ ] **Step 1: Write the failing test**

Create `packages/core/tests/scheduler-concurrency.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseExperienceYaml } from '@openexpertise/schema'
import { DispatcherRegistry, EventBus, runExperience } from '@openexpertise/core'

let dir: string
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

// A tool dispatcher that tracks max-concurrent-in-flight via a shared counter.
class CountingToolDispatcher {
  readonly kind = 'tool' as const
  public maxInFlight = 0
  public inFlight = 0

  async resolve() {
    return {}
  }
  async run() {
    this.inFlight++
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight)
    await new Promise((r) => setTimeout(r, 50))
    this.inFlight--
    return { state_delta: {} }
  }
}

const YAML = `
name: foreach-conc
version: 0.1.0
state:
  schema:
    items: { type: array }
    findings: { type: array, items: { type: object }, merge: array_append }
graph:
  nodes:
    - id: seed
      kind: tool
      impl: ./tools/seed.mjs
      writes: [items]
    - id: work
      kind: tool
      impl: ./tools/work.mjs
      for_each: { source: $.items, concurrency: 4 }
      writes: [findings]
  edges:
    - { from: seed, to: work }
`

describe('for_each concurrency', () => {
  it('runs iterations in parallel up to the configured limit', async () => {
    dir = mkdtempSync(join(tmpdir(), 'oe-foreach-'))
    writeFileSync(join(dir, 'experience.yaml'), YAML)
    // tools/seed.mjs produces 8 items
    require('node:fs').mkdirSync(join(dir, 'tools'), { recursive: true })
    writeFileSync(
      join(dir, 'tools/seed.mjs'),
      `export default async () => ({ state_delta: { items: [1,2,3,4,5,6,7,8] } })`,
    )
    // tools/work.mjs uses a counter via a global file
    writeFileSync(
      join(dir, 'tools/work.mjs'),
      `export default async () => ({ state_delta: { findings: [{}] } })`,
    )

    const spec = parseExperienceYaml(YAML)
    const counter = new CountingToolDispatcher()
    const dispatchers = new DispatcherRegistry()
    dispatchers.register(counter)

    const result = await runExperience({
      spec,
      experienceDir: dir,
      dispatchers,
      events: new EventBus(),
      args: {},
    })

    expect(result.status).toBe('success')
    // With concurrency: 4 and 8 items, max-in-flight should reach 4 (not 1, not 8).
    expect(counter.maxInFlight).toBeGreaterThanOrEqual(2)
    expect(counter.maxInFlight).toBeLessThanOrEqual(4)
  })

  it('preserves V1 behavior when concurrency is unset (sequential)', async () => {
    dir = mkdtempSync(join(tmpdir(), 'oe-foreach-seq-'))
    const yamlSeq = YAML.replace(/concurrency: 4/, '')
    writeFileSync(join(dir, 'experience.yaml'), yamlSeq)
    require('node:fs').mkdirSync(join(dir, 'tools'), { recursive: true })
    writeFileSync(
      join(dir, 'tools/seed.mjs'),
      `export default async () => ({ state_delta: { items: [1,2,3,4] } })`,
    )
    writeFileSync(
      join(dir, 'tools/work.mjs'),
      `export default async () => ({ state_delta: { findings: [{}] } })`,
    )

    const spec = parseExperienceYaml(yamlSeq)
    const counter = new CountingToolDispatcher()
    const dispatchers = new DispatcherRegistry()
    dispatchers.register(counter)

    const result = await runExperience({
      spec,
      experienceDir: dir,
      dispatchers,
      events: new EventBus(),
      args: {},
    })

    expect(result.status).toBe('success')
    // Sequential default: only one in flight at a time.
    expect(counter.maxInFlight).toBe(1)
  })
})
```

- [ ] **Step 2: Confirm RED**

```bash
pnpm exec vitest run packages/core/tests/scheduler-concurrency.test.ts 2>&1 | tail -15
```

Expected: first test fails (concurrency is parsed but ignored — maxInFlight stays at 1).

- [ ] **Step 3: Add `runWithLimit` helper + use it in `scheduler.ts`**

In `packages/core/src/graph/scheduler.ts`, add this helper near the top of the file (after imports, before the class):

```ts
async function runWithLimit<T>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<void>,
): Promise<void> {
  if (limit <= 1 || items.length <= 1) {
    for (let i = 0; i < items.length; i++) {
      await fn(items[i]!, i)
    }
    return
  }
  let nextIdx = 0
  const workers: Promise<void>[] = []
  const startWorker = async (): Promise<void> => {
    while (true) {
      const idx = nextIdx++
      if (idx >= items.length) return
      await fn(items[idx]!, idx)
    }
  }
  const n = Math.min(limit, items.length)
  for (let i = 0; i < n; i++) workers.push(startWorker())
  await Promise.all(workers)
}
```

In the for_each branch of `SequentialScheduler.run()` (around line 84), replace the sequential `for` loop:

```ts
let anyFanFailed = false
for (let idx = 0; idx < items.length; idx++) {
  await this.runNodeOnce(
    node,
    { $item: items[idx], $index: idx },
    skipped,
    results,
    edgeBuffer,
  )
  const last = results[results.length - 1]
  if (last?.status === 'failed') anyFanFailed = true
}
```

with the bounded-parallel version:

```ts
let anyFanFailed = false
const concurrency = forEach.concurrency ?? 1
await runWithLimit(items, concurrency, async (item, idx) => {
  await this.runNodeOnce(
    node,
    { $item: item, $index: idx },
    skipped,
    results,
    edgeBuffer,
  )
})
// After all iterations finish, check the recorded results for any failure
// that maps to *this* for_each node.
anyFanFailed = results
  .filter((r) => r.nodeId === node.id)
  .some((r) => r.status === 'failed')
```

The change from "check the last result" to "check all results for this node" is necessary because parallel ordering means the last entry isn't necessarily the most recent for THIS node.

Read the existing file to find the exact location and grab the `forEach` variable type — the existing line `const forEach = (node.spec as { for_each?: { source: string } }).for_each` should be updated to include `concurrency`:

```ts
const forEach = (node.spec as { for_each?: { source: string; concurrency?: number } }).for_each
```

- [ ] **Step 4: Confirm GREEN**

```bash
pnpm --filter @openexpertise/core build 2>&1 | tail -3
pnpm exec vitest run packages/core/tests/scheduler-concurrency.test.ts 2>&1 | tail -10
```

Expected: 2 tests pass.

- [ ] **Step 5: Full suite — no regressions**

```bash
pnpm test 2>&1 | tail -5
```

Expected: 207 + 2 = **209 passing**.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/graph/scheduler.ts packages/core/tests/scheduler-concurrency.test.ts
git commit -m "feat(core): honor for_each.concurrency via bounded-parallel helper"
```

---

## Task 3: `ParallelScheduler` — wave-based DAG execution

**Files:**

- Create: `packages/core/src/graph/parallel-scheduler.ts`
- Create: `packages/core/tests/parallel-scheduler.test.ts`
- Modify: `packages/core/src/index.ts` — export `ParallelScheduler`.

**Approach:** Re-use the existing `SequentialScheduler`'s public surface but override the main-pass loop. Compute "ready" sets (nodes whose preds are all done) and dispatch them with bounded concurrency. Pipelines and loops still run sequentially after the main pass (matching the existing scheduler's order).

For V1, we **subclass** `SequentialScheduler` and override only the main-pass loop. The pipeline + loop tails inherit. This minimizes duplication.

- [ ] **Step 1: Write the failing test**

Create `packages/core/tests/parallel-scheduler.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseExperienceYaml } from '@openexpertise/schema'
import {
  DispatcherRegistry,
  EventBus,
  runExperience,
  type NodeDispatcher,
} from '@openexpertise/core'

class CountingTool implements NodeDispatcher {
  readonly kind = 'tool' as const
  public maxInFlight = 0
  public inFlight = 0
  async resolve() {
    return {}
  }
  async run() {
    this.inFlight++
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight)
    await new Promise((r) => setTimeout(r, 50))
    this.inFlight--
    return { state_delta: {} }
  }
}

let dir: string
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

describe('ParallelScheduler', () => {
  it('runs 4 independent sibling nodes in parallel when runtime.concurrency=4', async () => {
    dir = mkdtempSync(join(tmpdir(), 'oe-parallel-'))
    mkdirSync(join(dir, 'tools'), { recursive: true })
    for (const id of ['a', 'b', 'c', 'd']) {
      writeFileSync(
        join(dir, `tools/${id}.mjs`),
        `export default async () => ({ state_delta: {} })`,
      )
    }
    const yaml = `
name: parallel-siblings
version: 0.1.0
runtime: { concurrency: 4 }
state:
  schema:
    a: { type: string }
    b: { type: string }
    c: { type: string }
    d: { type: string }
graph:
  nodes:
    - { id: a, kind: tool, impl: ./tools/a.mjs, writes: [a] }
    - { id: b, kind: tool, impl: ./tools/b.mjs, writes: [b] }
    - { id: c, kind: tool, impl: ./tools/c.mjs, writes: [c] }
    - { id: d, kind: tool, impl: ./tools/d.mjs, writes: [d] }
  edges: []
`
    writeFileSync(join(dir, 'experience.yaml'), yaml)
    const spec = parseExperienceYaml(yaml)
    const counter = new CountingTool()
    const dispatchers = new DispatcherRegistry()
    dispatchers.register(counter)

    const start = Date.now()
    const result = await runExperience({
      spec,
      experienceDir: dir,
      dispatchers,
      events: new EventBus(),
      args: {},
    })
    const elapsed = Date.now() - start

    expect(result.status).toBe('success')
    // 4 sibling nodes × 50ms each. Sequential = 200ms. Parallel = ~50ms (+overhead).
    // Allow generous slack; assert it didn't run fully sequentially.
    expect(elapsed).toBeLessThan(180)
    // Max concurrent reached at least 2.
    expect(counter.maxInFlight).toBeGreaterThanOrEqual(2)
  })

  it('respects dependency order (downstream waits for upstream)', async () => {
    dir = mkdtempSync(join(tmpdir(), 'oe-parallel-deps-'))
    mkdirSync(join(dir, 'tools'), { recursive: true })
    for (const id of ['a', 'b']) {
      writeFileSync(
        join(dir, `tools/${id}.mjs`),
        `export default async () => ({ state_delta: {} })`,
      )
    }
    const yaml = `
name: parallel-deps
version: 0.1.0
runtime: { concurrency: 4 }
state:
  schema:
    a: { type: string }
    b: { type: string }
graph:
  nodes:
    - { id: a, kind: tool, impl: ./tools/a.mjs, writes: [a] }
    - { id: b, kind: tool, impl: ./tools/b.mjs, writes: [b] }
  edges:
    - { from: a, to: b }
`
    writeFileSync(join(dir, 'experience.yaml'), yaml)
    const spec = parseExperienceYaml(yaml)
    const counter = new CountingTool()
    const dispatchers = new DispatcherRegistry()
    dispatchers.register(counter)

    const result = await runExperience({
      spec,
      experienceDir: dir,
      dispatchers,
      events: new EventBus(),
      args: {},
    })

    expect(result.status).toBe('success')
    // With a → b dependency, b cannot start until a finishes.
    // maxInFlight = 1 even with concurrency: 4.
    expect(counter.maxInFlight).toBe(1)
  })
})
```

- [ ] **Step 2: Confirm RED**

```bash
pnpm exec vitest run packages/core/tests/parallel-scheduler.test.ts 2>&1 | tail -15
```

Expected: first test fails because concurrency is not yet honored at the node level.

- [ ] **Step 3: Create `parallel-scheduler.ts`**

```ts
import { SequentialScheduler } from './scheduler.js'
import type { Dag, DagNode } from './dag.js'
import type { RunContext } from '../run/context.js'
import type { NodeRunResult } from './scheduler.js'
import { evaluateExpression } from '../expressions/evaluate.js'

export class ParallelScheduler extends SequentialScheduler {
  constructor(
    dag: Dag,
    ctx: RunContext,
    private readonly concurrency: number,
  ) {
    super(dag, ctx)
  }

  override async run(): Promise<{
    status: 'success' | 'failed' | 'partial'
    results: NodeRunResult[]
  }> {
    if (this.concurrency <= 1) {
      return super.run()
    }

    // For Plan D V1: only the main topo pass is parallelized. Pipelines + loops
    // still run sequentially via the parent class. To do that cleanly without
    // duplicating the pipeline/loop logic, we delegate to a custom main-pass
    // implementation here that mimics the parent's exact bookkeeping.
    //
    // Implementation note: we use the parent's protected helpers (runNodeOnce,
    // pipeline/loop tails) via super invocations where possible. Since
    // SequentialScheduler has its main pass tightly coupled to its run() method,
    // we re-implement the main pass here and then call into the parent's
    // pipeline/loop passes via a helper.

    const results: NodeRunResult[] = []
    const edgeBuffer = new Map<string, Record<string, unknown>>()
    const skipped = new Set<string>()
    const completed = new Set<string>()
    let anyFailed = false

    const pipelineStageIds = new Set(
      (this.ctx.spec.graph.pipelines ?? []).flatMap((p) => p.stages),
    )
    const loopBodyIds = new Set((this.ctx.spec.graph.loops ?? []).map((l) => l.body))

    // Filter the topo order to nodes the main pass should handle.
    const mainNodes = this.dag.topoOrder.filter(
      (n) => !pipelineStageIds.has(n.id) && !loopBodyIds.has(n.id),
    )

    // Track each node's unmet predecessor count.
    const unmetCount = new Map<string, number>()
    for (const n of mainNodes) {
      unmetCount.set(
        n.id,
        n.predecessors.filter((p) => mainNodes.some((m) => m.id === p)).length,
      )
    }

    // The ready set: nodes whose preds are all done.
    while (unmetCount.size > 0) {
      const ready: DagNode[] = []
      for (const [id, count] of unmetCount) {
        if (count === 0) {
          const node = this.dag.nodes.get(id)
          if (node) ready.push(node)
        }
      }
      if (ready.length === 0) {
        // Either we're done or there's a cycle (DAG building should reject).
        break
      }

      // Run this wave with bounded concurrency.
      await this.runWave(ready, edgeBuffer, skipped, completed, results, unmetCount)

      for (const r of results) {
        if (r.status === 'failed') anyFailed = true
      }
    }

    // Pipelines + loops + finalization: defer to the parent's run().
    // But the parent's run() re-does the main pass — we don't want that.
    // For V1: ParallelScheduler intentionally does NOT parallelize pipelines/loops.
    // To avoid re-running the main pass via the parent, we delegate by calling a
    // helper that runs only the pipeline + loop passes. That helper is exposed
    // here as a separate method on the parent (see scheduler.ts changes below).
    await this.runPipelineAndLoopPasses(edgeBuffer, skipped, results)

    if (results.some((r) => r.status === 'failed')) anyFailed = true
    const anySkipped = results.some((r) => r.status === 'skipped')

    let status: 'success' | 'failed' | 'partial' = 'success'
    if (anyFailed) status = 'failed'
    else if (anySkipped) status = 'partial'

    return { status, results }
  }

  private async runWave(
    wave: DagNode[],
    edgeBuffer: Map<string, Record<string, unknown>>,
    skipped: Set<string>,
    completed: Set<string>,
    results: NodeRunResult[],
    unmetCount: Map<string, number>,
  ): Promise<void> {
    // Bound concurrency at this.concurrency. Use a simple worker pool.
    const queue = wave.slice()
    const workers: Promise<void>[] = []
    const startWorker = async (): Promise<void> => {
      while (queue.length > 0) {
        const node = queue.shift()
        if (!node) return
        await this.runOneInWave(node, edgeBuffer, skipped, completed, results, unmetCount)
      }
    }
    const n = Math.min(this.concurrency, wave.length)
    for (let i = 0; i < n; i++) workers.push(startWorker())
    await Promise.all(workers)
  }

  private async runOneInWave(
    node: DagNode,
    edgeBuffer: Map<string, Record<string, unknown>>,
    skipped: Set<string>,
    completed: Set<string>,
    results: NodeRunResult[],
    unmetCount: Map<string, number>,
  ): Promise<void> {
    // Pred-skipped check
    const predSkipped = node.predecessors.some((p) => skipped.has(p))
    if (predSkipped) {
      skipped.add(node.id)
      this.ctx.events.emit({
        type: 'node.skipped',
        run_id: this.ctx.runId,
        node_id: node.id,
        ts: this.ctx.now(),
        reason: 'predecessor failed or skipped',
        ...(node.spec.phase ? { phase: node.spec.phase } : {}),
      })
      results.push({ nodeId: node.id, status: 'skipped' })
      this.markCompleted(node, unmetCount, completed)
      return
    }

    // when: edges
    if (node.incomingEdges.length > 0) {
      const fullState = this.ctx.store.snapshot()
      const anyEdgeDead = node.incomingEdges.some(
        (e) => e.when !== undefined && !Boolean(evaluateExpression(e.when, fullState)),
      )
      if (anyEdgeDead) {
        skipped.add(node.id)
        this.ctx.events.emit({
          type: 'node.skipped',
          run_id: this.ctx.runId,
          node_id: node.id,
          ts: this.ctx.now(),
          reason: 'when: condition false',
          ...(node.spec.phase ? { phase: node.spec.phase } : {}),
        })
        results.push({ nodeId: node.id, status: 'skipped' })
        this.markCompleted(node, unmetCount, completed)
        return
      }
    }

    // Delegate the actual execution (incl. for_each) to the parent's
    // single-node logic via a thin pass-through.
    await this.runSingleNodeDelegated(node, edgeBuffer, skipped, results)
    this.markCompleted(node, unmetCount, completed)
  }

  private markCompleted(
    node: DagNode,
    unmetCount: Map<string, number>,
    completed: Set<string>,
  ): void {
    completed.add(node.id)
    unmetCount.delete(node.id)
    // Decrement unmet count for each successor.
    for (const succId of node.successors ?? []) {
      const c = unmetCount.get(succId)
      if (c !== undefined && c > 0) unmetCount.set(succId, c - 1)
    }
  }
}
```

You may need to expose `runPipelineAndLoopPasses` and `runSingleNodeDelegated` as `protected` methods on `SequentialScheduler` (currently `runNodeOnce` is private). Read `scheduler.ts` and add `protected` accessors as needed:

In `scheduler.ts`, change:

```ts
private async runNodeOnce(...) { ... }
```

to:

```ts
protected async runNodeOnce(...) { ... }
```

And add a new `protected` method that runs ONLY the pipeline and loop passes (the code currently in lines ~108–250 of scheduler.ts after the main topo loop). Refactor that block into:

```ts
protected async runPipelineAndLoopPasses(
  edgeBuffer: Map<string, Record<string, unknown>>,
  skipped: Set<string>,
  results: NodeRunResult[],
): Promise<void> {
  // Move existing pipeline + loop logic here.
  // ... existing code ...
}
```

And in `SequentialScheduler.run()`, after the main `for (const node of this.dag.topoOrder)` loop, call `await this.runPipelineAndLoopPasses(edgeBuffer, skipped, results)` instead of having the pipeline/loop code inline.

Also add a thin pass-through:

```ts
protected async runSingleNodeDelegated(
  node: DagNode,
  edgeBuffer: Map<string, Record<string, unknown>>,
  skipped: Set<string>,
  results: NodeRunResult[],
): Promise<void> {
  // The for_each branch + single-node branch from the existing main loop.
  // Mirror the code from scheduler.ts around line 78–101.
  const forEach = (node.spec as { for_each?: { source: string; concurrency?: number } }).for_each
  if (forEach) {
    const { resolveExpression } = await import('../expressions/resolve.js')
    const fullState = this.ctx.store.snapshot()
    const sourceVal = resolveExpression(forEach.source, fullState)
    const items: unknown[] = Array.isArray(sourceVal) ? sourceVal : []
    const concurrency = forEach.concurrency ?? 1
    await runWithLimit(items, concurrency, async (item, idx) => {
      await this.runNodeOnce(
        node,
        { $item: item, $index: idx },
        skipped,
        results,
        edgeBuffer,
      )
    })
    return
  }
  await this.runNodeOnce(node, {}, skipped, results, edgeBuffer)
}
```

Export `runWithLimit` from `scheduler.ts` so the parallel scheduler can use it (or duplicate the small function — your call).

Also: make sure `DagNode` has a `successors` field (or compute it from the dag's edges). Read `packages/core/src/graph/dag.ts` to check. If absent, add it during dag construction.

- [ ] **Step 4: Update `packages/core/src/index.ts` to export `ParallelScheduler`**

Add an export line:

```ts
export { ParallelScheduler } from './graph/parallel-scheduler.js'
```

- [ ] **Step 5: Confirm GREEN**

```bash
pnpm --filter @openexpertise/core build 2>&1 | tail -5
pnpm exec vitest run packages/core/tests/parallel-scheduler.test.ts 2>&1 | tail -15
```

Both tests should pass.

- [ ] **Step 6: Full suite — no regressions**

```bash
pnpm test 2>&1 | tail -5
```

Expected: 209 + 2 = **211 passing**. Crucial: pipeline + loop tests still pass after the refactor that pulled them into `runPipelineAndLoopPasses`.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/graph/parallel-scheduler.ts packages/core/src/graph/scheduler.ts packages/core/src/index.ts packages/core/tests/parallel-scheduler.test.ts
git commit -m "feat(core): ParallelScheduler — wave-based bounded-concurrency DAG executor"
```

---

## Task 4: Wire scheduler selection + CLI `--concurrency` flag

**Files:**

- Modify: `packages/core/src/runner.ts`
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/cli/src/commands/run.ts`

- [ ] **Step 1: Modify `runner.ts` to pick the scheduler**

In `packages/core/src/runner.ts`, add a `concurrency?: number` field to `RunOpts`:

```ts
export interface RunOpts {
  spec: ExperienceSpec
  experienceDir: string
  dispatchers: DispatcherRegistry
  events?: EventBus
  args?: Record<string, unknown>
  dbPath?: string
  runId?: string
  eventLogPath?: string
  cache?: boolean
  concurrency?: number
}
```

Add the import:

```ts
import { ParallelScheduler } from './graph/parallel-scheduler.js'
```

In `runExperience()`, find the line `const scheduler = new SequentialScheduler(dag, ctx)`. Replace with:

```ts
const cliConc = opts.concurrency
const yamlConc = opts.spec.runtime?.concurrency
const effectiveConcurrency = cliConc ?? yamlConc ?? 1
const scheduler =
  effectiveConcurrency > 1
    ? new ParallelScheduler(dag, ctx, effectiveConcurrency)
    : new SequentialScheduler(dag, ctx)
```

- [ ] **Step 2: Add `--concurrency <n>` flag to CLI**

In `packages/cli/src/index.ts`, find the `program.command('run')` chain. Add the option BEFORE `.action(...)`:

```ts
.option('--concurrency <n>', 'node-level concurrency (overrides runtime.concurrency in YAML)', (v) =>
  Number.parseInt(v, 10),
)
```

In the `run` action, add `concurrency: cmdOpts.concurrency` to the `runCommand(...)` call.

- [ ] **Step 3: Pass through in `packages/cli/src/commands/run.ts`**

In `RunOpts`, add `concurrency?: number`. In the body, pass it to `runExperience({ ..., concurrency: opts.concurrency })`.

- [ ] **Step 4: Smoke + tests**

```bash
pnpm --filter @openexpertise/cli build 2>&1 | tail -3
node packages/cli/dist/bin.js run --help 2>&1 | grep concurrency
pnpm test 2>&1 | tail -5
```

Expected: `--concurrency` shown in help. Test count unchanged (no new tests; existing 211 still pass).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/runner.ts packages/cli/src/index.ts packages/cli/src/commands/run.ts
git commit -m "feat(cli): --concurrency flag + runtime.concurrency config drive scheduler selection"
```

---

## Task 5: AnthropicLLMClient retry on 429 (TDD)

**Files:**

- Modify: `packages/node-kinds-agent/src/anthropic-client.ts`
- Modify: `packages/node-kinds-agent/tests/anthropic-client.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/node-kinds-agent/tests/anthropic-client.test.ts` (read it first to see the existing scaffold):

```ts
describe('AnthropicLLMClient — 429 retry', () => {
  it('retries on 429 and succeeds after backoff', async () => {
    let callCount = 0
    const sdkClient = {
      messages: {
        create: async () => {
          callCount++
          if (callCount === 1) {
            const err: Error & { status?: number } = new Error('rate limited')
            err.status = 429
            throw err
          }
          return {
            content: [{ type: 'text', text: 'ok' }],
            usage: { input_tokens: 1, output_tokens: 1 },
            stop_reason: 'end_turn',
          } as never
        },
      },
    }
    const client = new AnthropicLLMClient({
      sdkClient: sdkClient as never,
      retry: { max_attempts: 3, base_ms: 1 }, // tiny backoff for tests
    })
    const result = await client.complete({
      model: 'm',
      messages: [{ role: 'user', content: 'x' }],
    })
    expect(callCount).toBe(2)
    expect(result.text).toBe('ok')
  })

  it('throws after exhausting retries', async () => {
    let callCount = 0
    const sdkClient = {
      messages: {
        create: async () => {
          callCount++
          const err: Error & { status?: number } = new Error('rate limited')
          err.status = 429
          throw err
        },
      },
    }
    const client = new AnthropicLLMClient({
      sdkClient: sdkClient as never,
      retry: { max_attempts: 3, base_ms: 1 },
    })
    await expect(
      client.complete({ model: 'm', messages: [{ role: 'user', content: 'x' }] }),
    ).rejects.toThrow(/rate limited|429/)
    expect(callCount).toBe(3)
  })

  it('does not retry on non-429 errors', async () => {
    let callCount = 0
    const sdkClient = {
      messages: {
        create: async () => {
          callCount++
          const err: Error & { status?: number } = new Error('internal')
          err.status = 500
          throw err
        },
      },
    }
    const client = new AnthropicLLMClient({
      sdkClient: sdkClient as never,
      retry: { max_attempts: 3, base_ms: 1 },
    })
    await expect(
      client.complete({ model: 'm', messages: [{ role: 'user', content: 'x' }] }),
    ).rejects.toThrow(/internal/)
    expect(callCount).toBe(1)
  })
})
```

- [ ] **Step 2: Confirm RED**

```bash
pnpm exec vitest run packages/node-kinds-agent/tests/anthropic-client.test.ts 2>&1 | tail -15
```

- [ ] **Step 3: Modify `anthropic-client.ts`**

Add a `RetryOpts` type and a `retry` field on the constructor opts:

```ts
export interface AnthropicRetryOpts {
  max_attempts?: number // default 4
  base_ms?: number // default 1000
}

export interface AnthropicLLMClientOpts {
  apiKey?: string
  sdkClient?: Pick<Anthropic, 'messages'>
  retry?: AnthropicRetryOpts
}
```

Add a private `retry` cached config and wrap the SDK call. Read the existing file to find where `this.sdk.messages.create(request)` is called. Replace it with:

```ts
const retry = {
  max_attempts: this.opts.retry?.max_attempts ?? 4,
  base_ms: this.opts.retry?.base_ms ?? 1000,
}
const response = await this.callWithRetry(retry, () => this.sdk.messages.create(request))
```

Add the helper method:

```ts
private async callWithRetry<T>(
  retry: { max_attempts: number; base_ms: number },
  fn: () => Promise<T>,
): Promise<T> {
  let lastErr: unknown
  for (let attempt = 1; attempt <= retry.max_attempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (!this.is429(err) || attempt === retry.max_attempts) {
        throw err
      }
      const wait = retry.base_ms * Math.pow(2, attempt - 1)
      await new Promise((r) => setTimeout(r, wait))
    }
  }
  throw lastErr
}

private is429(err: unknown): boolean {
  if (err && typeof err === 'object') {
    const e = err as { status?: number; name?: string }
    if (e.status === 429) return true
    if (e.name === 'RateLimitError') return true
  }
  return false
}
```

- [ ] **Step 4: Confirm GREEN**

```bash
pnpm --filter @openexpertise/node-kinds-agent build 2>&1 | tail -3
pnpm exec vitest run packages/node-kinds-agent/tests/anthropic-client.test.ts 2>&1 | tail -10
```

Expected: 3 new tests pass. Existing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add packages/node-kinds-agent/src/anthropic-client.ts packages/node-kinds-agent/tests/anthropic-client.test.ts
git commit -m "feat(anthropic-client): 429-aware retry with exponential backoff"
```

---

## Task 6: OpenAILLMClient retry on 429 (TDD)

**Files:**

- Modify: `packages/llm-openai/src/client.ts`
- Modify: `packages/llm-openai/tests/client.test.ts`

Same shape as Task 5.

- [ ] **Step 1: Append the failing tests**

```ts
describe('OpenAILLMClient — 429 retry', () => {
  it('retries on 429 and succeeds', async () => {
    let callCount = 0
    const sdkClient = {
      chat: {
        completions: {
          create: async () => {
            callCount++
            if (callCount === 1) {
              const err: Error & { status?: number } = new Error('rate limited')
              err.status = 429
              throw err
            }
            return {
              choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
              usage: { prompt_tokens: 1, completion_tokens: 1 },
            } as never
          },
        },
      },
    }
    const client = new OpenAILLMClient({
      sdkClient: sdkClient as never,
      retry: { max_attempts: 3, base_ms: 1 },
    })
    const result = await client.complete({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'x' }],
    })
    expect(callCount).toBe(2)
    expect(result.text).toBe('ok')
  })

  it('exhausts retries then throws', async () => {
    let callCount = 0
    const sdkClient = {
      chat: {
        completions: {
          create: async () => {
            callCount++
            const err: Error & { status?: number } = new Error('rate limited')
            err.status = 429
            throw err
          },
        },
      },
    }
    const client = new OpenAILLMClient({
      sdkClient: sdkClient as never,
      retry: { max_attempts: 3, base_ms: 1 },
    })
    await expect(
      client.complete({ model: 'gpt-4o', messages: [{ role: 'user', content: 'x' }] }),
    ).rejects.toThrow(/rate limited|429/)
    expect(callCount).toBe(3)
  })

  it('does not retry on non-429', async () => {
    let callCount = 0
    const sdkClient = {
      chat: {
        completions: {
          create: async () => {
            callCount++
            const err: Error & { status?: number } = new Error('bad request')
            err.status = 400
            throw err
          },
        },
      },
    }
    const client = new OpenAILLMClient({
      sdkClient: sdkClient as never,
      retry: { max_attempts: 3, base_ms: 1 },
    })
    await expect(
      client.complete({ model: 'gpt-4o', messages: [{ role: 'user', content: 'x' }] }),
    ).rejects.toThrow(/bad request/)
    expect(callCount).toBe(1)
  })
})
```

- [ ] **Step 2: Confirm RED**

```bash
pnpm exec vitest run packages/llm-openai/tests/client.test.ts 2>&1 | tail -15
```

- [ ] **Step 3: Modify `client.ts`**

Add the retry options + helper. Mirror Task 5's pattern.

Add types near the top of the existing file:

```ts
export interface OpenAIRetryOpts {
  max_attempts?: number // default 4
  base_ms?: number // default 1000
}
```

Update `OpenAILLMClientOpts`:

```ts
export interface OpenAILLMClientOpts {
  apiKey?: string
  sdkClient?: Pick<OpenAI, 'chat'>
  retry?: OpenAIRetryOpts
}
```

Wrap the SDK call. Find `await this.sdk.chat.completions.create(request as never)` and replace with:

```ts
const retry = {
  max_attempts: this.opts.retry?.max_attempts ?? 4,
  base_ms: this.opts.retry?.base_ms ?? 1000,
}
const response = await this.callWithRetry(retry, () =>
  this.sdk.chat.completions.create(request as never),
)
```

Note: the constructor doesn't currently keep `opts` around (looking at the existing code: `if (opts.sdkClient) { this.sdk = opts.sdkClient; return }` — opts is discarded). You'll need to store the retry config: add `private readonly retryOpts: OpenAIRetryOpts` and set it in the constructor.

Add the helper methods (same shape as Task 5):

```ts
private async callWithRetry<T>(
  retry: { max_attempts: number; base_ms: number },
  fn: () => Promise<T>,
): Promise<T> {
  let lastErr: unknown
  for (let attempt = 1; attempt <= retry.max_attempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (!this.is429(err) || attempt === retry.max_attempts) {
        throw err
      }
      const wait = retry.base_ms * Math.pow(2, attempt - 1)
      await new Promise((r) => setTimeout(r, wait))
    }
  }
  throw lastErr
}

private is429(err: unknown): boolean {
  if (err && typeof err === 'object') {
    const e = err as { status?: number; name?: string }
    if (e.status === 429) return true
    if (e.name === 'RateLimitError') return true
  }
  return false
}
```

- [ ] **Step 4: Confirm GREEN**

```bash
pnpm --filter @openexpertise/llm-openai build 2>&1 | tail -3
pnpm exec vitest run packages/llm-openai/tests/client.test.ts 2>&1 | tail -10
```

- [ ] **Step 5: Commit**

```bash
git add packages/llm-openai/src/client.ts packages/llm-openai/tests/client.test.ts
git commit -m "feat(llm-openai): 429-aware retry with exponential backoff"
```

---

## Task 7: `oe inspect` sorts events by `ts`

**Files:**

- Modify: `packages/cli/src/commands/inspect.ts`
- Modify: `packages/cli/tests/cli.test.ts` (or wherever existing CLI tests live; add a small inspect test)

With parallel execution, JSONL events may be written out of order. Sort by `ts` before display.

- [ ] **Step 1: Write the failing test**

Look at existing tests in `packages/cli/tests/` to find the right test file. If none cover `inspectCommand`, create `packages/cli/tests/inspect.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspectCommand } from '../src/commands/inspect.js'

let dir: string
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

describe('inspectCommand', () => {
  it('emits events sorted by ts even if the JSONL is out of order', async () => {
    dir = mkdtempSync(join(tmpdir(), 'oe-inspect-'))
    mkdirSync(join(dir, '.openexpertise/runs'), { recursive: true })
    const lines = [
      JSON.stringify({ type: 'node.started', node_id: 'b', ts: '2026-05-26T00:00:02Z' }),
      JSON.stringify({ type: 'node.started', node_id: 'a', ts: '2026-05-26T00:00:01Z' }),
      JSON.stringify({ type: 'node.finished', node_id: 'a', ts: '2026-05-26T00:00:03Z' }),
      JSON.stringify({ type: 'run.started', ts: '2026-05-26T00:00:00Z' }),
    ]
    writeFileSync(join(dir, '.openexpertise/runs/r1.jsonl'), lines.join('\n'))

    const emitted: Array<{ ts: string; type: string }> = []
    const logger = {
      info: (event: { ts: string; type: string }) => emitted.push({ ts: event.ts, type: event.type }),
      error: () => {},
      warn: () => {},
      debug: () => {},
    } as never

    const code = await inspectCommand({ experiencePath: dir, runId: 'r1', logger })
    expect(code).toBe(0)
    // Sorted by ts
    expect(emitted.map((e) => e.type)).toEqual([
      'run.started',
      'node.started', // a (00:01)
      'node.started', // b (00:02)
      'node.finished',
    ])
  })
})
```

- [ ] **Step 2: Confirm RED**

```bash
pnpm exec vitest run packages/cli/tests/inspect.test.ts 2>&1 | tail -10
```

- [ ] **Step 3: Modify `inspect.ts`**

```ts
import { readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Logger } from 'pino'

export interface InspectOpts {
  experiencePath: string
  runId: string
  logger: Logger
}

export async function inspectCommand(opts: InspectOpts): Promise<number> {
  const dir = resolve(opts.experiencePath)
  const logPath = join(dir, '.openexpertise', 'runs', `${opts.runId}.jsonl`)
  if (!existsSync(logPath)) {
    opts.logger.error({ logPath }, 'run log not found')
    return 1
  }
  const lines = readFileSync(logPath, 'utf8').trim().split('\n')
  const events: Array<{ type: string; ts?: string; [k: string]: unknown }> = lines
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l))
  // Stable sort by ts ascending. Events without a ts go to the end.
  events.sort((a, b) => {
    if (!a.ts && !b.ts) return 0
    if (!a.ts) return 1
    if (!b.ts) return -1
    return a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0
  })
  for (const event of events) {
    opts.logger.info(event, event.type)
  }
  return 0
}
```

- [ ] **Step 4: Confirm GREEN**

```bash
pnpm --filter @openexpertise/cli build 2>&1 | tail -3
pnpm exec vitest run packages/cli/tests/inspect.test.ts 2>&1 | tail -10
```

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/commands/inspect.ts packages/cli/tests/inspect.test.ts
git commit -m "feat(cli): oe inspect sorts events by ts (parallel-safe rendering)"
```

---

## Task 8: README + progress + final verify

**Files:**

- Modify: `README.md` (root)
- Modify: `docs/superpowers/overnight-progress.md`

- [ ] **Step 1: Update README**

Find the `## All CLI commands` table or the section about `oe run`. Append a subsection:

```markdown

### Concurrency

`oe run --concurrency <n>` runs independent DAG nodes (and `for_each` iterations whose `concurrency: N` is set) in parallel up to the configured ceiling. Defaults to 1 (sequential). You can also set `runtime.concurrency: N` at the top of `experience.yaml` to make a flow parallel-by-default.

LLM clients (Anthropic + OpenAI) retry up to 4 times on HTTP 429 (`rate_limit_error`) with exponential backoff, configurable via constructor opts. Non-429 errors are not retried.

`oe inspect <run-id>` sorts events by `ts` so a parallel run reads in chronological order.
```

- [ ] **Step 2: Append progress log**

In `docs/superpowers/overnight-progress.md`, append:

```markdown

---

## Plan D (V2) — Parallel Scheduler + 429 Handling (2026-05-26)

Branch: `feat/parallel-scheduler` (off `main`)
Spec: `docs/superpowers/specs/2026-05-26-ultraexpertise-and-v2-polish-design.md` (Plan D section)
Plan: `docs/superpowers/plans/2026-05-26-parallel-scheduler.md`

### What shipped

| Area | Result |
|---|---|
| Schema | `runtime.concurrency: integer ≥ 1` added under root spec. |
| Sequential `for_each` parallelism | `for_each.concurrency: N` finally honored (was parsed-but-ignored in V1). Bounded-parallel iteration via `runWithLimit`. |
| ParallelScheduler | New wave-based DAG executor. Subclasses SequentialScheduler so pipeline + loop passes are inherited untouched. |
| runner.ts | Picks Sequential or Parallel based on `cli --concurrency`, then `runtime.concurrency`, defaulting to 1. |
| CLI | `oe run --concurrency <n>` flag (integer). |
| LLM clients | Both Anthropic + OpenAI clients retry up to N attempts on HTTP 429 with exponential backoff. Configurable via `retry: { max_attempts, base_ms }` constructor opt. Defaults: 4 / 1000ms. |
| `oe inspect` | Sorts events by `ts` ascending — parallel runs read chronologically. |
| Tests | 5 schema + 2 for_each concurrency + 2 parallel scheduler + 3 anthropic retry + 3 openai retry + 1 inspect sort = 16 new (218 total expected). |

### Non-goals (per spec)

- No global token-bucket / leaky-bucket queue spanning the whole process.
- No streaming responses.
- No work-stealing scheduler.

### Next concrete actions

1. Merge `feat/parallel-scheduler` into `main`.
2. Manual smoke: run an example with `--concurrency 4` and verify TUI shows multiple nodes "▶" simultaneously.
3. V2 sprint complete after merge. Project should now exceed `/workflows`' published feature set on every architectural axis.
```

- [ ] **Step 3: Final verification**

```bash
pnpm clean && pnpm install && pnpm -r build 2>&1 | tail -5
pnpm typecheck 2>&1 | tail -3
pnpm lint 2>&1 | tail -3
pnpm format:check 2>&1 | tail -3
pnpm test 2>&1 | tail -5
```

Expected: clean across all. **218 tests passing**.

If format:check fails, run `pnpm format` and commit as `style: prettier formatting for parallel scheduler`.

- [ ] **Step 4: Commit + log**

```bash
git add README.md docs/superpowers/overnight-progress.md
git commit -m "docs: README concurrency section + Plan D progress"
git log --oneline main..HEAD | head -15
```
