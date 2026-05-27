/**
 * Regression tests for schema-validator error messages.
 * Pins the key substrings that make validator errors actionable to first-time users.
 */
import { describe, it, expect } from 'vitest'
import { validateExperienceSpec, ValidationError } from '../src/validator.js'
import type { ExperienceSpec } from '../src/types.js'

const baseSpec: ExperienceSpec = {
  name: 'hello',
  version: '0.1.0',
  state: { schema: { greeting: { type: 'string' } } },
  graph: {
    nodes: [{ id: 'greet', kind: 'tool', impl: './tools/greet.ts', writes: ['greeting'] }],
    edges: [],
  },
}

describe('edge references unknown node — error message hints', () => {
  it('names the missing destination node', () => {
    const bad: ExperienceSpec = {
      ...baseSpec,
      graph: { ...baseSpec.graph, edges: [{ from: 'greet', to: 'typo-node' }] },
    }
    expect(() => validateExperienceSpec(bad)).toThrow(/typo-node/)
  })

  it('shows the edge with arrow notation', () => {
    const bad: ExperienceSpec = {
      ...baseSpec,
      graph: { ...baseSpec.graph, edges: [{ from: 'greet', to: 'missing' }] },
    }
    expect(() => validateExperienceSpec(bad)).toThrow(/greet.*missing/)
  })

  it('lists defined nodes to help spot the typo', () => {
    const bad: ExperienceSpec = {
      ...baseSpec,
      graph: { ...baseSpec.graph, edges: [{ from: 'greet', to: 'missing' }] },
    }
    expect(() => validateExperienceSpec(bad)).toThrow(/Defined nodes.*greet/)
  })

  it('throws a ValidationError instance', () => {
    const bad: ExperienceSpec = {
      ...baseSpec,
      graph: { ...baseSpec.graph, edges: [{ from: 'greet', to: 'missing' }] },
    }
    expect(() => validateExperienceSpec(bad)).toThrow(ValidationError)
  })
})
