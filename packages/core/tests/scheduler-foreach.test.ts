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
