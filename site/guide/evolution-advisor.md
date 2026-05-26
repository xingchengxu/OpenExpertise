# The evolution advisor

Ask the LLM to read a completed run and propose concrete improvements to `experience.yaml`.

## When you need this

- You have run an experience at least once and want suggestions on what to add or tune.
- A run completed but some dimensions produced weak findings — you want the advisor to notice and propose adding coverage.
- You want to tune retry policies, model aliases, or threshold values based on observed behavior.
- You are building a feedback-driven improvement cycle without manually reading every event log.

## The minimal example

```bash
oe run examples/review-branch
# → run_id: abc123

oe evolve examples/review-branch --run-id abc123
# → wrote .openexpertise/evolution/abc123.md  (3 proposals)

oe diff examples/review-branch
# → prints each proposal with its diff block
```

## How it works

`oe evolve` calls `EvolutionAdvisor.analyze()` (`packages/evolution/src/advisor.ts`), which assembles an input payload and sends it to the LLM with a structured-output tool.

**What the advisor reads:**

| Input             | Source                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| `experience_yaml` | Full text of `experience.yaml`                                                                    |
| `run_event_count` | Total events in the run log                                                                       |
| `sample_events`   | First 30 events from `.openexpertise/runs/<run-id>.jsonl`                                         |
| `state_diff`      | Per-field `{ before, after }` diffs from the SQLite history table, filtered to the given `run_id` |

The `state_diff` is computed by `evolveCommand`: it reads the state history for every schema field, filters to rows written during the target run, and emits `{ field, before: first_write.value_old, after: last_write.value_new }`.

**Proposal operations (V1):**

| Operation          | What it does                                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `add-node`         | Insert a new node + connecting edges. Diff is a unified diff of `experience.yaml`.                               |
| `tune-param`       | Adjust a literal — a threshold, a model alias, a prompt path, a phase label. Diff is a unified diff.             |
| `add-dataset-case` | Append rows to a dataset source (e.g., add a missing dimension to a fan-out list). Diff is a JSON array of rows. |

Forbidden operations (the system prompt explicitly prohibits): removing nodes, rewiring edges, changing a node's `kind`, or modifying `state.schema`.

**Confidence levels:**

- `high` — strong evidence from the run (e.g., a specific missing dimension referenced in the state diff).
- `medium` — reasonable inference (e.g., a pattern in the event log suggesting a retry would help).
- `low` — speculative (e.g., a general best-practice improvement not directly evidenced by this run).

The advisor returns up to 5 proposals, sorted by relevance. Each proposal has: `operation`, `confidence`, `title`, `rationale` (one paragraph citing evidence), and `diff` (the patch or rows to append).

**Output:** `oe evolve` writes the rendered Markdown to `.openexpertise/evolution/<run-id>.md`. The file is never auto-applied — `git apply` is always a manual step.

## Variations

**Force a specific LLM provider for the advisor:**

```bash
oe evolve examples/review-branch --run-id abc123 --llm openai
```

**Run the advisor programmatically:**

```ts
import { EvolutionAdvisor } from '@openexpertise/evolution'
import { AnthropicLLMClient } from '@openexpertise/node-kinds-agent'

const advisor = new EvolutionAdvisor({
  client: new AnthropicLLMClient(),
  model: 'claude-opus-4-5',
})

const proposals = await advisor.analyze({
  experienceSpec: spec,
  experienceYamlSource: yamlText,
  runEvents: events,
  stateDiff: [{ field: 'findings', before: [], after: [{...}] }],
})

console.log(advisor.renderMarkdown(proposals, runId))
```

**Fan-out dimension detection** — the advisor has special handling for `for_each`-based fan-outs: if the state diff hints at a domain area (raw SQL → security, missing logs → observability) not in the current `dimensions` list, it prefers `add-dataset-case` proposals to add the missing focus area.

## Gotchas

- **The sample_events cap is 30.** For long runs, the advisor only sees the first 30 events. Important mid-run or end-run events may not be included. Future versions may sample differently.
- **The advisor sees the experience.yaml as text, not as a parsed AST.** Diff line numbers in proposals reference the raw text; a reformatted YAML may cause `git apply` to fail. See [Applying proposals](/guide/applying-proposals).
- **No memory across multiple `oe evolve` calls.** Each call is a fresh LLM invocation. The advisor does not track which proposals were applied in earlier runs.
- **`oe diff` only prints; it does not apply.** Use `git apply` manually after reviewing each diff block.

## See also

- [Applying proposals](/guide/applying-proposals) — extract and apply diff blocks
- [Author → run → evolve loop](/guide/closed-loop)
- [Evolution loop concept](/concepts/evolution-loop)
- [`oe evolve` CLI reference](/reference/cli/evolve)
- [EvolutionAdvisor API](/reference/api/evolution-advisor)
