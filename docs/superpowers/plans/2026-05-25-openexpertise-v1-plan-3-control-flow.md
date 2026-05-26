# OpenExpertise V1 — Plan 3: Control Flow + review-branch Demo

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four control-flow primitives to the scheduler — `for_each` (fan-out), conditional edges (`when:`), `pipeline` groups (streaming stages), and `phase` grouping — and ship the canonical `examples/review-branch` demo that exercises all dispatchers + control flow together against a mocked Anthropic client.

**Architecture:** Extend `SequentialScheduler` to recognize the new constructs at dispatch time. Conditional edges are filtered by the existing expression evaluator after extending it with operators (`==`, `!=`, `>`, `<`, `>=`, `<=`, `&&`, `||`, `length(...)`). `for_each` is handled by virtual-node expansion: when a node has `for_each: $.list`, the scheduler runs it once per item with the item injected into `args.$item`. `pipeline` is a group construct that chains stages per-item with no barrier between stages. `phase` is metadata threaded through events for UI consumption — no scheduling impact.

**Tech Stack:** Inherited from Plan 2. No new runtime dependencies.

**Plan 3 scope explicitly excludes** (deferred):
- Bounded loop (`repeat: { until, max_iters, budget }`) — Plan 4 micro-task; not on review-branch's critical path
- Parallel concurrency within a fan-out (V1 runs replicas sequentially; `concurrency: N` is parsed but ignored)
- TUI rendering of phases (Plan 4)

---

## File structure

```
packages/core/src/
├── expressions/
│   ├── resolve.ts                          # MODIFIED: extend with operators for when/until
│   └── evaluate.ts                         # NEW: boolean expression evaluator
├── graph/
│   ├── scheduler.ts                        # MODIFIED: for_each, conditional edge, pipeline, phase
│   └── dag.ts                              # MODIFIED: surface for_each/pipeline/phase in DagNode
├── index.ts                                # MODIFIED: export evaluateExpression
packages/schema/
├── src/schemas/experience.schema.json      # MODIFIED: allow for_each, pipeline, repeat, phase
├── src/types.ts                            # MODIFIED: NodeSpec.for_each, GraphSpec.pipelines, etc.
examples/
└── review-branch/                          # NEW: anchor demo
    ├── experience.yaml
    ├── prompts/{review,verify,score}.md
    ├── schemas/{findings,verdict}.json
    ├── tools/list_pr_changes.mjs
    ├── package.json
    └── README.md
e2e/
└── review-branch.e2e.test.ts               # NEW
```

---

## Task 1: Boolean expression evaluator (operators)

**Files:**
- Create: `packages/core/src/expressions/evaluate.ts`
- Create: `packages/core/tests/evaluate.test.ts`

- [ ] **Step 1.1: Write failing tests**

Create `packages/core/tests/evaluate.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { evaluateExpression } from '../src/expressions/evaluate.js'

const state = { count: 3, ratio: 0.5, name: 'alice', items: [1, 2, 3], flag: true }

describe('evaluateExpression', () => {
  it('literal true/false', () => {
    expect(evaluateExpression('true', state)).toBe(true)
    expect(evaluateExpression('false', state)).toBe(false)
  })
  it('numeric comparisons', () => {
    expect(evaluateExpression('$.count > 2', state)).toBe(true)
    expect(evaluateExpression('$.count >= 3', state)).toBe(true)
    expect(evaluateExpression('$.count < 3', state)).toBe(false)
    expect(evaluateExpression('$.count <= 3', state)).toBe(true)
    expect(evaluateExpression('$.count == 3', state)).toBe(true)
    expect(evaluateExpression('$.count != 3', state)).toBe(false)
  })
  it('string equality', () => {
    expect(evaluateExpression('$.name == "alice"', state)).toBe(true)
    expect(evaluateExpression('$.name == "bob"', state)).toBe(false)
  })
  it('logical and / or', () => {
    expect(evaluateExpression('$.count > 0 && $.flag', state)).toBe(true)
    expect(evaluateExpression('$.count > 100 || $.flag', state)).toBe(true)
    expect(evaluateExpression('$.count > 100 || $.count < 0', state)).toBe(false)
  })
  it('length() function on arrays', () => {
    expect(evaluateExpression('length($.items) > 2', state)).toBe(true)
    expect(evaluateExpression('length($.items) == 3', state)).toBe(true)
  })
  it('missing fields evaluate to false in comparisons', () => {
    expect(evaluateExpression('$.missing > 0', state)).toBe(false)
    expect(evaluateExpression('$.missing == "x"', state)).toBe(false)
  })
  it('throws on parse error', () => {
    expect(() => evaluateExpression('$.count >>>', state)).toThrow()
  })
})
```

- [ ] **Step 1.2: Confirm FAIL**

```bash
cd /Users/xuxingcheng/SHLAB/github/OpenExpertise/.claude/worktrees/overnight-plans-2-6
pnpm vitest run packages/core/tests/evaluate.test.ts
```

- [ ] **Step 1.3: Implement `evaluate.ts`**

