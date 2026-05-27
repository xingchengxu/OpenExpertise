# `skill` node

A skill node invokes an LLM with a SKILL.md package as the system prompt. Skills are reusable, named LLM capabilities — think of them as prompt libraries that live in their own directory and can be shared across experiences.

---

## When to use it

- You have a well-defined LLM task that you want to reuse across multiple experiences (e.g. "classify intent", "write a commit message", "format findings as Markdown").
- You want to package an LLM capability in the Claude Code skill format so it can be used both from `oe` and from inside a Claude Code session.
- You want a human-readable, version-controlled prompt system with frontmatter metadata.
- You have an existing SKILL.md from the Claude Code superpowers library and want to run it as a graph node.

::: info Skill vs Agent
The main difference from `agent` is loading: a `skill` node reads a SKILL.md directory (with frontmatter) as its system prompt, while an `agent` node reads a plain `.md` file as a user prompt. Skills are system-level context; agents are user-level instructions.
:::

---

## YAML fields

| Field      | Required | Type            | Description                                                                             |
| ---------- | -------- | --------------- | --------------------------------------------------------------------------------------- |
| `id`       | yes      | string          | Unique node identifier.                                                                 |
| `kind`     | yes      | `"skill"`       | Must be the literal string `"skill"`.                                                   |
| `impl`     | yes      | string          | Path to a directory containing `SKILL.md`, relative to `experience.yaml`.               |
| `model`    | no       | string          | Override the LLM model. Default: `claude-sonnet-4-5`.                                   |
| `inputs`   | no       | object          | Static values merged into the input payload alongside state.                            |
| `reads`    | no       | string[]        | State fields to include in the input payload.                                           |
| `writes`   | no       | string[]        | Must be exactly one field in V1. The full model text response is written to this field. |
| `phase`    | no       | string          | Phase grouping.                                                                         |
| `on_error` | no       | `ErrorPolicy`   | `skip` \| `fail_run` \| `retry`.                                                        |
| `for_each` | no       | `ForEachClause` | Fan-out across a state array.                                                           |

---

## The SKILL.md format

A skill is a directory containing at least `SKILL.md`. The file uses YAML frontmatter followed by a Markdown body:

```markdown
---
name: my-skill
description: >-
  One sentence that tells an LLM (or a human) when to invoke this skill.
  Used by Claude Code's skill selection system and by `oe`'s TUI.
---

# My Skill

The instructions for the LLM go here. This entire body becomes the
**system prompt** for the LLM call.

You can use standard Markdown, headers, bullet lists, code blocks, etc.
```

The `name` and `description` frontmatter fields are parsed by `gray-matter` into `LoadedSkill.frontmatter`. The body becomes `LoadedSkill.body`, which is used verbatim as the `system` parameter in the LLM call.

### Directory layout for a skill

```
my-skill/
├─ SKILL.md          # required — system prompt + frontmatter
├─ references/       # optional — any files the skill body instructs the LLM to read
│  └─ api.md
├─ assets/           # optional
│  └─ templates/
└─ scripts/          # optional — standalone validators, etc.
```

The `oe` dispatcher does not read anything other than `SKILL.md`. Additional files in the directory are available for the LLM to reference if the skill instructs it, but they are not automatically loaded.

---

## The implementation contract

`SkillDispatcher` (from `@openexpertise/node-kinds-skill`) loads the SKILL.md with `loadSkillFile()` and makes a single LLM call:

```typescript
const completeOpts: LLMCompleteOpts = {
  model: spec.model ?? defaultModel ?? 'claude-sonnet-4-5',
  system: skill.body, // SKILL.md body becomes the system prompt
  messages: [
    {
      role: 'user',
      content: JSON.stringify(userPayload, null, 2), // state + edge_inputs + args
    },
  ],
  max_tokens: defaultMaxTokens ?? 4096,
}
```

The user message is the entire merged context — state fields, edge inputs, and static `inputs:` — serialized as pretty-printed JSON. The model's text response is written to the single declared `writes:` field.

