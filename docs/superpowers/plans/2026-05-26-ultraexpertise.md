# Plan A — Ultraexpertise (auto-SOP authoring) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `oe ultra "<task>"` (and the matching `/ultraexpertise` slash command + `oe_ultra` MCP tool) — a two-phase LLM-driven flow that analyzes the user's natural-language task and synthesizes a complete, validated `experience.yaml` plus supporting files into a draft directory.

**Architecture:** A new `@openexpertise/authoring` package implements `UltraExpertise` — a class that drives the LLM through phase 1 (task analysis with structured output) and phase 2 (SOP synthesis with structured output), then writes files to disk and runs `oe validate`. The same `LLMClient` interface and `llm-factory` already used by `EvolutionAdvisor` are reused, so the same LLM that authors a SOP can later evolve it.

**Tech Stack:** TypeScript 5.5+, ajv ^8 (already a workspace dep), vitest. No new external deps.

**Spec:** `docs/superpowers/specs/2026-05-26-ultraexpertise-and-v2-polish-design.md` (Plan A section)

---

## File Structure

**New package:** `packages/authoring/`

```
packages/authoring/
├── package.json                # deps: @openexpertise/core, @openexpertise/schema, ajv
├── tsconfig.json
├── src/
│   ├── index.ts                # public exports
│   ├── ultra.ts                # UltraExpertise class
│   ├── writer.ts               # safe file materialization
│   ├── slug.ts                 # name → slug helper
│   ├── schemas.ts              # AJV schemas for phase 1 + phase 2 outputs
│   └── prompts/
│       ├── analyzer.md         # phase 1 system prompt
│       └── synthesizer.md      # phase 2 system prompt
└── tests/
    ├── ultra.test.ts           # canned LLM round-trip
    ├── writer.test.ts          # path traversal + materialization
    └── slug.test.ts            # slugify edge cases
```

**Modified — `packages/cli/`:**
- `package.json` — add `@openexpertise/authoring` workspace dep
- `tsconfig.json` — add project ref
- `src/index.ts` — register `oe ultra` command
- `src/commands/ultra.ts` (new) — command handler

**Modified — `packages/mcp-server/`:**
- `package.json` — add `@openexpertise/authoring` workspace dep
- `tsconfig.json` — add project ref
- `src/tools/ultra.ts` (new) — MCP tool handler
- `src/server.ts` — register tool
- `tests/server.test.ts` — extend test

**New — `packages/skill-experience-creator/commands/ultraexpertise.md`:**
A Claude Code slash command file that wraps `oe ultra` — when the user types `/ultraexpertise <task>` in Claude Code, this triggers a Bash call to the binary.

**New — `docs/ultraexpertise.md`:** Reference doc.

**Modified — `README.md`:** Add ultraexpertise bullet under "Why OpenExpertise".

---

## Task 1: Scaffold `@openexpertise/authoring`

**Files:**

- Create: `packages/authoring/package.json`
- Create: `packages/authoring/tsconfig.json`
- Create: `packages/authoring/src/index.ts`
- Create: `packages/authoring/tests/.gitkeep`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "@openexpertise/authoring",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist", "src/prompts"],
  "publishConfig": { "access": "public" },
  "scripts": {
    "build": "tsc -b && node -e \"require('node:fs').cpSync('src/prompts','dist/prompts',{recursive:true})\"",
    "typecheck": "tsc --noEmit",
    "test": "vitest"
  },
  "dependencies": {
    "@openexpertise/core": "workspace:*",
    "@openexpertise/schema": "workspace:*",
    "ajv": "^8.17.0"
  }
}
```

The build script copies the prompt markdown files into `dist/prompts/` (the schema package uses the same pattern for its JSON schema file).

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "composite": true
  },
  "include": ["src/**/*"],
  "references": [{ "path": "../core" }, { "path": "../schema" }]
}
```

- [ ] **Step 3: Create `src/index.ts`**

```ts
export { UltraExpertise, type UltraExpertiseOpts, type UltraResult } from './ultra.js'
export {
  writeDraft,
  type WriteDraftOpts,
  type WriteDraftResult,
  PathTraversalError,
} from './writer.js'
export { slugify } from './slug.js'
export {
  ANALYSIS_SCHEMA,
  SYNTHESIS_SCHEMA,
  type AnalysisOutput,
  type SynthesisOutput,
} from './schemas.js'
```

This will fail to typecheck until later tasks create those modules.

- [ ] **Step 4: Create empty `tests/.gitkeep`**

- [ ] **Step 5: Wire workspace**

```bash
pnpm install
```

Expected: workspace links resolved, ajv already in lockfile.

- [ ] **Step 6: Commit**

```bash
git add packages/authoring/ pnpm-lock.yaml
git commit -m "scaffold: @openexpertise/authoring package"
```

---

## Task 2: Implement `slugify` (TDD)

**Files:**

- Create: `packages/authoring/src/slug.ts`
- Create: `packages/authoring/tests/slug.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { slugify } from '../src/slug.js'

describe('slugify', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(slugify('Security PR Review')).toBe('security-pr-review')
  })

  it('strips non-alphanumeric characters', () => {
    expect(slugify("Audit GitHub PRs! (compliance/SOC2)")).toBe('audit-github-prs-compliance-soc2')
  })

  it('collapses consecutive separators', () => {
    expect(slugify('foo   bar---baz')).toBe('foo-bar-baz')
  })

  it('trims leading and trailing separators', () => {
    expect(slugify('---foo---')).toBe('foo')
  })

  it('truncates to 60 chars at a word boundary', () => {
    const long = 'a very long task name '.repeat(10)
    const out = slugify(long)
    expect(out.length).toBeLessThanOrEqual(60)
    expect(out.endsWith('-')).toBe(false)
  })

  it('falls back to "experience" when input has no alphanumerics', () => {
    expect(slugify('!!!')).toBe('experience')
  })

  it('preserves digits', () => {
    expect(slugify('SOC2 v1.2 review')).toBe('soc2-v1-2-review')
  })
})
```

- [ ] **Step 2: Confirm RED**

```bash
pnpm exec vitest run packages/authoring/tests/slug.test.ts 2>&1 | tail -10
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/slug.ts`**

```ts
export function slugify(input: string): string {
  let s = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  if (s.length === 0) return 'experience'

  if (s.length > 60) {
    s = s.slice(0, 60)
    // Trim back to a word boundary if we landed mid-word
    const lastSep = s.lastIndexOf('-')
    if (lastSep > 30) s = s.slice(0, lastSep)
    s = s.replace(/-+$/g, '')
  }
  return s
}
```

- [ ] **Step 4: Confirm GREEN**

```bash
pnpm exec vitest run packages/authoring/tests/slug.test.ts 2>&1 | tail -10
```

Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/authoring/src/slug.ts packages/authoring/tests/slug.test.ts
git commit -m "feat(authoring): slugify helper"
```

---

## Task 3: AJV schemas (`schemas.ts`)

**Files:**

- Create: `packages/authoring/src/schemas.ts`

This task has no tests of its own — the schemas are exercised by Task 5's `ultra.test.ts`. We commit them now so phase 1 and phase 2 implementations have a shared source of truth.

- [ ] **Step 1: Create `src/schemas.ts`**

```ts
// JSON Schemas for the two structured-output payloads UltraExpertise
// expects back from the LLM. Both are AJV-compatible (draft-07-ish).

