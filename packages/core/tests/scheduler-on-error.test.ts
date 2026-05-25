import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DispatcherRegistry } from '../src/dispatcher/registry.js'
import { EventBus } from '../src/events/bus.js'
import { StateStore } from '../src/state/store.js'
import { RunContext } from '../src/run/context.js'
import { SequentialScheduler } from '../src/graph/scheduler.js'
import { buildDag } from '../src/graph/dag.js'
import type { NodeDispatcher, NodeInputBundle, NodeOutput } from '../src/dispatcher/types.js'
import type { ExperienceSpec, NodeSpec } from '@openexpertise/schema'

class FailNTimes implements NodeDispatcher {
  readonly kind = 'tool' as const
  private attempts = 0
  constructor(
    private failsFirst: number,
    private finalValue: string,
  ) {}
  async resolve(_n: NodeSpec) {
    return {}
  }
  async run(_impl: unknown, _b: NodeInputBundle): Promise<NodeOutput> {
    this.attempts++
    if (this.attempts <= this.failsFirst) {
      throw new Error(`fail attempt ${this.attempts}`)
    }
    return { state_delta: { val: this.finalValue } }
  }
}

class AlwaysFail implements NodeDispatcher {
  readonly kind = 'tool' as const
  async resolve(_n: NodeSpec) {
    return {}
  }
  async run(): Promise<NodeOutput> {
    throw new Error('boom')
  }
}

const baseSpec: ExperienceSpec = {
  name: 't',
  version: '0.1.0',
  state: { schema: { val: { type: 'string' } } },
  graph: { nodes: [], edges: [] },
}

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'oe-onerror-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function makeCtx(spec: ExperienceSpec, dispatcher: NodeDispatcher): RunContext {
  const store = new StateStore({ dbPath: join(dir, 's.sqlite'), spec })
  const dispatchers = new DispatcherRegistry()
  dispatchers.register(dispatcher)
  return new RunContext({
    runId: 'r',
    spec,
    experienceDir: dir,
    store,
    events: new EventBus(),
    dispatchers,
    args: {},
  })
}

describe('SequentialScheduler on_error policy', () => {
  it('retries up to attempts and succeeds when transient', async () => {
    const spec: ExperienceSpec = {
      ...baseSpec,
      graph: {
        nodes: [
          {
            id: 'x',
            kind: 'tool',
            impl: 'x',
            writes: ['val'],
            on_error: { policy: 'retry', attempts: 3, backoff: 'linear', base_ms: 1 },
          },
        ],
        edges: [],
      },
    }
    const fakeTool = new FailNTimes(2, 'eventually-ok')
    const ctx = makeCtx(spec, fakeTool)
    const scheduler = new SequentialScheduler(buildDag(spec), ctx)
    const { status } = await scheduler.run()
    expect(status).toBe('success')
    expect(ctx.store.get('val')).toBe('eventually-ok')
    ctx.store.close()
  })

  it('aborts run on policy=fail_run', async () => {
    const spec: ExperienceSpec = {
      ...baseSpec,
      graph: {
        nodes: [
          {
            id: 'x',
            kind: 'tool',
            impl: 'x',
            writes: ['val'],
            on_error: { policy: 'fail_run' },
          },
        ],
        edges: [],
      },
    }
    const ctx = makeCtx(spec, new AlwaysFail())
    const scheduler = new SequentialScheduler(buildDag(spec), ctx)
    await expect(scheduler.run()).rejects.toThrow(/fail_run/)
    ctx.store.close()
  })

  it('defaults to skip-downstream when on_error absent (Plan 1 behavior)', async () => {
    const spec: ExperienceSpec = {
      ...baseSpec,
      state: { schema: { val: { type: 'string' }, other: { type: 'string' } } },
      graph: {
        nodes: [
          { id: 'x', kind: 'tool', impl: 'x', writes: ['val'] },
          { id: 'y', kind: 'tool', impl: 'y', writes: ['other'] }, // sibling, should still run
        ],
        edges: [],
      },
    }
    let calledY = false
    // Instead of inline dispatcher above, use two trivial impls via a kind-aware wrapper:
    class Mixed implements NodeDispatcher {
      readonly kind = 'tool' as const
      async resolve(node: NodeSpec) {
        return { id: node.id }
      }
      async run(impl: { id: string }) {
        if (impl.id === 'x') throw new Error('boom from x')
        calledY = true
        return { state_delta: { other: 'y-ran' } }
      }
    }
    const ctx = makeCtx(spec, new Mixed())
    const scheduler = new SequentialScheduler(buildDag(spec), ctx)
    const { status } = await scheduler.run()
    expect(status).toBe('partial')
    expect(calledY).toBe(true)
    expect(ctx.store.get('other')).toBe('y-ran')
    ctx.store.close()
  })

  it('respects retry exponential backoff timing (smoke)', async () => {
    const spec: ExperienceSpec = {
      ...baseSpec,
      graph: {
        nodes: [
          {
            id: 'x',
            kind: 'tool',
            impl: 'x',
            writes: ['val'],
            on_error: { policy: 'retry', attempts: 3, backoff: 'exponential', base_ms: 5 },
          },
        ],
        edges: [],
      },
    }
    const fakeTool = new FailNTimes(2, 'ok')
    const ctx = makeCtx(spec, fakeTool)
    const scheduler = new SequentialScheduler(buildDag(spec), ctx)
    const t0 = Date.now()
    await scheduler.run()
    const elapsed = Date.now() - t0
    // 2 retries → sleeps of 5ms and 10ms → at least 15ms total
    expect(elapsed).toBeGreaterThanOrEqual(15)
    ctx.store.close()
  })
})
