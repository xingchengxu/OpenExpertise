import Anthropic from '@anthropic-ai/sdk'
import type {
  LLMClient,
  LLMCompleteOpts,
  LLMCompleteResult,
  LLMToolCall,
} from '@openexpertise/core'

export interface AnthropicRetryOpts {
  max_attempts?: number // default 4
  base_ms?: number // default 1000
}

export interface AnthropicLLMClientOpts {
  apiKey?: string
  // Inject an alternative SDK client (used in tests to avoid network).
  sdkClient?: Pick<Anthropic, 'messages'>
  retry?: AnthropicRetryOpts
}

export class AnthropicLLMClient implements LLMClient {
  private readonly sdk: Pick<Anthropic, 'messages'>
  private readonly retryOpts: AnthropicRetryOpts

  constructor(opts: AnthropicLLMClientOpts = {}) {
    this.retryOpts = opts.retry ?? {}
    if (opts.sdkClient) {
      this.sdk = opts.sdkClient
      return
    }
    const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      throw new Error(
        'AnthropicLLMClient requires ANTHROPIC_API_KEY (env or constructor opt) or an injected sdkClient',
      )
    }
    this.sdk = new Anthropic({ apiKey })
  }

  async complete(opts: LLMCompleteOpts): Promise<LLMCompleteResult> {
    const request: Anthropic.MessageCreateParamsNonStreaming = {
      model: opts.model,
      max_tokens: opts.max_tokens ?? 4096,
      messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
      ...(opts.system ? { system: opts.system } : {}),
      ...(opts.tools && opts.tools.length > 0
        ? {
            tools: opts.tools.map((t) => ({
              name: t.name,
              description: t.description,
              input_schema: t.input_schema as Anthropic.Tool.InputSchema,
            })),
          }
        : {}),
    }

    const retry = {
      max_attempts: this.retryOpts.max_attempts ?? 4,
      base_ms: this.retryOpts.base_ms ?? 1000,
    }
    const response = await this.callWithRetry(retry, () => this.sdk.messages.create(request))

    let text = ''
    const tool_calls: LLMToolCall[] = []
    for (const block of response.content) {
      if (block.type === 'text') text += block.text
      else if (block.type === 'tool_use') tool_calls.push({ name: block.name, input: block.input })
    }

    const result: LLMCompleteResult = { text }
    if (tool_calls.length > 0) result.tool_calls = tool_calls
    if (response.usage) {
      result.usage = {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      }
    }
    if (response.stop_reason) result.stop_reason = response.stop_reason
    return result
  }

  private async callWithRetry<T>(
    retry: { max_attempts: number; base_ms: number },
    fn: () => Promise<T>,
  ): Promise<T> {
    let lastErr: unknown
    for (let attempt = 1; attempt <= retry.max_attempts; attempt++) {
      try {
        return await fn()
      } catch (err) {
        lastErr = err
        if (!this.is429(err) || attempt === retry.max_attempts) {
          throw err
        }
        const wait = retry.base_ms * Math.pow(2, attempt - 1)
        await new Promise((r) => setTimeout(r, wait))
      }
    }
    throw lastErr
  }

  private is429(err: unknown): boolean {
    if (err && typeof err === 'object') {
      const e = err as { status?: number; name?: string }
      if (e.status === 429) return true
      if (e.name === 'RateLimitError') return true
    }
    return false
  }
}
