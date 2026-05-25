# OpenExpertise V1 Design

**Date:** 2026-05-25
**Status:** Approved for implementation planning
**Authors:** Project lead + Claude (brainstorming session)

---

## 0. Context and motivation

Anthropic's unreleased `/workflows` feature (preview surfaced in Claude Code v2.1.147/148) reframes enterprise AI: instead of letting an LLM improvise control flow, a deterministic JavaScript orchestrator drives multi-agent work, and the model only fills the leaves. This is the "Code as Law" architecture — and `/workflows` proves it works (e.g., the 97-turn, 6-reviewer branch audit demo).

But `/workflows` is closed source, gated behind `CLAUDE_CODE_WORKFLOWS=1`, lives inside the Claude Code binary, and is fundamentally agent-only at the leaf level. There is no open implementation, and the model leaves no room for non-LLM nodes (datasets, deterministic tools, sub-workflows as first-class data sources).

**OpenExpertise** is an open-source execution engine and authoring standard that covers what `/workflows` does, then layers on three capabilities that turn it from "deterministic agent orchestrator" into "executable expert knowledge":

- **(a) Heterogeneous nodes** — a node can be an `agent`, `skill`, `tool`, `dataset`, or nested `experience`.
- **(d) Persistent structured state** — a per-experience blackboard (SQLite-backed) carries domain memory across runs.
- **(e) Evolution** — an experience is a living artifact: after each run, an advisor proposes diffs (add nodes, tune params, append dataset cases) for human review.

The product hypothesis: this is the missing layer for codifying **tacit expert knowledge** — the senior engineer's release checklist, the master operator's process-tuning rules, the compliance reviewer's mental judge panel — into a portable, executable, diffable graph.

V1 north-star: **reproduce the `/workflows` `review-branch` demo in open source, while exercising heterogeneous nodes + persistent state + evolution end-to-end.**

---

## 1. Positioning

| Dimension | OpenExpertise V1 |
|---|---|
| Audience | Engineers building reusable expert flows in code/DevOps domains (V1); domain experts (factory, medical, finance) in V2+ |
| Relationship to `/workflows` | Open-source superset. Covers the same capability surface; not source-compatible. |
| Distribution | `oe` single binary + `@openexpertise/*` npm packages + `experience-creator` skill installable into `~/.claude/skills/` |
| Authoring model | Agent-assisted (Claude writes the yaml + scaffold files via the `experience-creator` skill), human-reviewable |
| Runtime form | Standalone CLI; not coupled to Claude Code. Can be invoked from Claude Code (as a normal CLI or future MCP server). |

What V1 explicitly is **not**:
- Not a vector-store / RAG framework. Vector stores can be wrapped as MCP datasets later.
- Not a HITL runtime. Human intervention happens at authoring and evolution time, not mid-run.
- Not an LLM-driven planner. Graph topology is fixed at authoring time.
- Not a visual editor / Web UI. YAML + git diff is the V1 interface.
- Not multi-language. TS/Node only for the orchestrator; node `impl` files can be other languages via subprocess.

---

## 2. Key design decisions (decision log)

This section is the audit trail from the brainstorming session — the constraints all later sections must respect.

1. **Positioning:** open-source replacement/superset of `/workflows` with its own runtime.
2. **Flexibility priorities (chosen from a six-option menu):** `a` (heterogeneous nodes), `d` (persistent structured state), `e` (evolution). Explicitly **not** chosen: `b` (adaptive runtime control flow), `c` (HITL runtime nodes), `f` (weak determinism).
3. **V1 use case:** Code/DevOps (review-branch-style). Vertical domains (factory, medical) deferred to V2.
4. **Format:** declarative graph layer (YAML) + node `impl` as escape-hatch files. Not a code-DSL; not pure markdown.
5. **Runtime language:** TypeScript / Node.
6. **State model:** B+B2 — per-experience persistent blackboard (SQLite) plus optional explicit edge data. Both addressing modes coexist; the blackboard is the primary medium.
7. **Node contracts:** 4 first-class kinds (`agent` / `skill` / `tool` / `dataset`) plus `experience` for composition, all conforming to a single internal `Node` interface.
8. **Control-flow primitives:** sequential, fan-out / for-each, pipeline group, conditional edge (`when:` over state/edge data, **not** LLM-driven), bounded loop (`repeat: { until, max_iters, budget }`), phase grouping.
9. **Evolution mechanism:** human or agent can propose changes; runtime never auto-applies; V1 supports `add-node`, `tune-param`, `add-dataset-case`; `add-node` does not include re-wiring edges or removing nodes.
10. **Authoring UX:** an `experience-creator` skill (Claude Code-compatible) drives YAML generation through dialog.
11. **MVP scope:** must-have list below; vector stores, HITL runtime, adaptive flow, cross-experience shared state, Web UI, Python runtime, direct Claude Code integration are explicitly deferred.

