# Plan F — Real-world Examples: Deep Research + Systematic Debugging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship two flagship real-world example experiences: (1) `deep-research` — a multi-vendor research pipeline that fans out search work across Claude Code and Gemini CLIs and synthesizes a cited report; (2) `systematic-debugging` — translation of the superpowers `systematic-debugging` skill into an OpenExpertise flow that observes → hypothesizes → verifies (fan-out) → localizes → fixes via Claude Code → verifies the fix.

**Architecture:** Both examples are new `examples/<name>/` directories with `experience.yaml` + supporting tools/prompts + fixtures + mocked-LLM e2e tests. Both compose existing node kinds (no new dispatchers, no new packages). Both ship a real, runnable fixture so the demos work end-to-end with installed CLIs; the e2e suites use a ScriptedRunner so CI does not depend on real CLIs.

**Tech Stack:** Existing only — no new packages or external deps. Uses `tool`, `agent`, `cli-agent` (provider: `claude-code` and `gemini`) node kinds.

---

## File Structure

**New: `examples/deep-research/`**

```
examples/deep-research/
├── experience.yaml
├── package.json
├── README.md
├── tools/
│   ├── load_question.mjs           # reads fixtures/question.json → state.question
│   └── extract_citations.mjs       # post-process raw_findings → citations[]
├── prompts/
│   ├── clarify.md
│   ├── decompose.md
│   └── cross_reference.md
└── fixtures/
    └── question.json
```

**New: `examples/systematic-debugging/`**

```
examples/systematic-debugging/
├── experience.yaml
├── package.json
├── README.md
├── tools/
│   ├── capture_symptoms.mjs        # reads buggy_repo, captures stack trace + git status
│   └── run_tests.mjs               # runs the failing-test command, captures pass/fail
├── prompts/
│   ├── hypothesize.md
│   └── localize.md
└── fixtures/
    └── buggy_repo/
        ├── package.json
        ├── index.mjs               # has an off-by-one bug
        └── test.mjs                # node:test that fails
```

**New e2e tests:**

- `e2e/deep-research.e2e.test.ts`
- `e2e/systematic-debugging.e2e.test.ts`

**Modified:**

- `README.md` — update "Built-in examples" table to add the two new entries (count goes from 9 → 11).
- `docs/superpowers/overnight-progress.md` — append Plan F completion entry.

---

## Task 1: `deep-research` — experience.yaml + state shape

**Files:**

- Create: `examples/deep-research/experience.yaml`
- Create: `examples/deep-research/package.json`
- Create: `examples/deep-research/fixtures/question.json`

The DAG: load_question → clarify → decompose → (search_claude || search_gemini for_each) → extract_citations → cross_reference → (no write_report node — synthesis output IS the report).

- [ ] **Step 1: Create `fixtures/question.json`**

```json
{
  "question": "What are the practical trade-offs between in-memory caching and Redis for HTTP API response caching in 2026, and when does each become the wrong choice?"
}
```

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "@openexpertise/example-deep-research",
  "version": "0.1.0",
  "private": true,
  "type": "module"
}
```

- [ ] **Step 3: Create `experience.yaml`**

```yaml
name: deep-research
description: Multi-vendor deep research — Claude Code does academic/general search, Gemini does current-events/news search, both feed a synthesis agent that produces a cited cross-referenced summary.
version: 0.1.0

state:
  schema:
    question: { type: string }
    clarified_question: { type: string }
    research_plan: { type: object }
    claude_subqs: { type: array, items: { type: object } }
    gemini_subqs: { type: array, items: { type: object } }
    raw_findings: { type: array, items: { type: object }, merge: array_append }
    citations: { type: array, items: { type: string } }
    cross_referenced: { type: object }

phases:
  - { id: scoping }
  - { id: search }
  - { id: synthesis }

graph:
  nodes:
    - id: load_question
      kind: tool
      phase: scoping
      impl: ./tools/load_question.mjs
      writes: [question]

    - id: clarify
      kind: agent
      phase: scoping
      prompt: ./prompts/clarify.md
      reads: [question]
      schema:
        type: object
        required: [clarified_question]
        properties:
          clarified_question: { type: string }
          assumptions: { type: array, items: { type: string } }
      writes: [clarified_question]

    - id: decompose
      kind: agent
      phase: scoping
      prompt: ./prompts/decompose.md
      reads: [clarified_question]
      schema:
        type: object
        required: [research_plan, claude_subqs, gemini_subqs]
        properties:
          research_plan:
            type: object
            properties:
              rationale: { type: string }
              parallelism_strategy: { type: string }
          claude_subqs:
            type: array
            items:
              type: object
              required: [id, text]
              properties:
                id: { type: string }
                text: { type: string }
                rationale: { type: string }
          gemini_subqs:
            type: array
            items:
              type: object
              required: [id, text]
              properties:
                id: { type: string }
                text: { type: string }
                rationale: { type: string }
      writes: [research_plan, claude_subqs, gemini_subqs]

    - id: search_claude
      kind: cli-agent
      provider: claude-code
      phase: search
      prompt: |
        You are researching sub-question "{{$item.id}}" using the WebSearch tool. Be thorough — at least 3 high-quality sources.

        Sub-question: {{$item.text}}
        Rationale: {{$item.rationale}}

        For each finding, capture the exact source URL. Return JSON matching this schema:

        {"findings": [{"sub_question_id": "{{$item.id}}", "claim": "...", "evidence": "...", "url": "..."}]}

        Do not include findings without a URL.
      for_each: { source: $.claude_subqs, concurrency: 2 }
      reads: [claude_subqs]
      output_format: json
      schema:
        type: object
        required: [findings]
        properties:
          findings:
            type: array
            items:
              type: object
              required: [sub_question_id, claim, evidence, url]
              properties:
                sub_question_id: { type: string }
                claim: { type: string }
                evidence: { type: string }
                url: { type: string }
      writes: [raw_findings]
      timeout_ms: 300000

    - id: search_gemini
      kind: cli-agent
      provider: gemini
      phase: search
      prompt: |
        Use Google Search to research this sub-question. Prioritize recent (last 12 months) and authoritative sources.

        Sub-question: {{$item.text}}
        Rationale: {{$item.rationale}}

        Return JSON: {"findings": [{"sub_question_id": "{{$item.id}}", "claim": "...", "evidence": "...", "url": "..."}]}

        Every finding must have a URL.
      for_each: { source: $.gemini_subqs, concurrency: 2 }
      reads: [gemini_subqs]
      output_format: json
      schema:
        type: object
        required: [findings]
        properties:
          findings:
            type: array
            items:
              type: object
              required: [sub_question_id, claim, evidence, url]
              properties:
                sub_question_id: { type: string }
                claim: { type: string }
                evidence: { type: string }
                url: { type: string }
      writes: [raw_findings]
      timeout_ms: 300000

    - id: extract_citations
      kind: tool
      phase: synthesis
      impl: ./tools/extract_citations.mjs
      reads: [raw_findings]
      writes: [citations]

    - id: cross_reference
      kind: agent
      phase: synthesis
      prompt: ./prompts/cross_reference.md
      reads: [clarified_question, raw_findings, citations]
      schema:
        type: object
        required: [cross_referenced]
        properties:
          cross_referenced:
            type: object
            required: [executive_summary, key_findings, open_questions]
            properties:
              executive_summary: { type: string }
              key_findings:
                type: array
                items:
                  type: object
                  required: [claim, supporting_urls]
                  properties:
                    claim: { type: string }
                    supporting_urls: { type: array, items: { type: string } }
                    conflicts: { type: string }
              open_questions: { type: array, items: { type: string } }
      writes: [cross_referenced]

  edges:
    - { from: load_question, to: clarify }
    - { from: clarify, to: decompose }
    - { from: decompose, to: search_claude }
    - { from: decompose, to: search_gemini }
    - { from: search_claude, to: extract_citations }
    - { from: search_gemini, to: extract_citations }
    - { from: extract_citations, to: cross_reference }
