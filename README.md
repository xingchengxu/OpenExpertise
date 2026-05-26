# OpenExpertise

> Heterogeneous executable graphs that codify expert knowledge — deterministic, persistent, and self-improving.

OpenExpertise is the **execution engine for "experience flows"**: graphs whose nodes can be tools, datasets, Claude/GPT agents, callable skills, or other experiences. Runs are durable artifacts (SQLite blackboard, JSONL event log), and the evolution advisor proposes graph upgrades after each run.

![hero demo placeholder](docs/assets/hero.gif)

## 90-second demo — the graph improves itself

```bash
git clone <repo-url> && cd OpenExpertise
pnpm install && pnpm -r build

export ANTHROPIC_API_KEY=sk-...    # or OPENAI_API_KEY
node packages/cli/dist/bin.js run examples/review-branch --tui
```

**Run 1** — three reviewers (bugs / perf / tests) read the diff. The SQL injection is missed:

```
ⓘ run-2026-05-26-a1b2c3 finished
  findings: 3 issues (null deref, missing test, unclosed cursor)
  risk_score: 0.30
```

**Evolve** — ask the advisor what's missing:

````bash
node packages/cli/dist/bin.js evolve run-2026-05-26-a1b2c3
# → wrote .openexpertise/evolution/run-2026-05-26-a1b2c3.md
#   proposal: "Add `security` dimension"

# The proposal markdown embeds a unified diff inside a ```diff fenced block.
# Extract it and pipe to git apply:
awk '/^```diff$/{f=1;next} /^```$/{f=0} f' \
  .openexpertise/evolution/run-2026-05-26-a1b2c3.md | git apply
````

**Run 2** — same command. Now four reviewers. SQL injection caught:

```
ⓘ run-2026-05-26-d4e5f6 finished
  findings: 4 issues (+ SQL injection in /users/<id>)
  risk_score: 0.85
```

The experience improved itself. State persisted across runs. The graph is a versioned artifact.

## Why OpenExpertise

- **Heterogeneous nodes.** Mix tools (deterministic code), agents (LLM calls with structured output), skills (SKILL.md packages), datasets (file / SQLite / HTTP), and nested experiences in a single graph.
- **Durable state.** A per-experience SQLite blackboard with declared schema and merge strategies. `oe state findings` works hours later.
- **Evolution loop.** After every run, the advisor reads the events + state diff and proposes graph upgrades (add node, tune param, add dataset case) as `git apply`-ready diffs.
- **Two LLM providers.** Anthropic and OpenAI, switch via `--llm` or env-var auto-detect.
- **Two-way agentic-CLI integration.** Outbound: the `cli-agent` node kind delegates steps to Claude Code, Codex, or Gemini. Inbound: `@openexpertise/mcp-server` exposes 5 OE tools over MCP, callable from any of those CLIs. See [`docs/cli-agent.md`](docs/cli-agent.md) and [`docs/mcp-server.md`](docs/mcp-server.md).
- **One-keyword authoring.** `oe ultra "<task>"` (or `/ultraexpertise <task>` inside Claude Code) runs an LLM agent that analyzes the task, synthesizes a complete `experience.yaml` + tool stubs + prompts, and writes a validated draft. The same LLM that authored the SOP can then evolve it after the first run. See [`docs/ultraexpertise.md`](docs/ultraexpertise.md).

For a fuller comparison vs LangGraph / CrewAI / Mastra / Inngest see [`docs/comparison.md`](docs/comparison.md).

## Install

```bash
git clone <repo-url> && cd OpenExpertise
pnpm install && pnpm -r build
node packages/cli/dist/bin.js --help
```

(Publication to npm is configured per-package; once npm-published you'll be able to `npm i -g @openexpertise/cli`.)

## Quick start — smaller examples

```bash
# Pure-tool, no LLM needed:
node packages/cli/dist/bin.js run examples/hello-tool
# → finalState: { greeting: 'hello, World' }

# Dataset aggregate:
node packages/cli/dist/bin.js run examples/dataset-aggregate
# → finalState: { rows: [...], total: 60 }
```

### More examples

| Example                                      | Demonstrates                                                        |
| -------------------------------------------- | ------------------------------------------------------------------- |
| [`oncall-runbook`](examples/oncall-runbook/) | `tool → agent` fan-out via `for_each` over investigation dimensions |
| [`issue-triage`](examples/issue-triage/)     | `when:` conditional edges, multi-agent label + owner routing        |
| [`release-gates`](examples/release-gates/)   | Mixing `tool` + `cli-agent` (claude-code) + `agent` in one graph    |

Each ships with a fixture and a mocked-LLM e2e test in `e2e/` — no real API or CLI required to verify the structure.

## All CLI commands

| Command                | Purpose                                           |
| ---------------------- | ------------------------------------------------- |
| `oe init <name>`       | Scaffold a new experience directory               |
| `oe validate [path]`   | Validate `experience.yaml`                        |
| `oe run [path]`        | Execute an experience (`--tui`, `--evolve` flags) |
| `oe resume <run-id>`   | Re-run with cache replay                          |
| `oe inspect <run-id>`  | Replay a run's event log                          |
| `oe state [field]`     | Inspect blackboard                                |
| `oe reset-state --yes` | Wipe blackboard                                   |
| `oe evolve <run-id>`   | Generate evolution proposals                      |
| `oe diff`              | List pending evolution proposals                  |

### TUI dashboard

`oe run --tui` opens an ink-based dashboard showing each node's status, current activity (e.g. `calling claude-sonnet-4-6`, `spawning codex`, `parsing JSON output`), per-node accumulated tokens, and a header line with the run-total tokens. Updates live as the run progresses.

### Concurrency

`oe run --concurrency <n>` runs independent DAG nodes (and `for_each` iterations whose `concurrency: N` is set) in parallel up to the configured ceiling. Defaults to 1 (sequential). You can also set `runtime.concurrency: N` at the top of `experience.yaml` to make a flow parallel-by-default.

LLM clients (Anthropic + OpenAI) retry up to 4 times on HTTP 429 (`rate_limit_error`) with exponential backoff, configurable via constructor opts. Non-429 errors are not retried.

`oe inspect <run-id>` sorts events by `ts` so a parallel run reads in chronological order.

## Authoring with Claude Code

Install the `experience-creator` skill:

```bash
mkdir -p ~/.claude/skills
cp -R packages/skill-experience-creator ~/.claude/skills/experience-creator
```

Then in Claude Code: "make an OpenExpertise experience for X".

## Architecture

The 6-plan V1 buildout:

1. **Plan 1** — Walking skeleton: monorepo, schema package, core runtime, ToolDispatcher, CLI, hello-tool example
2. **Plan 2** — Heterogeneous dispatchers: AgentDispatcher (Anthropic SDK), SkillDispatcher, DatasetDispatcher, ExperienceDispatcher, on_error policies
3. **Plan 3** — Control flow: for_each, conditional edges (when:), pipeline groups, phase grouping, review-branch demo
4. **Plan 4** — Cache + resume + bounded loop + TUI (ink) + remaining CLI commands
5. **Plan 5** — `experience-creator` authoring skill for Claude Code
6. **Plan 6** — `EvolutionAdvisor` + `oe evolve` / `oe diff` / `oe run --evolve`

Design doc: `docs/superpowers/specs/2026-05-25-openexpertise-design.md`.
Implementation plans: `docs/superpowers/plans/`.

## Development

```bash
pnpm test          # all unit + e2e tests
pnpm typecheck     # tsc across all packages
pnpm lint          # eslint
pnpm format:check  # prettier
pnpm format        # prettier --write
```

## License

(TBD by the maintainer)
