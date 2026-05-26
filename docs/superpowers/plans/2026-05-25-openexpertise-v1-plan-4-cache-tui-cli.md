# OpenExpertise V1 — Plan 4: Cache + Resume + TUI + Remaining CLI + Bounded Loop

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plan 4 closes the operational loop. (1) Cache + resume make iteration cheap. (2) Bounded loop (`repeat:`) finishes the spec §9 control-flow set. (3) TUI gives live observability. (4) Remaining CLI commands (`init`, `state`, `reset-state`, `resume`, `diff`-skeleton) round out the operator surface.

**Architecture:** Cache lives in `packages/core/src/cache/` as a hash-keyed JSON store under `.openexpertise/cache/`. Scheduler consults the cache before dispatching; on hit, it short-circuits with the recorded `NodeOutput`. Resume rebuilds args from the run's jsonl log. TUI ships as `@openexpertise/tui` (ink-based), subscribing to the event bus; CLI's `oe run --tui` swaps log output for the dashboard. Bounded loop is a graph-level construct in `spec.graph.loops` (similar to `pipelines`).

**Tech Stack additions:**
- `ink` ^5.0+ — React-for-CLI rendering
- `react` ^18.0+ — peer dep of ink (`ink` uses React)
- `object-hash` ^3.0+ — canonical hashing for cache keys

**Scope explicitly excluded** (Plan 5/6):
- Authoring skill — Plan 5
- Evolution advisor + `oe diff` content (the stub command shipping in this plan is a placeholder that says "coming in Plan 6") — Plan 6

---

## File structure

```
packages/core/src/cache/
├── key.ts                    # canonical hash for (node spec, bundle, runtime version)
└── store.ts                  # filesystem cache with get/put
packages/core/src/graph/
└── scheduler.ts              # MODIFIED: cache lookup + loop construct
packages/core/src/runner.ts   # MODIFIED: accept cache opt; pass into RunContext
packages/core/src/run/context.ts  # MODIFIED: cache field
packages/core/src/index.ts    # MODIFIED: export Cache types
packages/schema/src/types.ts  # MODIFIED: LoopSpec; graph.loops
packages/schema/src/schemas/experience.schema.json  # MODIFIED: loops, repeat
packages/cli/src/commands/
├── resume.ts                 # NEW: oe resume <run-id>
├── init.ts                   # NEW: oe init <name>
├── state.ts                  # NEW: oe state / oe reset-state
└── diff.ts                   # NEW: oe diff (Plan 6 placeholder)
packages/cli/src/index.ts     # MODIFIED: register new commands; --tui flag on run
packages/cli/package.json     # MODIFIED: add @openexpertise/tui dep
packages/tui/                 # NEW package
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts              # public exports (Dashboard component + start)
    └── dashboard.tsx         # ink component
e2e/
└── cache-resume.e2e.test.ts  # NEW
```

---

## Task 1: Cache key + store

**Files:**
- Create: `packages/core/src/cache/key.ts`
- Create: `packages/core/src/cache/store.ts`
- Create: `packages/core/tests/cache.test.ts`
- Add `object-hash` dep to core's `package.json`

- [ ] **Step 1.1: Add `object-hash` to core deps**

Edit `packages/core/package.json` `dependencies`:
```json
"object-hash": "^3.0.0"
```
And `devDependencies`:
```json
"@types/object-hash": "^3.0.6"
```
Then `pnpm install`.

- [ ] **Step 1.2: Implement `key.ts`**

Create `packages/core/src/cache/key.ts`:
```ts
import hash from 'object-hash'
import type { NodeSpec } from '@openexpertise/schema'

export interface CacheKeyInput {
  nodeSpec: NodeSpec
  stateView: Record<string, unknown>
  edgeInputs: Record<string, unknown>
  args: Record<string, unknown>
  runtimeVersion: string
}

export function computeCacheKey(input: CacheKeyInput): string {
  return hash(
    {
      n: input.nodeSpec,
      s: input.stateView,
      e: input.edgeInputs,
      a: input.args,
      v: input.runtimeVersion,
    },
    { algorithm: 'sha256', encoding: 'hex' },
  )
}
```

- [ ] **Step 1.3: Implement `store.ts`**

Create `packages/core/src/cache/store.ts`:
```ts
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import type { NodeOutput } from '../dispatcher/types.js'

export interface CacheStoreOpts {
  dir: string // absolute path to .openexpertise/cache/
}

export class CacheStore {
  constructor(private readonly opts: CacheStoreOpts) {
    mkdirSync(opts.dir, { recursive: true })
  }

  get(key: string): NodeOutput | undefined {
    const p = join(this.opts.dir, `${key}.json`)
    if (!existsSync(p)) return undefined
    return JSON.parse(readFileSync(p, 'utf8')) as NodeOutput
  }

  put(key: string, output: NodeOutput): void {
    const p = join(this.opts.dir, `${key}.json`)
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, JSON.stringify(output))
  }
}
```

- [ ] **Step 1.4: Write tests**

