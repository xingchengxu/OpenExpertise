import { describe, it, expect } from 'vitest'
import { resolveExpression } from '../src/expressions/resolve.js'

describe('resolveExpression', () => {
  const state = {
    pr_id: 'PR-1',
    findings: [{ file: 'a.ts' }, { file: 'b.ts' }],
    nested: { count: 3 },
  }

  it('returns literal values unchanged', () => {
    expect(resolveExpression(42, state)).toBe(42)
    expect(resolveExpression('hello', state)).toBe('hello')
    expect(resolveExpression(null, state)).toBe(null)
  })

  it('resolves $.field to state value', () => {
    expect(resolveExpression('$.pr_id', state)).toBe('PR-1')
  })

  it('resolves $.nested.path', () => {
    expect(resolveExpression('$.nested.count', state)).toBe(3)
  })

  it('returns undefined for missing path', () => {
    expect(resolveExpression('$.missing', state)).toBeUndefined()
    expect(resolveExpression('$.nested.absent', state)).toBeUndefined()
  })

  it('walks object literals recursively', () => {
    const obj = { id: '$.pr_id', extra: { n: '$.nested.count' } }
    expect(resolveExpression(obj, state)).toEqual({ id: 'PR-1', extra: { n: 3 } })
  })

  it('walks arrays', () => {
    expect(resolveExpression(['$.pr_id', 'literal'], state)).toEqual(['PR-1', 'literal'])
  })

  it('returns deep copies, not aliases', () => {
    const r = resolveExpression('$.findings', state) as Array<{ file: string }>
    r[0].file = 'mutated'
    expect(state.findings[0].file).toBe('a.ts')
  })
})
