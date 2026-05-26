# Plan E — Launch Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the community-readiness and release-prep gaps so the project can be linked from a launch post (HN / Twitter / r/LocalLLaMA / Discord) without embarrassing missing files.

**Architecture:** Pure content/process additions — no production-code changes. Adds: contributor docs (CONTRIBUTING / CODE_OF_CONDUCT / SECURITY), GitHub issue + PR templates, CI Node version matrix, CHANGELOG.md, progress-log catch-up, pre-commit hook installer, npm-publish launch checklist.

**Tech Stack:** No new dependencies. Existing CI uses pnpm + Node + GitHub Actions.

**Note on CoC (Task 2):** OpenExpertise adopts Contributor Covenant 2.1 by **reference** rather than inlining the upstream text. This is the same pattern used by Kubernetes, VS Code, React, and most large OSS projects — it keeps the canonical text authoritative and avoids drift if upstream issues a corrigendum. The file we ship is a 20-line shim pointing at the canonical URL.

---

## File Structure

**New files:**

```
.
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── SECURITY.md
├── CHANGELOG.md
├── .github/
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.yml
│   │   ├── feature_request.yml
│   │   ├── question.yml
│   │   └── config.yml
│   └── pull_request_template.md
├── scripts/
│   └── install-git-hooks.sh
└── docs/
    └── launch-checklist.md
```

**Modified:**

- `.github/workflows/ci.yml` — add Node version matrix (20, 22, 24).
- `docs/superpowers/overnight-progress.md` — append post-Plan-D entries.
- `README.md` — add small "Community" section linking to the new files.

---

## Task 1: `CONTRIBUTING.md`

**Files:**

- Create: `CONTRIBUTING.md`

- [ ] **Step 1: Write the file**

```markdown
# Contributing to OpenExpertise

Thanks for the interest. This document is the short-form contributor guide; the longer reasoning lives in `docs/superpowers/specs/`.

## TL;DR

- **Bugs:** open an issue with a reproduction (failing test if possible) before sending a patch.
- **Features:** open an issue first to discuss scope. Most new features land via a spec → plan → subagent-driven execution cycle (see below).
- **Docs / typos:** PR directly, no issue needed.

## Setup

```bash
pnpm install
pnpm -r build
pnpm test            # ~225 tests; expect green on main
```

Node 20.x or newer (Node 22 / 24 / 26 are tested in CI). `better-sqlite3` requires a working native build toolchain on first install.

## The spec → plan → execute rhythm

Non-trivial features go through three artifacts, each version-controlled:

1. **Spec** in `docs/superpowers/specs/YYYY-MM-DD-<name>-design.md` — what problem, what shape, what non-goals.
2. **Plan** in `docs/superpowers/plans/YYYY-MM-DD-<name>.md` — task-by-task breakdown with code blocks. Each task is small (~2-5 min of work) and ends with a test + commit.
3. **Execution** via subagent-driven development (`superpowers:subagent-driven-development`) — fresh subagent per task, two-stage review (spec compliance + code quality).

You don't need to use Claude Code to contribute, but if you do, the `superpowers:brainstorming` and `superpowers:writing-plans` skills are the entry points.

For small fixes or pure-content PRs, skip this and just send the patch.

## Testing discipline

- **Every code change includes a test.** TDD when you can — write the test first, watch it fail, write the minimum code, watch it pass.
- **Mocked over real:** unit + e2e tests use scripted LLM clients and scripted subprocess runners — no real API keys or installed CLIs required.
- Run `pnpm test` before sending a PR. CI runs typecheck + lint + format + test on Node 20/22/24.

## Commit style

- One logical change per commit. Frequent commits are encouraged.
- Conventional-commit-ish prefixes: `feat:`, `fix:`, `docs:`, `test:`, `chore:`, `style:`, `refactor:`, `demo:`.
- Subject ≤ 70 chars. Body explains _why_ if not obvious.
- Don't squash unless asked.

## PR checklist

A PR is ready to merge when:

- [ ] Tests pass (`pnpm test`).
- [ ] Typecheck clean (`pnpm typecheck`).
- [ ] Lint clean (`pnpm lint` — 0 errors; warnings on test files are tolerated).
- [ ] Format clean (`pnpm format:check`).
- [ ] If the change affects an `experience.yaml` example, it passes `oe validate`.
- [ ] Existing docs updated if behavior changed.
- [ ] CHANGELOG.md updated under `## Unreleased`.

