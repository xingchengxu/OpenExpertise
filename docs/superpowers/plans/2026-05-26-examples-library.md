# Plan C — Examples Library Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship three enterprise-grade example experiences — `oncall-runbook` (fan-out demo), `issue-triage` (conditional-edge demo), `release-gates` (cli-agent integration demo) — each with fixtures, stubs, README, and a mocked-LLM e2e test that proves the graph runs end-to-end.

**Architecture:** Three self-contained `examples/<name>/` directories. Each has `experience.yaml`, supporting tool `.mjs` files with fixture data baked in, optional `prompts/*.md`, `package.json` (workspace placeholder), `README.md`. Each example pairs with one e2e test in `e2e/<name>.e2e.test.ts` that uses a scripted LLM (and where needed a scripted subprocess runner) so CI does not depend on real APIs or installed CLIs.

**Tech Stack:** Existing only. No new packages, no new external deps.

**Spec:** `docs/superpowers/specs/2026-05-26-ultraexpertise-and-v2-polish-design.md` (Plan C section)

---

## File Structure

For each of the three examples, create:

```
examples/<name>/
├── experience.yaml
├── package.json                # workspace placeholder (private, type: module)
├── README.md
├── tools/                      # tool .mjs files
│   └── *.mjs
├── prompts/                    # prompt .md files (when nodes use file-loaded prompts)
│   └── *.md
└── fixtures/                   # canned data the tools read
    └── *.{json,md,txt}
```

Plus one e2e file per example: `e2e/<name>.e2e.test.ts`.

**Modified:**

- `README.md` (root) — add a one-line bullet under "Quick start — smaller examples" referencing the new templates.
- `docs/superpowers/overnight-progress.md` — append Plan C completion entry.

---

## Task 1: `examples/oncall-runbook/` + e2e (fan-out demo)

**Files (new):**

- `examples/oncall-runbook/experience.yaml`
- `examples/oncall-runbook/package.json`
- `examples/oncall-runbook/README.md`
- `examples/oncall-runbook/tools/fetch_incident.mjs`
- `examples/oncall-runbook/tools/list_dimensions.mjs`
- `examples/oncall-runbook/prompts/investigate.md`
- `examples/oncall-runbook/prompts/prioritize.md`
- `examples/oncall-runbook/prompts/summary.md`
- `examples/oncall-runbook/fixtures/incident.json`
- `e2e/oncall-runbook.e2e.test.ts`

**Story:** An incident fires. The experience fetches it, fans out an investigation across 3 dimensions (observability / blast-radius / similar-past-incidents), prioritizes the findings, and produces an oncall summary.

- [ ] **Step 1: Create `experience.yaml`**

```yaml
name: oncall-runbook
description: When an incident fires — fetch it, investigate across multiple dimensions, prioritize, and produce a one-page summary for the oncall.
version: 0.1.0

state:
  schema:
    incident: { type: object }
    dimensions: { type: array, items: { type: object } }
    findings: { type: array, items: { type: object }, merge: array_append }
    prioritized_findings: { type: array, items: { type: object } }
    summary: { type: string }

phases:
  - { id: triage }
  - { id: synthesis }

graph:
  nodes:
    - id: fetch_incident
      kind: tool
      phase: triage
      impl: ./tools/fetch_incident.mjs
      writes: [incident]
    - id: seed_dimensions
      kind: tool
      phase: triage
      impl: ./tools/list_dimensions.mjs
      writes: [dimensions]
    - id: investigate
      kind: agent
      phase: triage
      prompt: ./prompts/investigate.md
      reads: [incident]
      schema:
        type: object
        required: [findings]
        properties:
          findings:
            type: array
            items:
              type: object
              required: [title, evidence, impact]
              properties:
                title: { type: string }
                evidence: { type: string }
                impact: { type: string }
      for_each: { source: $.dimensions }
      writes: [findings]
    - id: prioritize
      kind: agent
      phase: synthesis
      prompt: ./prompts/prioritize.md
      reads: [findings, incident]
      schema:
        type: object
        required: [prioritized_findings]
        properties:
          prioritized_findings:
            type: array
            items:
              type: object
              required: [title, priority]
              properties:
                title: { type: string }
                priority: { type: string }
      writes: [prioritized_findings]
    - id: summary
      kind: agent
      phase: synthesis
      prompt: ./prompts/summary.md
      reads: [incident, prioritized_findings]
      schema:
        type: object
        required: [summary]
        properties:
          summary: { type: string }
      writes: [summary]
  edges:
    - { from: fetch_incident, to: seed_dimensions }
    - { from: seed_dimensions, to: investigate }
    - { from: investigate, to: prioritize }
    - { from: prioritize, to: summary }
```

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "@openexpertise/example-oncall-runbook",
  "version": "0.1.0",
  "private": true,
  "type": "module"
}
```

- [ ] **Step 3: Create `tools/fetch_incident.mjs`**

```js
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

