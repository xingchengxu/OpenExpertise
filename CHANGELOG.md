# Changelog

All notable changes are recorded here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [Semantic Versioning 2.0](https://semver.org/spec/v2.0.0.html).

The pre-1.0 series uses 0.X.0 for feature releases; behavior may change between releases without major-version bumps until 1.0 ships.

## [Unreleased]

_Nothing yet._

## [0.1.0] — 2026-05-26

First public release. V1 walking skeleton + V2 polish.

### Added — V1 (Plans 1–6)

- Walking skeleton: monorepo, schema package, core runtime, `ToolDispatcher`, `oe` CLI, `examples/hello-tool`.
- Heterogeneous dispatchers: `AgentDispatcher` (Anthropic SDK), `SkillDispatcher`, `DatasetDispatcher`, `ExperienceDispatcher`, `on_error` policies (`skip` / `fail_run` / `retry`).
- Control flow: `for_each` fan-out (sequential in V1), conditional edges (`when:`), pipeline groups, phase grouping. `examples/review-branch` demo.
- Cache + resume (`oe resume <run-id>`), bounded loops (`repeat:`), `ink`-based TUI dashboard (`oe run --tui`), CLI commands `init`/`state`/`reset-state`/`diff`.
- Authoring skill: `experience-creator` SKILL.md package for Claude Code.
- `EvolutionAdvisor` + `oe evolve` + `oe diff` + `oe run --evolve` flag. Root README quickstart.

### Added — V2

- **Hero demo + OpenAI** (`feat/hero-demo-and-openai`, 17 commits): `@openexpertise/llm-openai` package, `--llm anthropic|openai` flag with provider precedence (env-var auto-detect → flag override), `examples/review-branch` rebuilt around a fixture diff with SQL injection, narrowed reviewer prompts, `docs/comparison.md`, `docs/demo-script.md`.
- **`cli-agent` node kind** (`feat/cli-agent-node-kind`, 14 commits): `@openexpertise/node-kinds-cli-agent` package with `claude-code` / `codex` / `gemini` providers, `SubprocessRunner` with DI for tests, JSON schema + text output parsing, `examples/cli-orchestration`, mocked e2e.
- **MCP server** (`feat/mcp-server`, 13 commits): `@openexpertise/mcp-server` with `oe-mcp` binary, 5 tools (`oe_validate` / `oe_state` / `oe_inspect` / `oe_run` / `oe_evolve`), in-process MCP round-trip tests, `docs/mcp-server.md`. Bumped `better-sqlite3` to ^12.10 for Node 26 prebuilt binaries.
- **Ultraexpertise** (`feat/ultraexpertise`, 14 commits): `@openexpertise/authoring` package, `oe ultra "<task>"` CLI command, `oe_ultra` MCP tool, `/ultraexpertise` Claude Code slash command. Two-phase LLM pipeline (analyze → synthesize) producing validated draft experiences in `.openexpertise/drafts/<slug>/`. Same `llm-factory` as `oe evolve` — author → run → evolve is one closed loop.
- **TUI upgrade** (`feat/tui-upgrade`, 9 commits): new `node.tokens` and `node.activity` event variants; `AgentDispatcher`, `SkillDispatcher`, `CliAgentDispatcher` all emit. Dashboard reducer extracted into a pure module + 11 unit tests. Per-node activity (truncated), per-node tokens, run-total tokens header.
- **Examples library** (`feat/examples-library`, 6 commits): `examples/oncall-runbook` (fan-out + sequential synthesis), `examples/issue-triage` (conditional dedup edge), `examples/release-gates` (tool + cli-agent + agent in one graph). All three with mocked e2e tests.
- **Parallel scheduler + 429 handling** (`feat/parallel-scheduler`, 10 commits): `runtime.concurrency` schema field; `for_each.concurrency` honored via `runWithLimit`; new `ParallelScheduler` subclassing `SequentialScheduler` for wave-based execution; `oe run --concurrency N` flag overrides YAML; 429-aware retry with exponential backoff on both Anthropic and OpenAI clients; `oe inspect` sorts events by `ts` for parallel-safe rendering.

### Added — Post-Plan-D polish (between V2 and release)

- Three real-API live-smoke fixes:
  - `fix(llm-openai)`: strip `<think>...</think>` prefix from reasoning-model tool-call arguments (reasoning models like DeepSeek-R1 / o1 prefix tool calls with chain-of-thought blocks).
  - `fix(cli-agent)`: unwrap Claude Code JSON envelope + strip markdown ` ```json ` fence from output.
  - `fix(cli-agent)`: GeminiProvider passes `--skip-trust` to run outside trusted workdirs.
- `examples/tri-cli-orchestration` — Claude Code → Codex → Gemini state-flow in one DAG (the cross-vendor headline demo).
- README rewrite with "AI-era Makefile" positioning, vs-alternatives comparison table, "Verified end-to-end" section listing 6 verified providers / paths.
- MIT License.

### Stats

- **Packages:** 14 (`schema`, `core`, `cli`, `evolution`, `authoring`, `mcp-server`, `llm-openai`, `tui`, `node-kinds-{tool,agent,skill,dataset,experience,cli-agent}`, `skill-experience-creator`).
- **Tests:** 225 passing (unit + e2e), zero flaky, all run without API keys.
- **Examples:** 9 (`hello-tool`, `dataset-aggregate`, `agent-echo`, `oncall-runbook`, `issue-triage`, `review-branch`, `cli-orchestration`, `release-gates`, `tri-cli-orchestration`).
- **CLI surface:** 10 commands (`init`, `validate`, `run`, `resume`, `inspect`, `state`, `reset-state`, `evolve`, `diff`, `ultra`).
- **MCP tools:** 6 (`oe_validate`, `oe_state`, `oe_inspect`, `oe_run`, `oe_evolve`, `oe_ultra`).

[Unreleased]: https://github.com/xingchengxu/OpenExpertise/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/xingchengxu/OpenExpertise/releases/tag/v0.1.0