---

## 3. Repository layout

pnpm-workspace monorepo:

```
openexpertise/
├── packages/
│   ├── core/                       # runtime: DAG scheduler + state store + dispatchers
│   ├── cli/                        # `oe` command
│   ├── tui/                        # progress dashboard (ink)
│   ├── schema/                     # experience.yaml JSON Schema + generated TS types
│   ├── node-kinds/
│   │   ├── agent/
│   │   ├── skill/
│   │   ├── tool/
│   │   └── dataset/
│   └── skill-experience-creator/   # authoring skill (SKILL.md + assets)
├── examples/
│   └── review-branch/              # V1 anchor example
├── docs/                           # user docs + this spec
└── e2e/                            # end-to-end tests with mocked Anthropic
```

Distribution targets:
- `oe` single binary (bun compile or esbuild + node-pkg).
- `@openexpertise/core`, `@openexpertise/cli`, `@openexpertise/schema` on npm.
- `experience-creator` skill installable into `~/.claude/skills/experience-creator/`.

---

## 4. Experience file layout

An experience is a directory:

```
my-experience/
├── experience.yaml          # graph + state schema + meta
├── prompts/                 # agent-node prompt templates
├── schemas/                 # JSON Schemas for structured outputs and state
├── skills/                  # local skill-node directories (Claude Code skill format)
├── tools/                   # tool-node TS implementations
├── datasets/                # dataset-node source descriptors
└── .openexpertise/          # runtime artifacts (gitignored by default)
    ├── state.sqlite         # persistent blackboard
    ├── cache/               # input-hash → output for resume
    ├── runs/                # per-run event streams (jsonl)
    └── evolution/           # pending evolution proposals
```

`experience.yaml` skeleton:

```yaml
name: review-branch
description: Review the branch across dimensions and verify each finding.
version: 0.1.0

state:
  schema:
    pr_id: { type: string }
    changed_files: { type: array, items: { type: string } }
    past_incidents: { type: array, items: { $ref: "./schemas/incident.json" } }
    findings: { type: array, items: { $ref: "./schemas/finding.json" } }
    risk_score: { type: number }

phases:
  - id: collect
  - id: review
  - id: score

graph:
  nodes:
    - id: load_incidents
      kind: dataset
      phase: collect
      source:
        type: sqlite
        uri: ./datasets/incidents.db
        query: "SELECT * FROM incidents WHERE date > date('now','-180 days')"
      writes: [past_incidents]

    - id: list_changes
      kind: tool
      phase: collect
      impl: ./tools/list_pr_changes.ts
      args: { pr_id: $.pr_id }
      writes: [changed_files]

    - id: bug_review
      kind: skill
      phase: review
      impl: ./skills/bug-review/
      inputs:
        files: $.changed_files
        priors: $.past_incidents
      schema: ./schemas/finding-list.json
      writes: [findings]

    - id: score
      kind: agent
      phase: score
      prompt: ./prompts/score.md
      reads: [findings]
      schema:
        type: object
        required: [risk_score]
        properties:
          risk_score: { type: number }
      writes: [risk_score]

  edges:
    - { from: load_incidents, to: bug_review }
    - { from: list_changes,   to: bug_review }
    - { from: bug_review,     to: score }
```

State-reference syntax uses JSONPath-like expressions (`$.field`, `$.field.subfield`) inside YAML scalar values. No template engine — complex projections live inside `tool` nodes.

---

## 5. Runtime data flow

A single `oe run my-experience [--args ...]` invocation:

```
1. load + parse experience.yaml
2. validate
     - JSON Schema for the file
     - referential integrity (every $.foo resolves; every node id unique; edges connect real nodes)
     - state schema is internally consistent (writes ⊆ schema fields)
3. build DAG; detect cycles; expand fan-out / pipeline groups into scheduling units
4. open RunContext { run_id, args, budget, event_bus, state_store }
5. scheduling loop (topological, with concurrency):
     for each ready node N:
       bundle = {
         state_view: read-only snapshot of N.reads at this moment,
         edge_inputs: payloads from incoming edges,
         args: resolved N.args literals
       }
       cache_key = hash(N.config_canonical, bundle_canonical)
       if cache hit:
         output = cached
       else:
         output = dispatcher[N.kind].run(N, bundle, ctx)
       apply output.state_delta to state_store (transactional, schema-checked)
       forward output.edge_output to outgoing edges
       emit lifecycle events to event_bus
6. on completion:
     - write .openexpertise/runs/<run_id>.jsonl
     - trigger evolution-advisor skill (if enabled)
```

