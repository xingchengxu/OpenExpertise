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
    const client = new AnthropicLLMClient({ sdkClient: fakeSdk as never })
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
    const client = new AnthropicLLMClient({ sdkClient: fakeSdk as never })
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

describe('AnthropicLLMClient — 429 retry', () => {
  it('retries on 429 and succeeds after backoff', async () => {
    let callCount = 0
    const sdkClient = {
      messages: {
        create: async () => {
          callCount++
          if (callCount === 1) {
            const err: Error & { status?: number } = new Error('rate limited')
            err.status = 429
            throw err
          }
          return {
            content: [{ type: 'text', text: 'ok' }],
            usage: { input_tokens: 1, output_tokens: 1 },
            stop_reason: 'end_turn',
          } as never
        },
      },
    }
    const client = new AnthropicLLMClient({
      sdkClient: sdkClient as never,
      retry: { max_attempts: 3, base_ms: 1 },
    })
    const result = await client.complete({
      model: 'm',
      messages: [{ role: 'user', content: 'x' }],
    })
    expect(callCount).toBe(2)
    expect(result.text).toBe('ok')
  })

  it('throws after exhausting retries', async () => {
    let callCount = 0
    const sdkClient = {
      messages: {
        create: async () => {
          callCount++
          const err: Error & { status?: number } = new Error('rate limited')
          err.status = 429
          throw err
        },
      },
    }
    const client = new AnthropicLLMClient({
      sdkClient: sdkClient as never,
      retry: { max_attempts: 3, base_ms: 1 },
    })
    await expect(
      client.complete({ model: 'm', messages: [{ role: 'user', content: 'x' }] }),
    ).rejects.toThrow(/rate limited|429/)
    expect(callCount).toBe(3)
  })

  it('does not retry on non-429 errors', async () => {
    let callCount = 0
    const sdkClient = {
      messages: {
        create: async () => {
          callCount++
          const err: Error & { status?: number } = new Error('internal')
          err.status = 500
          throw err
        },
      },
    }
    const client = new AnthropicLLMClient({
      sdkClient: sdkClient as never,
      retry: { max_attempts: 3, base_ms: 1 },
    })
    await expect(
      client.complete({ model: 'm', messages: [{ role: 'user', content: 'x' }] }),
    ).rejects.toThrow(/internal/)
    expect(callCount).toBe(1)
  })
})