## Reporting bugs

Use the **Bug report** issue template. Minimum bar:

- OpenExpertise version (output of `git rev-parse HEAD` or `node packages/cli/dist/bin.js --version`).
- Node version (`node --version`).
- OS.
- Reproduction: the `experience.yaml` snippet + the command you ran + the actual vs expected output.

## Reporting security issues

See [SECURITY.md](SECURITY.md). Do **not** open a public issue for security vulnerabilities.

## Code of Conduct

This project follows the [Contributor Covenant 2.1](CODE_OF_CONDUCT.md). Be kind; assume good faith; help newcomers.

## License

By contributing you agree your work will be released under the [MIT License](LICENSE) © 2026 OpenExpertise.
```

In the saved file the triple-backtick fences are LITERAL — the `bash` and `markdown` blocks render as code blocks.

- [ ] **Step 2: Smoke-check**

```bash
cat CONTRIBUTING.md | head -20
```

Expected: starts with `# Contributing to OpenExpertise` and shows the TL;DR section.

- [ ] **Step 3: Commit**

```bash
git add CONTRIBUTING.md
git commit -m "docs: CONTRIBUTING.md — setup, spec/plan rhythm, PR checklist"
```

---

## Task 2: `CODE_OF_CONDUCT.md` (shim referencing Contributor Covenant 2.1)

**Files:**

- Create: `CODE_OF_CONDUCT.md`

This file deliberately does **not** inline the full upstream text. It references the canonical version, summarizes expectations in three lines, and tells reporters where to send concerns. This is the pattern used by Kubernetes, VS Code, React, and most large OSS projects.

- [ ] **Step 1: Write the shim**

```markdown
# Code of Conduct

OpenExpertise adopts the **[Contributor Covenant, version 2.1](https://www.contributor-covenant.org/version/2/1/code_of_conduct/)** as its code of conduct.

The canonical text is maintained upstream at the link above. Read it before contributing.

## Summary

- Treat everyone with respect, regardless of experience level, identity, or background.
- Disagree on technical merit; assume good faith on intent.
- Help newcomers — every contributor was new once.

## Reporting concerns

If you experience or witness a violation, please email **conduct@openexpertise.dev** (or open a confidential GitHub Security Advisory if you'd rather not use email). Reports are reviewed by the maintainers and handled per the upstream Enforcement Guidelines.

## Attribution

The Contributor Covenant is licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). See the upstream link for the complete text and Enforcement Guidelines.
```

- [ ] **Step 2: Smoke-check**

```bash
head -10 CODE_OF_CONDUCT.md
```

Expected: file starts with `# Code of Conduct`.

- [ ] **Step 3: Commit**

```bash
git add CODE_OF_CONDUCT.md
git commit -m "docs: CODE_OF_CONDUCT — adopt Contributor Covenant 2.1 by reference"
```

---

## Task 3: `SECURITY.md`

**Files:**

- Create: `SECURITY.md`

- [ ] **Step 1: Write the file**

