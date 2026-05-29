import { describe, it, expect } from 'vitest'
import { preflightDraft } from '../src/preflight.js'
import type { SynthesisOutput } from '../src/schemas.js'

const CLEAN: SynthesisOutput = {
  experience_yaml: `name: clean-sop
version: 0.1.0
state:
  schema:
    greeting: { type: string }
phases:
  - { id: main }
graph:
  nodes:
    - id: greet
      kind: tool
      phase: main
      impl: ./tools/greet.mjs
      writes: [greeting]
  edges: []
`,
  files: [
    { path: 'tools/greet.mjs', content: 'export default async () => ({ state_delta: {} })\n' },
  ],
}

describe('preflightDraft', () => {
  it('returns ok:true for a clean, fully-referenced draft', () => {
    const r = preflightDraft(CLEAN)
    expect(r.ok).toBe(true)
    expect(r.issues).toEqual([])
  })

  it('flags a missing tool-impl file (referenced by YAML, absent from files[])', () => {
    const bad = { ...CLEAN, files: [] }
    const r = preflightDraft(bad)
    expect(r.ok).toBe(false)
    expect(r.issues.some((i) => i.includes('tools/greet.mjs'))).toBe(true)
  })

  it('flags an undeclared writes field via validateExperienceSpec', () => {
    const bad = {
      ...CLEAN,
      experience_yaml: CLEAN.experience_yaml.replace(
        'writes: [greeting]',
        'writes: [missing_field]',
      ),
    }
    const r = preflightDraft(bad)
    expect(r.ok).toBe(false)
    expect(r.issues.length).toBeGreaterThan(0)
  })

  it('flags a dangling edge via buildDag', () => {
    const bad = {
      ...CLEAN,
      experience_yaml: CLEAN.experience_yaml.replace(
        '  edges: []',
        '  edges:\n    - { from: greet, to: ghost }',
      ),
    }
    const r = preflightDraft(bad)
    expect(r.ok).toBe(false)
    expect(r.issues.some((i) => i.includes('ghost'))).toBe(true)
  })

  it('returns ok:false with a parse-error issue for malformed YAML', () => {
    const r = preflightDraft({ experience_yaml: ':\n  bad: [', files: [] })
    expect(r.ok).toBe(false)
    expect(r.issues.length).toBeGreaterThan(0)
  })
})