Create `packages/core/src/expressions/evaluate.ts`:
```ts
// Tiny boolean-expression evaluator for when:/until: predicates.
// Supports: $.field paths, numeric/string literals, ==, !=, >, <, >=, <=, &&, ||, length(...)
// No `eval`, no full JS. Tokenize → parse → evaluate.

type Token =
  | { kind: 'path'; value: string }
  | { kind: 'num'; value: number }
  | { kind: 'str'; value: string }
  | { kind: 'bool'; value: boolean }
  | { kind: 'op'; value: string }
  | { kind: 'ident'; value: string }
  | { kind: 'lparen' }
  | { kind: 'rparen' }

function tokenize(src: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < src.length) {
    const c = src[i]!
    if (c === ' ' || c === '\t' || c === '\n') { i++; continue }
    if (c === '(') { tokens.push({ kind: 'lparen' }); i++; continue }
    if (c === ')') { tokens.push({ kind: 'rparen' }); i++; continue }
    if (c === '$' && src[i + 1] === '.') {
      let j = i + 2
      while (j < src.length && /[a-zA-Z0-9_.]/.test(src[j]!)) j++
      tokens.push({ kind: 'path', value: src.slice(i, j) })
      i = j; continue
    }
    if (c === '"' || c === "'") {
      const quote = c
      let j = i + 1
      while (j < src.length && src[j] !== quote) j++
      if (j >= src.length) throw new Error(`Unterminated string in expression: ${src}`)
      tokens.push({ kind: 'str', value: src.slice(i + 1, j) })
      i = j + 1; continue
    }
    if (/[0-9]/.test(c) || (c === '-' && /[0-9]/.test(src[i + 1] ?? ''))) {
      let j = i + 1
      while (j < src.length && /[0-9.]/.test(src[j]!)) j++
      tokens.push({ kind: 'num', value: parseFloat(src.slice(i, j)) })
      i = j; continue
    }
    if (c === '=' && src[i + 1] === '=') { tokens.push({ kind: 'op', value: '==' }); i += 2; continue }
    if (c === '!' && src[i + 1] === '=') { tokens.push({ kind: 'op', value: '!=' }); i += 2; continue }
    if (c === '>' && src[i + 1] === '=') { tokens.push({ kind: 'op', value: '>=' }); i += 2; continue }
    if (c === '<' && src[i + 1] === '=') { tokens.push({ kind: 'op', value: '<=' }); i += 2; continue }
    if (c === '>') { tokens.push({ kind: 'op', value: '>' }); i++; continue }
    if (c === '<') { tokens.push({ kind: 'op', value: '<' }); i++; continue }
    if (c === '&' && src[i + 1] === '&') { tokens.push({ kind: 'op', value: '&&' }); i += 2; continue }
    if (c === '|' && src[i + 1] === '|') { tokens.push({ kind: 'op', value: '||' }); i += 2; continue }
    if (/[a-zA-Z_]/.test(c)) {
      let j = i + 1
      while (j < src.length && /[a-zA-Z0-9_]/.test(src[j]!)) j++
      const word = src.slice(i, j)
      if (word === 'true') tokens.push({ kind: 'bool', value: true })
      else if (word === 'false') tokens.push({ kind: 'bool', value: false })
      else tokens.push({ kind: 'ident', value: word })
      i = j; continue
    }
    throw new Error(`Unexpected character "${c}" in expression: ${src}`)
  }
  return tokens
}

interface ParseCtx {
  pos: number
  tokens: Token[]
}

function peek(ctx: ParseCtx): Token | undefined {
  return ctx.tokens[ctx.pos]
}

function consume(ctx: ParseCtx): Token {
  const t = ctx.tokens[ctx.pos]
  if (!t) throw new Error('Unexpected end of expression')
  ctx.pos++
  return t
}

type Ast =
  | { kind: 'lit'; value: unknown }
  | { kind: 'path'; value: string }
  | { kind: 'binop'; op: string; lhs: Ast; rhs: Ast }
  | { kind: 'call'; fn: string; args: Ast[] }

function parseOr(ctx: ParseCtx): Ast {
  let lhs = parseAnd(ctx)
  while (peek(ctx)?.kind === 'op' && (peek(ctx) as { value: string }).value === '||') {
    consume(ctx)
    const rhs = parseAnd(ctx)
    lhs = { kind: 'binop', op: '||', lhs, rhs }
  }
  return lhs
}

function parseAnd(ctx: ParseCtx): Ast {
  let lhs = parseCmp(ctx)
  while (peek(ctx)?.kind === 'op' && (peek(ctx) as { value: string }).value === '&&') {
    consume(ctx)
    const rhs = parseCmp(ctx)
    lhs = { kind: 'binop', op: '&&', lhs, rhs }
  }
  return lhs
}

function parseCmp(ctx: ParseCtx): Ast {
  let lhs = parseAtom(ctx)
  const t = peek(ctx)
  if (t && t.kind === 'op' && ['==', '!=', '>', '<', '>=', '<='].includes(t.value)) {
    consume(ctx)
    const rhs = parseAtom(ctx)
    lhs = { kind: 'binop', op: t.value, lhs, rhs }
  }
  return lhs
}

function parseAtom(ctx: ParseCtx): Ast {
  const t = consume(ctx)
  if (t.kind === 'lparen') {
    const inside = parseOr(ctx)
    const close = consume(ctx)
    if (close.kind !== 'rparen') throw new Error('Expected )')
    return inside
  }
  if (t.kind === 'num' || t.kind === 'str' || t.kind === 'bool') return { kind: 'lit', value: t.value }
  if (t.kind === 'path') return { kind: 'path', value: t.value }
  if (t.kind === 'ident') {
    if (peek(ctx)?.kind === 'lparen') {
      consume(ctx)
      const args: Ast[] = []
      while (peek(ctx)?.kind !== 'rparen') {
        args.push(parseOr(ctx))
        if (peek(ctx)?.kind === 'op' && (peek(ctx) as { value: string }).value === ',') consume(ctx)
      }
      consume(ctx) // rparen
      return { kind: 'call', fn: t.value, args }
    }
    throw new Error(`Unexpected identifier "${t.value}" without parens`)
  }
  throw new Error(`Unexpected token: ${JSON.stringify(t)}`)
}

function resolvePath(path: string, state: Record<string, unknown>): unknown {
  const parts = path.slice(2).split('.')
  let cur: unknown = state
  for (const p of parts) {
    if (cur === null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[p]
  }
  return cur
}

function evalAst(ast: Ast, state: Record<string, unknown>): unknown {
  switch (ast.kind) {
    case 'lit': return ast.value
    case 'path': return resolvePath(ast.value, state)
    case 'call': {
      if (ast.fn === 'length') {
        const v = evalAst(ast.args[0]!, state)
        if (Array.isArray(v) || typeof v === 'string') return v.length
        return 0
      }
      throw new Error(`Unknown function: ${ast.fn}`)
    }
    case 'binop': {
      if (ast.op === '&&') return Boolean(evalAst(ast.lhs, state)) && Boolean(evalAst(ast.rhs, state))
      if (ast.op === '||') return Boolean(evalAst(ast.lhs, state)) || Boolean(evalAst(ast.rhs, state))
      const l = evalAst(ast.lhs, state)
      const r = evalAst(ast.rhs, state)
      if (l === undefined || r === undefined) {
        // Missing fields produce false (per Plan 3 design)
        if (ast.op === '!=') return l !== r
        return false
      }
      switch (ast.op) {
        case '==': return l === r
        case '!=': return l !== r
        case '>': return (l as number) > (r as number)
        case '<': return (l as number) < (r as number)
        case '>=': return (l as number) >= (r as number)
        case '<=': return (l as number) <= (r as number)
      }
      throw new Error(`Unknown binop: ${ast.op}`)
    }
  }
}

export function evaluateExpression(src: string, state: Record<string, unknown>): unknown {
  const tokens = tokenize(src)
  const ast = parseOr({ pos: 0, tokens })
  return evalAst(ast, state)
}
```

- [ ] **Step 1.4: Run — confirm PASS**

```bash
pnpm vitest run packages/core/tests/evaluate.test.ts
```

Expected: 8/8.

- [ ] **Step 1.5: Add export to core index**