export default async function fetchIncident() {
  const path = resolve(HERE, '..', 'fixtures', 'incident.json')
  const incident = JSON.parse(readFileSync(path, 'utf8'))
  return { state_delta: { incident } }
}
```

- [ ] **Step 4: Create `tools/list_dimensions.mjs`**

```js
export default async function listDimensions() {
  return {
    state_delta: {
      dimensions: [
        { key: 'observability', focus: 'metrics, logs, traces — what signals fired and when' },
        { key: 'blast-radius', focus: 'which downstream services and customers are affected' },
        { key: 'similar-past-incidents', focus: 'matching prior incidents and their mitigations' },
      ],
    },
  }
}
```

- [ ] **Step 5: Create `prompts/investigate.md`**

```markdown
You are investigating an incident from the **{{$item.key}}** angle.

Focus: {{$item.focus}}

Incident:

```json
{{incident}}
```

Produce 1–3 findings via the `structured_output` tool. Each finding needs:

- `title` (≤80 chars, action-oriented)
- `evidence` (≤200 chars, what signal points at this)
- `impact` (one of `low`, `medium`, `high`)

If you have no in-scope finding, return `{ "findings": [] }`.
```

In the actual file, the triple-backticks around `{{incident}}` must be LITERAL backticks.

- [ ] **Step 6: Create `prompts/prioritize.md`**

```markdown
You are the oncall triage assistant. Rank the findings below by priority for incident response. Higher priority = act on first.

Incident:

```json
{{incident}}
```

Findings:

```json
{{findings}}
```

Return via `structured_output`:

- `prioritized_findings`: array of objects with `title` (mirror from input) and `priority` (`P0` | `P1` | `P2`).
```

- [ ] **Step 7: Create `prompts/summary.md`**

```markdown
Write a one-page oncall summary. Sections:

1. **What happened** — 2 sentences max, in plain language.
2. **Current state** — what's still firing, what's stable.
3. **Top 3 actions** — drawn from the prioritized findings.
4. **Open questions** — what you still don't know.

Incident:

```json
{{incident}}
```

Prioritized findings:

```json
{{prioritized_findings}}
```

Return via `structured_output` with `summary` set to the full markdown summary.
```

- [ ] **Step 8: Create `fixtures/incident.json`**

```json
{
  "id": "INC-2026-05-26-001",
  "title": "API 500 errors spiking on /v2/users",
  "severity": "P2",
  "started_at": "2026-05-26T14:32:00Z",
  "service": "user-api",
  "alert_count": 12,
  "annotations": [
    "PagerDuty alert from Datadog monitor #7421",
    "p99 latency 1240ms → 4880ms over 8 minutes"
  ]
}
```

- [ ] **Step 9: Create `README.md`**

```markdown
# oncall-runbook

When an incident fires, run a structured triage:

1. **Triage phase**
   - `fetch_incident` (tool) — loads the incident metadata.
   - `seed_dimensions` (tool) — sets up 3 investigation angles.
   - `investigate` (agent, fanned out via `for_each` over dimensions) — produces findings per angle.
2. **Synthesis phase**
   - `prioritize` (agent) — ranks findings.
   - `summary` (agent) — writes the oncall-facing one-pager.

Demonstrates: tool → agent fan-out (`for_each`) → sequential agents → structured output throughout.

## Run

```bash
export ANTHROPIC_API_KEY=sk-...   # or OPENAI_API_KEY=...
node packages/cli/dist/bin.js run examples/oncall-runbook --tui
```

Replace `fixtures/incident.json` with a real PagerDuty payload to triage a different incident, or replace `fetch_incident.mjs` with a call to the PagerDuty API.

## Mocked e2e

