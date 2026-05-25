import { describe, it, expect } from 'vitest'
import { interpolatePrompt } from '../src/llm/prompt.js'

describe('interpolatePrompt', () => {
  it('replaces simple placeholders with string values', () => {
    expect(interpolatePrompt({ template: 'hi {{name}}', values: { name: 'Alice' } })).toBe(
      'hi Alice',
    )
  })

  it('JSON-stringifies non-string values', () => {
    expect(interpolatePrompt({ template: 'data: {{x}}', values: { x: [1, 2, 3] } })).toBe(
      'data: [1,2,3]',
    )
  })

  it('throws on missing placeholder when strict', () => {
    expect(() => interpolatePrompt({ template: '{{absent}}', values: {} })).toThrow(
      /placeholder "\{\{absent\}\}"/,
    )
  })

  it('leaves missing placeholders intact when strict is false', () => {
    expect(interpolatePrompt({ template: '{{absent}}', values: {}, strict: false })).toBe(
      '{{absent}}',
    )
  })

  it('handles multiple placeholders in one template', () => {
    expect(
      interpolatePrompt({
        template: '{{a}} + {{b}} = {{c}}',
        values: { a: 1, b: 2, c: 3 },
      }),
    ).toBe('1 + 2 = 3')
  })

  it('tolerates whitespace inside braces', () => {
    expect(interpolatePrompt({ template: '{{ name }}', values: { name: 'ok' } })).toBe('ok')
  })
})
