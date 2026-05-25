import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { computeCacheKey, CacheStore } from '../src/index.js'
import type { NodeSpec } from '@openexpertise/schema'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'oe-cache-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

const baseNode: NodeSpec = { id: 'x', kind: 'tool', impl: 'x' }

describe('computeCacheKey', () => {
  it('is deterministic for the same inputs', () => {
    const k1 = computeCacheKey({
      nodeSpec: baseNode, stateView: { a: 1 }, edgeInputs: {}, args: { b: 2 },
      runtimeVersion: '0.1.0',
    })
    const k2 = computeCacheKey({
      nodeSpec: baseNode, stateView: { a: 1 }, edgeInputs: {}, args: { b: 2 },
      runtimeVersion: '0.1.0',
    })
    expect(k1).toBe(k2)
  })
  it('differs when any input changes', () => {
    const base = { nodeSpec: baseNode, stateView: { a: 1 }, edgeInputs: {}, args: { b: 2 }, runtimeVersion: '0.1.0' }
    const k0 = computeCacheKey(base)
    expect(computeCacheKey({ ...base, args: { b: 3 } })).not.toBe(k0)
    expect(computeCacheKey({ ...base, stateView: { a: 2 } })).not.toBe(k0)
    expect(computeCacheKey({ ...base, runtimeVersion: '0.2.0' })).not.toBe(k0)
  })
})

describe('CacheStore', () => {
  it('returns undefined for missing key', () => {
    const store = new CacheStore({ dir })
    expect(store.get('missing')).toBeUndefined()
  })
  it('roundtrips put → get', () => {
    const store = new CacheStore({ dir })
    store.put('abc', { state_delta: { x: 1 } })
    expect(store.get('abc')).toEqual({ state_delta: { x: 1 } })
  })
})
