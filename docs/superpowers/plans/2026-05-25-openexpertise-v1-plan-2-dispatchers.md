# OpenExpertise V1 — Plan 2: Heterogeneous Dispatchers + on_error

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the four remaining node-kind dispatchers (`agent`, `skill`, `dataset`, `experience`) plus per-node `on_error` policy enforcement in the scheduler. After Plan 2, `oe run` can execute experiences that combine deterministic tools, LLM-backed agents/skills, dataset loaders, and nested sub-experiences — all under the same sequential scheduler.

**Architecture:** Each new node kind ships as its own `@openexpertise/node-kinds-*` package, conforming to the `NodeDispatcher` interface introduced in Plan 1. A new `LLMClient` interface in `@openexpertise/core` decouples the LLM call site from the SDK, making both `AgentDispatcher` and `SkillDispatcher` mockable via dependency injection. `on_error` policies live in `SequentialScheduler` — the dispatcher contract is unchanged.

**Tech Stack:**
- `@anthropic-ai/sdk` ^0.30+ — official Anthropic Node SDK (for `AnthropicLLMClient` impl)
- `gray-matter` ^4.0+ — markdown frontmatter parser (for SKILL.md loading)
- `csv-parse` ^5.5+ — CSV parser (for `dataset` source type `file` with `format: csv`)
- everything else inherited from Plan 1: TypeScript 5.5+, vitest, AJV, better-sqlite3, commander, pino

**Plan 2 scope explicitly excludes** (covered by later plans):
- Fan-out / for-each, pipeline group, conditional edge, bounded loop, phase grouping → **Plan 3** (also lands the `review-branch` demo and Anthropic-mocked e2e)
- Cache + resume, TUI, remaining CLI commands (`init`, `state`, `reset-state`) → Plan 4
- Authoring skill (`experience-creator`) → Plan 5
- Evolution advisor + binary distribution → Plan 6
- Parquet dataset source, `mcp-resource` dataset source — deferred (no compelling V1 use case yet; can be added on demand)
- Shared-scope nested experiences (`state_scope: shared`) — V1 nesting is `isolated` only
- Vector-store datasets — out of V1 entirely (per spec §16)

---

## File structure

After Plan 2, the repo gains four new packages and a small set of files in existing packages:

```
/Users/xuxingcheng/SHLAB/github/OpenExpertise/
├── packages/
│   ├── core/
│   │   └── src/
│   │       ├── llm/
│   │       │   ├── client.ts                # NEW: LLMClient interface + types
│   │       │   └── prompt.ts                # NEW: {{placeholder}} interpolation helper
│   │       ├── graph/
│   │       │   └── scheduler.ts             # MODIFIED: on_error policy handling
│   │       └── index.ts                     # MODIFIED: export LLMClient + interpolatePrompt
│   ├── node-kinds-agent/                    # NEW package
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts                     # AgentDispatcher
│   │   │   └── anthropic-client.ts          # AnthropicLLMClient (real SDK impl)
│   │   └── tests/
│   │       ├── agent.test.ts                # AgentDispatcher unit tests (mocked LLMClient)
│   │       └── anthropic-client.test.ts     # AnthropicLLMClient mapping test
│   ├── node-kinds-skill/                    # NEW package
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts                     # SkillDispatcher
│   │   │   └── skill-loader.ts              # SKILL.md frontmatter + body loader
│   │   └── tests/
│   │       └── skill.test.ts
│   ├── node-kinds-dataset/                  # NEW package
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts                     # DatasetDispatcher
│   │   │   └── sources/
│   │   │       ├── file.ts                  # json/jsonl/csv loader
│   │   │       ├── sqlite.ts                # better-sqlite3 query
│   │   │       └── http.ts                  # fetch-based loader
│   │   └── tests/
│   │       └── dataset.test.ts
│   └── node-kinds-experience/               # NEW package
│       ├── package.json
│       ├── tsconfig.json
│       ├── src/
│       │   └── index.ts                     # ExperienceDispatcher (1-level recursion)
│       └── tests/
│           └── experience.test.ts
├── packages/cli/src/commands/run.ts         # MODIFIED: register all 4 new dispatchers
├── examples/
│   ├── agent-echo/                          # NEW: smallest agent example
│   │   ├── experience.yaml
│   │   ├── prompts/echo.md
│   │   └── README.md
│   └── dataset-aggregate/                   # NEW: dataset + tool pipeline
│       ├── experience.yaml
│       ├── data/sample.csv
│       ├── tools/aggregate.mjs
│       └── README.md
├── e2e/
│   └── multi-kind.e2e.test.ts               # NEW: exercises agent + dataset + tool + experience
└── packages/core/tests/
    └── scheduler-on-error.test.ts           # NEW: on_error policy tests
```

---

## Task 1: `LLMClient` interface and prompt-interpolation helper in `@openexpertise/core`

**Files:**
- Create: `packages/core/src/llm/client.ts`
- Create: `packages/core/src/llm/prompt.ts`
- Modify: `packages/core/src/index.ts` — re-export the new types and helper

- [ ] **Step 1.1: Write `packages/core/src/llm/client.ts`**

```ts
// LLMClient is the abstraction the LLM-backed dispatchers (agent, skill) call.
// Real impl lives in @openexpertise/node-kinds-agent (AnthropicLLMClient).
// Tests inject fake clients with canned responses.

export interface LLMMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface LLMTool {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

export interface LLMCompleteOpts {
  model: string
  system?: string
  messages: LLMMessage[]
  tools?: LLMTool[]
  max_tokens?: number
}

export interface LLMToolCall {
  name: string
  input: unknown
}

export interface LLMUsage {
  input_tokens: number
  output_tokens: number
}

export interface LLMCompleteResult {
  text: string
  tool_calls?: LLMToolCall[]
  usage?: LLMUsage
  stop_reason?: string
}

export interface LLMClient {
  complete(opts: LLMCompleteOpts): Promise<LLMCompleteResult>
}
```

- [ ] **Step 1.2: Write `packages/core/src/llm/prompt.ts`**

```ts
// Tiny {{placeholder}} interpolation. Used by AgentDispatcher and SkillDispatcher
// to fill prompt templates with values from the resolved input bundle.

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g

export interface InterpolateOpts {
  template: string
  values: Record<string, unknown>
  // When a placeholder is not in `values`, throw (default true) vs leave as-is (false).
  strict?: boolean
}

export function interpolatePrompt(opts: InterpolateOpts): string {
  const strict = opts.strict ?? true
  return opts.template.replace(PLACEHOLDER_RE, (match, key: string) => {
    if (!(key in opts.values)) {
      if (strict) {
        throw new Error(`Prompt placeholder "{{${key}}}" has no value in the input bundle`)
      }
      return match
    }
    const v = opts.values[key]
    if (typeof v === 'string') return v
    return JSON.stringify(v)
  })
}
```

- [ ] **Step 1.3: Write failing tests for both**

Create `packages/core/tests/llm-prompt.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { interpolatePrompt } from '../src/llm/prompt.js'

describe('interpolatePrompt', () => {
  it('replaces simple placeholders with string values', () => {
    expect(interpolatePrompt({ template: 'hi {{name}}', values: { name: 'Alice' } })).toBe('hi Alice')
  })

  it('JSON-stringifies non-string values', () => {
    expect(interpolatePrompt({ template: 'data: {{x}}', values: { x: [1, 2, 3] } }))
      .toBe('data: [1,2,3]')
  })

  it('throws on missing placeholder when strict', () => {
    expect(() => interpolatePrompt({ template: '{{absent}}', values: {} }))
      .toThrow(/placeholder "\{\{absent\}\}"/)
  })

  it('leaves missing placeholders intact when strict is false', () => {
    expect(interpolatePrompt({ template: '{{absent}}', values: {}, strict: false }))
      .toBe('{{absent}}')
  })

  it('handles multiple placeholders in one template', () => {
    expect(interpolatePrompt({
      template: '{{a}} + {{b}} = {{c}}',
      values: { a: 1, b: 2, c: 3 },
    })).toBe('1 + 2 = 3')
  })

  it('tolerates whitespace inside braces', () => {
    expect(interpolatePrompt({ template: '{{ name }}', values: { name: 'ok' } })).toBe('ok')
  })
})
```

- [ ] **Step 1.4: Run tests — confirm FAIL**

```bash
cd /Users/xuxingcheng/SHLAB/github/OpenExpertise
pnpm vitest run packages/core/tests/llm-prompt.test.ts
```

Expected: FAIL — `prompt.ts` doesn't exist yet at the path the test imports.

- [ ] **Step 1.5: After writing both files (Step 1.1 + 1.2), re-run**

```bash
pnpm vitest run packages/core/tests/llm-prompt.test.ts
```

Expected: PASS — 6/6.

- [ ] **Step 1.6: Update `packages/core/src/index.ts` to re-export**

Add these lines at the end of the existing exports:
```ts
export type {
  LLMClient,
  LLMCompleteOpts,
  LLMCompleteResult,
  LLMMessage,
  LLMTool,
  LLMToolCall,
  LLMUsage,
} from './llm/client.js'
export { interpolatePrompt } from './llm/prompt.js'
```

- [ ] **Step 1.7: Verify package typecheck**

```bash
pnpm --filter @openexpertise/core typecheck
```

Expected: 0 errors.

- [ ] **Step 1.8: Commit**

```bash
cd /Users/xuxingcheng/SHLAB/github/OpenExpertise
git add packages/core/src/llm/ packages/core/src/index.ts packages/core/tests/llm-prompt.test.ts
git commit -m "feat(core): LLMClient interface + interpolatePrompt helper"
```

---

## Task 2: Scaffold `@openexpertise/node-kinds-agent` package

**Files:**
- Create: `packages/node-kinds-agent/package.json`
- Create: `packages/node-kinds-agent/tsconfig.json`
- Create: `packages/node-kinds-agent/src/index.ts` (placeholder barrel)

- [ ] **Step 2.1: Create `package.json`**

```json
{
  "name": "@openexpertise/node-kinds-agent",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsc -b",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@openexpertise/core": "workspace:*",
    "@openexpertise/schema": "workspace:*",
    "@anthropic-ai/sdk": "^0.30.0"
  }
}
```

- [ ] **Step 2.2: Create `tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "references": [{ "path": "../core" }, { "path": "../schema" }],
  "include": ["src/**/*"]
}
```

- [ ] **Step 2.3: Create placeholder `src/index.ts`**

```ts
// Public exports populated by Task 3 (AgentDispatcher) and Task 4 (AnthropicLLMClient).
export { AgentDispatcher } from './agent-dispatcher.js'
export { AnthropicLLMClient } from './anthropic-client.js'
```

⚠ Both files dangle until Tasks 3-4 land. `pnpm typecheck` will fail on this package until then; that is expected.

- [ ] **Step 2.4: Install deps**

```bash
cd /Users/xuxingcheng/SHLAB/github/OpenExpertise
pnpm install
```

Expected: `@anthropic-ai/sdk` and its transitives installed.

- [ ] **Step 2.5: Commit**

```bash
git add packages/node-kinds-agent/
git commit -m "feat(node-kinds-agent): scaffold @openexpertise/node-kinds-agent package"
```

