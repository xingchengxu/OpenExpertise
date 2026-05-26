# Plan B — TUI Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The TUI shows per-node real-time token consumption + current activity ("calling claude-sonnet-4-6", "spawning codex subprocess", etc.), plus a header line with total run-level tokens — closing the visual gap to `/workflows`' htop-grade panel.

**Architecture:** Two new `RunEvent` variants — `node.tokens` and `node.activity` — emitted by the LLM-using dispatchers (AgentDispatcher, SkillDispatcher, CliAgentDispatcher). The Dashboard's state reducer is extracted into a pure function so it's unit-testable; the React component just wires it into `useReducer`. The reducer accumulates per-node token totals and tracks the latest activity string.

**Tech Stack:** TypeScript, React/Ink (already a workspace dep), vitest. No new external dependencies.

**Spec:** `docs/superpowers/specs/2026-05-26-ultraexpertise-and-v2-polish-design.md` (Plan B section)

---

## File Structure

**Modified:**

- `packages/core/src/events/bus.ts` — add `node.tokens` and `node.activity` to the `RunEvent` discriminated union.
- `packages/node-kinds-agent/src/agent-dispatcher.ts` — emit `node.activity` (before LLM call, after) and `node.tokens` (after LLM call using `result.usage`).
- `packages/node-kinds-agent/tests/agent-dispatcher.test.ts` — assert events emit.
- `packages/node-kinds-skill/src/skill-dispatcher.ts` — same emit pattern.
- `packages/node-kinds-skill/tests/skill-dispatcher.test.ts` — assert events.
- `packages/node-kinds-cli-agent/src/dispatcher.ts` — emit `node.activity` (spawning provider, parsing output). No `node.tokens` (CLIs don't report usage).
- `packages/node-kinds-cli-agent/tests/dispatcher.test.ts` — assert events.
- `packages/tui/src/dashboard.tsx` — wire new reducer; render tokens + activity per row + total-tokens header.

**New:**

- `packages/tui/src/reducer.ts` — pure `reduceDashboardState(prev, event)` function + `initialDashboardState(nodes)`. Holds all Dashboard logic that's not React-specific.
- `packages/tui/tests/reducer.test.ts` — exhaustive vitest coverage of the reducer.

**No new docs file.** This task is a visible polish; the existing `README.md` quick-start already shows `--tui`. We add a one-line note in the README acknowledging the new visuals.

---

## Task 1: Extend `RunEvent` with `node.tokens` and `node.activity`

**Files:**

- Modify: `packages/core/src/events/bus.ts`

This is a type-only addition. No behavior changes. Dispatchers in later tasks emit these new variants.

- [ ] **Step 1: Append the two new variants to `RunEvent` in `bus.ts`**

Read `packages/core/src/events/bus.ts`. Find the `RunEvent` union (currently has 8 variants: `run.started`, `run.finished`, `node.ready`, `node.started`, `node.finished`, `node.failed`, `node.skipped`, `state.write`). Add two more before the closing `=` block ends:

```ts
  | {
      type: 'node.tokens'
      run_id: string
      node_id: string
      ts: string
      input_tokens: number
      output_tokens: number
      model?: string
    }
  | {
      type: 'node.activity'
      run_id: string
      node_id: string
      ts: string
      activity: string
    }
```

The final shape should look like:

```ts
export type RunEvent =
  | { type: 'run.started'; ... }
  | { type: 'run.finished'; ... }
  | { type: 'node.ready'; ... }
  | { type: 'node.started'; ... }
  | { type: 'node.finished'; ... }
  | { type: 'node.failed'; ... }
  | { type: 'node.skipped'; ... }
  | { type: 'state.write'; ... }
  | { type: 'node.tokens'; ... }
  | { type: 'node.activity'; ... }
```

- [ ] **Step 2: Verify typecheck still passes**

```bash
pnpm --filter @openexpertise/core build 2>&1 | tail -3
pnpm typecheck 2>&1 | tail -5
```

Expected: clean. (No consumer code is forced to handle the new variants because TS's exhaustive checking only fires when a `switch`/`if-else` chain claims to handle all variants — existing code uses inclusive checks, not exclusive.)

If `dashboard.tsx` typechecks fail with "exhaustive switch" warnings, that's the existing reducer needing the explicit fall-through. Task 6 fixes that. For now, expect a non-error warning at worst.

- [ ] **Step 3: Confirm no existing tests broke**

```bash
pnpm test 2>&1 | tail -5
```

Expected: still 184 passing (event types are additive).

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/events/bus.ts
git commit -m "feat(core): add node.tokens + node.activity event variants"
```

---

## Task 2: AgentDispatcher emits tokens + activity (TDD)

**Files:**

- Modify: `packages/node-kinds-agent/src/agent-dispatcher.ts`
- Modify: `packages/node-kinds-agent/tests/agent-dispatcher.test.ts`

The dispatcher already has `ctx: RunContext` with `events: EventBus` and `runId: string`. We emit at three transitions: before the LLM call, after the LLM returns (tokens), and at the end (parsing/validating).

- [ ] **Step 1: Read the current dispatcher and test**

```bash
sed -n '1,50p' packages/node-kinds-agent/src/agent-dispatcher.ts
sed -n '1,40p' packages/node-kinds-agent/tests/agent-dispatcher.test.ts
```

Note where `complete()` is called and what `ctx` looks like in tests.

- [ ] **Step 2: Append the failing test**

Append to `packages/node-kinds-agent/tests/agent-dispatcher.test.ts`:

```ts
import { EventBus, type RunEvent } from '@openexpertise/core'

describe('AgentDispatcher emits node.activity + node.tokens', () => {
  it('emits activity transitions and a tokens event with usage from the LLM', async () => {
    const events = new EventBus()
    const captured: RunEvent[] = []
    events.subscribe((e) => captured.push(e))

    // Scripted LLM returns usage; the dispatcher should turn it into a node.tokens event.
    const llm = {
      async complete() {
        return {
          text: '',
          tool_calls: [{ name: 'structured_output', input: { result: 'hi' } }],
          usage: { input_tokens: 12, output_tokens: 7 },
        }
      },
    }

    const dispatcher = new AgentDispatcher({ client: llm as never, defaultModel: 'fake-model' })
    const node = {
      id: 'n1',
      kind: 'agent' as const,
      prompt: './_inline_for_test_.md',
      writes: ['result'],
      schema: { type: 'object', required: ['result'], properties: { result: { type: 'string' } } },
    }

    // Stub the prompt file lookup by writing one in a tmp dir, OR pass a ctx with
    // experienceDir pointing at a path with a tiny prompt. Use whatever pattern the
    // existing tests in this file already use. If existing tests already exercise
    // prompt loading via mkdtempSync, follow that pattern. Replace this comment with
    // the actual setup.
    //
    // The test must:
    //   1. Create a tmp experienceDir
    //   2. Write `_inline_for_test_.md` to it with body "do {{x}}" or similar
    //   3. Build ctx = { runId: 'r1', experienceDir: <tmp>, events, ... } using whatever
    //      RunContext shape the existing tests use
    //   4. Call dispatcher.resolve(node, ctx)
    //   5. Call dispatcher.run(impl, { state_view: {}, edge_inputs: {}, args: {} }, ctx)
    //   6. Assert captured contains at least one 'node.activity' and one 'node.tokens'

    // The remainder of the test asserts on captured:
    const activities = captured.filter((e) => e.type === 'node.activity')
    expect(activities.length).toBeGreaterThanOrEqual(1)
    expect(activities.every((a) => a.node_id === 'n1')).toBe(true)

    const tokens = captured.filter((e) => e.type === 'node.tokens')
    expect(tokens.length).toBe(1)
    expect(tokens[0]).toMatchObject({
      type: 'node.tokens',
      node_id: 'n1',
      input_tokens: 12,
      output_tokens: 7,
      model: 'fake-model',
    })
  })
})
```

**Important for the implementer:** the existing test file in `packages/node-kinds-agent/tests/agent-dispatcher.test.ts` already has working ctx setup. Mirror that exact pattern — don't reinvent the wheel. Read the existing setup helpers before writing this test body. If the existing file constructs ctx with `{ runId: 'r', experienceDir: dir, store: ..., events: new EventBus(), args: {} } as RunContext`, use that exact form (plus replace the events with the captured one).

- [ ] **Step 3: Confirm RED**

```bash
pnpm exec vitest run packages/node-kinds-agent/tests/agent-dispatcher.test.ts 2>&1 | tail -15
```

Expected: FAIL — new tests don't pass because no events are emitted yet.

- [ ] **Step 4: Modify `agent-dispatcher.ts` to emit events**

In the `run()` method of `AgentDispatcher`, add `ctx.events.emit(...)` calls at three transitions. The exact placement depends on the current structure — read the file, then insert:

**Before the `await this.opts.client.complete(...)` call:**

```ts
const ts = () => new Date().toISOString()
ctx.events.emit({
  type: 'node.activity',
  run_id: ctx.runId,
  node_id: ai.spec.id,
  ts: ts(),
  activity: `calling ${completeOpts.model}`,
})
```

**Immediately after the `await this.opts.client.complete(...)` call returns** (using the local `result` variable that holds the response):

```ts
if (result.usage) {
  ctx.events.emit({
    type: 'node.tokens',
    run_id: ctx.runId,
    node_id: ai.spec.id,
    ts: ts(),
    input_tokens: result.usage.input_tokens,
    output_tokens: result.usage.output_tokens,
    model: completeOpts.model,
  })
}
ctx.events.emit({
  type: 'node.activity',
  run_id: ctx.runId,
  node_id: ai.spec.id,
  ts: ts(),
  activity: ai.ajvValidator ? 'validating structured output' : 'parsing text output',
})
```

Use `ctx.runId` and `ai.spec.id` (or whatever local variable holds the node ID). Use ISO timestamps for `ts`.

- [ ] **Step 5: Confirm GREEN**

```bash
pnpm --filter @openexpertise/node-kinds-agent build 2>&1 | tail -3
pnpm exec vitest run packages/node-kinds-agent/tests/agent-dispatcher.test.ts 2>&1 | tail -10
```

Expected: all tests (existing + new) pass.

- [ ] **Step 6: Full suite — no regressions**

```bash
pnpm test 2>&1 | tail -5
```

Expected: 184 baseline + 1 new = **185 passing**.

- [ ] **Step 7: Commit**

```bash
git add packages/node-kinds-agent/src/agent-dispatcher.ts packages/node-kinds-agent/tests/agent-dispatcher.test.ts
git commit -m "feat(node-kinds-agent): emit node.activity + node.tokens"
```

---

## Task 3: SkillDispatcher emits tokens + activity (TDD)

**Files:**

- Modify: `packages/node-kinds-skill/src/skill-dispatcher.ts`
- Modify: `packages/node-kinds-skill/tests/skill-dispatcher.test.ts`

Same pattern as Task 2. Skills also wrap LLM calls via `LLMClient.complete`.

- [ ] **Step 1: Read the current dispatcher**

```bash
sed -n '1,80p' packages/node-kinds-skill/src/skill-dispatcher.ts
```

- [ ] **Step 2: Append the failing test**

Add a similar test to `packages/node-kinds-skill/tests/skill-dispatcher.test.ts`. Use the same `events`/`captured` recording pattern as Task 2. Use a scripted LLM that returns `usage: { input_tokens: 5, output_tokens: 3 }`. Assert `node.activity` and `node.tokens` are emitted.

```ts
import { EventBus, type RunEvent } from '@openexpertise/core'

describe('SkillDispatcher emits node.activity + node.tokens', () => {
  it('emits activity + tokens around the LLM call', async () => {
    const events = new EventBus()
    const captured: RunEvent[] = []
    events.subscribe((e) => captured.push(e))

    const llm = {
      async complete() {
        return {
          text: 'ok',
          usage: { input_tokens: 5, output_tokens: 3 },
        }
      },
    }

    // Mirror the existing skill-dispatcher test setup for ctx + node + impl.
    // The existing tests already exercise the dispatcher end-to-end; insert
    // `events` into the ctx object they construct.

    // (Replace this comment with the existing test scaffolding pattern.)

    const tokens = captured.filter((e) => e.type === 'node.tokens')
    expect(tokens.length).toBe(1)
    expect(tokens[0]).toMatchObject({ input_tokens: 5, output_tokens: 3 })

    const activities = captured.filter((e) => e.type === 'node.activity')
    expect(activities.length).toBeGreaterThanOrEqual(1)
  })
})
```

- [ ] **Step 3: Confirm RED**

```bash
pnpm exec vitest run packages/node-kinds-skill/tests/skill-dispatcher.test.ts 2>&1 | tail -10
```

- [ ] **Step 4: Modify `skill-dispatcher.ts` to emit events**

Apply the same pattern as Task 2 to `SkillDispatcher.run()`:

```ts
const ts = () => new Date().toISOString()
ctx.events.emit({
  type: 'node.activity',
  run_id: ctx.runId,
  node_id: <nodeId>,
  ts: ts(),
  activity: `calling ${completeOpts.model} (skill: ${<skillName>})`,
})

// after complete() returns
if (result.usage) {
  ctx.events.emit({
    type: 'node.tokens',
    run_id: ctx.runId,
    node_id: <nodeId>,
    ts: ts(),
    input_tokens: result.usage.input_tokens,
    output_tokens: result.usage.output_tokens,
    model: completeOpts.model,
  })
}
```

Find the right local variable names by reading the file (the skill name is on the impl, the node id is on `impl.spec.id` or similar).

- [ ] **Step 5: Confirm GREEN**

```bash
pnpm --filter @openexpertise/node-kinds-skill build 2>&1 | tail -3
pnpm exec vitest run packages/node-kinds-skill/tests/skill-dispatcher.test.ts 2>&1 | tail -10
```

- [ ] **Step 6: Commit**

```bash
git add packages/node-kinds-skill/src/skill-dispatcher.ts packages/node-kinds-skill/tests/skill-dispatcher.test.ts
git commit -m "feat(node-kinds-skill): emit node.activity + node.tokens"
```

---

## Task 4: CliAgentDispatcher emits activity (TDD)

**Files:**

- Modify: `packages/node-kinds-cli-agent/src/dispatcher.ts`
- Modify: `packages/node-kinds-cli-agent/tests/dispatcher.test.ts`

CLI agents don't expose token usage, so we emit `node.activity` only. Two activity transitions: "spawning <provider>" before the subprocess, "parsing stdout" after.

- [ ] **Step 1: Append the failing test**

Append to `packages/node-kinds-cli-agent/tests/dispatcher.test.ts`:

```ts
import { EventBus, type RunEvent } from '@openexpertise/core'

describe('CliAgentDispatcher emits node.activity', () => {
  it('emits at least two activity events (spawn + parse)', async () => {
    const events = new EventBus()
    const captured: RunEvent[] = []
    events.subscribe((e) => captured.push(e))

    const runner = new FakeRunner({ stdout: 'ok', stderr: '', exitCode: 0, timedOut: false })
    const dispatcher = new CliAgentDispatcher({ runner })

    const node: CliAgentNodeSpec = {
      id: 'n1',
      kind: 'cli-agent',
      provider: 'claude-code',
      prompt: 'hi',
      writes: ['out'],
    }
    const ctx = { experienceDir: '/tmp/exp', runId: 'r1', events } as unknown as RunContext

    const impl = await dispatcher.resolve(node, ctx)
    await dispatcher.run(impl, { state_view: {}, edge_inputs: {}, args: {} }, ctx)

    const activities = captured.filter((e) => e.type === 'node.activity')
    expect(activities.length).toBeGreaterThanOrEqual(2)
    expect(activities[0]).toMatchObject({ type: 'node.activity', node_id: 'n1' })
    // First activity mentions the provider; later one mentions parsing.
    expect(activities[0].activity).toMatch(/claude-code|spawning/i)
    expect(activities[activities.length - 1].activity).toMatch(/parsing|output/i)
  })
})
```

The existing test file already imports `FakeRunner` and the relevant types — reuse them.

- [ ] **Step 2: Confirm RED**

```bash
pnpm exec vitest run packages/node-kinds-cli-agent/tests/dispatcher.test.ts 2>&1 | tail -15
```

- [ ] **Step 3: Modify `dispatcher.ts` to emit activity**

In `CliAgentDispatcher.run()`, add emits:

**Before `this.runner.run(...)`:**

```ts
const ts = () => new Date().toISOString()
ctx.events.emit({
  type: 'node.activity',
  run_id: ctx.runId,
  node_id: spec.id,
  ts: ts(),
  activity: `spawning ${spec.provider} (timeout ${timeoutMs}ms)`,
})
```

**After `this.runner.run(...)` returns successfully (before parseOutput):**

```ts
ctx.events.emit({
  type: 'node.activity',
  run_id: ctx.runId,
  node_id: spec.id,
  ts: ts(),
  activity: outputFormat === 'json' ? 'parsing JSON output' : 'parsing text output',
})
```

Skip the activity emit on early-return paths (timeout, non-zero exit) — those throw before reaching the parser.

- [ ] **Step 4: Confirm GREEN**

```bash
pnpm --filter @openexpertise/node-kinds-cli-agent build 2>&1 | tail -3
pnpm exec vitest run packages/node-kinds-cli-agent/tests/dispatcher.test.ts 2>&1 | tail -10
```

- [ ] **Step 5: Commit**

```bash
git add packages/node-kinds-cli-agent/src/dispatcher.ts packages/node-kinds-cli-agent/tests/dispatcher.test.ts
git commit -m "feat(cli-agent): emit node.activity around subprocess + parser"
```

---

## Task 5: Extract Dashboard reducer to a pure module (TDD)

**Files:**

- Create: `packages/tui/src/reducer.ts`
- Create: `packages/tui/tests/reducer.test.ts`

This extraction makes the state logic vitest-testable without rendering React.

- [ ] **Step 1: Write the failing test**

Create `packages/tui/tests/reducer.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  initialDashboardState,
  reduceDashboardState,
  type DashboardState,
} from '../src/reducer.js'
import type { RunEvent } from '@openexpertise/core'

const NODES = [{ id: 'a' }, { id: 'b', phase: 'review' }]
const TS = '2026-05-26T00:00:00Z'

function evt<T extends RunEvent['type']>(
  type: T,
  rest: Omit<Extract<RunEvent, { type: T }>, 'type' | 'ts'>,
): RunEvent {
  return { type, ts: TS, ...rest } as RunEvent
}

describe('reduceDashboardState', () => {
  it('initial state has all nodes pending and zero tokens', () => {
    const state = initialDashboardState(NODES)
    expect(state.runStatus).toBe('starting')
    expect(Object.keys(state.nodes).sort()).toEqual(['a', 'b'])
    expect(state.nodes['a']!.status).toBe('pending')
    expect(state.nodes['b']!.phase).toBe('review')
    expect(state.totals).toEqual({ input_tokens: 0, output_tokens: 0 })
  })

  it('run.started → runStatus is "running"', () => {
    const s0 = initialDashboardState(NODES)
    const s1 = reduceDashboardState(s0, evt('run.started', { run_id: 'r1' }))
    expect(s1.runStatus).toBe('running')
  })

  it('node.started → that node becomes "running"', () => {
    const s0 = initialDashboardState(NODES)
    const s1 = reduceDashboardState(s0, evt('node.started', { run_id: 'r1', node_id: 'a' }))
    expect(s1.nodes['a']!.status).toBe('running')
  })

  it('node.activity → that node has the latest activity', () => {
    const s0 = initialDashboardState(NODES)
    const s1 = reduceDashboardState(
      s0,
      evt('node.activity', { run_id: 'r1', node_id: 'a', activity: 'calling claude' }),
    )
    expect(s1.nodes['a']!.activity).toBe('calling claude')

    const s2 = reduceDashboardState(
      s1,
      evt('node.activity', { run_id: 'r1', node_id: 'a', activity: 'parsing output' }),
    )
    expect(s2.nodes['a']!.activity).toBe('parsing output')
  })

  it('node.tokens → accumulates per node AND in totals', () => {
    const s0 = initialDashboardState(NODES)
    const s1 = reduceDashboardState(
      s0,
      evt('node.tokens', {
        run_id: 'r1',
        node_id: 'a',
        input_tokens: 10,
        output_tokens: 5,
        model: 'm',
      }),
    )
    expect(s1.nodes['a']!.tokens).toEqual({ input: 10, output: 5 })
    expect(s1.totals).toEqual({ input_tokens: 10, output_tokens: 5 })

    // Another emit on the same node accumulates
    const s2 = reduceDashboardState(
      s1,
      evt('node.tokens', {
        run_id: 'r1',
        node_id: 'a',
        input_tokens: 2,
        output_tokens: 3,
        model: 'm',
      }),
    )
    expect(s2.nodes['a']!.tokens).toEqual({ input: 12, output: 8 })
    expect(s2.totals).toEqual({ input_tokens: 12, output_tokens: 8 })
  })

  it('node.finished → status becomes "done"', () => {
    const s0 = initialDashboardState(NODES)
    const s1 = reduceDashboardState(s0, evt('node.finished', { run_id: 'r1', node_id: 'a' }))
    expect(s1.nodes['a']!.status).toBe('done')
  })

  it('node.failed → status becomes "failed" with error', () => {
    const s0 = initialDashboardState(NODES)
    const s1 = reduceDashboardState(
      s0,
      evt('node.failed', { run_id: 'r1', node_id: 'a', error: 'boom' }),
    )
    expect(s1.nodes['a']!.status).toBe('failed')
    expect(s1.nodes['a']!.error).toBe('boom')
  })

  it('node.skipped → status becomes "skipped" with reason', () => {
    const s0 = initialDashboardState(NODES)
    const s1 = reduceDashboardState(
      s0,
      evt('node.skipped', { run_id: 'r1', node_id: 'a', reason: 'when=false' }),
    )
    expect(s1.nodes['a']!.status).toBe('skipped')
  })

  it('run.finished → captures final status', () => {
    const s0 = initialDashboardState(NODES)
    const s1 = reduceDashboardState(
      s0,
      evt('run.finished', { run_id: 'r1', status: 'success' }),
    )
    expect(s1.runStatus).toBe('finished: success')
  })

  it('ignores events for unknown node ids gracefully', () => {
    const s0 = initialDashboardState(NODES)
    const s1 = reduceDashboardState(
      s0,
      evt('node.activity', { run_id: 'r1', node_id: 'ghost', activity: 'x' }),
    )
    // Returns equivalent state (or unchanged); should NOT crash.
    expect(s1.nodes['ghost']).toBeUndefined()
  })

  it('state.write events are accepted but do not break state', () => {
    const s0 = initialDashboardState(NODES)
    const s1 = reduceDashboardState(
      s0,
      evt('state.write', { run_id: 'r1', node_id: 'a', field: 'x' }),
    )
    // state.write is not currently rendered; reducer just returns prev.
    expect(s1).toEqual(s0)
  })
})
```

- [ ] **Step 2: Confirm RED**

```bash
pnpm exec vitest run packages/tui/tests/reducer.test.ts 2>&1 | tail -10
```

- [ ] **Step 3: Implement `src/reducer.ts`**

```ts
import type { RunEvent } from '@openexpertise/core'

export type NodeStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped'

export interface NodeState {
  id: string
  phase?: string
  status: NodeStatus
  error?: string
  activity?: string
  tokens?: { input: number; output: number }
}

export interface DashboardState {
  runStatus: string
  nodes: Record<string, NodeState>
  totals: { input_tokens: number; output_tokens: number }
}

export function initialDashboardState(nodes: { id: string; phase?: string }[]): DashboardState {
  const map: Record<string, NodeState> = {}
  for (const n of nodes) {
    map[n.id] = {
      id: n.id,
      status: 'pending',
      ...(n.phase ? { phase: n.phase } : {}),
    }
  }
  return {
    runStatus: 'starting',
    nodes: map,
    totals: { input_tokens: 0, output_tokens: 0 },
  }
}

export function reduceDashboardState(prev: DashboardState, event: RunEvent): DashboardState {
  switch (event.type) {
    case 'run.started':
      return { ...prev, runStatus: 'running' }
    case 'run.finished':
      return { ...prev, runStatus: `finished: ${event.status}` }
    case 'node.started':
      return updateNode(prev, event.node_id, (n) => ({ ...n, status: 'running' }))
    case 'node.finished':
      return updateNode(prev, event.node_id, (n) => ({ ...n, status: 'done' }))
    case 'node.failed':
      return updateNode(prev, event.node_id, (n) => ({
        ...n,
        status: 'failed',
        error: event.error,
      }))
    case 'node.skipped':
      return updateNode(prev, event.node_id, (n) => ({ ...n, status: 'skipped' }))
    case 'node.activity':
      return updateNode(prev, event.node_id, (n) => ({ ...n, activity: event.activity }))
    case 'node.tokens': {
      const next = updateNode(prev, event.node_id, (n) => {
        const t = n.tokens ?? { input: 0, output: 0 }
        return {
          ...n,
          tokens: {
            input: t.input + event.input_tokens,
            output: t.output + event.output_tokens,
          },
        }
      })
      if (next === prev) return prev // unknown node
      return {
        ...next,
        totals: {
          input_tokens: prev.totals.input_tokens + event.input_tokens,
          output_tokens: prev.totals.output_tokens + event.output_tokens,
        },
      }
    }
    case 'node.ready':
    case 'state.write':
      return prev
  }
}

function updateNode(
  state: DashboardState,
  nodeId: string,
  updater: (n: NodeState) => NodeState,
): DashboardState {
  const existing = state.nodes[nodeId]
  if (!existing) return state
  return {
    ...state,
    nodes: { ...state.nodes, [nodeId]: updater(existing) },
  }
}
```

- [ ] **Step 4: Confirm GREEN**

```bash
pnpm --filter @openexpertise/tui build 2>&1 | tail -3
pnpm exec vitest run packages/tui/tests/reducer.test.ts 2>&1 | tail -10
```

Expected: 11 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/tui/src/reducer.ts packages/tui/tests/reducer.test.ts
git commit -m "feat(tui): pure reducer for Dashboard state + token/activity tracking"
```

---

## Task 6: Wire reducer into Dashboard + render tokens/activity/totals

**Files:**

- Modify: `packages/tui/src/dashboard.tsx`

- [ ] **Step 1: Rewrite `dashboard.tsx`**

Replace the entire file with:

```tsx
import React, { useEffect, useReducer } from 'react'
import { Box, Text } from 'ink'
import type { EventBus, RunEvent } from '@openexpertise/core'
import {
  initialDashboardState,
  reduceDashboardState,
  type NodeState,
} from './reducer.js'

interface Props {
  events: EventBus
  nodes: { id: string; phase?: string }[]
}

export function Dashboard({ events, nodes }: Props): React.ReactElement {
  const [state, dispatch] = useReducer(
    reduceDashboardState,
    nodes,
    initialDashboardState,
  )

  useEffect(() => {
    const unsub = events.subscribe((event: RunEvent) => dispatch(event))
    return () => {
      unsub()
    }
  }, [events])

  const { input_tokens, output_tokens } = state.totals

  return (
    <Box flexDirection="column">
      <Text>
        OpenExpertise run — {state.runStatus}
        {(input_tokens > 0 || output_tokens > 0) && (
          <Text dimColor>
            {'  · Σ in='}
            {input_tokens}
            {' out='}
            {output_tokens}
          </Text>
        )}
      </Text>
      {Object.values(state.nodes).map((n) => (
        <NodeRow key={n.id} node={n} />
      ))}
    </Box>
  )
}

function NodeRow({ node }: { node: NodeState }): React.ReactElement {
  return (
    <Box>
      <Text color={colorFor(node.status)}>
        {symbolFor(node.status)} {node.id}
      </Text>
      {node.phase && <Text dimColor> [{node.phase}]</Text>}
      {node.activity && <Text dimColor> · {truncate(node.activity, 40)}</Text>}
      {node.tokens && (node.tokens.input > 0 || node.tokens.output > 0) && (
        <Text dimColor>
          {' · '}
          {node.tokens.input}
          {'/'}
          {node.tokens.output}
        </Text>
      )}
      {node.error && <Text color="red"> — {node.error}</Text>}
    </Box>
  )
}

function symbolFor(s: NodeState['status']): string {
  switch (s) {
    case 'pending':
      return '·'
    case 'running':
      return '▶'
    case 'done':
      return '✓'
    case 'failed':
      return '✗'
    case 'skipped':
      return '–'
  }
}

function colorFor(s: NodeState['status']): string {
  switch (s) {
    case 'pending':
      return 'gray'
    case 'running':
      return 'cyan'
    case 'done':
      return 'green'
    case 'failed':
      return 'red'
    case 'skipped':
      return 'yellow'
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max - 1) + '…'
}
```

- [ ] **Step 2: Build the package**

```bash
pnpm --filter @openexpertise/tui build 2>&1 | tail -5
```

Expected: clean.

- [ ] **Step 3: Full suite — no regressions**

```bash
pnpm typecheck 2>&1 | tail -3
pnpm test 2>&1 | tail -5
```

Expected: 185 (post-Tasks-2-4) + 11 reducer tests = should already be at 196 after Task 5. After this task, no new tests, just refactor — still 196. Adjust if intermediate counts differ.

If you got 185 after Task 4 and 11 from Task 5, total is 196. If anything's off, investigate.

- [ ] **Step 4: Smoke — render TUI in a test process briefly**

This is optional and might be hard from a subagent; if `node packages/cli/dist/bin.js run examples/hello-tool --tui` runs cleanly (Ctrl-C after 1s of output), the wiring is fine. Otherwise rely on the reducer tests + typecheck.

- [ ] **Step 5: Commit**

```bash
git add packages/tui/src/dashboard.tsx
git commit -m "feat(tui): wire reducer, render activity + per-node tokens + total tokens header"
```

---

## Task 7: README mention + progress log + final verify

**Files:**

- Modify: `README.md` (root)
- Modify: `docs/superpowers/overnight-progress.md`

- [ ] **Step 1: Update README**

Read the existing README. Find the "All CLI commands" table or the row for `oe run`. Underneath the table (or near where `--tui` is mentioned), append/expand:

```markdown

### TUI dashboard

`oe run --tui` opens an ink-based dashboard showing each node's status, current activity (e.g. `calling claude-sonnet-4-6`, `spawning codex`, `parsing JSON output`), per-node accumulated tokens, and a header line with the run-total tokens. Updates live as the run progresses.
```

If the file already mentions `--tui` in the table, leave the table and add this section below the table.

- [ ] **Step 2: Append progress log**

In `docs/superpowers/overnight-progress.md`, append:

```markdown

---

## Plan B (V2) — TUI Upgrade (2026-05-26)

Branch: `feat/tui-upgrade` (off `main`)
Spec: `docs/superpowers/specs/2026-05-26-ultraexpertise-and-v2-polish-design.md` (Plan B section)
Plan: `docs/superpowers/plans/2026-05-26-tui-upgrade.md`

### What shipped

| Area | Result |
|---|---|
| Event types | `node.tokens` + `node.activity` added to `RunEvent` |
| Dispatchers | AgentDispatcher + SkillDispatcher emit tokens+activity; CliAgentDispatcher emits activity (CLIs don't expose usage) |
| TUI reducer | Extracted to `packages/tui/src/reducer.ts` as a pure function; 11 unit tests |
| TUI render | Per-node activity (truncated), per-node tokens (in/out), header line with run totals |
| Tests | 1 agent + 1 skill + 1 cli-agent + 11 reducer = 14 new |

### Next concrete actions

1. Merge `feat/tui-upgrade` into `main`.
2. Manual smoke with a real API key on `oe run examples/review-branch --tui` — confirm tokens tick up live and activity strings are readable.
3. Move to Plan C (examples library expansion).
```

- [ ] **Step 3: Final verification**

```bash
pnpm clean && pnpm install && pnpm -r build 2>&1 | tail -5
pnpm typecheck 2>&1 | tail -3
pnpm lint 2>&1 | tail -3
pnpm format:check 2>&1 | tail -3
pnpm test 2>&1 | tail -5
```

Expected: build/typecheck/lint/format clean. **Target test count: ~198** (184 baseline + 14 new). If format:check fails, run `pnpm format`, commit as `style: prettier`.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/superpowers/overnight-progress.md
git commit -m "docs: README TUI dashboard section + Plan B progress"
git log --oneline main..HEAD | head -15
```
