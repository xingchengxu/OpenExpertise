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
  type RunEvent,
} from '../src/index.js'
import type { ExperienceSpec } from '@openexpertise/schema'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'oe-phase-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('Phase grouping in events', () => {
  it('emits phase on node.* events when declared', async () => {
    const spec: ExperienceSpec = {
      name: 't',
      version: '0.1.0',
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
      async resolve() {
        return {}
      },
      async run(): Promise<NodeOutput> {
        return { state_delta: {} }
      },
    }
    const dispatchers = new DispatcherRegistry()
    dispatchers.register(dispatcher)
    const events = new EventBus()
    const seen: RunEvent[] = []
    events.subscribe((e) => seen.push(e))
    const ctx = new RunContext({
      runId: 'r',
      spec,
      experienceDir: dir,
      store,
      events,
      dispatchers,
      args: {},
    })
    await new SequentialScheduler(buildDag(spec), ctx).run()

    const aFinished = seen.find((e) => e.type === 'node.finished' && e.node_id === 'a')
    const bFinished = seen.find((e) => e.type === 'node.finished' && e.node_id === 'b')
    expect((aFinished as { phase?: string } | undefined)?.phase).toBe('collect')
    expect((bFinished as { phase?: string } | undefined)?.phase).toBeUndefined()
    store.close()
  })
})
