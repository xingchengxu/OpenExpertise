# Changelog

All notable changes to OpenExpertise will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

_Nothing yet — add entries here as features land._

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