export const ANALYSIS_SCHEMA = {
  type: 'object',
  required: ['name', 'description', 'phases', 'state_fields', 'node_sketches'],
  properties: {
    name: { type: 'string', pattern: '^[a-z][a-z0-9-]*$', maxLength: 60 },
    description: { type: 'string' },
    domain: { type: 'string' },
    phases: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
        },
      },
    },
    state_fields: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'type'],
        properties: {
          name: { type: 'string' },
          type: { type: 'string', enum: ['string', 'number', 'boolean', 'array', 'object'] },
          merge: { type: 'string', enum: ['array_append', 'set_once', 'last_wins'] },
          description: { type: 'string' },
        },
      },
    },
    node_sketches: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'kind', 'purpose'],
        properties: {
          id: { type: 'string' },
          kind: {
            type: 'string',
            enum: ['tool', 'agent', 'skill', 'dataset', 'experience', 'cli-agent'],
          },
          phase: { type: 'string' },
          purpose: { type: 'string' },
          fan_out_over: { type: 'string' },
        },
      },
    },
    open_questions: { type: 'array', items: { type: 'string' } },
  },
} as const

export const SYNTHESIS_SCHEMA = {
  type: 'object',
  required: ['experience_yaml', 'files'],
  properties: {
    experience_yaml: { type: 'string' },
    files: {
      type: 'array',
      items: {
        type: 'object',
        required: ['path', 'content'],
        properties: {
          path: { type: 'string' },
          content: { type: 'string' },
        },
      },
    },
    next_steps: { type: 'array', items: { type: 'string' } },
  },
} as const

export interface AnalysisOutput {
  name: string
  description: string
  domain?: string
  phases: Array<{ id: string; title?: string }>
  state_fields: Array<{
    name: string
    type: 'string' | 'number' | 'boolean' | 'array' | 'object'
    merge?: 'array_append' | 'set_once' | 'last_wins'
    description?: string
  }>
  node_sketches: Array<{
    id: string
    kind: 'tool' | 'agent' | 'skill' | 'dataset' | 'experience' | 'cli-agent'
    phase?: string
    purpose: string
    fan_out_over?: string
  }>
  open_questions?: string[]
}

export interface SynthesisOutput {
  experience_yaml: string
  files: Array<{ path: string; content: string }>
  next_steps?: string[]
}
```

- [ ] **Step 2: Verify TS compiles**

```bash
pnpm --filter @openexpertise/authoring build 2>&1 | tail -5
```

This may fail until later tasks create ultra.ts and writer.ts (which the index.ts re-exports). That's the expected TDD red state — don't try to fix it. Run typecheck on just this file instead:

```bash
pnpm exec tsc --noEmit packages/authoring/src/schemas.ts 2>&1 | tail -5
```

Expected: clean (no errors).

- [ ] **Step 3: Commit**

```bash
git add packages/authoring/src/schemas.ts
git commit -m "feat(authoring): AJV schemas for analysis + synthesis outputs"
```

---

## Task 4: Prompt files

**Files:**

- Create: `packages/authoring/src/prompts/analyzer.md`
- Create: `packages/authoring/src/prompts/synthesizer.md`

- [ ] **Step 1: Create `src/prompts/analyzer.md`**

```markdown
You are an OpenExpertise SOP architect. The user describes a recurring task in natural language. Your job is to analyze it into a structured plan that a follow-up step will turn into a runnable experience.yaml.

## Output

Call the `structured_output` tool. Do not reply with prose.

## Schema (informal)

- `name`: lowercase-hyphen slug, ≤60 chars, starts with a letter, e.g. `soc2-pr-review`.
- `description`: one-sentence summary the user would write themselves.
- `domain`: short category, e.g. `compliance`, `release-engineering`, `code-review`, `oncall`, `research`.
- `phases`: ordered list of phases, each `{ id, title? }`. Phases group nodes logically (collect → analyze → verify → report is the typical pattern).
- `state_fields`: list of `{ name, type, merge?, description? }`. These become the SQLite blackboard fields. Use `merge: array_append` for fields written multiple times (e.g. findings collected from fan-out).
- `node_sketches`: list of `{ id, kind, phase?, purpose, fan_out_over? }`. Pick the right kind:
  - `tool` for deterministic code (fetch data, format, compute).
  - `agent` for LLM tasks with structured output (review, classify, score).
  - `skill` for invoking a SKILL.md-packaged routine.
  - `dataset` for loading data from file / SQLite / HTTP.
  - `experience` for delegating to a nested experience.
  - `cli-agent` for handing a step to Claude Code, Codex, or Gemini CLI.
  - `fan_out_over`: state field that the node iterates over (sets up a `for_each`).
- `open_questions`: ≤5 items the user must answer before this can run. E.g. "Which SOC2 controls are in scope?".

## Decomposition heuristics