`e2e/oncall-runbook.e2e.test.ts` exercises the full graph with a scripted LLM — no API key required.
```

- [ ] **Step 10: Validate**

```bash
node packages/cli/dist/bin.js validate examples/oncall-runbook 2>&1 | tail -5
```

Expected: exit 0, "experience valid".

- [ ] **Step 11: Create `e2e/oncall-runbook.e2e.test.ts`**

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

const HERE = dirname(fileURLToPath(import.meta.url))

class ScriptedLLM implements LLMClient {
  async complete(opts: LLMCompleteOpts) {
    const prompt = opts.messages[0]?.content ?? ''
    if (prompt.includes('investigating an incident')) {
      return {
        text: '',
        tool_calls: [
          {
            name: 'structured_output',
            input: {
              findings: [
                { title: 'p99 latency spike', evidence: 'monitor #7421', impact: 'high' },
              ],
            },
          },
        ],
      }
    }
    if (prompt.includes('oncall triage assistant')) {
      return {
        text: '',
        tool_calls: [
          {
            name: 'structured_output',
            input: {
              prioritized_findings: [{ title: 'p99 latency spike', priority: 'P0' }],
            },
          },
        ],
      }
    }
    if (prompt.includes('one-page oncall summary')) {
      return {
        text: '',
        tool_calls: [
          { name: 'structured_output', input: { summary: '# Incident summary\n...\n' } },
        ],
      }
    }
    return { text: 'unknown prompt' }
  }
}

let dir: string
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

describe('oncall-runbook end-to-end (mocked Anthropic)', () => {
  it('runs all 5 nodes and produces a summary', async () => {
    dir = mkdtempSync(join(tmpdir(), 'oe-e2e-oncall-'))
    const src = join(HERE, '..', 'examples', 'oncall-runbook')
    cpSync(src, dir, { recursive: true })

    const spec = parseExperienceYaml(readFileSync(join(dir, 'experience.yaml'), 'utf8'))
    const llm = new ScriptedLLM()
    const dispatchers = new DispatcherRegistry()
    dispatchers.register(new ToolDispatcher())
    dispatchers.register(new AgentDispatcher({ client: llm }))

    const result = await runExperience({
      spec,
      experienceDir: dir,
      dispatchers,
      events: new EventBus(),
      args: {},
    })

    expect(result.status).toBe('success')
    expect(Array.isArray(result.finalState.findings)).toBe(true)
    // 3 dimensions × 1 finding each = 3 findings.
    expect((result.finalState.findings as unknown[]).length).toBe(3)
    expect((result.finalState.prioritized_findings as unknown[]).length).toBe(1)
    expect(typeof result.finalState.summary).toBe('string')
    expect((result.finalState.summary as string).length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 12: Run e2e + full suite**

```bash
pnpm exec vitest run e2e/oncall-runbook.e2e.test.ts 2>&1 | tail -10
pnpm test 2>&1 | tail -5
```

Expected: 1 new test passes. Full suite = 198 baseline + 1 = **199 passing**.

- [ ] **Step 13: Commit**

```bash
git add examples/oncall-runbook/ e2e/oncall-runbook.e2e.test.ts
git commit -m "demo(oncall-runbook): fan-out incident triage example + e2e"
```

---

## Task 2: `examples/issue-triage/` + e2e (conditional-edge demo)

**Files (new):**

- `examples/issue-triage/experience.yaml`
- `examples/issue-triage/package.json`
- `examples/issue-triage/README.md`
- `examples/issue-triage/tools/load_issue.mjs`
- `examples/issue-triage/tools/search_similar.mjs`
- `examples/issue-triage/prompts/classify.md`
- `examples/issue-triage/prompts/dedup.md`
- `examples/issue-triage/prompts/assign_labels.md`
- `examples/issue-triage/prompts/suggest_owner.md`
- `examples/issue-triage/fixtures/issue.json`
- `examples/issue-triage/fixtures/historical_issues.json`
- `e2e/issue-triage.e2e.test.ts`

**Story:** A GitHub issue body arrives. Classify it, search for duplicates, conditionally run dedup judgment (only if any similar issues exist), assign labels, suggest owner.

- [ ] **Step 1: Create `experience.yaml`**

```yaml
name: issue-triage
description: Triage a GitHub issue — classify, dedup, label, route.
version: 0.1.0

state:
  schema:
    issue: { type: object }
    classification: { type: object }
    similar_issues: { type: array, items: { type: object } }
    is_duplicate: { type: boolean }
    duplicate_of: { type: string }
    labels: { type: array, items: { type: string }, merge: array_append }
    suggested_owner: { type: string }

phases:
  - { id: classify }
  - { id: dedup }
  - { id: route }

graph:
  nodes:
    - id: load_issue
      kind: tool
      phase: classify
      impl: ./tools/load_issue.mjs
      writes: [issue]
    - id: classify
      kind: agent
      phase: classify
      prompt: ./prompts/classify.md
      reads: [issue]
      schema:
        type: object
        required: [type, severity, area]
        properties:
          type: { type: string, enum: [bug, feature, question, docs, chore] }
          severity: { type: string, enum: [low, medium, high] }
          area: { type: string }
      writes: [classification]
    - id: search_similar
      kind: tool
      phase: dedup
      impl: ./tools/search_similar.mjs
      reads: [issue]
      writes: [similar_issues]
    - id: dedup
      kind: agent
      phase: dedup
      prompt: ./prompts/dedup.md
      reads: [issue, similar_issues]
      schema:
        type: object
        required: [is_duplicate]
        properties:
          is_duplicate: { type: boolean }
          duplicate_of: { type: string }
      writes: [is_duplicate, duplicate_of]
    - id: assign_labels
      kind: agent
      phase: route
      prompt: ./prompts/assign_labels.md
      reads: [issue, classification]
      schema:
        type: object
        required: [labels]
        properties:
          labels: { type: array, items: { type: string } }
      writes: [labels]
    - id: suggest_owner
      kind: agent
      phase: route
      prompt: ./prompts/suggest_owner.md
      reads: [classification]
      schema:
        type: object
        required: [suggested_owner]
        properties:
          suggested_owner: { type: string }
      writes: [suggested_owner]
  edges:
    - { from: load_issue, to: classify }
    - { from: classify, to: search_similar }
    - { from: search_similar, to: dedup, when: 'length($.similar_issues) > 0' }
    - { from: dedup, to: assign_labels }
    - { from: classify, to: assign_labels }
    - { from: assign_labels, to: suggest_owner }