Edit `packages/core/src/index.ts` and add:
```ts
export { evaluateExpression } from './expressions/evaluate.js'
```

- [ ] **Step 1.6: Build core + commit**

```bash
pnpm --filter @openexpertise/core build
git add packages/core/src/expressions/evaluate.ts packages/core/src/index.ts packages/core/tests/evaluate.test.ts
git commit -m "feat(core): boolean expression evaluator for when/until predicates"
```

---

## Task 2: Schema additions for `for_each`, `pipeline`, `phase`

**Files:**
- Modify: `packages/schema/src/types.ts` — add `for_each`/`concurrency` to all NodeSpec variants; add `PipelineGroup`; add `phase` already exists
- Modify: `packages/schema/src/schemas/experience.schema.json` — allow `for_each`, `concurrency` on nodes; add `pipelines:` array under graph

- [ ] **Step 2.1: Modify `types.ts`**

Add `ForEachClause` and update node base shape. After the `NodeKind` and `MergeStrategy` declarations, insert:

```ts
export interface ForEachClause {
  source: string // a JSONPath-like expression that resolves to an array
  concurrency?: number // V1: parsed but ignored; runtime is sequential
}

export interface PipelineGroupSpec {
  id: string
  items: string // JSONPath expression resolving to an array
  stages: string[] // node ids in order
  phase?: string
}
```

Then add `for_each?: ForEachClause` (and `concurrency?: number` for top-level convenience) to each of `ToolNodeSpec`, `AgentNodeSpec`, `SkillNodeSpec`, `DatasetNodeSpec`, `ExperienceNodeSpec`. Example for ToolNodeSpec:

```ts
export interface ToolNodeSpec {
  id: string
  kind: 'tool'
  phase?: string
  impl: string
  args?: Record<string, unknown>
  reads?: string[]
  writes?: string[]
  on_error?: ErrorPolicy
  for_each?: ForEachClause
}
```

Repeat the `for_each?: ForEachClause` line in all five NodeSpec variants.

Then update `GraphSpec` to allow pipelines:
```ts
export interface GraphSpec {
  nodes: NodeSpec[]
  edges: EdgeSpec[]
  pipelines?: PipelineGroupSpec[]
}
```

- [ ] **Step 2.2: Modify `experience.schema.json`**

In the `nodeBase` `$def`, add inside `properties`:
```json
"for_each": {
  "type": "object",
  "required": ["source"],
  "properties": {
    "source": { "type": "string" },
    "concurrency": { "type": "integer", "minimum": 1 }
  },
  "additionalProperties": false
}
```

In the top-level `graph` `properties`, add:
```json
"pipelines": {
  "type": "array",
  "items": {
    "type": "object",
    "required": ["id", "items", "stages"],
    "additionalProperties": false,
    "properties": {
      "id": { "type": "string" },
      "items": { "type": "string" },
      "stages": { "type": "array", "items": { "type": "string" }, "minItems": 1 },
      "phase": { "type": "string" }
    }
  }
}
```

- [ ] **Step 2.3: Verify schema typecheck + tests still pass**

```bash
cd /Users/xuxingcheng/SHLAB/github/OpenExpertise/.claude/worktrees/overnight-plans-2-6
pnpm --filter @openexpertise/schema build
pnpm vitest run packages/schema/
```

Expected: existing 9 schema tests still pass; no new tests yet.

- [ ] **Step 2.4: Commit**

```bash
git add packages/schema/src/types.ts packages/schema/src/schemas/experience.schema.json
git commit -m "feat(schema): for_each, pipelines, phase additions to types + json schema"
```

---

## Task 3: `for_each` fan-out in scheduler (TDD)

**Files:**
- Modify: `packages/core/src/graph/scheduler.ts` — recognize `node.spec.for_each` and run N times
- Create: `packages/core/tests/scheduler-foreach.test.ts`

- [ ] **Step 3.1: Write failing test**

Create `packages/core/tests/scheduler-foreach.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  DispatcherRegistry,
  EventBus,
  StateStore,
  RunContext,
  SequentialScheduler,
  buildDag,
  type NodeDispatcher,
  type NodeInputBundle,
  type NodeOutput,
} from '../src/index.js'
import type { ExperienceSpec, NodeSpec } from '@openexpertise/schema'

class Collector implements NodeDispatcher {
  readonly kind = 'tool' as const
  public seen: unknown[] = []
  async resolve(_n: NodeSpec) { return {} }
  async run(_impl: unknown, b: NodeInputBundle): Promise<NodeOutput> {
    this.seen.push(b.args.$item)
    return { state_delta: {} }
  }
}

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'oe-foreach-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

describe('SequentialScheduler for_each', () => {
  it('runs the node once per item with $item injected', async () => {
    const spec: ExperienceSpec = {
      name: 't', version: '0.1.0',
      state: { schema: { items: { type: 'array' } } },
      graph: {
        nodes: [
          {
            id: 'seed',
            kind: 'tool',
            impl: 'x',
            writes: ['items'],
          },
          {
            id: 'fan',
            kind: 'tool',
            impl: 'x',
            for_each: { source: '$.items' },
          },
        ],
        edges: [{ from: 'seed', to: 'fan' }],
      },
    }
    const store = new StateStore({ dbPath: join(dir, 's.sqlite'), spec })
    // seeder dispatcher sets items=[a,b,c]; collector receives each
    const collector = new Collector()
    const dispatchers = new DispatcherRegistry()
    let isSeed = true
    const router: NodeDispatcher = {
      kind: 'tool',
      async resolve(n: NodeSpec) {
        // distinguish via node id passed through impl
        return { id: n.id }
      },
      async run(impl: { id: string }, b: NodeInputBundle): Promise<NodeOutput> {
        if (impl.id === 'seed') return { state_delta: { items: ['a', 'b', 'c'] } }
        collector.seen.push(b.args.$item)
        return { state_delta: {} }
      },
    }
    dispatchers.register(router)
    const ctx = new RunContext({
      runId: 'r', spec, experienceDir: dir, store,
      events: new EventBus(), dispatchers, args: {},
    })
    const scheduler = new SequentialScheduler(buildDag(spec), ctx)
    const { status } = await scheduler.run()
    expect(status).toBe('success')
    expect(collector.seen).toEqual(['a', 'b', 'c'])
    store.close()
  })
})
```

- [ ] **Step 3.2: Confirm FAIL**

```bash
pnpm vitest run packages/core/tests/scheduler-foreach.test.ts
```

- [ ] **Step 3.3: Modify `scheduler.ts` to handle for_each**

