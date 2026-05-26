# Run with an LLM

Now we'll add an `agent` node — a node backed by an LLM with **structured output**. The LLM only fills the gaps inside the node; the graph still runs the same way every time.

## What's an `agent` node?

A node of kind `agent` calls an LLM with:

- a **system prompt** (loaded from a `.md` file you author)
- a **user message** built from your declared `reads:` + `args:`
- a **`structured_output` tool** whose schema you specify inline

The LLM is constrained to call that one tool. Its arguments are AJV-validated and written into state. If the LLM ignores the tool, or returns invalid JSON, the node fails (and the `on_error` policy applies — see [Error policies](/guide/on-error)).

## Set up an API key

OpenExpertise auto-detects from the environment:

```bash
export ANTHROPIC_API_KEY=sk-ant-...       # uses Anthropic Claude
# or
export OPENAI_API_KEY=sk-...              # uses OpenAI GPT
# or
export OPENAI_API_KEY=anything
export OPENAI_BASE_URL=http://localhost:8000/v1   # vLLM / Ollama / your own
```

Pick the provider explicitly with `oe run --llm anthropic|openai`. When both env vars are set, default is Anthropic.

## Add an agent node

Building on the `my-first-flow` from the [previous guide](/guide/first-experience), let's add a node that classifies the quote's mood.

### experience.yaml

```yaml
name: my-first-flow
version: 0.1.0

state:
  schema:
    quote: { type: string }
    decorated: { type: string }
    mood: { type: object }

graph:
  nodes:
    - id: fetch_quote
      kind: tool
      impl: ./tools/fetch_quote.mjs
      writes: [quote]

    - id: classify_mood
      kind: agent
      prompt: ./prompts/classify_mood.md
      reads: [quote]
      schema:
        type: object
        required: [mood]
        properties:
          mood:
            type: object
            required: [label, confidence]
            properties:
              label:
                type: string
                enum: [optimistic, pragmatic, somber, neutral]
              confidence:
                type: number
                minimum: 0
                maximum: 1
              reason: { type: string }
      writes: [mood]

    - id: print_quote
      kind: tool
      impl: ./tools/print_quote.mjs
      reads: [quote, mood]
      writes: [decorated]

  edges:
    - { from: fetch_quote, to: classify_mood }
    - { from: classify_mood, to: print_quote }
```

### prompts/classify_mood.md

```markdown
You classify literary quotes by mood.

Quote:

> {{quote}}

Return your answer via the `structured_output` tool. The `mood.label` must be
exactly one of: `optimistic`, `pragmatic`, `somber`, `neutral`. Include a
`confidence` between 0 and 1 and a short `reason` (≤80 chars).

Don't add any prose outside the tool call.
```

Placeholders like `{{quote}}` are filled from `reads:`. There's a small templating layer; see [Prompt files](/guide/prompt-files).

### Update tools/print_quote.mjs

```js
export default async function printQuote(input) {
  const { quote, mood } = input._state
  const tag = mood?.label ?? 'unknown'
  return { state_delta: { decorated: `«  ${quote}  »  [mood: ${tag}]` } }
}
```

## Run

```bash
node $OE run .
```

Expected (your mood label may vary):

```
ⓘ run-... finished
  finalState: {
    "quote": "Make it work, make it right, make it fast.",
    "mood": {
      "label": "pragmatic",
      "confidence": 0.92,
      "reason": "Iterative engineering ethos"
    },
    "decorated": "«  Make it work, make it right, make it fast.  »  [mood: pragmatic]"
  }
```

## Why structured output, not free text?

Three reasons free text is a footgun for SOPs:

1. **Downstream tools need fields.** `print_quote` reads `mood.label`. If the agent emits free prose, you'd need a parser, and prompts drift.
2. **AJV validates at write time.** If the LLM returns `{ mood: { label: 'happy' } }`, the validator rejects it (`happy` isn't in the enum). The node fails. Better fail loud than silently corrupt state.
3. **Caching.** When the node's inputs + prompt + schema are unchanged, the cache returns the same structured output — no LLM call. See [Resume + cache](/guide/resume-cache).

## What models are wired in?

| Provider                                                          | Default model        | Override                              |
| ----------------------------------------------------------------- | -------------------- | ------------------------------------- |
| Anthropic                                                         | `claude-sonnet-4-6`  | per-node `model:` field, or `--model` |
| OpenAI (and any OpenAI-compatible endpoint via `OPENAI_BASE_URL`) | `gpt-4o-2024-11-20`  | same                                  |

The retry policy is automatic — both clients catch HTTP 429 and back off exponentially up to 4 attempts. Tune via constructor opts when calling the API directly, or rely on the defaults from the CLI.

## See it in TUI

```bash
node $OE run . --tui
```

Watch the activity strings switch (`calling claude-sonnet-4-6` → `validating structured output`) and the per-node token count tick up. Full guide: [The TUI dashboard](/guide/tui).

→ Continue with [The TUI dashboard](/guide/tui).
