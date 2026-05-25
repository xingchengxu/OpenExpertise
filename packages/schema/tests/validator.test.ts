import { describe, it, expect } from 'vitest'
import { validateExperienceSpec, ValidationError } from '../src/validator.js'
import type { ExperienceSpec } from '../src/types.js'

const validSpec: ExperienceSpec = {
  name: 'hello',
  version: '0.1.0',
  state: { schema: { greeting: { type: 'string' } } },
  graph: {
    nodes: [{ id: 'greet', kind: 'tool', impl: './tools/greet.ts', writes: ['greeting'] }],
    edges: [],
  },
}

describe('validateExperienceSpec', () => {
  it('accepts a minimal valid spec', () => {
    expect(() => validateExperienceSpec(validSpec)).not.toThrow()
  })

  it('rejects spec missing required fields', () => {
    const bad = { ...validSpec, name: undefined } as unknown as ExperienceSpec
    expect(() => validateExperienceSpec(bad)).toThrow(ValidationError)
  })

  it('rejects unknown node kind', () => {
    const bad: ExperienceSpec = {
      ...validSpec,
      graph: { ...validSpec.graph, nodes: [{ id: 'x', kind: 'weird' as any, impl: 'x' } as any] },
    }
    expect(() => validateExperienceSpec(bad)).toThrow(ValidationError)
  })

  it('rejects edge referencing nonexistent node', () => {
    const bad: ExperienceSpec = {
      ...validSpec,
      graph: { ...validSpec.graph, edges: [{ from: 'greet', to: 'nope' }] },
    }
    expect(() => validateExperienceSpec(bad)).toThrow(/unknown node id "nope"/)
  })

  it('rejects writes referencing undeclared state field', () => {
    const bad: ExperienceSpec = {
      ...validSpec,
      graph: {
        ...validSpec.graph,
        nodes: [{ id: 'greet', kind: 'tool', impl: './t.ts', writes: ['nonexistent'] }],
      },
    }
    expect(() => validateExperienceSpec(bad)).toThrow(/undeclared state field "nonexistent"/)
  })

  it('rejects reads referencing undeclared state field', () => {
    const bad: ExperienceSpec = {
      ...validSpec,
      graph: {
        ...validSpec.graph,
        nodes: [
          { id: 'greet', kind: 'tool', impl: './t.ts', reads: ['missing_field'], writes: ['greeting'] },
        ],
      },
    }
    expect(() => validateExperienceSpec(bad)).toThrow(/reads undeclared state field "missing_field"/)
  })

  it('rejects duplicate node ids', () => {
    const bad: ExperienceSpec = {
      ...validSpec,
      graph: {
        nodes: [
          { id: 'dup', kind: 'tool', impl: './a.ts', writes: ['greeting'] },
          { id: 'dup', kind: 'tool', impl: './b.ts', writes: ['greeting'] },
        ],
        edges: [],
      },
    }
    expect(() => validateExperienceSpec(bad)).toThrow(/duplicate node ids/i)
  })
})
