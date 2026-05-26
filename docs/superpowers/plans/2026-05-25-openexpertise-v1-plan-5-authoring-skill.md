# OpenExpertise V1 — Plan 5: `experience-creator` Authoring Skill

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the `experience-creator` skill — a Claude Code-compatible skill that walks Claude through authoring a new OpenExpertise experience. Users install it into `~/.claude/skills/experience-creator/` and ask Claude to "make an experience for X"; the skill carries the procedure, the format reference, and a few starter templates.

**Architecture:** The skill is a standalone package `@openexpertise/skill-experience-creator/` whose contents are designed to be `cp -R`-ed into a user's `~/.claude/skills/`. The package builds nothing — its source files are the skill itself. Tests verify (a) the SKILL.md frontmatter is well-formed, (b) the example templates parse against the `experience.schema.json`, and (c) the validator script in `scripts/` is runnable.

**Tech Stack:** No new deps. The skill is content (markdown + YAML) plus one small validator script reusing `@openexpertise/schema`.

**Scope explicitly excludes:**
- Evolution-advisor skill (Plan 6)
- Auto-publication to a skills registry — V1 install is a manual `cp -R`

---

## File structure

```
packages/skill-experience-creator/
├── package.json                          # private, no build, just files manifest
├── README.md                             # install + usage
├── SKILL.md                              # the skill entry point (frontmatter + procedure)
├── references/
│   ├── api-reference.md                  # complete experience.yaml field reference
│   ├── patterns.md                       # copy-paste shapes: dataset+tool, agent fan-out, pipeline, loop
│   └── lessons.md                        # gotchas learned from Plans 1-4
├── assets/
│   ├── templates/
│   │   ├── simple-tool.yaml
│   │   ├── agent-with-schema.yaml
│   │   ├── dataset-plus-tool.yaml
│   │   ├── fan-out.yaml
│   │   └── pipeline.yaml
│   └── examples/
│       ├── README.md                     # maps each example to a technique
│       ├── hello-tool/                   # mirror of root examples/hello-tool
│       └── review-branch/                # mirror of root examples/review-branch
├── scripts/
│   └── validate-experience.mjs           # runnable validator using @openexpertise/schema
└── tests/
    ├── skill-md.test.ts                  # frontmatter + body structure
    ├── templates.test.ts                 # every template validates
    └── validate-script.test.ts           # the script runs and reports errors correctly
```

---

## Task 1: Package scaffold + README

**Files:**
- Create: `packages/skill-experience-creator/package.json`
- Create: `packages/skill-experience-creator/README.md`

- [ ] **Step 1.1: `package.json`**

```json
{
  "name": "@openexpertise/skill-experience-creator",
  "version": "0.1.0",
  "type": "module",
  "private": false,
  "files": [
    "SKILL.md",
    "references",
    "assets",
    "scripts"
  ],
  "scripts": {
    "test": "vitest run"
  },
  "dependencies": {
    "@openexpertise/schema": "workspace:*"
  }
}
```

- [ ] **Step 1.2: `README.md`**