```

- [ ] **Step 4: Validate**

```bash
mkdir -p examples/deep-research/{tools,prompts,fixtures}
node packages/cli/dist/bin.js validate examples/deep-research 2>&1 | tail -5
```

Expected: VALIDATION FAILS because the referenced `tools/load_question.mjs`, `tools/extract_citations.mjs`, `prompts/*.md` don't exist yet. That's the TDD red state for the structural validator. We don't commit yet — the next tasks fill in the missing pieces.

If validate passes immediately (because the validator may not check tool/prompt file existence), proceed anyway.

- [ ] **Step 5: Commit the YAML + fixture + package.json**

```bash
git add examples/deep-research/experience.yaml examples/deep-research/package.json examples/deep-research/fixtures/question.json
git commit -m "demo(deep-research): yaml + question fixture + package shell"
```

---

## Task 2: `deep-research` — tools + prompts

**Files:**

- Create: `examples/deep-research/tools/load_question.mjs`
- Create: `examples/deep-research/tools/extract_citations.mjs`
- Create: `examples/deep-research/prompts/clarify.md`
- Create: `examples/deep-research/prompts/decompose.md`
- Create: `examples/deep-research/prompts/cross_reference.md`

- [ ] **Step 1: Create `tools/load_question.mjs`**

```js
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

export default async function loadQuestion() {
  const path = resolve(HERE, '..', 'fixtures', 'question.json')
  const data = JSON.parse(readFileSync(path, 'utf8'))
  return { state_delta: { question: data.question } }
}
```

- [ ] **Step 2: Create `tools/extract_citations.mjs`**

```js
// Post-process raw_findings (an array of {claim, evidence, url}) into a
// deduplicated, ordered list of unique URLs. Called between the search
// phase and the cross-reference agent.

export default async function extractCitations(input) {
  const raw = input._state?.raw_findings ?? []
  const seen = new Set()
  const citations = []
  for (const f of raw) {
    const url = f?.url
    if (typeof url === 'string' && url.length > 0 && !seen.has(url)) {
      seen.add(url)
      citations.push(url)
    }
  }
  return { state_delta: { citations } }
}
```

- [ ] **Step 3: Create `prompts/clarify.md`**

```markdown
You are a research lead. The user has asked: **{{question}}**

Before any search happens, narrow the question so downstream search is productive. Return via the `structured_output` tool:

- `clarified_question`: the user's question, edited to be specific, scoped, and unambiguous. Use the user's words where possible; add only the minimum constraints required (time horizon, domain, level of depth).
- `assumptions` (optional, ≤5 items): assumptions you made that the user should confirm if your interpretation differs from intent.

Keep the clarification one sentence. Do NOT add prose outside the schema fields.
```

- [ ] **Step 4: Create `prompts/decompose.md`**

```markdown
You are a research planner. Decompose the question below into sub-questions, then route each one to the appropriate search vendor.

Question: **{{clarified_question}}**

Two search vendors are available:

- **Claude Code (WebSearch)** — best for academic / technical / general-knowledge questions where you want considered, well-cited sources. Use for: definitions, methodologies, established trade-offs, library/framework comparisons, well-documented technologies.
- **Gemini (Google Search grounding)** — best for current-events / recent / news / market-data questions where freshness matters more than depth. Use for: anything that changed in the last 12 months, vendor news, prices, deprecations.

Produce a plan via `structured_output`:

- `research_plan`:
  - `rationale`: one-sentence explanation of how you split the question.
  - `parallelism_strategy`: one-sentence reason for sending some sub-questions to each vendor.
- `claude_subqs`: array of 2–4 sub-questions for Claude Code. Each has `{id: "c1"|"c2"|..., text: "...", rationale: "..."}`.
- `gemini_subqs`: array of 1–3 sub-questions for Gemini. Each has `{id: "g1"|"g2"|..., text: "...", rationale: "..."}`.

Sub-question text must be self-contained — assume the searching agent won't see the parent question. Total sub-questions should be 3–6.

If the question doesn't need both vendors (e.g. pure historical research → no Gemini), one of the arrays may be empty `[]`.
```

- [ ] **Step 5: Create `prompts/cross_reference.md`**

```markdown
You are the synthesis lead. You have raw findings from multiple sources and must produce a cross-referenced summary.

Question: **{{clarified_question}}**

Raw findings (each has a sub_question_id, claim, evidence, and url):

```
{{raw_findings}}
```

All cited URLs:

```
{{citations}}
```

Produce `cross_referenced` via `structured_output`:

- `executive_summary`: 2–4 sentences answering the question directly. No hedging unless the evidence forces it.
- `key_findings`: array of `{claim, supporting_urls[], conflicts?}` covering the major sub-conclusions. Every claim cites at least one URL drawn from the citations list. `conflicts` is a short string if sources disagreed; omit otherwise.
- `open_questions`: array of strings — what the evidence didn't settle, what a follow-up round should investigate.

Rules:

- Every claim must trace to a URL that appears in the citations list.
- If multiple findings claim the same thing, group them.
- If two findings disagree, surface that as a `conflicts` note rather than silently picking one.
- Do not invent URLs.
```

In the saved file, the triple-backtick fences around `{{raw_findings}}` and `{{citations}}` must be LITERAL.

- [ ] **Step 6: Re-validate**

```bash
node packages/cli/dist/bin.js validate examples/deep-research 2>&1 | tail -3
```

Expected: exit 0, "experience valid".

- [ ] **Step 7: Commit**

```bash
git add examples/deep-research/tools/ examples/deep-research/prompts/
git commit -m "demo(deep-research): clarify/decompose/cross_reference prompts + 2 tools"
```

---

## Task 3: `deep-research` — README

**Files:**

- Create: `examples/deep-research/README.md`

- [ ] **Step 1: Write the README**

```markdown
# deep-research

**A real deep-research pipeline. Not a toy.**

```
load_question → clarify → decompose ┬─ search_claude (for_each)
                                    └─ search_gemini (for_each)
                                            │
                                            ▼
                                    extract_citations
                                            │
                                            ▼
                                    cross_reference
```

Multi-vendor: **Claude Code's WebSearch** for academic / general / technical sub-questions, **Gemini's Google Search grounding** for current-events / recent sub-questions. Both feed a synthesis agent that produces a cited cross-referenced summary.

## What you get out

After a run, your blackboard contains:

- `clarified_question` — the narrowed question that drove the search
- `claude_subqs[]`, `gemini_subqs[]` — how the planner split the work
- `raw_findings[]` — every claim + evidence + URL collected
- `citations[]` — deduplicated list of every URL referenced
- `cross_referenced` — executive summary, key findings, open questions

Inspect with `oe state cross_referenced` after the run. Resume later with `oe resume <run-id>` — the search calls are cached, so re-running only re-syntheses.

## Prereqs

- `claude` CLI (Claude Code) on PATH and authenticated. WebSearch tool enabled (it is by default).
- `gemini` CLI on PATH and authenticated. Google Search grounding enabled (it is by default).
- `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` set for the `agent` nodes (clarify/decompose/cross_reference).

If you only have one of the two CLIs, the planner can be steered toward that vendor by setting `claude_subqs: []` or `gemini_subqs: []` — but the demo is most interesting with both.

## Run

```bash
# Edit fixtures/question.json to your question, then:
node packages/cli/dist/bin.js run examples/deep-research --tui --concurrency 4
```

Expect ~3–8 minutes wall time depending on how many sub-questions the planner emits and how rate-limited the CLIs are. With `--concurrency 4`, the `search_claude` and `search_gemini` fan-outs run their iterations in parallel up to 2-wide each (per node-level `for_each.concurrency: 2`), and the two search nodes themselves run as siblings.

## Inspect the result

```bash
# Pretty-print the final synthesis
node packages/cli/dist/bin.js state cross_referenced

# Or replay the full event log (sorted by ts; parallel-safe)
node packages/cli/dist/bin.js inspect <run-id>
```

## Evolve

After a run, `oe evolve <run-id>` will read the events + state diff and propose graph upgrades. Typical proposals:

- Add a third vendor (e.g. `search_codex` for code-heavy questions)
- Add an academic-paper specialist (`cli-agent` with a Semantic Scholar MCP server)
- Add a fact-check verifier between `search_*` and `cross_reference`

Author → run → evolve is the loop.

## Mocked e2e

`e2e/deep-research.e2e.test.ts` exercises the full graph with a scripted LLM + scripted subprocess runner — no real CLI required to verify the structure.

## Customizing the planner

The decomposition heuristics are in `prompts/decompose.md`. Edit the "Two search vendors are available" section to:

- Bias toward one vendor (e.g. always Claude for confidentiality)
- Add a third vendor (mirror the `claude_subqs` / `gemini_subqs` shape with `codex_subqs` etc. and add a third `search_*` node)
- Change the parallelism — `for_each.concurrency: N` controls iterations per node; `runtime.concurrency: N` at the top of `experience.yaml` controls how many sibling nodes (the two search_* nodes) run in parallel.
```

In the saved file the ASCII diagram and code blocks should render correctly — LITERAL triple-backticks.

- [ ] **Step 2: Commit**

```bash
git add examples/deep-research/README.md
git commit -m "demo(deep-research): README — pipeline diagram, prereqs, run, evolve"
```

---

## Task 4: `deep-research` — mocked e2e

**Files:**

- Create: `e2e/deep-research.e2e.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, cpSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseExperienceYaml } from '@openexpertise/schema'
import {
  DispatcherRegistry,
  EventBus,
  runExperience,
  type LLMClient,
  type LLMCompleteOpts,
} from '@openexpertise/core'
import { ToolDispatcher } from '@openexpertise/node-kinds-tool'
import { AgentDispatcher } from '@openexpertise/node-kinds-agent'
import {
  CliAgentDispatcher,
  type SubprocessRunner,
  type SpawnSpec,
  type RunResult,
} from '@openexpertise/node-kinds-cli-agent'

const HERE = dirname(fileURLToPath(import.meta.url))

class ScriptedLLM implements LLMClient {
  async complete(opts: LLMCompleteOpts) {
    const prompt = opts.messages[0]?.content ?? ''
    if (prompt.includes('research lead')) {
      return {
        text: '',
        tool_calls: [
          {
            name: 'structured_output',
            input: {
              clarified_question:
                'In 2026, when does in-memory caching beat Redis for HTTP API response caching?',
              assumptions: ['Single-process API; not horizontally scaled.'],
            },
          },
        ],
      }
    }
    if (prompt.includes('research planner')) {
      return {
        text: '',
        tool_calls: [
          {
            name: 'structured_output',
            input: {
              research_plan: {
                rationale: 'Split technical trade-offs from current-vendor news.',
                parallelism_strategy: 'Claude for trade-offs, Gemini for recent benchmarks.',
              },
              claude_subqs: [
                { id: 'c1', text: 'Latency trade-offs', rationale: 'Established methodology.' },
              ],
              gemini_subqs: [
                { id: 'g1', text: 'Redis 8 release news', rationale: 'Very recent.' },
              ],
            },
          },
        ],
      }
    }
    if (prompt.includes('synthesis lead')) {
      return {
        text: '',
        tool_calls: [
          {
            name: 'structured_output',
            input: {
              cross_referenced: {
                executive_summary:
                  'In-memory caching beats Redis below a single-host cap; switch once you scale horizontally.',
                key_findings: [
                  {
                    claim: 'Single-host in-memory latency is sub-µs vs ~100µs for local Redis.',
                    supporting_urls: ['https://example.com/c1'],
                  },
                  {
                    claim: 'Redis 8 ships with improved replication latency.',
                    supporting_urls: ['https://example.com/g1'],
                  },
                ],
                open_questions: ['How does TLS overhead change the Redis baseline in 2026?'],
              },
            },
          },
        ],
      }
    }
    return { text: 'unknown prompt' }
  }
}

class ScriptedRunner implements SubprocessRunner {
  async run(spec: SpawnSpec, _opts: { timeoutMs: number; cwd: string }): Promise<RunResult> {
    // Distinguish claude vs gemini by command name.
    if (spec.cmd === 'claude') {
      return {
        stdout: JSON.stringify({
          findings: [
            {
              sub_question_id: 'c1',
              claim: 'Single-host in-memory beats Redis by ~100x at low scale.',
              evidence: 'Microbenchmark from a 2024 article.',
              url: 'https://example.com/c1',
            },
          ],
        }),
        stderr: '',
        exitCode: 0,
        timedOut: false,
      }
    }
    if (spec.cmd === 'gemini') {
      return {
        stdout: JSON.stringify({
          findings: [
            {
              sub_question_id: 'g1',
              claim: 'Redis 8.0 launched 2026-02 with improved replication.',
              evidence: 'Redis Labs press release.',
              url: 'https://example.com/g1',
            },
          ],
        }),
        stderr: '',
        exitCode: 0,
        timedOut: false,
      }
    }
    return { stdout: '', stderr: 'unknown cmd', exitCode: 1, timedOut: false }
  }
}

let dir: string
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

describe('deep-research end-to-end (mocked)', () => {
  it('runs the full pipeline and produces a cross-referenced summary', async () => {
    dir = mkdtempSync(join(tmpdir(), 'oe-e2e-deep-'))
    const src = join(HERE, '..', 'examples', 'deep-research')
    cpSync(src, dir, { recursive: true })

    const spec = parseExperienceYaml(readFileSync(join(dir, 'experience.yaml'), 'utf8'))
    const llm = new ScriptedLLM()
    const runner = new ScriptedRunner()
    const dispatchers = new DispatcherRegistry()
    dispatchers.register(new ToolDispatcher())
    dispatchers.register(new AgentDispatcher({ client: llm }))
    dispatchers.register(new CliAgentDispatcher({ runner }))

    const result = await runExperience({
      spec,
      experienceDir: dir,
      dispatchers,
      events: new EventBus(),
      args: {},
    })

    expect(result.status).toBe('success')
    expect(typeof result.finalState.clarified_question).toBe('string')
    expect((result.finalState.claude_subqs as unknown[])?.length).toBe(1)
    expect((result.finalState.gemini_subqs as unknown[])?.length).toBe(1)
    // 1 finding per for_each iteration × 2 iterations = 2 raw_findings
    expect((result.finalState.raw_findings as unknown[]).length).toBe(2)
    // Two unique URLs
    expect((result.finalState.citations as string[]).sort()).toEqual([
      'https://example.com/c1',
      'https://example.com/g1',
    ])
    // Cross-reference produced an executive_summary + key_findings
    const cr = result.finalState.cross_referenced as {
      executive_summary: string
      key_findings: unknown[]
      open_questions: string[]
    }
    expect(cr.executive_summary.length).toBeGreaterThan(0)
    expect(cr.key_findings.length).toBeGreaterThan(0)
    expect(cr.open_questions.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run the e2e**

```bash
pnpm exec vitest run e2e/deep-research.e2e.test.ts 2>&1 | tail -15
```

Expected: 1 test passes.

- [ ] **Step 3: Run full suite — no regressions**

```bash
pnpm test 2>&1 | tail -5
```

Expected: 225 baseline + 1 = **226 passing**.

- [ ] **Step 4: Commit**

```bash
git add e2e/deep-research.e2e.test.ts
git commit -m "test(e2e): deep-research full pipeline with scripted LLM + runner"
```

---

## Task 5: `systematic-debugging` — buggy_repo fixture

**Files:**

- Create: `examples/systematic-debugging/fixtures/buggy_repo/package.json`
- Create: `examples/systematic-debugging/fixtures/buggy_repo/index.mjs`
- Create: `examples/systematic-debugging/fixtures/buggy_repo/test.mjs`

A tiny Node module with a deliberate off-by-one bug. Running `node --test test.mjs` fails. Real debuggers (Claude Code via cli-agent) can fix it.

- [ ] **Step 1: Create `fixtures/buggy_repo/package.json`**

```json
{
  "name": "buggy-repo-fixture",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test test.mjs"
  }
}
```

- [ ] **Step 2: Create `fixtures/buggy_repo/index.mjs`**

```js
// validateUserId — checks that a user id falls in the range [1, MAX_USER_ID].
// BUG: the comparison is off-by-one. id === MAX_USER_ID is rejected even
// though MAX_USER_ID is supposed to be inclusive. A real debugger would
// find this by reading the function, noticing the < vs <= mismatch, or by
// running the failing test and looking at the assertion.
export const MAX_USER_ID = 1000

export function validateUserId(id) {
  if (typeof id !== 'number' || !Number.isInteger(id)) {
    return { valid: false, reason: 'not_an_integer' }
  }
  if (id < 1) {
    return { valid: false, reason: 'too_small' }
  }
  if (id < MAX_USER_ID) {
    // BUG: should be `id > MAX_USER_ID` returns invalid; this rejects MAX itself.
    return { valid: false, reason: 'too_large' }
  }
  return { valid: true }
}
```

- [ ] **Step 3: Create `fixtures/buggy_repo/test.mjs`**

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateUserId, MAX_USER_ID } from './index.mjs'

test('rejects non-integer', () => {
  assert.deepEqual(validateUserId('abc'), { valid: false, reason: 'not_an_integer' })
})

test('rejects id < 1', () => {
  assert.deepEqual(validateUserId(0), { valid: false, reason: 'too_small' })
})

test('accepts id in [1, MAX_USER_ID]', () => {
  assert.deepEqual(validateUserId(1), { valid: true })
  assert.deepEqual(validateUserId(500), { valid: true })
  // This is the assertion that fails today — MAX_USER_ID itself should be valid.
  assert.deepEqual(validateUserId(MAX_USER_ID), { valid: true })
})

test('rejects id > MAX_USER_ID', () => {
  assert.deepEqual(validateUserId(MAX_USER_ID + 1), { valid: false, reason: 'too_large' })
})
```

- [ ] **Step 4: Verify the fixture fails as expected**

```bash
(cd examples/systematic-debugging/fixtures/buggy_repo && node --test test.mjs 2>&1 | tail -20)
```

Expected: 3 passing tests + 1 failing test ("accepts id in [1, MAX_USER_ID]" fails at the `validateUserId(MAX_USER_ID)` assertion). The fixture is intentionally broken — that's the bug the experience teaches the agent to find.

- [ ] **Step 5: Commit**

```bash
git add examples/systematic-debugging/fixtures/
git commit -m "demo(systematic-debugging): buggy_repo fixture — off-by-one in validateUserId"
```

---

## Task 6: `systematic-debugging` — tools + experience.yaml

**Files:**

- Create: `examples/systematic-debugging/tools/capture_symptoms.mjs`
- Create: `examples/systematic-debugging/tools/run_tests.mjs`
- Create: `examples/systematic-debugging/experience.yaml`
- Create: `examples/systematic-debugging/package.json`

- [ ] **Step 1: Create `tools/capture_symptoms.mjs`**

```js
// Capture symptoms = run the failing test command in repo_path and harvest
// the actual stderr/stdout for the hypothesize agent.

import { spawnSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

export default async function captureSymptoms(input) {
  const repoArg = input._state?.repo_path ?? input.repo_path
  const cmdArg = input._state?.failing_test_cmd ?? input.failing_test_cmd
  if (typeof repoArg !== 'string' || typeof cmdArg !== 'string') {
    throw new Error(
      'capture_symptoms requires repo_path and failing_test_cmd in state or args',
    )
  }
  // Resolve repo_path relative to the experience directory when it's relative.
  const repoPath = resolve(HERE, '..', repoArg)
  const tokens = cmdArg.split(/\s+/).filter((t) => t.length > 0)
  const [cmd, ...args] = tokens
  if (!cmd) {
    throw new Error('failing_test_cmd is empty')
  }
  const result = spawnSync(cmd, args, {
    cwd: repoPath,
    encoding: 'utf8',
    timeout: 60_000,
  })
  return {
    state_delta: {
      symptoms: {
        repo_path: repoPath,
        cmd: cmdArg,
        exit_code: result.status,
        stdout: (result.stdout ?? '').slice(0, 8000),
        stderr: (result.stderr ?? '').slice(0, 8000),
      },
    },
  }
}
```

- [ ] **Step 2: Create `tools/run_tests.mjs`**

```js
// Run the test command again and return a verification status.
// Used after the fix is applied to confirm the failing test now passes.

import { spawnSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

export default async function runTests(input) {
  const repoArg = input._state?.repo_path ?? input.repo_path
  const cmdArg = input._state?.failing_test_cmd ?? input.failing_test_cmd
  if (typeof repoArg !== 'string' || typeof cmdArg !== 'string') {
    throw new Error('run_tests requires repo_path and failing_test_cmd in state or args')
  }
  const repoPath = resolve(HERE, '..', repoArg)
  const tokens = cmdArg.split(/\s+/).filter((t) => t.length > 0)
  const [cmd, ...args] = tokens
  if (!cmd) throw new Error('failing_test_cmd is empty')
  const result = spawnSync(cmd, args, {
    cwd: repoPath,
    encoding: 'utf8',
    timeout: 60_000,
  })
  const passed = result.status === 0
  return {
    state_delta: {
      verification_status: passed ? 'passed' : 'failed',
      verification_output: passed
        ? (result.stdout ?? '').slice(0, 2000)
        : (result.stderr ?? '').slice(0, 4000) || (result.stdout ?? '').slice(0, 4000),
    },
  }
}
```

- [ ] **Step 3: Create `experience.yaml`**

```yaml
name: systematic-debugging
description: Translation of the superpowers systematic-debugging skill into an OpenExpertise flow. Observe symptoms → hypothesize root causes → verify each hypothesis (fan-out) → localize the buggy code → propose a fix via Claude Code → verify the fix passes tests.
version: 0.1.0

state:
  schema:
    repo_path: { type: string }
    failing_test_cmd: { type: string }
    symptoms: { type: object }
    hypotheses: { type: array, items: { type: object } }
    check_results: { type: array, items: { type: object }, merge: array_append }
    diagnosis: { type: object }
    fix_proposal: { type: string }
    verification_status: { type: string }
    verification_output: { type: string }

phases:
  - { id: observe }
  - { id: hypothesize }
  - { id: verify }
  - { id: localize }
  - { id: fix }
  - { id: verify_fix }

graph:
  nodes:
    - id: capture_symptoms
      kind: tool
      phase: observe
      impl: ./tools/capture_symptoms.mjs
      args:
        repo_path: './fixtures/buggy_repo'
        failing_test_cmd: 'node --test test.mjs'
      reads: [repo_path, failing_test_cmd]
      writes: [symptoms, repo_path, failing_test_cmd]

    - id: hypothesize
      kind: agent
      phase: hypothesize
      prompt: ./prompts/hypothesize.md
      reads: [symptoms]
      schema:
        type: object
        required: [hypotheses]
        properties:
          hypotheses:
            type: array
            items:
              type: object
              required: [id, text, confidence, predicted_check]
              properties:
                id: { type: string }
                text: { type: string }
                confidence: { type: string, enum: [high, medium, low] }
                predicted_check: { type: string }
      writes: [hypotheses]

    - id: verify_hypothesis
      kind: cli-agent
      provider: claude-code
      phase: verify
      prompt: |
        You are verifying a hypothesis about a failing test.

        Repo path: {{symptoms.repo_path}}
        Hypothesis ({{$item.id}}): {{$item.text}}
        Predicted check: {{$item.predicted_check}}

        Read the relevant files in the repo, examine the failing output, and judge whether the hypothesis is supported by the evidence. Return JSON:

        {"check_results": [{"hypothesis_id": "{{$item.id}}", "evidence": "<what you found>", "verdict": "supported" | "refuted" | "inconclusive"}]}

        Output exactly one element in `check_results`. The hypothesis_id MUST match the input.
      for_each: { source: $.hypotheses, concurrency: 2 }
      reads: [symptoms, hypotheses]
      output_format: json
      schema:
        type: object
        required: [check_results]
        properties:
          check_results:
            type: array
            items:
              type: object
              required: [hypothesis_id, evidence, verdict]
              properties:
                hypothesis_id: { type: string }
                evidence: { type: string }
                verdict: { type: string, enum: [supported, refuted, inconclusive] }
      writes: [check_results]
      timeout_ms: 240000

    - id: localize
      kind: agent
      phase: localize
      prompt: ./prompts/localize.md
      reads: [symptoms, hypotheses, check_results]
      schema:
        type: object
        required: [diagnosis]
        properties:
          diagnosis:
            type: object
            required: [root_cause, location]
            properties:
              root_cause: { type: string }
              location: { type: string }
              supported_hypothesis_id: { type: string }
      writes: [diagnosis]

    - id: propose_fix
      kind: cli-agent
      provider: claude-code
      phase: fix
      prompt: |
        A failing test has been diagnosed:

        Root cause: {{diagnosis.root_cause}}
        Location: {{diagnosis.location}}
        Repo: {{symptoms.repo_path}}

        Read the file at the location, make the minimum edit that fixes the bug, and SAVE THE FILE. Then return a short markdown summary of the changes you made.

        Do not run tests yourself — a downstream node will verify.
      reads: [symptoms, diagnosis]
      output_format: text
      writes: [fix_proposal]
      timeout_ms: 300000

    - id: verify_fix
      kind: tool
      phase: verify_fix
      impl: ./tools/run_tests.mjs
      reads: [repo_path, failing_test_cmd]
      writes: [verification_status, verification_output]

  edges:
    - { from: capture_symptoms, to: hypothesize }
    - { from: hypothesize, to: verify_hypothesis }
    - { from: verify_hypothesis, to: localize }
    - { from: localize, to: propose_fix }
    - { from: propose_fix, to: verify_fix }
```

- [ ] **Step 4: Create `package.json`**

```json
{
  "name": "@openexpertise/example-systematic-debugging",
  "version": "0.1.0",
  "private": true,
  "type": "module"
}
```

- [ ] **Step 5: Validate**

```bash
node packages/cli/dist/bin.js validate examples/systematic-debugging 2>&1 | tail -5
```

Expected: VALIDATION FAILS or succeeds — depends on whether the validator checks tool/prompt file existence. The hypothesize and localize prompt files don't exist yet; if validator only checks structure, it passes. Either way, Task 7 fixes any remaining gap.

- [ ] **Step 6: Commit**

```bash
git add examples/systematic-debugging/tools/ examples/systematic-debugging/experience.yaml examples/systematic-debugging/package.json
git commit -m "demo(systematic-debugging): yaml + capture_symptoms/run_tests tools + package shell"
```

---

## Task 7: `systematic-debugging` — prompts + README

**Files:**

- Create: `examples/systematic-debugging/prompts/hypothesize.md`
- Create: `examples/systematic-debugging/prompts/localize.md`
- Create: `examples/systematic-debugging/README.md`

- [ ] **Step 1: Create `prompts/hypothesize.md`**

```markdown
You are a debugger. A test has failed. Based on the symptoms below, produce 2–4 hypotheses about the root cause, ranked by your confidence.

Symptoms:

```
{{symptoms}}
```

For each hypothesis, return via `structured_output`:

- `id`: short slug, e.g. `h1`, `h2`.
- `text`: one-sentence hypothesis about WHAT in the code is wrong.
- `confidence`: `high` / `medium` / `low`.
- `predicted_check`: one-sentence description of what file or piece of evidence would confirm or refute this. Be specific: "look at line N of file X" or "run `grep PATTERN` on …" or "check whether the test asserts on the boundary case."

Rules:

- Hypotheses should be MUTUALLY EXCLUSIVE where possible — don't list 4 variants of the same idea.
- Start with the most likely (most specific evidence-matching) hypothesis.
- Include at least one "long-shot" low-confidence hypothesis if you can think of a plausible one — it lets the downstream verifier rule out wrong directions.
- Do not propose hypotheses about infrastructure / environment unless the symptoms point that way.
```

- [ ] **Step 2: Create `prompts/localize.md`**

```markdown
You are the diagnosis lead. The hypothesize step produced candidates; the verify step ran a check for each. Now reduce that to a single diagnosis.

Symptoms:

```
{{symptoms}}
```

Hypotheses:

```
{{hypotheses}}
```

Check results (each maps to a hypothesis by id):

```
{{check_results}}
```

Produce `diagnosis` via `structured_output`:

- `root_cause`: one sentence. Be concrete — name the operator, the off-by-one, the missing return, the wrong field. Do not say "the function is buggy."
- `location`: file path + (optionally) line number or function name. Format: `path/to/file.ext:LINE` or `path/to/file.ext (functionName)`.
- `supported_hypothesis_id`: the hypothesis id whose verdict was `supported` and whose evidence pinned this down. If multiple hypotheses are supported, pick the most specific.

If NO hypothesis is supported, return root_cause = "unknown — all hypotheses refuted or inconclusive" and location = "unknown". The downstream fix step will detect this and short-circuit.
```

- [ ] **Step 3: Create `README.md`**

```markdown
# systematic-debugging

**The superpowers `systematic-debugging` skill, as a YAML flow.**

```
capture_symptoms → hypothesize → verify_hypothesis (for_each)
                                       │
                                       ▼
                                  localize → propose_fix → verify_fix
```

When a test fails — at 2am on-call, or in CI, or just locally — this flow walks the failure through the same discipline a senior engineer would: observe, hypothesize, verify each hypothesis with evidence from the codebase, localize the actual buggy line, propose the minimum edit via Claude Code, then re-run the test to confirm the fix.

## Why OE instead of just running the skill in Claude Code

The skill is excellent. What OE adds:

- **Persistent state.** Every hypothesis + every check result + the diagnosis live in SQLite. Walk away mid-investigation; resume tomorrow.
- **Replayable trail.** `oe inspect <run-id>` reconstructs exactly which hypotheses fired, what evidence each found, why localize converged. Postmortem material that writes itself.
- **Evolvable workflow.** After 5 runs, `oe evolve` sees patterns (e.g., "you always hypothesize about the wrong function first") and proposes a smarter `hypothesize.md`. The skill itself doesn't get smarter; this flow does.
- **Fixture-driven for safe practice.** Run it against the bundled `fixtures/buggy_repo` first; then point it at your real codebase.

## Prereqs

- `claude` CLI on PATH and authenticated (used by `verify_hypothesis` and `propose_fix`).
- `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` set (for `hypothesize` and `localize` agents).
- Node 20+ in the workdir being debugged (the bundled fixture's tests run via `node --test`).

## Run on the bundled fixture

The default `args` in `experience.yaml` point at `./fixtures/buggy_repo`, which has a known off-by-one in `validateUserId`. Run it:

```bash
node packages/cli/dist/bin.js run examples/systematic-debugging --tui
```

Expected wall time: ~2–4 minutes. The fix Claude Code lands should change `id < MAX_USER_ID` to `id > MAX_USER_ID` (or equivalent), the verify_fix tool re-runs the tests, and `verification_status` reads `passed`.

After the run:

```bash
node packages/cli/dist/bin.js state diagnosis
node packages/cli/dist/bin.js state fix_proposal
node packages/cli/dist/bin.js state verification_status   # should print 'passed'
```

## Run on your own repo

Override the args in `experience.yaml`:

```yaml
- id: capture_symptoms
  args:
    repo_path: '/absolute/or/relative/path/to/your/repo'
    failing_test_cmd: 'pnpm test --filter @your/pkg'
```

`failing_test_cmd` is run with `cwd: repo_path`. Anything that exits non-zero on failure works — pytest, vitest, cargo test, go test.

⚠ **Important:** the `propose_fix` step calls Claude Code with edit access to your repo. Commit your work first; review the diff after. The flow does NOT auto-commit.

## Mocked e2e

`e2e/systematic-debugging.e2e.test.ts` covers the full graph with a scripted LLM + scripted runner — no real CLI required, no actual file edits in test land.

## Evolve after multiple runs

After ~5 real runs:

```bash
node packages/cli/dist/bin.js evolve <recent-run-id>
```

Typical advisor proposals:

- Add a `prefilter` agent before hypothesize that classifies the failure type (compile / assertion / runtime / timeout) and steers hypothesize accordingly.
- Add a `git_blame` tool node before hypothesize that surfaces the most recent commit touching the failing line — most bugs are recently-introduced.
- Add a `regression_test_writer` cli-agent after `propose_fix` that asks Claude to write a NEW test capturing the bug, before verify_fix runs.

That's the loop: skill → flow → run → advisor → upgraded flow.

## Mapping to the superpowers skill

| superpowers skill phase            | OE node              |
| ---------------------------------- | -------------------- |
| Observe (capture symptoms)         | `capture_symptoms`   |
| Hypothesize (generate candidates)  | `hypothesize`        |
| Verify (test each hypothesis)      | `verify_hypothesis` (fan-out) |
| Localize (single root cause)       | `localize`           |
| Fix (minimum edit)                 | `propose_fix`        |
| Verify the fix doesn't break tests | `verify_fix`         |

Same discipline; durable, replayable, evolvable.
```

In the saved file, ASCII diagram + code blocks use LITERAL triple-backticks.

- [ ] **Step 4: Re-validate**

```bash
node packages/cli/dist/bin.js validate examples/systematic-debugging 2>&1 | tail -3
```

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add examples/systematic-debugging/prompts/ examples/systematic-debugging/README.md
git commit -m "demo(systematic-debugging): hypothesize/localize prompts + README with skill mapping"
```

---

## Task 8: `systematic-debugging` — mocked e2e

**Files:**

- Create: `e2e/systematic-debugging.e2e.test.ts`

This test mocks the cli-agent calls (verify_hypothesis, propose_fix) so we don't actually edit the fixture during the test run. The `verify_fix` tool runs for real — it's a tool, not an agent — and we expect it to FAIL since we haven't actually fixed the bug. The test asserts that verification_status reads `'failed'`, which is the honest outcome of a mocked fix that didn't actually edit anything.

A separate test variant could mock the verify_fix tool too, but keeping this real exercises one more tool path.

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, cpSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseExperienceYaml } from '@openexpertise/schema'
import {
  DispatcherRegistry,
  EventBus,
  runExperience,
  type LLMClient,
  type LLMCompleteOpts,
} from '@openexpertise/core'
import { ToolDispatcher } from '@openexpertise/node-kinds-tool'
import { AgentDispatcher } from '@openexpertise/node-kinds-agent'
import {
  CliAgentDispatcher,
  type SubprocessRunner,
  type SpawnSpec,
  type RunResult,
} from '@openexpertise/node-kinds-cli-agent'

const HERE = dirname(fileURLToPath(import.meta.url))

class ScriptedLLM implements LLMClient {
  async complete(opts: LLMCompleteOpts) {
    const prompt = opts.messages[0]?.content ?? ''
    if (prompt.includes('You are a debugger')) {
      return {
        text: '',
        tool_calls: [
          {
            name: 'structured_output',
            input: {
              hypotheses: [
                {
                  id: 'h1',
                  text: 'Off-by-one in the upper bound check of validateUserId.',
                  confidence: 'high',
                  predicted_check: 'Read index.mjs:11 — check operator on MAX_USER_ID comparison.',
                },
                {
                  id: 'h2',
                  text: 'MAX_USER_ID is exported as the wrong constant value.',
                  confidence: 'low',
                  predicted_check: 'Read index.mjs:5 — confirm MAX_USER_ID is 1000.',
                },
              ],
            },
          },
        ],
      }
    }
    if (prompt.includes('diagnosis lead')) {
      return {
        text: '',
        tool_calls: [
          {
            name: 'structured_output',
            input: {
              diagnosis: {
                root_cause:
                  "validateUserId uses `id < MAX_USER_ID` where `id > MAX_USER_ID` was intended, rejecting the boundary value.",
                location: 'fixtures/buggy_repo/index.mjs:11',
                supported_hypothesis_id: 'h1',
              },
            },
          },
        ],
      }
    }
    return { text: 'unknown prompt' }
  }
}

class ScriptedRunner implements SubprocessRunner {
  public calls: Array<{ spec: SpawnSpec; cwd: string }> = []
  async run(spec: SpawnSpec, opts: { timeoutMs: number; cwd: string }): Promise<RunResult> {
    this.calls.push({ spec, cwd: opts.cwd })
    // claude-code: route by node id via prompt content.
    const prompt = spec.args.find((a) => typeof a === 'string' && a.length > 20) ?? ''
    if (prompt.includes('verifying a hypothesis')) {
      // Verify_hypothesis is called per-hypothesis; the prompt embeds the id.
      const idMatch = /Hypothesis \((h\d+)\)/.exec(prompt)
      const hypothesis_id = idMatch?.[1] ?? 'h1'
      const verdict = hypothesis_id === 'h1' ? 'supported' : 'refuted'
      return {
        stdout: JSON.stringify({
          check_results: [
            {
              hypothesis_id,
              evidence:
                hypothesis_id === 'h1'
                  ? 'index.mjs:11 uses < instead of >; boundary is rejected.'
                  : 'MAX_USER_ID is 1000 as expected.',
              verdict,
            },
          ],
        }),
        stderr: '',
        exitCode: 0,
        timedOut: false,
      }
    }
    if (prompt.includes('propose a fix') || prompt.includes('failing test has been diagnosed')) {
      // We mock fix-proposal but do NOT actually edit the fixture file.
      // verify_fix will run for real and report 'failed' since the bug remains.
      return {
        stdout:
          'Changed `id < MAX_USER_ID` to `id > MAX_USER_ID` on line 11 of index.mjs. (mocked — fixture file unchanged in test mode)',
        stderr: '',
        exitCode: 0,
        timedOut: false,
      }
    }
    return { stdout: '', stderr: 'unknown', exitCode: 1, timedOut: false }
  }
}

let dir: string
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

describe('systematic-debugging end-to-end (mocked LLM + cli-agent)', () => {
  it('runs all phases; verify_fix correctly reports failure since the mock did not edit the fixture', async () => {
    dir = mkdtempSync(join(tmpdir(), 'oe-e2e-sysdbg-'))
    const src = join(HERE, '..', 'examples', 'systematic-debugging')
    cpSync(src, dir, { recursive: true })

    const spec = parseExperienceYaml(readFileSync(join(dir, 'experience.yaml'), 'utf8'))
    const llm = new ScriptedLLM()
    const runner = new ScriptedRunner()
    const dispatchers = new DispatcherRegistry()
    dispatchers.register(new ToolDispatcher())
    dispatchers.register(new AgentDispatcher({ client: llm }))
    dispatchers.register(new CliAgentDispatcher({ runner }))

    const result = await runExperience({
      spec,
      experienceDir: dir,
      dispatchers,
      events: new EventBus(),
      args: {},
    })

    expect(result.status).toBe('success')
    // Symptoms captured (real spawnSync ran against the fixture; exit code != 0)
    const symptoms = result.finalState.symptoms as { exit_code: number; stderr: string }
    expect(typeof symptoms).toBe('object')
    expect(symptoms.exit_code).not.toBe(0)
    // 2 hypotheses generated
    expect((result.finalState.hypotheses as unknown[]).length).toBe(2)
    // 2 check_results from the for_each fan-out
    expect((result.finalState.check_results as unknown[]).length).toBe(2)
    // Diagnosis is the off-by-one one
    const diag = result.finalState.diagnosis as { root_cause: string; supported_hypothesis_id: string }
    expect(diag.supported_hypothesis_id).toBe('h1')
    expect(diag.root_cause).toMatch(/off-by-one|MAX_USER_ID|boundary/i)
    // fix_proposal contains some text (the mocked summary)
    expect(typeof result.finalState.fix_proposal).toBe('string')
    expect((result.finalState.fix_proposal as string).length).toBeGreaterThan(0)
    // verify_fix ran for real, found the bug still there, reported 'failed'
    expect(result.finalState.verification_status).toBe('failed')
  })
})
```

- [ ] **Step 2: Run the e2e**

```bash
pnpm exec vitest run e2e/systematic-debugging.e2e.test.ts 2>&1 | tail -20
```

Expected: 1 test passes.

- [ ] **Step 3: Full suite — no regressions**

```bash
pnpm test 2>&1 | tail -5
```

Expected: 226 (post-Task-4) + 1 = **227 passing**.

- [ ] **Step 4: Commit**

```bash
git add e2e/systematic-debugging.e2e.test.ts
git commit -m "test(e2e): systematic-debugging full pipeline with scripted LLM + runner"
```

---

## Task 9: README + progress log + final verify

**Files:**

- Modify: `README.md`
- Modify: `docs/superpowers/overnight-progress.md`

- [ ] **Step 1: Update README "Built-in examples" table**

Read the README. Find the `## Built-in examples` table (currently 9 rows). Add two new rows at the END of the table (before the closing line below the table):

```markdown
| [`deep-research`](examples/deep-research/)                   | Multi-vendor research: Claude Code WebSearch + Gemini Google Search → cited synthesis. | `tool` + `agent` + `cli-agent` ×2 |
| [`systematic-debugging`](examples/systematic-debugging/)     | The superpowers `systematic-debugging` skill as a YAML flow. Hypothesize → verify → fix via Claude Code → re-test. | `tool` ×2 + `agent` + `cli-agent` |
```

(The pipe alignment doesn't need to be exact — pnpm format will normalize on the final pass.)

Also update the test-count badge near the top of the README from `tests-225%20passing` to `tests-227%20passing` if you can find it. If unsure, leave it — the auto-format pass will keep it.

- [ ] **Step 2: Append progress log entry**

Append to `docs/superpowers/overnight-progress.md`:

```markdown

---

## Plan F — Real-world examples (2026-05-26)

Branch: `feat/real-world-examples` (off `main`)
Plan: `docs/superpowers/plans/2026-05-26-real-world-examples.md`

### What shipped

Two flagship examples that demonstrate OE running real cognitive work, not toy DAGs:

| Example | Highlights |
|---|---|
| `deep-research` | 7-node pipeline: clarify → decompose → parallel search (Claude Code WebSearch + Gemini Google Search) → extract_citations → cross_reference. Multi-vendor + `for_each.concurrency: 2` for parallel iterations. The only OSS workflow tool that orchestrates rival LLM CLIs' search builtins in one DAG. |
| `systematic-debugging` | 6-node pipeline mapping the superpowers `systematic-debugging` skill into YAML. `capture_symptoms` (tool) → `hypothesize` (agent) → `verify_hypothesis` (cli-agent for_each) → `localize` (agent) → `propose_fix` (cli-agent, edits files) → `verify_fix` (tool re-runs the failing test). Ships with a self-contained buggy_repo fixture (off-by-one in validateUserId) that's debuggable end-to-end. |

### Tests

| File | Coverage |
|---|---|
| `e2e/deep-research.e2e.test.ts` | Scripted LLM + scripted cli-agent runner — full pipeline produces clarified_question + 2 raw_findings + 2 citations + cross_referenced summary. |
| `e2e/systematic-debugging.e2e.test.ts` | Scripted LLM + scripted cli-agent runner; verify_fix runs for real against the fixture and correctly reports `failed` (the mock didn't actually edit). |

Test count: 225 baseline → 227 passing (+2 e2e).

### Positioning

These two examples complete the "real cognitive workflows" story:

- The other 9 examples teach a specific OE primitive (for_each, when:, cli-agent, etc.).
- These two are END-USER pitches: "I have a research question / a failing test — what does OE do for me?"

`deep-research` is the multi-vendor headline beyond `tri-cli-orchestration` — same three-CLI palette but doing actual research with shared state and citations. `systematic-debugging` is the bridge between the superpowers ecosystem and OE: anyone using superpowers sees how OE adds persistence + replay + evolution on top.

### Next concrete actions

1. Merge `feat/real-world-examples` into `main`.
2. Optional manual smoke against real CLIs:
   - `node packages/cli/dist/bin.js run examples/deep-research --tui --concurrency 4` with a real question
   - `node packages/cli/dist/bin.js run examples/systematic-debugging --tui` against the bundled buggy_repo
3. After merge: project has **11 examples**, ready for the v0.1.0 launch.
```

- [ ] **Step 3: Final verification**

```bash
pnpm clean && pnpm install && pnpm -r build 2>&1 | tail -5
pnpm typecheck 2>&1 | tail -3
pnpm lint 2>&1 | tail -3
pnpm format:check 2>&1 | tail -3
pnpm test 2>&1 | tail -5
```

Expected: clean across all. **227 tests passing**.

If `pnpm format:check` complains, run `pnpm format` and commit as `style: prettier formatting for real-world examples`.

- [ ] **Step 4: Commit + log**

```bash
git add README.md docs/superpowers/overnight-progress.md
git commit -m "docs: README two new examples + Plan F progress entry"

# If format fixes applied (separate commit):
# git add <touched files>
# git commit -m "style: prettier formatting for real-world examples"

git log --oneline main..HEAD | head -15
```
