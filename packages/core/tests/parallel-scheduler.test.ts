import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DispatcherRegistry, EventBus, runExperience, type NodeDispatcher } from '../src/index.js'

class CountingTool implements NodeDispatcher {
  readonly kind = 'tool' as const
  public maxInFlight = 0
  public inFlight = 0
  async resolve() {
    return {}
  }
  async run() {
    this.inFlight++
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight)
    await new Promise((r) => setTimeout(r, 50))
    this.inFlight--
    return { state_delta: {} }
  }
}

let dir: string
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

describe('ParallelScheduler', () => {
  it('runs 4 independent sibling nodes in parallel when runtime.concurrency=4', async () => {
    dir = mkdtempSync(join(tmpdir(), 'oe-parallel-'))
    const spec = {
      name: 'parallel-siblings',
      version: '0.1.0',
      runtime: { concurrency: 4 },
      state: {
        schema: {
          a: { type: 'string' as const },
          b: { type: 'string' as const },
          c: { type: 'string' as const },
          d: { type: 'string' as const },
        },
      },
      graph: {
        nodes: [
          { id: 'a', kind: 'tool' as const, impl: './tools/a.mjs', writes: ['a'] },
          { id: 'b', kind: 'tool' as const, impl: './tools/b.mjs', writes: ['b'] },
          { id: 'c', kind: 'tool' as const, impl: './tools/c.mjs', writes: ['c'] },
          { id: 'd', kind: 'tool' as const, impl: './tools/d.mjs', writes: ['d'] },
        ],
        edges: [],
      },
    }
    const counter = new CountingTool()
    const dispatchers = new DispatcherRegistry()
    dispatchers.register(counter)

    const start = Date.now()
    const result = await runExperience({
      spec,
      experienceDir: dir,
      dispatchers,
      events: new EventBus(),
      args: {},
    })
    const elapsed = Date.now() - start

    expect(result.status).toBe('success')
    // 4 sibling nodes × 50ms each. Sequential = 200ms. Parallel = ~50ms (+overhead).
    expect(elapsed).toBeLessThan(180)
    // Max concurrent reached at least 2.
    expect(counter.maxInFlight).toBeGreaterThanOrEqual(2)
  })

  it('respects dependency order (downstream waits for upstream)', async () => {
    dir = mkdtempSync(join(tmpdir(), 'oe-parallel-deps-'))
    const spec = {
      name: 'parallel-deps',
      version: '0.1.0',
      runtime: { concurrency: 4 },
      state: {
        schema: {
          a: { type: 'string' as const },
          b: { type: 'string' as const },
        },
      },
      graph: {
        nodes: [
          { id: 'a', kind: 'tool' as const, impl: './tools/a.mjs', writes: ['a'] },
          { id: 'b', kind: 'tool' as const, impl: './tools/b.mjs', writes: ['b'] },
        ],
        edges: [{ from: 'a', to: 'b' }],
      },
    }
    const counter = new CountingTool()
    const dispatchers = new DispatcherRegistry()
    dispatchers.register(counter)

    const result = await runExperience({
      spec,
      experienceDir: dir,
      dispatchers,
      events: new EventBus(),
      args: {},
    })

    expect(result.status).toBe('success')
    // With a → b dependency, b cannot start until a finishes.
    // maxInFlight = 1 even with concurrency: 4.
    expect(counter.maxInFlight).toBe(1)
  })
})
