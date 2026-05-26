# `agent` node

An agent node makes a single LLM call with a prompt template and writes the result to state. It is the primary LLM primitive in OpenExpertise: use it for free-form generation (text mode) or validated structured output (schema mode).

---

## When to use it

- Any step where you need LLM judgment: review a diff, classify text, generate a summary, produce a risk score.
- Multi-field structured output: ask the model to return a JSON object matching a schema, validated by AJV before it touches state.
- Fan-out review: run the same agent once per item in a list (dimensions, issues, candidates) via `for_each`.
- When you need provider flexibility: swap Anthropic for OpenAI without changing the YAML, just `--llm openai`.

::: tip Use `schema:` for anything beyond one field
Text mode requires exactly one `writes:` field. For two or more output fields, define a `schema:` — the dispatcher uses the `structured_output` tool and validates before writing.
:::

---

## YAML fields

| Field      | Required | Type            | Description                                                                                         |
| ---------- | -------- | --------------- | --------------------------------------------------------------------------------------------------- |
| `id`       | yes      | string          | Unique node identifier.                                                                             |
| `kind`     | yes      | `"agent"`       | Must be the literal string `"agent"`.                                                               |
| `prompt`   | yes      | string          | Path to a `.md` prompt template, relative to `experience.yaml`. Supports `{{field}}` interpolation. |
| `model`    | no       | string          | Override the LLM model (e.g. `claude-opus-4-7`, `gpt-4o-2024-11-20`). Default: `claude-sonnet-4-5`. |
| `schema`   | no       | object          | JSON Schema object. When set, enables structured-output mode via the `structured_output` tool.      |
| `reads`    | no       | string[]        | State fields made available for prompt interpolation.                                               |
| `writes`   | no       | string[]        | State fields this node writes. Must be declared in `state.schema`.                                  |
| `args`     | no       | object          | Static values merged into the interpolation context.                                                |
| `phase`    | no       | string          | Phase grouping.                                                                                     |
| `on_error` | no       | `ErrorPolicy`   | `skip` \| `fail_run` \| `retry`.                                                                    |
| `for_each` | no       | `ForEachClause` | Fan-out across a state array.                                                                       |

---

## The implementation contract

### Prompt template

The `prompt:` field points to a Markdown file. The dispatcher reads the file and calls `interpolatePrompt()` with the merged context `{ ...state_view, ...edge_inputs, ...args }`. Variables are referenced as `{{field_name}}`.

````markdown
<!-- prompts/review.md -->

You are the **{{$item.key}}** reviewer. Focus on {{$item.focus}}.

Code under review:

```diff
{{diff}}
```
````

Return findings via the `structured_output` tool.

````

Unresolved placeholders (variables present in the template but absent from the context) are left as-is in tolerant mode (the default). They do not cause an error.

### Structured-output mode (schema present)

When `schema:` is set, the dispatcher:

1. Sends the schema as an LLM tool definition named `structured_output`.
2. Expects the model to respond with a `tool_use` block calling `structured_output`.
3. Extracts `call.input` and validates it against the schema using AJV (`allErrors: true`).
4. On validation success: uses `call.input` as `state_delta`.
5. On validation failure: throws with the AJV error messages.

```typescript
// Internal flow (from packages/node-kinds-agent/src/agent-dispatcher.ts)
const tool: LLMTool = {
  name: 'structured_output',
  description: 'Return the agent result as a structured object matching the schema',
  input_schema: spec.schema,
}
completeOpts.tools = [tool]
// ...
const call = result.tool_calls?.find((c) => c.name === 'structured_output')
// AJV validates call.input before it becomes state_delta
````

### Text mode (no schema)

Without `schema:`, the dispatcher maps the model's text response to the single `writes:` field. Exactly one write field must be declared.

```typescript
// text mode: writes[0] receives the full model text
stateDelta = { [writes[0]]: result.text }
```

### Retry on 429

Both `AnthropicLLMClient` and `OpenAILLMClient` implement exponential backoff with 4 attempts (base 1 s, doubles each retry). This is transparent to the YAML author. For additional retry behavior, use `on_error: { policy: retry }` at the node level.

---

## Full working example

Source: [`examples/agent-echo/`](/examples/agent-echo)

```yaml
# experience.yaml
name: agent-echo
version: 0.1.0

