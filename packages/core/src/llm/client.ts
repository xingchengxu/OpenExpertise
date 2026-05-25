// LLMClient is the abstraction the LLM-backed dispatchers (agent, skill) call.
// Real impl lives in @openexpertise/node-kinds-agent (AnthropicLLMClient).
// Tests inject fake clients with canned responses.

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