Create `packages/core/tests/cache.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { computeCacheKey, CacheStore } from '../src/index.js'
import type { NodeSpec } from '@openexpertise/schema'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'oe-cache-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

const baseNode: NodeSpec = { id: 'x', kind: 'tool', impl: 'x' }

describe('computeCacheKey', () => {
  it('is deterministic for the same inputs', () => {
    const k1 = computeCacheKey({
      nodeSpec: baseNode, stateView: { a: 1 }, edgeInputs: {}, args: { b: 2 },
      runtimeVersion: '0.1.0',
    })
    const k2 = computeCacheKey({
      nodeSpec: baseNode, stateView: { a: 1 }, edgeInputs: {}, args: { b: 2 },
      runtimeVersion: '0.1.0',
    })
    expect(k1).toBe(k2)
  })
  it('differs when any input changes', () => {
    const base = { nodeSpec: baseNode, stateView: { a: 1 }, edgeInputs: {}, args: { b: 2 }, runtimeVersion: '0.1.0' }
    const k0 = computeCacheKey(base)
    expect(computeCacheKey({ ...base, args: { b: 3 } })).not.toBe(k0)
    expect(computeCacheKey({ ...base, stateView: { a: 2 } })).not.toBe(k0)
    expect(computeCacheKey({ ...base, runtimeVersion: '0.2.0' })).not.toBe(k0)
  })
})

describe('CacheStore', () => {
  it('returns undefined for missing key', () => {
    const store = new CacheStore({ dir })
    expect(store.get('missing')).toBeUndefined()
  })
  it('roundtrips put → get', () => {
    const store = new CacheStore({ dir })
    store.put('abc', { state_delta: { x: 1 } })
    expect(store.get('abc')).toEqual({ state_delta: { x: 1 } })
  })
})
```

- [ ] **Step 1.5: Export from core index**

In `packages/core/src/index.ts` add:
```ts
export { computeCacheKey, type CacheKeyInput } from './cache/key.js'
export { CacheStore, type CacheStoreOpts } from './cache/store.js'
```

- [ ] **Step 1.6: Build + run tests + commit**

```bash
cd /Users/xuxingcheng/SHLAB/github/OpenExpertise/.claude/worktrees/overnight-plans-2-6
pnpm install
pnpm --filter @openexpertise/core build
pnpm vitest run packages/core/tests/cache.test.ts
git add packages/core/src/cache/ packages/core/src/index.ts packages/core/tests/cache.test.ts packages/core/package.json
git commit -m "feat(core): cache key + file-backed CacheStore"
```

---

## Task 2: Scheduler cache lookup

**Files:**
- Modify: `packages/core/src/run/context.ts` — add optional `cache?: CacheStore`
- Modify: `packages/core/src/runner.ts` — accept `cache: boolean`, instantiate CacheStore
- Modify: `packages/core/src/graph/scheduler.ts` — in `runNodeOnce`, check cache before dispatching
- Create: `packages/core/tests/scheduler-cache.test.ts`

- [ ] **Step 2.1: Update `RunContext`**

In `packages/core/src/run/context.ts`, add `cache?: CacheStore` to the constructor opts and as a readonly field. Import `CacheStore`:
```ts
import type { CacheStore } from '../cache/store.js'
```
Add field & opt:
```ts
readonly cache?: CacheStore
```
Constructor:
```ts
if (opts.cache) this.cache = opts.cache
```

For `exactOptionalPropertyTypes: true` compatibility, declare `cache?: CacheStore` (no `| undefined`).

- [ ] **Step 2.2: Update `runner.ts`**

Add `cache?: boolean` to `RunOpts`. Default true. Inside `runExperience`, create a `CacheStore` if enabled and pass to RunContext:

```ts
import { CacheStore } from './cache/store.js'

// inside runExperience:
const cacheEnabled = opts.cache !== false
let cache: CacheStore | undefined
if (cacheEnabled) {
  const cacheDir = join(runDir, 'cache')
  cache = new CacheStore({ dir: cacheDir })
}

const ctx = new RunContext({
  runId, spec: opts.spec, experienceDir: opts.experienceDir,
  store, events, dispatchers: opts.dispatchers, args: opts.args ?? {},
  ...(cache ? { cache } : {}),
})
```

- [ ] **Step 2.3: Update scheduler `runNodeOnce`**

At the top of `runNodeOnce`, after computing the `bundle`, compute the cache key and check:

```ts
    // Cache lookup (Plan 4)
    let cacheKey: string | undefined
    if (this.ctx.cache) {
      cacheKey = computeCacheKey({
        nodeSpec: node.spec,
        stateView: bundle.state_view as Record<string, unknown>,
        edgeInputs: bundle.edge_inputs,
        args: bundle.args,
        runtimeVersion: RUNTIME_VERSION,
      })
      const hit = this.ctx.cache.get(cacheKey)
      if (hit) {
        // Replay cached output without dispatching
        if (hit.state_delta && Object.keys(hit.state_delta).length > 0) {
          this.ctx.store.write(hit.state_delta, { runId: this.ctx.runId, nodeId: node.id })
          for (const field of Object.keys(hit.state_delta)) {
            this.ctx.events.emit({
              type: 'state.write', run_id: this.ctx.runId, node_id: node.id, field, ts: this.ctx.now(),
            })
          }
        }
        if (hit.edge_output !== undefined) {
          for (const succ of node.successors) {
            const existing = edgeBuffer.get(succ) ?? {}
            existing[node.id] = hit.edge_output
            edgeBuffer.set(succ, existing)
          }
        }
        this.ctx.events.emit({
          type: 'node.finished', run_id: this.ctx.runId, node_id: node.id,
          ts: this.ctx.now(),
          ...(node.spec.phase ? { phase: node.spec.phase } : {}),
          ...(hit.metrics ? { metrics: hit.metrics } : {}),
        })
        results.push({ nodeId: node.id, status: 'success', output: hit })
        return
      }
    }
```

