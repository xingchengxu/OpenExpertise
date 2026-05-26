---
title: LLMClient
---

# `LLMClient`

The provider-neutral abstraction that LLM-backed dispatchers (`agent`, `skill`) use to send completions. Real implementations live in `@openexpertise/node-kinds-agent` and `@openexpertise/llm-openai`; tests inject fake clients with canned responses.

## Import

```ts
import type { LLMClient } from '@openexpertise/core'
```

## Signature

```ts
export interface LLMMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface LLMTool {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

export interface LLMCompleteOpts {
  model: string
  system?: string
  messages: LLMMessage[]
  tools?: LLMTool[]
  max_tokens?: number
}

export interface LLMToolCall {
  name: string
  input: unknown
}

export interface LLMUsage {
  input_tokens: number
  output_tokens: number
}

export interface LLMCompleteResult {
  text: string
  tool_calls?: LLMToolCall[]
  usage?: LLMUsage
  stop_reason?: string
}

export interface LLMClient {
  complete(opts: LLMCompleteOpts): Promise<LLMCompleteResult>
}
```

## `complete` parameters

| Name         | Type           | Required | Description                                                                                          |
| ------------ | -------------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `model`      | `string`       | ✓        | Model identifier string, passed verbatim to the provider (e.g. `"claude-sonnet-4-6"`, `"gpt-4o"`).   |
| `messages`   | `LLMMessage[]` | ✓        | Conversation turns. Each turn has a `role` (`'user'` or `'assistant'`) and a `content` string.       |
| `system`     | `string`       | —        | System prompt sent before the message list.                                                          |
| `tools`      | `LLMTool[]`    | —        | Tool definitions to expose. Each tool has a `name`, `description`, and a JSON Schema `input_schema`. |
| `max_tokens` | `number`       | —        | Maximum tokens in the completion. Defaults to `4096` in most implementations.                        |

## `complete` return type

| Field         | Type            | Description                                                                                                               |
| ------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `text`        | `string`        | Concatenated text content of all `text`-type blocks in the response. May be empty when the model only returns tool calls. |
| `tool_calls`  | `LLMToolCall[]` | Tool invocations requested by the model. Present only when the model returned at least one tool call.                     |
| `usage`       | `LLMUsage`      | Token counts for the request. Present when the provider reports usage.                                                    |
| `stop_reason` | `string`        | Provider-specific stop reason string (e.g. `"end_turn"`, `"tool_use"`, `"stop"`).                                         |

## Provided implementations

### `AnthropicLLMClient` (`@openexpertise/node-kinds-agent`)

```ts
import { AnthropicLLMClient } from '@openexpertise/node-kinds-agent'

const client = new AnthropicLLMClient({
  apiKey: process.env.ANTHROPIC_API_KEY, // falls back to env var if omitted
  retry: { max_attempts: 4, base_ms: 1000 }, // exponential back-off on 429
})
```

Reads `ANTHROPIC_API_KEY` from the environment when `apiKey` is not supplied. Retries up to `max_attempts` times with exponential back-off on HTTP 429 / `RateLimitError`. Uses the `@anthropic-ai/sdk` under the hood.

### `OpenAILLMClient` (`@openexpertise/llm-openai`)

```ts
import { OpenAILLMClient } from '@openexpertise/llm-openai'

const client = new OpenAILLMClient({
  apiKey: process.env.OPENAI_API_KEY,
  retry: { max_attempts: 4, base_ms: 1000 },
})
```

Compatible with any OpenAI-format endpoint (OpenAI, Azure OpenAI, vLLM, Ollama). Strips `<think>…</think>` prefixes from tool-call argument strings before JSON parsing — a quirk of some reasoning-mode servers. See [Self-hosted LLMs](/guide/self-hosted-llm) for vLLM / Ollama setup.

## Writing your own implementation

Any object that satisfies the `LLMClient` interface is acceptable:

```ts
import type { LLMClient, LLMCompleteOpts, LLMCompleteResult } from '@openexpertise/core'

class MyClient implements LLMClient {
  async complete(opts: LLMCompleteOpts): Promise<LLMCompleteResult> {
    // call your provider's API
    return { text: 'hello from my provider' }
  }
}
```

Inject it wherever a dispatcher that needs an `LLMClient` is constructed:

```ts
import { AgentDispatcher } from '@openexpertise/node-kinds-agent'
import { SkillDispatcher } from '@openexpertise/node-kinds-skill'

dispatchers.register(new AgentDispatcher({ client: new MyClient() }))
dispatchers.register(new SkillDispatcher({ client: new MyClient() }))
```

## Behavior notes

**Tool routing.** `AnthropicLLMClient` and `OpenAILLMClient` both force tool use when exactly one tool is provided (Anthropic: `tool_choice: { type: 'tool' }`; OpenAI: `tool_choice: { type: 'function', function: { name } }`). This is how `EvolutionAdvisor` and `UltraExpertise` guarantee structured output.

**Retry.** Both built-in clients retry on 429 with exponential back-off: delay = `base_ms * 2^(attempt-1)`. The attempt counter starts at 1. At `max_attempts` the error is re-thrown.

**Error transparency.** Errors from the underlying SDK (network failure, 500, auth failure) are not wrapped — they propagate as-is so that the node's `on_error` policy can handle them.

## Source

[packages/core/src/llm/client.ts](https://github.com/xingchengxu/OpenExpertise/blob/main/packages/core/src/llm/client.ts)
