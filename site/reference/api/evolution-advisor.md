---
title: EvolutionAdvisor
---

# `EvolutionAdvisor`

Analyzes a completed run (spec + events + state diff) and returns up to five ranked proposals for improving the `experience.yaml`. Part of `@openexpertise/evolution`. The runtime never auto-applies proposals — they are returned as text diffs for human review.

## Import

```ts
import { EvolutionAdvisor } from '@openexpertise/evolution'
```

## Signature

```ts
export type EvolutionOperation = 'add-node' | 'tune-param' | 'add-dataset-case'
export type EvolutionConfidence = 'high' | 'medium' | 'low'

export interface EvolutionProposal {
  operation: EvolutionOperation
  confidence: EvolutionConfidence
  rationale: string
  diff: string  // unified diff snippet (for add-node / tune-param) OR JSON array (for add-dataset-case)
  title: string
}

export interface EvolutionAdvisorOpts {
  client: LLMClient
  model?: string
}

export interface EvolutionInput {
  experienceSpec: ExperienceSpec
  experienceYamlSource: string
  runEvents: unknown[]        // jsonl lines parsed
  stateDiff: Array<{ field: string; before: unknown; after: unknown }>
}

export class EvolutionAdvisor {
  constructor(opts: EvolutionAdvisorOpts)
  async analyze(input: EvolutionInput): Promise<EvolutionProposal[]>
  renderMarkdown(proposals: EvolutionProposal[], runId: string): string
}
```

## Constructor options

| Name | Type | Required | Description |
|---|---|---|---|
| `client` | `LLMClient` | ✓ | Any object implementing `LLMClient`. `AnthropicLLMClient` is the standard choice. |
| `model` | `string` | — | Model identifier to use for the analysis call. Defaults to `'claude-sonnet-4-5'`. |

## `analyze` parameters

| Name | Type | Required | Description |
|---|---|---|---|
| `experienceSpec` | `ExperienceSpec` | ✓ | Parsed spec from the run being analyzed. |
| `experienceYamlSource` | `string` | ✓ | Raw YAML source string. Included verbatim in the LLM prompt so the model can reference line numbers and formatting. |
| `runEvents` | `unknown[]` | ✓ | All events parsed from the run's `.jsonl` log file. The advisor samples the first 30 to stay within token budget. |
| `stateDiff` | `Array<{ field, before, after }>` | ✓ | Field-level diff between the state before and after the run. Computed by the CLI (`oe evolve`) but can be constructed manually. |

## `analyze` return type

Returns `Promise<EvolutionProposal[]>` — an array of up to 5 proposals, each with:

| Field | Type | Description |
|---|---|---|
| `operation` | `'add-node' \| 'tune-param' \| 'add-dataset-case'` | Kind of change proposed. |
| `confidence` | `'high' \| 'medium' \| 'low'` | Advisor's self-assessed confidence in the proposal. |
| `title` | `string` | Short human-readable title. |
| `rationale` | `string` | Explanation of why this change would improve the experience. |
| `diff` | `string` | Unified diff snippet to `git apply`, or a JSON array of new dataset cases. |

## `renderMarkdown`

Formats a proposal list as a Markdown document for human review:

```ts
renderMarkdown(proposals: EvolutionProposal[], runId: string): string
```

The output starts with a heading `# Evolution Proposals for run \`<runId>\`` followed by one section per proposal including the rationale and a fenced `diff` block. Returns a single `_No proposals generated for this run._` line when the array is empty.

## Example

```ts
import { EvolutionAdvisor } from '@openexpertise/evolution'
import { AnthropicLLMClient } from '@openexpertise/node-kinds-agent'
import { parseExperienceYaml } from '@openexpertise/schema'
import { readFileSync, createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'

const spec = parseExperienceYaml(readFileSync('experience.yaml', 'utf8'))

// Parse the run's event log
const events: unknown[] = []
const rl = createInterface({ input: createReadStream('.openexpertise/runs/my-run-id.jsonl') })
for await (const line of rl) events.push(JSON.parse(line))

const advisor = new EvolutionAdvisor({
  client: new AnthropicLLMClient(),
  model: 'claude-sonnet-4-6',
})

const proposals = await advisor.analyze({
  experienceSpec: spec,
  experienceYamlSource: readFileSync('experience.yaml', 'utf8'),
  runEvents: events,
  stateDiff: [
    { field: 'results', before: [], after: ['item-1', 'item-2'] },
  ],
})

console.log(advisor.renderMarkdown(proposals, 'my-run-id'))
```

## Behavior notes

**Structured output via tool use.** `analyze` sends the LLM a single tool definition (`structured_output`) whose `input_schema` constrains the proposals array to at most 5 items with required fields (`operation`, `confidence`, `title`, `rationale`, `diff`). If the model does not call the tool, an empty array is returned rather than throwing.

**Event sampling.** Only the first 30 events from `runEvents` are sent to the LLM to avoid exceeding context limits. Pass a pre-filtered slice if you want to emphasize specific event types.

**No auto-apply.** The `EvolutionAdvisor` never modifies files on disk. Apply accepted proposals manually with `git apply` (unified diffs) or by editing `experience.yaml` (dataset cases). See [Applying proposals](/guide/applying-proposals).

**Token budget.** The completion is capped at 8 192 tokens. Proposals are therefore concise by design — rationale is a paragraph, not an essay.

## Source

[packages/evolution/src/advisor.ts](https://github.com/xingchengxu/OpenExpertise/blob/main/packages/evolution/src/advisor.ts)