In `packages/core/src/graph/scheduler.ts`, inside the `for (const node of this.dag.topoOrder)` loop, BEFORE the existing dispatcher resolve+run block, check for `for_each`. If present, the node executes once per item in the resolved source array.

Refactor the node-execution body into a helper, then wrap it:

Above the class, add a helper signature comment:
```ts
// for_each expansion: a node with `for_each: { source: $.list }` runs once per
// item in the resolved list, with the item injected into args.$item. The source
// is resolved from current state at dispatch time, so upstream nodes that
// populate it must have already run (guaranteed by the topological order).
```

Inside the loop body, right after `if (predSkipped) { ... continue }`, insert:

```ts
      const forEach = (node.spec as { for_each?: { source: string } }).for_each
      if (forEach) {
        const fullState = this.ctx.store.snapshot()
        const sourceVal = resolveExpression(forEach.source, fullState)
        const items: unknown[] = Array.isArray(sourceVal) ? sourceVal : []
        let anyFanFailed = false
        for (let idx = 0; idx < items.length; idx++) {
          const item = items[idx]
          await this.runNodeOnce(node, { $item: item, $index: idx }, skipped, results, edgeBuffer)
          // If the last result for this node was failed, mark and continue
          const last = results[results.length - 1]
          if (last?.status === 'failed') anyFanFailed = true
        }
        if (anyFanFailed) anyFailed = true
        continue
      }
```

Now extract the existing per-node execution body into a helper method `runNodeOnce`. The helper carries the bundle composition + dispatcher invocation + state write + event emission + on_error policy logic. Single-node nodes call it once with `{}` extra args; for_each nodes call it per item.

The full refactored loop and helper:

```ts
  async run(): Promise<{ status: 'success' | 'failed' | 'partial'; results: NodeRunResult[] }> {
    const results: NodeRunResult[] = []
    const edgeBuffer = new Map<string, Record<string, unknown>>()
    const skipped = new Set<string>()
    let anyFailed = false

    for (const node of this.dag.topoOrder) {
      const predSkipped = node.predecessors.some((p) => skipped.has(p))
      if (predSkipped) {
        skipped.add(node.id)
        this.ctx.events.emit({
          type: 'node.skipped', run_id: this.ctx.runId, node_id: node.id,
          ts: this.ctx.now(), reason: 'predecessor failed or skipped',
        })
        results.push({ nodeId: node.id, status: 'skipped' })
        continue
      }

      const forEach = (node.spec as { for_each?: { source: string } }).for_each
      if (forEach) {
        const fullState = this.ctx.store.snapshot()
        const sourceVal = resolveExpression(forEach.source, fullState)
        const items: unknown[] = Array.isArray(sourceVal) ? sourceVal : []
        let anyFanFailed = false
        for (let idx = 0; idx < items.length; idx++) {
          await this.runNodeOnce(node, { $item: items[idx], $index: idx }, skipped, results, edgeBuffer)
          const last = results[results.length - 1]
          if (last?.status === 'failed') anyFanFailed = true
        }
        if (anyFanFailed) anyFailed = true
        continue
      }

      await this.runNodeOnce(node, {}, skipped, results, edgeBuffer)
      const last = results[results.length - 1]
      if (last?.status === 'failed') anyFailed = true
    }

    const status = anyFailed
      ? results.every((r) => r.status === 'failed' || r.status === 'skipped')
        ? 'failed'
        : 'partial'
      : 'success'
    return { status, results }
  }

  private async runNodeOnce(
    node: DagNode,
    extraArgs: Record<string, unknown>,
    skipped: Set<string>,
    results: NodeRunResult[],
    edgeBuffer: Map<string, Record<string, unknown>>,
  ): Promise<void> {
    this.ctx.events.emit({ type: 'node.ready', run_id: this.ctx.runId, node_id: node.id, ts: this.ctx.now() })
    const bundle = this.assembleBundle(node, edgeBuffer.get(node.id) ?? {}, extraArgs)
    const dispatcher = this.ctx.dispatchers.get(node.spec.kind)
    this.ctx.events.emit({ type: 'node.started', run_id: this.ctx.runId, node_id: node.id, ts: this.ctx.now() })

    const policy = node.spec.on_error ?? { policy: 'skip' as const }
    const maxAttempts = policy.policy === 'retry' ? policy.attempts : 1
    let attempt = 0
    let lastError: Error | undefined
    let succeeded = false

    while (attempt < maxAttempts) {
      attempt++
      try {
        const impl = await dispatcher.resolve(node.spec, this.ctx)
        const output = await dispatcher.run(impl, bundle, this.ctx)
        if (output.state_delta && Object.keys(output.state_delta).length > 0) {
          this.ctx.store.write(output.state_delta, { runId: this.ctx.runId, nodeId: node.id })
          for (const field of Object.keys(output.state_delta)) {
            this.ctx.events.emit({
              type: 'state.write', run_id: this.ctx.runId, node_id: node.id, field, ts: this.ctx.now(),
            })
          }
        }
        if (output.edge_output !== undefined) {
          for (const succ of node.successors) {
            const existing = edgeBuffer.get(succ) ?? {}
            existing[node.id] = output.edge_output
            edgeBuffer.set(succ, existing)
          }
        }
        this.ctx.events.emit({
          type: 'node.finished', run_id: this.ctx.runId, node_id: node.id,
          ts: this.ctx.now(), ...(output.metrics ? { metrics: output.metrics } : {}),
        })
        results.push({ nodeId: node.id, status: 'success', output })
        succeeded = true
        break
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
        if (policy.policy === 'retry' && attempt < maxAttempts) {
          const base = policy.base_ms ?? 100
          const sleepMs = policy.backoff === 'exponential' ? base * 2 ** (attempt - 1) : base * attempt
          await sleep(sleepMs)
          continue
        }
        break
      }
    }

    if (!succeeded) {
      const error = lastError ?? new Error('unknown error')
      this.ctx.events.emit({
        type: 'node.failed', run_id: this.ctx.runId, node_id: node.id,
        ts: this.ctx.now(), error: error.message,
      })
      results.push({ nodeId: node.id, status: 'failed', error })
      skipped.add(node.id)
      if (policy.policy === 'fail_run') {
        throw new Error(`Node "${node.id}" failed and policy=fail_run: ${error.message}`)
      }
    }
  }

  private assembleBundle(
    node: DagNode,
    edgeInputs: Record<string, unknown>,
    extraArgs: Record<string, unknown> = {},
  ): NodeInputBundle {
    const declaredReads = node.spec.reads ?? []
    const state_view: Record<string, unknown> = {}
    for (const field of declaredReads) {
      state_view[field] = this.ctx.store.get(field)
    }
    const fullState = this.ctx.store.snapshot()
    const rawArgs = ('args' in node.spec ? node.spec.args : undefined) ?? {}
    const resolvedArgs = resolveExpression(rawArgs, fullState) as Record<string, unknown>
    return {
      state_view: Object.freeze({ ...state_view }),
      edge_inputs: edgeInputs,
      args: { ...resolvedArgs, ...extraArgs },
    }
  }
```

