import { describe, it, expect, beforeEach } from 'vitest'
import { resolveLLMProvider } from '../src/llm-factory.js'

const ENV_KEYS = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY'] as const

describe('resolveLLMProvider', () => {
  beforeEach(() => {
    for (const k of ENV_KEYS) delete process.env[k]
  })

  it('honors explicit --llm anthropic', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-a'
    expect(resolveLLMProvider({ flag: 'anthropic' })).toBe('anthropic')
  })

  it('honors explicit --llm openai', () => {
    process.env.OPENAI_API_KEY = 'sk-o'
    expect(resolveLLMProvider({ flag: 'openai' })).toBe('openai')
  })

  it('auto-detects openai when only OPENAI_API_KEY set', () => {
    process.env.OPENAI_API_KEY = 'sk-o'
    expect(resolveLLMProvider({})).toBe('openai')
  })

  it('auto-detects anthropic when only ANTHROPIC_API_KEY set', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-a'
    expect(resolveLLMProvider({})).toBe('anthropic')
  })

  it('defaults to anthropic when both env vars set (no flag)', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-a'
    process.env.OPENAI_API_KEY = 'sk-o'
    expect(resolveLLMProvider({})).toBe('anthropic')
  })

  it('throws a helpful error when neither key nor flag', () => {
    expect(() => resolveLLMProvider({})).toThrow(
      /ANTHROPIC_API_KEY.*OPENAI_API_KEY|OPENAI_API_KEY.*ANTHROPIC_API_KEY/,
    )
  })

  it('throws when flag set to a value with no matching key', () => {
    expect(() => resolveLLMProvider({ flag: 'openai' })).toThrow(/OPENAI_API_KEY/)
  })
})
