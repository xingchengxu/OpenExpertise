---
title: Cookbook
description: Copy-paste YAML and tool-stub recipes for the patterns that come up over and over. Drop into your experience and adapt.
---

# Cookbook

Recipes you'll reach for again and again. Each is **self-contained** — copy the snippet into your `experience.yaml` (or `tools/*.mjs`) and adapt the names.

These are the "common case" patterns. For the full feature set, see [Concepts](/concepts/experiences) and the [YAML schema reference](/reference/schema).

[[toc]]

<div v-pre>

## Fan out across N items, in parallel

When you have a list and want each item investigated independently by an LLM. The classic `for_each` shape — every example with multi-dim review uses this.

```yaml
state:
  schema:
    dimensions:
      type: array
      items: { type: object }
      merge: set_once
    findings:
      type: array
      items: { type: object }
      merge: array_append # ← key: each iteration appends

graph:
  nodes:
    - id: seed_dimensions
      kind: tool
      impl: ./tools/list_dimensions.mjs
      writes: [dimensions]

    - id: investigate
      kind: agent
      prompt: ./prompts/investigate.md
      reads: [incident]
      for_each:
        source: $.dimensions # JSONPath into state — must be array
        concurrency: 4 # 4 LLM calls in flight at once
      schema:
        type: object
        properties:
          findings:
            type: array
            items: { type: object }
        required: [findings]
      writes: [findings]
  edges:
    - { from: seed_dimensions, to: investigate }
```

In the prompt: reference `{{$item.key}}` and `{{$index}}`. See [oncall-runbook](/examples/oncall-runbook) for the working pattern.

## Conditional skip: only run B if A produced something

```yaml
edges:
  - { from: search_similar, to: dedup, when: 'length($.similar_issues) > 0' }
```

If the array is empty, `dedup` is skipped. Skip cascades to its successors — unless they have a separate edge from a live predecessor (see [issue-triage](/examples/issue-triage) for the cascade-break pattern).

Other useful `when:` expressions:

```yaml
when: '$.is_duplicate == true'
when: '$.risk_score > 0.5'
when: '!$.skipped_by_user'
when: 'length($.findings) > 0 && $.risk_score > 0.5'
```

## Retry a flaky node

Most often used on `tool` nodes calling external HTTP, or on `agent` nodes that occasionally return shape that fails AJV.

```yaml
- id: fetch_repo_metadata
  kind: tool
  impl: ./tools/github.mjs
  args: { repo: 'org/name' }
  writes: [repo_metadata]
  on_error:
    policy: retry
    max_attempts: 3
    backoff_ms: 500 # × attempt number
```

For HTTP 429s from the LLM provider specifically, you don't need this — both Anthropic and OpenAI clients have built-in 429 + exponential backoff. See [Concurrency + 429 retry](/guide/concurrency).

## Skip-on-error: keep the run alive

If a node fails and the rest of the graph can proceed anyway:

```yaml
- id: optional_enrichment
  kind: agent
  prompt: ./prompts/enrich.md
  reads: [item]
  writes: [enriched]
  on_error:
    policy: skip # ← log + skip cascading
```

`policy: skip` marks the node as `skipped` and propagates that to its successors. Use this when the downstream nodes can tolerate the missing field.

## Multi-vendor CLI chain

Three rival AI coding CLIs in one graph. **No other workflow framework does this today.**

```yaml
graph:
  nodes:
    - id: summarize
      kind: cli-agent
      provider: claude-code
      prompt: 'Summarize this topic in one sentence: {{topic}}'
      writes: [summary]

    - id: critique
      kind: cli-agent
      provider: codex
      prompt: 'What does this summary miss? {{summary}}'
      reads: [summary]
      writes: [critique]

    - id: verdict
      kind: cli-agent
      provider: gemini
      prompt: 'Verdict on production-readiness given: {{summary}} + {{critique}}'
      reads: [summary, critique]
      writes: [verdict]
  edges:
    - { from: summarize, to: critique }
    - { from: critique, to: verdict }
```

See [tri-cli-orchestration](/examples/tri-cli-orchestration) for the full working example (and the [cli-agent guide](/guide/cli-agent-usage) for installing each CLI).

## Aggregate fan-out results

After a `for_each` with `merge: array_append`, you'll have a flat list. Aggregate with one more tool node:

```yaml
- id: score
  kind: tool
  impl: ./tools/score.mjs
  reads: [findings]
  writes: [risk_score]
```

```js
// tools/score.mjs
export default async function ({ findings }) {
  const max = findings.reduce((m, f) => Math.max(m, f.severity ?? 0), 0)
  return { state_delta: { risk_score: max } }
}
```

The pattern: `tool seed → agent for_each → tool aggregate → conditional agent → tool persist`. See [oncall-runbook](/examples/oncall-runbook).

## Refine until good enough