- [ ] **Step 3.4: Confirm PASS**

```bash
pnpm vitest run packages/core/tests/scheduler-foreach.test.ts
pnpm vitest run packages/core/
```

Expected: new test + all existing tests pass.

- [ ] **Step 3.5: Commit**

```bash
git add packages/core/src/graph/scheduler.ts packages/core/tests/scheduler-foreach.test.ts
git commit -m "feat(core): for_each fan-out with \$item injection in scheduler"
```

---

## Task 4: Conditional edges (`when:`) in scheduler (TDD)

**Files:**
- Modify: `packages/core/src/graph/scheduler.ts` — predecessor liveness check considers `when:` per-edge
- Modify: `packages/core/src/graph/dag.ts` — DagNode carries the EdgeSpec for incoming edges so scheduler can reach `when:`
- Create: `packages/core/tests/scheduler-when.test.ts`

- [ ] **Step 4.1: Update `DagNode` to track incoming-edge specs**

In `packages/core/src/graph/dag.ts`, modify `DagNode`:
```ts
export interface DagNode {
  id: string
  spec: NodeSpec
  predecessors: string[]
  successors: string[]
  incomingEdges: import('@openexpertise/schema').EdgeSpec[]
}
```

In `buildDag`, where you push to `predecessors`, also accumulate the edge:
```ts
  for (const edge of spec.graph.edges) {
    const from = nodes.get(edge.from)
    const to = nodes.get(edge.to)
    if (!from || !to) {
      throw new Error(`Edge references missing node: ${edge.from} -> ${edge.to}`)
    }
    from.successors.push(edge.to)
    to.predecessors.push(edge.from)
    to.incomingEdges.push(edge)
  }
```

And initialize `incomingEdges: []` when constructing each DagNode.

- [ ] **Step 4.2: Write failing test**

Create `packages/core/tests/scheduler-when.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  DispatcherRegistry,
  EventBus,
  StateStore,
  RunContext,
  SequentialScheduler,
  buildDag,
  type NodeDispatcher,
  type NodeInputBundle,
  type NodeOutput,
} from '../src/index.js'
import type { ExperienceSpec, NodeSpec } from '@openexpertise/schema'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'oe-when-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

describe('Conditional edges with when:', () => {
  it('skips downstream node when the only incoming edge condition is false', async () => {
    const spec: ExperienceSpec = {
      name: 't', version: '0.1.0',
      state: { schema: { count: { type: 'number' }, result: { type: 'string' } } },
      graph: {
        nodes: [
          { id: 'seed', kind: 'tool', impl: 'x', writes: ['count'] },
          { id: 'gated', kind: 'tool', impl: 'x', writes: ['result'] },
        ],
        edges: [{ from: 'seed', to: 'gated', when: '$.count > 0' }],
      },
    }
    const store = new StateStore({ dbPath: join(dir, 's.sqlite'), spec })
    const dispatcher: NodeDispatcher = {
      kind: 'tool',
      async resolve(n: NodeSpec) { return { id: n.id } },
      async run(impl: { id: string }): Promise<NodeOutput> {
        if (impl.id === 'seed') return { state_delta: { count: 0 } }
        return { state_delta: { result: 'should-not-run' } }
      },
    }
    const dispatchers = new DispatcherRegistry()
    dispatchers.register(dispatcher)
    const ctx = new RunContext({
      runId: 'r', spec, experienceDir: dir, store,
      events: new EventBus(), dispatchers, args: {},
    })
    const scheduler = new SequentialScheduler(buildDag(spec), ctx)
    const { status, results } = await scheduler.run()
    expect(status).toBe('success')
    expect(store.get('result')).toBeUndefined()
    const gated = results.find((r) => r.nodeId === 'gated')
    expect(gated?.status).toBe('skipped')
    store.close()
  })

  it('runs downstream node when condition is true', async () => {
    const spec: ExperienceSpec = {
      name: 't', version: '0.1.0',
      state: { schema: { count: { type: 'number' }, result: { type: 'string' } } },
      graph: {
        nodes: [
          { id: 'seed', kind: 'tool', impl: 'x', writes: ['count'] },
          { id: 'gated', kind: 'tool', impl: 'x', writes: ['result'] },
        ],
        edges: [{ from: 'seed', to: 'gated', when: '$.count > 0' }],
      },
    }
    const store = new StateStore({ dbPath: join(dir, 's.sqlite'), spec })
    const dispatcher: NodeDispatcher = {
      kind: 'tool',
      async resolve(n: NodeSpec) { return { id: n.id } },
      async run(impl: { id: string }): Promise<NodeOutput> {
        if (impl.id === 'seed') return { state_delta: { count: 5 } }
        return { state_delta: { result: 'ran' } }
      },
    }
    const dispatchers = new DispatcherRegistry()
    dispatchers.register(dispatcher)
    const ctx = new RunContext({
      runId: 'r', spec, experienceDir: dir, store,
      events: new EventBus(), dispatchers, args: {},
    })
    const scheduler = new SequentialScheduler(buildDag(spec), ctx)
    const { status } = await scheduler.run()
    expect(status).toBe('success')
    expect(store.get('result')).toBe('ran')
    store.close()
  })
})
```

- [ ] **Step 4.3: Confirm FAIL**

```bash
pnpm vitest run packages/core/tests/scheduler-when.test.ts
```

- [ ] **Step 4.4: Modify `scheduler.ts` to honor `when:`**

In the run loop, after the `predSkipped` block, add a `when:` evaluation:

```ts
      // Evaluate any when: conditions on incoming edges. The node runs only if
      // ALL its incoming edges are "live" (no edge whose when: is false).
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
          })
          results.push({ nodeId: node.id, status: 'skipped' })
          continue
        }
      }
```

Add the import at the top of `scheduler.ts`:
```ts
import { evaluateExpression } from '../expressions/evaluate.js'
```

- [ ] **Step 4.5: Confirm PASS**

```bash
pnpm vitest run packages/core/tests/scheduler-when.test.ts
pnpm vitest run packages/core/
```

Expected: new tests + all existing pass.

- [ ] **Step 4.6: Commit**

```bash
git add packages/core/src/graph/dag.ts packages/core/src/graph/scheduler.ts packages/core/tests/scheduler-when.test.ts
git commit -m "feat(core): conditional edges via when: predicate"
```

