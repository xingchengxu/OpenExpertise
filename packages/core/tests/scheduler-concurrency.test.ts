import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DispatcherRegistry } from '../src/dispatcher/registry.js'
import { EventBus } from '../src/events/bus.js'
import { SequentialScheduler } from '../src/graph/scheduler.js'
import { buildDag } from '../src/graph/dag.js'
import { RunContext } from '../src/run/context.js'
import { StateStore } from '../src/state/store.js'
import type { NodeDispatcher, NodeInputBundle, NodeOutput } from '../src/dispatcher/types.js'
import type { ExperienceSpec, NodeSpec } from '@openexpertise/schema'

// A dispatcher that records max-concurrent-in-flight via a shared counter.
// For the 'seed' node it returns items; for the 'work' node it sleeps briefly.
let inFlight = 0
let maxInFlight = 0

function resetCounters() {
  inFlight = 0
  maxInFlight = 0
}

class RoutingDispatcher implements NodeDispatcher {
  readonly kind = 'tool' as const
  async resolve(n: NodeSpec) {
    return { id: n.id }
  }
  async run(impl: { id: string }, _b: NodeInputBundle): Promise<NodeOutput> {
    if (impl.id === 'seed') {
      return { state_delta: { items: [1, 2, 3, 4, 5, 6, 7, 8] } }
    }
    // 'work' node: track concurrency
    inFlight++
    maxInFlight = Math.max(maxInFlight, inFlight)
    await new Promise((r) => setTimeout(r, 50))
    inFlight--
    return { state_delta: { findings: [{}] } }
  }
}

let dir: string
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

describe('for_each concurrency', () => {
  it('runs iterations in parallel up to the configured limit', async () => {
    resetCounters()
    dir = mkdtempSync(join(tmpdir(), 'oe-foreach-'))
    const spec: ExperienceSpec = {
      name: 'foreach-conc',
      version: '0.1.0',
      state: {
        schema: {
          items: { type: 'array' },
          findings: { type: 'array', items: { type: 'object' }, merge: 'array_append' },
        },
      },
      graph: {
        nodes: [
          { id: 'seed', kind: 'tool', impl: 'x', writes: ['items'] },
          {
            id: 'work',
            kind: 'tool',
            impl: 'x',
            for_each: { source: '$.items', concurrency: 4 },
            writes: ['findings'],
          },
        ],
        edges: [{ from: 'seed', to: 'work' }],
      },
    }
    const store = new StateStore({ dbPath: join(dir, 's.sqlite'), spec })
    const dispatchers = new DispatcherRegistry()
    dispatchers.register(new RoutingDispatcher())
    const ctx = new RunContext({
      runId: 'r',
      spec,
      experienceDir: dir,
      store,
      events: new EventBus(),
      dispatchers,
      args: {},
    })
    const scheduler = new SequentialScheduler(buildDag(spec), ctx)
    const { status } = await scheduler.run()
    store.close()

    expect(status).toBe('success')
    // With concurrency: 4 and 8 items, max-in-flight should reach 2-4 (not 1).
    expect(maxInFlight).toBeGreaterThanOrEqual(2)
    expect(maxInFlight).toBeLessThanOrEqual(4)
  })

  it('preserves V1 behavior when concurrency is unset (sequential)', async () => {
    resetCounters()
    dir = mkdtempSync(join(tmpdir(), 'oe-foreach-seq-'))
    const spec: ExperienceSpec = {
      name: 'foreach-conc-seq',
      version: '0.1.0',
      state: {
        schema: {
          items: { type: 'array' },
          findings: { type: 'array', items: { type: 'object' }, merge: 'array_append' },
        },
      },
      graph: {
        nodes: [
          { id: 'seed', kind: 'tool', impl: 'x', writes: ['items'] },
          {
            id: 'work',
            kind: 'tool',
            impl: 'x',
            for_each: { source: '$.items' },
            writes: ['findings'],
          },
        ],
        edges: [{ from: 'seed', to: 'work' }],
      },
    }
    const store = new StateStore({ dbPath: join(dir, 's.sqlite'), spec })
    const dispatchers = new DispatcherRegistry()
    dispatchers.register(new RoutingDispatcher())
    const ctx = new RunContext({
      runId: 'r2',
      spec,
      experienceDir: dir,
      store,
      events: new EventBus(),
      dispatchers,
      args: {},
    })
    const scheduler = new SequentialScheduler(buildDag(spec), ctx)
    const { status } = await scheduler.run()
    store.close()

    expect(status).toBe('success')
    // Sequential default: only one in flight at a time.
    expect(maxInFlight).toBe(1)
  })
})