```markdown
# Security Policy

## Supported versions

OpenExpertise is pre-1.0. Only the latest `main` branch is supported for security fixes. Once we tag the first stable release the table below will be updated.

| Version | Supported          |
| ------- | ------------------ |
| main    | ✓                  |
| < 1.0   | best-effort        |

## Reporting a vulnerability

Please report security issues via **[GitHub Security Advisories](https://github.com/xingchengxu/OpenExpertise/security/advisories/new)** so we can coordinate a fix before public disclosure.

If you prefer email, send to **security@openexpertise.dev**. Encrypt with the maintainer key (linked from the GitHub profile) for highly sensitive reports.

### What to include

- A short description of the issue.
- Steps to reproduce.
- The version / commit SHA where you observed it.
- Impact assessment (data exposure, code execution, denial of service, etc.).

### What to expect

- **Acknowledgement** within 3 business days.
- **First-pass assessment** within 7 business days.
- **Fix or mitigation** depending on severity:
  - Critical (RCE / data exfiltration): aim for ≤ 14 days.
  - High (privilege escalation, persistent DoS): aim for ≤ 30 days.
  - Medium / Low: rolled into the next regular release.
- **Public disclosure** coordinated with the reporter; default 90 days from initial report, sooner if a patch is shipping.

We credit reporters in the changelog unless you ask not to be named.

## Out of scope

The following are NOT considered security issues:

- Misuse of the `cli-agent` node kind to invoke external CLIs that themselves have unsafe defaults — that's the CLI's responsibility, not ours. We document any necessary hardening flags in `docs/cli-agent.md`.
- Self-inflicted leaks from a user-authored `tool` node (e.g. logging an API key). Inspect your own code.
- Resource exhaustion from a user-authored experience with unbounded `for_each` or `repeat:` — bounds are the author's responsibility. We're considering an `oe run --max-budget` flag for v2.

## Trust model in one paragraph

OpenExpertise runs **untrusted YAML graphs and trusted code modules** in a single Node.js process. The trust model is: the user wrote (or reviewed) the YAML, and trusts every `tool`/`skill` module on disk. Loading an experience from a stranger's repo means loading their code — treat it like `npm install`.
```

- [ ] **Step 2: Commit**

```bash
git add SECURITY.md
git commit -m "docs: SECURITY.md — vulnerability reporting + supported versions"
```

---

## Task 4: GitHub issue templates

**Files:**

- Create: `.github/ISSUE_TEMPLATE/bug_report.yml`
- Create: `.github/ISSUE_TEMPLATE/feature_request.yml`
- Create: `.github/ISSUE_TEMPLATE/question.yml`
- Create: `.github/ISSUE_TEMPLATE/config.yml`

- [ ] **Step 1: Create `config.yml`**

```yaml
blank_issues_enabled: false
contact_links:
  - name: Security vulnerability
    url: https://github.com/xingchengxu/OpenExpertise/security/advisories/new
    about: Please report security issues via Security Advisories, not public issues.
  - name: Discussion / chat
    url: https://github.com/xingchengxu/OpenExpertise/discussions
    about: Open-ended questions go in Discussions, not issues.
```

- [ ] **Step 2: Create `bug_report.yml`**

```yaml
name: Bug report
description: Report a defect that's reproducible
labels: [bug]
body:
  - type: markdown
    attributes:
      value: |
        Thanks for taking the time to file a bug. Please fill out every section — incomplete reports get triaged last.
  - type: input
    id: version
    attributes:
      label: OpenExpertise version
      description: Output of `git rev-parse HEAD` (if source build) or installed version (when npm-published).
      placeholder: e.g. a8773a2 or 0.1.0
    validations:
      required: true
  - type: input
    id: node
    attributes:
      label: Node version
      description: Output of `node --version`.
      placeholder: e.g. v22.11.0
    validations:
      required: true
  - type: input
    id: os
    attributes:
      label: Operating system
      placeholder: macOS 15 / Ubuntu 24.04 / Windows 11
    validations:
      required: true
  - type: textarea
    id: repro
    attributes:
      label: Reproduction
      description: The smallest `experience.yaml` + tool/prompt files + the exact command you ran. Paste inline or link a gist.
      render: yaml
    validations:
      required: true
  - type: textarea
    id: actual
    attributes:
      label: What happened
      description: Actual output. Include relevant stderr / event log lines.
    validations:
      required: true
  - type: textarea
    id: expected
    attributes:
      label: What you expected
      description: One or two sentences.
    validations:
      required: true
  - type: textarea
    id: notes
    attributes:
      label: Anything else
      description: Suspected cause, attempted workarounds, screenshots, anything that might help.
```

