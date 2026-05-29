# Architecture overview

OpenExpertise is a YAML-driven DAG runner for heterogeneous AI workflows. This page describes how the pieces fit together: the physical package layout, the runtime data flow, and the complete lifecycle of an `oe run` and an `oe ultra` invocation.

---

## System diagram

```
  experience.yaml                 .openexpertise/
                                  ├─ state.sqlite   (typed blackboard, persistent)
                                  ├─ runs/<id>.jsonl (event log, replayable)
                                  ├─ cache/          (per-node memoization)
                                  └─ evolution/      (advisor proposals)
                     │
                     ▼
     ┌─────────────────────────────────────┐
     │  Sequential or Parallel Scheduler   │  ◀── --concurrency N
     │  (topological waves, bounded pool)  │      runtime.concurrency in YAML
     └─────────────────────────────────────┘
                     │
 ┌──────────┬────────┼───────┬──────────────┬──────────────┐
 ▼          ▼        ▼       ▼              ▼              ▼
┌────────┐ ┌──────┐ ┌─────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐
│ tool   │ │agent │ │skill│ │ dataset  │ │experience│ │  cli-agent   │
│ (.mjs) │ │(LLM) │ │     │ │file/     │ │(nested)  │ │ claude-code  │
│        │ │      │ │     │ │sqlite/   │ │          │ │ / codex /    │
│        │ │      │ │     │ │http      │ │          │ │ gemini       │
└────────┘ └──────┘ └─────┘ └──────────┘ └──────────┘ └──────────────┘
 └──────────────────────────────┬──────────────────────────────────────┘
                                ▼
                       state writes + events
                       (merge: array_append | set_once | last_wins)
```

---

## Package map (15 packages)

| Package                             | NPM name                                  | What it exports                                                                                                                                                |
| ----------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/schema`                   | `@openexpertise/schema`                   | TypeScript types, JSON Schema, `parseExperienceYaml`, `validateExperienceSpec`                                                                                 |
| `packages/core`                     | `@openexpertise/core`                     | `runExperience`, `EventBus`, `StateStore`, `DispatcherRegistry`, `SequentialScheduler`, `ParallelScheduler`, `CacheStore`, `interpolatePrompt`, all core types |
| `packages/node-kinds-tool`          | `@openexpertise/node-kinds-tool`          | `ToolDispatcher` — resolves `.mjs` modules and calls their default export                                                                                      |
| `packages/node-kinds-agent`         | `@openexpertise/node-kinds-agent`         | `AgentDispatcher`, `AnthropicLLMClient` — LLM call + AJV structured-output validation                                                                          |
| `packages/node-kinds-skill`         | `@openexpertise/node-kinds-skill`         | `SkillDispatcher`, `loadSkillFile` — SKILL.md-backed LLM nodes                                                                                                 |
| `packages/node-kinds-dataset`       | `@openexpertise/node-kinds-dataset`       | `DatasetDispatcher` — file (JSON/JSONL/CSV), SQLite, HTTP, mcp-resource sources                                                                                |
| `packages/node-kinds-experience`    | `@openexpertise/node-kinds-experience`    | `ExperienceDispatcher` — nested sub-experience runner with isolated SQLite state                                                                               |
| `packages/node-kinds-cli-agent`     | `@openexpertise/node-kinds-cli-agent`     | `CliAgentDispatcher`, `ClaudeCodeProvider`, `CodexProvider`, `GeminiProvider`, JSON output parser                                                              |
| `packages/llm-openai`               | `@openexpertise/llm-openai`               | `OpenAILLMClient` — wraps any OpenAI-compatible endpoint (Azure, vLLM, Ollama) with 429 retry                                                                  |
| `packages/evolution`                | `@openexpertise/evolution`                | `EvolutionAdvisor` — reads event log + state diff and proposes YAML patches                                                                                    |
| `packages/authoring`                | `@openexpertise/authoring`                | Schema-aware scaffold, validate, and edit helpers for `oe ultra` and `oe init`                                                                                 |
| `packages/tui`                      | `@openexpertise/tui`                      | Ink-based terminal dashboard for `oe run --tui` — live node status, token counter, activity feed                                                               |
| `packages/mcp-server`               | `@openexpertise/mcp-server`               | `oe-mcp` MCP server exposing `oe_validate`, `oe_state`, `oe_inspect`, `oe_run`, `oe_evolve`, `oe_ultra`, `oe_ultra_revise`                                     |
| `packages/cli`                      | `@openexpertise/cli`                      | The `oe` CLI binary — all commands wired via Commander                                                                                                         |
| `packages/skill-experience-creator` | `@openexpertise/skill-experience-creator` | SKILL.md package teaching an LLM how to author experiences (used by `oe ultra`)                                                                                |

---

## Dependency graph (simplified)

```
schema
  └─ core (depends on schema + better-sqlite3)
       ├─ node-kinds-tool
       ├─ node-kinds-agent  (+ @anthropic-ai/sdk)
       ├─ node-kinds-skill
       ├─ node-kinds-dataset (+ csv-parse + better-sqlite3)
       ├─ node-kinds-experience
       ├─ node-kinds-cli-agent
       ├─ llm-openai (+ openai sdk)
       └─ evolution
            └─ authoring
                 └─ tui
                      └─ cli (entry point)
                           └─ mcp-server
