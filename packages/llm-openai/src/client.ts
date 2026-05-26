import OpenAI from 'openai'
import type { LLMClient, LLMCompleteOpts, LLMCompleteResult, LLMMessage } from '@openexpertise/core'

export interface OpenAIRetryOpts {
  max_attempts?: number // default 4
  base_ms?: number // default 1000
}

export interface OpenAILLMClientOpts {
  apiKey?: string
  sdkClient?: Pick<OpenAI, 'chat'>
  retry?: OpenAIRetryOpts
}

type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null }

export class OpenAILLMClient implements LLMClient {
  private readonly sdk: Pick<OpenAI, 'chat'>
  private readonly retryOpts: OpenAIRetryOpts

  constructor(opts: OpenAILLMClientOpts = {}) {
    this.retryOpts = opts.retry ?? {}
    if (opts.sdkClient) {
      this.sdk = opts.sdkClient
      return
    }
    const apiKey = opts.apiKey ?? process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error(
        'OpenAILLMClient: no API key found. ' +
          'Set the OPENAI_API_KEY environment variable, pass `{ apiKey: "..." }` to the constructor, ' +
          'or inject a pre-configured `sdkClient`. ' +
          'Example: `new OpenAILLMClient({ apiKey: process.env.OPENAI_API_KEY })`.',
      )
    }
    this.sdk = new OpenAI({ apiKey })
  }

  async complete(opts: LLMCompleteOpts): Promise<LLMCompleteResult> {
    const messages: ChatMessage[] = []
    if (opts.system) messages.push({ role: 'system', content: opts.system })
    for (const m of opts.messages) messages.push(this.mapInbound(m))

    const request: Record<string, unknown> = {
      model: opts.model,
      messages,
      max_tokens: opts.max_tokens ?? 4096,
    }

    if (opts.tools && opts.tools.length > 0) {
      request.tools = opts.tools.map((t) => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.input_schema,
        },
      }))
      request.tool_choice =
        opts.tools.length === 1
          ? { type: 'function' as const, function: { name: opts.tools[0]!.name } }
          : ('required' as const)
    }

    const retry = {
      max_attempts: this.retryOpts.max_attempts ?? 4,
      base_ms: this.retryOpts.base_ms ?? 1000,
    }
    const response = (await this.callWithRetry(retry, () =>
      this.sdk.chat.completions.create(request as never),
    )) as {
      choices?: Array<{
        message?: {
          content?: string | null
          tool_calls?: Array<{
            id?: string
            type?: string
            function?: { name?: string; arguments?: string }
          }>
        }
        finish_reason?: string
      }>
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }

    const choice = response.choices?.[0]
    const text = choice?.message?.content ?? ''
    const result: LLMCompleteResult = { text }

    const rawCalls = choice?.message?.tool_calls ?? []
    if (rawCalls.length > 0) {
      const tool_calls = rawCalls
        .filter((c) => c.type === 'function' && c.function?.name)
        .map((c) => ({
          name: c.function!.name!,
          input: this.parseArguments(c.function!.arguments ?? ''),
        }))
      if (tool_calls.length > 0) result.tool_calls = tool_calls
    }

    if (response.usage) {
      result.usage = {
        input_tokens: response.usage.prompt_tokens ?? 0,
        output_tokens: response.usage.completion_tokens ?? 0,
      }
    }
    if (choice?.finish_reason) result.stop_reason = choice.finish_reason
    return result
  }

  private mapInbound(m: LLMMessage): ChatMessage {
    return { role: m.role, content: m.content }
  }

  private parseArguments(raw: string): unknown {
    if (!raw) return {}
    // Some reasoning-style OpenAI-compatible servers (e.g. vLLM-served minimax)
    // prefix the tool-call arguments string with a <think>...</think> block
    // BEFORE the actual JSON. Strip it so the downstream JSON.parse can succeed.
    const stripped = raw.replace(/^\s*<think>[\s\S]*?<\/think>\s*/, '')
    try {
      return JSON.parse(stripped)
    } catch {
      return { _raw: raw }
    }
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