```markdown
# experience-creator

An OpenExpertise authoring skill for Claude Code. Drop into your global skills folder, then ask Claude to create an experience.

## Install

```bash
mkdir -p ~/.claude/skills
cp -R packages/skill-experience-creator ~/.claude/skills/experience-creator
```

(From the OpenExpertise repo root.)

## Use

In Claude Code, just describe what you want:

> Create an OpenExpertise experience for my team's PR review process.

The skill picks up the request, walks through the design (purpose, unit of work, state schema, node kinds), drafts `experience.yaml` + scaffold files, validates with `oe validate`, and offers a dry-run.

## What's inside

| Path | What it is |
|---|---|
| `SKILL.md` | The skill entry point Claude reads. |
| `references/api-reference.md` | Complete `experience.yaml` field reference (every kind, every option). |
| `references/patterns.md` | Copy-paste shapes for common topologies. |
| `references/lessons.md` | Hard-won gotchas from V1 development. |
| `assets/templates/*.yaml` | Five starter templates. |
| `assets/examples/` | Two full worked examples, with mappings to techniques. |
| `scripts/validate-experience.mjs` | Standalone validator usable independently of the `oe` CLI. |
```

- [ ] **Step 1.3: Commit**

```bash
cd /Users/xuxingcheng/SHLAB/github/OpenExpertise/.claude/worktrees/overnight-plans-2-6
git add packages/skill-experience-creator/package.json packages/skill-experience-creator/README.md
git commit -m "feat(skill-experience-creator): scaffold package + README"
```

---

## Task 2: `SKILL.md` — the skill entry point

**Files:**
- Create: `packages/skill-experience-creator/SKILL.md`

- [ ] **Step 2.1: Write `SKILL.md`**

```markdown
---
name: experience-creator
description: >-
  Author runnable OpenExpertise experience files — heterogeneous executable graphs
  (agent / skill / tool / dataset / experience nodes) backed by a persistent
  blackboard. Use this skill whenever the user wants to create, write, build,
  scaffold, or design an OpenExpertise experience: "make an experience for X",
  "create an OpenExpertise flow", "scaffold a multi-step LLM pipeline with
  reproducible state". Also use when the user is confused about the
  experience.yaml format — the schema, state, edges, for_each, pipelines,
  loops — or when an experience errors and needs debugging. Trigger this
  whenever the user describes a repeatable multi-step or LLM-backed job that
  benefits from a graph with state, even if they never say "experience". Do
  NOT use it to merely run an existing experience.
---

# Experience Creator

Turn a user goal into a **runnable `experience.yaml`** plus its accompanying
prompt files, tool modules, and dataset descriptors. The result is a directory
that `oe run` can execute end-to-end.

The deep material lives in three reference files — read them when the step
says so:

- `references/api-reference.md` — every field of `experience.yaml`, every
  node kind's options, every control-flow construct.
- `references/patterns.md` — copy-paste topologies (linear, fan-out, pipeline,
  bounded loop, dataset → agent → score).
- `references/lessons.md` — gotchas from earlier V1 work (schema enforcement,
  cache invalidation, `exactOptionalPropertyTypes`, ESM imports, etc.).

Starter templates are in `assets/templates/`. Two worked examples are in
`assets/examples/`. A standalone validator is `scripts/validate-experience.mjs`.

---

## Step 0 — Confirm OpenExpertise is installed

```bash
oe --version
```

If `oe` is not on PATH, point the user at the OpenExpertise repo and tell them
to either install the CLI (`npm i -g @openexpertise/cli`) or run via the
workspace (`node packages/cli/dist/bin.js`).

---

## Step 1 — Establish the goal (do NOT skip)

Before writing a line of YAML, get crisp answers to:

1. **What does this experience produce?** A reviewed PR? A summarized
   research finding? A risk score? Name the artifact concretely.
2. **What's the unit of work?** The thing one node does once: review one
   file, research one topic, score one transaction.
3. **What state does it need to remember across runs?** This is the
   blackboard's reason to exist (`past_incidents`, `tuned_thresholds`,
   `accumulated_findings`).
4. **Which nodes are LLM-backed vs deterministic?** Map each step to one of
   the five kinds (agent / skill / tool / dataset / experience).
5. **What's "done"?** A specific exit state — a final field set, a status
   reaching a value.

Write these answers down for the user before drafting.

---

## Step 2 — Pick the topology

Match the user's job to one of these shapes (see `references/patterns.md` for
the YAML):

| Shape | When |
|---|---|
| Linear (a → b → c) | Each step has one predecessor and one successor |
| Fan-out (`for_each`) | One step runs once per item in a list |
| Pipeline group | Items stream through multiple stages each |
| Bounded loop (`repeat:`) | Repeat a step until a condition or max iters |
| Conditional edge (`when:`) | A branch only runs when a state condition holds |

Often you combine two or three (review-branch combines fan-out + conditional).

---

## Step 3 — Draft the state schema

Every field a node writes or reads must be declared in `state.schema`. Per
field, you set:

- `type` (`string` / `number` / `boolean` / `object` / `array` / `null`)
- `merge` (`array_append` / `set_once` / `last_wins`) if multiple writers
- `description` (for human readers and tools)

If multiple nodes (especially fan-out replicas) write the same field, declare
`merge: array_append`. If exactly one writer should ever fire, `set_once`. If
the latest writer wins by intent, `last_wins`.

---

## Step 4 — Pick node kinds and impl paths

For each step, choose:

- **`tool`** — deterministic computation (TS/JS module's default export). Use
  for parsing, aggregation, side-effects (API calls, file writes). Path is
  relative to `experience.yaml`.
- **`agent`** — single LLM call with a prompt template (`.md` file). Use
  when you need free-form generation or a one-off structured output. If you
  need structured output, set `schema:` and the agent returns a validated
  object.
- **`skill`** — LLM call backed by a `SKILL.md` directory (Claude Code skill
  format). Use when the prompt has structure and reusability — a "named LLM
  capability".
- **`dataset`** — data source (file / sqlite / http). Use to seed state with
  rows from a known source.
- **`experience`** — recursive sub-experience (1-level nesting; isolated
  state by default).

---

## Step 5 — Scaffold the directory

Create:

```
<name>/
├── experience.yaml
├── prompts/               # for agent nodes
├── schemas/               # for structured outputs (JSON Schema)
├── tools/                 # for tool nodes (.mjs preferred for V1)
├── skills/                # for local skill nodes
└── datasets/              # for dataset source descriptors / data files
```

Copy the closest template from `assets/templates/` and adapt it. Start
small: one or two nodes, a clean run, then grow.

---

## Step 6 — Validate

```bash
oe validate <name>
```

The validator catches:

- Undeclared state fields referenced by `reads`/`writes`
- Edge references to non-existent nodes
- Duplicate node ids
- Schema-level violations (missing `kind`, wrong shape)

If `oe` is not on PATH, the standalone validator in `scripts/` works too:

```bash
node ~/.claude/skills/experience-creator/scripts/validate-experience.mjs <name>/experience.yaml
```

---

## Step 7 — Dry-run (optional)

For confidence, run with a mock dataset / fake args:

```bash
oe run <name> --args '{"sample":true}'
```

Run logs land in `<name>/.openexpertise/runs/<run-id>.jsonl`. Inspect with:

```bash
oe inspect <run-id> --experience <name>
```

---

## Step 8 — Hand over

Give the user:

1. The directory they can `cd` into.
2. The one-line `oe run <name>` command.
3. A pointer to the run log and `oe state <name>` for inspection.
4. A note on what state will accumulate across runs (e.g., "every run
   appends to `past_incidents`").

---

## When the user wants to learn, not build

If the request is "explain how OpenExpertise works" rather than "make me one",
walk them through `references/api-reference.md` top-to-bottom. Then offer to
scaffold their first experience from a template so they have something
runnable to poke at.
```

- [ ] **Step 2.2: Commit**

```bash
git add packages/skill-experience-creator/SKILL.md
git commit -m "feat(skill-experience-creator): SKILL.md authoring procedure"
```

---

## Task 3: Reference docs (api-reference, patterns, lessons)

**Files:**
- Create: `packages/skill-experience-creator/references/api-reference.md`
- Create: `packages/skill-experience-creator/references/patterns.md`
- Create: `packages/skill-experience-creator/references/lessons.md`

- [ ] **Step 3.1: Write `references/api-reference.md`**

The api-reference must document every field of `experience.yaml`. Use this content (it doubles as the V1 API documentation):

```markdown
# experience.yaml — API Reference (v0.1.0)

## Top-level shape

```yaml
name: string                  # required, non-empty
description: string           # optional, human-readable
version: string               # required, semver "x.y.z"

state:
  schema:                     # required: map of field-name → schema
    <field>:
      type: ...
      merge: ...
      description: ...
  store: string               # optional, defaults to .openexpertise/state.sqlite

phases:                       # optional, cosmetic grouping for UI/TUI
  - id: collect
  - id: review
  - id: score

graph:
  nodes: [...]                # required, ≥1
  edges: [...]                # required (may be empty)
  pipelines: [...]            # optional
  loops: [...]                # optional
```

## State schema

A field may be either an inline schema or a `$ref` to an external JSON Schema:

```yaml
state:
  schema:
    pr_id:
      type: string
    findings:
      type: array
      items: { type: object }
      merge: array_append
    incident:
      $ref: ./schemas/incident.json
```

Merge strategies:
- `array_append` — concat the incoming array onto the existing one
- `set_once` — only one write allowed; second write throws
- `last_wins` (default) — overwrite

## Node shapes (oneOf, discriminated on `kind`)

### `tool`

```yaml
- id: my_tool
  kind: tool
  phase: collect          # optional
  impl: ./tools/foo.mjs   # required, path relative to experience.yaml
  args: { k: v }          # optional, supports $.field interpolation
  reads: [field1]         # optional
  writes: [field2]        # optional, declared state fields
  on_error: { policy: retry, attempts: 3, backoff: exponential, base_ms: 500 }
  for_each: { source: $.list, concurrency: 1 }  # optional
```

The default export of `impl` is `async (args, ctx) => ({ state_delta, edge_output?, metrics? })`.

### `agent`

```yaml
- id: bug_review
  kind: agent
  prompt: ./prompts/review.md
  model: claude-sonnet-4-5         # optional override; default = inherit
  schema:                          # optional; forces structured output
    type: object
    required: [findings]
    properties:
      findings: { type: array }
  reads: [changed_files]
  writes: [findings]
  on_error: { ... }
  for_each: { source: $.dimensions }
```

Without `schema`, the agent returns text and writes it to `writes[0]` (must be a single field).
With `schema`, the agent's tool call's structured output IS the `state_delta`.

Prompt templates support `{{fieldName}}` placeholders. They're filled from the resolved input bundle (state_view ∪ edge_inputs ∪ args). When `for_each` is set, `{{$item}}` and `{{$index}}` are available.

### `skill`

```yaml
- id: classify
  kind: skill
  impl: ./skills/classify     # directory with SKILL.md
  inputs: { utterance: $.last_message }
  model: claude-sonnet-4-5    # optional
  writes: [label]
```

The SKILL.md body becomes the system prompt; inputs become the user message (JSON-stringified).

### `dataset`

```yaml
- id: load_incidents
  kind: dataset
  source:
    type: sqlite              # or: file | http
    uri: ./datasets/incidents.db
    query: "SELECT * FROM incidents WHERE date > date('now','-180 days')"
  writes: [past_incidents]
```

File sources accept `format: json | jsonl | csv` (inferred from extension if omitted).
HTTP sources accept `method`, `body` (POST), and return JSON arrays.

### `experience` (nested)

```yaml
- id: deep_audit
  kind: experience
  impl: ./sub-experiences/deep-audit/experience.yaml
  args: { pr_id: $.pr_id }
  state_scope: isolated       # V1: only isolated supported
  writes: [audit_result]      # state_delta is {}; edge_output carries child's finalState
```

## Edges

```yaml
edges:
  - { from: a, to: b }
  - { from: c, to: d, when: '$.findings.length > 0 && $.severity == "high"' }
```

The `when:` predicate is evaluated against the full state at scheduling time.
If false, the downstream node is skipped (status: skipped, not failed).
Supported operators: `== != > < >= <= && ||`, plus `length(...)`.

## Pipelines

```yaml
graph:
  pipelines:
    - id: review_then_verify
      items: $.dimensions
      stages: [bug_review, verify_finding]
      phase: review
```

Each item flows through every stage. Stage outputs (`edge_output`) become the next stage's `edge_inputs`.

## Loops

```yaml
graph:
  loops:
    - id: refine_until_clean
      body: refine_node
      until: '$.error_count == 0'
      max_iters: 5
```

Runs `body` repeatedly. Terminates on `until` (true) or `max_iters` (whichever first). At least one of `until` / `max_iters` is required.

## on_error policies

```yaml
on_error: { policy: skip }                                       # default; downstream skipped
on_error: { policy: fail_run }                                   # abort whole run on failure
on_error: { policy: retry, attempts: 3, backoff: exponential, base_ms: 500 }
```
```

- [ ] **Step 3.2: Write `references/patterns.md`**

```markdown
# Patterns — copy-paste topology shapes

## Linear (a → b → c)

```yaml
graph:
  nodes:
    - { id: load, kind: dataset, source: { type: file, uri: ./data.json }, writes: [rows] }
    - { id: filter, kind: tool, impl: ./tools/filter.mjs, reads: [rows], writes: [rows_filtered] }
    - { id: summarize, kind: agent, prompt: ./prompts/sum.md, reads: [rows_filtered], writes: [summary] }
  edges:
    - { from: load, to: filter }
    - { from: filter, to: summarize }
```

## Fan-out across a list

```yaml
graph:
  nodes:
    - { id: seed, kind: tool, impl: ./tools/items.mjs, writes: [items] }
    - id: process
      kind: agent
      prompt: ./prompts/per-item.md      # has {{$item}} placeholder
      for_each: { source: $.items }
      schema: { type: object, required: [result], properties: { result: { type: string } } }
      writes: [results]                  # uses merge: array_append in state.schema
  edges:
    - { from: seed, to: process }
```

(Don't forget `state.schema.results.merge: array_append`.)

## Pipeline (per-item streaming through stages)

```yaml
graph:
  nodes:
    - { id: seed, kind: tool, impl: ./tools/items.mjs, writes: [items] }
    - { id: stage_a, kind: agent, prompt: ./prompts/a.md, writes: [_unused_a] }  # uses edge_output
    - { id: stage_b, kind: agent, prompt: ./prompts/b.md, writes: [final_per_item], schema: {...} }
  edges:
    - { from: seed, to: stage_a }
  pipelines:
    - { id: p, items: $.items, stages: [stage_a, stage_b] }
```

## Conditional branch

```yaml
graph:
  nodes:
    - { id: score, kind: agent, prompt: ./prompts/score.md, schema: {...}, writes: [risk] }
    - { id: alert, kind: tool, impl: ./tools/page.mjs, reads: [risk] }
  edges:
    - { from: score, to: alert, when: '$.risk > 0.8' }
```

## Bounded loop

```yaml
graph:
  nodes:
    - { id: refine, kind: agent, prompt: ./prompts/refine.md, writes: [draft, error_count] }
  loops:
    - { id: refinement, body: refine, until: '$.error_count == 0', max_iters: 5 }
```

## Dataset → tool → agent (the common case)

```yaml
state:
  schema:
    raw: { type: array, items: { type: object } }
    aggregated: { type: object }
    insight: { type: string }
graph:
  nodes:
    - { id: load, kind: dataset, source: { type: file, uri: ./data.csv, format: csv }, writes: [raw] }
    - { id: agg, kind: tool, impl: ./tools/agg.mjs, reads: [raw], writes: [aggregated] }
    - { id: explain, kind: agent, prompt: ./prompts/explain.md, reads: [aggregated], writes: [insight] }
  edges:
    - { from: load, to: agg }
    - { from: agg, to: explain }
```
```

- [ ] **Step 3.3: Write `references/lessons.md`**

```markdown
# Lessons — hard-won gotchas from V1 development

These are recorded inline in `docs/superpowers/overnight-progress.md` and worth surfacing here.

## State schema enforcement is strict

A node's `writes:` field must be declared in `state.schema`. The validator catches typos at load time. If you get "undeclared state field", look for a misspelled field name.

## Fan-out replicas need merge strategies

If a `for_each` node writes a field, that field must declare `merge: array_append` (each replica appends one item). Without a merge strategy, the second replica clobbers the first.

## Agent text mode requires exactly one `writes` field

`AgentDispatcher` without a schema writes the LLM's text to `writes[0]`. If you declare multiple writes, it throws. Use a `schema:` to write multiple fields atomically.

## Pipeline stages don't get topological scheduling

Pipeline-stage nodes are excluded from the main DAG pass and run instead in the pipeline pass (after the topo pass). If you want a node to run after a pipeline completes, give it an edge from the pipeline's last stage and don't put it in the pipeline.

## Loop bodies are also excluded from the main DAG pass

Same as pipelines: the loop body runs in the loop pass (third pass), not the topo pass. If you need it to also fire standalone, declare two separate nodes.

## Cache invalidates when ANY input changes

Cache keys hash (node spec, state slice, edge inputs, args, runtime version). A change to ANY of these busts the cache. Bumping `RUNTIME_VERSION` in `scheduler.ts` invalidates all caches.

## `exactOptionalPropertyTypes: true` is on

Optional fields are `foo?: T`, never `foo?: T | undefined`. Build conditional objects with `...(cond ? { foo } : {})` rather than passing `foo: maybe`.

## `noUncheckedIndexedAccess: true` is on

Array index access returns `T | undefined`. Use `arr[0]?.field` or `arr[0]!.field` deliberately.

## ESM imports use `.js` extensions in source

TypeScript NodeNext / Bundler module resolution requires `import { x } from './foo.js'` even though the source is `foo.ts`. Don't strip the `.js`.

## SQLite file is per-experience and persists across runs

The blackboard is at `.openexpertise/state.sqlite`. To wipe it, `oe reset-state --yes`. State is the WHOLE POINT of OpenExpertise — don't fight it.

## Run logs are JSONL under `.openexpertise/runs/<run-id>.jsonl`

`oe inspect <run-id>` replays them. `oe resume <run-id>` re-runs with cache + original args.
```

- [ ] **Step 3.4: Commit**

```bash
git add packages/skill-experience-creator/references/
git commit -m "feat(skill-experience-creator): api-reference + patterns + lessons"
```

---

## Task 4: Starter templates

**Files:**
- Create: `packages/skill-experience-creator/assets/templates/{simple-tool,agent-with-schema,dataset-plus-tool,fan-out,pipeline}.yaml`

- [ ] **Step 4.1: Write 5 templates**

`simple-tool.yaml`:
```yaml
name: <NAME>
description: <one-line description>
version: 0.1.0

state:
  schema:
    output:
      type: string

graph:
  nodes:
    - id: do_thing
      kind: tool
      impl: ./tools/do_thing.mjs
      writes: [output]
  edges: []
```

`agent-with-schema.yaml`:
```yaml
name: <NAME>
description: <one-line description>
version: 0.1.0

state:
  schema:
    input_text:
      type: string
    result:
      type: object

graph:
  nodes:
    - id: classify
      kind: agent
      prompt: ./prompts/classify.md
      reads: [input_text]
      schema:
        type: object
        required: [label, confidence]
        properties:
          label: { type: string }
          confidence: { type: number }
      writes: [result]
  edges: []
```

`dataset-plus-tool.yaml`:
```yaml
name: <NAME>
description: <one-line description>
version: 0.1.0

state:
  schema:
    rows:
      type: array
      items: { type: object }
    total:
      type: number

graph:
  nodes:
    - id: load
      kind: dataset
      source: { type: file, uri: ./data.csv, format: csv }
      writes: [rows]
    - id: aggregate
      kind: tool
      impl: ./tools/aggregate.mjs
      reads: [rows]
      writes: [total]
  edges:
    - { from: load, to: aggregate }
```

`fan-out.yaml`:
```yaml
name: <NAME>
description: Fan out a process across a list of items.
version: 0.1.0

state:
  schema:
    items:
      type: array
      items: { type: object }
    results:
      type: array
      items: { type: object }
      merge: array_append

graph:
  nodes:
    - id: seed
      kind: tool
      impl: ./tools/seed.mjs
      writes: [items]
    - id: process_each
      kind: agent
      prompt: ./prompts/per-item.md
      for_each: { source: $.items }
      schema:
        type: object
        required: [result]
        properties:
          result: { type: object }
      writes: [results]
  edges:
    - { from: seed, to: process_each }
```

`pipeline.yaml`:
```yaml
name: <NAME>
description: Stream items through ordered stages.
version: 0.1.0

state:
  schema:
    items:
      type: array
      items: { type: object }
    final:
      type: array
      items: { type: object }
      merge: array_append

graph:
  nodes:
    - id: seed
      kind: tool
      impl: ./tools/seed.mjs
      writes: [items]
    - id: stage_a
      kind: agent
      prompt: ./prompts/stage-a.md
      writes: [_unused_a]
    - id: stage_b
      kind: agent
      prompt: ./prompts/stage-b.md
      schema:
        type: object
        required: [out]
        properties:
          out: { type: object }
      writes: [final]
  edges:
    - { from: seed, to: stage_a }
  pipelines:
    - id: pipe
      items: $.items
      stages: [stage_a, stage_b]
```

- [ ] **Step 4.2: Commit**

```bash
git add packages/skill-experience-creator/assets/templates/
git commit -m "feat(skill-experience-creator): 5 starter templates"
```

---

## Task 5: Example mirrors + README

**Files:**
- Create: `packages/skill-experience-creator/assets/examples/README.md`
- Create: `packages/skill-experience-creator/assets/examples/hello-tool/` (copy from `examples/hello-tool`)
- Create: `packages/skill-experience-creator/assets/examples/review-branch/` (copy from `examples/review-branch`)

- [ ] **Step 5.1: Copy worked examples**

```bash
cd /Users/xuxingcheng/SHLAB/github/OpenExpertise/.claude/worktrees/overnight-plans-2-6
mkdir -p packages/skill-experience-creator/assets/examples
cp -R examples/hello-tool packages/skill-experience-creator/assets/examples/hello-tool
cp -R examples/review-branch packages/skill-experience-creator/assets/examples/review-branch
# Remove any runtime artifacts that may have leaked
rm -rf packages/skill-experience-creator/assets/examples/*/.openexpertise
```

- [ ] **Step 5.2: Write `assets/examples/README.md`**

```markdown
# Worked examples