```

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "@openexpertise/example-issue-triage",
  "version": "0.1.0",
  "private": true,
  "type": "module"
}
```

- [ ] **Step 3: Create `tools/load_issue.mjs`**

```js
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

export default async function loadIssue() {
  const path = resolve(HERE, '..', 'fixtures', 'issue.json')
  const issue = JSON.parse(readFileSync(path, 'utf8'))
  return { state_delta: { issue } }
}
```

- [ ] **Step 4: Create `tools/search_similar.mjs`**

```js
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

// Stub vector search — reads a fixed list of "historical" issues and returns
// any whose title shares ≥2 words with the incoming issue's title. Replace with
// a real vector search against an embedding store for production use.
//
// ToolDispatcher passes a single argument: `{ ...bundle.args, _edge_inputs, _state }`.
// `_state` exposes everything the node's `reads:` list declared.
export default async function searchSimilar(input) {
  const issue = input._state?.issue
  if (!issue) return { state_delta: { similar_issues: [] } }
  const path = resolve(HERE, '..', 'fixtures', 'historical_issues.json')
  const history = JSON.parse(readFileSync(path, 'utf8'))
  const titleWords = String(issue.title ?? '')
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 3)
  const similar = history.filter((h) => {
    const hw = String(h.title ?? '')
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3)
    const overlap = titleWords.filter((w) => hw.includes(w)).length
    return overlap >= 2
  })
  return { state_delta: { similar_issues: similar } }
}
```

- [ ] **Step 5: Create `prompts/classify.md`**

```markdown
Classify this GitHub issue.

Issue:

```json
{{issue}}
```

Return via `structured_output`:

- `type`: one of `bug`, `feature`, `question`, `docs`, `chore`.
- `severity`: `low`, `medium`, `high`. Use `high` for crashes / data loss / blockers; `low` for cosmetics.
- `area`: 1–2 words naming the subsystem (e.g. `auth`, `cli`, `scheduler`).
```

- [ ] **Step 6: Create `prompts/dedup.md`**

```markdown
Determine whether the new issue duplicates any of the similar issues below.

New issue:

```json
{{issue}}
```

Similar past issues:

```json
{{similar_issues}}
```

Return via `structured_output`:

- `is_duplicate`: boolean.
- `duplicate_of`: optional issue ID of the closest match, only if `is_duplicate=true`.
```

- [ ] **Step 7: Create `prompts/assign_labels.md`**

```markdown
Propose labels for this issue given its classification.

Issue:

```json
{{issue}}
```

Classification:

```json
{{classification}}
```

Return via `structured_output`:

- `labels`: array of strings. Typical labels: `type:<kind>`, `area:<area>`, `severity:<level>`, plus topic-specific tags.
```

- [ ] **Step 8: Create `prompts/suggest_owner.md`**

```markdown
Suggest the most likely owner for an issue with this classification.

Classification:

```json
{{classification}}
```

Owner-routing heuristic:

- `auth` → @security-team
- `cli` → @cli-team
- `scheduler` → @runtime-team
- otherwise → @triage-bot

Return via `structured_output`:

- `suggested_owner`: a single GitHub handle (with the leading `@`).
```

- [ ] **Step 9: Create `fixtures/issue.json`**

```json
{
  "number": 1287,
  "title": "Login button hangs after typing wrong password",
  "body": "Steps:\n1. Open /login\n2. Enter known-bad password\n3. Click Login\n\nExpected: error message immediately.\nActual: button spins for ~30s then times out.",
  "author": "external-user",
  "created_at": "2026-05-26T09:00:00Z"
}
```

- [ ] **Step 10: Create `fixtures/historical_issues.json`**

```json
[
  {
    "number": 412,
    "title": "Login button stuck on slow connections",
    "resolved": true,
    "closed_at": "2025-08-12T00:00:00Z"
  },
  {
    "number": 901,
    "title": "Spinner does not stop after error response",
    "resolved": true,
    "closed_at": "2026-01-04T00:00:00Z"
  },
  {
    "number": 502,
    "title": "Unrelated documentation typo",
    "resolved": true,
    "closed_at": "2025-11-01T00:00:00Z"
  }
]
```

- [ ] **Step 11: Create `README.md`**