```

Circular dependency risk: `node-kinds-experience` calls `runExperience` from `core`. It avoids the cycle by accepting `runExperience` as a constructor injection (the `ExperienceDispatcherOpts.runExperience` parameter).

---

## `oe run` request lifecycle

1. **Parse** — `packages/cli/src/commands/run.ts` reads `experience.yaml`, calls `parseExperienceYaml` from `@openexpertise/schema`.

2. **Validate** — `validateExperienceSpec` checks node ids are unique, edges reference real nodes, `reads`/`writes` fields are declared in `state.schema`.

3. **Bootstrap** — A `DispatcherRegistry` is constructed with one dispatcher per node kind. An `EventBus` is created. If `--tui` was passed, the TUI subscribes to the bus before `runExperience` is called.

4. **Run** — `runExperience(opts)` from `@openexpertise/core`:
   - Creates `.openexpertise/` under the experience directory.
   - Opens `state.sqlite` in WAL mode.
   - Opens the JSONL event sink at `.openexpertise/runs/<run-id>.jsonl`.
   - Emits `run.started`.
   - Builds the DAG from edges (topological sort).
   - Selects `SequentialScheduler` (concurrency = 1) or `ParallelScheduler` (concurrency > 1).

5. **Schedule** — The scheduler iterates topological waves. For each ready node:
   - Checks the cache. If hit: skip execution, replay the cached `state_delta`, emit `node.skipped(reason: cached)`.
   - Calls `dispatcher.resolve(node, ctx)` — loads the implementation (`.mjs` module, prompt file, SKILL.md, etc.).
   - Calls `dispatcher.run(impl, bundle, ctx)` where `bundle` = `{ args, state_view, edge_inputs }`.

6. **State write** — The returned `NodeOutput.state_delta` is written to SQLite via `StateStore.write()`. Each write is type-checked against `state.schema` and merged using the declared strategy (`array_append` / `set_once` / `last_wins`). A `state.write` event is emitted per field.

7. **Events** — All `node.started`, `node.finished`, `node.failed`, `node.tokens`, `node.activity` events are appended to the JSONL sink synchronously. Subscriber errors do not abort the run.

8. **Finish** — Emits `run.finished`. Returns `{ runId, status, finalState }`. If `--evolve` was passed, calls `EvolutionAdvisor` and writes a proposal to `.openexpertise/evolution/<run-id>.md`.

---

## `oe ultra` request lifecycle

`oe ultra "<task description>"` follows a two-pass LLM authoring flow:

1. **Analyze pass** — the task description is sent to the configured LLM with the experience-creator SKILL.md as a system prompt. The model produces a structured plan: phases, nodes, state schema keys.

2. **Synthesize pass** — the plan is sent back to the LLM to emit the final `experience.yaml` content plus stub `.mjs` tool files and prompt `.md` files.

3. **Validate** — the synthesized YAML is passed through `validateExperienceSpec`. If it fails, the error is fed back to the LLM for one correction attempt.

4. **Write** — files land in `.openexpertise/drafts/<slug>/`. The user inspects, then promotes with `mv <slug>/ <name>/` and runs `oe run <name>`.

---

## State schema — SQLite tables

Two tables in `state.sqlite`:

| Table            | Purpose                                                                                             |
| ---------------- | --------------------------------------------------------------------------------------------------- |
| `state_snapshot` | One row per field. Current value (JSON-encoded). `updated_by_node`, `updated_by_run`, `updated_at`. |
| `state_history`  | Append-only audit log. Previous value, new value, node id, run id, timestamp.                       |

WAL mode is set on open. Reads are read-only snapshots. Writes are wrapped in a transaction (one per `state_delta`).

---

## File layout under `.openexpertise/`

```
<experience-dir>/
└─ .openexpertise/
   ├─ state.sqlite            # persistent blackboard
   ├─ runs/
   │  └─ <uuid>.jsonl         # one file per run; all events in order
   ├─ cache/
   │  └─ <sha256>.json        # one file per node+input hash
   ├─ evolution/
   │  └─ <run-id>.md          # advisor proposal (git-apply-ready patch inside)
   ├─ drafts/                  # oe ultra output staging area
   │  └─ <slug>/
   │     ├─ experience.yaml
   │     ├─ prompts/
   │     └─ tools/
   └─ sub/                     # nested experience state
      └─ <node-id>-<uuid>.sqlite
```

---

## See also

- [Concepts: Scheduler](/concepts/scheduler)
- [Concepts: Dispatchers](/concepts/dispatchers)
- [Concepts: Events and event log](/concepts/events)
- [Concepts: State (SQLite blackboard)](/concepts/state)
- [Observability](/operations/observability)
- [Deployment](/operations/deployment)
