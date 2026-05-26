# Skills + SKILL.md

Package a named LLM capability as a reusable SKILL.md and invoke it from a `skill` node.

## When you need this

- You have a prompt-based LLM task that appears in multiple experiences and you want one canonical version.
- You want to store a skill in `~/.claude/skills/` and share it across projects.
- You are authoring an experience that calls a well-defined sub-capability (e.g., "summarize a thread", "classify a ticket") and want it separate from the orchestration YAML.
- You want to use the `skill-experience-creator` package — the `/ultraexpertise` slash command is itself a skill.

## The minimal example

`skills/summarize.md` (a SKILL.md file):

```markdown
---
name: summarize
description: Summarize a block of text in 2-3 sentences.
---

You are a summarization assistant. The user will provide a JSON object.
Read the `text` field and return a 2-3 sentence summary as plain text.
Be concise and factual. Do not add preamble.
```

Reference it from `experience.yaml`:

```yaml
- id: summarize_thread
  kind: skill
  impl: ./skills/summarize.md
  reads: [thread_text]
  writes: [summary]
```

The `thread_text` field is passed as part of the JSON user message. The LLM response (plain text) is written to `summary`.

## How it works

`SkillDispatcher` (`packages/node-kinds-skill/src/skill-dispatcher.ts`) loads the SKILL.md file, parses the YAML frontmatter, and uses the body as the system prompt.

The user message sent to the LLM is a JSON-serialized merge of all inputs:

```json
{
  "thread_text": "value from state",
  "any_edge_input": "...",
  "any_args_key": "..."
}
```

The LLM response text is written directly to the single declared `writes:` field. Unlike `agent` nodes, `skill` nodes in V1 do not support structured output — exactly one `writes:` field, text mode only. The response is the raw LLM text.

**SKILL.md format:**

```markdown
---
name: <slug>
description: <one-sentence description>
---

<system prompt body>
```

The frontmatter is YAML. The body is the system prompt. No `{{placeholder}}` interpolation in the body — the full input bundle is passed as JSON in the user message. The LLM must parse the JSON to access individual fields.

**`kind: skill` vs `kind: agent`:**

|                   | `skill`                          | `agent`                                |
| ----------------- | -------------------------------- | -------------------------------------- |
| Prompt location   | SKILL.md file                    | `.md` file (or inline for `cli-agent`) |
| Prompt format     | System prompt (no template vars) | Template with `{{placeholder}}`        |
| Structured output | Not in V1                        | Yes (`schema:` key + tool call)        |
| Reusability       | High — shared across experiences | Medium — per-experience prompt file    |
| Input to LLM      | JSON bundle as user message      | Interpolated template as user message  |

Use `skill` when the capability is well-defined, reusable, and doesn't need structured output. Use `agent` when you need `{{placeholder}}` interpolation, structured output (`schema:`), or a prompt that's tightly coupled to a single experience.

## Variations

**Install a skill globally** so it's available to all experiences:

```bash
mkdir -p ~/.claude/skills/
cp -r my-skills/summarize ~/.claude/skills/
```

Then reference it with an absolute path, or copy it next to `experience.yaml`.

**Specify a model:**

```yaml
- id: deep_analyze
  kind: skill
  impl: ./skills/analyze.md
  model: claude-opus-4-5
  reads: [raw_data]
  writes: [analysis]
```

**The `skill-experience-creator` package** ships a skill that creates experiences. It's the engine behind `/ultraexpertise`. Its `SKILL.md` (`packages/skill-experience-creator/SKILL.md`) is a multi-step instructional prompt that walks the LLM through goal clarification, topology selection, schema design, and scaffolding.

**`kind: skill` in the experience.yaml node spec** (`SkillNodeSpec`) supports `inputs:` as a static key-value map — analogous to `args:` on `tool` and `agent` nodes:

```yaml
- id: classify
  kind: skill
  impl: ./skills/classify.md
  inputs:
    categories: [bug, feature, docs, question]
  reads: [issue_body]
  writes: [label]
```

## Gotchas

- **Exactly one `writes:` field is required in V1.** Zero entries throws; two or more throws. The entire LLM response is written as a string to that field.
- **No `{{placeholder}}` in the skill body.** The system prompt is used verbatim. All context reaches the LLM via the JSON user message. If your prompt references `{{foo}}`, switch to an `agent` node with a `.md` prompt file.
- **The LLM response is not validated.** Unlike `agent` nodes with `schema:`, `skill` output is not AJV-validated. If you need structured output from a skill, parse and validate in a downstream `tool` node.
- **`impl` path is relative to `experience.yaml`**, not to `~/.claude/skills/`. Use an absolute path or copy the skill file into the experience directory.

## See also

- [skill node concept](/concepts/node-skill)
- [Prompt files](/guide/prompt-files) — for `agent` nodes with `{{placeholder}}` templates
- [From inside Claude Code](/guide/authoring-slash-command) — `/ultraexpertise` is itself a skill
- [oe ultra — LLM authors for you](/guide/authoring-ultra)
