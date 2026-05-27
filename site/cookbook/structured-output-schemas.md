---
title: Structured output schemas
description: 'Use the agent schema: key to enforce typed JSON output — nested objects, enums, arrays, and AJV validation.'
---

# Structured output schemas

## Problem

An LLM's free-text response is hard to consume programmatically. You want the model to return a specific JSON shape so downstream tool nodes can read typed fields without parsing heuristics.

## Solution

```yaml
graph:
  nodes:
    # ---- Scalar with enum ----
    - id: classify_mood
      kind: agent
      prompt: ./prompts/classify_mood.md
      reads: [text]
      schema:
        type: object
        properties:
          mood:
            type: string
            enum: [positive, negative, neutral]
          confidence:
            type: number
            minimum: 0
            maximum: 1
        required: [mood, confidence]
        additionalProperties: false
      writes: [mood, confidence]

    # ---- Nested object ----
    - id: extract_entity
      kind: agent
      prompt: ./prompts/extract.md
      reads: [text]
      schema:
        type: object
        properties:
          entity:
            type: object
            properties:
              name: { type: string }
              type: { type: string, enum: [person, org, location, product] }
              mentions: { type: integer, minimum: 1 }
            required: [name, type, mentions]
            additionalProperties: false
        required: [entity]
        additionalProperties: false
      writes: [entity]

    # ---- Array of objects ----
    - id: find_issues
      kind: agent
      prompt: ./prompts/find_issues.md
      reads: [diff]
      schema:
        type: object
        properties:
          issues:
            type: array
            minItems: 0
            items:
              type: object
              properties:
                file: { type: string }
                line: { type: integer }
                severity: { type: string, enum: [low, medium, high, critical] }
                description: { type: string }
                fix: { type: string }
              required: [file, severity, description]
              additionalProperties: false
        required: [issues]
        additionalProperties: false
      writes: [issues]

    # ---- Nullable optional field ----
    - id: summarize
      kind: agent
      prompt: ./prompts/summarize.md
      reads: [document]
      schema:
        type: object
        properties:
          summary: { type: string }
          tldr: { type: ['string', 'null'] } # optional one-liner
          word_count: { type: integer }
        required: [summary, word_count]
        additionalProperties: false
      writes: [summary, tldr, word_count]
```

## Walkthrough

The `schema:` key on an `agent` node is a JSON Schema fragment describing the _object the LLM must return_. The runtime injects a `structured_output` tool into the LLM's tool list; the model is instructed to call that tool with the result conforming to the schema. AJV validates the output; if validation fails, the runtime retries the call once, then fails the node.

`additionalProperties: false` is strongly recommended. It catches hallucinated keys — the LLM sometimes invents extra fields not in the spec. Without it, extra fields are silently ignored rather than causing an error.

`enum` on a string property forces the model into a closed vocabulary. The model's tool-calling path sees the schema as a constraint, not just documentation, so it reliably stays within the declared values.

`writes: [mood, confidence]` lists the top-level keys the node commits to state. Only the listed keys are extracted from the schema output and merged into state; the rest are silently discarded. This means the `schema` can describe a richer object than you actually need in state — useful when you want the model to produce intermediate reasoning fields that aren't stored.

For arrays, `minItems: 0` makes an empty array valid — important if you want the model to return "no issues found" rather than hallucinating an issue to satisfy a `minItems: 1` constraint.

## Variations

- **Nullable nested object:** Use `type: ['object', 'null']` to let the model return `null` when the entity isn't found, rather than making up a placeholder.
- **Reuse schemas across nodes:** Extract the schema to a `$defs` section in the YAML and reference it with `$ref` (standard JSON Schema).
- **Strict mode:** Set `additionalProperties: false` recursively on every nested object schema, not just the top level.

## See also

- [Concepts: node-agent](/concepts/node-agent)
- [Reference: YAML schema](/reference/schema)
- [Cookbook: fan-out-with-concurrency](./fan-out-with-concurrency)
