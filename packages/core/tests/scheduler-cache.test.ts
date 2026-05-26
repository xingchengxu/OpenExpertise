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
  CacheStore,
  type NodeDispatcher,
  type NodeOutput,
} from '../src/index.js'
import type { ExperienceSpec } from '@openexpertise/schema'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'oe-cache-sched-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('Scheduler cache integration', () => {
  it('replays from cache on second run with same inputs', async () => {
    const spec: ExperienceSpec = {
      name: 't',
      version: '0.1.0',
      state: { schema: { val: { type: 'number' } } },
      graph: {
        nodes: [{ id: 'x', kind: 'tool', impl: 'x', writes: ['val'] }],
        edges: [],
      },
    }
    let calls = 0
    const dispatcher: NodeDispatcher = {
      kind: 'tool',
      async resolve() {
        return {}
      },
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
        runId: 'r1',
        spec,
        experienceDir: dir,
        store,
        events: new EventBus(),
        dispatchers,
        args: {},
        cache,
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
        runId: 'r2',
        spec,
        experienceDir: dir,
        store,
        events: new EventBus(),
        dispatchers,
        args: {},
        cache,
      })
      await new SequentialScheduler(buildDag(spec), ctx).run()
      expect(store.get('val')).toBe(42)
      store.close()
    }
    expect(calls).toBe(1) // still 1 — cache replayed
  })
})
