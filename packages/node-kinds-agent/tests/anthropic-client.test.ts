import { describe, it, expect, vi } from 'vitest'
import { AnthropicLLMClient } from '../src/anthropic-client.js'

describe('AnthropicLLMClient.complete', () => {
  it('maps SDK text response to LLMCompleteResult', async () => {
    const fakeSdk = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'hello' }],
          usage: { input_tokens: 10, output_tokens: 4 },
          stop_reason: 'end_turn',
        }),
      },
    }
    const client = new AnthropicLLMClient({ sdkClient: fakeSdk as any })
    const result = await client.complete({
      model: 'claude-sonnet-4-5',
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 100,
    })
    expect(result.text).toBe('hello')
    expect(result.usage).toEqual({ input_tokens: 10, output_tokens: 4 })
    expect(result.stop_reason).toBe('end_turn')
    expect(fakeSdk.messages.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-sonnet-4-5',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    )
  })

  it('maps SDK tool_use response to tool_calls', async () => {
    const fakeSdk = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [
            { type: 'tool_use', id: 'tu_1', name: 'structured_output', input: { score: 0.7 } },
          ],
          usage: { input_tokens: 5, output_tokens: 3 },
          stop_reason: 'tool_use',
        }),
      },
    }
    const client = new AnthropicLLMClient({ sdkClient: fakeSdk as any })
    const result = await client.complete({
      model: 'claude-sonnet-4-5',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [{ name: 'structured_output', description: 'x', input_schema: {} }],
    })
    expect(result.text).toBe('')
    expect(result.tool_calls).toEqual([{ name: 'structured_output', input: { score: 0.7 } }])
    expect(result.stop_reason).toBe('tool_use')
  })

  it('throws when ANTHROPIC_API_KEY is missing and no sdkClient injected', () => {
    const prev = process.env.ANTHROPIC_API_KEY
    delete process.env.ANTHROPIC_API_KEY
    expect(() => new AnthropicLLMClient()).toThrow(/ANTHROPIC_API_KEY/)
    if (prev) process.env.ANTHROPIC_API_KEY = prev
  })
})
