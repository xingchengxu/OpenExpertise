# What is an experience?

An **experience** is OpenExpertise's unit of automation: a complete, runnable, version-controlled YAML graph that captures one of your team's standard operating procedures.

Think of it like a Makefile, but for AI-era workflows:

- The **structure is declarative** — declared in YAML, not improvised by an LLM at runtime.
- The **values are dynamic** — LLMs fill in node-level judgment (review this diff, classify this issue) while the graph stays fixed.
- The **state is persistent** — every node's output goes into a SQLite blackboard you can query for hours afterward.
- The **trace is durable** — every event lands in a JSONL log you can replay.
- The **graph evolves** — after each run, the evolution advisor proposes upgrades based on what it observed.

## The minimum viable experience

The smallest legal experience is one node, no LLM, no edges:

```yaml
name: hello-tool
version: 0.1.0
state:
  schema:
    greeting: { type: string }
graph:
  nodes:
    - id: greet
      kind: tool
      impl: ./tools/greet.mjs
      writes: [greeting]
  edges: []
```

```js
// tools/greet.mjs
export default async function () {
  return { state_delta: { greeting: 'hello, World' } }
}
```

That's a complete experience. `oe validate` accepts it; `oe run` executes it; the blackboard now has `greeting = "hello, World"`.

## What you put in an experience.yaml

| Field          | What goes there                                                                            |
| -------------- | ------------------------------------------------------------------------------------------ |
| `name`         | Slug for the experience. Must match `^[a-z][a-z0-9-]*$`.                                   |
| `version`      | Semver string. Used by the evolution advisor and (eventually) by cache keys.               |
| `description`  | One-sentence summary. The advisor reads this when proposing changes.                       |
| `state.schema` | A JSON-Schema-flavored map of every field a node can read or write. Strictly enforced.     |
| `phases`       | Ordered, named groupings of nodes — purely for human + UI organization, no runtime effect. |
| `graph.nodes`  | The list of nodes. Each has an `id`, `kind`, and kind-specific fields.                     |
| `graph.edges`  | Directed dependencies. Edges can have a `when:` expression for conditional flow.           |
| `runtime`      | Optional. `runtime.concurrency: N` enables the parallel scheduler.                         |

For the full grammar see the [YAML schema reference](/reference/schema).

## The six node kinds

Every node has a `kind:`. OpenExpertise ships six:

```
tool ─────────── deterministic JS/TS code
agent ────────── LLM call with structured-output enforcement
skill ────────── SKILL.md-packaged routine (LLM-backed)
dataset ──────── load file / SQLite / HTTP rows into state
experience ───── invoke a nested experience as a single step
cli-agent ────── delegate to Claude Code / Codex / Gemini subprocess
```

The kinds compose freely in one graph. The [release-gates example](/examples/release-gates) puts `tool` + `cli-agent` + `agent` side-by-side; the [tri-cli-orchestration example](/examples/tri-cli-orchestration) chains three `cli-agent` nodes through three different vendors.

Each kind gets its own deep-dive page — start with the [tool](/concepts/node-tool) page for the simplest case.

## Why YAML?

A common pushback: "Why not just write Python or TypeScript? It's more expressive."

Three reasons OpenExpertise picked declarative YAML:

1. **The graph is reviewable.** Anybody on your team — including non-engineers — can read an experience.yaml and see the steps. Code in any language requires reading code.
2. **The validator is the contract.** AJV-validated JSON Schema catches typos and shape errors before any code runs. With imperative code, the same mistakes ride through to runtime.
3. **The LLM can write it.** [`oe ultra`](/guide/authoring-ultra) makes the LLM emit a YAML graph as structured output. The schema constrains what the LLM can produce. You can't reliably ask an LLM to "write me a 200-line TypeScript file"; you can reliably ask it to "fill in this structured shape".

YAML isn't load-bearing — the schema and the graph model are. We could swap YAML for JSON, TOML, or KDL tomorrow without changing the architecture.

## State: the SQLite blackboard

The state.schema you declare is enforced by the runtime. Every write by every node lands in `.openexpertise/state.sqlite`, keyed by field name, with three things tracked:

- **Value** — the current value of the field
- **Merge strategy** — `set_once` (default), `last_wins`, or `array_append`
- **History** — a row per write, with `(run_id, node_id, ts, value_old, value_new)`

So state isn't just "this run's variables". It's a permanent, queryable record of every value every node ever produced. Hours later you can ask `oe state findings` and get the latest array of findings. Run a fan-out over 20 dimensions, then come back next week and query `oe state` to see the snapshot.

The merge strategy matters when multiple nodes (or multiple `for_each` iterations of one node) write to the same field. See [State](/concepts/state).

## Events: the durable trace

Every meaningful runtime moment fires an event into a JSONL log at `.openexpertise/runs/<run-id>.jsonl`. The event types:

- `run.started`, `run.finished`
- `node.ready`, `node.started`, `node.finished`, `node.failed`, `node.skipped`
- `state.write` (one per field write)
- `node.activity`, `node.tokens` (LLM-touching dispatchers emit these for live observability)

`oe inspect <run-id>` reads this log back, sorted by timestamp. The log is replayable — every CI run, every incident response, every test you ever wrote with this thing leaves a trail.

## The author → run → evolve loop

The full lifecycle of an experience:

```
oe ultra "Review pull requests for SOC2 compliance"
  ↓
.openexpertise/drafts/soc2-pr-review/experience.yaml   ←─ LLM-authored draft
  ↓ (you inspect, optionally edit)
mv .openexpertise/drafts/soc2-pr-review examples/
  ↓
oe run examples/soc2-pr-review                          ←─ run it
  ↓
.openexpertise/runs/r-abc123.jsonl                      ←─ trace
.openexpertise/state.sqlite                             ←─ state
  ↓
oe evolve r-abc123                                       ←─ same LLM reads the trace
  ↓
.openexpertise/evolution/r-abc123.md                    ←─ proposal (with git diff)
  ↓ (you decide what to apply)
git apply ...
  ↓
oe run examples/soc2-pr-review                          ←─ run the improved version
```

The same LLM provider drives all three stages: authoring (`oe ultra`), runtime (`agent` nodes), and evolution (`oe evolve`). One closed loop.

## Where experiences live

There's no enforced location. You can:

- Author them in `examples/` (standard for OE-shipped templates)
- Put them in your repo's `automation/` or `runbooks/` directory
- Generate them via `oe ultra` into `.openexpertise/drafts/` and promote with `mv`

Whatever directory contains `experience.yaml` plus its supporting `tools/`, `prompts/`, and `fixtures/` directories is the **experience directory**. All paths in YAML (`impl: ./tools/...`, `prompt: ./prompts/...`) are relative to that directory.

The persistent state (`.openexpertise/state.sqlite`, `.openexpertise/runs/`, `.openexpertise/cache/`, `.openexpertise/evolution/`) lives **inside the experience directory** by default — so the experience and its history travel together when you copy the directory.

→ Continue with [Code-as-Law](/concepts/code-as-law) for the philosophical foundation, or [The 6 node kinds](/concepts/node-kinds) for the operational menu.