---

## Task 3: Implement `AgentDispatcher` (TDD with mocked `LLMClient`)

**Files:**
- Create: `packages/node-kinds-agent/src/agent-dispatcher.ts`
- Create: `packages/node-kinds-agent/tests/agent.test.ts`

- [ ] **Step 3.1: Write failing tests**

Create `packages/node-kinds-agent/tests/agent.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AgentDispatcher } from '../src/agent-dispatcher.js'
import type { LLMClient, LLMCompleteOpts, LLMCompleteResult } from '@openexpertise/core'
import { RunContext, StateStore, EventBus, DispatcherRegistry } from '@openexpertise/core'
import type { AgentNodeSpec, ExperienceSpec } from '@openexpertise/schema'

class FakeLLM implements LLMClient {
  public calls: LLMCompleteOpts[] = []
  constructor(private produce: (opts: LLMCompleteOpts) => LLMCompleteResult) {}
  async complete(opts: LLMCompleteOpts): Promise<LLMCompleteResult> {
    this.calls.push(opts)
    return this.produce(opts)
  }
}

const spec: ExperienceSpec = {
  name: 't',
  version: '0.1.0',
  state: { schema: { summary: { type: 'string' }, score: { type: 'number' } } },
  graph: { nodes: [], edges: [] },
}

let dir: string
let ctx: RunContext

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'oe-agent-'))
  mkdirSync(join(dir, 'prompts'), { recursive: true })
  const store = new StateStore({ dbPath: join(dir, 's.sqlite'), spec })
  ctx = new RunContext({
    runId: 'r', spec, experienceDir: dir, store,
    events: new EventBus(), dispatchers: new DispatcherRegistry(), args: {},
  })
})

afterEach(() => {
  ctx.store.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('AgentDispatcher', () => {
  it('reads prompt file, interpolates args, calls LLMClient, writes text to single-field state', async () => {
    writeFileSync(join(dir, 'prompts/echo.md'), 'Say hi to {{name}}.')
    const llm = new FakeLLM(() => ({ text: 'hello Alice' }))
    const dispatcher = new AgentDispatcher({ client: llm })
    const node: AgentNodeSpec = {
      id: 'a', kind: 'agent',
      prompt: './prompts/echo.md',
      writes: ['summary'],
    }

    const impl = await dispatcher.resolve(node, ctx)
    const output = await dispatcher.run(
      impl,
      { state_view: {}, edge_inputs: {}, args: { name: 'Alice' } },
      ctx,
    )

    expect(llm.calls).toHaveLength(1)
    expect(llm.calls[0]?.messages[0]?.content).toBe('Say hi to Alice.')
    expect(output.state_delta).toEqual({ summary: 'hello Alice' })
  })

  it('throws when text mode is used with multiple write fields', async () => {
    writeFileSync(join(dir, 'prompts/p.md'), 'go')
    const llm = new FakeLLM(() => ({ text: 'whatever' }))
    const dispatcher = new AgentDispatcher({ client: llm })
    const node: AgentNodeSpec = {
      id: 'a', kind: 'agent',
      prompt: './prompts/p.md',
      writes: ['summary', 'score'],
    }
    const impl = await dispatcher.resolve(node, ctx)
    await expect(
      dispatcher.run(impl, { state_view: {}, edge_inputs: {}, args: {} }, ctx),
    ).rejects.toThrow(/single write field/i)
  })

  it('uses structured output via tool when schema is set', async () => {
    writeFileSync(join(dir, 'prompts/score.md'), 'Score it')
    const llm = new FakeLLM((opts) => {
      expect(opts.tools?.[0]?.name).toBe('structured_output')
      return {
        text: '',
        tool_calls: [{ name: 'structured_output', input: { score: 0.92 } }],
        stop_reason: 'tool_use',
      }
    })
    const dispatcher = new AgentDispatcher({ client: llm })
    const node: AgentNodeSpec = {
      id: 'a', kind: 'agent',
      prompt: './prompts/score.md',
      schema: {
        type: 'object',
        required: ['score'],
        properties: { score: { type: 'number' } },
      },
      writes: ['score'],
    }
    const impl = await dispatcher.resolve(node, ctx)
    const output = await dispatcher.run(impl, { state_view: {}, edge_inputs: {}, args: {} }, ctx)
    expect(output.state_delta).toEqual({ score: 0.92 })
  })

  it('errors when structured-output call violates schema', async () => {
    writeFileSync(join(dir, 'prompts/score.md'), 'Score it')
    const llm = new FakeLLM(() => ({
      text: '',
      tool_calls: [{ name: 'structured_output', input: { score: 'not-a-number' } }],
      stop_reason: 'tool_use',
    }))
    const dispatcher = new AgentDispatcher({ client: llm })
    const node: AgentNodeSpec = {
      id: 'a', kind: 'agent',
      prompt: './prompts/score.md',
      schema: { type: 'object', required: ['score'], properties: { score: { type: 'number' } } },
      writes: ['score'],
    }
    const impl = await dispatcher.resolve(node, ctx)
    await expect(
      dispatcher.run(impl, { state_view: {}, edge_inputs: {}, args: {} }, ctx),
    ).rejects.toThrow(/schema|score/i)
  })

  it('reports usage metrics from the LLM response', async () => {
    writeFileSync(join(dir, 'prompts/p.md'), 'hi')
    const llm = new FakeLLM(() => ({
      text: 'ok',
      usage: { input_tokens: 12, output_tokens: 5 },
    }))
    const dispatcher = new AgentDispatcher({ client: llm })
    const node: AgentNodeSpec = { id: 'a', kind: 'agent', prompt: './prompts/p.md', writes: ['summary'] }
    const impl = await dispatcher.resolve(node, ctx)
    const output = await dispatcher.run(impl, { state_view: {}, edge_inputs: {}, args: {} }, ctx)
    expect(output.metrics).toEqual({ tokens_in: 12, tokens_out: 5 })
  })
})
```

- [ ] **Step 3.2: Run — confirm FAIL**

```bash
cd /Users/xuxingcheng/SHLAB/github/OpenExpertise
pnpm vitest run packages/node-kinds-agent/tests/agent.test.ts
```

Expected: FAIL — `agent-dispatcher.ts` doesn't exist.

- [ ] **Step 3.3: Implement `agent-dispatcher.ts`**

Create `packages/node-kinds-agent/src/agent-dispatcher.ts`:
```ts
import { readFileSync, existsSync } from 'node:fs'
import { resolve, isAbsolute } from 'node:path'
import Ajv from 'ajv'
import type {
  NodeDispatcher,
  NodeInputBundle,
  NodeOutput,
  ResolvedImpl,
  RunContext,
  LLMClient,
  LLMCompleteOpts,
  LLMTool,
} from '@openexpertise/core'
import { interpolatePrompt } from '@openexpertise/core'
import type { NodeSpec, AgentNodeSpec } from '@openexpertise/schema'

export interface AgentDispatcherOpts {
  client: LLMClient
  defaultModel?: string
  defaultMaxTokens?: number
}

interface AgentImpl extends ResolvedImpl {
  spec: AgentNodeSpec
  promptTemplate: string
  ajvValidator?: (data: unknown) => boolean
  ajvErrors?: () => string[]
  [k: string]: unknown
}

const STRUCTURED_TOOL_NAME = 'structured_output'

export class AgentDispatcher implements NodeDispatcher {
  readonly kind = 'agent' as const
  private readonly ajv = new Ajv({ allErrors: true, strict: false })

  constructor(private readonly opts: AgentDispatcherOpts) {}

  async resolve(node: NodeSpec, ctx: RunContext): Promise<AgentImpl> {
    if (node.kind !== 'agent') {
      throw new Error(`AgentDispatcher cannot resolve kind=${node.kind}`)
    }
    const t = node as AgentNodeSpec
    const promptTemplate = loadPromptTemplate(t.prompt, ctx.experienceDir)
    const impl: AgentImpl = { spec: t, promptTemplate }
    if (t.schema && typeof t.schema === 'object') {
      const compiled = this.ajv.compile(t.schema as Record<string, unknown>)
      impl.ajvValidator = compiled
      impl.ajvErrors = () =>
        (compiled.errors ?? []).map(
          (e) => `${e.instancePath || '(root)'}: ${e.message ?? 'invalid'}`,
        )
    }
    return impl
  }

  async run(impl: ResolvedImpl, bundle: NodeInputBundle, _ctx: RunContext): Promise<NodeOutput> {
    const ai = impl as AgentImpl
    const userPrompt = interpolatePrompt({
      template: ai.promptTemplate,
      values: { ...bundle.state_view, ...bundle.edge_inputs, ...bundle.args },
      strict: false, // tolerant: an unused state field shouldn't break a run
    })

    const completeOpts: LLMCompleteOpts = {
      model: ai.spec.model ?? this.opts.defaultModel ?? 'claude-sonnet-4-5',
      messages: [{ role: 'user', content: userPrompt }],
      max_tokens: this.opts.defaultMaxTokens ?? 4096,
    }

    if (ai.ajvValidator) {
      const tool: LLMTool = {
        name: STRUCTURED_TOOL_NAME,
        description: 'Return the agent result as a structured object matching the schema',
        input_schema: ai.spec.schema as Record<string, unknown>,
      }
      completeOpts.tools = [tool]
    }

    const result = await this.opts.client.complete(completeOpts)

    let stateDelta: Record<string, unknown>
    if (ai.ajvValidator) {
      const call = result.tool_calls?.find((c) => c.name === STRUCTURED_TOOL_NAME)
      if (!call) {
        throw new Error(`Agent "${ai.spec.id}" expected a structured_output tool call but got none`)
      }
      if (!ai.ajvValidator(call.input)) {
        const msgs = ai.ajvErrors?.() ?? ['schema mismatch']
        throw new Error(`Agent "${ai.spec.id}" structured output failed schema: ${msgs.join(', ')}`)
      }
      stateDelta = call.input as Record<string, unknown>
    } else {
      // Text mode: writes must have exactly one field; otherwise we can't map text → state.
      const writes = ai.spec.writes ?? []
      if (writes.length !== 1) {
        throw new Error(
          `Agent "${ai.spec.id}" returned text but declares ${writes.length} writes; ` +
            `text mode requires exactly a single write field. Use a structured schema for multi-field output.`,
        )
      }
      stateDelta = { [writes[0] as string]: result.text }
    }

    const out: NodeOutput = { state_delta: stateDelta }
    if (result.usage) {
      out.metrics = { tokens_in: result.usage.input_tokens, tokens_out: result.usage.output_tokens }
    }
    return out
  }
}

function loadPromptTemplate(impl: string, experienceDir: string): string {
  const abs = isAbsolute(impl) ? impl : resolve(experienceDir, impl)
  if (!existsSync(abs)) {
    throw new Error(`Agent prompt template not found: ${abs} (declared as "${impl}")`)
  }
  return readFileSync(abs, 'utf8')
}
```

- [ ] **Step 3.4: Run — confirm PASS**

```bash
pnpm vitest run packages/node-kinds-agent/tests/agent.test.ts
```

Expected: 5/5.

