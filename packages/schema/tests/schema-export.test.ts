import { describe, it, expect } from 'vitest'
import { EXPERIENCE_SCHEMA } from '../src/index.js'

describe('EXPERIENCE_SCHEMA export', () => {
  it('exports a non-null object', () => {
    expect(EXPERIENCE_SCHEMA).toBeDefined()
    expect(typeof EXPERIENCE_SCHEMA).toBe('object')
    expect(EXPERIENCE_SCHEMA).not.toBeNull()
  })

  it('has a string $id', () => {
    expect(typeof EXPERIENCE_SCHEMA.$id).toBe('string')
    expect((EXPERIENCE_SCHEMA.$id as string).length).toBeGreaterThan(0)
  })

  it('$schema references draft-07', () => {
    expect(typeof EXPERIENCE_SCHEMA.$schema).toBe('string')
    expect(EXPERIENCE_SCHEMA.$schema as string).toContain('draft-07')
  })

  it('has the expected $id value', () => {
    expect(EXPERIENCE_SCHEMA.$id).toBe('https://openexpertise.dev/schemas/experience-v0.1.0.json')
  })
})