- [ ] **Step 3: Create `feature_request.yml`**

```yaml
name: Feature request
description: Propose a new capability or behavior change
labels: [enhancement]
body:
  - type: markdown
    attributes:
      value: |
        Non-trivial features land via the spec → plan → execute rhythm. This issue is the start of that conversation. Expect to write a short spec before any code.
  - type: textarea
    id: problem
    attributes:
      label: Problem
      description: Describe the situation that motivates this. What can't you do today? Who feels the pain?
    validations:
      required: true
  - type: textarea
    id: proposal
    attributes:
      label: Proposed shape
      description: Rough sketch of the API / YAML / CLI change. Don't worry about exact syntax.
    validations:
      required: true
  - type: textarea
    id: alternatives
    attributes:
      label: Alternatives considered
      description: Workarounds you've tried; similar features in other tools; why those don't fit.
  - type: dropdown
    id: scope
    attributes:
      label: Estimated scope
      options:
        - Small (single file, < 100 LOC)
        - Medium (new node kind / dispatcher / CLI command)
        - Large (architectural — new scheduler, new runtime concept)
        - Not sure
    validations:
      required: true
  - type: checkboxes
    id: willing
    attributes:
      label: Will you contribute?
      options:
        - label: I'm willing to write the spec and implementation plan.
        - label: I'm willing to implement once the plan is reviewed.
        - label: I'm requesting; happy to help review.
```

- [ ] **Step 4: Create `question.yml`**

```yaml
name: Question
description: How do I ... ? Why does ... ?
labels: [question]
body:
  - type: markdown
    attributes:
      value: |
        Have you checked the [docs](https://github.com/xingchengxu/OpenExpertise/tree/main/docs)? Open-ended discussion belongs in [Discussions](https://github.com/xingchengxu/OpenExpertise/discussions); specific "how do I" with a concrete attempted-this-and-it-didn't-work is welcome here.
  - type: textarea
    id: goal
    attributes:
      label: What are you trying to do?
    validations:
      required: true
  - type: textarea
    id: tried
    attributes:
      label: What have you tried?
      description: Paste your `experience.yaml` snippet + the command output if relevant.
      render: yaml
  - type: textarea
    id: where_looked
    attributes:
      label: Where you've already looked
      description: Links to docs you read, similar issues you found, etc.
```

- [ ] **Step 5: Commit**

```bash
git add .github/ISSUE_TEMPLATE/
git commit -m "ci: GitHub issue templates (bug, feature, question, config)"
```

---

## Task 5: `.github/pull_request_template.md`

**Files:**

- Create: `.github/pull_request_template.md`

- [ ] **Step 1: Write the file**

```markdown
<!-- Thanks for contributing! Fill in what's relevant; delete what isn't. -->

## What this changes

<!-- One paragraph. What problem does this solve, and how does this patch solve it? -->

## How to verify

<!-- Concrete steps a reviewer can run locally. -->

```bash
pnpm test
# or for a single test:
pnpm exec vitest run path/to/relevant.test.ts
```

## Checklist

- [ ] Tests added / updated (failing tests come BEFORE the fix where reasonable).
- [ ] `pnpm typecheck` clean.
- [ ] `pnpm lint` clean (0 errors).
- [ ] `pnpm format:check` clean (run `pnpm format` to auto-fix).
- [ ] If this changes an example, `oe validate examples/<name>` passes.
- [ ] If this changes user-visible behavior, docs updated.
- [ ] `CHANGELOG.md` updated under `## Unreleased`.

## Type of change

- [ ] Bug fix (non-breaking)
- [ ] New feature (non-breaking)
- [ ] Breaking change (describe migration path below)
- [ ] Docs / tooling / chore