- [ ] **Step 3.5: Typecheck**

```bash
pnpm --filter @openexpertise/node-kinds-agent typecheck
```

Expected: error on the missing `anthropic-client.js` re-export from `index.ts`. That's the next task — leave it for now.

- [ ] **Step 3.6: Commit**

```bash
git add packages/node-kinds-agent/src/agent-dispatcher.ts packages/node-kinds-agent/tests/agent.test.ts
git commit -m "feat(node-kinds-agent): AgentDispatcher with structured-output schema support"
```

---

## Task 4: `AnthropicLLMClient` — the production `LLMClient` impl

**Files:**
- Create: `packages/node-kinds-agent/src/anthropic-client.ts`
- Create: `packages/node-kinds-agent/tests/anthropic-client.test.ts`

- [ ] **Step 4.1: Write failing tests**

Create `packages/node-kinds-agent/tests/anthropic-client.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { AnthropicLLMClient } from '../src/anthropic-client.js'

describe('AnthropicLLMClient.complete', () => {
  it('maps SDK text response to LLMCompleteResult', async () => {
    const fakeSdk = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'hello' }],
          usage: { input_tokens: 10, output_tokens: 4 },
          stop_reason: 'end_turn',
        }),
      },
    }
    const client = new AnthropicLLMClient({ sdkClient: fakeSdk as any })
    const result = await client.complete({
      model: 'claude-sonnet-4-5',
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 100,
    })
    expect(result.text).toBe('hello')
    expect(result.usage).toEqual({ input_tokens: 10, output_tokens: 4 })
    expect(result.stop_reason).toBe('end_turn')
    expect(fakeSdk.messages.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-sonnet-4-5',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    )
  })

  it('maps SDK tool_use response to tool_calls', async () => {
    const fakeSdk = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [
            { type: 'tool_use', id: 'tu_1', name: 'structured_output', input: { score: 0.7 } },
          ],
          usage: { input_tokens: 5, output_tokens: 3 },
          stop_reason: 'tool_use',
        }),
      },
    }
    const client = new AnthropicLLMClient({ sdkClient: fakeSdk as any })
    const result = await client.complete({
      model: 'claude-sonnet-4-5',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [{ name: 'structured_output', description: 'x', input_schema: {} }],
    })
    expect(result.text).toBe('')
    expect(result.tool_calls).toEqual([{ name: 'structured_output', input: { score: 0.7 } }])
    expect(result.stop_reason).toBe('tool_use')
  })

  it('throws when ANTHROPIC_API_KEY is missing and no sdkClient injected', () => {
    const prev = process.env.ANTHROPIC_API_KEY
    delete process.env.ANTHROPIC_API_KEY
    expect(() => new AnthropicLLMClient()).toThrow(/ANTHROPIC_API_KEY/)
    if (prev) process.env.ANTHROPIC_API_KEY = prev
  })
})
```

- [ ] **Step 4.2: Run — confirm FAIL**

```bash
pnpm vitest run packages/node-kinds-agent/tests/anthropic-client.test.ts
```

Expected: FAIL.

- [ ] **Step 4.3: Implement `anthropic-client.ts`**

Create `packages/node-kinds-agent/src/anthropic-client.ts`:
```ts
import Anthropic from '@anthropic-ai/sdk'
import type { LLMClient, LLMCompleteOpts, LLMCompleteResult, LLMToolCall } from '@openexpertise/core'

export interface AnthropicLLMClientOpts {
  apiKey?: string
  // Inject an alternative SDK client (used in tests to avoid network).
  sdkClient?: Pick<Anthropic, 'messages'>
}

export class AnthropicLLMClient implements LLMClient {
  private readonly sdk: Pick<Anthropic, 'messages'>

  constructor(opts: AnthropicLLMClientOpts = {}) {
    if (opts.sdkClient) {
      this.sdk = opts.sdkClient
      return
    }
    const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      throw new Error(
        'AnthropicLLMClient requires ANTHROPIC_API_KEY (env or constructor opt) or an injected sdkClient',
      )
    }
    this.sdk = new Anthropic({ apiKey })
  }

  async complete(opts: LLMCompleteOpts): Promise<LLMCompleteResult> {
    const request: Anthropic.MessageCreateParamsNonStreaming = {
      model: opts.model,
      max_tokens: opts.max_tokens ?? 4096,
      messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
      ...(opts.system ? { system: opts.system } : {}),
      ...(opts.tools && opts.tools.length > 0
        ? {
            tools: opts.tools.map((t) => ({
              name: t.name,
              description: t.description,
              input_schema: t.input_schema as Anthropic.Tool.InputSchema,
            })),
          }
        : {}),
    }

    const response = await this.sdk.messages.create(request)

    let text = ''
    const tool_calls: LLMToolCall[] = []
    for (const block of response.content) {
      if (block.type === 'text') text += block.text
      else if (block.type === 'tool_use') tool_calls.push({ name: block.name, input: block.input })
    }

    const result: LLMCompleteResult = { text }
    if (tool_calls.length > 0) result.tool_calls = tool_calls
    if (response.usage) {
      result.usage = {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      }
    }
    if (response.stop_reason) result.stop_reason = response.stop_reason
    return result
  }
}
```

- [ ] **Step 4.4: Run — confirm PASS**

```bash
pnpm vitest run packages/node-kinds-agent/
```

Expected: 5 agent + 3 anthropic-client = 8/8.

- [ ] **Step 4.5: Typecheck**

```bash
pnpm --filter @openexpertise/node-kinds-agent typecheck
```

Expected: 0 errors.

- [ ] **Step 4.6: Commit**

```bash
git add packages/node-kinds-agent/src/anthropic-client.ts packages/node-kinds-agent/tests/anthropic-client.test.ts
git commit -m "feat(node-kinds-agent): AnthropicLLMClient implementing LLMClient"
```

---

## Task 5: Scaffold `@openexpertise/node-kinds-skill` package

**Files:**
- Create: `packages/node-kinds-skill/package.json`
- Create: `packages/node-kinds-skill/tsconfig.json`
- Create: `packages/node-kinds-skill/src/index.ts` (barrel)

- [ ] **Step 5.1: Create `package.json`**

```json
{
  "name": "@openexpertise/node-kinds-skill",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsc -b",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@openexpertise/core": "workspace:*",
    "@openexpertise/schema": "workspace:*",
    "gray-matter": "^4.0.3"
  }
}
```

- [ ] **Step 5.2: Create `tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "references": [{ "path": "../core" }, { "path": "../schema" }],
  "include": ["src/**/*"]
}
```

- [ ] **Step 5.3: Create placeholder `src/index.ts`**

```ts
export { SkillDispatcher } from './skill-dispatcher.js'
export { loadSkillFile } from './skill-loader.js'
```

- [ ] **Step 5.4: Install deps**

```bash
cd /Users/xuxingcheng/SHLAB/github/OpenExpertise
pnpm install
```

- [ ] **Step 5.5: Commit**

```bash
git add packages/node-kinds-skill/
git commit -m "feat(node-kinds-skill): scaffold @openexpertise/node-kinds-skill package"
```

---

## Task 6: Implement `SkillDispatcher` — Claude Code SKILL.md-compatible

**Files:**
- Create: `packages/node-kinds-skill/src/skill-loader.ts`
- Create: `packages/node-kinds-skill/src/skill-dispatcher.ts`
- Create: `packages/node-kinds-skill/tests/skill.test.ts`

- [ ] **Step 6.1: Write failing tests**

Create `packages/node-kinds-skill/tests/skill.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SkillDispatcher, loadSkillFile } from '../src/index.js'
import type { LLMClient, LLMCompleteOpts } from '@openexpertise/core'
import { RunContext, StateStore, EventBus, DispatcherRegistry } from '@openexpertise/core'
import type { SkillNodeSpec, ExperienceSpec } from '@openexpertise/schema'

class FakeLLM implements LLMClient {
  public calls: LLMCompleteOpts[] = []
  async complete(opts: LLMCompleteOpts) {
    this.calls.push(opts)
    return { text: 'classified: greeting' }
  }
}

const spec: ExperienceSpec = {
  name: 't',
  version: '0.1.0',
  state: { schema: { label: { type: 'string' } } },
  graph: { nodes: [], edges: [] },
}

let dir: string
let ctx: RunContext

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'oe-skill-'))
  mkdirSync(join(dir, 'skills/classify'), { recursive: true })
  writeFileSync(join(dir, 'skills/classify/SKILL.md'), [
    '---',
    'name: classify',
    'description: Classifies user utterances',
    '---',
    '',
    '# Classify',
    '',
    'You receive a user message. Output one of: greeting, question, farewell.',
  ].join('\n'))
  const store = new StateStore({ dbPath: join(dir, 's.sqlite'), spec })
  ctx = new RunContext({
    runId: 'r', spec, experienceDir: dir, store,
    events: new EventBus(), dispatchers: new DispatcherRegistry(), args: {},
  })
})

afterEach(() => {
  ctx.store.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('loadSkillFile', () => {
  it('parses SKILL.md frontmatter + body', () => {
    const skillPath = join(dir, 'skills/classify')
    const loaded = loadSkillFile(skillPath)
    expect(loaded.frontmatter.name).toBe('classify')
    expect(loaded.frontmatter.description).toBe('Classifies user utterances')
    expect(loaded.body).toContain('# Classify')
  })

  it('throws when SKILL.md is missing', () => {
    expect(() => loadSkillFile(join(dir, 'skills/nope'))).toThrow(/SKILL\.md/)
  })
})

describe('SkillDispatcher', () => {
  it('uses SKILL.md body as system prompt and inputs as user message', async () => {
    const llm = new FakeLLM()
    const dispatcher = new SkillDispatcher({ client: llm })
    const node: SkillNodeSpec = {
      id: 's', kind: 'skill',
      impl: './skills/classify',
      inputs: { utterance: 'hello there' },
      writes: ['label'],
    }
    const impl = await dispatcher.resolve(node, ctx)
    const output = await dispatcher.run(
      impl,
      { state_view: {}, edge_inputs: {}, args: { utterance: 'hello there' } },
      ctx,
    )

    expect(llm.calls).toHaveLength(1)
    expect(llm.calls[0]?.system).toContain('# Classify')
    expect(llm.calls[0]?.messages[0]?.content).toContain('hello there')
    expect(output.state_delta).toEqual({ label: 'classified: greeting' })
  })
})
```

- [ ] **Step 6.2: Run — confirm FAIL**

```bash
pnpm vitest run packages/node-kinds-skill/
```

- [ ] **Step 6.3: Implement `skill-loader.ts`**

