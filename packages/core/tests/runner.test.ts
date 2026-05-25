import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { runExperience } from '../src/runner.js'
import { DispatcherRegistry } from '../src/dispatcher/registry.js'
import type { NodeDispatcher, NodeInputBundle, NodeOutput } from '../src/dispatcher/types.js'
import type { ExperienceSpec, NodeSpec } from '@openexpertise/schema'
import { EventBus, type RunEvent } from '../src/events/bus.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

class FakeTool implements NodeDispatcher {
  readonly kind = 'tool' as const
  constructor(private produce: (b: NodeInputBundle) => NodeOutput) {}
  async resolve(_n: NodeSpec) {
    return {}
  }
  async run(_impl: unknown, bundle: NodeInputBundle): Promise<NodeOutput> {
    return this.produce(bundle)
  }
}

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'oe-runner-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const spec: ExperienceSpec = {
  name: 't',
  version: '0.1.0',
  state: { schema: { a: { type: 'number' }, b: { type: 'number' } } },
  graph: {
    nodes: [
      { id: 'set_a', kind: 'tool', impl: 'x', writes: ['a'] },
      { id: 'set_b', kind: 'tool', impl: 'x', reads: ['a'], writes: ['b'] },
    ],
    edges: [{ from: 'set_a', to: 'set_b' }],
  },
}

describe('runExperience', () => {
  it('runs nodes in topological order and threads state', async () => {
    const dispatchers = new DispatcherRegistry()
    dispatchers.register(
      new FakeTool((b) => {
        if (b.state_view.a === undefined) return { state_delta: { a: 7 } }
        return { state_delta: { b: (b.state_view.a as number) * 2 } }
      }),
    )
    const events = new EventBus()
    const seen: RunEvent[] = []
    events.subscribe((e) => seen.push(e))

    const result = await runExperience({
      spec,
      experienceDir: dir,
      dispatchers,
      events,
      args: {},
      dbPath: join(dir, 's.sqlite'),
    })

    expect(result.status).toBe('success')
    expect(result.finalState.a).toBe(7)
    expect(result.finalState.b).toBe(14)
    expect(seen.find((e) => e.type === 'run.started')).toBeDefined()
    expect(seen.find((e) => e.type === 'run.finished')).toBeDefined()
    const nodeFinishes = seen.filter((e) => e.type === 'node.finished')
    expect(nodeFinishes).toHaveLength(2)
  })

  it('marks run failed when a dispatcher throws', async () => {
    const dispatchers = new DispatcherRegistry()
    dispatchers.register(
      new FakeTool(() => {
        throw new Error('boom')
      }),
    )
    const result = await runExperience({
      spec: {
        ...spec,
        graph: { ...spec.graph, nodes: [spec.graph.nodes[0]!], edges: [] },
      },
      experienceDir: dir,
      dispatchers,
      events: new EventBus(),
      args: {},
      dbPath: join(dir, 's.sqlite'),
    })
    expect(result.status).toBe('failed')
  })
})
