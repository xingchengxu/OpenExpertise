---
title: Hybrid LLM routing
description: Use Anthropic for some agent nodes and OpenAI (or a compatible provider) for others, routed via runtime.providers.
---

# Hybrid LLM routing

## Problem

Different tasks have different cost/quality trade-offs. You want frontier-model quality for the final synthesis but a cheaper or faster model for bulk classification passes. Or you want to compare providers on the same task. Or your org already runs a self-hosted vLLM for non-sensitive tasks and only sends sensitive data to Anthropic.

## Solution

```yaml
# experience.yaml
meta:
  runtime:
    providers:
      # Default: Anthropic for untagged agent nodes
      default: anthropic

      # Named provider alias for OpenAI-protocol models
      fast:
        kind: openai
        model: gpt-4o-mini
        base_url: '{{$env.OPENAI_BASE_URL}}' # override for vLLM / Together AI / Groq
        api_key: '{{$env.OPENAI_API_KEY}}'

      # Another alias for a self-hosted model
      local:
        kind: openai
        model: meta-llama/Meta-Llama-3.1-8B-Instruct
        base_url: 'http://localhost:8000/v1'
        api_key: 'not-used'

state:
  schema:
    items: { type: array, items: { type: object }, merge: set_once }
    classified: { type: array, items: { type: object }, merge: array_append }
    synthesis: { type: string }

graph:
  nodes:
    - id: load_items
      kind: tool
      impl: ./tools/load.mjs
      writes: [items]

    # Bulk classification — cheap model, runs in parallel
    - id: classify
      kind: agent
      provider: fast # ← uses the 'fast' alias above
      prompt: ./prompts/classify.md
      reads: [items]
      for_each:
        source: $.items
        concurrency: 8
      schema:
        type: object
        properties:
          classified:
            type: array
            items: { type: object }
        required: [classified]
      writes: [classified]

    # Final synthesis — frontier model, runs once
    - id: synthesize
      kind: agent
      # provider: anthropic is implicit (default)
      prompt: ./prompts/synthesize.md
      reads: [classified]
      schema:
        type: object
        properties:
          synthesis: { type: string }
        required: [synthesis]
        additionalProperties: false
      writes: [synthesis]

  edges:
    - { from: load_items, to: classify }
    - { from: classify, to: synthesize }
```

```bash
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-ant-...
# For local vLLM: export OPENAI_BASE_URL=http://localhost:8000/v1
oe run experience.yaml
```

## Walkthrough

`meta.runtime.providers` is a map of provider aliases. The special key `default` sets which provider is used for `agent` nodes that don't specify a `provider:` key. Any other key is an alias you choose; reference it with `provider: <alias>` on any agent node.

The `kind` inside a provider definition is either `anthropic` (the default SDK) or `openai` (the `@openexpertise/llm-openai` adapter). Any model speaking the OpenAI chat-completions API works with `kind: openai` — Azure OpenAI, Together AI, Groq, Fireworks, self-hosted vLLM, Ollama, LM Studio.

<div v-pre>

`base_url` and `api_key` support `{{$env.VAR}}` interpolation so secrets never live in YAML. If `base_url` is omitted, the OpenAI adapter uses `https://api.openai.com/v1`.

</div>

The `classify` node with `provider: fast` runs 8 items in parallel using the cheap model. The `synthesize` node with no explicit provider falls back to `default: anthropic`, getting frontier-model quality for the one call that matters most.

## Variations

- **A/B test providers:** Run the same experience twice with different `default` values by using `--set meta.runtime.providers.default=fast` on the CLI. Compare outputs with `oe diff <run-id-a> <run-id-b>`.
- **Per-environment routing:** Keep a `providers-prod.yaml` and `providers-dev.yaml` and compose them with `oe run --config providers-dev.yaml`.
- **Cost logging:** Every `node.tokens` event in the event log includes `provider`, `model`, `input_tokens`, and `output_tokens`. Aggregate with `oe inspect <run-id>` or the programmatic EventBus.

## See also

- [Guide: Self-hosted LLMs (vLLM, Ollama)](/guide/self-hosted-llm)
- [Reference: YAML schema](/reference/schema)
- [Concepts: Dispatchers](/concepts/dispatchers)
- [Cookbook: fan-out-with-concurrency](./fan-out-with-concurrency)
