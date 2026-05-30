---
title: Glossary
description: One-line definitions of every term you'll see across the docs. Read top-to-bottom for a quick conceptual tour.
---

# Glossary

Every term in alphabetical order. Each entry links to the deep-dive page.

::: tip
Read this page top-to-bottom for a 5-minute conceptual tour of the system.
:::

## `add-dataset-case`

One of the three operations [`oe evolve`](/reference/cli/evolve) can propose. Adds an item to a list a tool seeds. See [Evolution loop](/concepts/evolution-loop).

## `add-node`

The most powerful evolution operation. Proposes adding a new node + edges to address a gap the advisor observed. See [Evolution loop](/concepts/evolution-loop).

## advisor

`EvolutionAdvisor` — the LLM-backed component that reads a run's events + state diff and proposes graph upgrades as `git apply`-ready diffs. See [EvolutionAdvisor API](/reference/api/evolution-advisor).

## `agent`

A node kind that calls an LLM with a prompt + inline JSON schema and validates the structured output via AJV. The most common LLM-touching node. See [agent node deep dive](/concepts/node-agent).

## AJV

The JSON-schema validator the runtime uses for `agent` structured outputs. Compiled once per node at resolve-time. See [Code-as-Law](/concepts/code-as-law).

<div v-pre>

## `args:`

A YAML block on a node specifying literal arguments passed to the dispatcher. Tool nodes get them spread into the function call; agent nodes interpolate them into the prompt.

## `array_append`

A state field merge strategy that concatenates arrays. Used heavily with `for_each` so iterations accumulate findings. See [State](/concepts/state).

## blackboard

Synonym for the SQLite-backed state store. All nodes read/write fields against the same blackboard. Field schemas declared in `state.schema` enforce the contract. See [State](/concepts/state).

## cache

Per-content-hash memoization of `NodeOutput`. Same inputs → cached result on re-run. Backs `oe resume`. See [Cache](/concepts/cache).

## `cli-agent`

A node kind that spawns a subprocess for `claude` / `codex` / `gemini` / your-own-CLI. The cross-vendor showcase. See [cli-agent deep dive](/concepts/node-cli-agent) and [tri-cli example](/examples/tri-cli-orchestration).

## Code-as-Law

Our central thesis: the graph is declared in version-controlled YAML and never changes at runtime. The LLM only fills in node bodies, not the flow. See [Code-as-Law](/concepts/code-as-law).

## `concurrency:`

Two flavors. **`runtime.concurrency: N`** (top-level) — outer scheduler runs N independent nodes in parallel. **`for_each.concurrency: N`** (per-node) — inner fan-out runs N iterations in parallel. They compose.

## conditional edge

An edge with a `when:` JSONPath-ish expression. If the expression is false, the target node is skipped. See [Control flow](/concepts/control-flow).

## `dataset`

A node kind that loads rows from a file / SQLite / HTTP / MCP resource. Typically the first node in an ETL-style flow. See [dataset deep dive](/concepts/node-dataset).

## DAG

Directed acyclic graph. Edges express dependency, not data transport. Validated by `oe validate` before any run. See [Control flow](/concepts/control-flow).

## dispatcher

The component that knows how to execute one node kind. One dispatcher per kind. Pluggable via the `DispatcherRegistry`. See [Dispatchers](/concepts/dispatchers).

## `edge_output`

The optional second return value from a tool: data passed to direct successors via `_edge_inputs` without committing to state. Use for transient values you don't want in your audit trail.

## editor autocomplete

Authoring `experience.yaml` with autocomplete, hover docs, and inline validation in VS Code / any yaml-language-server editor, powered by the published JSON Schema. `oe init` wires it automatically; existing projects run `oe schema --write` and add a `# yaml-language-server: $schema=` header. See [Editor support](/guide/editor-support).

## event

A single runtime moment — `node.started`, `state.write`, `node.tokens`, etc. Emitted by `EventBus`, persisted as one line per event in `.openexpertise/runs/<run-id>.jsonl`. See [Events](/concepts/events).

## evolution

Author → run → evolve loop. The advisor proposes; you `git apply`. Closes the loop where the same LLM authored, ran, and now upgrades the graph. See [Evolution loop](/concepts/evolution-loop).