In the success path (after `dispatcher.run` returns `output`), store the result:
```ts
        if (cacheKey && this.ctx.cache) {
          this.ctx.cache.put(cacheKey, output)
        }
```

Imports at the top of scheduler.ts:
```ts
import { computeCacheKey } from '../cache/key.js'

const RUNTIME_VERSION = '0.1.0' // bump to invalidate caches on breaking changes
```

- [ ] **Step 2.4: Write test**

Create `packages/core/tests/scheduler-cache.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  DispatcherRegistry, EventBus, StateStore, RunContext,
  SequentialScheduler, buildDag, CacheStore,
  type NodeDispatcher, type NodeOutput,
} from '../src/index.js'
import type { ExperienceSpec, NodeSpec } from '@openexpertise/schema'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'oe-cache-sched-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

describe('Scheduler cache integration', () => {
  it('replays from cache on second run with same inputs', async () => {
    const spec: ExperienceSpec = {
      name: 't', version: '0.1.0',
      state: { schema: { val: { type: 'number' } } },
      graph: {
        nodes: [{ id: 'x', kind: 'tool', impl: 'x', writes: ['val'] }],
        edges: [],
      },
    }
    let calls = 0
    const dispatcher: NodeDispatcher = {
      kind: 'tool',
      async resolve() { return {} },
      async run(): Promise<NodeOutput> {
        calls++
        return { state_delta: { val: 42 } }
      },
    }
    const cache = new CacheStore({ dir: join(dir, 'cache') })

    // First run: dispatcher invoked
    {
      const store = new StateStore({ dbPath: join(dir, 's1.sqlite'), spec })
      const dispatchers = new DispatcherRegistry()
      dispatchers.register(dispatcher)
      const ctx = new RunContext({
        runId: 'r1', spec, experienceDir: dir, store,
        events: new EventBus(), dispatchers, args: {}, cache,
      })
      await new SequentialScheduler(buildDag(spec), ctx).run()
      expect(store.get('val')).toBe(42)
      store.close()
    }
    expect(calls).toBe(1)

    // Second run: cache hit, dispatcher NOT invoked
    {
      const store = new StateStore({ dbPath: join(dir, 's2.sqlite'), spec })
      const dispatchers = new DispatcherRegistry()
      dispatchers.register(dispatcher)
      const ctx = new RunContext({
        runId: 'r2', spec, experienceDir: dir, store,
        events: new EventBus(), dispatchers, args: {}, cache,
      })
      await new SequentialScheduler(buildDag(spec), ctx).run()
      expect(store.get('val')).toBe(42)
      store.close()
    }
    expect(calls).toBe(1) // still 1 — cache replayed
  })
})
```

- [ ] **Step 2.5: Build + run + commit**

```bash
pnpm --filter @openexpertise/core build
pnpm vitest run packages/core/tests/scheduler-cache.test.ts
pnpm vitest run packages/core/
git add packages/core/src/run/context.ts packages/core/src/runner.ts packages/core/src/graph/scheduler.ts packages/core/tests/scheduler-cache.test.ts
git commit -m "feat(core): scheduler cache lookup + write-through"
```

---

## Task 3: Bounded loop (`repeat:`) in scheduler

**Files:**
- Modify: `packages/schema/src/types.ts` — add `LoopSpec`; `graph.loops?: LoopSpec[]`
- Modify: `packages/schema/src/schemas/experience.schema.json` — allow `loops`
- Modify: `packages/core/src/graph/scheduler.ts` — third pass for loops after pipelines
- Create: `packages/core/tests/scheduler-loop.test.ts`

- [ ] **Step 3.1: Schema updates**

In `packages/schema/src/types.ts`, add:
```ts
export interface LoopSpec {
  id: string
  body: string // node id to repeat
  until?: string // boolean expression
  max_iters?: number
  budget?: number // not enforced in V1; reserved
  phase?: string
}
```

Update `GraphSpec`:
```ts
export interface GraphSpec {
  nodes: NodeSpec[]
  edges: EdgeSpec[]
  pipelines?: PipelineGroupSpec[]
  loops?: LoopSpec[]
}
```

In `experience.schema.json`, add to graph `properties`:
```json
"loops": {
  "type": "array",
  "items": {
    "type": "object",
    "required": ["id", "body"],
    "additionalProperties": false,
    "properties": {
      "id": { "type": "string" },
      "body": { "type": "string" },
      "until": { "type": "string" },
      "max_iters": { "type": "integer", "minimum": 1 },
      "budget": { "type": "integer", "minimum": 0 },
      "phase": { "type": "string" }
    }
  }
}
```

- [ ] **Step 3.2: Modify `scheduler.ts` — third pass for loops**

After the pipelines pass in `run()`, add:

```ts
    // Loop groups (Plan 4 bounded loop). Each loop has a single body node
    // repeated up to max_iters times, terminating when `until` evaluates true.
    // Loop bodies must NOT appear in the main topological pass — track them too.
    const loops = this.ctx.spec.graph.loops ?? []
    for (const loop of loops) {
      const bodyNode = this.dag.nodes.get(loop.body)
      if (!bodyNode) {
        throw new Error(`Loop "${loop.id}" references unknown body node "${loop.body}"`)
      }
      const maxIters = loop.max_iters ?? 100
      if (!loop.until && !loop.max_iters) {
        throw new Error(`Loop "${loop.id}" must declare at least one of: until, max_iters`)
      }
      let iter = 0
      while (iter < maxIters) {
        const fullState = this.ctx.store.snapshot()
        if (loop.until && evaluateExpression(loop.until, fullState)) {
          break
        }
        await this.runNodeOnce(
          bodyNode,
          { $iter: iter, $loop: loop.id },
          skipped,
          results,
          edgeBuffer,
        )
        iter++
        const last = results[results.length - 1]
        if (last?.status === 'failed') {
          anyFailed = true
          break
        }
      }
    }
```

Also track loop bodies in the suppression set so the topological pass skips them:
```ts
    const loopBodyIds = new Set((this.ctx.spec.graph.loops ?? []).map((l) => l.body))
    // ...
    if (pipelineStageIds.has(node.id) || loopBodyIds.has(node.id)) continue
```

- [ ] **Step 3.3: Write test**

Create `packages/core/tests/scheduler-loop.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  DispatcherRegistry, EventBus, StateStore, RunContext,
  SequentialScheduler, buildDag,
  type NodeDispatcher, type NodeOutput, type NodeInputBundle,
} from '../src/index.js'
import type { ExperienceSpec, NodeSpec } from '@openexpertise/schema'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'oe-loop-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

describe('Bounded loop', () => {
  it('runs body until condition becomes true', async () => {
    const spec: ExperienceSpec = {
      name: 't', version: '0.1.0',
      state: { schema: { count: { type: 'number' } } },
      graph: {
        nodes: [{ id: 'inc', kind: 'tool', impl: 'x', writes: ['count'] }],
        edges: [],
        loops: [{ id: 'l', body: 'inc', until: '$.count >= 3', max_iters: 10 }],
      },
    }
    const store = new StateStore({ dbPath: join(dir, 's.sqlite'), spec })
    const dispatcher: NodeDispatcher = {
      kind: 'tool',
      async resolve() { return {} },
      async run(_impl, _b: NodeInputBundle, ctx): Promise<NodeOutput> {
        const current = (ctx.store.get('count') as number | undefined) ?? 0
        return { state_delta: { count: current + 1 } }
      },
    }
    const dispatchers = new DispatcherRegistry()
    dispatchers.register(dispatcher)
    const ctx = new RunContext({
      runId: 'r', spec, experienceDir: dir, store,
      events: new EventBus(), dispatchers, args: {},
    })
    await new SequentialScheduler(buildDag(spec), ctx).run()
    expect(store.get('count')).toBe(3)
    store.close()
  })

  it('terminates at max_iters even when until never true', async () => {
    const spec: ExperienceSpec = {
      name: 't', version: '0.1.0',
      state: { schema: { count: { type: 'number' } } },
      graph: {
        nodes: [{ id: 'inc', kind: 'tool', impl: 'x', writes: ['count'] }],
        edges: [],
        loops: [{ id: 'l', body: 'inc', max_iters: 5 }],
      },
    }
    const store = new StateStore({ dbPath: join(dir, 's.sqlite'), spec })
    const dispatcher: NodeDispatcher = {
      kind: 'tool',
      async resolve() { return {} },
      async run(_impl, _b: NodeInputBundle, ctx): Promise<NodeOutput> {
        const current = (ctx.store.get('count') as number | undefined) ?? 0
        return { state_delta: { count: current + 1 } }
      },
    }
    const dispatchers = new DispatcherRegistry()
    dispatchers.register(dispatcher)
    const ctx = new RunContext({
      runId: 'r', spec, experienceDir: dir, store,
      events: new EventBus(), dispatchers, args: {},
    })
    await new SequentialScheduler(buildDag(spec), ctx).run()
    expect(store.get('count')).toBe(5)
    store.close()
  })
})
```

- [ ] **Step 3.4: Build + run + commit**

```bash
pnpm --filter @openexpertise/schema build
pnpm --filter @openexpertise/core build
pnpm vitest run packages/core/tests/scheduler-loop.test.ts
pnpm vitest run packages/core/
git add packages/schema/src/types.ts packages/schema/src/schemas/experience.schema.json packages/core/src/graph/scheduler.ts packages/core/tests/scheduler-loop.test.ts
git commit -m "feat(core,schema): bounded loop (repeat:) construct"
```

---

## Task 4: `oe resume <run-id>` command

**Files:**
- Create: `packages/cli/src/commands/resume.ts`
- Modify: `packages/cli/src/index.ts` — register `resume` command

- [ ] **Step 4.1: Implement `resume.ts`**