Create `packages/node-kinds-skill/src/skill-loader.ts`:
```ts
import { readFileSync, existsSync } from 'node:fs'
import { resolve, isAbsolute, join } from 'node:path'
import matter from 'gray-matter'

export interface SkillFrontmatter {
  name?: string
  description?: string
  [k: string]: unknown
}

export interface LoadedSkill {
  dir: string
  frontmatter: SkillFrontmatter
  body: string
}

export function loadSkillFile(skillDir: string, experienceDir?: string): LoadedSkill {
  const abs = isAbsolute(skillDir)
    ? skillDir
    : experienceDir
      ? resolve(experienceDir, skillDir)
      : resolve(skillDir)
  const skillMdPath = join(abs, 'SKILL.md')
  if (!existsSync(skillMdPath)) {
    throw new Error(`SKILL.md not found in skill directory: ${abs} (looked for ${skillMdPath})`)
  }
  const source = readFileSync(skillMdPath, 'utf8')
  const parsed = matter(source)
  return {
    dir: abs,
    frontmatter: parsed.data as SkillFrontmatter,
    body: parsed.content,
  }
}
```

- [ ] **Step 6.4: Implement `skill-dispatcher.ts`**

Create `packages/node-kinds-skill/src/skill-dispatcher.ts`:
```ts
import type {
  NodeDispatcher,
  NodeInputBundle,
  NodeOutput,
  ResolvedImpl,
  RunContext,
  LLMClient,
  LLMCompleteOpts,
} from '@openexpertise/core'
import type { NodeSpec, SkillNodeSpec } from '@openexpertise/schema'
import { loadSkillFile, type LoadedSkill } from './skill-loader.js'

export interface SkillDispatcherOpts {
  client: LLMClient
  defaultModel?: string
  defaultMaxTokens?: number
}

interface SkillImpl extends ResolvedImpl {
  spec: SkillNodeSpec
  skill: LoadedSkill
  [k: string]: unknown
}

export class SkillDispatcher implements NodeDispatcher {
  readonly kind = 'skill' as const

  constructor(private readonly opts: SkillDispatcherOpts) {}

  async resolve(node: NodeSpec, ctx: RunContext): Promise<SkillImpl> {
    if (node.kind !== 'skill') throw new Error(`SkillDispatcher cannot resolve kind=${node.kind}`)
    const t = node as SkillNodeSpec
    const skill = loadSkillFile(t.impl, ctx.experienceDir)
    return { spec: t, skill }
  }

  async run(impl: ResolvedImpl, bundle: NodeInputBundle, _ctx: RunContext): Promise<NodeOutput> {
    const si = impl as SkillImpl
    const userPayload = {
      ...bundle.state_view,
      ...bundle.edge_inputs,
      ...bundle.args,
    }
    const completeOpts: LLMCompleteOpts = {
      model: si.spec.model ?? this.opts.defaultModel ?? 'claude-sonnet-4-5',
      system: si.skill.body,
      messages: [{ role: 'user', content: JSON.stringify(userPayload, null, 2) }],
      max_tokens: this.opts.defaultMaxTokens ?? 4096,
    }

    const result = await this.opts.client.complete(completeOpts)

    const writes = si.spec.writes ?? []
    if (writes.length !== 1) {
      throw new Error(
        `Skill "${si.spec.id}" must declare exactly one write field for text mode; ` +
          `got ${writes.length}. Structured-output skills land in Plan 3+.`,
      )
    }
    const out: NodeOutput = { state_delta: { [writes[0] as string]: result.text } }
    if (result.usage) {
      out.metrics = { tokens_in: result.usage.input_tokens, tokens_out: result.usage.output_tokens }
    }
    return out
  }
}
```

- [ ] **Step 6.5: Run — confirm PASS**

```bash
pnpm vitest run packages/node-kinds-skill/
pnpm --filter @openexpertise/node-kinds-skill typecheck
```

Expected: 3/3 pass, typecheck clean.

- [ ] **Step 6.6: Commit**

```bash
git add packages/node-kinds-skill/src/ packages/node-kinds-skill/tests/
git commit -m "feat(node-kinds-skill): SkillDispatcher with SKILL.md frontmatter loader"
```

---

## Task 7: Scaffold `@openexpertise/node-kinds-dataset` package

**Files:**
- Create: `packages/node-kinds-dataset/package.json`
- Create: `packages/node-kinds-dataset/tsconfig.json`
- Create: `packages/node-kinds-dataset/src/index.ts` (barrel)

- [ ] **Step 7.1: Create `package.json`**

```json
{
  "name": "@openexpertise/node-kinds-dataset",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsc -b",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@openexpertise/core": "workspace:*",
    "@openexpertise/schema": "workspace:*",
    "better-sqlite3": "^11.0.0",
    "csv-parse": "^5.5.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0"
  }
}
```

- [ ] **Step 7.2: Create `tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "references": [{ "path": "../core" }, { "path": "../schema" }],
  "include": ["src/**/*"]
}
```

- [ ] **Step 7.3: Create placeholder `src/index.ts`**

```ts
export { DatasetDispatcher } from './dataset-dispatcher.js'
```

- [ ] **Step 7.4: Install deps + commit**

```bash
cd /Users/xuxingcheng/SHLAB/github/OpenExpertise
pnpm install
git add packages/node-kinds-dataset/
git commit -m "feat(node-kinds-dataset): scaffold @openexpertise/node-kinds-dataset package"
```

---

## Task 8: `DatasetDispatcher` with `file`, `sqlite`, `http` sources

**Files:**
- Create: `packages/node-kinds-dataset/src/sources/file.ts`
- Create: `packages/node-kinds-dataset/src/sources/sqlite.ts`
- Create: `packages/node-kinds-dataset/src/sources/http.ts`
- Create: `packages/node-kinds-dataset/src/dataset-dispatcher.ts`
- Create: `packages/node-kinds-dataset/tests/dataset.test.ts`

- [ ] **Step 8.1: Write failing tests**

Create `packages/node-kinds-dataset/tests/dataset.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { DatasetDispatcher } from '../src/index.js'
import { RunContext, StateStore, EventBus, DispatcherRegistry } from '@openexpertise/core'
import type { DatasetNodeSpec, ExperienceSpec } from '@openexpertise/schema'

const spec: ExperienceSpec = {
  name: 't',
  version: '0.1.0',
  state: { schema: { rows: { type: 'array', items: { type: 'object' } } } },
  graph: { nodes: [], edges: [] },
}

let dir: string
let ctx: RunContext

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'oe-dataset-'))
  const store = new StateStore({ dbPath: join(dir, 's.sqlite'), spec })
  ctx = new RunContext({
    runId: 'r', spec, experienceDir: dir, store,
    events: new EventBus(), dispatchers: new DispatcherRegistry(), args: {},
  })
})

afterEach(() => {
  ctx.store.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('DatasetDispatcher — file source', () => {
  it('loads a JSON file as an array of rows', async () => {
    writeFileSync(join(dir, 'data.json'), JSON.stringify([{ id: 1 }, { id: 2 }]))
    const dispatcher = new DatasetDispatcher()
    const node: DatasetNodeSpec = {
      id: 'd', kind: 'dataset',
      source: { type: 'file', uri: './data.json', format: 'json' },
      writes: ['rows'],
    }
    const impl = await dispatcher.resolve(node, ctx)
    const output = await dispatcher.run(impl, { state_view: {}, edge_inputs: {}, args: {} }, ctx)
    expect(output.state_delta).toEqual({ rows: [{ id: 1 }, { id: 2 }] })
  })

  it('loads a JSONL file as an array of rows', async () => {
    writeFileSync(join(dir, 'data.jsonl'), '{"id":1}\n{"id":2}\n')
    const dispatcher = new DatasetDispatcher()
    const node: DatasetNodeSpec = {
      id: 'd', kind: 'dataset',
      source: { type: 'file', uri: './data.jsonl', format: 'jsonl' },
      writes: ['rows'],
    }
    const impl = await dispatcher.resolve(node, ctx)
    const output = await dispatcher.run(impl, { state_view: {}, edge_inputs: {}, args: {} }, ctx)
    expect(output.state_delta).toEqual({ rows: [{ id: 1 }, { id: 2 }] })
  })

  it('loads a CSV file as an array of rows', async () => {
    writeFileSync(join(dir, 'data.csv'), 'id,name\n1,a\n2,b\n')
    const dispatcher = new DatasetDispatcher()
    const node: DatasetNodeSpec = {
      id: 'd', kind: 'dataset',
      source: { type: 'file', uri: './data.csv', format: 'csv' },
      writes: ['rows'],
    }
    const impl = await dispatcher.resolve(node, ctx)
    const output = await dispatcher.run(impl, { state_view: {}, edge_inputs: {}, args: {} }, ctx)
    expect(output.state_delta).toEqual({ rows: [{ id: '1', name: 'a' }, { id: '2', name: 'b' }] })
  })

  it('infers format from extension if not specified', async () => {
    writeFileSync(join(dir, 'auto.jsonl'), '{"x":1}\n')
    const dispatcher = new DatasetDispatcher()
    const node: DatasetNodeSpec = {
      id: 'd', kind: 'dataset',
      source: { type: 'file', uri: './auto.jsonl' },
      writes: ['rows'],
    }
    const impl = await dispatcher.resolve(node, ctx)
    const output = await dispatcher.run(impl, { state_view: {}, edge_inputs: {}, args: {} }, ctx)
    expect(output.state_delta).toEqual({ rows: [{ x: 1 }] })
  })
})

describe('DatasetDispatcher — sqlite source', () => {
  it('runs a SQL query and returns rows', async () => {
    const dbPath = join(dir, 'incidents.sqlite')
    const db = new Database(dbPath)
    db.exec('CREATE TABLE incidents (id INTEGER, kind TEXT)')
    db.prepare('INSERT INTO incidents VALUES (?, ?)').run(1, 'crash')
    db.prepare('INSERT INTO incidents VALUES (?, ?)').run(2, 'leak')
    db.close()

    const dispatcher = new DatasetDispatcher()
    const node: DatasetNodeSpec = {
      id: 'd', kind: 'dataset',
      source: { type: 'sqlite', uri: './incidents.sqlite', query: 'SELECT * FROM incidents ORDER BY id' },
      writes: ['rows'],
    }
    const impl = await dispatcher.resolve(node, ctx)
    const output = await dispatcher.run(impl, { state_view: {}, edge_inputs: {}, args: {} }, ctx)
    expect(output.state_delta).toEqual({
      rows: [{ id: 1, kind: 'crash' }, { id: 2, kind: 'leak' }],
    })
  })
})

describe('DatasetDispatcher — http source', () => {
  it('GETs a URL and parses JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{ a: 1 }]), { status: 200, headers: { 'content-type': 'application/json' } }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const dispatcher = new DatasetDispatcher()
    const node: DatasetNodeSpec = {
      id: 'd', kind: 'dataset',
      source: { type: 'http', url: 'https://example.test/data', method: 'GET' },
      writes: ['rows'],
    }
    const impl = await dispatcher.resolve(node, ctx)
    const output = await dispatcher.run(impl, { state_view: {}, edge_inputs: {}, args: {} }, ctx)
    expect(output.state_delta).toEqual({ rows: [{ a: 1 }] })

    vi.unstubAllGlobals()
  })
})
```

- [ ] **Step 8.2: Run — confirm FAIL**

```bash
cd /Users/xuxingcheng/SHLAB/github/OpenExpertise
pnpm vitest run packages/node-kinds-dataset/
```

- [ ] **Step 8.3: Implement `sources/file.ts`**

