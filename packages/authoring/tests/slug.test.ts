import { describe, it, expect } from 'vitest'
import { slugify } from '../src/slug.js'

describe('slugify', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(slugify('Security PR Review')).toBe('security-pr-review')
  })

  it('strips non-alphanumeric characters', () => {
    expect(slugify("Audit GitHub PRs! (compliance/SOC2)")).toBe('audit-github-prs-compliance-soc2')
  })

  it('collapses consecutive separators', () => {
    expect(slugify('foo   bar---baz')).toBe('foo-bar-baz')
  })

  it('trims leading and trailing separators', () => {
    expect(slugify('---foo---')).toBe('foo')
  })

  it('truncates to 60 chars at a word boundary', () => {
    const long = 'a very long task name '.repeat(10)
    const out = slugify(long)
    expect(out.length).toBeLessThanOrEqual(60)
    expect(out.endsWith('-')).toBe(false)
  })

  it('falls back to "experience" when input has no alphanumerics', () => {
    expect(slugify('!!!')).toBe('experience')
  })

  it('preserves digits', () => {
    expect(slugify('SOC2 v1.2 review')).toBe('soc2-v1-2-review')
  })
})
