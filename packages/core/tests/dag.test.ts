import { describe, it, expect } from 'vitest'
import { buildDag } from '../src/graph/dag.js'
import type { ExperienceSpec } from '@openexpertise/schema'

function spec(nodes: string[], edges: Array<[string, string]>): ExperienceSpec {
  return {
    name: 't',
    version: '0.1.0',
    state: { schema: {} },
    graph: {
      nodes: nodes.map((id) => ({ id, kind: 'tool', impl: 't' })),
      edges: edges.map(([from, to]) => ({ from, to })),
    },
  }
}

describe('buildDag', () => {
  it('returns nodes in topological order for a linear DAG', () => {
    const dag = buildDag(
      spec(
        ['a', 'b', 'c'],
        [
          ['a', 'b'],
          ['b', 'c'],
        ],
      ),
    )
    expect(dag.topoOrder.map((n) => n.id)).toEqual(['a', 'b', 'c'])
  })

  it('groups parallel branches in any valid topological order', () => {
    const dag = buildDag(
      spec(
        ['root', 'left', 'right', 'join'],
        [
          ['root', 'left'],
          ['root', 'right'],
          ['left', 'join'],
          ['right', 'join'],
        ],
      ),
    )
    const order = dag.topoOrder.map((n) => n.id)
    expect(order[0]).toBe('root')
    expect(order[3]).toBe('join')
    expect(order.slice(1, 3).sort()).toEqual(['left', 'right'])
  })

  it('throws on cycle', () => {
    expect(() =>
      buildDag(
        spec(
          ['a', 'b'],
          [
            ['a', 'b'],
            ['b', 'a'],
          ],
        ),
      ),
    ).toThrow(/cycle/i)
  })

  it('reports predecessors for each node', () => {
    const dag = buildDag(
      spec(
        ['a', 'b', 'c'],
        [
          ['a', 'c'],
          ['b', 'c'],
        ],
      ),
    )
    const c = dag.nodes.get('c')!
    expect(new Set(c.predecessors)).toEqual(new Set(['a', 'b']))
  })

  it('handles isolated nodes (no edges)', () => {
    const dag = buildDag(spec(['a', 'b'], []))
    expect(dag.topoOrder.map((n) => n.id).sort()).toEqual(['a', 'b'])
  })
})