Create `packages/node-kinds-dataset/src/sources/file.ts`:
```ts
import { readFileSync, existsSync } from 'node:fs'
import { resolve, isAbsolute, extname } from 'node:path'
import { parse as parseCsv } from 'csv-parse/sync'

export type FileFormat = 'json' | 'jsonl' | 'csv'

export interface FileSourceOpts {
  uri: string
  format?: FileFormat
  experienceDir: string
}

export function loadFileSource(opts: FileSourceOpts): unknown[] {
  const abs = isAbsolute(opts.uri) ? opts.uri : resolve(opts.experienceDir, opts.uri)
  if (!existsSync(abs)) {
    throw new Error(`Dataset file not found: ${abs} (declared as "${opts.uri}")`)
  }
  const format = opts.format ?? inferFormat(abs)
  const source = readFileSync(abs, 'utf8')
  switch (format) {
    case 'json': {
      const parsed = JSON.parse(source)
      if (!Array.isArray(parsed)) {
        throw new Error(`File "${opts.uri}" must contain a top-level JSON array; got ${typeof parsed}`)
      }
      return parsed
    }
    case 'jsonl':
      return source
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line))
    case 'csv':
      return parseCsv(source, { columns: true, skip_empty_lines: true }) as unknown[]
    default:
      throw new Error(`Unsupported file format "${format}" for ${opts.uri}`)
  }
}

function inferFormat(absPath: string): FileFormat {
  const ext = extname(absPath).toLowerCase()
  if (ext === '.json') return 'json'
  if (ext === '.jsonl' || ext === '.ndjson') return 'jsonl'
  if (ext === '.csv') return 'csv'
  throw new Error(`Cannot infer file format from extension "${ext}"; specify source.format explicitly`)
}
```

- [ ] **Step 8.4: Implement `sources/sqlite.ts`**

Create `packages/node-kinds-dataset/src/sources/sqlite.ts`:
```ts
import Database from 'better-sqlite3'
import { resolve, isAbsolute } from 'node:path'
import { existsSync } from 'node:fs'

export interface SqliteSourceOpts {
  uri: string
  query: string
  experienceDir: string
}

export function loadSqliteSource(opts: SqliteSourceOpts): unknown[] {
  const abs = isAbsolute(opts.uri) ? opts.uri : resolve(opts.experienceDir, opts.uri)
  if (!existsSync(abs)) {
    throw new Error(`Dataset sqlite file not found: ${abs} (declared as "${opts.uri}")`)
  }
  const db = new Database(abs, { readonly: true })
  try {
    const rows = db.prepare(opts.query).all() as unknown[]
    return rows
  } finally {
    db.close()
  }
}
```

- [ ] **Step 8.5: Implement `sources/http.ts`**

Create `packages/node-kinds-dataset/src/sources/http.ts`:
```ts
export interface HttpSourceOpts {
  url: string
  method?: 'GET' | 'POST'
  body?: unknown
}

export async function loadHttpSource(opts: HttpSourceOpts): Promise<unknown[]> {
  const method = opts.method ?? 'GET'
  const init: RequestInit = { method }
  if (method === 'POST' && opts.body !== undefined) {
    init.body = JSON.stringify(opts.body)
    init.headers = { 'content-type': 'application/json' }
  }
  const response = await fetch(opts.url, init)
  if (!response.ok) {
    throw new Error(`Dataset http source ${opts.url} returned ${response.status} ${response.statusText}`)
  }
  const parsed = await response.json()
  if (!Array.isArray(parsed)) {
    throw new Error(`Dataset http source ${opts.url} must return a top-level JSON array`)
  }
  return parsed
}
```

- [ ] **Step 8.6: Implement `dataset-dispatcher.ts`**

Create `packages/node-kinds-dataset/src/dataset-dispatcher.ts`:
```ts
import type {
  NodeDispatcher,
  NodeInputBundle,
  NodeOutput,
  ResolvedImpl,
  RunContext,
} from '@openexpertise/core'
import type { NodeSpec, DatasetNodeSpec } from '@openexpertise/schema'
import { loadFileSource } from './sources/file.js'
import { loadSqliteSource } from './sources/sqlite.js'
import { loadHttpSource } from './sources/http.js'

interface DatasetImpl extends ResolvedImpl {
  spec: DatasetNodeSpec
  [k: string]: unknown
}

export class DatasetDispatcher implements NodeDispatcher {
  readonly kind = 'dataset' as const

  async resolve(node: NodeSpec, _ctx: RunContext): Promise<DatasetImpl> {
    if (node.kind !== 'dataset') {
      throw new Error(`DatasetDispatcher cannot resolve kind=${node.kind}`)
    }
    return { spec: node as DatasetNodeSpec }
  }

  async run(impl: ResolvedImpl, _bundle: NodeInputBundle, ctx: RunContext): Promise<NodeOutput> {
    const di = impl as DatasetImpl
    const writes = di.spec.writes ?? []
    if (writes.length !== 1) {
      throw new Error(
        `Dataset "${di.spec.id}" must declare exactly one write field; got ${writes.length}`,
      )
    }
    const writeField = writes[0] as string

    let rows: unknown[]
    const src = di.spec.source
    switch (src.type) {
      case 'file':
        rows = loadFileSource({
          uri: src.uri,
          ...(src.format ? { format: src.format } : {}),
          experienceDir: ctx.experienceDir,
        })
        break
      case 'sqlite':
        rows = loadSqliteSource({
          uri: src.uri,
          query: src.query,
          experienceDir: ctx.experienceDir,
        })
        break
      case 'http':
        rows = await loadHttpSource({
          url: src.url,
          ...(src.method ? { method: src.method } : {}),
          ...(src.body !== undefined ? { body: src.body } : {}),
        })
        break
      case 'mcp-resource':
        throw new Error(`mcp-resource dataset source is not implemented in V1`)
      default: {
        const _exhaustive: never = src
        throw new Error(`Unknown dataset source: ${JSON.stringify(_exhaustive)}`)
      }
    }

    return { state_delta: { [writeField]: rows } }
  }
}
```

- [ ] **Step 8.7: Run — confirm PASS**

```bash
pnpm vitest run packages/node-kinds-dataset/
pnpm --filter @openexpertise/node-kinds-dataset typecheck
```

Expected: 6/6 pass; typecheck clean.

- [ ] **Step 8.8: Commit**

```bash
git add packages/node-kinds-dataset/src/ packages/node-kinds-dataset/tests/
git commit -m "feat(node-kinds-dataset): DatasetDispatcher with file/sqlite/http sources"
```

---

## Task 9: Scaffold `@openexpertise/node-kinds-experience` package

**Files:**
- Create: `packages/node-kinds-experience/package.json`
- Create: `packages/node-kinds-experience/tsconfig.json`
- Create: `packages/node-kinds-experience/src/index.ts` (barrel)

- [ ] **Step 9.1: Create `package.json`**

```json
{
  "name": "@openexpertise/node-kinds-experience",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsc -b",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@openexpertise/core": "workspace:*",
    "@openexpertise/schema": "workspace:*"
  }
}
```

- [ ] **Step 9.2: Create `tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "references": [{ "path": "../core" }, { "path": "../schema" }],
  "include": ["src/**/*"]
}
```

- [ ] **Step 9.3: Create placeholder `src/index.ts`**

```ts
export { ExperienceDispatcher } from './experience-dispatcher.js'
```

- [ ] **Step 9.4: Install + commit**

```bash
cd /Users/xuxingcheng/SHLAB/github/OpenExpertise
pnpm install
git add packages/node-kinds-experience/
git commit -m "feat(node-kinds-experience): scaffold @openexpertise/node-kinds-experience package"
```

---

## Task 10: `ExperienceDispatcher` — recursive 1-level nesting, isolated state

**Files:**
- Create: `packages/node-kinds-experience/src/experience-dispatcher.ts`
- Create: `packages/node-kinds-experience/tests/experience.test.ts`

- [ ] **Step 10.1: Write failing test**

Create `packages/node-kinds-experience/tests/experience.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ExperienceDispatcher } from '../src/index.js'
import {
  RunContext,
  StateStore,
  EventBus,
  DispatcherRegistry,
  runExperience,
} from '@openexpertise/core'
import type { ExperienceNodeSpec, ExperienceSpec } from '@openexpertise/schema'

const outerSpec: ExperienceSpec = {
  name: 'outer',
  version: '0.1.0',
  state: { schema: { result: { type: 'object' } } },
  graph: { nodes: [], edges: [] },
}

let dir: string
let outerCtx: RunContext

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'oe-experience-'))
  mkdirSync(join(dir, 'child/tools'), { recursive: true })
  writeFileSync(
    join(dir, 'child/tools/echo.mjs'),
    `export default async () => ({ state_delta: { child_value: 'hello-from-child' } })\n`,
  )
  writeFileSync(join(dir, 'child/experience.yaml'), [
    'name: child',
    'version: 0.1.0',
    'state:',
    '  schema:',
    '    child_value:',
    '      type: string',
    'graph:',
    '  nodes:',
    '    - id: echo',
    '      kind: tool',
    '      impl: ./tools/echo.mjs',
    '      writes: [child_value]',
    '  edges: []',
  ].join('\n'))

  const store = new StateStore({ dbPath: join(dir, 's.sqlite'), spec: outerSpec })
  const dispatchers = new DispatcherRegistry()
  // We register a tool dispatcher here for the child to use.
  // Tests bring their own; we'll wire one via the actual ToolDispatcher.
  outerCtx = new RunContext({
    runId: 'r', spec: outerSpec, experienceDir: dir, store,
    events: new EventBus(), dispatchers, args: {},
  })
})

afterEach(() => {
  outerCtx.store.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('ExperienceDispatcher', () => {
  it('runs a sub-experience with isolated state and returns its finalState as edge_output', async () => {
    // Use the actual ToolDispatcher for the child's tool node
    const { ToolDispatcher } = await import('@openexpertise/node-kinds-tool')
    outerCtx.dispatchers.register(new ToolDispatcher())

    const dispatcher = new ExperienceDispatcher({ runExperience })
    const node: ExperienceNodeSpec = {
      id: 'child',
      kind: 'experience',
      impl: './child/experience.yaml',
      state_scope: 'isolated',
    }
    const impl = await dispatcher.resolve(node, outerCtx)
    const output = await dispatcher.run(impl, { state_view: {}, edge_inputs: {}, args: {} }, outerCtx)

    expect(output.edge_output).toMatchObject({
      status: 'success',
      finalState: { child_value: 'hello-from-child' },
    })
    expect(output.state_delta).toEqual({})
  })

  it('rejects when impl file is missing', async () => {
    const dispatcher = new ExperienceDispatcher({ runExperience })
    const node: ExperienceNodeSpec = {
      id: 'child',
      kind: 'experience',
      impl: './missing/experience.yaml',
    }
    await expect(dispatcher.resolve(node, outerCtx)).rejects.toThrow(/missing/)
  })

  it('rejects state_scope=shared as not implemented in V1', async () => {
    const dispatcher = new ExperienceDispatcher({ runExperience })
    const node: ExperienceNodeSpec = {
      id: 'child',
      kind: 'experience',
      impl: './child/experience.yaml',
      state_scope: 'shared',
    }
    await expect(dispatcher.resolve(node, outerCtx)).rejects.toThrow(/shared/i)
  })
})
```