state:
  schema:
    name: { type: string }
    greeting: { type: string }

graph:
  nodes:
    - id: greet
      kind: agent
      prompt: ./prompts/echo.md
      args:
        name: World
      writes: [greeting]
  edges: []
```

```markdown
<!-- prompts/echo.md -->

Say a friendly hello to {{name}}. Keep it short — one sentence.
```

```bash
node packages/cli/dist/bin.js run examples/agent-echo
# finalState: { greeting: "Hello, World! ..." }
```

More complex example with structured output — the `bug_review` node from `examples/review-branch`:

```yaml
- id: bug_review
  kind: agent
  phase: review
  prompt: ./prompts/review.md
  reads: [diff]
  schema:
    type: object
    required: [findings]
    properties:
      findings:
        type: array
        items:
          type: object
          required: [title, severity]
          properties:
            title: { type: string }
            severity: { type: string }
  for_each: { source: $.dimensions }
  writes: [findings]
```

---

## Variations

### Single-field text output

No schema needed — the full model response goes into one state field:

```yaml
- id: summarize
  kind: agent
  prompt: ./prompts/summarize.md
  reads: [article]
  writes: [summary]
```

### Multi-field structured output

Use `schema:` to get a validated object with multiple keys. All schema keys are written to state in one atomic operation:

```yaml
- id: classify
  kind: agent
  prompt: ./prompts/classify.md
  reads: [ticket]
  schema:
    type: object
    required: [category, priority, sentiment]
    properties:
      category: { type: string }
      priority: { type: string, enum: [low, medium, high] }
      sentiment: { type: string }
  writes: [category, priority, sentiment]
```

### `for_each` fan-out with `merge: array_append`

Run the agent once per dimension and accumulate results:

```yaml
state:
  schema:
    findings: { type: array, items: { type: object }, merge: array_append }

graph:
  nodes:
    - id: review
      kind: agent
      prompt: ./prompts/review.md
      for_each: { source: $.dimensions }
      schema:
        type: object
        required: [findings]
        properties:
          findings: { type: array, items: { type: object } }
      writes: [findings]
```

Each iteration appends its `findings` array to the shared `findings` field.

### With a custom model

Override the model per-node without touching the CLI flags:

```yaml
- id: deep_analysis
  kind: agent
  model: claude-opus-4-7
  prompt: ./prompts/deep_analysis.md
  reads: [codebase_summary]
  writes: [architecture_review]
```

### With `on_error: skip`

Allow the run to continue if a non-critical agent fails:

```yaml
- id: optional_enrichment
  kind: agent
  prompt: ./prompts/enrich.md
  on_error: { policy: skip }
  writes: [enriched_data]
```

---

## Gotchas

1. **Text mode requires exactly one `writes:` field** — If you declare two or more fields without a `schema:`, the dispatcher throws. Either add a schema or split the node.

2. **The schema must be a JSON Schema object, not a path** — Unlike `prompt:`, the `schema:` field is an inline object. Do not put a file path there.

3. **AJV validates `additionalProperties` strictly only if you declare it** — By default, AJV in `strict: false` mode passes extra keys through. If the model returns extra fields and you don't want them in state, add `additionalProperties: false` to the schema.

4. **The `structured_output` tool name is reserved** — Do not name any custom tool `structured_output` in agent prompts; it is used internally by the dispatcher.

5. **Model default is `claude-sonnet-4-5`** — If you rely on a newer model, set `model:` explicitly in YAML or you may get unexpected behavior when the default changes in a future release.

---

## See also

- [Guide: Prompt files](/guide/prompt-files)
- [Guide: Run with an LLM](/guide/run-with-llm)
- [The 6 node kinds](/concepts/node-kinds)
- [Concepts: State (SQLite blackboard)](/concepts/state)
- [Examples: agent-echo](/examples/agent-echo)
- [Examples: review-branch](/examples/review-branch)