| Example | Topology | Kinds | Techniques |
|---|---|---|---|
| `hello-tool/` | Single-node | tool | Smallest possible — one tool writes a greeting. Walk through this first. |
| `review-branch/` | Fan-out + conditional | tool + agent | Three dimensions → reviewers (fan-out) → verifier per finding → conditional score |

Each example is a complete, runnable directory. Copy to a new path, modify `name:` in `experience.yaml`, then `oe run <path>`.
```

- [ ] **Step 5.3: Commit**

```bash
git add packages/skill-experience-creator/assets/examples/
git commit -m "feat(skill-experience-creator): worked examples mirror"
```

---

## Task 6: Standalone validator script

**Files:**
- Create: `packages/skill-experience-creator/scripts/validate-experience.mjs`

- [ ] **Step 6.1: Write the script**

```js
#!/usr/bin/env node
// Standalone validator usable without the full oe CLI installed.
// Usage: node validate-experience.mjs <path-to-experience.yaml>

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseExperienceYaml, validateExperienceSpec, ValidationError } from '@openexpertise/schema'

const arg = process.argv[2]
if (!arg) {
  console.error('usage: validate-experience.mjs <path-to-experience.yaml>')
  process.exit(2)
}

const abs = resolve(arg)
let source
try {
  source = readFileSync(abs, 'utf8')
} catch (err) {
  console.error(`cannot read ${abs}: ${(err).message}`)
  process.exit(1)
}