**Event bus** is the only channel between the runtime core and any UI/observer. TUI, `oe inspect`, and future webhooks all subscribe to it. The core never directly imports TUI code.

**Resume** behavior: `oe resume <run_id>` re-runs with the same args; every node hashes the same way until the first divergence (edit, new data, evolved graph), at which point it and everything downstream re-executes. Matches `/workflows` resume semantics.

---

## 6. Node dispatcher contract

All five node kinds conform to one internal interface (not exposed to YAML authors):

```ts
interface NodeInputBundle {
  state_view: Readonly<Record<string, unknown>>
  edge_inputs: Record<string, unknown>
  args: Record<string, unknown>
}

interface NodeOutput {
  state_delta: Record<string, unknown>   // schema-checked on write
  edge_output?: unknown
  metrics?: { tokens_in?: number; tokens_out?: number; cost_usd?: number }
}

interface NodeDispatcher {
  kind: 'agent' | 'skill' | 'tool' | 'dataset' | 'experience'
  resolve(node: NodeSpec, ctx: RunContext): Promise<ResolvedImpl>
  run(impl: ResolvedImpl, bundle: NodeInputBundle, ctx: RunContext): Promise<NodeOutput>
}
```

Per-kind details:

- **agent** — direct Anthropic SDK call. Prompt assembled from the referenced template + `state_view`/`edge_inputs`/`args` interpolation. If `schema` is set, a structured-output tool is constructed and AJV-validated.
- **skill** — same as agent, plus the SKILL.md frontmatter + body is loaded as system context. Compatible with the existing `~/.claude/skills/` directory layout, so any Claude Code skill drops in as a node with zero migration.
- **tool** — dynamic `import()` of the impl module, calling its default export `async (input, ctx) => NodeOutput`. HTTP endpoints are reached via a thin `tool-http` wrapper shipped in `packages/node-kinds/tool/` in V1. The MCP wrapper (`tool-mcp`) ships as a nice-to-have if time permits, otherwise V2.
- **dataset** — switch on `source.type` (`file` / `sqlite` / `http` / `mcp-resource`), load, optionally apply `transform` (JSONPath projection), emit as `state_delta` on the declared `writes` field.
- **experience** — recursive invocation, depth-limited to 1 in V1. Child state defaults to `isolated`; `shared` mode is opt-in.

---

## 7. State layer (blackboard)

**Storage** — one SQLite file per experience, two tables:

```sql
state_snapshot (
  field      TEXT PRIMARY KEY,
  value      JSON,
  updated_at TIMESTAMP,
  updated_by_node TEXT,
  updated_by_run  TEXT
);

state_history (
  id              INTEGER PRIMARY KEY,
  field           TEXT,
  value_old       JSON,
  value_new       JSON,
  node_id         TEXT,
  run_id          TEXT,
  ts              TIMESTAMP
);
```

`state_snapshot` answers "what is the current value?". `state_history` is append-only and feeds the evolution advisor and audit reports.

**Schema enforcement** — every `state_delta` is AJV-validated against the experience's `state.schema` before write.

**Concurrent writes from fan-out** — when a node's fan-out replicas all write the same field, the field's schema must declare a merge strategy:
- `array_append` (most common — each replica appends one item),
- `set_once` (only one replica may write; second write throws),
- `last_wins` (explicit override, requires `unsafe: true`).

A field without a declared strategy whose writers conflict is a **validation-time error** (not a runtime surprise).

**Cross-run persistence** — state is **not** cleared between runs. This is the point: "past N batches", "historical incidents", "tuned thresholds" naturally accumulate. `oe reset-state` is the explicit escape hatch.

---

## 8. Evolution mechanism

After each run, runtime invokes the bundled `evolution-advisor` skill, which reads:
- the run's event stream (`.openexpertise/runs/<run_id>.jsonl`),
- the state diff (rows touched in `state_history` for this run_id),
- the current `experience.yaml`,

and produces `.openexpertise/evolution/<run_id>.md`, a structured proposal containing three permitted operations:

- **`add-node`** — a new node + the edges that connect it. Existing edges are not rewired.
- **`tune-param`** — adjust a literal in `experience.yaml` (a threshold, a prompt path, a model alias, a phase label).
- **`add-dataset-case`** — append rows to a dataset source (typically the same one fed back into `past_incidents`-style fields).

Each proposal is rendered as a unified diff block, with a confidence tag (`high` / `medium` / `low`) and a one-paragraph rationale linking it back to evidence in the run.

