import { describe, it, expect } from 'vitest'
import Ajv from 'ajv'
import { CRITIQUE_SCHEMA, type CritiqueOutput } from '../src/schemas.js'

describe('CRITIQUE_SCHEMA', () => {
  const ajv = new Ajv({ allErrors: true, strict: false })
  const validate = ajv.compile(CRITIQUE_SCHEMA)

  it('accepts a well-formed critique', () => {
    const ok: CritiqueOutput = {
      score: 72,
      summary: 'decomposition weak on verifier step',
      findings: [
        {
          dimension: 'decomposition',
          severity: 'high',
          anchor: { node_id: 'classify' },
          evidence: 'no verifier node after classify',
          fix: 'add a verifier node that confirms the classification',
        },
      ],
    }
    expect(validate(ok)).toBe(true)
  })

  it('rejects an out-of-range score', () => {
    expect(validate({ score: 150, findings: [] })).toBe(false)
  })

  it('rejects a finding with an unknown dimension', () => {
    expect(
      validate({
        score: 50,
        findings: [
          { dimension: 'writes-consistency', severity: 'high', anchor: {}, evidence: 'x', fix: 'y' },
        ],
      }),
    ).toBe(false)
  })
})
