# Ultraexpertise + V2 Polish — Design Spec

Date: 2026-05-26
Status: Approved (user directive, no further brainstorm)
Position: V2 sprint. Covers four items: A) Ultraexpertise auto-SOP authoring; B) TUI upgrade; C) Examples library; D) Parallel scheduler + 429.

## Why this exists

OpenExpertise V1 covers Claude Code `/workflows`'s "Code-as-Law" architectural thesis with strictly stronger primitives (YAML + schema, persistent state, evolution, MCP both-ways). But three things keep us behind /workflows' user experience:

1. **No one-keyword summon.** /workflows has `ultrawork` — type the keyword, Claude analyzes your intent, writes a 300-LOC JS workflow, launches it. OE has a `experience-creator` skill but it's user-driven; not one-shot.
2. **TUI doesn't show live tokens / which tool the agent is currently using.** /workflows' TUI is htop-grade. Ours is a static node list.
3. **No 429 / rate-limit handling, no concurrent execution.** Sequential V1 scheduler dodges most rate-limit issues but caps throughput.

This spec covers four deliverables to close those gaps and extend OE's lead.

## A — Ultraexpertise (auto-SOP authoring)

**Goal:** Let an LLM agent inside OE itself do task analysis from a natural-language prompt and synthesize a complete experience.yaml + supporting files, written to a draft directory the user can inspect, run, and promote.

### Surfaces

1. **CLI:** `oe ultra "<natural language task>"`
2. **Claude Code slash command:** `/ultraexpertise <task>` — ships as a markdown command file under `~/.claude/commands/` that the existing `experience-creator` skill installer also drops.
3. **MCP tool:** `oe_ultra` exposed via the existing mcp-server so any MCP-aware CLI can invoke it.

All three surfaces hit the same engine. The CLI is the canonical entry point; the slash command and MCP tool are thin wrappers.

### Engine

New package `@openexpertise/authoring`:

```
packages/authoring/
├── package.json                    # deps: @openexpertise/core, @openexpertise/schema, ajv
├── tsconfig.json
├── src/
│   ├── index.ts                    # exports UltraExpertise + AuthorOpts + result types
│   ├── ultra.ts                    # UltraExpertise class — drives the two-phase flow
│   ├── prompts/
│   │   ├── analyzer.md             # system prompt for phase 1 (task analysis)
│   │   └── synthesizer.md          # system prompt for phase 2 (SOP synthesis)
│   ├── schemas/
│   │   ├── analysis.json           # JSON schema for the analysis tool response
│   │   └── synthesis.json          # JSON schema for the synthesis tool response
│   └── writer.ts                   # materializes synthesis output to draft dir
└── tests/
    ├── ultra.test.ts               # canned LLM round-trip
    └── writer.test.ts              # writer materializes correctly
```

### Two-phase flow

**Phase 1 — Task analysis.** UltraExpertise calls the LLM with `analyzer.md` as system prompt and the user's natural language as user message. Output via `structured_output` tool, schema:

```json
{
  "name": "soc2-pr-review",
  "description": "Review pull requests against SOC2 control objectives.",
  "domain": "compliance",
  "phases": [{"id": "collect"}, {"id": "analyze"}, {"id": "verify"}, {"id": "report"}],
  "state_fields": [
    {"name": "pr_id", "type": "string"},
    {"name": "diff", "type": "string"},
    {"name": "findings", "type": "array", "merge": "array_append"}
  ],
  "node_sketches": [
    {"id": "fetch_pr", "kind": "tool", "phase": "collect", "purpose": "Fetch the PR diff from GitHub"},
    {"id": "soc2_check", "kind": "agent", "phase": "analyze", "purpose": "Review against SOC2 controls", "fan_out_over": "controls"}
  ],
  "open_questions": ["Which SOC2 controls (CC6.1, CC6.7, ...) should be in scope?"]
}
```

This gives the user (and the next phase) a structured plan before any code lands.

**Phase 2 — SOP synthesis.** UltraExpertise calls the LLM again with `synthesizer.md` and the phase-1 output as input. Output via `structured_output`:

