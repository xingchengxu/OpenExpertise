import { describe, it, expect } from 'vitest'
import { ClaudeCodeProvider } from '../src/providers/claude-code.js'

describe('ClaudeCodeProvider', () => {
  const provider = new ClaudeCodeProvider()

  it('name is "claude-code"', () => {
    expect(provider.name).toBe('claude-code')
  })

  it('builds the basic command with -p and output format text', () => {
    const spec = provider.buildCommand({
      prompt: 'hello world',
      workdir: '/tmp/x',
      outputFormat: 'text',
    })
    expect(spec.cmd).toBe('claude')
    expect(spec.args).toEqual(['-p', 'hello world', '--output-format', 'text'])
  })

  it('switches to json output format when requested', () => {
    const spec = provider.buildCommand({
      prompt: 'hi',
      workdir: '/tmp/x',
      outputFormat: 'json',
    })
    expect(spec.args).toContain('--output-format')
    expect(spec.args).toContain('json')
  })

  it('passes model via --model when set', () => {
    const spec = provider.buildCommand({
      prompt: 'hi',
      workdir: '/tmp/x',
      outputFormat: 'text',
      model: 'claude-sonnet-4-6',
    })
    expect(spec.args).toContain('--model')
    expect(spec.args).toContain('claude-sonnet-4-6')
  })

  it('appends extra_args verbatim', () => {
    const spec = provider.buildCommand({
      prompt: 'hi',
      workdir: '/tmp/x',
      outputFormat: 'text',
      extra_args: ['--allowed-tools', 'Read,Grep'],
    })
    expect(spec.args.slice(-2)).toEqual(['--allowed-tools', 'Read,Grep'])
  })
})
