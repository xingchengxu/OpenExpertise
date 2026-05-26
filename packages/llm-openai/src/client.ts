import OpenAI from 'openai'
import type {
  LLMClient,
  LLMCompleteOpts,
  LLMCompleteResult,
  LLMMessage,
} from '@openexpertise/core'

export interface OpenAILLMClientOpts {
  apiKey?: string
  sdkClient?: Pick<OpenAI, 'chat'>
}

type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null }

export class OpenAILLMClient implements LLMClient {
  private readonly sdk: Pick<OpenAI, 'chat'>

  constructor(opts: OpenAILLMClientOpts = {}) {
    if (opts.sdkClient) {
      this.sdk = opts.sdkClient
      return
    }
    const apiKey = opts.apiKey ?? process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error(
        'OpenAILLMClient requires OPENAI_API_KEY (env or constructor opt) or an injected sdkClient',
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

    const response = (await this.sdk.chat.completions.create(request as never)) as {
      choices?: Array<{
        message?: { content?: string | null; tool_calls?: unknown[] }
        finish_reason?: string
      }>
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }

    const choice = response.choices?.[0]
    const text = choice?.message?.content ?? ''
    const result: LLMCompleteResult = { text }
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
}
