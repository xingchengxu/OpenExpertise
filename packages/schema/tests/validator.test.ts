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
          {
            id: 'greet',
            kind: 'tool',
            impl: './t.ts',
            reads: ['missing_field'],
            writes: ['greeting'],
          },
        ],
      },
    }
    expect(() => validateExperienceSpec(bad)).toThrow(
      /reads undeclared state field "missing_field"/,
    )
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

describe('cli-agent node kind', () => {
  const base = {
    name: 'x',
    version: '0.1.0',
    state: { schema: { result: { type: 'string' } } },
    graph: {
      nodes: [
        {
          id: 'n1',
          kind: 'cli-agent',
          provider: 'claude-code',
          prompt: 'do the thing',
          writes: ['result'],
        },
      ],
      edges: [],
    },
  }

  it('accepts a minimal cli-agent node', () => {
    expect(() => validateExperienceSpec(structuredClone(base))).not.toThrow()
  })

  it('accepts all three providers', () => {
    for (const provider of ['claude-code', 'codex', 'gemini'] as const) {
      const spec = structuredClone(base)
      ;(spec.graph.nodes[0] as { provider: string }).provider = provider
      expect(() => validateExperienceSpec(spec)).not.toThrow()
    }
  })

  it('rejects unknown provider', () => {
    const spec = structuredClone(base) as { graph: { nodes: Array<Record<string, unknown>> } }
    spec.graph.nodes[0]!['provider'] = 'gpt-9001'
    expect(() => validateExperienceSpec(spec)).toThrow(/Schema validation failed/)
  })

  it('rejects missing prompt', () => {
    const spec = structuredClone(base) as { graph: { nodes: Array<Record<string, unknown>> } }
    delete spec.graph.nodes[0]!['prompt']
    expect(() => validateExperienceSpec(spec)).toThrow(/Schema validation failed/)
  })

  it('accepts optional fields (workdir, output_format, timeout_ms, extra_args, model, schema)', () => {
    const spec = structuredClone(base) as { graph: { nodes: Array<Record<string, unknown>> } }
    Object.assign(spec.graph.nodes[0]!, {
      model: 'gpt-4o-2024-11-20',
      workdir: './sub',
      output_format: 'json',
      schema: { type: 'object' },
      timeout_ms: 30000,
      extra_args: ['--verbose'],
    })
    expect(() => validateExperienceSpec(spec)).not.toThrow()
  })
})