try {
  const spec = parseExperienceYaml(source)
  validateExperienceSpec(spec)
  console.log(`OK: ${abs}`)
  process.exit(0)
} catch (err) {
  if (err instanceof ValidationError) {
    console.error(`VALIDATION FAILED: ${err.message}`)
    if (err.errors?.length) {
      for (const msg of err.errors) console.error(`  - ${msg}`)
    }
  } else {
    console.error(`PARSE FAILED: ${(err).message}`)
  }
  process.exit(1)
}
```

- [ ] **Step 6.2: Commit**

```bash
chmod +x packages/skill-experience-creator/scripts/validate-experience.mjs
git add packages/skill-experience-creator/scripts/
git commit -m "feat(skill-experience-creator): standalone validate-experience.mjs"
```

---

## Task 7: Tests for the skill package

**Files:**
- Create: `packages/skill-experience-creator/tests/skill-md.test.ts`
- Create: `packages/skill-experience-creator/tests/templates.test.ts`
- Create: `packages/skill-experience-creator/tests/validate-script.test.ts`

- [ ] **Step 7.1: Add dev deps**

In `packages/skill-experience-creator/package.json`, add:
```json
"devDependencies": {
  "gray-matter": "^4.0.3",
  "yaml": "^2.5.0"
}
```

Then:
```bash
cd /Users/xuxingcheng/SHLAB/github/OpenExpertise/.claude/worktrees/overnight-plans-2-6
pnpm install
```

- [ ] **Step 7.2: Write `tests/skill-md.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'