Create `packages/cli/src/commands/resume.ts`:
```ts
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { parseExperienceYaml } from '@openexpertise/schema'
import { DispatcherRegistry, EventBus, runExperience } from '@openexpertise/core'
import { ToolDispatcher } from '@openexpertise/node-kinds-tool'
import { AgentDispatcher, AnthropicLLMClient } from '@openexpertise/node-kinds-agent'
import { SkillDispatcher } from '@openexpertise/node-kinds-skill'
import { DatasetDispatcher } from '@openexpertise/node-kinds-dataset'
import { ExperienceDispatcher } from '@openexpertise/node-kinds-experience'
import type { Logger } from 'pino'

export interface ResumeOpts {
  experiencePath: string
  runId: string
  logger: Logger
}

export async function resumeCommand(opts: ResumeOpts): Promise<number> {
  const expDir = resolve(opts.experiencePath)
  const yamlPath = join(expDir, 'experience.yaml')
  if (!existsSync(yamlPath)) {
    opts.logger.error({ yamlPath }, 'experience.yaml not found')
    return 1
  }
  const spec = parseExperienceYaml(readFileSync(yamlPath, 'utf8'))

  const logPath = join(expDir, '.openexpertise', 'runs', `${opts.runId}.jsonl`)
  if (!existsSync(logPath)) {
    opts.logger.error({ logPath }, 'run log not found; cannot recover args')
    return 1
  }
  // Recover args from the first event (run.started carries args)
  const firstLine = readFileSync(logPath, 'utf8').split('\n')[0] ?? '{}'
  const firstEvent = JSON.parse(firstLine) as { args?: Record<string, unknown> }
  const args = firstEvent.args ?? {}

  const dispatchers = new DispatcherRegistry()
  dispatchers.register(new ToolDispatcher())
  let lazyClient: AnthropicLLMClient | undefined
  const getClient = (): AnthropicLLMClient => {
    if (!lazyClient) lazyClient = new AnthropicLLMClient()
    return lazyClient
  }
  dispatchers.register(new AgentDispatcher({ get client() { return getClient() } } as any))
  dispatchers.register(new SkillDispatcher({ get client() { return getClient() } } as any))
  dispatchers.register(new DatasetDispatcher())
  dispatchers.register(new ExperienceDispatcher({ runExperience }))

  const events = new EventBus()
  events.subscribe((e) => opts.logger.info(e, e.type))

  const result = await runExperience({
    spec,
    experienceDir: expDir,
    dispatchers,
    events,
    args,
    cache: true, // explicit
  })
  opts.logger.info(
    { runId: result.runId, status: result.status, originalRunId: opts.runId },
    'resume complete',
  )
  return result.status === 'success' ? 0 : 1
}
```

- [ ] **Step 4.2: Register in CLI index**

In `packages/cli/src/index.ts`, add after the `inspect` command:
```ts
import { resumeCommand } from './commands/resume.js'

  program
    .command('resume')
    .description('Re-run an experience with cached results from a prior run')
    .argument('<run-id>', 'prior run id')
    .option('--experience <path>', 'experience path', '.')
    .action(async (runId: string, cmdOpts: { experience: string }, cmd: Command) => {
      const root = cmd.optsWithGlobals()
      const logger = makeLogger({ pretty: root.logFormat === 'pretty', level: root.logLevel })
      process.exit(await resumeCommand({ experiencePath: cmdOpts.experience, runId, logger }))
    })
```

- [ ] **Step 4.3: Build + smoke + commit**

```bash
pnpm --filter @openexpertise/cli build
node packages/cli/dist/bin.js resume --help
git add packages/cli/src/commands/resume.ts packages/cli/src/index.ts
git commit -m "feat(cli): oe resume <run-id> with cache replay"
```

---

## Task 5: `oe init`, `oe state`, `oe reset-state` commands

**Files:**
- Create: `packages/cli/src/commands/init.ts`
- Create: `packages/cli/src/commands/state.ts`
- Create: `packages/cli/src/commands/diff.ts` (Plan 6 placeholder)
- Modify: `packages/cli/src/index.ts` — register all four new commands

- [ ] **Step 5.1: `init.ts` — scaffold a new experience directory**

Create `packages/cli/src/commands/init.ts`:
```ts
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Logger } from 'pino'

export interface InitOpts {
  name: string
  logger: Logger
}

export async function initCommand(opts: InitOpts): Promise<number> {
  const dir = resolve(opts.name)
  if (existsSync(dir)) {
    opts.logger.error({ dir }, 'directory already exists')
    return 1
  }
  mkdirSync(join(dir, 'tools'), { recursive: true })
  writeFileSync(
    join(dir, 'experience.yaml'),
    `name: ${opts.name}
description: A new OpenExpertise experience.
version: 0.1.0

state:
  schema:
    greeting:
      type: string

graph:
  nodes:
    - id: hello
      kind: tool
      impl: ./tools/hello.mjs
      writes: [greeting]
  edges: []
`,
  )
  writeFileSync(
    join(dir, 'tools/hello.mjs'),
    `export default async function hello() {\n  return { state_delta: { greeting: 'Hello, OpenExpertise!' } }\n}\n`,
  )
  writeFileSync(join(dir, 'README.md'), `# ${opts.name}\n\nA new OpenExpertise experience.\n`)
  opts.logger.info({ dir }, 'experience scaffolded')
  return 0
}
```

- [ ] **Step 5.2: `state.ts` — inspect and reset blackboard**

Create `packages/cli/src/commands/state.ts`:
```ts
import { readFileSync, existsSync, unlinkSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseExperienceYaml } from '@openexpertise/schema'
import { StateStore } from '@openexpertise/core'
import type { Logger } from 'pino'

export interface StateOpts {
  experiencePath: string
  field?: string
  logger: Logger
}

