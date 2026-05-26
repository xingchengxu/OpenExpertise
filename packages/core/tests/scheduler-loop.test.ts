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
  type NodeOutput,
  type NodeInputBundle,
} from '../src/index.js'
import type { ExperienceSpec } from '@openexpertise/schema'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'oe-loop-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('Bounded loop', () => {
  it('runs body until condition becomes true', async () => {
    const spec: ExperienceSpec = {
      name: 't',
      version: '0.1.0',
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
      async resolve() {
        return {}
      },
      async run(_impl, _b: NodeInputBundle, ctx): Promise<NodeOutput> {
        const current = (ctx.store.get('count') as number | undefined) ?? 0
        return { state_delta: { count: current + 1 } }
      },
    }
    const dispatchers = new DispatcherRegistry()
    dispatchers.register(dispatcher)
    const ctx = new RunContext({
      runId: 'r',
      spec,
      experienceDir: dir,
      store,
      events: new EventBus(),
      dispatchers,
      args: {},
    })
    await new SequentialScheduler(buildDag(spec), ctx).run()
    expect(store.get('count')).toBe(3)
    store.close()
  })

  it('terminates at max_iters even when until never true', async () => {
    const spec: ExperienceSpec = {
      name: 't',
      version: '0.1.0',
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
      async resolve() {
        return {}
      },
      async run(_impl, _b: NodeInputBundle, ctx): Promise<NodeOutput> {
        const current = (ctx.store.get('count') as number | undefined) ?? 0
        return { state_delta: { count: current + 1 } }
      },
    }
    const dispatchers = new DispatcherRegistry()
    dispatchers.register(dispatcher)
    const ctx = new RunContext({
      runId: 'r',
      spec,
      experienceDir: dir,
      store,
      events: new EventBus(),
      dispatchers,
      args: {},
    })
    await new SequentialScheduler(buildDag(spec), ctx).run()
    expect(store.get('count')).toBe(5)
    store.close()
  })
})