const HERE = dirname(fileURLToPath(import.meta.url))
const SKILL_MD = join(HERE, '..', 'SKILL.md')

describe('SKILL.md', () => {
  it('parses as valid frontmatter + body', () => {
    const src = readFileSync(SKILL_MD, 'utf8')
    const { data, content } = matter(src)
    expect(data.name).toBe('experience-creator')
    expect(typeof data.description).toBe('string')
    expect(data.description.length).toBeGreaterThan(50)
    expect(content).toContain('# Experience Creator')
    expect(content).toContain('Step 1')
    expect(content).toContain('Step 5')
  })
})
```

- [ ] **Step 7.3: Write `tests/templates.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseExperienceYaml, validateExperienceSpec } from '@openexpertise/schema'

const HERE = dirname(fileURLToPath(import.meta.url))
const TEMPLATES_DIR = join(HERE, '..', 'assets', 'templates')

describe('starter templates', () => {
  const files = readdirSync(TEMPLATES_DIR).filter((f) => f.endsWith('.yaml'))
  it('finds at least 5 templates', () => {
    expect(files.length).toBeGreaterThanOrEqual(5)
  })
  for (const file of files) {
    it(`${file} parses and validates`, () => {
      const src = readFileSync(join(TEMPLATES_DIR, file), 'utf8')
      const spec = parseExperienceYaml(src)
      expect(() => validateExperienceSpec(spec)).not.toThrow()
    })
  }
})
```

- [ ] **Step 7.4: Write `tests/validate-script.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SCRIPT = join(HERE, '..', 'scripts', 'validate-experience.mjs')
const HELLO = join(HERE, '..', 'assets', 'examples', 'hello-tool', 'experience.yaml')