export async function stateCommand(opts: StateOpts): Promise<number> {
  const dir = resolve(opts.experiencePath)
  const yamlPath = join(dir, 'experience.yaml')
  if (!existsSync(yamlPath)) {
    opts.logger.error({ yamlPath }, 'experience.yaml not found')
    return 1
  }
  const spec = parseExperienceYaml(readFileSync(yamlPath, 'utf8'))
  const dbPath = join(dir, '.openexpertise', 'state.sqlite')
  if (!existsSync(dbPath)) {
    opts.logger.info({ dbPath }, 'state file does not exist yet (no runs performed)')
    return 0
  }
  const store = new StateStore({ dbPath, spec })
  try {
    if (opts.field) {
      const v = store.get(opts.field)
      opts.logger.info({ field: opts.field, value: v }, 'state field')
    } else {
      const snap = store.snapshot()
      opts.logger.info({ snapshot: snap }, 'full state snapshot')
    }
    return 0
  } finally {
    store.close()
  }
}

export interface ResetStateOpts {
  experiencePath: string
  yes: boolean
  logger: Logger
}

export async function resetStateCommand(opts: ResetStateOpts): Promise<number> {
  const dir = resolve(opts.experiencePath)
  const dbPath = join(dir, '.openexpertise', 'state.sqlite')
  if (!existsSync(dbPath)) {
    opts.logger.info({ dbPath }, 'no state to reset')
    return 0
  }
  if (!opts.yes) {
    opts.logger.error('reset-state requires --yes to confirm destructive action')
    return 1
  }
  unlinkSync(dbPath)
  opts.logger.info({ dbPath }, 'state reset')
  return 0
}
```

- [ ] **Step 5.3: `diff.ts` — Plan 6 placeholder**

Create `packages/cli/src/commands/diff.ts`:
```ts
import type { Logger } from 'pino'

export interface DiffOpts {
  experiencePath: string
  logger: Logger
}

export async function diffCommand(opts: DiffOpts): Promise<number> {
  opts.logger.info(
    { experiencePath: opts.experiencePath },
    'oe diff is a Plan 6 placeholder — evolution advisor not implemented yet',
  )
  return 0
}
```

- [ ] **Step 5.4: Register all four in `index.ts`**

Add to `packages/cli/src/index.ts`:
```ts
import { initCommand } from './commands/init.js'
import { stateCommand, resetStateCommand } from './commands/state.js'
import { diffCommand } from './commands/diff.js'

  program
    .command('init')
    .description('Scaffold a new experience directory')
    .argument('<name>', 'directory name to create')
    .action(async (name: string, _opts, cmd: Command) => {
      const root = cmd.optsWithGlobals()
      const logger = makeLogger({ pretty: root.logFormat === 'pretty', level: root.logLevel })
      process.exit(await initCommand({ name, logger }))
    })

  program
    .command('state')
    .description('Inspect the persistent state blackboard')
    .argument('[field]', 'specific field to read; omit for full snapshot')
    .option('--experience <path>', 'experience path', '.')
    .action(async (field: string | undefined, cmdOpts: { experience: string }, cmd: Command) => {
      const root = cmd.optsWithGlobals()
      const logger = makeLogger({ pretty: root.logFormat === 'pretty', level: root.logLevel })
      process.exit(
        await stateCommand({
          experiencePath: cmdOpts.experience,
          ...(field !== undefined ? { field } : {}),
          logger,
        }),
      )
    })

  program
    .command('reset-state')
    .description('Delete the persistent state blackboard (destructive)')
    .option('--experience <path>', 'experience path', '.')
    .option('--yes', 'confirm destructive action', false)
    .action(async (cmdOpts: { experience: string; yes: boolean }, cmd: Command) => {
      const root = cmd.optsWithGlobals()
      const logger = makeLogger({ pretty: root.logFormat === 'pretty', level: root.logLevel })
      process.exit(await resetStateCommand({ experiencePath: cmdOpts.experience, yes: cmdOpts.yes, logger }))
    })

  program
    .command('diff')
    .description('Show evolution advisor suggestions (Plan 6 placeholder)')
    .option('--experience <path>', 'experience path', '.')
    .action(async (cmdOpts: { experience: string }, cmd: Command) => {
      const root = cmd.optsWithGlobals()
      const logger = makeLogger({ pretty: root.logFormat === 'pretty', level: root.logLevel })
      process.exit(await diffCommand({ experiencePath: cmdOpts.experience, logger }))
    })
```

- [ ] **Step 5.5: Build + smoke + commit**

```bash
pnpm --filter @openexpertise/cli build
node packages/cli/dist/bin.js init test-init-tmp && rm -rf test-init-tmp
node packages/cli/dist/bin.js state --experience examples/dataset-aggregate
git add packages/cli/src/commands/init.ts packages/cli/src/commands/state.ts packages/cli/src/commands/diff.ts packages/cli/src/index.ts
git commit -m "feat(cli): oe init / oe state / oe reset-state / oe diff (placeholder)"
```

---

## Task 6: `@openexpertise/tui` package (ink dashboard)

**Files:**
- Create: `packages/tui/package.json`
- Create: `packages/tui/tsconfig.json`
- Create: `packages/tui/src/index.ts`
- Create: `packages/tui/src/dashboard.tsx`

- [ ] **Step 6.1: `package.json`**

```json
{
  "name": "@openexpertise/tui",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsc -b",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@openexpertise/core": "workspace:*",
    "ink": "^5.0.0",
    "react": "^18.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.0.0"
  }
}
```

- [ ] **Step 6.2: `tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "jsx": "react-jsx"
  },
  "references": [{ "path": "../core" }],
  "include": ["src/**/*"]
}
```

- [ ] **Step 6.3: `dashboard.tsx`**

Create `packages/tui/src/dashboard.tsx`:
```tsx
import React, { useEffect, useState } from 'react'
import { Box, Text } from 'ink'
import type { EventBus, RunEvent } from '@openexpertise/core'

