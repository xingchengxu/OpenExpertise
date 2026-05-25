import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { StateStore } from '../src/state/store.js'
import type { ExperienceSpec } from '@openexpertise/schema'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const baseSpec: ExperienceSpec = {
  name: 't',
  version: '0.1.0',
  state: {
    schema: {
      greeting: { type: 'string' },
      counts: { type: 'array', items: { type: 'number' }, merge: 'array_append' },
      once: { type: 'string', merge: 'set_once' },
    },
  },
  graph: { nodes: [{ id: 'x', kind: 'tool', impl: 't.ts' }], edges: [] },
}

let tmp: string
let store: StateStore

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'oe-state-'))
  store = new StateStore({ dbPath: join(tmp, 'state.sqlite'), spec: baseSpec })
})

afterEach(() => {
  store.close()
  rmSync(tmp, { recursive: true, force: true })
})

describe('StateStore', () => {
  it('reads undefined for unset field', () => {
    expect(store.get('greeting')).toBeUndefined()
  })

  it('writes and reads a string field', () => {
    store.write({ greeting: 'hi' }, { runId: 'r1', nodeId: 'x' })
    expect(store.get('greeting')).toBe('hi')
  })

  it('rejects writes to undeclared fields', () => {
    expect(() => store.write({ undeclared: 1 } as any, { runId: 'r', nodeId: 'x' }))
      .toThrow(/undeclared state field "undeclared"/)
  })

  it('rejects writes that violate field type', () => {
    expect(() => store.write({ greeting: 42 } as any, { runId: 'r', nodeId: 'x' }))
      .toThrow(/greeting/)
  })

  it('appends arrays under array_append strategy', () => {
    store.write({ counts: [1] }, { runId: 'r', nodeId: 'x' })
    store.write({ counts: [2, 3] }, { runId: 'r', nodeId: 'y' })
    expect(store.get('counts')).toEqual([1, 2, 3])
  })

  it('throws on second write to set_once field', () => {
    store.write({ once: 'a' }, { runId: 'r', nodeId: 'x' })
    expect(() => store.write({ once: 'b' }, { runId: 'r', nodeId: 'y' }))
      .toThrow(/set_once/)
  })

  it('records history rows for every write', () => {
    store.write({ greeting: 'hello' }, { runId: 'r1', nodeId: 'x' })
    const history = store.history('greeting')
    expect(history).toHaveLength(1)
    expect(history[0]?.run_id).toBe('r1')
    expect(history[0]?.value_new).toBe('hello')
  })

  it('persists across StateStore instances', () => {
    store.write({ greeting: 'persist' }, { runId: 'r', nodeId: 'x' })
    const dbPath = (store as any).dbPath
    store.close()
    const store2 = new StateStore({ dbPath, spec: baseSpec })
    expect(store2.get('greeting')).toBe('persist')
    store2.close()
  })
})
