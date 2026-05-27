# Self-hosted LLMs (vLLM, Ollama, LM Studio)

Point OpenExpertise at any OpenAI-compatible endpoint — no code changes required.

## When you need this

- You are running a model on-premises with vLLM or llama.cpp and want to use it for `agent` nodes.
- You want to use Ollama or LM Studio for local development without an API key.
- You have a private endpoint (internal corporate model, fine-tuned checkpoint) that speaks the OpenAI chat-completions API.
- You are using a reasoning-style model that prefixes its responses with `<think>...</think>` blocks.

## The minimal example

```bash
export OPENAI_API_KEY=anything-the-server-accepts   # many local servers accept any string
export OPENAI_BASE_URL=http://localhost:8000/v1

oe run examples/agent-echo --llm openai
```

That is all. The `OpenAILLMClient` reads `OPENAI_BASE_URL` from the environment and passes it to the OpenAI SDK's `baseURL` option. The SDK sends all requests to that endpoint instead of `api.openai.com`.

## How it works

`packages/llm-openai/src/client.ts` constructs an `OpenAI` SDK instance using the standard environment variables:

```
OPENAI_API_KEY  →  apiKey
OPENAI_BASE_URL →  baseURL (passed through the OpenAI SDK)
```

Because the OpenAI SDK honors `OPENAI_BASE_URL` directly, any server that implements the `/v1/chat/completions` endpoint works — vLLM, Ollama's OpenAI-compatibility layer, LM Studio's local server, llama.cpp server, or any internal endpoint.

**`<think>` block stripping** — reasoning-style models (DeepSeek-R1, Qwen QwQ, some vLLM-served models) sometimes prefix tool-call argument strings with a `<think>...</think>` block before the actual JSON. The `parseArguments` method in `OpenAILLMClient` automatically strips this prefix before calling `JSON.parse`:

```ts
const stripped = raw.replace(/^\s*<think>[\s\S]*?<\/think>\s*/, '')
```

This means structured-output tool calls work correctly even with reasoning models that expose their chain-of-thought.

## Variations

**vLLM:**

```bash
# Start the server (example with Mistral-7B)
python -m vllm.entrypoints.openai.api_server \
  --model mistralai/Mistral-7B-Instruct-v0.2 \
  --port 8000

export OPENAI_API_KEY=not-needed
export OPENAI_BASE_URL=http://localhost:8000/v1
oe run examples/review-branch --llm openai
```

**Ollama:**

```bash
ollama pull llama3.2
# Ollama exposes OpenAI-compatible API at port 11434 by default
export OPENAI_API_KEY=ollama
export OPENAI_BASE_URL=http://localhost:11434/v1
oe run examples/agent-echo --llm openai
```

**LM Studio:**

```bash
# Start LM Studio's local server (Settings > Local Server > Start)
export OPENAI_API_KEY=lm-studio
export OPENAI_BASE_URL=http://localhost:1234/v1
oe run examples/agent-echo --llm openai
```

**Specify the model name** to use whatever name your server expects:

```yaml
- id: analyze
  kind: agent
  prompt: ./prompts/analyze.md
  model: mistral-7b-instruct # or whatever your endpoint calls it
  writes: [analysis]
```

The `model` field is passed directly to the `model` parameter of the chat-completions request.

**Remote private endpoint:**

```bash
export OPENAI_API_KEY=your-internal-token
export OPENAI_BASE_URL=https://llm.internal.example.com/v1
oe run examples/oncall-runbook --llm openai
```

## Gotchas

- **`--llm openai` is required.** Without it, OpenExpertise auto-detects the provider from env. If `ANTHROPIC_API_KEY` is also set, Anthropic takes precedence. Pass `--llm openai` explicitly to force the OpenAI client.
- **Tool use compatibility varies by server.** `agent` nodes use the `structured_output` tool. Not all vLLM / Ollama model backends support function calling reliably. Test with a simple `agent-echo` first.
- **`<think>` stripping only applies to tool-call argument strings.** Free-text `agent` responses (without `schema:`) are returned as-is, including any `<think>` blocks. If you use a reasoning model for a free-text agent node, you may need to post-process the output in a downstream `tool` node.
- **The Anthropic client (`--llm anthropic`) does not support `OPENAI_BASE_URL`.** Self-hosting only works with the OpenAI-compatible client.

## See also

- [Run with an LLM](/guide/run-with-llm)
- [cli-agent node](/guide/cli-agent-usage) — for routing steps to Claude Code, Codex, or Gemini CLI instead of the SDK
- [LLMClient API](/reference/api/llm-client)