## Linked issue

Fixes #<issue-number> _(or "n/a" for trivial changes)_.

## Notes for the reviewer

<!-- Anything the diff alone won't make obvious: why this approach, what's intentionally out of scope, what to look at first. -->
```

- [ ] **Step 2: Commit**

```bash
git add .github/pull_request_template.md
git commit -m "ci: pull request template with checklist + verification steps"
```

---

## Task 6: CI Node version matrix

**Files:**

- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Read the current workflow**

```bash
cat .github/workflows/ci.yml
```

Current state: single job, `node-version: '20'`.

- [ ] **Step 2: Rewrite with matrix**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        node: ['20', '22', '24']
    name: test (node ${{ matrix.node }})
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm -r build
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm format:check
      - run: pnpm test
```

`fail-fast: false` keeps the other Node jobs running even if one fails — useful for diagnosing ABI mismatches in `better-sqlite3`.

- [ ] **Step 3: Local sanity check (the file is YAML)**

```bash
node -e "require('js-yaml')" 2>&1 | tail -3 || echo "js-yaml not installed (fine — workflow syntax is checked by GitHub)"
cat .github/workflows/ci.yml | head -30
```

You don't need a local YAML linter — GitHub will reject malformed workflow files at push time. Just eyeball the indentation.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: Node version matrix (20, 22, 24) with fail-fast: false"
```

---

## Task 7: `CHANGELOG.md` v0.1.0 entry

**Files:**

- Create: `CHANGELOG.md`

The entry is synthesized from the V1 + V2 progress logs and key merge commits.

- [ ] **Step 1: Write the file**

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: CHANGELOG.md — v0.1.0 release notes from V1+V2 history"
```

---

## Task 8: `overnight-progress.md` catch-up

**Files:**

- Modify: `docs/superpowers/overnight-progress.md`

The log stops at Plan D's "Next concrete actions". Append entries for post-D work so the historical record matches reality.

- [ ] **Step 1: Append catch-up entries**

Open `docs/superpowers/overnight-progress.md` and append at the bottom:

```markdown

---

## Post-V2 Live-Smoke + Documentation Polish (2026-05-26)

Worked directly on `main` (small fixes + content edits, not feature work). No new spec — these were either bug fixes surfaced by real-API smoke tests, content rewrites, or housekeeping.

### Live-smoke fixes

Three real bugs surfaced when running the examples against actual provider APIs and CLIs. All three were reduced to failing tests and fixed.

| Commit | Fix |
|---|---|
| `d1fcae0` | `fix(llm-openai)`: strip `<think>...</think>` prefix from tool-call arguments. Reasoning models (DeepSeek-R1, o1, qwq) prefix tool-call arguments with chain-of-thought blocks; the OpenAI client's `parseArguments` now strips them before JSON.parse. |
| `7761bf8` | `fix(cli-agent)`: unwrap Claude Code's JSON envelope + strip markdown ` ```json ` code fence from stdout. Claude Code wraps structured output in an outer envelope plus markdown fences; the cli-agent parser now handles both. |
| `6751509` | `fix(cli-agent)`: GeminiProvider passes `--skip-trust` so the CLI runs outside its trust dir. Without this flag, `gemini` refused to run in tmp dirs and CI workdirs. |

### New showcase example

| Commit | Example |
|---|---|
| `bbb3800` | `examples/tri-cli-orchestration` — Claude Code → Codex → Gemini in one DAG, state flowing between three rival vendors. 9 examples total now. |

### Content + housekeeping

| Commit | Change |
|---|---|
| `e2a7c97` | Root README rewrite — "AI-era Makefile" positioning, vs-alternatives comparison table, install-and-run quickstart. |
| `a633339` | README "Verified end-to-end" section + self-hosted LLM (`OPENAI_BASE_URL`) callout. |
| `04df328` | README: bump Gemini CLI to verified ✓ + add 3-CLI orchestration callout. |
| `bf5f201` / `05ba537` | MIT License added; copyright corrected to OpenExpertise. |
| `a8773a2` | README: replaced `<repo-url>` placeholders with the actual GitHub URL. |

