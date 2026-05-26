import type { LLMClient } from '@openexpertise/core'

export type LLMProvider = 'anthropic' | 'openai'

export interface ResolveLLMProviderOpts {
  flag?: string
}

export function resolveLLMProvider(opts: ResolveLLMProviderOpts): LLMProvider {
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY)
  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY)

  if (opts.flag === 'anthropic') {
    if (!hasAnthropic) throw new Error('--llm anthropic requires ANTHROPIC_API_KEY')
    return 'anthropic'
  }
  if (opts.flag === 'openai') {
    if (!hasOpenAI) throw new Error('--llm openai requires OPENAI_API_KEY')
    return 'openai'
  }
  if (opts.flag !== undefined) {
    throw new Error(`unknown --llm value: ${opts.flag}. Use 'anthropic' or 'openai'.`)
  }

  if (hasAnthropic) return 'anthropic'
  if (hasOpenAI) return 'openai'
  throw new Error(
    'No LLM provider configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY, or pass --llm <anthropic|openai>.',
  )
}

export function defaultModelFor(provider: LLMProvider): string {
  return provider === 'anthropic' ? 'claude-sonnet-4-6' : 'gpt-4o-2024-11-20'
}

export async function makeLLMClient(provider: LLMProvider): Promise<LLMClient> {
  if (provider === 'anthropic') {
    const { AnthropicLLMClient } = await import('@openexpertise/node-kinds-agent')
    return new AnthropicLLMClient()
  }
  const { OpenAILLMClient } = await import('@openexpertise/llm-openai')
  return new OpenAILLMClient()
}
