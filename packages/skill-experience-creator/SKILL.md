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

| Shape                      | When                                            |
| -------------------------- | ----------------------------------------------- |
| Linear (a → b → c)         | Each step has one predecessor and one successor |
| Fan-out (`for_each`)       | One step runs once per item in a list           |
| Pipeline group             | Items stream through multiple stages each       |
| Bounded loop (`repeat:`)   | Repeat a step until a condition or max iters    |
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

---

For a one-shot autonomous version of this workflow that bypasses the back-and-forth — the LLM analyzes the task, decides on the structure, and writes the SOP in one go — install the `/ultraexpertise` slash command from `commands/ultraexpertise.md`.
