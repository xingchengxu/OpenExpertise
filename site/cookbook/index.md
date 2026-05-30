---
title: Cookbook
description: Self-contained recipes for the patterns that come up over and over. Each page has a full YAML example, a prose walkthrough, and variations.
---

# Cookbook

Each recipe is **self-contained** — a complete `experience.yaml` snippet you can drop in and adapt. For the full feature set, see [Concepts](/concepts/experiences) and the [YAML schema reference](/reference/schema).

## Recipes

### Control flow

| Recipe                                                 | What it covers                                                        |
| ------------------------------------------------------ | --------------------------------------------------------------------- |
| [Fan-out with concurrency](./fan-out-with-concurrency) | `for_each` over an array with `concurrency: N`; `merge: array_append` |
| [Branch by feature flag](./branch-by-feature-flag)     | `when:` edges to route at runtime based on a state value              |
| [Retry with backoff](./retry-with-backoff)             | `on_error: { policy: retry }` with linear and exponential backoff     |
| [Nested experiences](./nested-experiences)             | `kind: experience` node; `state_scope: isolated`; passing args        |

### State & output

| Recipe                                                   | What it covers                                                      |
| -------------------------------------------------------- | ------------------------------------------------------------------- |
| [Merge strategies](./merge-strategies)                   | `array_append` / `set_once` / `last_wins` with worked examples      |
| [Structured output schemas](./structured-output-schemas) | `schema:` patterns — nested objects, enums, arrays, nullable fields |

### Running & recovery

| Recipe                                   | What it covers                                          |
| ---------------------------------------- | ------------------------------------------------------- |
| [Resume from cache](./resume-from-cache) | `oe resume <run-id>`; cache invalidation; `--from` flag |

### Visualize & share

| Recipe                                                           | What it covers                                                        |
| ---------------------------------------------------------------- | --------------------------------------------------------------------- |
| [Visualize a graph & share a run report](./visualize-and-report) | `oe graph` Mermaid DAG; `oe inspect --html` self-contained run report |

### Multi-provider & integration

| Recipe                                                     | What it covers                                                    |
| ---------------------------------------------------------- | ----------------------------------------------------------------- |
| [CLI agent with file edits](./cli-agent-with-edits)        | `cli-agent` with `allow_file_edits: true`; structured output      |
| [Hybrid LLM routing](./hybrid-llm-routing)                 | Anthropic + OpenAI in one flow via `meta.runtime.providers`       |
| [oe-mcp as server](./mcp-as-server)                        | Expose OE flows as MCP tools for Claude Code / Codex / Gemini     |
| [MCP resource as a dataset source](./mcp-resource-dataset) | `source.type: mcp-resource`; `mcp.json` config; row normalization |
| [Cross-vendor CLI agent chain](./cross-vendor-chain)       | Claude Code → Codex → Gemini in series; each reads prior output   |

### Registry & publishing

| Recipe                                         | What it covers                                                   |
| ---------------------------------------------- | ---------------------------------------------------------------- |
| [Submit to the registry](./submit-to-registry) | `oe submit`; auto-detected GitHub metadata; pre-submit checklist |

---

More patterns live in the [examples gallery](/examples/) — every bundled example is a runnable recipe.

Stuck? Check [FAQ + troubleshooting](/faq).