::: warning V1 limitation: exactly one write field
Structured-output skills (with `schema:`) are planned for V2. In V1, a skill must declare exactly one `writes:` field, and the dispatcher writes the model's full text response to it. If you need multi-field output, use an `agent` node with `schema:`.
:::

---

## Full working example

The `packages/skill-experience-creator/` package ships the canonical skill used by `oe ultra`.

Structure:

```
packages/skill-experience-creator/
├─ SKILL.md             # "Experience Creator" system prompt
├─ references/
│  ├─ api-reference.md
│  ├─ patterns.md
│  └─ lessons.md
├─ assets/
│  └─ templates/
└─ scripts/
   └─ validate-experience.mjs
```

Using it as a node in an experience:

```yaml
name: generate-experience
version: 0.1.0

state:
  schema:
    task_description: { type: string }
    experience_yaml: { type: string }

graph:
  nodes:
    - id: author
      kind: skill
      impl: ../../packages/skill-experience-creator
      reads: [task_description]
      writes: [experience_yaml]
  edges: []
```

A minimal local skill:

```
skills/
└─ my-formatter/
   └─ SKILL.md
```

```markdown
---
name: finding-formatter
description: Format a list of code-review findings as a Markdown table.
---

# Finding Formatter

You receive a JSON payload containing a `findings` array. Each finding has
`title` and `severity` fields.

Return a Markdown table with columns: | Finding | Severity |

Output only the table. No preamble, no trailing text.
```

```yaml
- id: format_report
  kind: skill
  impl: ./skills/my-formatter
  reads: [findings]
  writes: [report_markdown]
```

---

## Variations

### With `for_each`

Run the skill once per item in a state array. The serialized user payload includes `_item` (current element) and `_item_index`:

```yaml
- id: summarize_issue
  kind: skill
  impl: ./skills/summarizer
  for_each: { source: $.issues }
  reads: [issues]
  writes: [summaries]
```

Declare `summaries` with `merge: array_append` to accumulate results.

### With a custom model

```yaml
- id: deep_review
  kind: skill
  impl: ./skills/security-reviewer
  model: claude-opus-4-7
  reads: [diff]
  writes: [security_report]
```

### With static `inputs`

Inject configuration values that are not part of state:

```yaml
- id: classify
  kind: skill
  impl: ./skills/classifier
  inputs:
    taxonomy_version: '2026-Q2'
    strict_mode: true
  reads: [ticket_text]
  writes: [classification]
```

### With `on_error: skip`

```yaml
- id: optional_insight
  kind: skill
  impl: ./skills/advisor
  on_error: { policy: skip }
  reads: [metrics]
  writes: [advice]
```

---

## Gotchas

1. **`SKILL.md` must exist in the `impl` directory** — The dispatcher looks specifically for `SKILL.md` (case-sensitive). If the file is missing, the node throws at resolve time with a clear error.

2. **The user payload is serialized as JSON, not interpolated** — Unlike `agent` nodes (which use `{{field}}` template interpolation), skill nodes serialize the entire context as JSON and pass it as the user message. Your SKILL.md body should instruct the LLM to parse the JSON payload.

3. **Exactly one `writes:` field in V1** — Multi-field structured output is not supported yet. Work around it by writing a JSON string and parsing it with a downstream `tool` node.

4. **The `inputs:` field is static** — Values in `inputs:` are baked into the YAML, not resolved from state at runtime. For dynamic inputs, use `reads:` to pull from state.

5. **File paths in `impl` are relative to `experience.yaml`** — If you install a shared skill globally (e.g. `~/.claude/skills/my-skill`), use an absolute path or a symlink.

---

## See also

- [Guide: Skills and SKILL.md](/guide/skills)
- [The 6 node kinds](/concepts/node-kinds)
- [`agent` node](/concepts/node-agent)
- [Concepts: State (SQLite blackboard)](/concepts/state)
