---
title: UltraExpertise
---

# `UltraExpertise`

An LLM pipeline that converts a plain-text task description into a complete `experience.yaml` plus supporting files. Powers `oe ultra` and the `oe ultra` slash command inside Claude Code. `author()` runs a two-phase analyze → synthesize core, then an optional **critique → revise quality loop** that scores the draft and keeps the best-scoring round. The same critique/revise roles also back `reviseDraft()` (the `oe ultra-revise` command).

## Import

```ts
import { UltraExpertise } from '@openexpertise/authoring'
```

## Signature

```ts
export interface UltraExpertiseOpts {
  client: LLMClient
  model?: string
  criticModel?: string
}

export interface UltraResult {
  analysis: AnalysisOutput
  synthesis: SynthesisOutput
}

export interface LoopMeta {
  rounds_run: number
  final_score: number | null
  critiques: CritiqueOutput[]
  tokens?: { input: number; output: number }
}

export type PhaseEvent =
  | { phase: 'analyze'; status: 'start' }
  | { phase: 'analyze'; status: 'done'; duration_ms: number; result: AnalysisOutput }
  | { phase: 'synthesize'; status: 'start' }
  | { phase: 'synthesize'; status: 'done'; duration_ms: number; result: SynthesisOutput }
  | { phase: 'critique'; status: 'start'; round: number }
  | {
      phase: 'critique'
      status: 'done'
      round: number
      duration_ms: number
      result: CritiqueOutput
    }
  | { phase: 'revise'; status: 'start'; round: number }
  | { phase: 'revise'; status: 'done'; round: number; duration_ms: number; result: SynthesisOutput }

export class UltraExpertise {
  constructor(opts: UltraExpertiseOpts)
  async analyze(taskDescription: string): Promise<AnalysisOutput>
  async synthesize(taskDescription: string, analysis: AnalysisOutput): Promise<SynthesisOutput>
  async author(opts: {
    taskDescription: string
    rootDir: string
    draftSlug?: string
    maxRounds?: number
    exemplars?: Exemplar[]
    corpusDir?: string
    onPhase?: (event: PhaseEvent) => void
  }): Promise<
    | (UltraResult &
        WriteDraftResult & { validation: { valid: boolean; errors?: string[] } } & {
          loop?: LoopMeta
        })
    | { analysis: AnalysisOutput; stopped: true }
  >
  async reviseDraft(opts: {
    draftDir: string
    feedback: string
    maxRounds?: number
    onPhase?: (event: PhaseEvent) => void
  }): Promise<
    UltraResult &
      WriteDraftResult & { validation: { valid: boolean; errors?: string[] } } & { loop: LoopMeta }
  >
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

### `CritiqueOutput`

The structured score a critic produces for a draft. One per loop round, returned in `LoopMeta.critiques`.

```ts
export interface CritiqueFinding {
  dimension: 'decomposition' | 'prompt-quality'
  severity: 'high' | 'medium' | 'low'
  anchor: { node_id?: string; state_field?: string; file_path?: string }
  evidence: string
  fix: string
}

export interface CritiqueOutput {
  score: number
  summary?: string
  findings: CritiqueFinding[]
}
```

### `Exemplar`

A grounding example (a real experience excerpt) injected into synthesis/critique/revise prompts. Pass `exemplars` directly, or a `corpusDir` to have `author` scan a directory of experiences and pick the two most similar by node-kind shape.

```ts
export interface Exemplar {
  name: string
  description: string
  experience_yaml_excerpt: string
}
```

## Constructor options

| Name          | Type        | Required | Description                                                                                                                                                    |
| ------------- | ----------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `client`      | `LLMClient` | ✓        | Any `LLMClient` implementation. `AnthropicLLMClient` is the standard choice.                                                                                   |
| `model`       | `string`    | —        | Model used for `analyze`, `synthesize`, and `revise` calls. Defaults to `'claude-sonnet-4-6'`.                                                                 |
| `criticModel` | `string`    | —        | Same-provider model override for the **critique** calls only. Falls back to `model`, then `'claude-sonnet-4-6'`. Set via `OE_ULTRA_CRITIC_MODEL` from the CLI. |

## `analyze`

```ts
async analyze(taskDescription: string): Promise<AnalysisOutput>
```

Sends `taskDescription` to the LLM with a system prompt loaded from `prompts/analyzer.md`. The model returns a structured analysis via tool call. AJV validates the response against `ANALYSIS_SCHEMA` before returning.

| Parameter         | Type     | Description                                                                                       |
| ----------------- | -------- | ------------------------------------------------------------------------------------------------- |
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
  maxRounds?: number
  exemplars?: Exemplar[]
  corpusDir?: string
  onPhase?: (event: PhaseEvent) => void
}): Promise<
  | (UltraResult & WriteDraftResult & { validation: { valid: boolean; errors?: string[] } } & { loop?: LoopMeta })
  | { analysis: AnalysisOutput; stopped: true }
>
```