## experience

A single workflow — one `experience.yaml` + its tools/, prompts/, optional skills/. The unit of authoring, running, and evolving. See [What is an experience?](/concepts/experiences).

## `experience` (node kind)

A node kind that nests another full experience inside the current one. Useful for composing reusable sub-workflows. See [experience node deep dive](/concepts/node-experience).

## `for_each`

Fan-out primitive: run the same node once per element in a JSONPath array source. With `concurrency: N`, iterations run in parallel. See [Control flow](/concepts/control-flow).

## JSONL

JSON-lines event log. One event per line, append-only, crash-safe via `appendFileSync`. Lives at `.openexpertise/runs/<run-id>.jsonl`. See [Events](/concepts/events).

## JSONPath

The (tiny) DSL used in `when:` clauses and `for_each.source`. Supports `$.field`, `$.field.subfield`, `length($.array)`, comparison + boolean operators. See [Control flow](/concepts/control-flow).

## `last_wins`

A state field merge strategy: each write overwrites the previous value. Default for scalar fields. See [State](/concepts/state).

## LLMClient

The provider-agnostic facade for LLM calls. Wraps Anthropic + OpenAI SDKs behind one `complete()` method with tools, structured output, retries. See [LLMClient API](/reference/api/llm-client).

## MCP server

`oe-mcp` — the Model Context Protocol server that exposes OE's primitives as tools any MCP-compatible client (Claude Desktop, Cursor, etc.) can call. The inbound bridge. See [MCP server guide](/guide/mcp-server).

## merge strategy

How a state field combines successive writes. Three options: `set_once` (first write wins), `last_wins` (each overwrites), `array_append` (concat). Required in `state.schema`. See [State](/concepts/state).

## node

A vertex in the graph. Has a `kind`, an `id`, declares `reads` and `writes` against state. Dispatched by the kind-specific dispatcher. See [Node kinds](/concepts/node-kinds).

## node kind

One of six: `tool` / `agent` / `skill` / `dataset` / `experience` / `cli-agent`. Each has its own dispatcher and its own YAML shape. See [The 6 node kinds](/concepts/node-kinds).

## `oe`

The CLI binary. Aliases: `npx @openexpertise/cli` or `node packages/cli/dist/bin.js` while developing. Commands: `init`, `validate`, `run`, `resume`, `inspect`, `state`, `reset-state`, `evolve`, `diff`, `ultra`, `ultra-revise`, `graph`, `schema`, `doctor`. See [CLI reference](/reference/cli/).

## `oe graph`

The CLI subcommand `oe graph [path]` that renders an experience's DAG as a Mermaid `flowchart` (phase subgraphs, per-kind node shapes/colors, `for_each` + `when` edge labels). Prints to stdout; `--html` emits a self-contained page. Pure transform — no API key. See [Visualize & report](/guide/visualizing) and [oe graph](/reference/cli/graph).

## `on_error`

Per-node failure policy: `fail` (default), `skip` (continue, cascade skip), `retry` (with `max_attempts` and `backoff_ms`). See [Error policies](/guide/on-error).

## parallel scheduler

The wave-based scheduler that runs all ready-at-the-same-wave nodes concurrently up to `runtime.concurrency`. The default when `concurrency > 1`. See [Scheduler](/concepts/scheduler).

## phase

A label on nodes / pipelines / loops grouping execution stages. Useful in the TUI for visual grouping and in events for filtering.

## pipeline

A group of nodes that runs per-item end-to-end before the next item starts. Useful for ETL-style row processing. See [Control flow](/concepts/control-flow).

## prompt file

A `.md` file referenced by an `agent` or `skill` node. Plain markdown with `{{var}}` interpolation. Lives next to `experience.yaml`. See [Prompt files](/guide/prompt-files).

## provider

The LLM backend (anthropic / openai / claude-code / codex / gemini). Configured in env or `runtime.providers`. Different node kinds pick which to use. See [Run with LLM](/guide/run-with-llm).

## quality loop