interface NodeState {
  id: string
  phase?: string
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped'
  error?: string
}

interface Props {
  events: EventBus
  nodes: { id: string; phase?: string }[]
}

export function Dashboard({ events, nodes }: Props): React.ReactElement {
  const [state, setState] = useState<Record<string, NodeState>>(() => {
    const initial: Record<string, NodeState> = {}
    for (const n of nodes) {
      initial[n.id] = { id: n.id, status: 'pending', ...(n.phase ? { phase: n.phase } : {}) }
    }
    return initial
  })
  const [runStatus, setRunStatus] = useState<string>('starting')

  useEffect(() => {
    const unsub = events.subscribe((event: RunEvent) => {
      if (event.type === 'run.started') setRunStatus('running')
      else if (event.type === 'run.finished') setRunStatus(`finished: ${event.status}`)
      else if (
        event.type === 'node.started' ||
        event.type === 'node.finished' ||
        event.type === 'node.failed' ||
        event.type === 'node.skipped'
      ) {
        setState((prev) => {
          const current = prev[event.node_id] ?? { id: event.node_id, status: 'pending' as const }
          let nextStatus: NodeState['status'] = current.status
          if (event.type === 'node.started') nextStatus = 'running'
          if (event.type === 'node.finished') nextStatus = 'done'
          if (event.type === 'node.failed') nextStatus = 'failed'
          if (event.type === 'node.skipped') nextStatus = 'skipped'
          const next: NodeState = { ...current, status: nextStatus }
          if (event.type === 'node.failed') next.error = event.error
          return { ...prev, [event.node_id]: next }
        })
      }
    })
    return () => { unsub() }
  }, [events])

  return (
    <Box flexDirection="column">
      <Text>OpenExpertise run — {runStatus}</Text>
      {Object.values(state).map((n) => (
        <Box key={n.id}>
          <Text color={colorFor(n.status)}>{symbolFor(n.status)} {n.id}</Text>
          {n.phase && <Text dimColor> [{n.phase}]</Text>}
          {n.error && <Text color="red"> — {n.error}</Text>}
        </Box>
      ))}
    </Box>
  )
}

function symbolFor(s: NodeState['status']): string {
  switch (s) {
    case 'pending': return '·'
    case 'running': return '▶'
    case 'done': return '✓'
    case 'failed': return '✗'
    case 'skipped': return '–'
  }
}
function colorFor(s: NodeState['status']): string {
  switch (s) {
    case 'pending': return 'gray'
    case 'running': return 'cyan'
    case 'done': return 'green'
    case 'failed': return 'red'
    case 'skipped': return 'yellow'
  }
}
```

- [ ] **Step 6.4: `index.ts`**

Create `packages/tui/src/index.ts`:
```tsx
import React from 'react'
import { render, type Instance } from 'ink'
import { Dashboard } from './dashboard.js'
import type { EventBus } from '@openexpertise/core'

export { Dashboard } from './dashboard.js'

export interface StartTuiOpts {
  events: EventBus
  nodes: { id: string; phase?: string }[]
}

export function startTui(opts: StartTuiOpts): Instance {
  return render(<Dashboard events={opts.events} nodes={opts.nodes} />)
}
```

- [ ] **Step 6.5: Install + build + commit**

```bash
cd /Users/xuxingcheng/SHLAB/github/OpenExpertise/.claude/worktrees/overnight-plans-2-6
pnpm install
pnpm --filter @openexpertise/tui build
git add packages/tui/
git commit -m "feat(tui): ink-based dashboard for run observation"
```

---

## Task 7: `oe run --tui` flag

**Files:**
- Modify: `packages/cli/package.json` — add `@openexpertise/tui` dep
- Modify: `packages/cli/tsconfig.json` — add reference
- Modify: `packages/cli/src/commands/run.ts` — when `--tui` set, mount dashboard instead of pino logs
- Modify: `packages/cli/src/index.ts` — `--tui` option on the `run` subcommand

- [ ] **Step 7.1: Update `cli/package.json`**

Add to `dependencies`:
```json
"@openexpertise/tui": "workspace:*"
```

- [ ] **Step 7.2: Update `cli/tsconfig.json`**

Add to `references`:
```json
{ "path": "../tui" }
```

- [ ] **Step 7.3: Update `run.ts` to accept `tui: boolean`**

In the existing `RunOpts`, add `tui: boolean`. In the function, if `opts.tui` is true, spin up the TUI instead of subscribing the logger:

```ts
// At the top:
import { startTui } from '@openexpertise/tui'

// Inside runCommand, after building dispatchers and parsing spec:
if (opts.tui) {
  const tuiInstance = startTui({
    events,
    nodes: spec.graph.nodes.map((n) => ({
      id: n.id,
      ...(n.phase ? { phase: n.phase } : {}),
    })),
  })
  // Wait for the run to complete, then let the TUI flush.
  const result = await runExperience({ spec, experienceDir, dispatchers, events, args: opts.args })
  // Give the TUI a tick to render the final state, then unmount.
  await new Promise((r) => setTimeout(r, 100))
  tuiInstance.unmount()
  return result.status === 'success' ? 0 : 1
}

