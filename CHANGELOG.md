# Changelog

All notable changes to OpenExpertise will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

_Nothing yet — add entries here as features land._

## [0.1.4] — 2026-05-28

Patch release bundling 4 user-facing improvements: 2 DX fixes from the v0.1.3 post-release sweep, the `OE_OPENAI_MODEL` / `OE_ANTHROPIC_MODEL` override unblocking self-hosted users, and a substantial synthesizer-prompt hardening for `oe ultra`. All caught from real-API testing.

### Added

- **`OE_OPENAI_MODEL` and `OE_ANTHROPIC_MODEL` env vars** — `defaultModelFor` now honors these as overrides. Previously `oe ultra` and `oe evolve` hardcoded `gpt-4o-2024-11-20` and threw 404 against any self-hosted OpenAI-compatible endpoint (vLLM / Ollama / LM Studio / etc.). Per-node YAML `model:` overrides still take precedence; the env vars apply when no per-node model is set.

### Changed

- **`oe ultra` synthesizer prompt — substantial hardening.** Live-tested against a self-hosted MiniMax-2.7-w8a8 endpoint; the first synthesis attempt produced YAML with 3+ validation errors. Six iterations of prompt improvements landed:
  1. Top-level shape rule — `nodes:` and `edges:` MUST nest under `graph:`, not at root
  2. YAML escaping rule — always quote strings containing `:`, `#`, `{}`, `[]`, etc.
  3. Per-kind required-field cheatsheet (one block per node kind, dataset/cli-agent fully spelled out)
  4. Edges have ONLY `from`/`to`/`when` — no `description:`, no `label:`
  5. `state.schema` `type` values restricted to `string | number | boolean | object | array | null` (no `integer`, no `int`)
  6. Dataset semantics — `kind: dataset` is for tabular rows (JSON/JSONL/CSV/Parquet/SQLite) only; for single-file loads use `kind: tool` with `readFileSync`; `writes:` MUST be exactly one field
  7. Defensive tool stubs — `oe run` MUST succeed before any user wiring; every state read uses `?? fallback`; the first node populates everything downstream needs from a fixture
  8. Explicit 11-item self-check before returning

  Reduced failure rate from "100% need manual YAML fixes on MiniMax-2.7-w8a8" to "schema-clean and runtime-mostly-clean on first try". The remaining hard case is cross-field consistency (`writes:` matching `state.schema` names) — best solved by auto-retry on validation failure, planned for the next release.

- The clone destination for subpath-based `gh:` installs uses the last meaningful path segment as the name, so `gh:org/monorepo/examples/x` and `gh:org/monorepo/examples/y` co-exist in `.openexpertise/experiences/x/` and `…/y/` instead of colliding.

### Fixed

- **`oe validate <non-existent-path>`** now prints a structured `experience.yaml not found at <path>` message instead of a bare `ENOENT` propagating from the file-system read. Matches the error style of every other command. (Reported by the v0.1.3 patch sweep.)
- **`oe install gh:owner/repo/subpath/path`** now parses the trailing path components as a subpath instead of silently dropping them. `gh:jane/monorepo/examples/digest@v0.2.0` clones `jane/monorepo` at `v0.2.0` and installs only `examples/digest/` into `.openexpertise/experiences/digest/`. (Sweep finding #2.)

[0.1.4]: https://github.com/xingchengxu/OpenExpertise/releases/tag/v0.1.4

## [0.1.3] — 2026-05-28

Same-day patch — UX polish on the unique features (`oe ultra`) + cookbook + tutorial work that landed after 0.1.2. No breaking changes.

### Added

- **`oe ultra` two-phase progress indicator** — replaces the silent 30-90s wait with per-phase spinner + ✓ + timing, so users know whether the LLM is alive between analyze and synthesize.
- **`oe ultra --dry-run`** flag — runs Phase 1 (analyze) only, prints the detected shape (nodes, phases, open questions), exits 0 without spawning the heavier Phase 2 synthesis. Halves the time + tokens for iterating the task description.
- **Numbered next-steps output** on `oe ultra` completion — replaces the pino JSON dump with a human-readable checklist + reference link to the docs tutorial.
- **`UltraExpertise.author()` opts** gain optional `onPhase` callback (typed `PhaseEvent` union) and `stopAfterAnalyze` flag. Backwards-compatible — passing neither preserves prior behavior.
- **3 new cookbook recipes** for v0.1.1 capabilities:
  - [`mcp-resource-dataset`](https://xingchengxu.github.io/OpenExpertise/cookbook/mcp-resource-dataset) — reading from an MCP server via the dataset source. Covers `mcp.json` config, row normalization contract, and the 5 actionable error paths.
  - [`submit-to-registry`](https://xingchengxu.github.io/OpenExpertise/cookbook/submit-to-registry) — happy path for `oe submit` with the pre-submit checklist + field auto-detection table + dry-run.
  - [`cross-vendor-chain`](https://xingchengxu.github.io/OpenExpertise/cookbook/cross-vendor-chain) — Claude → Codex → Gemini serial pattern extracted as a reusable recipe.

### Docs

- **"Your first experience" tutorial** at `/guide/first-experience` — full 30-min walkthrough from `oe init` through tested + registry-submittable flow. Companion `examples/your-first-experience/` reference implementation (weekly engineering digest).
- **"Authoring with oe ultra" tutorial** at `/guide/authoring-ultra` — parallel 30-min walkthrough for the ultra-driven authoring path. Different domain (PR welcome bot) to avoid overlap.
- **5 case-study deep dives** at `/use-cases/`:
  - Multi-dimensional PR review (engineering)
  - Executable on-call runbook (SRE)
  - Multi-vendor compliance scan (security)
  - Reproducible LLM evaluation suite (ML platform)
  - Tier-1 support routing (customer ops)

### Changed

- README install section adds a callout for `oe ultra` — pointing first-time users at the LLM-authored path.
- Site nav version dropdown bumped 0.1.0 → 0.1.2 → 0.1.3.
- Test count: 293 → 310 (+17 in `packages/cli/tests/ultra.test.ts`).

[0.1.3]: https://github.com/xingchengxu/OpenExpertise/releases/tag/v0.1.3

## [0.1.2] — 2026-05-28

Tiny patch over 0.1.1 — the kind of bug only noticed after a fresh `npm install`.

### Fixed

- **`oe --version`** now prints the actual installed version. Was hardcoded to `0.1.0` in `packages/cli/src/index.ts:23`; rewired to read from the bundled `package.json` at runtime so it never drifts again.

[0.1.2]: https://github.com/xingchengxu/OpenExpertise/releases/tag/v0.1.2

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