- [ ] **Step 10.2: Run — confirm FAIL**

```bash
cd /Users/xuxingcheng/SHLAB/github/OpenExpertise
pnpm vitest run packages/node-kinds-experience/
```

- [ ] **Step 10.3: Implement `experience-dispatcher.ts`**

Create `packages/node-kinds-experience/src/experience-dispatcher.ts`:
```ts
import { readFileSync, existsSync } from 'node:fs'
import { resolve, isAbsolute, dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type {
  NodeDispatcher,
  NodeInputBundle,
  NodeOutput,
  ResolvedImpl,
  RunContext,
} from '@openexpertise/core'
import { parseExperienceYaml } from '@openexpertise/schema'
import type { NodeSpec, ExperienceNodeSpec, ExperienceSpec } from '@openexpertise/schema'

// runExperience is injected to break the would-be circular dep:
// core -> experience dispatcher -> core's runExperience.
export interface ExperienceDispatcherOpts {
  runExperience: (opts: {
    spec: ExperienceSpec
    experienceDir: string
    dispatchers: import('@openexpertise/core').DispatcherRegistry
    args?: Record<string, unknown>
    dbPath?: string
    runId?: string
  }) => Promise<{
    runId: string
    status: 'success' | 'failed' | 'partial'
    finalState: Record<string, unknown>
  }>
}

interface ExperienceImpl extends ResolvedImpl {
  spec: ExperienceNodeSpec
  childSpec: ExperienceSpec
  childDir: string
  [k: string]: unknown
}

export class ExperienceDispatcher implements NodeDispatcher {
  readonly kind = 'experience' as const

  constructor(private readonly opts: ExperienceDispatcherOpts) {}

  async resolve(node: NodeSpec, ctx: RunContext): Promise<ExperienceImpl> {
    if (node.kind !== 'experience') {
      throw new Error(`ExperienceDispatcher cannot resolve kind=${node.kind}`)
    }
    const t = node as ExperienceNodeSpec
    if (t.state_scope === 'shared') {
      throw new Error(`Experience "${t.id}" requests state_scope=shared, which is not implemented in V1`)
    }
    const abs = isAbsolute(t.impl) ? t.impl : resolve(ctx.experienceDir, t.impl)
    if (!existsSync(abs)) {
      throw new Error(`Sub-experience yaml not found: ${abs} (declared as "${t.impl}")`)
    }
    const source = readFileSync(abs, 'utf8')
    const childSpec = parseExperienceYaml(source)
    return { spec: t, childSpec, childDir: dirname(abs) }
  }

  async run(impl: ResolvedImpl, bundle: NodeInputBundle, ctx: RunContext): Promise<NodeOutput> {
    const ei = impl as ExperienceImpl
    // isolated: a brand-new SQLite file scoped to this nested run, kept under
    // the parent's .openexpertise/sub/ for inspection.
    const subRunId = randomUUID()
    const dbPath = join(
      ctx.experienceDir,
      '.openexpertise',
      'sub',
      `${ei.spec.id}-${subRunId}.sqlite`,
    )

    const childResult = await this.opts.runExperience({
      spec: ei.childSpec,
      experienceDir: ei.childDir,
      dispatchers: ctx.dispatchers,
      args: { ...bundle.args, _parent_run_id: ctx.runId, _parent_state: bundle.state_view },
      dbPath,
      runId: subRunId,
    })

    return {
      state_delta: {},
      edge_output: {
        runId: childResult.runId,
        status: childResult.status,
        finalState: childResult.finalState,
      },
    }
  }
}
```

- [ ] **Step 10.4: Run — confirm PASS**

```bash
pnpm vitest run packages/node-kinds-experience/
pnpm --filter @openexpertise/node-kinds-experience typecheck
```

Expected: 3/3 pass; typecheck clean.

- [ ] **Step 10.5: Commit**

```bash
git add packages/node-kinds-experience/src/ packages/node-kinds-experience/tests/
git commit -m "feat(node-kinds-experience): ExperienceDispatcher with isolated state nesting"
```

---

## Task 11: `on_error` policy enforcement in `SequentialScheduler`

**Files:**
- Modify: `packages/core/src/graph/scheduler.ts` — replace the existing `catch` block with policy-aware logic
- Create: `packages/core/tests/scheduler-on-error.test.ts`

- [ ] **Step 11.1: Write failing tests**

Create `packages/core/tests/scheduler-on-error.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  DispatcherRegistry,
  EventBus,
  StateStore,
  RunContext,
  SequentialScheduler,
  buildDag,
  type NodeDispatcher,
  type NodeInputBundle,
  type NodeOutput,
} from '@openexpertise/core'
import type { ExperienceSpec, NodeSpec } from '@openexpertise/schema'

class FailNTimes implements NodeDispatcher {
  readonly kind = 'tool' as const
  private attempts = 0
  constructor(private failsFirst: number, private finalValue: string) {}
  async resolve(_n: NodeSpec) { return {} }
  async run(_impl: unknown, _b: NodeInputBundle): Promise<NodeOutput> {
    this.attempts++
    if (this.attempts <= this.failsFirst) {
      throw new Error(`fail attempt ${this.attempts}`)
    }
    return { state_delta: { val: this.finalValue } }
  }
}

class AlwaysFail implements NodeDispatcher {
  readonly kind = 'tool' as const
  async resolve(_n: NodeSpec) { return {} }
  async run(): Promise<NodeOutput> {
    throw new Error('boom')
  }
}

const baseSpec: ExperienceSpec = {
  name: 't',
  version: '0.1.0',
  state: { schema: { val: { type: 'string' } } },
  graph: { nodes: [], edges: [] },
}

let dir: string

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'oe-onerror-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

function makeCtx(spec: ExperienceSpec, dispatcher: NodeDispatcher): RunContext {
  const store = new StateStore({ dbPath: join(dir, 's.sqlite'), spec })
  const dispatchers = new DispatcherRegistry()
  dispatchers.register(dispatcher)
  return new RunContext({
    runId: 'r', spec, experienceDir: dir, store,
    events: new EventBus(), dispatchers, args: {},
  })
}

describe('SequentialScheduler on_error policy', () => {
  it('retries up to attempts and succeeds when transient', async () => {
    const spec: ExperienceSpec = {
      ...baseSpec,
      graph: {
        nodes: [{
          id: 'x', kind: 'tool', impl: 'x', writes: ['val'],
          on_error: { policy: 'retry', attempts: 3, backoff: 'linear', base_ms: 1 },
        }],
        edges: [],
      },
    }
    const fakeTool = new FailNTimes(2, 'eventually-ok')
    const ctx = makeCtx(spec, fakeTool)
    const scheduler = new SequentialScheduler(buildDag(spec), ctx)
    const { status } = await scheduler.run()
    expect(status).toBe('success')
    expect(ctx.store.get('val')).toBe('eventually-ok')
    ctx.store.close()
  })

  it('aborts run on policy=fail_run', async () => {
    const spec: ExperienceSpec = {
      ...baseSpec,
      graph: {
        nodes: [{
          id: 'x', kind: 'tool', impl: 'x', writes: ['val'],
          on_error: { policy: 'fail_run' },
        }],
        edges: [],
      },
    }
    const ctx = makeCtx(spec, new AlwaysFail())
    const scheduler = new SequentialScheduler(buildDag(spec), ctx)
    await expect(scheduler.run()).rejects.toThrow(/fail_run/)
    ctx.store.close()
  })

  it('defaults to skip-downstream when on_error absent (Plan 1 behavior)', async () => {
    const spec: ExperienceSpec = {
      ...baseSpec,
      state: { schema: { val: { type: 'string' }, other: { type: 'string' } } },
      graph: {
        nodes: [
          { id: 'x', kind: 'tool', impl: 'x', writes: ['val'] },
          { id: 'y', kind: 'tool', impl: 'y', writes: ['other'] }, // sibling, should still run
        ],
        edges: [],
      },
    }
    let calledY = false
    const dispatcher: NodeDispatcher = {
      kind: 'tool',
      async resolve() { return {} },
      async run(_impl, _b: NodeInputBundle, ctx) {
        // x throws; y succeeds
        const nodeId = (ctx.events as any) // not great, but minimal: read from emitted events
        // Use spec id from a closure carried in args instead — see below.
        throw new Error('not implemented in this simple dispatcher')
      },
    }
    // Instead of inline dispatcher above, use two trivial impls via a kind-aware wrapper:
    class Mixed implements NodeDispatcher {
      readonly kind = 'tool' as const
      async resolve(node: NodeSpec) { return { id: node.id } }
      async run(impl: { id: string }) {
        if (impl.id === 'x') throw new Error('boom from x')
        calledY = true
        return { state_delta: { other: 'y-ran' } }
      }
    }
    const ctx = makeCtx(spec, new Mixed())
    const scheduler = new SequentialScheduler(buildDag(spec), ctx)
    const { status } = await scheduler.run()
    expect(status).toBe('partial')
    expect(calledY).toBe(true)
    expect(ctx.store.get('other')).toBe('y-ran')
    ctx.store.close()
  })

  it('respects retry exponential backoff timing (smoke)', async () => {
    const spec: ExperienceSpec = {
      ...baseSpec,
      graph: {
        nodes: [{
          id: 'x', kind: 'tool', impl: 'x', writes: ['val'],
          on_error: { policy: 'retry', attempts: 3, backoff: 'exponential', base_ms: 5 },
        }],
        edges: [],
      },
    }
    const fakeTool = new FailNTimes(2, 'ok')
    const ctx = makeCtx(spec, fakeTool)
    const scheduler = new SequentialScheduler(buildDag(spec), ctx)
    const t0 = Date.now()
    await scheduler.run()
    const elapsed = Date.now() - t0
    // 2 retries → sleeps of 5ms and 10ms → at least 15ms total
    expect(elapsed).toBeGreaterThanOrEqual(15)
    ctx.store.close()
  })
})
```

- [ ] **Step 11.2: Run — confirm FAIL**

```bash
pnpm vitest run packages/core/tests/scheduler-on-error.test.ts
```

Expected: FAIL — current scheduler always uses skip-downstream and doesn't retry.

- [ ] **Step 11.3: Modify `scheduler.ts` — replace the existing catch block with policy logic**

Open `packages/core/src/graph/scheduler.ts`. Find the section that begins with:

```ts
      this.ctx.events.emit({ type: 'node.started', run_id: this.ctx.runId, node_id: node.id, ts: this.ctx.now() })
      try {
        const impl = await dispatcher.resolve(node.spec, this.ctx)
        const output = await dispatcher.run(impl, bundle, this.ctx)
```

and ends with the existing catch block:

```ts
      } catch (err) {
        // TODO Plan 2: honor node.spec.on_error policy (retry / fail_run / skip).
        // Plan 1 default is always "skip downstream, continue siblings".
        const error = err instanceof Error ? err : new Error(String(err))
        this.ctx.events.emit({
          type: 'node.failed',
          run_id: this.ctx.runId,
          node_id: node.id,
          ts: this.ctx.now(),
          error: error.message,
        })
        results.push({ nodeId: node.id, status: 'failed', error })
        skipped.add(node.id)
        anyFailed = true
      }
```