### Stats at end of post-V2 polish

- **Test count:** 225 passing (was 218 at end of Plan D; +7 from regression tests + tri-cli-orchestration e2e).
- **Examples:** 9.
- **Packages:** 14.
- All packages have `publishConfig: { access: "public" }`. CI on Node 20 (Plan E expands to 20/22/24).

### Next concrete actions

1. Plan E — Launch Readiness (community docs + CI matrix + CHANGELOG + launch checklist).
2. After Plan E: `npm publish` all 14 packages + tag v0.1.0 + write launch post.
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/overnight-progress.md
git commit -m "docs(progress): catch up — post-V2 live-smoke fixes + tri-cli + README rewrite + LICENSE"
```

---

## Task 9: Pre-commit hook installer

**Files:**

- Create: `scripts/install-git-hooks.sh`

No `husky` or `lefthook` dependency. A single bash script that copies a pre-commit hook into `.git/hooks/`. Contributors run it once.

- [ ] **Step 1: Create `scripts/install-git-hooks.sh`**

```bash
#!/usr/bin/env bash
# Install local git hooks for OpenExpertise contributors.
# Run once after cloning:
#
#   bash scripts/install-git-hooks.sh
#
# The hook runs typecheck + lint + format:check + test before each commit.
# To skip a single commit (when you know what you're doing):
#
#   git commit --no-verify -m "..."
#
# To uninstall:
#
#   rm .git/hooks/pre-commit

set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
hook_path="${repo_root}/.git/hooks/pre-commit"

mkdir -p "$(dirname "${hook_path}")"

cat > "${hook_path}" <<'HOOK'
#!/usr/bin/env bash
# OpenExpertise pre-commit hook.
# Installed by scripts/install-git-hooks.sh.
set -euo pipefail

# Only check what's staged. If nothing's staged, exit clean.
if git diff --cached --quiet; then
  exit 0
fi

echo "[pre-commit] typecheck..."
pnpm typecheck

echo "[pre-commit] lint (errors only)..."
pnpm lint

echo "[pre-commit] format:check..."
pnpm format:check

echo "[pre-commit] tests..."
pnpm test

echo "[pre-commit] OK"
HOOK

chmod +x "${hook_path}"

echo "Installed pre-commit hook at ${hook_path}"
echo ""
echo "It runs: typecheck → lint → format:check → test"
echo "Skip once with: git commit --no-verify"
echo "Uninstall with: rm ${hook_path}"
```

- [ ] **Step 2: Make it executable + smoke**

```bash
chmod +x scripts/install-git-hooks.sh
ls -la scripts/install-git-hooks.sh
bash -n scripts/install-git-hooks.sh   # syntax check; no output = OK
```

Expected: file is executable; bash syntax check passes silently.

Do NOT actually run the installer here (it would write into the active `.git/hooks/` and slow down our own commits during this plan's execution). Document the run command in the README.

- [ ] **Step 3: Commit**

```bash
git add scripts/install-git-hooks.sh
git commit -m "chore: install-git-hooks.sh — copyable pre-commit (typecheck/lint/format/test)"
```

---

## Task 10: `docs/launch-checklist.md`

**Files:**

- Create: `docs/launch-checklist.md`

The gating checklist for actual npm-publish day. Authoritative reference so we don't ship a half-published monorepo.

- [ ] **Step 1: Write the checklist**

```markdown
# v0.1.0 Launch Checklist

Run this checklist linearly on the day of `npm publish`. Don't skip.

## T-7 days: stabilize

