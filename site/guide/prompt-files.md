# Prompt files

Write focused, reusable prompt templates for `agent` and `skill` nodes using `{{placeholder}}` interpolation.

## When you need this

- You have an `agent` node and want the prompt in a versioned file rather than inline YAML.
- You need to reference state values or `for_each` item fields inside the prompt.
- You are writing a `skill` node and need to understand how its SKILL.md body is passed to the LLM.
- You want to pass the same prompt to different models without touching the YAML.

## The minimal example

`examples/review-branch/prompts/review.md`:

```markdown
You are reviewing a code change. You are the **{{$item.key}}** reviewer.

Focus ONLY on {{$item.focus}}. Do NOT report issues outside this scope —
other reviewers handle other dimensions, and out-of-scope findings will be
discarded.

Code under review:

```diff
{{diff}}
```

Return findings via the `structured_output` tool. Each finding needs:

- `title` (≤80 chars, specific)
- `severity` (one of `low`, `medium`, `high`)

If there are no in-scope issues, return `{ "findings": [] }`.
```

Referenced in `experience.yaml`:

```yaml
- id: review
  kind: agent
  prompt: ./prompts/review.md
  for_each:
    source: $.dimensions
  reads: [diff, dimensions]
  writes: [findings]
  schema:
    type: object
    required: [findings]
    properties:
      findings:
        type: array
```

## How it works

`interpolatePrompt` (`packages/core/src/llm/prompt.ts`) scans the template for `{{placeholder}}` tokens using the regex `/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g` and replaces each one with the matching value from the assembled input bundle.

**The value lookup order** — the bundle is a merged view of:

1. `args:` from the YAML node spec (static)
2. `reads:` fields from the SQLite state snapshot
3. `for_each` injections: `$item` (current element), `$index` (0-based)
4. `_edge_inputs` (values forwarded from predecessors via `edge_output`)

If a placeholder has no matching key and `strict` mode is on (the default), an error is thrown at runtime: `Prompt placeholder "{{foo}}" has no value in the input bundle`. In non-strict mode the placeholder is left as-is.

Non-string values are serialized with `JSON.stringify`. Arrays, objects, and numbers are all supported.

## Variations

**Reference a plain state field:**

```markdown
Analyze the following diff:

{{diff}}
```

Node YAML: `reads: [diff]`

**Reference a `for_each` item's sub-fields:**

When `for_each: { source: $.dimensions }` and `dimensions` is an array of objects, each iteration injects `$item`. Use dot notation in the placeholder:

```markdown
You are the **{{$item.key}}** reviewer. Focus on: {{$item.focus}}.
```

::: warning
`{{$item.key}}` is valid — the interpolation engine treats `$item` as a key and resolves `$item.key` by looking up `$item` in the bundle (which is the full object) and then serializing it as JSON if it is not a string. For sub-field access, pass `$item` as JSON and let the LLM parse it, **or** use a preceding `tool` node to pre-project the fields into named state fields that `reads:` can declare.
:::

**Pass static args into the prompt:**

```yaml
- id: classify
  kind: agent
  prompt: ./prompts/classify.md
  args:
    categories: '["bug", "feature", "docs", "question"]'
  writes: [label]
```

```markdown
Classify the following issue into one of these categories: {{categories}}
```

**Use `{{args}}` for the full args object** (non-strict mode):

```markdown
Context: {{args}}
```

::: info
The placeholder name `args` is not special — it is just a key in the bundle. If you pass `args: { foo: bar }` in the YAML, only `{{foo}}` is substituted, not `{{args}}`. Use the individual field names.
:::

**Skill nodes** use the same interpolation: the SKILL.md body becomes the system prompt, and the user message is a JSON-serialized bundle of all input values. There are no explicit `{{}}` tokens in the skill body — the LLM receives the full JSON context and must parse it.

## Gotchas

- **`reads:` is required for state-backed placeholders.** If your prompt uses `{{diff}}` but the node doesn't declare `reads: [diff]`, the interpolation throws at runtime.
- **Placeholder names are case-sensitive.** `{{Diff}}` ≠ `{{diff}}`.
- **File path is relative to `experience.yaml`.** `./prompts/review.md` resolves relative to the experience directory, not the working directory where you run `oe`.
- **The `schema:` key on an `agent` node is for the LLM response**, not the prompt. It is AJV-validated against the parsed `structured_output` tool call result.

## See also

- [Tool stubs in .mjs](/guide/tool-stubs) — the equivalent for deterministic nodes
- [Hand-writing experience.yaml](/guide/authoring-yaml)
- [agent node concept](/concepts/node-agent)
- [review-branch example](/examples/review-branch)
