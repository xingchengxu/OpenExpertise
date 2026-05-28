# Changelog

All notable changes to OpenExpertise will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

_Nothing yet — add entries here as features land._

## [0.1.1] — 2026-05-28

First patch release. Closes the most-visible Day-1 gaps: a zero-token onboarding demo, real starter templates, frictionless registry submission, and the mcp-resource dispatcher that the schema already accepted.

### Added

- **`oe demo`** — preview a bundled example without an API key. Ships 4 pre-recorded runs: `deep-research`, `review-branch` (★ with built-in advisor evolution proposal), `systematic-debugging`, `brainstorming`. The ★ one demonstrates the author → run → evolve loop in 60 seconds.
- **`oe init --template <name>`** — scaffold from one of 4 real starter shapes:
  - `tool-only` (default; preserves prior behavior — single tool node, no LLM)
  - `agent` — single LLM agent with structured output
  - `cli-agent` — single Claude Code subprocess invocation
  - `full-pipeline` — `tool → agent → cli-agent → tool`, with state passing between every kind and a Markdown report at the end
- **`oe submit`** — zero-friction registry submission. Inside an experience directory, validates the YAML, auto-detects GitHub remote / ref / subpath, generates the canonical `registry.json` entry, and opens a pre-filled issue against `xingchengxu/OpenExpertise` using the `experience_submission.md` template. Flags: `--tags`, `--name`, `--ref`, `--subpath`, `--description`, `--dry-run`, `--output <file>`.
- **`mcp-resource` dataset source** now actually works. Spawns an MCP server (stdio) per `mcp.json` config and reads resources via `resources/read`. Previously the schema accepted the shape but the dispatcher threw at runtime. Requires `@modelcontextprotocol/sdk` (new transitive dependency on `@openexpertise/node-kinds-dataset`). Stdio transport only in 0.1.x; HTTP transport planned for 0.2.x.

### Changed

- Test count: 265 → 292 (+27 across the four new commands).
- Pre-publish smoke script (`scripts/pre-publish-smoke.sh`) now runs all 9 gates in 2-3 minutes end-to-end; required for v0.1.1 republish.

### Docs

- **Ecosystem positioning page** at `/ecosystem` — explains where OE fits relative to MCP / Skills / Anthropic /workflows / autonomous agents (Claude Code, Codex, Gemini CLI, OpenHands, AutoGen, CrewAI, OpenClaw, Hermes Agent, OpenHuman, …). Honest about the cli-agent provider roadmap.
- **`/cookbook`** — 10 self-contained recipes for common patterns (fan-out, retry, conditional edges, merge strategies, nested experiences, etc.).
- **`awesome-openexpertise.md`** — curated community list at repo root.
- **`docs/registry.md`** — new `## Submit via oe submit` section explaining the recommended contribution path.
- **README hero** — animated `docs/assets/demo.svg` (oe doctor → registry → init → run) replaces the static doctor frame.

### Fixed

- CI workflow `pnpm/action-setup` version conflict with root `packageManager` field — silent failure on every push since at least `17bb137`. Same fix as docs.yml.
- Documentation consistency drift: "Five MCP tools" → "6" in 7 places; "14 packages" → "15" in CHANGELOG/CONTRIBUTING; stale test counts; outdated `node packages/cli/dist/bin.js` invocations in user-facing examples replaced with `oe`.

[0.1.1]: https://github.com/xingchengxu/OpenExpertise/releases/tag/v0.1.1

## [0.1.0] — 2026-05-27

First public release. OpenExpertise is an AI-era Makefile: codify expert
workflows as YAML graphs, run them with deterministic flow + LLM-powered
nodes, and evolve the graph after each run.

### Added

#### Runtime

- **6 node kinds in a single graph schema:** `tool` (deterministic code),
  `agent` (LLM with structured output), `skill` (Anthropic SKILL.md packages),
  `dataset` (file / SQLite / HTTP / MCP-resource), `experience` (nested OE),
  and `cli-agent` (delegate to Claude Code / Codex / Gemini subprocesses).
