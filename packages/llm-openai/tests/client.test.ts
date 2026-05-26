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

describe('OpenAILLMClient — tool round-trip', () => {
  it('maps LLMTool[] to OpenAI tools and forces tool_choice when exactly one tool', async () => {
    const sdk = fakeSdk({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              {
                id: 'call_1',
                type: 'function',
                function: { name: 'structured_output', arguments: '{"x":42}' },
              },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
    })
    const client = new OpenAILLMClient({ sdkClient: sdk as never })

    const result = await client.complete({
      model: 'gpt-4o-2024-11-20',
      messages: [{ role: 'user', content: 'give me x' }],
      tools: [
        {
          name: 'structured_output',
          description: 'return structured data',
          input_schema: { type: 'object', properties: { x: { type: 'number' } } },
        },
      ],
    })

    expect(result.tool_calls).toEqual([{ name: 'structured_output', input: { x: 42 } }])
    expect(result.stop_reason).toBe('tool_calls')
    const req: any = (fakeSdk as any).lastReq
    expect(req.tools).toEqual([
      {
        type: 'function',
        function: {
          name: 'structured_output',
          description: 'return structured data',
          parameters: { type: 'object', properties: { x: { type: 'number' } } },
        },
      },
    ])
    expect(req.tool_choice).toEqual({
      type: 'function',
      function: { name: 'structured_output' },
    })
  })

  it("uses tool_choice 'required' when multiple tools given", async () => {
    const sdk = fakeSdk({ choices: [{ message: { content: '', tool_calls: [] } }] })
    const client = new OpenAILLMClient({ sdkClient: sdk as never })
    await client.complete({
      model: 'gpt-4o-2024-11-20',
      messages: [{ role: 'user', content: 'x' }],
      tools: [
        { name: 'a', description: '', input_schema: {} },
        { name: 'b', description: '', input_schema: {} },
      ],
    })
    expect((fakeSdk as any).lastReq.tool_choice).toBe('required')
  })
})