The internal critique→revise loop `oe ultra` (and `oe ultra-revise`) runs after the first draft: a critic scores decomposition + prompt quality, deterministic validation/preflight errors feed an incremental reviser, and the best-scoring round is kept (monotonicity gate — never worse than the one-shot). Tuned via `--max-rounds`, `OE_ULTRA_SCORE_BAR`, `OE_ULTRA_CRITIC_MODEL`. See [oe ultra](/reference/cli/ultra).

## `reads:` / `writes:`

Per-node lists declaring which state fields the node consumes / produces. Used by the scheduler to determine dependencies (combined with edges). Auto-validated against `state.schema`. See [State](/concepts/state).

## resume

Re-run an experience from where a prior run failed or was interrupted. Cached steps skip; only dirty or downstream-of-dirty nodes execute. See [Resume + cache](/guide/resume-cache).

## `runExperience`

The programmatic API for executing an experience without the CLI. Used inside services, tests, custom UIs. See [runExperience API](/reference/api/run-experience).

## run-id

A run's unique identifier (`run-2026-05-26-a1b2c3` format). Used by `oe inspect`, `oe state`, `oe diff`, `oe evolve`. Lives in the events log filename and in every event payload.

## SCHEMA.md (alternate spelling)

The published JSON schema for `experience.yaml`. Imported by IDEs for autocomplete. See [YAML schema reference](/reference/schema).

## `set_once`

A merge strategy: only the first write to a field is accepted; subsequent writes error. Use for inputs that must not be re-derived. See [State](/concepts/state).

## sequential scheduler

The simpler scheduler — runs ready nodes one at a time in topological order. Used when `runtime.concurrency` is 1 (the default). See [Scheduler](/concepts/scheduler).

## skill

A reusable LLM capability packaged as `SKILL.md` (frontmatter + body). Invoked by `kind: skill` nodes. Similar shape to Anthropic skills. See [skill node deep dive](/concepts/node-skill).

## SOP

Standard Operating Procedure. The kind of workflow OpenExpertise was designed for: same steps every time, leaves a trail, gets better at it.

## state

The SQLite blackboard. Fields declared in `state.schema`, written by nodes, queryable via `oe state`. See [State](/concepts/state).

## state.schema

The contract for what fields exist, what their type is, and how successive writes merge. Validated at `oe validate` time. See [State](/concepts/state).

## structured output

The pattern where the LLM is forced to call a specific tool (`structured_output`) whose argument schema is the agent's inline AJV schema. Guarantees shape. See [agent node deep dive](/concepts/node-agent).

## subagent

In OpenExpertise's docs this term is reserved for **Claude Code's** `Agent` tool — not OE itself. We don't have a "subagent" primitive.

## `tool`

A node kind that runs a JS function. Deterministic, no LLM. The most common node. See [tool node deep dive](/concepts/node-tool).

## TUI

Terminal UI dashboard, rendered with Ink/React. Shows live node status, current activity, tokens. Enabled with `--tui`. See [TUI dashboard](/guide/tui).

## `tune-param`

One of three evolution operations. Tunes an existing node's parameter (timeout, concurrency, on_error policy, etc.). See [Evolution loop](/concepts/evolution-loop).

## `ultra`

The CLI subcommand `oe ultra "<task>"` that asks an LLM to author a complete experience (YAML + tools + prompts) for a task. The single-keyword authoring shortcut. See [oe ultra command](/reference/cli/ultra) and [UltraExpertise API](/reference/api/ultra-expertise).

## v-pre

VitePress directive for "don't parse Vue syntax". Used in [Prompt files](/guide/prompt-files) docs where literal `{{` is needed.

## wave

The unit of parallel-scheduler execution. All ready-at-the-same-wave nodes run concurrently; the next wave begins when the current one's nodes are done or in flight up to concurrency limit. See [Scheduler](/concepts/scheduler).

## `when:`

A JSONPath-ish boolean expression on an edge. If false, the target node is skipped. The conditional control-flow primitive. See [Control flow](/concepts/control-flow).

## workflow

A synonym for "experience" — what OpenExpertise codifies. Anytime your team does the same multi-step thing repeatedly with some LLM judgment in the middle.

## YAML schema

The single source of truth for `experience.yaml` shape. Validated by `oe validate`. Drives editor autocomplete. Published as JSON Schema at [/reference/schema](/reference/schema).

</div>