---

## Task 5: `pipeline` group construct in scheduler (TDD)

**Files:**
- Modify: `packages/core/src/graph/scheduler.ts` — run pipelines from `spec.graph.pipelines`
- Create: `packages/core/tests/scheduler-pipeline.test.ts`

- [ ] **Step 5.1: Write failing test**

Create `packages/core/tests/scheduler-pipeline.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  DispatcherRegistry,
  EventBus,
  StateStore,
  RunContext,
  SequentialScheduler,
  buildDag,
  type NodeDispatcher,
  type NodeInputBundle,
  type NodeOutput,
} from '../src/index.js'
import type { ExperienceSpec, NodeSpec } from '@openexpertise/schema'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'oe-pipeline-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

describe('Pipeline groups', () => {
  it('runs each item through all stages in sequence', async () => {
    const spec: ExperienceSpec = {
      name: 't', version: '0.1.0',
      state: { schema: { items: { type: 'array' }, processed: { type: 'array', merge: 'array_append' } } },
      graph: {
        nodes: [
          { id: 'seed', kind: 'tool', impl: 'x', writes: ['items'] },
          { id: 'stage_a', kind: 'tool', impl: 'x' },
          { id: 'stage_b', kind: 'tool', impl: 'x', writes: ['processed'] },
        ],
        edges: [{ from: 'seed', to: 'stage_a' }],
        pipelines: [{ id: 'p1', items: '$.items', stages: ['stage_a', 'stage_b'] }],
      },
    }
    const store = new StateStore({ dbPath: join(dir, 's.sqlite'), spec })
    const router: NodeDispatcher = {
      kind: 'tool',
      async resolve(n: NodeSpec) { return { id: n.id } },
      async run(impl: { id: string }, b: NodeInputBundle): Promise<NodeOutput> {
        if (impl.id === 'seed') return { state_delta: { items: ['x', 'y'] } }
        if (impl.id === 'stage_a') return { state_delta: {}, edge_output: `A:${b.args.$item}` }
        if (impl.id === 'stage_b') return {
          state_delta: { processed: [String(b.edge_inputs.stage_a)] },
        }
        return { state_delta: {} }
      },
    }
    const dispatchers = new DispatcherRegistry()
    dispatchers.register(router)
    const ctx = new RunContext({
      runId: 'r', spec, experienceDir: dir, store,
      events: new EventBus(), dispatchers, args: {},
    })
    const scheduler = new SequentialScheduler(buildDag(spec), ctx)
    const { status } = await scheduler.run()
    expect(status).toBe('success')
    expect(store.get('processed')).toEqual(['A:x', 'A:y'])
    store.close()
  })
})
```

- [ ] **Step 5.2: Confirm FAIL**

```bash
pnpm vitest run packages/core/tests/scheduler-pipeline.test.ts
```

- [ ] **Step 5.3: Implement pipeline execution in `scheduler.ts`**

After the DAG-topological loop in `SequentialScheduler.run()`, ADD a second pass for pipelines:

```ts
    // Pipeline groups: each pipeline reads its `items:` source from state and
    // runs each item through all stages. Within a pipeline, each item flows
    // through every stage before the next item starts (sequential V1; Plan 4
    // can add per-stage barrier semantics for true streaming).
    const pipelines = this.ctx.spec.graph.pipelines ?? []
    for (const pg of pipelines) {
      const fullState = this.ctx.store.snapshot()
      const itemsVal = resolveExpression(pg.items, fullState)
      const items: unknown[] = Array.isArray(itemsVal) ? itemsVal : []
      for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx]
        let edgeFromPrevStage: unknown = undefined
        let prevStageId: string | undefined
        for (const stageId of pg.stages) {
          const stageNode = this.dag.nodes.get(stageId)
          if (!stageNode) {
            throw new Error(`Pipeline "${pg.id}" references unknown stage node "${stageId}"`)
          }
          const edgeInputs: Record<string, unknown> =
            prevStageId !== undefined && edgeFromPrevStage !== undefined
              ? { [prevStageId]: edgeFromPrevStage }
              : {}
          edgeBuffer.set(stageId, edgeInputs)
          await this.runNodeOnce(
            stageNode,
            { $item: item, $index: idx, $pipeline: pg.id },
            skipped,
            results,
            edgeBuffer,
          )
          // Recover stage output for next stage's edge_inputs
          const last = results[results.length - 1]
          if (last?.status === 'success' && last.output?.edge_output !== undefined) {
            edgeFromPrevStage = last.output.edge_output
            prevStageId = stageId
          } else {
            edgeFromPrevStage = undefined
            prevStageId = undefined
            if (last?.status === 'failed') anyFailed = true
            break // a stage failed; abort this item, continue with the next
          }
        }
      }
    }
```

⚠ Critical: stages of a pipeline must NOT also appear in the main topological loop. The scheduler currently runs all `dag.topoOrder` nodes. To prevent double-execution, track which nodes are pipeline stages and skip them in the topological pass:

At the top of `run()`:
```ts
    const pipelineStageIds = new Set(
      (this.ctx.spec.graph.pipelines ?? []).flatMap((p) => p.stages),
    )
```

In the topological loop, skip pipeline stage nodes:
```ts
    for (const node of this.dag.topoOrder) {
      if (pipelineStageIds.has(node.id)) {
        continue // executed by pipeline pass instead
      }
      // ... rest of existing loop body
    }
```

- [ ] **Step 5.4: Confirm PASS**

```bash
pnpm vitest run packages/core/tests/scheduler-pipeline.test.ts
pnpm vitest run packages/core/
```

- [ ] **Step 5.5: Commit**

```bash
git add packages/core/src/graph/scheduler.ts packages/core/tests/scheduler-pipeline.test.ts
git commit -m "feat(core): pipeline groups (per-item streaming through stages)"
```

---

## Task 6: Phase grouping events (TDD-lite)

**Files:**
- Modify: `packages/core/src/events/bus.ts` — add `phase` to `node.started`/`node.finished` events
- Modify: `packages/core/src/graph/scheduler.ts` — include `phase: node.spec.phase` in those events
- Create: `packages/core/tests/scheduler-phase.test.ts`

- [ ] **Step 6.1: Extend `RunEvent` types in `bus.ts`**

Find the `RunEvent` union and add an optional `phase?: string` to `node.ready`, `node.started`, `node.finished`, `node.failed`, `node.skipped`:

