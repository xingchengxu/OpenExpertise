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
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'oe-pipeline-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('Pipeline groups', () => {
  it('runs each item through all stages in sequence', async () => {
    const spec: ExperienceSpec = {
      name: 't',
      version: '0.1.0',
      state: {
        schema: { items: { type: 'array' }, processed: { type: 'array', merge: 'array_append' } },
      },
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
      async resolve(n: NodeSpec) {
        return { id: n.id }
      },
      async run(impl: { id: string }, b: NodeInputBundle): Promise<NodeOutput> {
        if (impl.id === 'seed') return { state_delta: { items: ['x', 'y'] } }
        if (impl.id === 'stage_a') return { state_delta: {}, edge_output: `A:${b.args.$item}` }
        if (impl.id === 'stage_b')
          return {
            state_delta: { processed: [String(b.edge_inputs.stage_a)] },
          }
        return { state_delta: {} }
      },
    }
    const dispatchers = new DispatcherRegistry()
    dispatchers.register(router)
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
    expect(status).toBe('success')
    expect(store.get('processed')).toEqual(['A:x', 'A:y'])
    store.close()
  })
})
