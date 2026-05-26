import { describe, it, expect } from 'vitest'
import { GeminiProvider } from '../src/providers/gemini.js'

describe('GeminiProvider', () => {
  const provider = new GeminiProvider()

  it('name is "gemini"', () => {
    expect(provider.name).toBe('gemini')
  })

  it('uses `gemini --yolo --prompt`', () => {
    const spec = provider.buildCommand({
      prompt: 'tell me about the codebase',
      workdir: '/tmp/x',
      outputFormat: 'text',
    })
    expect(spec.cmd).toBe('gemini')
    expect(spec.args).toContain('--yolo')
    const i = spec.args.indexOf('--prompt')
    expect(i).toBeGreaterThanOrEqual(0)
    expect(spec.args[i + 1]).toBe('tell me about the codebase')
  })

  it('passes model via --model', () => {
    const spec = provider.buildCommand({
      prompt: 'p',
      workdir: '/tmp/x',
      outputFormat: 'text',
      model: 'gemini-2.5-pro',
    })
    const i = spec.args.indexOf('--model')
    expect(i).toBeGreaterThanOrEqual(0)
    expect(spec.args[i + 1]).toBe('gemini-2.5-pro')
  })

  it('appends extra_args', () => {
    const spec = provider.buildCommand({
      prompt: 'p',
      workdir: '/tmp/x',
      outputFormat: 'text',
      extra_args: ['--debug'],
    })
    expect(spec.args).toContain('--debug')
  })

  it('passes --skip-trust so gemini does not refuse to run in untrusted dirs', () => {
    const spec = provider.buildCommand({
      prompt: 'p',
      workdir: '/tmp/x',
      outputFormat: 'text',
    })
    // Real gemini 0.43 exits 55 in any /tmp dir without --skip-trust, AND
    // silently downgrades --yolo to 'default' approval if the dir is untrusted.
    expect(spec.args).toContain('--skip-trust')
  })
})