Replace the entire `try { ... } catch (err) { ... }` block with policy-aware execution. Extract the per-attempt body into a helper, then wrap it with the policy check:

```ts
      this.ctx.events.emit({ type: 'node.started', run_id: this.ctx.runId, node_id: node.id, ts: this.ctx.now() })

      const policy = node.spec.on_error ?? { policy: 'skip' as const }
      const maxAttempts = policy.policy === 'retry' ? policy.attempts : 1
      let attempt = 0
      let lastError: Error | undefined
      let succeeded = false

      while (attempt < maxAttempts) {
        attempt++
        try {
          const impl = await dispatcher.resolve(node.spec, this.ctx)
          const output = await dispatcher.run(impl, bundle, this.ctx)
          if (output.state_delta && Object.keys(output.state_delta).length > 0) {
            this.ctx.store.write(output.state_delta, { runId: this.ctx.runId, nodeId: node.id })
            for (const field of Object.keys(output.state_delta)) {
              this.ctx.events.emit({
                type: 'state.write', run_id: this.ctx.runId, node_id: node.id, field, ts: this.ctx.now(),
              })
            }
          }
          if (output.edge_output !== undefined) {
            for (const succ of node.successors) {
              const existing = edgeBuffer.get(succ) ?? {}
              existing[node.id] = output.edge_output
              edgeBuffer.set(succ, existing)
            }
          }
          this.ctx.events.emit({
            type: 'node.finished', run_id: this.ctx.runId, node_id: node.id,
            ts: this.ctx.now(), ...(output.metrics ? { metrics: output.metrics } : {}),
          })
          results.push({ nodeId: node.id, status: 'success', output })
          succeeded = true
          break
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err))
          if (policy.policy === 'retry' && attempt < maxAttempts) {
            const base = policy.base_ms ?? 100
            const sleepMs = policy.backoff === 'exponential' ? base * 2 ** (attempt - 1) : base * attempt
            await sleep(sleepMs)
            continue
          }
          break
        }
      }

      if (!succeeded) {
        const error = lastError ?? new Error('unknown error')
        this.ctx.events.emit({
          type: 'node.failed', run_id: this.ctx.runId, node_id: node.id,
          ts: this.ctx.now(), error: error.message,
        })
        results.push({ nodeId: node.id, status: 'failed', error })
        skipped.add(node.id)
        anyFailed = true
        if (policy.policy === 'fail_run') {
          throw new Error(`Node "${node.id}" failed and policy=fail_run: ${error.message}`)
        }
      }
```

Also add the `sleep` helper at the bottom of the file:

```ts
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
```

- [ ] **Step 11.4: Run — confirm PASS**

```bash
pnpm vitest run packages/core/tests/scheduler-on-error.test.ts
pnpm vitest run packages/core/
pnpm --filter @openexpertise/core typecheck
```

Expected: 4 on-error + existing core tests all pass; typecheck clean.

- [ ] **Step 11.5: Commit**

```bash
git add packages/core/src/graph/scheduler.ts packages/core/tests/scheduler-on-error.test.ts
git commit -m "feat(core): honor on_error policy (retry/skip/fail_run) in SequentialScheduler"
```

---

## Task 12: Wire all four new dispatchers into the CLI

**Files:**
- Modify: `packages/cli/package.json` — add new dispatcher packages as deps
- Modify: `packages/cli/tsconfig.json` — add references
- Modify: `packages/cli/src/commands/run.ts` — register the new dispatchers

- [ ] **Step 12.1: Update `packages/cli/package.json`**

Add the four packages to `dependencies` (keep existing entries):

```json
{
  "name": "@openexpertise/cli",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "bin": { "oe": "./dist/bin.js" },
  "files": ["dist"],
  "scripts": {
    "build": "tsc -b",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@openexpertise/core": "workspace:*",
    "@openexpertise/schema": "workspace:*",
    "@openexpertise/node-kinds-tool": "workspace:*",
    "@openexpertise/node-kinds-agent": "workspace:*",
    "@openexpertise/node-kinds-skill": "workspace:*",
    "@openexpertise/node-kinds-dataset": "workspace:*",
    "@openexpertise/node-kinds-experience": "workspace:*",
    "commander": "^12.0.0",
    "pino": "^9.0.0",
    "pino-pretty": "^11.0.0"
  }
}
```

- [ ] **Step 12.2: Update `packages/cli/tsconfig.json`**