- **Sequential and parallel schedulers** with bounded concurrency
  (`--concurrency N` flag and `runtime.concurrency` in YAML); topological
  wave execution; 429-aware exponential backoff retry.
- **Persistent SQLite state store** (`.openexpertise/state.sqlite`) — every
  node's writes land in a typed blackboard; resume across sessions with
  `oe resume <run-id>`.
- **JSONL event log** (`.openexpertise/runs/<id>.jsonl`) — every dispatch,
  retry, write, and error captured for replay and audit.
- **Per-node memoization cache** for cheap re-runs after edits.
- **`for_each` fan-out** with `concurrency` honored, plus `when:` conditional
  edges for branching.
- **State merge strategies:** `array_append`, `set_once`, `last_wins`.

#### CLI (`oe`)

- `oe run <experience>` with `--tui`, `--concurrency`, `--resume`, `--once`.
- `oe inspect <run-id>` — event-ordered run reconstruction (parallel-safe sort by ts).
- `oe state <field>` — pull any field out of state SQLite.
- `oe resume <run-id>` — replay from the last successful node.
- `oe validate <experience>` — schema check before running.
- `oe evolve <run-id>` — advisor writes proposal markdown with git-apply-ready diff.
- `oe ultra "<intent>"` — one-keyword authoring: LLM scaffolds a full experience from a sentence.

#### CLI agent integration

- Subprocess runner with timeout, retry, output-format parsing (`text` | `json`),
  and AJV schema validation against parsed JSON.
- Supported providers: `claude-code`, `codex`, `gemini`.
- Two-way: outbound (delegate node to a CLI agent) AND inbound via `oe-mcp`
  (6 MCP tools exposed so external agents can run experiences from their sessions).

#### Authoring

- Schema-aware authoring helpers in `@openexpertise/authoring`.
- `/ultraexpertise` slash command + matching `oe ultra` CLI.
- Anthropic SKILL.md package (`@openexpertise/skill-experience-creator`) that
  teaches a code-assistant LLM how to author OE experiences.

#### TUI

- Ink-based live dashboard: phase progress, per-node status, live token stream,
  activity feed of recent events. Toggle with `--tui`.

#### Built-in examples (12)

- `hello-tool` — smallest possible flow.
- `dataset-aggregate` — CSV → aggregate.
- `agent-echo` — single agent with structured output.
- `review-branch` ★ — multi-dim code review + verifier + score + evolution. The hero demo.
- `oncall-runbook` — incident triage via `for_each` fan-out.
- `issue-triage` — classify → search dupes → conditional dedup → route. Shows `when:` edges.
- `release-gates` — license + changelog + coverage + Claude-Code security scan → release gate.
- `cli-orchestration` — Claude Code summarizes; Codex critiques.
- `tri-cli-orchestration` ★ — Claude → Codex → Gemini in one DAG.
- `deep-research` — Claude Code WebSearch + Gemini Google Search → cited synthesis.
- `systematic-debugging` — translates the superpowers `systematic-debugging` skill into a YAML flow.
- `brainstorming` — translates the superpowers `brainstorming` skill into a YAML flow.

#### Tests

- 265 passing across 64 test files. Every example ships a mocked-LLM e2e test.

#### Docs

- README with 60-second demo, comparison vs LangGraph/CrewAI/Anthropic workflows/Claude Code.
- Per-example README with run instructions and ASCII pipeline diagram.
- `docs/comparison.md` deep-dive vs alternatives.
- CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md.

### Acknowledgements

- The `systematic-debugging` example is a direct translation of the
  [Anthropic superpowers](https://github.com/anthropics/skills) skill of the
  same name — reused with attribution.
- The TUI uses [Ink](https://github.com/vadimdemedes/ink) by Vadim Demedes.

[0.1.0]: https://github.com/xingchengxu/OpenExpertise/releases/tag/v0.1.0