**Operations explicitly out of V1:** removing nodes, rewiring edges, changing node kinds, changing state schema. These require more invasive review and are deferred to V2.

**Application** — the user reviews and either `git apply`s the diff, edits before applying, or discards. Runtime never modifies `experience.yaml`. This preserves git as the single source of truth for evolution history.

---

## 9. Control-flow primitives

| Primitive | YAML form | Semantics |
|---|---|---|
| Sequential | edges form a DAG | topological scheduling; node ready when all predecessors complete |
| Fan-out | `for_each: $.list_field` on a node, plus `concurrency: N` | runtime spawns N replicas of the node, one per item; replicas write to the same field via the declared merge strategy |
| Pipeline group | a `pipeline:` block listing stage node ids, plus an `items:` source | items stream through stages; no barrier between stages (matches `/workflows` `pipeline()` semantics) |
| Conditional edge | `when: <expr>` on an edge | edge is "live" only if expr (over state + edge data) is truthy; data-driven, never LLM-driven |
| Bounded loop | `repeat: { until: <expr>, max_iters: N, budget: <tokens> }` around a node group | hard stop required — at least one of `until` / `max_iters` / `budget` must terminate; otherwise validation error |
| Phase grouping | `phase: <id>` on a node, plus `phases:` list at top level | purely cosmetic; surfaces in TUI / `oe inspect` |

Expressions for `when:` and `until:` use the same JSONPath-like dialect as state references, augmented with a small set of operators (`==`, `!=`, `>`, `<`, `>=`, `<=`, `&&`, `||`, `length(...)`). Implemented via a small evaluator in `packages/core` — no `eval`, no full JS, no template engine.

---

## 10. Authoring UX: `experience-creator` skill

OpenExpertise ships a Claude Code-compatible skill (`packages/skill-experience-creator/`) installable into `~/.claude/skills/experience-creator/`. The `SKILL.md` walks Claude through a fixed authoring procedure (mirroring the discipline of `claude-code-workflow-creator`):

1. Establish the goal: what is this experience for? Who runs it? When is it "done"?
2. Identify the unit of work and the topology (fan-out / pipeline / sequential).
3. Identify state fields and their types (this is the d-axis hard work).
4. Pick node kinds and their `impl` paths.
5. Draft `experience.yaml`; scaffold `prompts/`, `tools/`, `schemas/` stubs.
6. Run `oe validate`.
7. Offer a `--dry-run` invocation with mock data.

The output is a complete, reviewable experience directory — not a one-shot generated artifact. The user is expected to read and refine.

---

## 11. CLI surface

```
oe init <name>                        # scaffold a new experience
oe validate [path]                    # static checks (schema, refs, control flow stops)
oe run <experience> [--args ...]      # execute; returns run_id; prints event stream
oe resume <run_id>                    # re-run with cache, re-executing only stale nodes
oe inspect <run_id>                   # render graph trace + state snapshot
oe diff <experience>                  # show pending evolution proposals
oe state <experience> [field]         # inspect/dump blackboard
oe reset-state <experience>           # wipe blackboard (interactive confirm)
```

`oe run` runs the experience in foreground by default; `--detach` puts it in background and prints a run id for later `oe inspect`. The TUI (`oe run --tui`) is an ink-based dashboard subscribing to the same event bus.

---

## 12. Caching and resume

Cache key per node = `hash(canonical_node_config, canonical_input_bundle, runtime_version)`.

`canonical_node_config` = the node's YAML subtree, with formatting normalized.
`canonical_input_bundle` = `{ state_view sliced to declared reads, edge_inputs, args }`, sorted-key JSON.
`runtime_version` = the OpenExpertise core version, so a runtime bump invalidates cache (safer than subtly different behavior).

Cache hits replay the exact `NodeOutput` (incl. metrics). LLM-backed nodes are deterministic from the cache's point of view — same inputs always replay the same recorded output.

Cache lives under `.openexpertise/cache/`. `oe run` accepts `--no-cache` and `--cache-only` flags for debugging.

---

## 13. Error handling

**Validation errors** abort before the run starts. Errors include precise YAML line numbers and the failing rule (`E001: undeclared state field 'foo' referenced in node 'bar'`).

**Runtime node errors** follow per-node `on_error` policy declared in YAML:

```yaml
- id: flaky_api
  kind: tool
  impl: ./tools/external_api.ts
  on_error: { policy: retry, attempts: 3, backoff: exponential, base_ms: 500 }
```

Policies: `retry(attempts, backoff, base_ms)` | `skip` (downstream skipped, siblings continue) | `fail_run`. Default is `skip` — matches the `/workflows` "result arrays can have holes" pattern.