```markdown
# issue-triage

Triage an incoming GitHub issue through 5 steps:

1. **classify phase**
   - `load_issue` (tool) — pulls the issue body from fixtures.
   - `classify` (agent) — picks `type`, `severity`, `area`.
2. **dedup phase**
   - `search_similar` (tool) — stub vector search over `fixtures/historical_issues.json`.
   - `dedup` (agent) — _conditional edge: only runs if `length($.similar_issues) > 0`._ Determines if the issue is a duplicate and of what.
3. **route phase**
   - `assign_labels` (agent) — proposes labels based on classification.
   - `suggest_owner` (agent) — proposes a routing handle.

Demonstrates: `tool → agent` chaining, **`when:` conditional edges** to skip work when there are no candidates, and parallel-ish "fan-in" from `classify` + `dedup` to `assign_labels`.

## Run

```bash
export ANTHROPIC_API_KEY=sk-...
node packages/cli/dist/bin.js run examples/issue-triage --tui
```

Replace `fixtures/issue.json` with a real GitHub issue payload, or replace `load_issue.mjs` with a call to the GitHub REST API.

## Mocked e2e

`e2e/issue-triage.e2e.test.ts` exercises the full graph with a scripted LLM — no API key required.
```

- [ ] **Step 12: Validate**

```bash
node packages/cli/dist/bin.js validate examples/issue-triage 2>&1 | tail -5
```

- [ ] **Step 13: Create `e2e/issue-triage.e2e.test.ts`**

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

const HERE = dirname(fileURLToPath(import.meta.url))

class ScriptedLLM implements LLMClient {
  async complete(opts: LLMCompleteOpts) {
    const prompt = opts.messages[0]?.content ?? ''
    if (prompt.includes('Classify this GitHub issue')) {
      return {
        text: '',
        tool_calls: [
          {
            name: 'structured_output',
            input: { type: 'bug', severity: 'medium', area: 'auth' },
          },
        ],
      }
    }
    if (prompt.includes('duplicates any of the similar')) {
      return {
        text: '',
        tool_calls: [
          {
            name: 'structured_output',
            input: { is_duplicate: true, duplicate_of: '901' },
          },
        ],
      }
    }
    if (prompt.includes('Propose labels')) {
      return {
        text: '',
        tool_calls: [
          {
            name: 'structured_output',
            input: { labels: ['type:bug', 'area:auth', 'severity:medium'] },
          },
        ],
      }
    }
    if (prompt.includes('most likely owner')) {
      return {
        text: '',
        tool_calls: [
          { name: 'structured_output', input: { suggested_owner: '@security-team' } },
        ],
      }
    }
    return { text: 'unknown prompt' }
  }
}

let dir: string
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

describe('issue-triage end-to-end (mocked Anthropic)', () => {
  it('classifies, dedups, labels, and suggests an owner', async () => {
    dir = mkdtempSync(join(tmpdir(), 'oe-e2e-triage-'))
    const src = join(HERE, '..', 'examples', 'issue-triage')
    cpSync(src, dir, { recursive: true })

    const spec = parseExperienceYaml(readFileSync(join(dir, 'experience.yaml'), 'utf8'))
    const llm = new ScriptedLLM()
    const dispatchers = new DispatcherRegistry()
    dispatchers.register(new ToolDispatcher())
    dispatchers.register(new AgentDispatcher({ client: llm }))

    const result = await runExperience({
      spec,
      experienceDir: dir,
      dispatchers,
      events: new EventBus(),
      args: {},
    })

    expect(result.status).toBe('success')
    expect(result.finalState.classification).toMatchObject({ type: 'bug', area: 'auth' })
    expect(result.finalState.is_duplicate).toBe(true)
    expect(result.finalState.duplicate_of).toBe('901')
    expect((result.finalState.labels as unknown[]).length).toBeGreaterThan(0)
    expect(result.finalState.suggested_owner).toBe('@security-team')
  })
})
```

- [ ] **Step 14: Run + verify**

```bash
pnpm exec vitest run e2e/issue-triage.e2e.test.ts 2>&1 | tail -10
pnpm test 2>&1 | tail -5
```

Expected: 1 new test passes. Full suite = 199 + 1 = **200 passing**.

- [ ] **Step 15: Commit**

```bash
git add examples/issue-triage/ e2e/issue-triage.e2e.test.ts
git commit -m "demo(issue-triage): GitHub issue triage with conditional dedup + e2e"
```

---

## Task 3: `examples/release-gates/` + e2e (cli-agent demo)

**Files (new):**

- `examples/release-gates/experience.yaml`
- `examples/release-gates/package.json`
- `examples/release-gates/README.md`
- `examples/release-gates/tools/license_check.mjs`
- `examples/release-gates/tools/changelog_scan.mjs`
- `examples/release-gates/tools/coverage_diff.mjs`
- `examples/release-gates/prompts/score.md`
- `examples/release-gates/fixtures/deps.json`
- `examples/release-gates/fixtures/changelog.md`
- `examples/release-gates/fixtures/coverage_before.json`
- `examples/release-gates/fixtures/coverage_after.json`
- `examples/release-gates/fixtures/diff.txt`
- `e2e/release-gates.e2e.test.ts`

**Story:** Pre-release gate. Run 4 parallel-ish checks (license, changelog, coverage, security via cli-agent), then a final scoring agent gates the release.

- [ ] **Step 1: Create `experience.yaml`**

```yaml
name: release-gates
description: Pre-release checks — license compliance, changelog breaking-change scan, test-coverage delta, and a Claude Code security review — combined into a release/no-release recommendation.
version: 0.1.0