```json
{
  "experience_yaml": "<the full YAML as a string>",
  "files": [
    {"path": "tools/fetch_pr.mjs", "content": "..."},
    {"path": "prompts/soc2_check.md", "content": "..."},
    {"path": "README.md", "content": "..."}
  ],
  "next_steps": ["Set GITHUB_TOKEN", "Choose SOC2 controls list"]
}
```

### Writer

`writer.ts` takes the synthesis output and the draft directory (default `.openexpertise/drafts/<slug>/`), creates the directory, writes every file, runs `oe validate` programmatically, and returns:

```ts
interface UltraResult {
  slug: string
  draftDir: string          // absolute path
  analysis: AnalysisOutput  // phase 1
  synthesis: SynthesisOutput // phase 2
  validation: { valid: boolean; errors?: string[] }
  files_written: string[]
}
```

### CLI (`oe ultra`)

`oe ultra "<prompt>" [--out <dir>] [--llm <provider>] [--draft-dir <path>] [--no-validate]`

- Prints phase-1 analysis as a tree.
- Prints phase-2 synthesis summary.
- Prints validation result.
- Prints next steps + commands to run/promote.

### Draft → Promotion

Drafts live under `.openexpertise/drafts/<slug>/`. There's NO 3-day TTL (we explicitly diverge from /workflows here — OE drafts are git-trackable artifacts the user controls).

Promotion is a plain `mv`:

```bash
mv .openexpertise/drafts/soc2-pr-review examples/
```

We document this in the CLI output. No special "promote" command in V1; user moves the directory.

### Evolution-loop integration

Once promoted and run, the existing `oe evolve <runId>` already kicks in — the advisor sees the events + state diff and proposes upgrades to the experience YAML. **This is the killer composability**: the same LLM that *wrote* the SOP can then *improve* the SOP after seeing it run. Documented in the README.

### Test strategy

- Canned LLM client: phase 1 returns a fixed analysis, phase 2 returns a fixed synthesis. Writer test verifies the files land at the right paths.
- Real integration test in `e2e/` that runs `oe ultra "hello world tool that outputs greetings"` against a mocked LLM and asserts the resulting experience.yaml validates and runs.

## B — TUI Upgrade

**Goal:** The TUI shows per-node real-time token consumption + which tool/skill the node is currently using, mirroring /workflows' htop-grade panel.

### Changes

1. **Event channel additions.** In `@openexpertise/core` event bus, add:
   - `node.tokens` — `{ node_id, run_id, input_tokens, output_tokens, ts }` emitted by AgentDispatcher / SkillDispatcher / CliAgentDispatcher after each LLM call
   - `node.activity` — `{ node_id, run_id, activity: string, ts }` — free-text "current activity" string (e.g., "calling Anthropic claude-sonnet-4-6", "running `claude` subprocess", "AJV-validating output")

2. **Dispatchers emit.** Each LLM-using dispatcher emits `node.activity` before/after the LLM call and `node.tokens` after each completion using the `LLMCompleteResult.usage` field that's already returned.

3. **TUI subscribes.** `packages/tui/src/index.tsx` extends the node-row component to show:
   - cumulative input + output tokens (live)
   - current activity (truncated to fit row)
   - elapsed time

4. **Visual polish.** A header line showing TOTAL run-level tokens; a footer with run status + budget.

### Non-goals

- Cost calculation (model-pricing tables are version-churning, skip in V1).
- No graph visualization (text list of nodes is fine).
- No `oe inspect --tui` (still V1 punted).

## C — Examples Library Expansion

**Goal:** Ship 3 real-world templates beyond `hello-tool` / `dataset-aggregate` / `review-branch` / `agent-echo` / `cli-orchestration`. These templates show OE applied to recognizable problems.

### Templates

1. **`examples/oncall-runbook/`** — When a PagerDuty incident fires: fetch related logs (tool), categorize (agent), suggest mitigations (agent fan-out over 3 dimensions), generate summary (agent). Demonstrates `for_each` + sequential agents + structured output.

