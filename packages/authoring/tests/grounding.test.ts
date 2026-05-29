import { describe, it, expect } from 'vitest'
import { pickExemplars, type Exemplar } from '../src/grounding.js'
import type { AnalysisOutput } from '../src/schemas.js'

const ANALYSIS: AnalysisOutput = {
  name: 'pr-review',
  description: 'review PRs and report findings',
  domain: 'code-review',
  phases: [{ id: 'main' }],
  state_fields: [{ name: 'findings', type: 'array', merge: 'array_append' }],
  node_sketches: [
    { id: 'a', kind: 'agent', phase: 'main', purpose: 'analyze' },
    { id: 'b', kind: 'agent', phase: 'main', purpose: 'analyze' },
    { id: 'c', kind: 'tool', phase: 'main', purpose: 'collect' },
  ],
}

const CORPUS: Exemplar[] = [
  {
    name: 'soc2-review',
    description: 'review compliance code',
    experience_yaml_excerpt:
      'graph:\n  nodes:\n    - { id: x, kind: agent }\n    - { id: y, kind: agent }\n    - { id: z, kind: tool }\n',
  },
  {
    name: 'data-pipeline',
    description: 'load and transform datasets',
    experience_yaml_excerpt:
      'graph:\n  nodes:\n    - { id: l, kind: dataset }\n    - { id: t, kind: tool }\n',
  },
]

describe('pickExemplars', () => {
  it('ranks the kind-histogram-closest exemplar first', () => {
    const picked = pickExemplars(ANALYSIS, CORPUS, 1)
    expect(picked).toHaveLength(1)
    expect(picked[0]!.name).toBe('soc2-review')
  })

  it('returns [] for an empty corpus (no-op grounding)', () => {
    expect(pickExemplars(ANALYSIS, [], 2)).toEqual([])
  })

  it('never returns more than n', () => {
    expect(pickExemplars(ANALYSIS, CORPUS, 1).length).toBeLessThanOrEqual(1)
  })
})