state:
  schema:
    license_issues: { type: array, items: { type: object }, merge: array_append }
    breaking_changes: { type: array, items: { type: object }, merge: array_append }
    coverage_delta: { type: object }
    security_findings: { type: array, items: { type: object }, merge: array_append }
    decision: { type: object }

phases:
  - { id: scan }
  - { id: gate }

graph:
  nodes:
    - id: license_check
      kind: tool
      phase: scan
      impl: ./tools/license_check.mjs
      writes: [license_issues]
    - id: changelog_scan
      kind: tool
      phase: scan
      impl: ./tools/changelog_scan.mjs
      writes: [breaking_changes]
    - id: coverage_diff
      kind: tool
      phase: scan
      impl: ./tools/coverage_diff.mjs
      writes: [coverage_delta]
    - id: security_scan
      kind: cli-agent
      phase: scan
      provider: claude-code
      prompt: |
        Review the diff at fixtures/diff.txt for security issues. Return JSON
        matching this schema: {"security_findings": [{"title": "...", "severity": "low|medium|high"}]}.
        If you find none, return {"security_findings": []}.
      output_format: json
      schema:
        type: object
        required: [security_findings]
        properties:
          security_findings:
            type: array
            items:
              type: object
              required: [title, severity]
              properties:
                title: { type: string }
                severity: { type: string }
      writes: [security_findings]
      timeout_ms: 300000
    - id: score
      kind: agent
      phase: gate
      prompt: ./prompts/score.md
      reads: [license_issues, breaking_changes, coverage_delta, security_findings]
      schema:
        type: object
        required: [decision]
        properties:
          decision:
            type: object
            required: [ready_to_release, score, blocking_issues]
            properties:
              ready_to_release: { type: boolean }
              score: { type: number }
              blocking_issues: { type: array, items: { type: string } }
              recommendation: { type: string }
      writes: [decision]
  edges:
    - { from: license_check, to: score }
    - { from: changelog_scan, to: score }
    - { from: coverage_diff, to: score }
    - { from: security_scan, to: score }
```

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "@openexpertise/example-release-gates",
  "version": "0.1.0",
  "private": true,
  "type": "module"
}
```

- [ ] **Step 3: Create `tools/license_check.mjs`**

```js
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

const ALLOWED = new Set(['MIT', 'BSD-3-Clause', 'Apache-2.0', 'ISC'])

export default async function licenseCheck() {
  const path = resolve(HERE, '..', 'fixtures', 'deps.json')
  const deps = JSON.parse(readFileSync(path, 'utf8'))
  const issues = deps
    .filter((d) => !ALLOWED.has(d.license))
    .map((d) => ({ package: d.name, license: d.license, severity: 'high' }))
  return { state_delta: { license_issues: issues } }
}
```

- [ ] **Step 4: Create `tools/changelog_scan.mjs`**

```js
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

export default async function changelogScan() {
  const path = resolve(HERE, '..', 'fixtures', 'changelog.md')
  const md = readFileSync(path, 'utf8')
  const breaking = []
  for (const line of md.split('\n')) {
    if (/\[breaking\]/i.test(line) || /^\s*[-*]\s*BREAKING/i.test(line)) {
      breaking.push({ line: line.trim() })
    }
  }
  return { state_delta: { breaking_changes: breaking } }
}
```

- [ ] **Step 5: Create `tools/coverage_diff.mjs`**

```js
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

export default async function coverageDiff() {
  const before = JSON.parse(
    readFileSync(resolve(HERE, '..', 'fixtures', 'coverage_before.json'), 'utf8'),
  )
  const after = JSON.parse(
    readFileSync(resolve(HERE, '..', 'fixtures', 'coverage_after.json'), 'utf8'),
  )
  const delta = {
    line_coverage_before: before.line_coverage,
    line_coverage_after: after.line_coverage,
    delta_pct: Number((after.line_coverage - before.line_coverage).toFixed(2)),
    regression: after.line_coverage < before.line_coverage,
  }
  return { state_delta: { coverage_delta: delta } }
}
```

- [ ] **Step 6: Create `prompts/score.md`**