```ts
export type RunEvent =
  | { type: 'run.started'; run_id: string; ts: string; args?: unknown }
  | { type: 'run.finished'; run_id: string; ts: string; status: 'success' | 'failed' | 'partial' }
  | { type: 'node.ready'; run_id: string; node_id: string; ts: string; phase?: string }
  | { type: 'node.started'; run_id: string; node_id: string; ts: string; phase?: string }
  | { type: 'node.finished'; run_id: string; node_id: string; ts: string; phase?: string; metrics?: { tokens_in?: number; tokens_out?: number; cost_usd?: number } }
  | { type: 'node.failed'; run_id: string; node_id: string; ts: string; phase?: string; error: string }
  | { type: 'node.skipped'; run_id: string; node_id: string; ts: string; phase?: string; reason: string }
  | { type: 'state.write'; run_id: string; node_id: string; field: string; ts: string }
```

- [ ] **Step 6.2: Modify `scheduler.ts` to set `phase` on emitted events**

In every `events.emit({ type: 'node.*', ... })` call in `runNodeOnce` and the topological loop, add `...(node.spec.phase ? { phase: node.spec.phase } : {})`.

Example:
```ts
this.ctx.events.emit({
  type: 'node.started', run_id: this.ctx.runId, node_id: node.id,
  ts: this.ctx.now(),
  ...(node.spec.phase ? { phase: node.spec.phase } : {}),
})
```

Do this for all five node.* events. Don't add `phase` to `run.*` or `state.write`.

- [ ] **Step 6.3: Write test**

Create `packages/core/tests/scheduler-phase.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  DispatcherRegistry, EventBus, StateStore, RunContext,
  SequentialScheduler, buildDag,
  type NodeDispatcher, type NodeOutput, type RunEvent,
} from '../src/index.js'
import type { ExperienceSpec, NodeSpec } from '@openexpertise/schema'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'oe-phase-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

describe('Phase grouping in events', () => {
  it('emits phase on node.* events when declared', async () => {
    const spec: ExperienceSpec = {
      name: 't', version: '0.1.0',
      state: { schema: { x: { type: 'string' } } },
      phases: [{ id: 'collect' }],
      graph: {
        nodes: [
          { id: 'a', kind: 'tool', impl: 'x', phase: 'collect', writes: ['x'] },
          { id: 'b', kind: 'tool', impl: 'x' /* no phase */ },
        ],
        edges: [{ from: 'a', to: 'b' }],
      },
    }
    const store = new StateStore({ dbPath: join(dir, 's.sqlite'), spec })
    const dispatcher: NodeDispatcher = {
      kind: 'tool',
      async resolve() { return {} },
      async run(): Promise<NodeOutput> { return { state_delta: {} } },
    }
    const dispatchers = new DispatcherRegistry()
    dispatchers.register(dispatcher)
    const events = new EventBus()
    const seen: RunEvent[] = []
    events.subscribe((e) => seen.push(e))
    const ctx = new RunContext({
      runId: 'r', spec, experienceDir: dir, store, events, dispatchers, args: {},
    })
    await new SequentialScheduler(buildDag(spec), ctx).run()

    const aFinished = seen.find((e) => e.type === 'node.finished' && e.node_id === 'a')
    const bFinished = seen.find((e) => e.type === 'node.finished' && e.node_id === 'b')
    expect((aFinished as { phase?: string } | undefined)?.phase).toBe('collect')
    expect((bFinished as { phase?: string } | undefined)?.phase).toBeUndefined()
    store.close()
  })
})
```

- [ ] **Step 6.4: Run + commit**

```bash
pnpm vitest run packages/core/tests/scheduler-phase.test.ts
pnpm vitest run packages/core/
git add packages/core/src/events/bus.ts packages/core/src/graph/scheduler.ts packages/core/tests/scheduler-phase.test.ts
git commit -m "feat(core): phase grouping surfaced in node.* events"
```

---

## Task 7: `examples/review-branch` — the anchor demo

**Files:**
- Create: `examples/review-branch/` directory + all sub-files

- [ ] **Step 7.1: Create `experience.yaml`**

`examples/review-branch/experience.yaml`:
```yaml
name: review-branch
description: Review a PR across dimensions; verify each finding before counting it.
version: 0.1.0

state:
  schema:
    pr_id: { type: string }
    dimensions: { type: array, items: { type: object } }
    findings: { type: array, items: { type: object }, merge: array_append }
    verified_findings: { type: array, items: { type: object }, merge: array_append }
    risk_score: { type: number }

phases:
  - { id: collect }
  - { id: review }
  - { id: verify }
  - { id: score }

graph:
  nodes:
    - id: seed_dimensions
      kind: tool
      phase: collect
      impl: ./tools/list_dimensions.mjs
      writes: [dimensions]
    - id: bug_review
      kind: agent
      phase: review
      prompt: ./prompts/review.md
      schema:
        type: object
        required: [findings]
        properties:
          findings:
            type: array
            items:
              type: object
              required: [title, severity]
              properties:
                title: { type: string }
                severity: { type: string }
      for_each: { source: $.dimensions }
      writes: [findings]
    - id: verify_finding
      kind: agent
      phase: verify
      prompt: ./prompts/verify.md
      schema:
        type: object
        required: [is_real]
        properties:
          is_real: { type: boolean }
      writes: [verified_findings]
    - id: score
      kind: agent
      phase: score
      prompt: ./prompts/score.md
      reads: [verified_findings]
      schema:
        type: object
        required: [risk_score]
        properties:
          risk_score: { type: number }
      writes: [risk_score]
  edges:
    - { from: seed_dimensions, to: bug_review }
    - { from: bug_review, to: score, when: 'length($.findings) > 0' }
  pipelines:
    - id: verify_pipe
      items: $.findings
      stages: [verify_finding]
      phase: verify
```

- [ ] **Step 7.2: Create prompts and tools**

`examples/review-branch/prompts/review.md`:
```
You are reviewing dimension {{$item}} of PR {{pr_id}}.
Return a structured list of findings via the structured_output tool.
```

`examples/review-branch/prompts/verify.md`:
```
Adversarially verify this finding: {{$item}}.
Return whether it's a real issue via the structured_output tool.
```

`examples/review-branch/prompts/score.md`:
```
Given these verified findings: {{verified_findings}}, compute a risk_score in [0,1].
```

`examples/review-branch/tools/list_dimensions.mjs`:
```js
export default async function listDimensions() {
  return {
    state_delta: {
      dimensions: [
        { key: 'bugs', focus: 'logic errors' },
        { key: 'perf', focus: 'regressions' },
        { key: 'tests', focus: 'missing coverage' },
      ],
    },
  }
}
```

`examples/review-branch/package.json`:
```json
{
  "name": "@openexpertise/example-review-branch",
  "version": "0.1.0",
  "private": true,
  "type": "module"
}
```