2. **`examples/issue-triage/`** — Take a GitHub issue body: classify (agent), find duplicates (tool → search), assign labels (agent), suggest owner (agent). Demonstrates tool + agent + state-aware downstream decisions.

3. **`examples/release-gates/`** — Pre-release checklist: dep license check (tool), changelog scan (agent), test coverage diff (tool), security scan (cli-agent → security reviewer in Claude Code). Final score (agent) gates the release. Demonstrates `cli-agent` + heterogeneous nodes + `when:` conditional edge.

Each template includes: `experience.yaml`, stub tool files, prompt files, README, and a small fixture if needed. None require real external APIs — fixtures stub the data.

## D — Parallel Scheduler + 429 handling

**Goal:** Concurrent execution where the DAG allows it, with rate-limit-aware retry and bounded concurrency.

### Changes

1. **`SequentialScheduler` → `ParallelScheduler`.** New class in `@openexpertise/core/graph/parallel-scheduler.ts`. Uses topological order but runs independent nodes concurrently up to a configured limit.

2. **Concurrency config.** YAML `runtime.concurrency: 4` (top-level under root spec) — defaults to `1` (preserves V1 behavior). The plan-2 `for_each.concurrency` field is finally honored (was parsed-but-ignored in V1).

3. **CLI flag.** `oe run --concurrency 4` overrides.

4. **LLM client retry.** `AnthropicLLMClient` and `OpenAILLMClient` gain a `retry: { max_attempts, base_ms }` constructor opt. They detect HTTP 429 / `rate_limit_error` and retry with exponential backoff. Default: max_attempts=4, base_ms=1000.

5. **CliAgentDispatcher subprocess concurrency.** Already starts one subprocess per node; ParallelScheduler handles parallelism. No new code in the dispatcher itself.

6. **Event ordering.** Events are timestamped; the event log JSONL may be out-of-order across nodes. Add a stable comparator in `oe inspect` that sorts by ts.

### Test strategy

- `parallel-scheduler.test.ts` — graph with 4 parallel-able nodes; assert all complete and total wall-time < sum of node times.
- `anthropic-client.test.ts` retry test — inject SDK that returns 429 once then success; assert retried.
- `openai-client.test.ts` retry test — same.

### Non-goals

- No global token-bucket / leaky-bucket queue spanning the whole process (per-client retry is enough).
- No streaming responses (still V2.5+).
- No work-stealing scheduler (simple semaphore is enough).

## Cross-cutting

- All four items respect existing strict TS flags, exactOptionalPropertyTypes, vitest patterns.
- All new packages get `publishConfig: { access: "public" }`.
- All commits follow conventional commit prefixes.
- Tests stay deterministic (canned LLMs / scripted subprocess runners).
- `pnpm test` should reach **~200 tests** after all four land (164 baseline + ~35).
- No breaking changes to existing YAML — `runtime.concurrency` is optional, defaults to 1.

## Success criteria

- `oe ultra "review my repo for security issues"` produces a `.openexpertise/drafts/<slug>/` containing a validated experience that you can `oe run` immediately.
- `/ultraexpertise` works inside Claude Code (shipped as a slash command).
- `oe run examples/review-branch --tui` shows live tokens + current activity per node.
- 3 new examples validate and pass their e2e tests (mocked).
- `oe run --concurrency 4` runs a fan-out graph in parallel; tests demonstrate it.
- `pnpm test` ≥ 200 passing.
- `pnpm typecheck && pnpm lint && pnpm format:check` clean.

## Execution order

Implementation plans, each its own file, each its own feature branch, each its own subagent-driven execution + final review + merge to main:

1. **Plan A — Ultraexpertise** (~15 tasks) — biggest, most differentiated.
2. **Plan B — TUI upgrade** (~7 tasks) — high visual impact.
3. **Plan C — Examples library** (~6 tasks) — content + e2e tests.
4. **Plan D — Parallel scheduler + 429** (~12 tasks) — architectural, risk-isolated last.

Total: ~40 tasks. Sequential plans, parallel-friendly subagent calls within each.
