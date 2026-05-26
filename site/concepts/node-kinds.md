# The 6 node kinds

OpenExpertise ships six node kinds. Picking the right one for each step is most of what experience design looks like.

## At a glance

| Kind                                      | Use it when…                                                    | Backed by                           |
| ----------------------------------------- | --------------------------------------------------------------- | ----------------------------------- |
| [`tool`](/concepts/node-tool)             | The step is deterministic code — fetch, parse, transform, score | Your `.mjs` file                    |
| [`agent`](/concepts/node-agent)           | The step needs LLM judgment with a structured output            | Anthropic / OpenAI client           |
| [`skill`](/concepts/node-skill)           | You have a reusable, version-tagged SKILL.md package            | SkillDispatcher + LLM client        |
| [`dataset`](/concepts/node-dataset)       | The step loads tabular or document data into state              | file / SQLite / HTTP / MCP-resource |
| [`experience`](/concepts/node-experience) | The step is itself a whole sub-experience (graph of graphs)     | Nested `runExperience()`            |
| [`cli-agent`](/concepts/node-cli-agent)   | The step needs the full power of Claude Code / Codex / Gemini   | Subprocess + JSON-mode parser       |

## The decision tree

```
Is this step deterministic? (no judgment needed)
   ↓
   Yes ──→ TOOL
   No
   ↓
Is the output a single, well-shaped JSON object I can specify?
   ↓
   Yes ──→ AGENT  (one LLM call, AJV-validated)
   No
   ↓
Does it need file system, search, MCP, or other tool ecosystem the LLM should use?
   ↓
   Yes ──→ CLI-AGENT  (delegate to Claude Code / Codex / Gemini)
   No
   ↓
Is it a packaged, reusable routine I already have as SKILL.md?
   ↓
   Yes ──→ SKILL
   No
   ↓
Does it produce a row-set I want loaded as state?
   ↓
   Yes ──→ DATASET
   No
   ↓
Is it a whole sub-flow I want to invoke atomically?
   ↓
   Yes ──→ EXPERIENCE
```

## What every node has in common

Regardless of kind, every node spec has:

```yaml
- id: my_node # unique within the graph
  kind: tool # one of the 6
  phase: collect # optional, for UI grouping
  reads: [foo, bar] # state fields injected into the node's input
  writes: [baz] # state fields the node is allowed to write to
  on_error: # optional retry/skip/fail policy
    policy: retry
    attempts: 3
    backoff: exponential
    base_ms: 1000
  for_each: # optional fan-out
    source: $.dimensions
    concurrency: 4
  # ... plus kind-specific fields ...
```

This common shape is the contract every dispatcher honors. The kind-specific fields go below.

## Composition rules

- **Reads ⊆ state.schema.** A node can only declare reads for fields that exist in `state.schema`. Validator-enforced.
- **Writes ⊆ state.schema.** Same.
- **State fields can have merge strategies.** Multiple writers to the same field combine via `array_append` / `set_once` / `last_wins`. See [State](/concepts/state).
- **No cycles.** Edges must form a DAG. Validator-enforced.
- **Phases are cosmetic.** They group nodes in the TUI and in event logs; they don't affect runtime ordering.

## The full grammar per kind

Each kind has its own deep-dive page with required fields, examples, and gotchas:

- [`tool`](/concepts/node-tool) — `impl: ./tools/<name>.mjs`
- [`agent`](/concepts/node-agent) — `prompt: ./prompts/<name>.md` + inline `schema`
- [`skill`](/concepts/node-skill) — `impl: ./skills/<name>` (SKILL.md dir)
- [`dataset`](/concepts/node-dataset) — `source: { type, uri, query?, format? }`
- [`experience`](/concepts/node-experience) — `impl: ./sub-experience` + `state_scope: isolated|shared`
- [`cli-agent`](/concepts/node-cli-agent) — `provider: claude-code|codex|gemini` + inline `prompt`

## Real-world combinations

Looking at the [examples library](/examples/), here's the mix-and-match:

| Example                 | Tools used                               |
| ----------------------- | ---------------------------------------- |
| `hello-tool`            | `tool`                                   |
| `agent-echo`            | `agent`                                  |
| `dataset-aggregate`     | `dataset` + `tool`                       |
| `review-branch`         | `tool` + `agent` ×3                      |
| `oncall-runbook`        | `tool` + `agent` (with `for_each`)       |
| `issue-triage`          | `tool` + `agent` ×4 (with `when:` edges) |
| `release-gates`         | `tool` ×3 + `cli-agent` + `agent`        |
| `cli-orchestration`     | `cli-agent` ×2                           |
| `tri-cli-orchestration` | `cli-agent` ×3 (3 vendors, one graph)    |
| `deep-research`         | `tool` + `agent` ×4                      |
| `systematic-debugging`  | `tool` + `agent` ×3                      |

→ Start with the [`tool` page](/concepts/node-tool) — it's the simplest.
