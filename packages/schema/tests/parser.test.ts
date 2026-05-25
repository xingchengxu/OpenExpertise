import { describe, it, expect } from 'vitest'
import { parseExperienceYaml } from '../src/parser.js'

describe('parseExperienceYaml', () => {
  it('parses a minimal valid experience', () => {
    const yaml = `
name: hello
version: 0.1.0
state:
  schema:
    greeting:
      type: string
graph:
  nodes:
    - id: greet
      kind: tool
      impl: ./tools/greet.ts
      writes: [greeting]
  edges: []
`
    const spec = parseExperienceYaml(yaml)
    expect(spec.name).toBe('hello')
    expect(spec.graph.nodes).toHaveLength(1)
    expect(spec.graph.nodes[0]?.kind).toBe('tool')
  })

  it('surfaces YAML syntax errors with line numbers', () => {
    const yaml = 'name: hello\nversion: [unclosed'
    expect(() => parseExperienceYaml(yaml)).toThrow(/line 2/i)
  })
})
