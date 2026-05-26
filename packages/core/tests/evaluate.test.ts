import { describe, it, expect } from 'vitest'
import { evaluateExpression } from '../src/expressions/evaluate.js'

const state = { count: 3, ratio: 0.5, name: 'alice', items: [1, 2, 3], flag: true }

describe('evaluateExpression', () => {
  it('literal true/false', () => {
    expect(evaluateExpression('true', state)).toBe(true)
    expect(evaluateExpression('false', state)).toBe(false)
  })
  it('numeric comparisons', () => {
    expect(evaluateExpression('$.count > 2', state)).toBe(true)
    expect(evaluateExpression('$.count >= 3', state)).toBe(true)
    expect(evaluateExpression('$.count < 3', state)).toBe(false)
    expect(evaluateExpression('$.count <= 3', state)).toBe(true)
    expect(evaluateExpression('$.count == 3', state)).toBe(true)
    expect(evaluateExpression('$.count != 3', state)).toBe(false)
  })
  it('string equality', () => {
    expect(evaluateExpression('$.name == "alice"', state)).toBe(true)
    expect(evaluateExpression('$.name == "bob"', state)).toBe(false)
  })
  it('logical and / or', () => {
    expect(evaluateExpression('$.count > 0 && $.flag', state)).toBe(true)
    expect(evaluateExpression('$.count > 100 || $.flag', state)).toBe(true)
    expect(evaluateExpression('$.count > 100 || $.count < 0', state)).toBe(false)
  })
  it('length() function on arrays', () => {
    expect(evaluateExpression('length($.items) > 2', state)).toBe(true)
    expect(evaluateExpression('length($.items) == 3', state)).toBe(true)
  })
  it('missing fields evaluate to false in comparisons', () => {
    expect(evaluateExpression('$.missing > 0', state)).toBe(false)
    expect(evaluateExpression('$.missing == "x"', state)).toBe(false)
  })
  it('throws on parse error', () => {
    expect(() => evaluateExpression('$.count >>>', state)).toThrow()
  })
})