Add four new `references`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "references": [
    { "path": "../schema" },
    { "path": "../core" },
    { "path": "../node-kinds-tool" },
    { "path": "../node-kinds-agent" },
    { "path": "../node-kinds-skill" },
    { "path": "../node-kinds-dataset" },
    { "path": "../node-kinds-experience" }
  ],
  "include": ["src/**/*"]
}
```

- [ ] **Step 12.3: Update `packages/cli/src/commands/run.ts`**

Replace the existing dispatcher-registration block with the full set:

```ts
import { readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { parseExperienceYaml } from '@openexpertise/schema'
import { DispatcherRegistry, EventBus, runExperience } from '@openexpertise/core'
import { ToolDispatcher } from '@openexpertise/node-kinds-tool'
import { AgentDispatcher, AnthropicLLMClient } from '@openexpertise/node-kinds-agent'
import { SkillDispatcher } from '@openexpertise/node-kinds-skill'
import { DatasetDispatcher } from '@openexpertise/node-kinds-dataset'
import { ExperienceDispatcher } from '@openexpertise/node-kinds-experience'
import { resolveExperienceYaml } from './validate.js'
import type { Logger } from 'pino'

export interface RunOpts {
  path: string
  args: Record<string, unknown>
  logger: Logger
}

export async function runCommand(opts: RunOpts): Promise<number> {
  const yamlPath = resolveExperienceYaml(opts.path)
  const source = readFileSync(yamlPath, 'utf8')
  const spec = parseExperienceYaml(source)
  const experienceDir = dirname(yamlPath)

  const dispatchers = new DispatcherRegistry()
  dispatchers.register(new ToolDispatcher())

  // LLM-backed dispatchers share one Anthropic client. If ANTHROPIC_API_KEY is
  // absent, instantiation is deferred — the dispatchers throw only when actually
  // invoked, so experiences that don't use agent/skill nodes still work fine.
  let lazyClient: AnthropicLLMClient | undefined
  const getClient = (): AnthropicLLMClient => {
    if (!lazyClient) lazyClient = new AnthropicLLMClient()
    return lazyClient
  }
  // We register with a getter-based proxy so construction is lazy.
  dispatchers.register(
    new AgentDispatcher({
      get client() { return getClient() },
    } as any),
  )
  dispatchers.register(
    new SkillDispatcher({
      get client() { return getClient() },
    } as any),
  )

  dispatchers.register(new DatasetDispatcher())
  dispatchers.register(new ExperienceDispatcher({ runExperience }))

  const events = new EventBus()
  events.subscribe((e) => opts.logger.info(e, e.type))

  const result = await runExperience({ spec, experienceDir, dispatchers, events, args: opts.args })
  opts.logger.info(
    { runId: result.runId, status: result.status, finalState: result.finalState },
    'run complete',
  )

  return result.status === 'success' ? 0 : 1
}
```

⚠ The "getter-based proxy" pattern (`get client() { return getClient() }`) is used so that experiences without agent/skill nodes do not require `ANTHROPIC_API_KEY` to be set. The `AnthropicLLMClient` constructor's env check fires only on first actual LLM call.

- [ ] **Step 12.4: Install + verify CLI builds**

```bash
cd /Users/xuxingcheng/SHLAB/github/OpenExpertise
pnpm install
pnpm -r build
pnpm --filter @openexpertise/cli typecheck
pnpm vitest run packages/cli/
```

Expected: build green; typecheck clean; existing CLI test still passes.

- [ ] **Step 12.5: Commit**

```bash
git add packages/cli/
git commit -m "feat(cli): register agent / skill / dataset / experience dispatchers"
```

---

## Task 13: `examples/agent-echo` — smallest agent example

**Files:**
- Create: `examples/agent-echo/experience.yaml`
- Create: `examples/agent-echo/prompts/echo.md`
- Create: `examples/agent-echo/package.json`
- Create: `examples/agent-echo/README.md`

- [ ] **Step 13.1: Create `experience.yaml`**

```yaml
name: agent-echo
description: Smallest LLM-backed experience — one agent node echoes a greeting.
version: 0.1.0

state:
  schema:
    name:
      type: string
      description: Subject to greet; passed via --args
    greeting:
      type: string
      description: Agent's response

graph:
  nodes:
    - id: greet
      kind: agent
      prompt: ./prompts/echo.md
      args:
        name: World
      writes: [greeting]
  edges: []
```

- [ ] **Step 13.2: Create `prompts/echo.md`**

```markdown
Say a friendly hello to {{name}}. Keep it short — one sentence.
```

- [ ] **Step 13.3: Create `package.json`**

```json
{
  "name": "@openexpertise/example-agent-echo",
  "version": "0.1.0",
  "private": true,
  "type": "module"
}
```

- [ ] **Step 13.4: Create `README.md`**

```markdown
# agent-echo

Smallest LLM-backed OpenExpertise experience. One agent node.

Requires `ANTHROPIC_API_KEY` in the environment:

```bash
export ANTHROPIC_API_KEY=sk-...
oe run examples/agent-echo --args '{"name":"Alice"}'
```

Expected: `greeting` state field is set to a one-sentence greeting from the model.
```

- [ ] **Step 13.5: Commit**

```bash
cd /Users/xuxingcheng/SHLAB/github/OpenExpertise
git add examples/agent-echo/
git commit -m "feat(examples): agent-echo (smallest LLM-backed experience)"
```

(No live smoke test here — would call the real API. The e2e test in Task 15 covers the agent path with a mocked client.)

---

## Task 14: `examples/dataset-aggregate` — dataset + tool composition

**Files:**
- Create: `examples/dataset-aggregate/experience.yaml`
- Create: `examples/dataset-aggregate/data/sample.csv`
- Create: `examples/dataset-aggregate/tools/aggregate.mjs`
- Create: `examples/dataset-aggregate/package.json`
- Create: `examples/dataset-aggregate/README.md`

- [ ] **Step 14.1: Create `experience.yaml`**

```yaml
name: dataset-aggregate
description: Load a CSV, then aggregate it with a tool node. No LLM involved.
version: 0.1.0

state:
  schema:
    rows:
      type: array
      items: { type: object }
    total:
      type: number

graph:
  nodes:
    - id: load_rows
      kind: dataset
      source:
        type: file
        uri: ./data/sample.csv
        format: csv
      writes: [rows]
    - id: aggregate
      kind: tool
      impl: ./tools/aggregate.mjs
      reads: [rows]
      writes: [total]
  edges:
    - { from: load_rows, to: aggregate }
```

- [ ] **Step 14.2: Create `data/sample.csv`**

```
id,amount
1,10
2,25
3,7
4,18
```

- [ ] **Step 14.3: Create `tools/aggregate.mjs`**

```js
export default async function aggregate(args) {
  const rows = args._state?.rows ?? []
  const total = rows.reduce((acc, r) => acc + Number(r.amount ?? 0), 0)
  return { state_delta: { total } }
}
```

- [ ] **Step 14.4: Create `package.json`**

```json
{
  "name": "@openexpertise/example-dataset-aggregate",
  "version": "0.1.0",
  "private": true,
  "type": "module"
}
```

- [ ] **Step 14.5: Create `README.md`**

```markdown
# dataset-aggregate

Load a CSV (dataset node) then aggregate it (tool node).

```bash
oe run examples/dataset-aggregate
```

Expected final state: `{ rows: [...], total: 60 }`.
```

- [ ] **Step 14.6: Smoke test**

```bash
cd /Users/xuxingcheng/SHLAB/github/OpenExpertise
pnpm -r build
node packages/cli/dist/bin.js run examples/dataset-aggregate 2>&1 | tail -10
```

Expected: `finalState: { rows: [...], total: 60 }`.

- [ ] **Step 14.7: Commit**

```bash
git add examples/dataset-aggregate/
git commit -m "feat(examples): dataset-aggregate (csv → tool composition)"
```

---

## Task 15: Multi-kind end-to-end test (mocked Anthropic)

**Files:**
- Create: `e2e/multi-kind.e2e.test.ts`

- [ ] **Step 15.1: Write the test**

Create `e2e/multi-kind.e2e.test.ts`:
```ts
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
import { DatasetDispatcher } from '@openexpertise/node-kinds-dataset'
import { ExperienceDispatcher } from '@openexpertise/node-kinds-experience'

let dir: string
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

class CannedLLM implements LLMClient {
  public calls: LLMCompleteOpts[] = []
  async complete(opts: LLMCompleteOpts) {
    this.calls.push(opts)
    return { text: 'summarized: 3 rows seen', usage: { input_tokens: 5, output_tokens: 7 } }
  }
}

describe('multi-kind end-to-end (mocked Anthropic)', () => {
  it('runs dataset → tool → agent in sequence', async () => {
    dir = mkdtempSync(join(tmpdir(), 'oe-e2e-mk-'))
    mkdirSync(join(dir, 'data'), { recursive: true })
    mkdirSync(join(dir, 'tools'), { recursive: true })
    mkdirSync(join(dir, 'prompts'), { recursive: true })
    writeFileSync(join(dir, 'data/items.json'), JSON.stringify([{ v: 1 }, { v: 2 }, { v: 3 }]))
    writeFileSync(
      join(dir, 'tools/count.mjs'),
      `export default async (args) => ({ state_delta: { count: args._state.rows.length } })\n`,
    )
    writeFileSync(join(dir, 'prompts/summary.md'), 'There are {{count}} rows. Summarize.')
    writeFileSync(join(dir, 'experience.yaml'), [
      'name: mk',
      'version: 0.1.0',
      'state:',
      '  schema:',
      '    rows: { type: array, items: { type: object } }',
      '    count: { type: number }',
      '    summary: { type: string }',
      'graph:',
      '  nodes:',
      '    - id: load',
      '      kind: dataset',
      '      source: { type: file, uri: ./data/items.json, format: json }',
      '      writes: [rows]',
      '    - id: count',
      '      kind: tool',
      '      impl: ./tools/count.mjs',
      '      reads: [rows]',
      '      writes: [count]',
      '    - id: summarize',
      '      kind: agent',
      '      prompt: ./prompts/summary.md',
      '      reads: [count]',
      '      writes: [summary]',
      '  edges:',
      '    - { from: load,  to: count }',
      '    - { from: count, to: summarize }',
    ].join('\n'))

    const spec = parseExperienceYaml(readFileSync(join(dir, 'experience.yaml'), 'utf8'))

    const llm = new CannedLLM()
    const dispatchers = new DispatcherRegistry()
    dispatchers.register(new ToolDispatcher())
    dispatchers.register(new AgentDispatcher({ client: llm }))
    dispatchers.register(new DatasetDispatcher())
    dispatchers.register(new ExperienceDispatcher({ runExperience }))

    const result = await runExperience({
      spec, experienceDir: dir, dispatchers, events: new EventBus(),
    })

    expect(result.status).toBe('success')
    expect(result.finalState.rows).toEqual([{ v: 1 }, { v: 2 }, { v: 3 }])
    expect(result.finalState.count).toBe(3)
    expect(result.finalState.summary).toBe('summarized: 3 rows seen')

    // Agent prompt should have interpolated `count` = 3
    expect(llm.calls[0]?.messages[0]?.content).toBe('There are 3 rows. Summarize.')
  })
})
```

- [ ] **Step 15.2: Run — confirm PASS**

```bash
cd /Users/xuxingcheng/SHLAB/github/OpenExpertise
pnpm vitest run e2e/multi-kind.e2e.test.ts
```

Expected: 1/1.

- [ ] **Step 15.3: Run the full suite + clean rebuild**

```bash
pnpm clean
pnpm install
pnpm -r build
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
```

Expected: every step green. If `format:check` complains, run `pnpm format` then re-`format:check`.

- [ ] **Step 15.4: Commit**

```bash
git add e2e/multi-kind.e2e.test.ts
git commit -m "test(e2e): multi-kind end-to-end (dataset → tool → agent, mocked LLM)"
```

---

## Task 16: Final clean rebuild + dispatch final code review

- [ ] **Step 16.1: Verify clean rebuild from scratch**

```bash
cd /Users/xuxingcheng/SHLAB/github/OpenExpertise
pnpm clean
pnpm install
pnpm -r build
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
```

Expected: all green. Run count after Plan 2: original 39 + new tests (~22 new across LLM-prompt, agent, anthropic-client, skill, dataset, experience, scheduler-on-error, multi-kind e2e) ≈ 60+ tests.

- [ ] **Step 16.2: Smoke `agent-echo` is at least loadable (validation only)**

```bash
node packages/cli/dist/bin.js validate examples/agent-echo
```

Expected: exits 0 with `experience valid`. (We do NOT live-run agent-echo because that would call the real API — the multi-kind e2e proves the agent dispatcher works against a mocked client.)

- [ ] **Step 16.3: Smoke `dataset-aggregate` runs end-to-end (no API key needed)**

```bash
node packages/cli/dist/bin.js run examples/dataset-aggregate 2>&1 | tail -15
```

Expected: `finalState: { rows: [...4 items...], total: 60 }`.

- [ ] **Step 16.4: Dispatch final code-quality reviewer**

The plan executor (controller) dispatches a fresh subagent with the prompt template at `superpowers/skills/requesting-code-review/code-reviewer.md`, configured with:

- DESCRIPTION: "Plan 2 of OpenExpertise V1: heterogeneous dispatchers (agent, skill, dataset, experience) + on_error policies. Adds 4 new packages and modifies scheduler + CLI."
- BASE_SHA: the commit before Task 1 of Plan 2 (i.e., the HEAD at the end of Plan 1)
- HEAD_SHA: the latest commit after Task 15

Focus areas the reviewer should check:
- `LLMClient` abstraction boundary: are agent + skill cleanly decoupled from the Anthropic SDK?
- `AnthropicLLMClient` mapping correctness against the SDK shape (text vs. tool_use blocks).
- `DatasetDispatcher` source switch: any path that could leak SQLite handles, leave fetch responses unconsumed, or partially-read files on error?
- `ExperienceDispatcher` recursion: is the `runExperience` injection clean enough that the `core ↔ experience-dispatcher` cycle stays broken?
- `scheduler.ts` on_error policy block: is the loop termination correct in every branch? Could a retry loop leak state writes on a partial success?
- `examples/agent-echo` and `examples/dataset-aggregate`: are they minimal-but-useful demos?
- Plan 3 readiness: do the new packages cleanly expose what fan-out / pipeline / conditional / loop tasks will need?

Apply any Important issues inline; defer Minor issues to Plan 3.

- [ ] **Step 16.5: Final summary commit (if any fixes were applied)**

```bash
git status
# if there are any uncommitted fixes from the review:
git add -A
git commit -m "fix: apply Plan 2 final-review feedback"
```

---

## Coverage check against spec

| Spec section | Plan 2 task(s) | Coverage after Plan 2 |
|---|---|---|
| §2.2 priority `a` (heterogeneous nodes) | Tasks 3-10 | ✅ all 5 first-class kinds (tool was Plan 1) |
| §2.2 priority `d` (persistent structured state) | Inherited from Plan 1 | ✅ |
| §2.2 priority `e` (evolution) | — | ⏳ Plan 6 |
| §6 Dispatcher contract for `agent` | Task 3 | ✅ |
| §6 Dispatcher contract for `skill` | Task 6 | ✅ (Claude Code SKILL.md compatible) |
| §6 Dispatcher contract for `dataset` | Task 8 | ✅ (file/sqlite/http; mcp-resource deferred) |
| §6 Dispatcher contract for `experience` (nesting) | Task 10 | ✅ isolated scope; shared deferred per spec §16 |
| §9 Control flow primitives | — | ⏳ Plan 3 |
| §13 Error handling — `on_error` policies | Task 11 | ✅ retry/skip/fail_run |
| §13 Schema-validation `state_delta` failure = `fail_run` | Inherited from Plan 1 (StateStore throws) | ✅ |
| §17 SQLite library choice | Inherited from Plan 1 | ✅ `better-sqlite3` |
| §17 ANTHROPIC_API_KEY handling | Task 4, Task 12 | ✅ lazy-construction so non-LLM experiences don't require it |

No silent gaps; every Plan 2 commitment maps to a task, and every Plan 1 commitment that needed Plan 2 follow-through (the on_error TODO) is addressed.

---

## Notes for the executor

- **Strict TDD:** every code task starts with a failing test, runs red, then writes the implementation, then runs green. Don't skip the red step.
- **Run `pnpm -r build` between major tasks** when cross-package types start being referenced. Composite project references require built artifacts.
- **`@anthropic-ai/sdk` is large** (transitive deps); `pnpm install` after Task 2 will take a moment.
- **Don't run agent-echo against the real API in CI.** It's intentionally not in the e2e suite. Local smoke testing with a real `ANTHROPIC_API_KEY` is fine but optional.
- **The `getter-based proxy` for `AnthropicLLMClient`** in `cli/commands/run.ts` (Task 12) intentionally trips `@typescript-eslint/no-explicit-any` with one `as any` cast. The cast is the cheapest way to satisfy TS's structural type check on the constructor opts; refactoring it to a proper lazy-loader pattern is a Plan 3+ concern.
- **`gray-matter` is CommonJS-only** at the version pinned (`^4.0.3`); the `esModuleInterop: true` flag (already enabled in `tsconfig.base.json`) handles the default-export interop correctly.
- **`csv-parse/sync`** is the synchronous subpath of the `csv-parse` package; the async streaming API is overkill for the V1 dataset use case.
- **The `_state` / `_edge_inputs` keys** introduced in Plan 1's tool dispatcher are still the channel by which tools receive state. They're documented in `examples/dataset-aggregate/tools/aggregate.mjs`. Plan 3+ may introduce a cleaner contract.
