/**
 * Regression tests for actionable runtime error messages.
 * Each test pins the key substrings that make an error message useful to a
 * first-time user: WHAT happened, WHERE, and HOW TO FIX.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { StateStore } from '../src/state/store.js'
import { buildDag } from '../src/graph/dag.js'
import type { ExperienceSpec } from '@openexpertise/schema'

// ── Shared helpers ───────────────────────────────────────────────────────────

const minimalSpec = (overrides: Partial<ExperienceSpec> = {}): ExperienceSpec => ({
  name: 't',
  version: '0.1.0',
  state: { schema: { greeting: { type: 'string' } } },
  graph: { nodes: [{ id: 'n1', kind: 'tool', impl: './n.mjs' }], edges: [] },
  ...overrides,
})

let tmp: string
let store: StateStore

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'oe-errmsg-'))
  store = new StateStore({ dbPath: join(tmp, 'state.sqlite'), spec: minimalSpec() })
})

afterEach(() => {
  store.close()
  rmSync(tmp, { recursive: true, force: true })
})

// ── StateStore: undeclared field write ───────────────────────────────────────

describe('StateStore undeclared field write', () => {
  it('includes the node id, field name, and how-to-fix hint', () => {
    expect(() => store.write({ mystery: 'value' }, { runId: 'r1', nodeId: 'my-node' })).toThrow(
      /Node "my-node" wrote to undeclared state field "mystery"/,
    )
  })

  it('tells the user how to declare the field', () => {
    expect(() => store.write({ mystery: 'value' }, { runId: 'r1', nodeId: 'my-node' })).toThrow(
      /state\.schema/,
    )
  })
})

// ── StateStore: type mismatch ────────────────────────────────────────────────

describe('StateStore type mismatch', () => {
  it('tells user what type was declared vs what was written', () => {
    expect(() => store.write({ greeting: 42 }, { runId: 'r1', nodeId: 'n1' })).toThrow(
      /declared as type string in state\.schema/,
    )
  })

  it('includes how-to-fix hint about updating state.schema or fixing the node', () => {
    expect(() => store.write({ greeting: 42 }, { runId: 'r1', nodeId: 'n1' })).toThrow(
      /Fix the node.s output|update state\.schema/,
    )
  })
})

// ── DAG: edge references unknown node ────────────────────────────────────────

describe('buildDag edge referencing unknown node', () => {
  it('names the missing node in the error', () => {
    const spec = minimalSpec({
      graph: {
        nodes: [{ id: 'n1', kind: 'tool', impl: './n.mjs' }],
        edges: [{ from: 'n1', to: 'ghost' }],
      },
    })
    expect(() => buildDag(spec)).toThrow(/ghost/)
  })

  it('includes the arrow notation for the edge', () => {
    const spec = minimalSpec({
      graph: {
        nodes: [{ id: 'n1', kind: 'tool', impl: './n.mjs' }],
        edges: [{ from: 'n1', to: 'ghost' }],
      },
    })
    expect(() => buildDag(spec)).toThrow(/n1.*ghost/)
  })

  it('lists defined nodes so user can spot the typo', () => {
    const spec = minimalSpec({
      graph: {
        nodes: [{ id: 'n1', kind: 'tool', impl: './n.mjs' }],
        edges: [{ from: 'n1', to: 'ghost' }],
      },
    })
    expect(() => buildDag(spec)).toThrow(/Defined nodes.*n1/)
  })
})
