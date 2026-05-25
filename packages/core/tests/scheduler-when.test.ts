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
