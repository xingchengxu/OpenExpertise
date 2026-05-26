import { describe, it, expect } from 'vitest'
import { OpenAILLMClient } from '../src/index.js'

let lastReq: unknown

function fakeSdk(scripted: unknown) {
  return {
    chat: {
      completions: {
        create: async (req: unknown) => {
          lastReq = req
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
    expect(lastReq).toMatchObject({
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
    const req = lastReq as Record<string, unknown>
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
    expect((lastReq as Record<string, unknown>).tool_choice).toBe('required')
  })
})

describe('OpenAILLMClient — edge cases', () => {
  it('returns empty result.tool_calls when no function call in response', async () => {
    const sdk = fakeSdk({
      choices: [{ message: { content: 'just talking', tool_calls: [] }, finish_reason: 'stop' }],
    })
    const client = new OpenAILLMClient({ sdkClient: sdk as never })
    const result = await client.complete({
      model: 'gpt-4o-2024-11-20',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [{ name: 't', description: '', input_schema: {} }],
    })
    expect(result.text).toBe('just talking')
    expect(result.tool_calls).toBeUndefined()
    expect(result.stop_reason).toBe('stop')
  })

  it('falls back to raw string when function.arguments is not valid JSON', async () => {
    const sdk = fakeSdk({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              {
                id: '1',
                type: 'function',
                function: { name: 'x', arguments: '{not valid json' },
              },
            ],
          },
        },
      ],
    })
    const client = new OpenAILLMClient({ sdkClient: sdk as never })
    const result = await client.complete({
      model: 'gpt-4o-2024-11-20',
      messages: [{ role: 'user', content: 'x' }],
      tools: [{ name: 'x', description: '', input_schema: {} }],
    })
    expect(result.tool_calls).toEqual([{ name: 'x', input: { _raw: '{not valid json' } }])
  })

  it('honors max_tokens override', async () => {
    const sdk = fakeSdk({ choices: [{ message: { content: 'ok' } }] })
    const client = new OpenAILLMClient({ sdkClient: sdk as never })
    await client.complete({
      model: 'gpt-4o-2024-11-20',
      messages: [{ role: 'user', content: 'x' }],
      max_tokens: 100,
    })
    expect((lastReq as Record<string, unknown>).max_tokens).toBe(100)
  })
})

describe('OpenAILLMClient — 429 retry', () => {
  it('retries on 429 and succeeds', async () => {
    let callCount = 0
    const sdkClient = {
      chat: {
        completions: {
          create: async () => {
            callCount++
            if (callCount === 1) {
              const err: Error & { status?: number } = new Error('rate limited')
              err.status = 429
              throw err
            }
            return {
              choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
              usage: { prompt_tokens: 1, completion_tokens: 1 },
            } as never
          },
        },
      },
    }
    const client = new OpenAILLMClient({
      sdkClient: sdkClient as never,
      retry: { max_attempts: 3, base_ms: 1 },
    })
    const result = await client.complete({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'x' }],
    })
    expect(callCount).toBe(2)
    expect(result.text).toBe('ok')
  })

  it('exhausts retries then throws', async () => {
    let callCount = 0
    const sdkClient = {
      chat: {
        completions: {
          create: async () => {
            callCount++
            const err: Error & { status?: number } = new Error('rate limited')
            err.status = 429
            throw err
          },
        },
      },
    }
    const client = new OpenAILLMClient({
      sdkClient: sdkClient as never,
      retry: { max_attempts: 3, base_ms: 1 },
    })
    await expect(
      client.complete({ model: 'gpt-4o', messages: [{ role: 'user', content: 'x' }] }),
    ).rejects.toThrow(/rate limited|429/)
    expect(callCount).toBe(3)
  })

  it('does not retry on non-429', async () => {
    let callCount = 0
    const sdkClient = {
      chat: {
        completions: {
          create: async () => {
            callCount++
            const err: Error & { status?: number } = new Error('bad request')
            err.status = 400
            throw err
          },
        },
      },
    }
    const client = new OpenAILLMClient({
      sdkClient: sdkClient as never,
      retry: { max_attempts: 3, base_ms: 1 },
    })
    await expect(
      client.complete({ model: 'gpt-4o', messages: [{ role: 'user', content: 'x' }] }),
    ).rejects.toThrow(/bad request/)
    expect(callCount).toBe(1)
  })
})

describe('OpenAILLMClient — reasoning-prefixed tool arguments', () => {
  it('strips a leading <think>...</think> block from function.arguments before parsing', async () => {
    // Observed against vLLM-served minimax: the tool-call arguments string is
    // prefixed with a think-block before the actual JSON.
    const sdk = fakeSdk({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              {
                id: 't1',
                type: 'function',
                function: {
                  name: 'structured_output',
                  arguments:
                    '<think>The user wants findings.\nLet me identify them.</think>\n{"findings":[{"title":"x","severity":"high"}]}',
                },
              },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
    })
    const client = new OpenAILLMClient({ sdkClient: sdk as never })
    const result = await client.complete({
      model: 'm',
      messages: [{ role: 'user', content: 'x' }],
      tools: [{ name: 'structured_output', description: '', input_schema: {} }],
    })
    expect(result.tool_calls).toEqual([
      { name: 'structured_output', input: { findings: [{ title: 'x', severity: 'high' }] } },
    ])
  })

  it('still falls back to { _raw } when stripping does not yield valid JSON', async () => {
    const sdk = fakeSdk({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              {
                id: 't1',
                type: 'function',
                function: { name: 'structured_output', arguments: 'not json at all' },
              },
            ],
          },
        },
      ],
    })
    const client = new OpenAILLMClient({ sdkClient: sdk as never })
    const result = await client.complete({
      model: 'm',
      messages: [{ role: 'user', content: 'x' }],
      tools: [{ name: 'structured_output', description: '', input_schema: {} }],
    })
    expect(result.tool_calls).toEqual([
      { name: 'structured_output', input: { _raw: 'not json at all' } },
    ])
  })
})