describe('validate-experience.mjs', () => {
  it('exits 0 on a valid experience', () => {
    const out = execFileSync('node', [SCRIPT, HELLO], { encoding: 'utf8' })
    expect(out).toContain('OK:')
  })
  it('exits non-zero on a missing file', () => {
    expect(() => execFileSync('node', [SCRIPT, '/does/not/exist.yaml'], { encoding: 'utf8' }))
      .toThrow()
  })
})
```

- [ ] **Step 7.5: Run + commit**

```bash
cd /Users/xuxingcheng/SHLAB/github/OpenExpertise/.claude/worktrees/overnight-plans-2-6
pnpm install
pnpm vitest run packages/skill-experience-creator/
git add packages/skill-experience-creator/tests/ packages/skill-experience-creator/package.json
git commit -m "test(skill-experience-creator): frontmatter + template + script tests"
```

---

## Task 8: Final clean rebuild

- [ ] **Step 8.1:**

```bash
pnpm clean
pnpm install
pnpm -r build
pnpm typecheck
pnpm format
pnpm format:check
pnpm lint
pnpm test
git status
git add -A
git commit -m "style(plan-5): prettier/lint cleanup" || echo "no cleanup"
```

Expected: ~98 tests pass (existing 91 + skill 1 + templates 5+ + validate-script 2 ≈ +8).

---

## Coverage check

| Spec section | Plan 5 task(s) | Coverage |
|---|---|---|
| §10 Authoring UX (experience-creator skill) | Tasks 1-7 | ✅ |
| §10 Claude Code skill format compat | Task 2 | ✅ frontmatter validated by test |
| §10 templates + examples | Tasks 4, 5 | ✅ |
| §10 standalone validator | Task 6 | ✅ |

---

## Notes

- The skill package has `"private": false` and a `files:` manifest so it could be published to npm separately if desired (Plan 6 may add `prepublishOnly`).
- The skill body intentionally lists Steps 0-8 with a number — easier for Claude to reference mid-conversation.
- Templates use `<NAME>` placeholders; the skill's procedure (Step 5) replaces them.
- The validator script uses the user's locally-installed `@openexpertise/schema`. If the user has the workspace, it resolves via symlinks; if they `cp -R` to `~/.claude/skills/`, the script falls back to a globally-installed version (or fails informatively).