Runs `analyze` then `synthesize`, writes all files to disk under `<rootDir>/<slug>/`, and validates the generated YAML with `parseExperienceYaml` + `validateExperienceSpec`. When `maxRounds > 0` it then runs the [critique → revise quality loop](#the-critique-revise-quality-loop) and keeps the best-scoring round on disk.

| Parameter         | Type                          | Required | Description                                                                                                                                     |
| ----------------- | ----------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `taskDescription` | `string`                      | ✓        | Task description forwarded to every phase.                                                                                                      |
| `rootDir`         | `string`                      | ✓        | Directory under which the draft folder is created.                                                                                              |
| `draftSlug`       | `string`                      | —        | Subdirectory name for the draft. Defaults to a slugified form of `analysis.name`.                                                               |
| `maxRounds`       | `number`                      | —        | Critique → revise rounds to run after the initial draft. Defaults to **`0`** (one-shot, no loop, no `loop` key). The `oe ultra` CLI passes `1`. |
| `exemplars`       | `Exemplar[]`                  | —        | Grounding examples injected into the synthesis/critique/revise prompts. Takes precedence over `corpusDir`.                                      |
| `corpusDir`       | `string`                      | —        | Directory of existing experiences to scan for exemplars. Used only when `exemplars` is empty; the two most structurally similar are picked.     |
| `onPhase`         | `(event: PhaseEvent) => void` | —        | Progress callback invoked at the start/end of each phase (`analyze`, `synthesize`, `critique`, `revise`). Drives the CLI spinner.               |

Returns either the draft result, or — when `stopAfterAnalyze` was requested internally — `{ analysis, stopped: true }`. The draft result:

| Field               | Type              | Description                                                                                                  |
| ------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------ |
| `analysis`          | `AnalysisOutput`  | Phase-1 analysis result.                                                                                     |
| `synthesis`         | `SynthesisOutput` | Phase-2 synthesis result (the best-scoring round when the loop ran).                                         |
| `draftDir`          | `string`          | Absolute path to the written draft directory.                                                                |
| `filesWritten`      | `string[]`        | List of file paths written relative to `draftDir`.                                                           |
| `validation.valid`  | `boolean`         | Whether the generated YAML passed `validateExperienceSpec`.                                                  |
| `validation.errors` | `string[]`        | AJV error messages if validation failed.                                                                     |
| `loop`              | `LoopMeta`        | **Present only when `maxRounds > 0`.** Loop telemetry — see [`LoopMeta`](#the-critique-revise-quality-loop). |

::: warning Validation failures are non-fatal
`author` always writes files to disk even when `validation.valid` is `false`. This is intentional — a partially valid draft is still useful as a starting point. Check `validation.errors` and edit before running.
:::

## The critique → revise quality loop {#the-critique-revise-quality-loop}

When `maxRounds > 0`, `author` iterates: a **critic** scores the current draft on two dimensions (`decomposition` + `prompt-quality`) and emits anchored findings, deterministic validation/preflight errors are folded in, and an incremental **reviser** produces a new draft. The loop keeps the **best-scoring** round and is **monotonic** — the result is never worse than the initial one-shot draft. The `loop` field on the result reports what happened:

| `LoopMeta` field | Type                                | Description                                                                                              |
| ---------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `rounds_run`     | `number`                            | How many critique → revise rounds actually ran (may be fewer than `maxRounds` if the score bar was met). |
| `final_score`    | `number \| null`                    | Composite score of the kept draft (0–100), or `null` if no critique scored it.                           |
| `critiques`      | `CritiqueOutput[]`                  | The per-round critic outputs. See [`CritiqueOutput`](#critiqueoutput).                                   |
| `tokens`         | `{ input: number; output: number }` | Cumulative token usage across the loop's critique/revise calls, when available.                          |

The pass bar defaults to `80` and is read from `OE_ULTRA_SCORE_BAR`. The critic model is `criticModel` (CLI: `OE_ULTRA_CRITIC_MODEL`), falling back to `model`.

## `reviseDraft`

```ts
async reviseDraft(opts: {
  draftDir: string
  feedback: string
  maxRounds?: number
  onPhase?: (event: PhaseEvent) => void
}): Promise<
  UltraResult & WriteDraftResult & { validation: { valid: boolean; errors?: string[] } } & { loop: LoopMeta }
>
```

Applies natural-language `feedback` to an **existing** draft, reusing the same critique → revise roles. Reads the draft back from `draftDir` (via `readDraft`, which guards against path traversal), runs the loop, and writes the accepted draft back to the same directory. Powers the `oe ultra-revise` command.

Unlike `author`, `reviseDraft` defaults `maxRounds` to **`1`** and always returns a `loop` field. Because the user gave explicit feedback, acceptance is unconditional — the revised draft is kept even if its composite score does not beat the original.

| Parameter   | Type                          | Required | Description                                                                    |
| ----------- | ----------------------------- | -------- | ------------------------------------------------------------------------------ |
| `draftDir`  | `string`                      | ✓        | Path to the existing draft directory to revise (in place).                     |
| `feedback`  | `string`                      | ✓        | Free-text instructions for the reviser (e.g. "split the fetch node into two"). |
| `maxRounds` | `number`                      | —        | Critique → revise rounds. Defaults to `1`.                                     |
| `onPhase`   | `(event: PhaseEvent) => void` | —        | Progress callback. Same `PhaseEvent` arms as `author`.                         |

## `PhaseEvent`

The `onPhase` callback receives a discriminated union with a `phase` and `status`. `start` arms carry only context; `done` arms carry `duration_ms` and a `result`. The `critique` and `revise` arms additionally carry the 1-based `round` number:

| `phase`      | `done` `result` type | Notes                                     |
| ------------ | -------------------- | ----------------------------------------- |
| `analyze`    | `AnalysisOutput`     | Always emitted once.                      |
| `synthesize` | `SynthesisOutput`    | Always emitted once (the initial draft).  |
| `critique`   | `CritiqueOutput`     | Emitted per loop round; includes `round`. |
| `revise`     | `SynthesisOutput`    | Emitted per loop round; includes `round`. |

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

**LLM calls.** The core is two completion calls: one for analysis (`max_tokens: 8192`) and one for synthesis (`max_tokens: 16384`), both via the `structured_output` tool. When `maxRounds > 0`, each loop round adds one critique call and one revise call.

**AJV validation.** Both `analyze` and `synthesize` compile their schemas once in the constructor and re-use the compiled validators. The Ajv instance is created with `{ allErrors: true, strict: false }`.

**Slug derivation.** When `draftSlug` is omitted, the slug is derived from `analysis.name` (which the LLM must produce as a `^[a-z][a-z0-9-]*$` string). The `slugify` helper in `packages/authoring/src/slug.ts` is used.

**File writing.** Supporting files listed in `synthesis.files` are written relative to `draftDir`. Parent directories are created automatically. Existing files are overwritten without prompting.

## Source

- [packages/authoring/src/ultra.ts](https://github.com/xingchengxu/OpenExpertise/blob/main/packages/authoring/src/ultra.ts)
- [packages/authoring/src/schemas.ts](https://github.com/xingchengxu/OpenExpertise/blob/main/packages/authoring/src/schemas.ts)