- Default to 4 phases: `collect / analyze / verify / report`. Add or remove as the task warrants.
- Always include a verifier (an `agent` that adversarially confirms findings before they're counted) — this is the OpenExpertise pattern.
- Prefer `tool` for anything deterministic (fetching, parsing, scoring). LLM nodes are expensive and stochastic; only use them when judgment is needed.
- If the task mentions reviewing code, fan out an `agent` over a `dimensions` field — emit `fan_out_over: "dimensions"` and add a `tool` node that seeds it.
- Surface domain-specific gaps as `open_questions` — e.g. credentials, endpoints, list of dimensions. Don't invent values.

Return only the structured_output tool call.
```

- [ ] **Step 2: Create `src/prompts/synthesizer.md`**

```markdown
You are an OpenExpertise SOP synthesizer. You have a structured analysis from the previous step. Your job is to materialize it into a valid `experience.yaml` and the supporting tool/prompt files that go alongside.

## Output

Call the `structured_output` tool with:

- `experience_yaml`: the full YAML, top to bottom. Must parse and validate against the OpenExpertise schema. Use `name`, `description`, `version: "0.1.0"`, `state: { schema: {...} }`, `phases: [...]`, `graph: { nodes: [...], edges: [...] }`.
- `files`: every supporting file referenced by the YAML, with relative `path` and full `content`:
  - For each `tool` node: `tools/<id>.mjs` with a `default export async function (bundle, ctx) { return { state_delta: {...} } }`.
  - For each `agent` / `cli-agent` node that references a prompt file (recommended for non-trivial prompts): `prompts/<id>.md`.
  - Always include a top-level `README.md` describing the SOP, prerequisites, and how to run it.
- `next_steps`: ≤5 actionable items the user should do (set env var, edit a placeholder, run the experience).

## Path rules

- All paths in `files[]` are RELATIVE to the experience directory.
- No leading `/`. No `..` traversal. No drive letters.
- The writer rejects invalid paths.

## YAML rules

- Top-level `name` matches the analysis `name`.
- `state.schema` mirrors `state_fields[]` from the analysis.
- For each node from `node_sketches[]`, emit the right shape:
  - `tool`: `{ id, kind: tool, impl: ./tools/<id>.mjs, phase?, reads?, writes? }`
  - `agent`: `{ id, kind: agent, prompt: ./prompts/<id>.md, schema: {...}, reads?, writes?, for_each? }`
  - `cli-agent`: `{ id, kind: cli-agent, provider: claude-code|codex|gemini, prompt: "...", reads?, writes?, output_format?, schema?, timeout_ms? }` (inline prompt is required for cli-agent in V1)
- `edges` form a connected DAG aligned with `phases`.
- Conditional edges use `when: '<expression>'` (e.g. `when: 'length($.findings) > 0'`).
- `for_each` blocks use `{ source: '$.<state_field>' }`.

## Tool stub conventions

Each `tools/<id>.mjs` MUST:

- Be an ESM module with a default async function: `export default async function (bundle, ctx) { ... }`.
- Return `{ state_delta: {...} }` — a partial state update.
- Use `import {readFileSync} from 'node:fs'` etc., not bare specifiers.
- Include a `// TODO:` comment marking the integration point the user needs to fill in (API call, file path, etc.).

Make stubs runnable as-is with fixture data so `oe run` doesn't crash before the user wires anything up.

## Prompt conventions

For `agent` nodes that use a prompt file, write a focused, narrowed prompt. Use `{{state_field}}` for interpolation. Tell the model to return via `structured_output` and remind it of the schema.

Return only the structured_output tool call.
```

- [ ] **Step 3: Verify files exist**

```bash
ls -la packages/authoring/src/prompts/
```

Expected: both files listed, non-empty.

- [ ] **Step 4: Commit**

```bash
git add packages/authoring/src/prompts/
git commit -m "feat(authoring): analyzer + synthesizer system prompts"
```

---

## Task 5: `UltraExpertise` class — phase 1 + phase 2 (TDD)

**Files:**

- Create: `packages/authoring/src/ultra.ts`
- Create: `packages/authoring/tests/ultra.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/authoring/tests/ultra.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import type { LLMClient, LLMCompleteOpts } from '@openexpertise/core'
import { UltraExpertise } from '../src/ultra.js'
import type { AnalysisOutput, SynthesisOutput } from '../src/schemas.js'

class ScriptedLLM implements LLMClient {
  public calls: LLMCompleteOpts[] = []
  constructor(
    private analysis: AnalysisOutput,
    private synthesis: SynthesisOutput,
  ) {}
  async complete(opts: LLMCompleteOpts) {
    this.calls.push(opts)
    // Phase 1: system contains "SOP architect" → return analysis
    if (opts.system?.includes('SOP architect')) {
      return {
        text: '',
        tool_calls: [{ name: 'structured_output', input: this.analysis }],
      }
    }
    // Phase 2: system contains "SOP synthesizer" → return synthesis
    return {
      text: '',
      tool_calls: [{ name: 'structured_output', input: this.synthesis }],
    }
  }
}

const ANALYSIS: AnalysisOutput = {
  name: 'hello-author',
  description: 'A trivial SOP that says hi.',
  phases: [{ id: 'main' }],
  state_fields: [{ name: 'greeting', type: 'string' }],
  node_sketches: [{ id: 'greet', kind: 'tool', phase: 'main', purpose: 'emit a greeting' }],
}

const SYNTHESIS: SynthesisOutput = {
  experience_yaml: `name: hello-author
version: 0.1.0
state:
  schema:
    greeting: { type: string }
graph:
  nodes:
    - id: greet
      kind: tool
      phase: main
      impl: ./tools/greet.mjs
      writes: [greeting]
  edges: []
phases:
  - { id: main }
`,
  files: [
    {
      path: 'tools/greet.mjs',
      content: `export default async function () { return { state_delta: { greeting: 'hi' } } }
`,
    },
    { path: 'README.md', content: '# hello-author\n' },
  ],
  next_steps: ['Run oe run .openexpertise/drafts/hello-author to test'],
}

describe('UltraExpertise', () => {
  it('phase 1 returns the analysis from the LLM', async () => {
    const llm = new ScriptedLLM(ANALYSIS, SYNTHESIS)
    const ultra = new UltraExpertise({ client: llm })
    const analysis = await ultra.analyze('say hi')
    expect(analysis.name).toBe('hello-author')
    expect(analysis.node_sketches[0]!.id).toBe('greet')
    // Phase 1 called once
    expect(llm.calls.length).toBe(1)
    expect(llm.calls[0]!.system).toContain('SOP architect')
  })

  it('phase 2 returns the synthesis from the LLM', async () => {
    const llm = new ScriptedLLM(ANALYSIS, SYNTHESIS)
    const ultra = new UltraExpertise({ client: llm })
    const synth = await ultra.synthesize('say hi', ANALYSIS)
    expect(synth.experience_yaml).toContain('hello-author')
    expect(synth.files).toHaveLength(2)
    expect(llm.calls.length).toBe(1)
    expect(llm.calls[0]!.system).toContain('SOP synthesizer')
  })

  it('throws when LLM response lacks the structured_output tool call', async () => {
    const llm: LLMClient = { async complete() { return { text: 'no tool call here' } } }
    const ultra = new UltraExpertise({ client: llm })
    await expect(ultra.analyze('x')).rejects.toThrow(/structured_output/i)
  })

  it('throws when analysis output fails AJV validation', async () => {
    const llm: LLMClient = {
      async complete() {
        return {
          text: '',
          tool_calls: [
            { name: 'structured_output', input: { name: 'BAD UPPER', description: 'x', phases: [], state_fields: [], node_sketches: [] } },
          ],
        }
      },
    }
    const ultra = new UltraExpertise({ client: llm })
    await expect(ultra.analyze('x')).rejects.toThrow(/validation/i)
  })
})
```

- [ ] **Step 2: Confirm RED**

```bash
pnpm exec vitest run packages/authoring/tests/ultra.test.ts 2>&1 | tail -15
```

- [ ] **Step 3: Implement `src/ultra.ts`**

```ts
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv from 'ajv'
import type { LLMClient, LLMTool } from '@openexpertise/core'
import {
  ANALYSIS_SCHEMA,
  SYNTHESIS_SCHEMA,
  type AnalysisOutput,
  type SynthesisOutput,
} from './schemas.js'

const HERE = dirname(fileURLToPath(import.meta.url))

export interface UltraExpertiseOpts {
  client: LLMClient
  model?: string
}

export interface UltraResult {
  analysis: AnalysisOutput
  synthesis: SynthesisOutput
}

export class UltraExpertise {
  private readonly ajv = new Ajv({ allErrors: true, strict: false })
  private readonly validateAnalysis = this.ajv.compile(ANALYSIS_SCHEMA)
  private readonly validateSynthesis = this.ajv.compile(SYNTHESIS_SCHEMA)

  constructor(private readonly opts: UltraExpertiseOpts) {}

  async analyze(taskDescription: string): Promise<AnalysisOutput> {
    const systemPath = resolve(HERE, 'prompts/analyzer.md')
    const system = readFileSync(systemPath, 'utf8')
    const tool: LLMTool = {
      name: 'structured_output',
      description: 'Return the structured analysis matching the schema',
      input_schema: ANALYSIS_SCHEMA as unknown as Record<string, unknown>,
    }
    const result = await this.opts.client.complete({
      model: this.opts.model ?? 'claude-sonnet-4-6',
      system,
      messages: [{ role: 'user', content: taskDescription }],
      tools: [tool],
      max_tokens: 8192,
    })
    const call = result.tool_calls?.find((c) => c.name === 'structured_output')
    if (!call) {
      throw new Error(
        'UltraExpertise.analyze: LLM did not return a structured_output tool call',
      )
    }
    const data = call.input
    if (!this.validateAnalysis(data)) {
      const msgs = (this.validateAnalysis.errors ?? []).map(
        (e) => `${e.instancePath || '(root)'}: ${e.message ?? 'invalid'}`,
      )
      throw new Error(`UltraExpertise.analyze: AJV validation failed: ${msgs.join(', ')}`)
    }
    return data as AnalysisOutput
  }

  async synthesize(
    taskDescription: string,
    analysis: AnalysisOutput,
  ): Promise<SynthesisOutput> {
    const systemPath = resolve(HERE, 'prompts/synthesizer.md')
    const system = readFileSync(systemPath, 'utf8')
    const tool: LLMTool = {
      name: 'structured_output',
      description: 'Return the synthesized experience.yaml + supporting files',
      input_schema: SYNTHESIS_SCHEMA as unknown as Record<string, unknown>,
    }
    const userPayload = {
      task: taskDescription,
      analysis,
    }
    const result = await this.opts.client.complete({
      model: this.opts.model ?? 'claude-sonnet-4-6',
      system,
      messages: [{ role: 'user', content: JSON.stringify(userPayload, null, 2) }],
      tools: [tool],
      max_tokens: 16384,
    })
    const call = result.tool_calls?.find((c) => c.name === 'structured_output')
    if (!call) {
      throw new Error(
        'UltraExpertise.synthesize: LLM did not return a structured_output tool call',
      )
    }
    const data = call.input
    if (!this.validateSynthesis(data)) {
      const msgs = (this.validateSynthesis.errors ?? []).map(
        (e) => `${e.instancePath || '(root)'}: ${e.message ?? 'invalid'}`,
      )
      throw new Error(`UltraExpertise.synthesize: AJV validation failed: ${msgs.join(', ')}`)
    }
    return data as SynthesisOutput
  }
}
```

- [ ] **Step 4: Confirm GREEN**

```bash
pnpm --filter @openexpertise/authoring build 2>&1 | tail -5
pnpm exec vitest run packages/authoring/tests/ultra.test.ts 2>&1 | tail -10
```

Expected: build succeeds (now that ultra.ts exists, src/index.ts compiles); 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/authoring/src/ultra.ts packages/authoring/tests/ultra.test.ts
git commit -m "feat(authoring): UltraExpertise analyze + synthesize phases"
```

---

## Task 6: `writer.ts` — safe file materialization (TDD)

**Files:**

- Create: `packages/authoring/src/writer.ts`
- Create: `packages/authoring/tests/writer.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeDraft, PathTraversalError } from '../src/writer.js'

let dir: string
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

describe('writeDraft', () => {
  it('writes experience.yaml + supporting files to the draft dir', async () => {
    dir = mkdtempSync(join(tmpdir(), 'oe-writer-'))
    const result = await writeDraft({
      draftDir: dir,
      experienceYaml: 'name: x\nversion: 0.1.0\n',
      files: [
        { path: 'tools/a.mjs', content: 'export default async () => ({})\n' },
        { path: 'prompts/b.md', content: '# b\n' },
        { path: 'README.md', content: '# x\n' },
      ],
    })
    expect(result.files_written.sort()).toEqual(
      ['README.md', 'experience.yaml', 'prompts/b.md', 'tools/a.mjs'].sort(),
    )
    expect(readFileSync(join(dir, 'experience.yaml'), 'utf8')).toContain('name: x')
    expect(readFileSync(join(dir, 'tools/a.mjs'), 'utf8')).toContain('export default')
    expect(existsSync(join(dir, 'prompts/b.md'))).toBe(true)
  })

  it('rejects absolute paths in files[]', async () => {
    dir = mkdtempSync(join(tmpdir(), 'oe-writer-'))
    await expect(
      writeDraft({
        draftDir: dir,
        experienceYaml: 'name: x\n',
        files: [{ path: '/etc/passwd-clone', content: 'oops' }],
      }),
    ).rejects.toBeInstanceOf(PathTraversalError)
  })

  it('rejects parent-directory traversal', async () => {
    dir = mkdtempSync(join(tmpdir(), 'oe-writer-'))
    await expect(
      writeDraft({
        draftDir: dir,
        experienceYaml: 'name: x\n',
        files: [{ path: '../escape.txt', content: 'x' }],
      }),
    ).rejects.toBeInstanceOf(PathTraversalError)
  })

  it('rejects paths attempting to escape via normalization', async () => {
    dir = mkdtempSync(join(tmpdir(), 'oe-writer-'))
    await expect(
      writeDraft({
        draftDir: dir,
        experienceYaml: 'name: x\n',
        files: [{ path: 'a/../../escape.txt', content: 'x' }],
      }),
    ).rejects.toBeInstanceOf(PathTraversalError)
  })

  it('creates parent directories as needed', async () => {
    dir = mkdtempSync(join(tmpdir(), 'oe-writer-'))
    await writeDraft({
      draftDir: dir,
      experienceYaml: 'name: x\n',
      files: [{ path: 'deep/nested/file.txt', content: 'ok' }],
    })
    expect(readFileSync(join(dir, 'deep/nested/file.txt'), 'utf8')).toBe('ok')
  })
})
```

- [ ] **Step 2: Confirm RED**

```bash
pnpm exec vitest run packages/authoring/tests/writer.test.ts 2>&1 | tail -10
```

- [ ] **Step 3: Implement `src/writer.ts`**

```ts
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve, relative } from 'node:path'

export class PathTraversalError extends Error {
  constructor(public readonly attemptedPath: string) {
    super(`writeDraft rejected unsafe path: "${attemptedPath}"`)
    this.name = 'PathTraversalError'
  }
}

export interface WriteDraftOpts {
  draftDir: string
  experienceYaml: string
  files: Array<{ path: string; content: string }>
}

export interface WriteDraftResult {
  draftDir: string
  files_written: string[]
}

export async function writeDraft(opts: WriteDraftOpts): Promise<WriteDraftResult> {
  const absRoot = resolve(opts.draftDir)
  mkdirSync(absRoot, { recursive: true })

  const written: string[] = []

  // experience.yaml is always at the root.
  const yamlAbs = join(absRoot, 'experience.yaml')
  writeFileSync(yamlAbs, opts.experienceYaml)
  written.push('experience.yaml')

  for (const f of opts.files) {
    if (isAbsolute(f.path)) {
      throw new PathTraversalError(f.path)
    }
    const abs = resolve(absRoot, f.path)
    const rel = relative(absRoot, abs)
    if (rel.startsWith('..') || isAbsolute(rel)) {
      throw new PathTraversalError(f.path)
    }
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, f.content)
    written.push(rel)
  }

  return { draftDir: absRoot, files_written: written }
}
```

- [ ] **Step 4: Confirm GREEN**

```bash
pnpm --filter @openexpertise/authoring build 2>&1 | tail -3
pnpm exec vitest run packages/authoring/tests/writer.test.ts 2>&1 | tail -10
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/authoring/src/writer.ts packages/authoring/tests/writer.test.ts
git commit -m "feat(authoring): writeDraft with path-traversal safety"
```

---

## Task 7: End-to-end `UltraExpertise.author()` (TDD)

**Files:**

- Modify: `packages/authoring/src/ultra.ts`
- Modify: `packages/authoring/tests/ultra.test.ts`

This task adds an `author()` method that orchestrates analyze + synthesize + write + validate. The result is a fully-baked draft on disk.

- [ ] **Step 1: Append the failing test**

Append to `packages/authoring/tests/ultra.test.ts`:

```ts
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('UltraExpertise.author end-to-end', () => {
  let tmp: string
  afterEach(() => {
    if (tmp) rmSync(tmp, { recursive: true, force: true })
  })

  it('runs analyze + synthesize + writeDraft and returns a draft path', async () => {
    tmp = mkdtempSync(join(tmpdir(), 'oe-author-'))
    const llm = new ScriptedLLM(ANALYSIS, SYNTHESIS)
    const ultra = new UltraExpertise({ client: llm })
    const result = await ultra.author({
      taskDescription: 'say hi',
      rootDir: tmp,
    })
    expect(result.analysis.name).toBe('hello-author')
    expect(result.synthesis.files).toHaveLength(2)
    expect(result.draftDir).toMatch(/hello-author$/)
    expect(result.files_written).toContain('experience.yaml')
    expect(result.validation.valid).toBe(true)
    // experience.yaml landed
    const yaml = readFileSync(join(result.draftDir, 'experience.yaml'), 'utf8')
    expect(yaml).toContain('hello-author')
  })

  it('reports validation errors but still writes the draft', async () => {
    tmp = mkdtempSync(join(tmpdir(), 'oe-author-bad-'))
    const badSynth = {
      ...SYNTHESIS,
      experience_yaml: `name: bad\n`, // missing version/state/graph → invalid
    }
    const llm = new ScriptedLLM(ANALYSIS, badSynth)
    const ultra = new UltraExpertise({ client: llm })
    const result = await ultra.author({
      taskDescription: 'say hi',
      rootDir: tmp,
    })
    expect(result.validation.valid).toBe(false)
    expect(result.validation.errors?.length ?? 0).toBeGreaterThan(0)
    // Files still written so user can inspect
    expect(result.files_written).toContain('experience.yaml')
  })
})
```

Also add the imports needed at the top (`afterEach`):

```ts
import { describe, it, expect, afterEach } from 'vitest'
```

(Replace the existing `import { describe, it, expect } from 'vitest'` line.)

- [ ] **Step 2: Confirm RED**

```bash
pnpm exec vitest run packages/authoring/tests/ultra.test.ts 2>&1 | tail -15
```

Expected: FAIL — `ultra.author` does not exist.

- [ ] **Step 3: Extend `src/ultra.ts`**

Add these imports at the top (next to existing imports):

```ts
import { join } from 'node:path'
import {
  parseExperienceYaml,
  validateExperienceSpec,
  ValidationError,
} from '@openexpertise/schema'
import { writeDraft, type WriteDraftResult } from './writer.js'
import { slugify } from './slug.js'
```

Add this method to the class body (inside `UltraExpertise`):

```ts
async author(opts: {
  taskDescription: string
  rootDir: string
  draftSlug?: string
}): Promise<UltraResult & WriteDraftResult & { validation: { valid: boolean; errors?: string[] } }> {
  const analysis = await this.analyze(opts.taskDescription)
  const synthesis = await this.synthesize(opts.taskDescription, analysis)
  const slug = opts.draftSlug ?? slugify(analysis.name)
  const draftDir = join(opts.rootDir, slug)
  const writeResult = await writeDraft({
    draftDir,
    experienceYaml: synthesis.experience_yaml,
    files: synthesis.files,
  })
  const validation = this.validateGeneratedYaml(synthesis.experience_yaml)
  return { analysis, synthesis, ...writeResult, validation }
}

private validateGeneratedYaml(source: string): { valid: boolean; errors?: string[] } {
  try {
    const spec = parseExperienceYaml(source)
    validateExperienceSpec(spec)
    return { valid: true }
  } catch (err) {
    if (err instanceof ValidationError) {
      return { valid: false, errors: err.errors.length > 0 ? err.errors : [err.message] }
    }
    return { valid: false, errors: [(err as Error).message] }
  }
}
```

- [ ] **Step 4: Confirm GREEN**

```bash
pnpm --filter @openexpertise/authoring build 2>&1 | tail -3
pnpm exec vitest run packages/authoring/tests/ultra.test.ts 2>&1 | tail -10
```

Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/authoring/src/ultra.ts packages/authoring/tests/ultra.test.ts
git commit -m "feat(authoring): UltraExpertise.author end-to-end (analyze + synthesize + write + validate)"
```

---

## Task 8: CLI `oe ultra` command (TDD)

**Files:**

- Modify: `packages/cli/package.json`
- Modify: `packages/cli/tsconfig.json`
- Create: `packages/cli/src/commands/ultra.ts`
- Modify: `packages/cli/src/index.ts`

- [ ] **Step 1: Add workspace dep + project ref**

In `packages/cli/package.json`, add to `dependencies`:

```json
"@openexpertise/authoring": "workspace:*"
```

In `packages/cli/tsconfig.json`, add to `references`:

```json
{ "path": "../authoring" }
```

Run `pnpm install`.

- [ ] **Step 2: Create `packages/cli/src/commands/ultra.ts`**

```ts
import { resolve } from 'node:path'
import type { Logger } from 'pino'
import type { LLMClient } from '@openexpertise/core'
import { UltraExpertise } from '@openexpertise/authoring'
import {
  makeLLMClient,
  resolveLLMProvider,
  defaultModelFor,
} from '../llm-factory.js'

export interface UltraOpts {
  taskDescription: string
  draftRoot: string
  logger: Logger
  llm?: string
}

export async function ultraCommand(opts: UltraOpts): Promise<number> {
  const provider = resolveLLMProvider(opts.llm !== undefined ? { flag: opts.llm } : {})
  const model = defaultModelFor(provider)
  let cached: LLMClient | null = null
  const llm: LLMClient = {
    async complete(completeOpts) {
      if (!cached) cached = await makeLLMClient(provider)
      return cached.complete(completeOpts)
    },
  }

  const ultra = new UltraExpertise({ client: llm, model })
  const rootDir = resolve(opts.draftRoot)

  opts.logger.info({ task: opts.taskDescription }, 'ultraexpertise: starting analyze phase')
  const result = await ultra.author({
    taskDescription: opts.taskDescription,
    rootDir,
  })

  opts.logger.info(
    {
      slug: result.analysis.name,
      draftDir: result.draftDir,
      phases: result.analysis.phases.map((p) => p.id),
      nodes: result.analysis.node_sketches.map((n) => `${n.id}(${n.kind})`),
      open_questions: result.analysis.open_questions ?? [],
      files_written: result.files_written,
      valid: result.validation.valid,
      validation_errors: result.validation.errors ?? [],
      next_steps: result.synthesis.next_steps ?? [],
    },
    'ultraexpertise: draft created',
  )

  if (!result.validation.valid) {
    opts.logger.warn(
      { errors: result.validation.errors },
      'draft did not pass oe validate — inspect and fix before running',
    )
    return 2
  }

  opts.logger.info(
    {
      run: `oe run ${result.draftDir}`,
      promote: `mv ${result.draftDir} examples/${result.analysis.name}`,
    },
    'next: run or promote',
  )

  return 0
}
```

- [ ] **Step 3: Register the command in `packages/cli/src/index.ts`**

Add the import at the top with the other command imports:

```ts
import { ultraCommand } from './commands/ultra.js'
```

Add the command registration (after the existing `evolve` registration; preserve the rest):

```ts
program
  .command('ultra')
  .description('LLM-author a new experience from a natural-language task description')
  .argument('<task>', 'the task description (natural language)')
  .option('--draft-root <dir>', 'directory for the draft', '.openexpertise/drafts')
  .option('--llm <provider>', 'LLM provider: anthropic | openai (auto-detected from env)')
  .action(
    async (
      task: string,
      cmdOpts: { draftRoot: string; llm?: string },
      cmd: Command,
    ) => {
      const root = cmd.optsWithGlobals<{ logFormat: string; logLevel: string }>()
      const logger = makeLogger({ pretty: root.logFormat === 'pretty', level: root.logLevel })
      process.exit(
        await ultraCommand({
          taskDescription: task,
          draftRoot: cmdOpts.draftRoot,
          logger,
          ...(cmdOpts.llm !== undefined ? { llm: cmdOpts.llm } : {}),
        }),
      )
    },
  )
```

- [ ] **Step 4: Build + smoke**

```bash
pnpm --filter @openexpertise/cli build 2>&1 | tail -5
node packages/cli/dist/bin.js ultra --help 2>&1 | tail -10
```

Expected: `--help` lists the `<task>` argument and the `--draft-root` / `--llm` options. No error.

- [ ] **Step 5: Full typecheck + tests**

```bash
pnpm typecheck 2>&1 | tail -3
pnpm test 2>&1 | tail -5
```

Expected: clean; test count grew (authoring's tests now run): 164 baseline + 7 slug + 4 ultra phase + 5 writer + 2 author = **182 passing**.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/package.json packages/cli/tsconfig.json packages/cli/src/commands/ultra.ts packages/cli/src/index.ts pnpm-lock.yaml
git commit -m "feat(cli): oe ultra command — LLM-author a new experience"
```

---

## Task 9: MCP tool `oe_ultra`

**Files:**

- Modify: `packages/mcp-server/package.json`
- Modify: `packages/mcp-server/tsconfig.json`
- Create: `packages/mcp-server/src/tools/ultra.ts`
- Modify: `packages/mcp-server/src/server.ts`
- Modify: `packages/mcp-server/tests/server.test.ts`

- [ ] **Step 1: Add workspace dep + project ref**

In `packages/mcp-server/package.json`, add to `dependencies`:

```json
"@openexpertise/authoring": "workspace:*"
```

In `packages/mcp-server/tsconfig.json`, add to `references`:

```json
{ "path": "../authoring" }
```

Run `pnpm install`.

- [ ] **Step 2: Extend the test**

UPDATE the listTools assertion in `tests/server.test.ts` to include 'oe_ultra' in the expected names (now 6 total: `['oe_evolve', 'oe_inspect', 'oe_run', 'oe_state', 'oe_ultra', 'oe_validate']`).

APPEND a new test:

```ts
it('oe_ultra returns a "needs LLM" error when no LLM env var is set', async () => {
  const { client } = await connectClient()
  const prevA = process.env.ANTHROPIC_API_KEY
  const prevO = process.env.OPENAI_API_KEY
  delete process.env.ANTHROPIC_API_KEY
  delete process.env.OPENAI_API_KEY
  try {
    const dir = mkdtempSync(join(tmpdir(), 'oe-mcp-ultra-'))
    try {
      const result = await client.callTool({
        name: 'oe_ultra',
        arguments: { task: 'say hi', draft_root: dir },
      })
      expect(result.isError).toBe(true)
      const content = result.content as Array<{ type: string; text: string }>
      expect(content[0]!.text).toMatch(/ANTHROPIC_API_KEY|OPENAI_API_KEY/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  } finally {
    if (prevA !== undefined) process.env.ANTHROPIC_API_KEY = prevA
    if (prevO !== undefined) process.env.OPENAI_API_KEY = prevO
  }
})
```

- [ ] **Step 3: Confirm RED**

```bash
pnpm exec vitest run packages/mcp-server/tests/server.test.ts 2>&1 | tail -10
```

- [ ] **Step 4: Create `src/tools/ultra.ts`**

```ts
import { resolve } from 'node:path'
import type { LLMClient } from '@openexpertise/core'
import { UltraExpertise } from '@openexpertise/authoring'
import {
  makeLLMClient,
  resolveLLMProvider,
  defaultModelFor,
} from '@openexpertise/cli/llm-factory'
import type { ToolHandler } from './types.js'

export const ultraTool: ToolHandler = {
  name: 'oe_ultra',
  description:
    'Author a new OpenExpertise experience from a natural-language task description. ' +
    'LLM analyzes the task, synthesizes experience.yaml + supporting files, writes them ' +
    'to a draft directory, and validates. Returns { draft_dir, slug, analysis, synthesis, validation }.',
  inputSchema: {
    type: 'object',
    required: ['task'],
    properties: {
      task: { type: 'string', description: 'Natural-language description of the SOP to author' },
      draft_root: {
        type: 'string',
        description: 'Directory for the draft (default: .openexpertise/drafts in CWD)',
      },
      llm: { type: 'string', enum: ['anthropic', 'openai'] },
    },
  },
  async call(args) {
    const task = args['task']
    if (typeof task !== 'string') throw new Error('task is required')
    const draftRoot = typeof args['draft_root'] === 'string'
      ? args['draft_root']
      : resolve('.openexpertise/drafts')

    const llmFlag = typeof args['llm'] === 'string' ? (args['llm'] as string) : undefined
    const provider = resolveLLMProvider(llmFlag !== undefined ? { flag: llmFlag } : {})
    const model = defaultModelFor(provider)
    let cached: LLMClient | null = null
    const llm: LLMClient = {
      async complete(completeOpts) {
        if (!cached) cached = await makeLLMClient(provider)
        return cached.complete(completeOpts)
      },
    }

    const ultra = new UltraExpertise({ client: llm, model })
    const result = await ultra.author({ taskDescription: task, rootDir: resolve(draftRoot) })
    return {
      draft_dir: result.draftDir,
      slug: result.analysis.name,
      analysis: result.analysis,
      synthesis: {
        // omit file contents from MCP response — they're already on disk
        file_paths: result.synthesis.files.map((f) => f.path),
        next_steps: result.synthesis.next_steps ?? [],
      },
      validation: result.validation,
      files_written: result.files_written,
    }
  },
}
```

- [ ] **Step 5: Register in `server.ts`**

Add import:

```ts
import { ultraTool } from './tools/ultra.js'
```

Update ALL_TOOLS:

```ts
const ALL_TOOLS: ToolHandler[] = [
  validateTool,
  stateTool,
  inspectTool,
  runTool,
  evolveTool,
  ultraTool,
]
```

- [ ] **Step 6: Confirm GREEN**

```bash
pnpm --filter @openexpertise/mcp-server build 2>&1 | tail -3
pnpm exec vitest run packages/mcp-server/tests/server.test.ts 2>&1 | tail -10
```

Expected: 8 tests pass (was 7 + 1 new).

- [ ] **Step 7: Commit**

```bash
git add packages/mcp-server/package.json packages/mcp-server/tsconfig.json packages/mcp-server/src/tools/ultra.ts packages/mcp-server/src/server.ts packages/mcp-server/tests/server.test.ts pnpm-lock.yaml
git commit -m "feat(mcp-server): oe_ultra tool — author experiences from MCP clients"
```

---

## Task 10: Claude Code `/ultraexpertise` slash command

**Files:**

- Create: `packages/skill-experience-creator/commands/ultraexpertise.md`
- Modify: `packages/skill-experience-creator/README.md`
- Modify: `packages/skill-experience-creator/SKILL.md` (small note)

The slash command file follows the `~/.claude/commands/` convention: a markdown file with frontmatter + a body. When the user types `/ultraexpertise <task>` in Claude Code, the body is loaded as the system prompt and `$ARGUMENTS` is substituted with the task text.

- [ ] **Step 1: Create the slash command file**

```markdown
---
name: ultraexpertise
description: One-shot LLM-authored OpenExpertise SOP. Drives `oe ultra` and reports the result.
---

You are the user's authoring assistant for OpenExpertise. The user has invoked `/ultraexpertise` with the following task description:

$ARGUMENTS

## Your job

1. Verify `oe` is on PATH (`which oe`). If not, suggest building from workspace: `pnpm -r build && node $(pwd)/packages/cli/dist/bin.js ultra "..."`.
2. Decide the draft directory. If the user is inside an OpenExpertise repo (an `experience.yaml` exists nearby), use `.openexpertise/drafts/`. Otherwise use `./openexpertise-drafts/`.
3. Run `oe ultra "<task>" --draft-root <chosen draft root>`. Surface the structured result to the user:
   - The slug and draft path
   - The phases and node kinds the LLM chose
   - Any open questions
   - Whether validation passed
4. After the draft lands, summarize what to do next:
   - `oe run <draft path>` to try it.
   - `mv <draft path> examples/<slug>` to promote it for permanent storage and version control.
   - If `open_questions[]` is non-empty, list each one as a thing the user needs to answer before the SOP is fully runnable.
5. If validation failed, read the generated `experience.yaml` and explain WHAT the schema rejected, in plain English. Offer to fix it.

## Boundaries

- Do not run `oe ultra` without `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` set. Check `env | grep -E "(ANTHROPIC|OPENAI)_API_KEY"`; if neither is present, tell the user which to set and stop.
- Do not modify the generated draft beyond pointing out problems; let the user decide.
- Do not promote (mv) the draft on the user's behalf.

Reply concisely. The user wants the draft + a clear next action, not a wall of text.
```

- [ ] **Step 2: Update `packages/skill-experience-creator/README.md`**

Append after the existing content:

```markdown

## Slash command

The package also ships a Claude Code slash command at `commands/ultraexpertise.md`. After installing:

```bash
mkdir -p ~/.claude/commands
cp packages/skill-experience-creator/commands/ultraexpertise.md ~/.claude/commands/
```

You can then type `/ultraexpertise <task description>` inside any Claude Code session and the assistant will drive `oe ultra` for you, surfacing the analysis + draft path + open questions.
```

- [ ] **Step 3: Add a small mention in `SKILL.md`**

Read the existing `SKILL.md` and add this paragraph somewhere logical (e.g., near the bottom under "Related"):

```markdown
For a one-shot autonomous version of this workflow that bypasses the back-and-forth — the LLM analyzes the task, decides on the structure, and writes the SOP in one go — install the `/ultraexpertise` slash command from `commands/ultraexpertise.md`.
```

- [ ] **Step 4: Verify package.json `files` includes commands/**

In `packages/skill-experience-creator/package.json`, the `files` array should include `commands` so the slash command ships when published. Update the existing `files: ["SKILL.md", "references", "assets", "scripts"]` to:

```json
"files": ["SKILL.md", "references", "assets", "scripts", "commands"]
```

- [ ] **Step 5: Commit**

```bash
git add packages/skill-experience-creator/commands/ packages/skill-experience-creator/README.md packages/skill-experience-creator/SKILL.md packages/skill-experience-creator/package.json
git commit -m "feat(skill-experience-creator): /ultraexpertise slash command for Claude Code"
```

---

## Task 11: e2e test — `oe ultra` produces a runnable draft

**Files:**

- Create: `e2e/ultraexpertise.e2e.test.ts`
- Modify: `e2e/package.json`

- [ ] **Step 1: Add e2e workspace dep**

In `e2e/package.json`, add to `dependencies`:

```json
"@openexpertise/authoring": "workspace:*"
```

Run `pnpm install`.

- [ ] **Step 2: Write the test**

```ts
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { LLMClient, LLMCompleteOpts } from '@openexpertise/core'
import { UltraExpertise } from '@openexpertise/authoring'
import { parseExperienceYaml } from '@openexpertise/schema'
import { DispatcherRegistry, EventBus, runExperience } from '@openexpertise/core'
import { ToolDispatcher } from '@openexpertise/node-kinds-tool'

class CannedLLM implements LLMClient {
  constructor(
    private analysis: unknown,
    private synthesis: unknown,
  ) {}
  async complete(opts: LLMCompleteOpts) {
    if (opts.system?.includes('SOP architect')) {
      return { text: '', tool_calls: [{ name: 'structured_output', input: this.analysis }] }
    }
    return { text: '', tool_calls: [{ name: 'structured_output', input: this.synthesis }] }
  }
}

let dir: string
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

describe('ultraexpertise end-to-end', () => {
  it('authored draft is structurally valid and runnable', async () => {
    dir = mkdtempSync(join(tmpdir(), 'oe-e2e-ultra-'))
    const analysis = {
      name: 'e2e-author',
      description: 'A trivial generated SOP',
      phases: [{ id: 'main' }],
      state_fields: [{ name: 'greeting', type: 'string' }],
      node_sketches: [{ id: 'greet', kind: 'tool', phase: 'main', purpose: 'emit greeting' }],
    }
    const synthesis = {
      experience_yaml: `name: e2e-author
version: 0.1.0
state:
  schema:
    greeting: { type: string }
phases:
  - { id: main }
graph:
  nodes:
    - id: greet
      kind: tool
      phase: main
      impl: ./tools/greet.mjs
      writes: [greeting]
  edges: []
`,
      files: [
        {
          path: 'tools/greet.mjs',
          content: `export default async function () {
  return { state_delta: { greeting: 'hello from authored draft' } }
}
`,
        },
        { path: 'README.md', content: '# e2e-author\n' },
      ],
      next_steps: [],
    }

    const llm = new CannedLLM(analysis, synthesis)
    const ultra = new UltraExpertise({ client: llm })
    const result = await ultra.author({ taskDescription: 'greet', rootDir: dir })

    expect(result.validation.valid).toBe(true)
    expect(result.files_written).toContain('experience.yaml')
    expect(result.files_written).toContain('tools/greet.mjs')

    // The generated draft must actually be runnable end-to-end.
    const spec = parseExperienceYaml(
      readFileSync(join(result.draftDir, 'experience.yaml'), 'utf8'),
    )
    const dispatchers = new DispatcherRegistry()
    dispatchers.register(new ToolDispatcher())
    const runResult = await runExperience({
      spec,
      experienceDir: result.draftDir,
      dispatchers,
      events: new EventBus(),
      args: {},
    })
    expect(runResult.status).toBe('success')
    expect(runResult.finalState.greeting).toBe('hello from authored draft')
  })
})
```

- [ ] **Step 3: Run the e2e**

```bash
pnpm exec vitest run e2e/ultraexpertise.e2e.test.ts 2>&1 | tail -10
```

Expected: 1 test passes.

- [ ] **Step 4: Run full suite**

```bash
pnpm test 2>&1 | tail -5
```

Expected: 183 (after Task 9's MCP test) + 1 = **184 passing**.

- [ ] **Step 5: Commit**

```bash
git add e2e/ultraexpertise.e2e.test.ts e2e/package.json pnpm-lock.yaml
git commit -m "test(e2e): authored ultraexpertise draft validates and runs end-to-end"
```

---

## Task 12: `docs/ultraexpertise.md`

**Files:**

- Create: `docs/ultraexpertise.md`

Use the Write tool. Triple-backticks are LITERAL.

- [ ] **Step 1: Write the doc**

```markdown
# `/ultraexpertise` and `oe ultra` — one-keyword SOP authoring

`/ultraexpertise <task>` (Claude Code slash command) and `oe ultra "<task>"` (CLI) are the same thing: an LLM-driven, two-phase pipeline that turns a natural-language task description into a complete, validated OpenExpertise experience.

This is OpenExpertise's analogue of Claude Code's `/workflows` + `ultrawork` keyword — with a structural difference: the output is a **declarative YAML graph + tool stubs + prompts**, version-controllable from day one, ready to be promoted into your repo's `examples/` and improved via the [evolution advisor](./mcp-server.md).

## How it works

### Phase 1 — Analysis

The LLM reads your task and returns a structured plan:

- `name`: slug for the experience.
- `phases`: ordered phases (default: collect / analyze / verify / report).
- `state_fields`: the SQLite blackboard schema.
- `node_sketches`: one entry per node — id, kind (`tool` / `agent` / `skill` / `dataset` / `experience` / `cli-agent`), purpose, optional fan-out.
- `open_questions`: anything the user has to fill in (credentials, choice lists, etc.).

### Phase 2 — Synthesis

A second LLM call turns the plan into a runnable artifact:

- `experience_yaml`: the full YAML, validated against OpenExpertise's schema.
- `files[]`: every supporting file (`tools/*.mjs` stubs, `prompts/*.md`, a top-level `README.md`).
- `next_steps[]`: concrete actions.

### Phase 3 — Materialization

The writer creates the draft directory and writes every file safely (path-traversal rejected, parent dirs created). Then `oe validate` runs against the result.

### Phase 4 — User decision

The CLI prints the slug, draft path, open questions, and next-step commands. You can:

- `oe run <draft path>` to try it.
- `mv <draft path> examples/<slug>` to promote it (entirely your choice — no automatic promotion).
- Run it, then `oe evolve <run-id>` to get advisor proposals on top of what was authored.

## CLI

```bash
oe ultra "Review pull requests against SOC2 controls and produce a risk score"
# → writes .openexpertise/drafts/soc2-pr-review/
```

Flags:

- `--draft-root <dir>`: where to put the draft (default `.openexpertise/drafts`).
- `--llm <anthropic|openai>`: provider override (auto-detected from env).

Requires `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`.

## Claude Code slash command

Install once:

```bash
mkdir -p ~/.claude/commands
cp packages/skill-experience-creator/commands/ultraexpertise.md ~/.claude/commands/
```

Then in any Claude Code session:

```
/ultraexpertise Review my repo for OWASP Top 10 issues
```

The assistant runs `oe ultra` and reports back.

## MCP tool

From inside any MCP-aware CLI:

```
oe_ultra({ task: "..." })
```

Returns `{ slug, draft_dir, analysis, synthesis: { file_paths, next_steps }, validation, files_written }`. The full file contents are NOT in the response — they're on disk at `draft_dir`.

## Composition with the evolution advisor

The same LLM provider drives both `oe ultra` and `oe evolve`. After you run the authored experience once, the advisor reads the events + state diff and proposes upgrades — additional dimensions, tuned retry policies, missing tools. Author → run → evolve is one continuous loop.

## V1 limitations

- **No iteration.** Each `oe ultra` call is a fresh two-phase pipeline. The next iteration is via `oe evolve` on a real run, not a `oe ultra --refine` flag.
- **No prompt customization.** The analyzer / synthesizer system prompts ship with the package; users can fork the package to customize.
- **Tool stubs may need real wiring.** Generated `tools/*.mjs` typically include a `// TODO:` marker for the real integration point (API call, credentials, etc.). They're runnable as fixtures but not production-ready until you fill them in.
- **No automatic promotion.** `mv draft examples/` is intentional — moving to permanent storage is a user decision.
```

- [ ] **Step 2: Commit**

```bash
git add docs/ultraexpertise.md
git commit -m "docs: ultraexpertise reference"
```

---

## Task 13: README + progress log + final verification

**Files:**

- Modify: `README.md` (root)
- Modify: `docs/superpowers/overnight-progress.md`

- [ ] **Step 1: Add "Why" bullet to root README**

In `README.md`, find the `## Why OpenExpertise` section. After the existing bullets, append:

```markdown
- **One-keyword authoring.** `oe ultra "<task>"` (or `/ultraexpertise <task>` inside Claude Code) runs an LLM agent that analyzes the task, synthesizes a complete `experience.yaml` + tool stubs + prompts, and writes a validated draft. The same LLM that authored the SOP can then evolve it after the first run. See [`docs/ultraexpertise.md`](docs/ultraexpertise.md).
```

- [ ] **Step 2: Append progress log entry**

In `docs/superpowers/overnight-progress.md`, append:

```markdown

---

## Plan A (V2) — Ultraexpertise (2026-05-26)

Branch: `feat/ultraexpertise` (off `main`)
Spec: `docs/superpowers/specs/2026-05-26-ultraexpertise-and-v2-polish-design.md` (Plan A section)
Plan: `docs/superpowers/plans/2026-05-26-ultraexpertise.md`

### What shipped

| Area | Result |
|---|---|
| New package | `@openexpertise/authoring` — `UltraExpertise` (analyze + synthesize + write + validate) |
| CLI | `oe ultra "<task>" [--draft-root <dir>] [--llm <provider>]` |
| MCP | `oe_ultra` tool — same engine, exposed to Claude Code / Codex / Gemini |
| Slash command | `/ultraexpertise <task>` shipped with `skill-experience-creator/commands/` |
| Tests | 7 slug + 4 ultra phase + 5 writer + 2 author + 1 mcp + 1 e2e = 20 new (183 total) |
| Docs | `docs/ultraexpertise.md` reference |

### Architectural note

The same `llm-factory` underlies all three of: `oe run` (when agent/skill/cli-agent nodes fire), `oe evolve` (advisor), and now `oe ultra` (author). Author → run → evolve is one closed loop.

### Next concrete actions

1. Merge `feat/ultraexpertise` into `main`.
2. Manually smoke with a real API key: `export ANTHROPIC_API_KEY=...; node packages/cli/dist/bin.js ultra "summarize the docs in this repo"` — verify the draft validates and the YAML is sensible.
3. Move to Plan B (TUI upgrade — live tokens + activity).
```

- [ ] **Step 3: Final verification**

```bash
pnpm clean && pnpm install && pnpm -r build 2>&1 | tail -5
pnpm typecheck 2>&1 | tail -3
pnpm lint 2>&1 | tail -3
pnpm format:check 2>&1 | tail -3
pnpm test 2>&1 | tail -5
```

Expected: build/typecheck/lint/format clean; **184 tests passing**.

If `pnpm format:check` reports issues, run `pnpm format` and commit separately as `style: prettier`.

- [ ] **Step 4: Commit + log**

```bash
git add README.md docs/superpowers/overnight-progress.md
git commit -m "docs: README ultraexpertise bullet + Plan A V2 progress"
git log --oneline main..HEAD | head -20
```