// Otherwise, the existing logger-subscribed path runs as before.
```

- [ ] **Step 7.4: Add `--tui` option to the `run` subcommand**

In `packages/cli/src/index.ts`, modify the `run` command:
```ts
  program
    .command('run')
    .description('Execute an experience')
    .argument('[path]', 'path to experience.yaml or experience directory', '.')
    .option('--args <json>', 'JSON object passed as args to the experience', '{}')
    .option('--tui', 'show interactive dashboard instead of log output', false)
    .action(async (path: string, cmdOpts: { args: string; tui: boolean }, cmd: Command) => {
      const root = cmd.optsWithGlobals()
      const logger = makeLogger({ pretty: root.logFormat === 'pretty', level: root.logLevel })
      let args: Record<string, unknown> = {}
      try { args = JSON.parse(cmdOpts.args) } catch { logger.error('--args must be valid JSON'); process.exit(2) }
      process.exit(await runCommand({ path, args, logger, tui: cmdOpts.tui }))
    })
```

- [ ] **Step 7.5: Build + smoke + commit**

```bash
pnpm install
pnpm --filter @openexpertise/cli build
node packages/cli/dist/bin.js run examples/dataset-aggregate --tui 2>&1 | tail -20 || true
git add packages/cli/package.json packages/cli/tsconfig.json packages/cli/src/commands/run.ts packages/cli/src/index.ts
git commit -m "feat(cli): --tui flag for run (ink dashboard)"
```

(The smoke test may show output that's TTY-dependent. If `ink` complains about non-TTY stdout in CI, that's expected — TUI is intended for interactive use.)

---

## Task 8: E2E for cache + resume

**Files:**
- Create: `e2e/cache-resume.e2e.test.ts`

- [ ] **Step 8.1: Write test**

Create `e2e/cache-resume.e2e.test.ts`:
```ts
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseExperienceYaml } from '@openexpertise/schema'
import {
  DispatcherRegistry, EventBus, runExperience,
  type LLMClient, type LLMCompleteOpts,
} from '@openexpertise/core'
import { AgentDispatcher } from '@openexpertise/node-kinds-agent'

class CountingLLM implements LLMClient {
  public calls = 0
  async complete(_opts: LLMCompleteOpts) {
    this.calls++
    return { text: 'cached-ok' }
  }
}

let dir: string
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }) })

describe('Cache + resume', () => {
  it('second run replays from cache without invoking the LLM', async () => {
    dir = mkdtempSync(join(tmpdir(), 'oe-e2e-cache-'))
    mkdirSync(join(dir, 'prompts'), { recursive: true })
    writeFileSync(join(dir, 'prompts/p.md'), 'hi')
    writeFileSync(join(dir, 'experience.yaml'), [
      'name: c',
      'version: 0.1.0',
      'state:',
      '  schema:',
      '    out: { type: string }',
      'graph:',
      '  nodes:',
      '    - id: greet',
      '      kind: agent',
      '      prompt: ./prompts/p.md',
      '      writes: [out]',
      '  edges: []',
    ].join('\n'))

    const spec = parseExperienceYaml(require('node:fs').readFileSync(join(dir, 'experience.yaml'), 'utf8'))
    const llm = new CountingLLM()
    const dispatchers = new DispatcherRegistry()
    dispatchers.register(new AgentDispatcher({ client: llm }))

    // Run 1: cold cache
    const r1 = await runExperience({ spec, experienceDir: dir, dispatchers, events: new EventBus(), args: {} })
    expect(r1.status).toBe('success')
    expect(r1.finalState.out).toBe('cached-ok')
    expect(llm.calls).toBe(1)

    // Run 2: cache hit
    const r2 = await runExperience({ spec, experienceDir: dir, dispatchers, events: new EventBus(), args: {} })
    expect(r2.status).toBe('success')
    expect(r2.finalState.out).toBe('cached-ok')
    expect(llm.calls).toBe(1) // still 1
  })
})
```

The `require('node:fs')` is awkward; convert to top-level import:
```ts
import { readFileSync as readFile } from 'node:fs'
// ...
const spec = parseExperienceYaml(readFile(join(dir, 'experience.yaml'), 'utf8'))
```

- [ ] **Step 8.2: Run + commit**

```bash
pnpm install
pnpm -r build
pnpm vitest run e2e/cache-resume.e2e.test.ts
git add e2e/cache-resume.e2e.test.ts
git commit -m "test(e2e): cache hits replay without dispatcher invocation"
```

---

## Task 9: Final clean rebuild

- [ ] **Step 9.1:**

```bash
cd /Users/xuxingcheng/SHLAB/github/OpenExpertise/.claude/worktrees/overnight-plans-2-6
pnpm clean
pnpm install
pnpm -r build
pnpm typecheck
pnpm format
pnpm format:check
pnpm lint
pnpm test
git status
git add -A
git commit -m "style(plan-4): prettier/lint cleanup" || true
```

Expected: ~89 tests pass (existing 83 + cache 4 + scheduler-cache 1 + loop 2 + e2e cache-resume 1).

---

## Notes

- TUI under non-TTY (CI) may emit warnings; gracefully fall back to log mode if `process.stdout.isTTY` is false: add a guard in `run.ts` if needed.
- `resume` recovers args from the first event in the jsonl log. If the log is missing or malformed, the command fails cleanly.
- The `oe diff` command is a stub. Plan 6 fills it with real evolution suggestions.
- `--tui` and `--log-format=pretty` are mutually exclusive — TUI takes precedence.