`examples/review-branch/README.md`:
```markdown
# review-branch

The canonical OpenExpertise demo — fan-out + pipeline + conditional + agent + structured output.

```bash
export ANTHROPIC_API_KEY=sk-...
oe run examples/review-branch --args '{"pr_id":"PR-1234"}'
```

CI / unattended testing uses the mocked Anthropic client in `e2e/review-branch.e2e.test.ts`.
```

- [ ] **Step 7.3: Validate the example loads**

```bash
cd /Users/xuxingcheng/SHLAB/github/OpenExpertise/.claude/worktrees/overnight-plans-2-6
node packages/cli/dist/bin.js validate examples/review-branch
```

If it errors on schema, fix the yaml until validation passes. Common pitfalls: missing required fields, kind-specific required fields (agent needs `prompt`, etc.).

- [ ] **Step 7.4: Commit**

```bash
git add examples/review-branch/
git commit -m "feat(examples): review-branch anchor demo (fan-out + pipeline + conditional + agent)"
```

---

## Task 8: E2E for review-branch with mocked Anthropic

**Files:**
- Create: `e2e/review-branch.e2e.test.ts`

- [ ] **Step 8.1: Write the test**

Create `e2e/review-branch.e2e.test.ts`:
```ts
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, cpSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseExperienceYaml } from '@openexpertise/schema'
import {
  DispatcherRegistry, EventBus, runExperience,
  type LLMClient, type LLMCompleteOpts,
} from '@openexpertise/core'
import { ToolDispatcher } from '@openexpertise/node-kinds-tool'
import { AgentDispatcher } from '@openexpertise/node-kinds-agent'

const HERE = dirname(fileURLToPath(import.meta.url))

class ScriptedLLM implements LLMClient {
  public calls: LLMCompleteOpts[] = []
  async complete(opts: LLMCompleteOpts) {
    this.calls.push(opts)
    const prompt = opts.messages[0]?.content ?? ''
    // Pattern-match by prompt content to return appropriate tool_calls.
    if (prompt.includes('reviewing dimension')) {
      return {
        text: '',
        tool_calls: [{
          name: 'structured_output',
          input: {
            findings: [
              { title: 'sample bug', severity: 'high' },
            ],
          },
        }],
      }
    }
    if (prompt.includes('Adversarially verify')) {
      return {
        text: '',
        tool_calls: [{ name: 'structured_output', input: { is_real: true } }],
      }
    }
    if (prompt.includes('compute a risk_score')) {
      return {
        text: '',
        tool_calls: [{ name: 'structured_output', input: { risk_score: 0.75 } }],
      }
    }
    return { text: 'unknown prompt' }
  }
}

let dir: string
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }) })

describe('review-branch end-to-end (mocked Anthropic)', () => {
  it('runs all stages and produces a risk_score', async () => {
    dir = mkdtempSync(join(tmpdir(), 'oe-e2e-review-'))
    const src = join(HERE, '..', 'examples', 'review-branch')
    cpSync(src, dir, { recursive: true })

    const spec = parseExperienceYaml(readFileSync(join(dir, 'experience.yaml'), 'utf8'))
    const llm = new ScriptedLLM()
    const dispatchers = new DispatcherRegistry()
    dispatchers.register(new ToolDispatcher())
    dispatchers.register(new AgentDispatcher({ client: llm }))

    const result = await runExperience({
      spec,
      experienceDir: dir,
      dispatchers,
      events: new EventBus(),
      args: { pr_id: 'PR-1' },
    })

    expect(result.status).toBe('success')
    // 3 dimensions × 1 finding each = 3 findings; all verified is_real
    expect((result.finalState.findings as unknown[])?.length).toBe(3)
    expect((result.finalState.verified_findings as unknown[])?.length).toBe(3)
    expect(result.finalState.risk_score).toBe(0.75)
  })
})
```

- [ ] **Step 8.2: Add e2e dep on node-kinds-agent**

Edit `e2e/package.json` (if not already present):
```json
{
  "name": "@openexpertise/e2e",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": { "test": "vitest run" },
  "dependencies": {
    "@openexpertise/cli": "workspace:*",
    "@openexpertise/core": "workspace:*",
    "@openexpertise/schema": "workspace:*",
    "@openexpertise/node-kinds-tool": "workspace:*",
    "@openexpertise/node-kinds-agent": "workspace:*",
    "@openexpertise/node-kinds-dataset": "workspace:*",
    "@openexpertise/node-kinds-experience": "workspace:*"
  }
}
```

- [ ] **Step 8.3: Run + commit**

```bash
cd /Users/xuxingcheng/SHLAB/github/OpenExpertise/.claude/worktrees/overnight-plans-2-6
pnpm install
pnpm -r build
pnpm vitest run e2e/review-branch.e2e.test.ts
git add e2e/review-branch.e2e.test.ts e2e/package.json
git commit -m "test(e2e): review-branch end-to-end with scripted LLM"
```

---

## Task 9: Final clean rebuild + summary

- [ ] **Step 9.1: Clean rebuild**

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
```

Expected: all green. Test count: ~78 (existing 70 + evaluate 8 + foreach 1 + when 2 + pipeline 1 + phase 1 + review-branch e2e 1 = ~84).

- [ ] **Step 9.2: Commit any final fix-ups (prettier reformat, etc.)**

```bash
git status
git add -A
git diff --cached --stat
git commit -m "style(plan-3): prettier/lint cleanup" || echo "nothing to commit"
```

---

## Coverage check

| Spec section | Plan 3 task(s) | Coverage |
|---|---|---|
| §9 sequential | Inherited from Plan 1 | ✅ |
| §9 fan-out / for-each | Task 3 | ✅ |
| §9 pipeline group | Task 5 | ✅ |
| §9 conditional edge `when:` | Task 4 | ✅ |
| §9 bounded loop `repeat:` | — | ⏳ Plan 4 micro-task |
| §9 phase grouping | Task 6 | ✅ events; TUI rendering = Plan 4 |
| §6/§16 review-branch anchor | Tasks 7-8 | ✅ |

---

## Notes for the executor

- Strict TDD per task. Don't skip the RED step.
- Commit per task with the exact message.
- Rebuild dist after touching exported packages so consumers resolve through workspace symlinks.
- `evaluateExpression` is a tiny hand-rolled parser — no `eval`, no external deps. If extensions like `length(...)` need to grow, do them here.
- Pipeline V1 runs sequentially per-item then per-stage. True streaming with cross-item parallelism is a Plan 4+ concern.
- `for_each` and `pipeline` both inject `$item` and `$index` into args. If a dispatcher needs the item it should read `args.$item`.