**Budget overrun** in a `repeat` loop is treated as a normal termination, not an error.

**Schema-validation failure on `state_delta`** is `fail_run` and not configurable — silent corruption of the blackboard would defeat the entire d-axis purpose.

---

## 14. Testing strategy

- **Schema tests** in `packages/schema/` — every example YAML in the docs is parsed and validated in CI.
- **Dispatcher unit tests** — each kind has mocked `impl` and asserts the dispatcher's bundle / output contract.
- **State store tests** — schema validation, history append, concurrent fan-out merge strategies.
- **E2E** in `e2e/` — full `review-branch` run with Anthropic SDK mocked from fixtures. CI runs this on every PR; deterministic green is required to merge.
- **Snapshot tests for evolution reports** — given a fixed run event stream + state diff, the advisor produces the same markdown.
- **TUI tests** — ink-testing-library snapshot tests on the event bus → render pipeline.

---

## 15. Observability

- Every run writes `.openexpertise/runs/<run_id>.jsonl`, one event per line. Event types: `run.started`, `node.ready`, `node.started`, `node.finished`, `node.failed`, `state.write`, `run.finished`.
- Token / cost accounting is per-node and rolled up per-run; surfaced in the TUI and in `oe inspect`.
- Logs use `pino` structured JSON; `--log-format=pretty` for humans.
- All event types are spec'd in `packages/schema/events.json` so external dashboards can subscribe without reading source.

---

## 16. MVP scope (final)

**Must-have for V1 release**

1. `experience.yaml` JSON Schema + parser + validator
2. Dispatcher for all 4 node kinds (`agent`, `skill`, `tool`, `dataset`) + 1-level `experience` nesting
3. Control flow primitives: sequential, fan-out, pipeline group, conditional edge, bounded loop, phase
4. State layer: per-experience SQLite blackboard, schema-enforced writes, history table, three merge strategies
5. CLI: `init`, `validate`, `run`, `resume`, `inspect`, `state`, `reset-state`
6. Cache + resume
7. Authoring skill (`experience-creator`)
8. Complete `review-branch` example, dogfooded by the OpenExpertise team itself
9. TUI (ink-based, subscribed to event bus)
10. E2E test suite with mocked Anthropic
11. `evolution-advisor` skill + `oe diff` end-to-end (the e-axis proof point; promoted from nice-to-have because §18 success criteria depend on it)

**Nice-to-have for V1 (ship if time permits)**

- MCP tool wrapper (`tool-mcp`)
- `oe init` template gallery (a few more example shapes)
- Per-node retry telemetry surfaced in TUI

**Explicitly out of V1**

- Vector-store dataset source
- HITL runtime nodes
- Adaptive / LLM-driven control flow
- Cross-experience shared state (`C` from the state-model menu)
- Web UI, visual graph editor
- Python or other-language runtimes
- Direct Claude Code integration (e.g., shipping as an MCP server `/workflows`-equivalent) — this is V2

---

## 17. Open questions to revisit before implementation planning

These are intentionally left open and should be resolved during the implementation-planning phase, not now:

1. Exact JSONPath dialect — adopt an existing library (e.g., `jsonpath-plus`) or hand-roll a small subset? Trade-off is bundle size vs. predictable behavior.
2. SQLite library choice — `better-sqlite3` (sync, native, fast) vs. `node:sqlite` (built-in, async, newer)? Affects bundling for the single-binary distribution.
3. Whether `oe run` should default to foreground or background. `/workflows` defaults to background; CLI users typically expect foreground.
4. Exact frontmatter compatibility with Claude Code skills — pin a version, document the supported subset.
5. Cost / budget tracking precision — Anthropic price tables change; do we hard-code a snapshot or query a registry?

These are real choices, but none gate the high-level design.

---

## 18. Success criteria for V1

V1 ships when all of the following are simultaneously true:

- `examples/review-branch/` runs end-to-end against the real Anthropic API and produces a sensible `findings` + `risk_score`.
- The same example runs in CI against mocked fixtures, deterministic green.
- An external user can install OpenExpertise (`npm i -g @openexpertise/cli` or download the binary) and complete the "build your first experience" tutorial in under 30 minutes.
- The `experience-creator` skill, installed into `~/.claude/skills/`, walks a new user from "I want to make an experience for X" to a runnable directory.
- The `evolution-advisor` produces a useful diff at least once for the `review-branch` example (i.e., we've dogfooded evolution ourselves).

That last bullet is the project's identity test — if evolution doesn't produce something useful even on our own anchor example, we have not actually built OpenExpertise; we have built an open-source `/workflows`.