When one LLM pass isn't enough — refine iteratively until a condition or a safety budget:

```yaml
graph:
  nodes:
    - { id: refine, kind: agent, ... }
  loops:
    - id: refine_loop
      body: refine
      until: '$.refined_count >= 3'
      max_iters: 10
```

`max_iters` is a hard safety cap so a runaway condition can't loop forever.

## Nest one experience inside another

If a sub-workflow is reusable across multiple parents:

```yaml
- id: triage_issue
  kind: experience
  path: ./sub-experiences/triage
  args:
    issue_id: $.current_issue.id
  writes: [triage_result]
```

State of the sub-experience is **isolated by default**. See [examples/issue-triage](/examples/issue-triage) for a real composition.

## Dataset → enrich → persist

Bulk processing pattern: load rows, run an agent per row, persist:

```yaml
graph:
  nodes:
    - id: load
      kind: dataset
      source: { type: file, path: ./data/rows.jsonl, format: jsonl }
      writes: [rows]

    - id: enrich
      kind: agent
      prompt: ./prompts/enrich.md
      reads: [rows]
      for_each: { source: $.rows, concurrency: 8 }
      schema: { ... }
      writes: [enriched_rows]

    - id: persist
      kind: tool
      impl: ./tools/save.mjs
      reads: [enriched_rows]
```

Want each row to go through `enrich → validate → save` end-to-end before the next? Use a `pipelines:` block — see [Control Flow](/concepts/control-flow).

## Structured-output schema with AJV

The contract for `agent` nodes: declare an inline JSON schema. The runtime forces the LLM to call a `structured_output` tool and validates the result.

```yaml
- id: classify_mood
  kind: agent
  prompt: ./prompts/classify.md
  reads: [text]
  schema:
    type: object
    properties:
      mood: { type: string, enum: ['positive', 'negative', 'neutral'] }
      confidence: { type: number, minimum: 0, maximum: 1 }
    required: [mood, confidence]
    additionalProperties: false
  writes: [mood, confidence]
```

`additionalProperties: false` is recommended — catches LLM hallucinated keys.

## Tool stub with edge_output (transient)

Sometimes you don't want a value in state — you just want it on the edge to the next node:

```js
// tools/fetch_diff.mjs
export default async function ({ pr_id }) {
  const diff = await fetchPr(pr_id)
  return {
    state_delta: { pr_id }, // ← committed to state
    edge_output: { diff }, // ← visible only to direct successors
  }
}
```

The next node receives `_edge_inputs: { fetch_diff: { diff } }`. Use this for transient data you don't want in your blackboard's audit trail.

## Self-hosted LLM (vLLM, Ollama, LM Studio)

OpenAI-protocol-compatible local LLM:

```bash
export OPENAI_BASE_URL=http://localhost:8000/v1
export OPENAI_API_KEY=anything                # vLLM doesn't care
oe run examples/agent-echo
```

The runtime auto-detects model intent (`anthropic` vs `openai`) from the `provider:` you set in `runtime.providers`, or auto-routes by model-name pattern. See [Self-hosted LLMs](/guide/self-hosted-llm) for the full setup.

## Skill node — SKILL.md packages

Package a reusable Claude/Cursor-skill-style asset and invoke from any experience:

```yaml
- id: review_code
  kind: skill
  skill: ./skills/code-review
  reads: [diff]
  writes: [review]
```

```markdown
## <!-- skills/code-review/SKILL.md -->

description: Reviews a unified diff and reports findings as structured output.
inputs:

- diff: string

---

Read the diff. Report findings as JSON with shape `{ findings: [...] }`.
```

See [Skills + SKILL.md](/guide/skills) and [examples/brainstorming](/examples/brainstorming) for the pattern.

## Inspect a past run's state

```bash
oe state findings --run <run-id>
oe state .                       # all fields
oe inspect <run-id>              # event timeline + per-node metrics
oe diff <run-id> <other-run-id>  # field-by-field diff
```

State + events live under `.openexpertise/`. Want to nuke and start over? `oe reset-state` (per-field) or `rm -rf .openexpertise/state.sqlite` (everything). See [oe state](/reference/cli/state) and [oe inspect](/reference/cli/inspect).

## Subscribe to events programmatically

If you're embedding OE in a service:

```ts
import { EventBus, runExperience } from '@openexpertise/core'

const events = new EventBus()
events.subscribe((e) => {
  if (e.type === 'node.tokens') metrics.inc('tokens_in', e.input_tokens)
  if (e.type === 'node.failed') pagerDuty.alert({ runId: e.run_id, error: e.error })
})

await runExperience({ specPath, events /* ... */ })
```

See [EventBus API](/reference/api/event-bus) for the full event union.

---

</div>

→ **More patterns** in the [examples gallery](/examples/) — every example is a runnable recipe.
→ **Stuck?** Check [FAQ + troubleshooting](/faq).