- [ ] All open critical / important issues either closed or labeled `wontfix-for-v0.1`.
- [ ] CI green on `main` for all 3 Node versions (20, 22, 24).
- [ ] `pnpm clean && pnpm install && pnpm -r build && pnpm typecheck && pnpm lint && pnpm format:check && pnpm test` clean on a fresh clone.
- [ ] Manual smoke of `examples/review-branch` and `examples/tri-cli-orchestration` with real API keys.

## T-3 days: docs freeze

- [ ] `README.md` examples copy-pasteable and verified end-to-end.
- [ ] `docs/cli-agent.md`, `docs/mcp-server.md`, `docs/ultraexpertise.md`, `docs/comparison.md` reflect current behavior.
- [ ] `CHANGELOG.md` `## Unreleased` empty; `## [0.1.0]` finalized.
- [ ] `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md` present.

## T-1 day: version sync + publish dry-run

- [ ] All 14 publishable packages on `version: 0.1.0`:

  ```bash
  for pkg in packages/*/package.json; do
    node -e "console.log(require('./${pkg}').name + ' ' + require('./${pkg}').version)"
  done
  ```

  Every line should end in ` 0.1.0`. If any drifted, sync them in a single chore commit.

- [ ] Every publishable package has `publishConfig: { access: "public" }`:

  ```bash
  for pkg in packages/*/package.json; do
    name=$(node -e "console.log(require('./${pkg}').name)")
    access=$(node -e "console.log((require('./${pkg}').publishConfig||{}).access||'MISSING')")
    echo "${name}: ${access}"
  done | grep -v ' public$' || echo "All publishable packages set to public."
  ```

- [ ] `npm publish --dry-run` on each package from inside its dir; review the file list. Confirm `dist/` is included and source files are not.

  ```bash
  for dir in packages/*/; do
    echo "=== ${dir} ==="
    (cd "${dir}" && npm publish --dry-run --access public 2>&1 | tail -30)
  done
  ```

  Look for: tarball size sane (< 1 MB for non-bundle packages), no `.env` or `*.key` files, no `node_modules/` content, no `tests/` content.

- [ ] Cross-package workspace dependencies are `workspace:*` in source but should resolve to concrete versions on publish. Verify with:

  ```bash
  cd packages/cli
  npm pack --dry-run 2>&1 | grep -i workspace
  ```

  Expected: pnpm should rewrite `workspace:*` to `^0.1.0` during pack. If you see `workspace:*` in the tarball, pnpm's `publish` flow isn't being used — switch to `pnpm publish -r --no-git-checks --dry-run`.

## Publish day: the actual publish

- [ ] Make sure you're logged in:

  ```bash
  npm whoami
  ```

  Expected: your npm username. If not, `npm login --auth-type=web`.

- [ ] Two-factor auth on the npm account. If you don't have it, set it up first.

- [ ] **Publish via pnpm** (not raw `npm publish` — pnpm handles `workspace:*` rewrites):

  ```bash
  pnpm publish -r --access public --no-git-checks
  ```

  `-r` recurses through all workspace packages. `--no-git-checks` because we tag separately.

- [ ] Verify each package landed:

  ```bash
  for pkg in packages/*/package.json; do
    name=$(node -e "console.log(require('./${pkg}').name)")
    echo "${name}: $(npm view ${name} version 2>&1 | head -1)"
  done
  ```

  Every line should show `0.1.0`.

- [ ] Smoke-test from a fresh dir (NOT the repo):

  ```bash
  cd /tmp
  mkdir oe-publish-smoke
  cd oe-publish-smoke
  npm init -y
  npm install @openexpertise/cli
  npx oe --help
  ```

  Expected: CLI loads, shows help.

## Tag + release

- [ ] Tag the release commit:

  ```bash
  git tag -a v0.1.0 -m "v0.1.0 — first public release"
  git push origin v0.1.0
  ```

- [ ] Create a GitHub Release pointing at the tag. Copy the `## [0.1.0]` section of `CHANGELOG.md` into the release notes.

## Launch comms

