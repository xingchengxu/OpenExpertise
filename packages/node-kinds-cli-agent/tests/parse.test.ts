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
    expect(() => parseOutput({ stdout: 'x', outputFormat: 'text', writes: ['a', 'b'] })).toThrow(
      /text mode requires/i,
    )
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
    expect(() => parseOutput({ stdout: 'not json', outputFormat: 'json', writes: [] })).toThrow(
      /JSON/i,
    )
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

describe('parseOutput — provider-specific transports', () => {
  it('unwraps a Claude Code --output-format json envelope', () => {
    const claudeEnvelope = JSON.stringify({
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: '{"security_findings": [{"title": "SQLi", "severity": "high"}]}',
    })
    const out = parseOutput({
      stdout: claudeEnvelope,
      outputFormat: 'json',
      writes: ['security_findings'],
    })
    expect(out).toEqual({ security_findings: [{ title: 'SQLi', severity: 'high' }] })
  })

  it('strips a markdown ```json fence around JSON', () => {
    const stdout = '```json\n{"a": 1, "b": 2}\n```'
    const out = parseOutput({ stdout, outputFormat: 'json', writes: ['a', 'b'] })
    expect(out).toEqual({ a: 1, b: 2 })
  })

  it('handles a Claude envelope whose .result is itself fenced JSON', () => {
    const env = JSON.stringify({
      type: 'result',
      result: '```json\n{"security_findings": []}\n```',
    })
    const out = parseOutput({ stdout: env, outputFormat: 'json', writes: ['security_findings'] })
    expect(out).toEqual({ security_findings: [] })
  })
})
