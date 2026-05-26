import { describe, it, expect } from 'vitest'
import { parseOutput } from '../src/parse.js'

describe('parseOutput', () => {
  it('text mode with one writes field returns { field: stdout }', () => {
    const out = parseOutput({
      stdout: 'hello world',
      outputFormat: 'text',
      writes: ['greeting'],
    })
    expect(out).toEqual({ greeting: 'hello world' })
  })

  it('text mode with no writes returns {}', () => {
    const out = parseOutput({ stdout: 'whatever', outputFormat: 'text', writes: [] })
    expect(out).toEqual({})
  })

  it('text mode with multiple writes throws (ambiguous mapping)', () => {
    expect(() =>
      parseOutput({ stdout: 'x', outputFormat: 'text', writes: ['a', 'b'] }),
    ).toThrow(/text mode requires/i)
  })

  it('json mode parses stdout and returns the parsed object', () => {
    const out = parseOutput({
      stdout: '{"findings":[{"title":"x"}]}',
      outputFormat: 'json',
      writes: ['findings'],
    })
    expect(out).toEqual({ findings: [{ title: 'x' }] })
  })

  it('json mode throws on invalid JSON', () => {
    expect(() =>
      parseOutput({ stdout: 'not json', outputFormat: 'json', writes: [] }),
    ).toThrow(/JSON/i)
  })

  it('json mode validates against schema when provided', () => {
    const schema = {
      type: 'object',
      required: ['n'],
      properties: { n: { type: 'number' } },
    }
    expect(() =>
      parseOutput({ stdout: '{"n":"oops"}', outputFormat: 'json', writes: ['n'], schema }),
    ).toThrow(/schema/i)
    expect(
      parseOutput({ stdout: '{"n":42}', outputFormat: 'json', writes: ['n'], schema }),
    ).toEqual({ n: 42 })
  })
})
