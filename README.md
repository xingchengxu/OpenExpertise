# OpenExpertise

An open-source execution engine for **experience flows** — heterogeneous executable graphs that codify expert knowledge into runnable, evolving artifacts.

Think of it as: deterministic graph orchestrator (like `/workflows`) **plus** a persistent blackboard for domain state **plus** an evolution loop that proposes graph edits after each run. Authoring is mediated by a Claude Code skill so non-engineers can capture their expertise.

## Status

V1 complete. All 6 plans landed. ≥100 tests pass.

## Install

```bash
# From source (workspace):
git clone <repo-url>
cd OpenExpertise
pnpm install
pnpm -r build

# Use the CLI:
node packages/cli/dist/bin.js --help
```

(Publication to npm is configured per-package; once npm-published you'll be able to `npm i -g @openexpertise/cli`.)

## Quick start — `hello-tool`

```bash
node packages/cli/dist/bin.js run examples/hello-tool
# → finalState: { greeting: 'hello, World' }
```

## Quick start — `dataset-aggregate`

```bash
node packages/cli/dist/bin.js run examples/dataset-aggregate
# → finalState: { rows: [...4 rows...], total: 60 }
```

## Quick start — `review-branch` (requires `ANTHROPIC_API_KEY`)

```bash
export ANTHROPIC_API_KEY=sk-...
node packages/cli/dist/bin.js run examples/review-branch --args '{"pr_id":"PR-1"}'
```

## All CLI commands

| Command | Purpose |
|---|---|
| `oe init <name>` | Scaffold a new experience directory |
| `oe validate [path]` | Validate `experience.yaml` |
| `oe run [path]` | Execute an experience (`--tui`, `--evolve` flags) |
| `oe resume <run-id>` | Re-run with cache replay |
| `oe inspect <run-id>` | Replay a run's event log |
| `oe state [field]` | Inspect blackboard |
| `oe reset-state --yes` | Wipe blackboard |
| `oe evolve <run-id>` | Generate evolution proposals |
| `oe diff` | List pending evolution proposals |

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