- [ ] HN Show post: link to the GitHub repo + the `## What it is (in one sentence)` README paragraph. Highlight 3 facts: codify SOPs as YAML, persistent state, evolution loop.
- [ ] Twitter / X thread: short version of HN post + the `tri-cli-orchestration` demo image.
- [ ] r/LocalLLaMA post: emphasize `OPENAI_BASE_URL` support for vLLM / Ollama / LM Studio.
- [ ] Anthropic Discord (#projects channel if it exists): brief intro + repo link.

## Day 1-7: monitor

- [ ] Watch GitHub Issues; aim for ≤ 24h first-response.
- [ ] Watch npm download counts: <https://npm-stat.com/charts.html?package=@openexpertise/cli>.
- [ ] Triage incoming bug reports; create a v0.1.1 milestone for fixes.
- [ ] Capture the first three "I tried OpenExpertise for X" stories — they're the basis for testimonials and case studies.

## If something breaks during publish

- [ ] **Unpublish window:** npm allows unpublish within 72 hours. Use only if a published package is _actively broken_:

  ```bash
  npm unpublish @openexpertise/<pkg>@0.1.0
  ```

  After 72 hours, deprecate instead:

  ```bash
  npm deprecate @openexpertise/<pkg>@0.1.0 "broken; install 0.1.1 instead"
  ```

- [ ] If only ONE package is broken, publish the fixed version as `0.1.1` for that package only and leave the rest at `0.1.0`. The monorepo doesn't require lockstep versioning.

## Out of scope for v0.1.0

Items deliberately punted to v0.2 or v0.3 — don't try to fix these before launch:

- Streaming LLM responses (V2 non-goal; deferred).
- Session-mode CLI agents (V2 non-goal).
- `oe evolve --apply` automated diff application.
- Hero GIF in `docs/assets/`. Replace placeholder once recorded; not blocking.
- Auto-publish on tag via GitHub Actions — manual publish for v0.1.0 is fine.
- Docs site (Astro Starlight / Docusaurus) — multi-day work, post-launch.
```

- [ ] **Step 2: Commit**

```bash
git add docs/launch-checklist.md
git commit -m "docs: launch-checklist.md — v0.1.0 publish-day gating list"
```

---

## Task 11: README "Community" section + final verify

**Files:**

- Modify: `README.md`

After the existing `## Contributing` section (or wherever fits), make sure the new files are linked.

- [ ] **Step 1: Verify README already references the new docs**

```bash
grep -E "CONTRIBUTING|CODE_OF_CONDUCT|SECURITY|CHANGELOG" README.md
```

Expected output depends on current README state. If any of CONTRIBUTING / CODE_OF_CONDUCT / SECURITY / CHANGELOG aren't already linked, add a small "Community" section near the bottom of the README, just before `## License`:

```markdown
## Community

- [Contributing guide](CONTRIBUTING.md) — setup, conventions, the spec → plan → execute rhythm.
- [Code of Conduct](CODE_OF_CONDUCT.md) — we follow Contributor Covenant 2.1.
- [Security policy](SECURITY.md) — how to report vulnerabilities.
- [Changelog](CHANGELOG.md) — what's in each release.
```

If they're already linked elsewhere (e.g. inline in the README body), this section is optional.

- [ ] **Step 2: Final full verification**

```bash
pnpm clean && pnpm install && pnpm -r build 2>&1 | tail -5
pnpm typecheck 2>&1 | tail -3
pnpm lint 2>&1 | tail -3
pnpm format:check 2>&1 | tail -3
pnpm test 2>&1 | tail -5
```

Expected: all green; **225 tests passing** (no test changes in this plan).

If `pnpm format:check` complains about any of the new markdown files, run `pnpm format` and commit as `style: prettier formatting for launch readiness`.

- [ ] **Step 3: Commit + log final state**

```bash
git add README.md
git commit -m "docs: README community section linking CONTRIBUTING/COC/SECURITY/CHANGELOG"
git log --oneline main..HEAD | head -15
```