```markdown
You are the release gate. Combine four inputs into a release/no-release decision.

Inputs:

- License issues:

```json
{{license_issues}}
```

- Breaking changes:

```json
{{breaking_changes}}
```

- Coverage delta:

```json
{{coverage_delta}}
```

- Security findings:

```json
{{security_findings}}
```

Scoring heuristic (0.0–1.0, higher = riskier):

- Any license issue → +0.4
- Any high-severity security finding → +0.4
- Coverage regression (delta_pct < 0) → +0.2
- Breaking changes present → +0.1 each, capped at 0.3

Decide:

- `ready_to_release`: true if `score < 0.4` AND no high-severity security finding AND no license issue.
- `blocking_issues`: an array of strings naming the specific failures.
- `recommendation`: one short sentence the release engineer can act on.

Return via `structured_output`:

```json
{
  "decision": {
    "ready_to_release": boolean,
    "score": number,
    "blocking_issues": ["..."],
    "recommendation": "..."
  }
}
```
```

- [ ] **Step 7: Create fixtures**

`fixtures/deps.json`:

```json
[
  { "name": "lodash", "version": "4.17.21", "license": "MIT" },
  { "name": "tslib", "version": "2.6.0", "license": "0BSD" }
]
```

`fixtures/changelog.md`:

```markdown
# Changelog

## v1.4.0 (unreleased)

- feat: add /v2/users/search endpoint
- fix: tighten input validation on /v2/users
- [BREAKING] remove deprecated /v1/users — clients must migrate

## v1.3.0

- chore: dep bumps
```

`fixtures/coverage_before.json`:

```json
{ "line_coverage": 84.5, "branch_coverage": 71.2 }
```

`fixtures/coverage_after.json`:

```json
{ "line_coverage": 82.1, "branch_coverage": 70.8 }
```

`fixtures/diff.txt`:

```diff
diff --git a/app/routes/users.py b/app/routes/users.py
@@ -10,3 +10,8 @@ def search_users(request):
+    qs = request.GET.get('q', '')
+    sql = f"SELECT * FROM users WHERE name LIKE '%{qs}%'"
+    return execute(sql)
```

- [ ] **Step 8: Create `README.md`**

```markdown
# release-gates

Pre-release gate that runs four independent checks in the `scan` phase, then a single agent in the `gate` phase aggregates them into a release/no-release decision.

1. **scan phase** (parallel-friendly; sequential in V1's scheduler)
   - `license_check` (tool) — verifies each dep against an allow-list (`MIT, BSD-3-Clause, Apache-2.0, ISC`).
   - `changelog_scan` (tool) — flags lines marked `[BREAKING]` or `BREAKING` in the changelog.
   - `coverage_diff` (tool) — computes line-coverage delta between two snapshots.
   - `security_scan` (**cli-agent / claude-code**) — hands the diff to Claude Code for a security review with structured JSON output.
2. **gate phase**
   - `score` (agent) — weights all four inputs and returns `{ ready_to_release, score, blocking_issues, recommendation }`.

Demonstrates: **mixing `tool` + `cli-agent` + `agent` in one experience**, four sibling nodes converging into one downstream node, and JSON-mode parsing on a CLI agent.

## Run

```bash
export ANTHROPIC_API_KEY=sk-...           # for the `score` agent
# `claude` CLI must be on PATH and authenticated for `security_scan`
node packages/cli/dist/bin.js run examples/release-gates --tui
```

Replace `fixtures/diff.txt` with the actual unified diff of your release branch.

## Mocked e2e

`e2e/release-gates.e2e.test.ts` exercises the graph with a scripted LLM (for the score agent) and a scripted subprocess runner (for the security_scan cli-agent) — no API key, no CLI required.
```

- [ ] **Step 9: Validate**

```bash
node packages/cli/dist/bin.js validate examples/release-gates 2>&1 | tail -5
```

- [ ] **Step 10: Create `e2e/release-gates.e2e.test.ts`**

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

class ScriptedRunner implements SubprocessRunner {
  async run(_spec: SpawnSpec, _opts: { timeoutMs: number; cwd: string }): Promise<RunResult> {
    return {
      stdout: JSON.stringify({
        security_findings: [
          { title: 'SQL injection via f-string in search_users', severity: 'high' },
        ],
      }),
      stderr: '',
      exitCode: 0,
      timedOut: false,
    }
  }
}

class ScriptedLLM implements LLMClient {
  async complete(opts: LLMCompleteOpts) {
    const prompt = opts.messages[0]?.content ?? ''
    if (prompt.includes('release gate')) {
      return {
        text: '',
        tool_calls: [
          {
            name: 'structured_output',
            input: {
              decision: {
                ready_to_release: false,
                score: 0.8,
                blocking_issues: ['high-severity security finding', 'coverage regression'],
                recommendation: 'Fix SQL injection in search_users before release.',
              },
            },
          },
        ],
      }
    }
    return { text: 'unknown prompt' }
  }
}

let dir: string
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

