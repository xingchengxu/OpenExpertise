import { describe, it, expect } from 'vitest'
import { CodexProvider } from '../src/providers/codex.js'

describe('CodexProvider', () => {
  const provider = new CodexProvider()

  it('name is "codex"', () => {
    expect(provider.name).toBe('codex')
  })

  it('uses `codex exec --skip-git-repo-check` with prompt as final arg', () => {
    const spec = provider.buildCommand({
      prompt: 'analyze the file',
      workdir: '/tmp/x',
      outputFormat: 'text',
    })
    expect(spec.cmd).toBe('codex')
    expect(spec.args[0]).toBe('exec')
    expect(spec.args).toContain('--skip-git-repo-check')
    expect(spec.args[spec.args.length - 1]).toBe('analyze the file')
  })

  it('passes model via --model when set', () => {
    const spec = provider.buildCommand({
      prompt: 'p',
      workdir: '/tmp/x',
      outputFormat: 'text',
      model: 'gpt-4o-2024-11-20',
    })
    const i = spec.args.indexOf('--model')
    expect(i).toBeGreaterThanOrEqual(0)
    expect(spec.args[i + 1]).toBe('gpt-4o-2024-11-20')
  })

  it('appends extra_args before the prompt arg', () => {
    const spec = provider.buildCommand({
      prompt: 'p',
      workdir: '/tmp/x',
      outputFormat: 'text',
      extra_args: ['--sandbox', 'read-only'],
    })
    const promptIdx = spec.args.indexOf('p')
    const sandboxIdx = spec.args.indexOf('--sandbox')
    expect(sandboxIdx).toBeGreaterThanOrEqual(0)
    expect(sandboxIdx).toBeLessThan(promptIdx)
  })
})
