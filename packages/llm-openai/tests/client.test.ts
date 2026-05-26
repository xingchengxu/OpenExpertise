import { describe, it, expect } from 'vitest'
import { OpenAILLMClient } from '../src/index.js'

function fakeSdk(scripted: unknown) {
  return {
    chat: {
      completions: {
        create: async (req: unknown) => {
          ;(fakeSdk as any).lastReq = req
          return scripted as never
        },
      },
    },
  }
}

describe('OpenAILLMClient — text only', () => {
  it('maps messages and system into an OpenAI chat-completions request', async () => {
    const sdk = fakeSdk({
      choices: [{ message: { role: 'assistant', content: 'hi there', tool_calls: undefined } }],
      usage: { prompt_tokens: 7, completion_tokens: 3 },
    })
    const client = new OpenAILLMClient({ sdkClient: sdk as never })

    const result = await client.complete({
      model: 'gpt-4o-2024-11-20',
      system: 'be terse',
      messages: [{ role: 'user', content: 'hello' }],
    })

    expect(result.text).toBe('hi there')
    expect(result.tool_calls).toBeUndefined()
    expect(result.usage).toEqual({ input_tokens: 7, output_tokens: 3 })
    expect((fakeSdk as any).lastReq).toMatchObject({
      model: 'gpt-4o-2024-11-20',
      messages: [
        { role: 'system', content: 'be terse' },
        { role: 'user', content: 'hello' },
      ],
    })
  })

  it('throws when no API key and no sdkClient injected', () => {
    const prev = process.env.OPENAI_API_KEY
    delete process.env.OPENAI_API_KEY
    expect(() => new OpenAILLMClient()).toThrow(/OPENAI_API_KEY/)
    if (prev !== undefined) process.env.OPENAI_API_KEY = prev
  })
})
