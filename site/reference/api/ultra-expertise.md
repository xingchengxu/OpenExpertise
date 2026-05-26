---
title: UltraExpertise
---

# `UltraExpertise`

A two-phase LLM pipeline that converts a plain-text task description into a complete `experience.yaml` plus supporting files. Powers `oe ultra` and the `oe ultra` slash command inside Claude Code.

## Import

```ts
import { UltraExpertise } from '@openexpertise/authoring'
```

## Signature

```ts
export interface UltraExpertiseOpts {
  client: LLMClient
  model?: string
}

export interface UltraResult {
  analysis: AnalysisOutput
  synthesis: SynthesisOutput
}

export class UltraExpertise {
  constructor(opts: UltraExpertiseOpts)
  async analyze(taskDescription: string): Promise<AnalysisOutput>
  async synthesize(taskDescription: string, analysis: AnalysisOutput): Promise<SynthesisOutput>
  async author(opts: {
    taskDescription: string
    rootDir: string
    draftSlug?: string
  }): Promise<UltraResult & WriteDraftResult & { validation: { valid: boolean; errors?: string[] } }>
}
```

### `AnalysisOutput`

```ts
export interface AnalysisOutput {
  name: string
  description: string
  domain?: string
  phases: Array<{ id: string; title?: string }>
  state_fields: Array<{
    name: string
    type: 'string' | 'number' | 'boolean' | 'array' | 'object'
    merge?: 'array_append' | 'set_once' | 'last_wins'
    description?: string
  }>
  node_sketches: Array<{
    id: string
    kind: 'tool' | 'agent' | 'skill' | 'dataset' | 'experience' | 'cli-agent'
    phase?: string
    purpose: string
    fan_out_over?: string
  }>
  open_questions?: string[]
}
```

### `SynthesisOutput`

```ts
export interface SynthesisOutput {
  experience_yaml: string
  files: Array<{ path: string; content: string }>
  next_steps?: string[]
}
```

## Constructor options

| Name | Type | Required | Description |
|---|---|---|---|
| `client` | `LLMClient` | ✓ | Any `LLMClient` implementation. `AnthropicLLMClient` is the standard choice. |
| `model` | `string` | — | Model used for both `analyze` and `synthesize` calls. Defaults to `'claude-sonnet-4-6'`. |

## `analyze`

```ts
async analyze(taskDescription: string): Promise<AnalysisOutput>
```

Sends `taskDescription` to the LLM with a system prompt loaded from `prompts/analyzer.md`. The model returns a structured analysis via tool call. AJV validates the response against `ANALYSIS_SCHEMA` before returning.

| Parameter | Type | Description |
|---|---|---|
| `taskDescription` | `string` | Plain-text description of the workflow to automate. Can be a few sentences or several paragraphs. |

Throws if the LLM does not return a `structured_output` tool call, or if the tool call fails AJV validation (message lists all constraint violations).

## `synthesize`

```ts
async synthesize(taskDescription: string, analysis: AnalysisOutput): Promise<SynthesisOutput>
```

Sends both the task description and the analysis to the LLM with a system prompt loaded from `prompts/synthesizer.md`. The model returns the full `experience_yaml` string plus an array of supporting files (tool stubs, prompt files, etc.). AJV validates the response against `SYNTHESIS_SCHEMA` before returning.

Uses `max_tokens: 16384` — higher than `analyze` to accommodate large YAML files.

## `author` (the combined pipeline)

```ts
async author(opts: {
  taskDescription: string
  rootDir: string
  draftSlug?: string
}): Promise<UltraResult & WriteDraftResult & { validation: { valid: boolean; errors?: string[] } }>
```

Runs `analyze` then `synthesize` then writes all files to disk under `<rootDir>/<slug>/`, and validates the generated YAML with `parseExperienceYaml` + `validateExperienceSpec`.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `taskDescription` | `string` | ✓ | Task description forwarded to both phases. |
| `rootDir` | `string` | ✓ | Directory under which the draft folder is created. |
| `draftSlug` | `string` | — | Subdirectory name for the draft. Defaults to a slugified form of `analysis.name`. |

Returns:

| Field | Type | Description |
|---|---|---|
| `analysis` | `AnalysisOutput` | Phase-1 analysis result. |
| `synthesis` | `SynthesisOutput` | Phase-2 synthesis result. |
| `draftDir` | `string` | Absolute path to the written draft directory. |
| `filesWritten` | `string[]` | List of file paths written relative to `draftDir`. |
| `validation.valid` | `boolean` | Whether the generated YAML passed `validateExperienceSpec`. |
| `validation.errors` | `string[]` | AJV error messages if validation failed. |

::: warning Validation failures are non-fatal
`author` always writes files to disk even when `validation.valid` is `false`. This is intentional — a partially valid draft is still useful as a starting point. Check `validation.errors` and edit before running.
:::

## Example

```ts
import { UltraExpertise } from '@openexpertise/authoring'
import { AnthropicLLMClient } from '@openexpertise/node-kinds-agent'

const ultra = new UltraExpertise({
  client: new AnthropicLLMClient(),
})

const result = await ultra.author({
  taskDescription: `
    Review every open GitHub PR in the repo, run the test suite for each,
    and post a summary comment with pass/fail status and a suggested reviewer.
  `,
  rootDir: '/workspace/experiences',
})

if (!result.validation.valid) {
  console.warn('Generated YAML has issues:', result.validation.errors)
}

console.log('Draft written to:', result.draftDir)
console.log('Files:', result.filesWritten)
```

## Behavior notes

**Two LLM calls.** `author` makes exactly two completion calls: one for analysis (`max_tokens: 8192`) and one for synthesis (`max_tokens: 16384`). Both calls require the model to use the `structured_output` tool.

**AJV validation.** Both `analyze` and `synthesize` compile their schemas once in the constructor and re-use the compiled validators. The Ajv instance is created with `{ allErrors: true, strict: false }`.

**Slug derivation.** When `draftSlug` is omitted, the slug is derived from `analysis.name` (which the LLM must produce as a `^[a-z][a-z0-9-]*$` string). The `slugify` helper in `packages/authoring/src/slug.ts` is used.

**File writing.** Supporting files listed in `synthesis.files` are written relative to `draftDir`. Parent directories are created automatically. Existing files are overwritten without prompting.

## Source

- [packages/authoring/src/ultra.ts](https://github.com/xingchengxu/OpenExpertise/blob/main/packages/authoring/src/ultra.ts)
- [packages/authoring/src/schemas.ts](https://github.com/xingchengxu/OpenExpertise/blob/main/packages/authoring/src/schemas.ts)