describe('release-gates end-to-end (mocked)', () => {
  it('runs 4 scan nodes + score agent, produces no-release decision', async () => {
    dir = mkdtempSync(join(tmpdir(), 'oe-e2e-release-'))
    const src = join(HERE, '..', 'examples', 'release-gates')
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
    // license_issues: tslib is 0BSD, not on the allow-list
    expect((result.finalState.license_issues as unknown[]).length).toBe(1)
    // breaking_changes: at least one BREAKING line in the changelog
    expect((result.finalState.breaking_changes as unknown[]).length).toBeGreaterThan(0)
    // coverage regression: delta_pct < 0
    expect((result.finalState.coverage_delta as { regression: boolean }).regression).toBe(true)
    // security_findings: scripted runner returned one high-severity finding
    expect((result.finalState.security_findings as unknown[]).length).toBe(1)
    // Final decision: not ready, with blocking issues
    const decision = result.finalState.decision as { ready_to_release: boolean; blocking_issues: string[] }
    expect(decision.ready_to_release).toBe(false)
    expect(decision.blocking_issues.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 11: Run + verify**

```bash
pnpm exec vitest run e2e/release-gates.e2e.test.ts 2>&1 | tail -10
pnpm test 2>&1 | tail -5
```

Expected: 1 new test passes. Full suite = 200 + 1 = **201 passing**.

- [ ] **Step 12: Commit**

```bash
git add examples/release-gates/ e2e/release-gates.e2e.test.ts
git commit -m "demo(release-gates): tool + cli-agent + agent gate with e2e"
```

---

## Task 4: README + progress + final verify

**Files:**

- Modify: `README.md` (root)
- Modify: `docs/superpowers/overnight-progress.md`

- [ ] **Step 1: Add the new examples to root README**

In `README.md`, find the "Quick start — smaller examples" section. After the existing examples block, append:

```markdown

### More examples

| Example | Demonstrates |
|---|---|
| [`oncall-runbook`](examples/oncall-runbook/) | `tool → agent` fan-out via `for_each` over investigation dimensions |
| [`issue-triage`](examples/issue-triage/) | `when:` conditional edges, multi-agent label + owner routing |
| [`release-gates`](examples/release-gates/) | Mixing `tool` + `cli-agent` (claude-code) + `agent` in one graph |

Each ships with a fixture and a mocked-LLM e2e test in `e2e/` — no real API or CLI required to verify the structure.
```

- [ ] **Step 2: Append progress log**

In `docs/superpowers/overnight-progress.md`, append:

```markdown

---

## Plan C (V2) — Examples Library (2026-05-26)

Branch: `feat/examples-library` (off `main`)
Spec: `docs/superpowers/specs/2026-05-26-ultraexpertise-and-v2-polish-design.md` (Plan C section)
Plan: `docs/superpowers/plans/2026-05-26-examples-library.md`

### What shipped

| Example | Highlights |
|---|---|
| `oncall-runbook` | Tool seeds 3 investigation dimensions; agent fans out via `for_each`; sequential prioritize + summary agents. Demonstrates structured for_each. |
| `issue-triage` | Conditional edge `when: 'length($.similar_issues) > 0'` skips dedup if no similar issues exist. Demonstrates conditional control flow. |
| `release-gates` | Three tools + one `cli-agent` (claude-code) → one scoring agent. Demonstrates heterogeneous node kinds in one graph. |

### Tests

| File | Coverage |
|---|---|
| `e2e/oncall-runbook.e2e.test.ts` | Mocked Anthropic LLM — runs all 5 nodes, asserts 3 findings + summary string. |
| `e2e/issue-triage.e2e.test.ts` | Mocked LLM — classify + dedup + labels + owner end-to-end. |
| `e2e/release-gates.e2e.test.ts` | Mocked LLM + scripted subprocess runner — 4 sibling checks + scoring agent + no-release decision. |

Test count: 198 baseline + 3 new e2e = **201 passing**.

### Next concrete actions

1. Merge `feat/examples-library` into `main`.
2. Optionally smoke each example end-to-end with a real API key.
3. Move to Plan D (parallel scheduler + 429 handling) — the most invasive of the V2 plans.
```

- [ ] **Step 3: Final verification**

```bash
pnpm clean && pnpm install && pnpm -r build 2>&1 | tail -5
pnpm typecheck 2>&1 | tail -3
pnpm lint 2>&1 | tail -3
pnpm format:check 2>&1 | tail -3
pnpm test 2>&1 | tail -5
```

Expected: clean across all checks. **201 tests passing**.

If `pnpm format:check` fails, run `pnpm format` and commit as `style: prettier formatting for examples library`.

- [ ] **Step 4: Commit + log**

```bash
git add README.md docs/superpowers/overnight-progress.md
git commit -m "docs: README new-examples table + Plan C progress"
git log --oneline main..HEAD | head -10
```
