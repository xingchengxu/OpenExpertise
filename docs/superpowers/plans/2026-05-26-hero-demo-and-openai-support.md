# Hero Demo + OpenAI Support — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `examples/review-branch` as the canonical evolution-loop demo (Run 1 misses a SQL injection, advisor proposes a `security` dimension, Run 2 catches it). Add OpenAI as a first-class second LLM provider. Rewrite root README hero section. Produce a recording script for the GIF.

**Architecture:** A new `@openexpertise/llm-openai` package implements the existing `LLMClient` interface against OpenAI's chat-completions API. A small `llm-factory` in CLI resolves provider precedence (explicit `--llm` flag → env-var auto-detect → error). `review-branch` gains a `fetch_diff` tool node that reads a fixture diff from disk; review/verify prompts inject `{{diff}}` and narrow each reviewer's scope so the security bug is plausibly missed by the default dimensions and plausibly caught after a `security` dimension is added.

**Tech Stack:** TypeScript 5.5+, Node 20+, pnpm workspaces, vitest. New runtime dep: `openai ^4.0`. No new build tooling.

**Spec:** `docs/superpowers/specs/2026-05-26-hero-demo-and-openai-support-design.md`

---

## File Structure

**New package — `packages/llm-openai/`:**

- `package.json` — deps: `openai ^4.0`, `@openexpertise/core` (workspace)
- `tsconfig.json` — extends `tsconfig.base.json`, project ref to `core`
- `src/index.ts` — re-exports `OpenAILLMClient` and option types
- `src/client.ts` — the implementation (~120 LOC)
- `tests/client.test.ts` — request/response mapping tests with injected SDK mock

**Modified — `packages/cli/`:**

- `src/llm-factory.ts` (new) — single export `resolveLLMClient(opts) → LLMClient`
- `src/commands/run.ts` — accept `llm` option, call factory
- `src/commands/evolve.ts` — accept `llm` option, call factory
- `src/index.ts` — register `--llm <anthropic|openai>` on `run` and `evolve`
- `package.json` — add `@openexpertise/llm-openai` workspace dep
- `tests/cli.test.ts` — provider-resolution tests

**Modified — `examples/review-branch/`:**

- `fixtures/add-user-lookup.diff` (new) — small Python Flask diff with SQL injection
- `tools/fetch_diff.mjs` (new) — reads the fixture, writes `diff` to state
- `experience.yaml` — new `diff: string` state field, new `fetch_diff` node, edges
- `prompts/review.md` — inject `{{diff}}`, narrow focus to `{{$item.focus}}` only
- `prompts/verify.md` — inject `{{diff}}` so verifier grounds in code
- `README.md` — rewritten as the on-page demo walkthrough

**Modified — `e2e/review-branch.e2e.test.ts`** — scripted LLM must match new graph (fetch_diff upstream of dimensions).

**Modified — `packages/evolution/src/prompts/proposal.md`** — tighten to emphasize "what reviewer focus was missing, given the diff content."

**New docs:**

- `README.md` (root) — full hero rewrite (replaces current content above the fold)
- `docs/comparison.md` (new) — vs LangGraph / CrewAI / Mastra / Inngest stub
- `docs/demo-script.md` (new) — recording checklist for the GIF
- `docs/assets/.gitkeep` (new) — placeholder for `hero.gif`

---

## Task 1: Scaffold `@openexpertise/llm-openai` package

**Files:**

- Create: `packages/llm-openai/package.json`
- Create: `packages/llm-openai/tsconfig.json`
- Create: `packages/llm-openai/src/index.ts`
- Create: `packages/llm-openai/tests/.gitkeep`

- [ ] **Step 1: Create `packages/llm-openai/package.json`**

```json
{
  "name": "@openexpertise/llm-openai",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist"],
  "publishConfig": { "access": "public" },
  "scripts": {
    "build": "tsc -b",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@openexpertise/core": "workspace:*",
    "openai": "^4.77.0"
  }
}
```

- [ ] **Step 2: Create `packages/llm-openai/tsconfig.json`**

Mirror `packages/node-kinds-agent/tsconfig.json` (read it first to confirm exact shape; project refs declare `../core`).

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "composite": true
  },
  "include": ["src/**/*"],
  "references": [{ "path": "../core" }]
}
```

- [ ] **Step 3: Create `packages/llm-openai/src/index.ts`**

```ts
export { OpenAILLMClient, type OpenAILLMClientOpts } from './client.js'
```

This will fail to typecheck until Task 2 creates `client.ts` — that's the TDD red state.

- [ ] **Step 4: Create empty `packages/llm-openai/tests/.gitkeep`**

Empty file so the test dir is committable.

- [ ] **Step 5: Run `pnpm install` to wire the workspace**

```bash
pnpm install
```

Expected: openai package downloaded, workspace links resolved.

- [ ] **Step 6: Commit**

```bash
git add packages/llm-openai/
git commit -m "scaffold: @openexpertise/llm-openai package"
```

---

## Task 2: `OpenAILLMClient` — text-only `complete()` path (TDD)

**Files:**

- Create: `packages/llm-openai/src/client.ts`
- Create: `packages/llm-openai/tests/client.test.ts`

**Reference:** read `packages/node-kinds-agent/src/anthropic-client.ts` first — the OpenAI client mirrors its shape and error-handling.

- [ ] **Step 1: Write the failing test for text-only completion**

Create `packages/llm-openai/tests/client.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { OpenAILLMClient } from '../src/index.js'

function fakeSdk(scripted: unknown) {
  return {
    chat: {
      completions: {
        create: async (req: unknown) => {
          ;(fakeSdk as any).lastReq = req
          return scripted as never
        },
      },
    },
  }
}

describe('OpenAILLMClient — text only', () => {
  it('maps messages and system into an OpenAI chat-completions request', async () => {
    const sdk = fakeSdk({
      choices: [{ message: { role: 'assistant', content: 'hi there', tool_calls: undefined } }],
      usage: { prompt_tokens: 7, completion_tokens: 3 },
    })
    const client = new OpenAILLMClient({ sdkClient: sdk as never })

    const result = await client.complete({
      model: 'gpt-4o-2024-11-20',
      system: 'be terse',
      messages: [{ role: 'user', content: 'hello' }],
    })

    expect(result.text).toBe('hi there')
    expect(result.tool_calls).toBeUndefined()
    expect(result.usage).toEqual({ input_tokens: 7, output_tokens: 3 })
    expect((fakeSdk as any).lastReq).toMatchObject({
      model: 'gpt-4o-2024-11-20',
      messages: [
        { role: 'system', content: 'be terse' },
        { role: 'user', content: 'hello' },
      ],
    })
  })

  it('throws when no API key and no sdkClient injected', () => {
    const prev = process.env.OPENAI_API_KEY
    delete process.env.OPENAI_API_KEY
    expect(() => new OpenAILLMClient()).toThrow(/OPENAI_API_KEY/)
    if (prev !== undefined) process.env.OPENAI_API_KEY = prev
  })
})
```

- [ ] **Step 2: Run the test, confirm failure**

```bash
pnpm --filter @openexpertise/llm-openai test 2>&1 | tail -20
```

Expected: FAIL — `OpenAILLMClient` not found.

- [ ] **Step 3: Implement `packages/llm-openai/src/client.ts`**

```ts
import OpenAI from 'openai'
import type {
  LLMClient,
  LLMCompleteOpts,
  LLMCompleteResult,
  LLMMessage,
} from '@openexpertise/core'

export interface OpenAILLMClientOpts {
  apiKey?: string
  sdkClient?: Pick<OpenAI, 'chat'>
}

type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null }

export class OpenAILLMClient implements LLMClient {
  private readonly sdk: Pick<OpenAI, 'chat'>

  constructor(opts: OpenAILLMClientOpts = {}) {
    if (opts.sdkClient) {
      this.sdk = opts.sdkClient
      return
    }
    const apiKey = opts.apiKey ?? process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error(
        'OpenAILLMClient requires OPENAI_API_KEY (env or constructor opt) or an injected sdkClient',
      )
    }
    this.sdk = new OpenAI({ apiKey })
  }

  async complete(opts: LLMCompleteOpts): Promise<LLMCompleteResult> {
    const messages: ChatMessage[] = []
    if (opts.system) messages.push({ role: 'system', content: opts.system })
    for (const m of opts.messages) messages.push(this.mapInbound(m))

    const request: Record<string, unknown> = {
      model: opts.model,
      messages,
      max_tokens: opts.max_tokens ?? 4096,
    }

    const response = (await this.sdk.chat.completions.create(request as never)) as {
      choices?: Array<{
        message?: { content?: string | null; tool_calls?: unknown[] }
        finish_reason?: string
      }>
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }

    const choice = response.choices?.[0]
    const text = choice?.message?.content ?? ''
    const result: LLMCompleteResult = { text }
    if (response.usage) {
      result.usage = {
        input_tokens: response.usage.prompt_tokens ?? 0,
        output_tokens: response.usage.completion_tokens ?? 0,
      }
    }
    if (choice?.finish_reason) result.stop_reason = choice.finish_reason
    return result
  }

  private mapInbound(m: LLMMessage): ChatMessage {
    return { role: m.role, content: m.content }
  }
}
```

- [ ] **Step 4: Run the test, confirm pass**

```bash
pnpm --filter @openexpertise/llm-openai build && pnpm --filter @openexpertise/llm-openai test 2>&1 | tail -15
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/llm-openai/src/client.ts packages/llm-openai/tests/client.test.ts
git commit -m "feat(llm-openai): text-only complete() path"
```

---

## Task 3: `OpenAILLMClient` — tool / function-call round-trip (TDD)

**Files:**

- Modify: `packages/llm-openai/src/client.ts`
- Modify: `packages/llm-openai/tests/client.test.ts`

- [ ] **Step 1: Append the failing tool round-trip test**

Append to `packages/llm-openai/tests/client.test.ts`:

```ts
describe('OpenAILLMClient — tool round-trip', () => {
  it('maps LLMTool[] to OpenAI tools and forces tool_choice when exactly one tool', async () => {
    const sdk = fakeSdk({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              {
                id: 'call_1',
                type: 'function',
                function: { name: 'structured_output', arguments: '{"x":42}' },
              },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
    })
    const client = new OpenAILLMClient({ sdkClient: sdk as never })

    const result = await client.complete({
      model: 'gpt-4o-2024-11-20',
      messages: [{ role: 'user', content: 'give me x' }],
      tools: [
        {
          name: 'structured_output',
          description: 'return structured data',
          input_schema: { type: 'object', properties: { x: { type: 'number' } } },
        },
      ],
    })

    expect(result.tool_calls).toEqual([{ name: 'structured_output', input: { x: 42 } }])
    expect(result.stop_reason).toBe('tool_calls')
    const req: any = (fakeSdk as any).lastReq
    expect(req.tools).toEqual([
      {
        type: 'function',
        function: {
          name: 'structured_output',
          description: 'return structured data',
          parameters: { type: 'object', properties: { x: { type: 'number' } } },
        },
      },
    ])
    expect(req.tool_choice).toEqual({
      type: 'function',
      function: { name: 'structured_output' },
    })
  })

  it("uses tool_choice 'required' when multiple tools given", async () => {
    const sdk = fakeSdk({ choices: [{ message: { content: '', tool_calls: [] } }] })
    const client = new OpenAILLMClient({ sdkClient: sdk as never })
    await client.complete({
      model: 'gpt-4o-2024-11-20',
      messages: [{ role: 'user', content: 'x' }],
      tools: [
        { name: 'a', description: '', input_schema: {} },
        { name: 'b', description: '', input_schema: {} },
      ],
    })
    expect((fakeSdk as any).lastReq.tool_choice).toBe('required')
  })
})
```

- [ ] **Step 2: Run the test, confirm failure**

```bash
pnpm --filter @openexpertise/llm-openai test 2>&1 | tail -15
```

Expected: FAIL — tools not yet mapped; `tool_calls` undefined.

- [ ] **Step 3: Extend `complete()` to handle tools**

In `packages/llm-openai/src/client.ts`, replace the body of `complete()` with:

```ts
async complete(opts: LLMCompleteOpts): Promise<LLMCompleteResult> {
  const messages: ChatMessage[] = []
  if (opts.system) messages.push({ role: 'system', content: opts.system })
  for (const m of opts.messages) messages.push(this.mapInbound(m))

  const request: Record<string, unknown> = {
    model: opts.model,
    messages,
    max_tokens: opts.max_tokens ?? 4096,
  }

  if (opts.tools && opts.tools.length > 0) {
    request.tools = opts.tools.map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
      },
    }))
    request.tool_choice =
      opts.tools.length === 1
        ? { type: 'function' as const, function: { name: opts.tools[0]!.name } }
        : ('required' as const)
  }

  const response = (await this.sdk.chat.completions.create(request as never)) as {
    choices?: Array<{
      message?: {
        content?: string | null
        tool_calls?: Array<{
          id?: string
          type?: string
          function?: { name?: string; arguments?: string }
        }>
      }
      finish_reason?: string
    }>
    usage?: { prompt_tokens?: number; completion_tokens?: number }
  }

  const choice = response.choices?.[0]
  const text = choice?.message?.content ?? ''
  const result: LLMCompleteResult = { text }

  const rawCalls = choice?.message?.tool_calls ?? []
  if (rawCalls.length > 0) {
    const tool_calls = rawCalls
      .filter((c) => c.type === 'function' && c.function?.name)
      .map((c) => ({
        name: c.function!.name!,
        input: this.parseArguments(c.function!.arguments ?? ''),
      }))
    if (tool_calls.length > 0) result.tool_calls = tool_calls
  }

  if (response.usage) {
    result.usage = {
      input_tokens: response.usage.prompt_tokens ?? 0,
      output_tokens: response.usage.completion_tokens ?? 0,
    }
  }
  if (choice?.finish_reason) result.stop_reason = choice.finish_reason
  return result
}

private parseArguments(raw: string): unknown {
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch {
    return { _raw: raw }
  }
}
```

- [ ] **Step 4: Run the tests, confirm pass**

```bash
pnpm --filter @openexpertise/llm-openai build && pnpm --filter @openexpertise/llm-openai test 2>&1 | tail -15
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/llm-openai/src/client.ts packages/llm-openai/tests/client.test.ts
git commit -m "feat(llm-openai): tool round-trip with tool_choice forcing"
```

---

## Task 4: `OpenAILLMClient` — edge cases (TDD)

**Files:**

- Modify: `packages/llm-openai/tests/client.test.ts`

The Task 3 implementation already covers these — this task asserts the contract is correct via tests, no production-code changes expected (and if a test fails, we have a bug to fix).

- [ ] **Step 1: Append the edge-case tests**

Append to `packages/llm-openai/tests/client.test.ts`:

```ts
describe('OpenAILLMClient — edge cases', () => {
  it('returns empty result.tool_calls when no function call in response', async () => {
    const sdk = fakeSdk({
      choices: [{ message: { content: 'just talking', tool_calls: [] }, finish_reason: 'stop' }],
    })
    const client = new OpenAILLMClient({ sdkClient: sdk as never })
    const result = await client.complete({
      model: 'gpt-4o-2024-11-20',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [{ name: 't', description: '', input_schema: {} }],
    })
    expect(result.text).toBe('just talking')
    expect(result.tool_calls).toBeUndefined()
    expect(result.stop_reason).toBe('stop')
  })

  it('falls back to raw string when function.arguments is not valid JSON', async () => {
    const sdk = fakeSdk({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              {
                id: '1',
                type: 'function',
                function: { name: 'x', arguments: '{not valid json' },
              },
            ],
          },
        },
      ],
    })
    const client = new OpenAILLMClient({ sdkClient: sdk as never })
    const result = await client.complete({
      model: 'gpt-4o-2024-11-20',
      messages: [{ role: 'user', content: 'x' }],
      tools: [{ name: 'x', description: '', input_schema: {} }],
    })
    expect(result.tool_calls).toEqual([{ name: 'x', input: { _raw: '{not valid json' } }])
  })

  it('honors max_tokens override', async () => {
    const sdk = fakeSdk({ choices: [{ message: { content: 'ok' } }] })
    const client = new OpenAILLMClient({ sdkClient: sdk as never })
    await client.complete({
      model: 'gpt-4o-2024-11-20',
      messages: [{ role: 'user', content: 'x' }],
      max_tokens: 100,
    })
    expect((fakeSdk as any).lastReq.max_tokens).toBe(100)
  })
})
```

- [ ] **Step 2: Run the tests, confirm pass**

```bash
pnpm --filter @openexpertise/llm-openai test 2>&1 | tail -15
```

Expected: PASS (7 tests total in this file).

If any fail, fix `client.ts` accordingly before committing.

- [ ] **Step 3: Commit**

```bash
git add packages/llm-openai/tests/client.test.ts
git commit -m "test(llm-openai): edge cases — no tool call, bad JSON, max_tokens"
```

---

## Task 5: LLM provider factory in CLI (TDD)

**Files:**

- Create: `packages/cli/src/llm-factory.ts`
- Create: `packages/cli/tests/llm-factory.test.ts`
- Modify: `packages/cli/package.json`

- [ ] **Step 1: Add `@openexpertise/llm-openai` to CLI deps**

In `packages/cli/package.json`, add to `dependencies`:

```json
"@openexpertise/llm-openai": "workspace:*"
```

Run `pnpm install` to wire.

- [ ] **Step 2: Write the failing factory test**

Create `packages/cli/tests/llm-factory.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { resolveLLMProvider } from '../src/llm-factory.js'

const ENV_KEYS = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY'] as const

describe('resolveLLMProvider', () => {
  beforeEach(() => {
    for (const k of ENV_KEYS) delete process.env[k]
  })

  it('honors explicit --llm anthropic', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-a'
    expect(resolveLLMProvider({ flag: 'anthropic' })).toBe('anthropic')
  })

  it('honors explicit --llm openai', () => {
    process.env.OPENAI_API_KEY = 'sk-o'
    expect(resolveLLMProvider({ flag: 'openai' })).toBe('openai')
  })

  it('auto-detects openai when only OPENAI_API_KEY set', () => {
    process.env.OPENAI_API_KEY = 'sk-o'
    expect(resolveLLMProvider({})).toBe('openai')
  })

  it('auto-detects anthropic when only ANTHROPIC_API_KEY set', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-a'
    expect(resolveLLMProvider({})).toBe('anthropic')
  })

  it('defaults to anthropic when both env vars set (no flag)', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-a'
    process.env.OPENAI_API_KEY = 'sk-o'
    expect(resolveLLMProvider({})).toBe('anthropic')
  })

  it('throws a helpful error when neither key nor flag', () => {
    expect(() => resolveLLMProvider({})).toThrow(
      /ANTHROPIC_API_KEY.*OPENAI_API_KEY|OPENAI_API_KEY.*ANTHROPIC_API_KEY/,
    )
  })

  it('throws when flag set to a value with no matching key', () => {
    expect(() => resolveLLMProvider({ flag: 'openai' })).toThrow(/OPENAI_API_KEY/)
  })
})
```

- [ ] **Step 3: Run the test, confirm failure**

```bash
pnpm --filter @openexpertise/cli test 2>&1 | tail -20
```

Expected: FAIL — `resolveLLMProvider` not found.

- [ ] **Step 4: Implement `packages/cli/src/llm-factory.ts`**

```ts
import type { LLMClient } from '@openexpertise/core'

export type LLMProvider = 'anthropic' | 'openai'

export interface ResolveLLMProviderOpts {
  flag?: string
}

export function resolveLLMProvider(opts: ResolveLLMProviderOpts): LLMProvider {
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY)
  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY)

  if (opts.flag === 'anthropic') {
    if (!hasAnthropic) throw new Error('--llm anthropic requires ANTHROPIC_API_KEY')
    return 'anthropic'
  }
  if (opts.flag === 'openai') {
    if (!hasOpenAI) throw new Error('--llm openai requires OPENAI_API_KEY')
    return 'openai'
  }
  if (opts.flag !== undefined) {
    throw new Error(`unknown --llm value: ${opts.flag}. Use 'anthropic' or 'openai'.`)
  }

  if (hasAnthropic) return 'anthropic'
  if (hasOpenAI) return 'openai'
  throw new Error(
    'No LLM provider configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY, or pass --llm <anthropic|openai>.',
  )
}

export function defaultModelFor(provider: LLMProvider): string {
  return provider === 'anthropic' ? 'claude-sonnet-4-6' : 'gpt-4o-2024-11-20'
}

export async function makeLLMClient(provider: LLMProvider): Promise<LLMClient> {
  if (provider === 'anthropic') {
    const { AnthropicLLMClient } = await import('@openexpertise/node-kinds-agent')
    return new AnthropicLLMClient()
  }
  const { OpenAILLMClient } = await import('@openexpertise/llm-openai')
  return new OpenAILLMClient()
}
```

- [ ] **Step 5: Run the tests, confirm pass**

```bash
pnpm --filter @openexpertise/cli build && pnpm --filter @openexpertise/cli test 2>&1 | tail -15
```

Expected: PASS (existing CLI tests + 7 new ones).

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/llm-factory.ts packages/cli/tests/llm-factory.test.ts packages/cli/package.json pnpm-lock.yaml
git commit -m "feat(cli): resolveLLMProvider + makeLLMClient factory"
```

---

## Task 6: Wire `--llm` flag into `run` and `evolve` commands

**Files:**

- Modify: `packages/cli/src/index.ts`
- Modify: `packages/cli/src/commands/run.ts`
- Modify: `packages/cli/src/commands/evolve.ts`

**Reference:** read `packages/cli/src/commands/run.ts` and `evolve.ts` first to see the current lazy-getter Anthropic client construction (Plan 2 introduced this). Replace those getters with calls to `makeLLMClient(provider)` from the factory.

- [ ] **Step 1: Add `--llm` option to `oe run`**

In `packages/cli/src/index.ts`, locate the `program.command('run')` chain and add the option (before `.action(...)`):

```ts
.option('--llm <provider>', 'LLM provider: anthropic | openai (auto-detected from env)')
```

Mirror on the `program.command('evolve')` chain.

In the `run` action, pass `cmdOpts.llm` through to `runCommand`. Same for `evolve`.

- [ ] **Step 2: Modify `runCommand` signature to accept `llm`**

In `packages/cli/src/commands/run.ts`:

- Add `llm?: string` to the options interface.
- **Preserve the existing lazy-construction semantics.** Plan 2 introduced a getter-based proxy specifically so that experiences without agent/skill nodes (e.g. `examples/hello-tool`) can run without any LLM env var. The new code must preserve this — `resolveLLMProvider` is only called when the first `complete()` actually fires, not at command startup.

Read the current file first to see the exact existing pattern. Then replace the Anthropic-only lazy block with this closure-based equivalent that switches on the resolved provider:

```ts
import { makeLLMClient, resolveLLMProvider } from '../llm-factory.js'
import type { LLMClient } from '@openexpertise/core'

// Lazy: resolves provider + constructs client only on first complete() call.
// Keeps no-LLM experiences (hello-tool) runnable without any env var.
let cached: LLMClient | null = null
const llm: LLMClient = {
  async complete(opts) {
    if (!cached) {
      const provider = resolveLLMProvider({ flag: cmdOpts.llm })
      cached = await makeLLMClient(provider)
    }
    return cached.complete(opts)
  },
}
```

(`cmdOpts.llm` is captured from the outer command-options closure — same place where other CLI flags are read.)

Pass `llm` to whichever dispatcher constructors currently take the Anthropic client (typically `AgentDispatcher`, possibly `SkillDispatcher`). Behavior is identical for experiences using one provider; only the underlying class differs.

- [ ] **Step 3: Modify `evolveCommand` similarly**

In `packages/cli/src/commands/evolve.ts`, do the same swap. `evolve` differs from `run` in that it always needs an LLM (the advisor calls it), so the eagerness vs laziness distinction matters less — but use the same closure pattern for consistency.

- [ ] **Step 4: Update an existing CLI smoke test or add a new one**

Add to `packages/cli/tests/cli.test.ts` (or `llm-factory.test.ts`) a tiny test that imports `runCommand` shape — actually, since the existing test patterns are sparse here, just rely on type checks + the factory unit tests + the e2e test (Task 10) to cover the integration.

Skip explicit test if pattern doesn't exist; the e2e test will catch breakage.

- [ ] **Step 5: Typecheck + build the CLI**

```bash
pnpm --filter @openexpertise/cli build && pnpm --filter @openexpertise/cli typecheck 2>&1 | tail -15
```

Expected: 0 errors.

- [ ] **Step 6: Smoke-test the existing hello-tool example still runs**

```bash
node packages/cli/dist/bin.js validate examples/hello-tool 2>&1 | tail -5
```

Expected: exit 0 (validate doesn't need LLM).

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/index.ts packages/cli/src/commands/run.ts packages/cli/src/commands/evolve.ts
git commit -m "feat(cli): --llm flag wires anthropic|openai providers via factory"
```

---

## Task 7: Create the fixture diff

**Files:**

- Create: `examples/review-branch/fixtures/add-user-lookup.diff`

- [ ] **Step 1: Create `examples/review-branch/fixtures/add-user-lookup.diff`**

```diff
diff --git a/app/routes/users.py b/app/routes/users.py
index 4f3d2a1..b1c8e07 100644
--- a/app/routes/users.py
+++ b/app/routes/users.py
@@ -8,3 +8,12 @@ app = Flask(__name__)
 @app.route("/healthz")
 def healthz():
     return {"ok": True}
+
+@app.route("/users/<user_id>", methods=["GET"])
+def get_user(user_id):
+    cursor = db.cursor()
+    cursor.execute(f"SELECT id, name, email FROM users WHERE id={user_id}")
+    row = cursor.fetchone()
+    return {"id": row[0], "name": row[1], "email": row[2]}
+
+# TODO: add tests in tests/test_users.py
```

Notes on what this fixture deliberately contains:

- `f"SELECT ... WHERE id={user_id}"` — **security** (SQL injection). The dimension we want the advisor to propose adding.
- `row[1], row[2]` without checking `row is None` — **bugs** (legitimate finding for the bugs reviewer).
- No test file added — **tests** (legitimate finding for the tests reviewer).
- Cursor not closed — minor **perf**/resource concern (legitimate finding for the perf reviewer).

The narrowed prompts in Task 9 will make the bugs/perf/tests reviewers stay in their lane and not opportunistically flag the injection.

- [ ] **Step 2: Commit**

```bash
git add examples/review-branch/fixtures/add-user-lookup.diff
git commit -m "demo(review-branch): fixture diff with SQL injection + null deref + missing tests"
```

---

## Task 8: Add `fetch_diff` tool + wire into `experience.yaml`

**Files:**

- Create: `examples/review-branch/tools/fetch_diff.mjs`
- Modify: `examples/review-branch/experience.yaml`

- [ ] **Step 1: Create `examples/review-branch/tools/fetch_diff.mjs`**

```js
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

export default async function fetchDiff(_bundle, _ctx) {
  const path = resolve(HERE, '..', 'fixtures', 'add-user-lookup.diff')
  const diff = readFileSync(path, 'utf8')
  return { state_delta: { diff } }
}
```

- [ ] **Step 2: Update `examples/review-branch/experience.yaml`**

Replace the file with:

```yaml
name: review-branch
description: Review a code diff across dimensions; verify each finding before counting it.
version: 0.1.0

state:
  schema:
    pr_id: { type: string }
    diff: { type: string }
    dimensions: { type: array, items: { type: object } }
    findings: { type: array, items: { type: object }, merge: array_append }
    verified_findings: { type: array, items: { type: object }, merge: array_append }
    risk_score: { type: number }

phases:
  - { id: collect }
  - { id: review }
  - { id: verify }
  - { id: score }

graph:
  nodes:
    - id: fetch_diff
      kind: tool
      phase: collect
      impl: ./tools/fetch_diff.mjs
      writes: [diff]
    - id: seed_dimensions
      kind: tool
      phase: collect
      impl: ./tools/list_dimensions.mjs
      writes: [dimensions]
    - id: bug_review
      kind: agent
      phase: review
      prompt: ./prompts/review.md
      reads: [diff]
      schema:
        type: object
        required: [findings]
        properties:
          findings:
            type: array
            items:
              type: object
              required: [title, severity]
              properties:
                title: { type: string }
                severity: { type: string }
      for_each: { source: $.dimensions }
      writes: [findings]
    - id: verify_finding
      kind: agent
      phase: verify
      prompt: ./prompts/verify.md
      reads: [diff]
      schema:
        type: object
        required: [verified_findings]
        properties:
          verified_findings:
            type: array
            items:
              type: object
              required: [is_real]
              properties:
                is_real: { type: boolean }
      for_each: { source: $.findings }
      writes: [verified_findings]
    - id: score
      kind: agent
      phase: score
      prompt: ./prompts/score.md
      reads: [verified_findings]
      schema:
        type: object
        required: [risk_score]
        properties:
          risk_score: { type: number }
      writes: [risk_score]
  edges:
    - { from: fetch_diff, to: seed_dimensions }
    - { from: seed_dimensions, to: bug_review }
    - { from: bug_review, to: verify_finding }
    - { from: verify_finding, to: score, when: 'length($.findings) > 0' }
```

- [ ] **Step 3: Validate the experience**

```bash
pnpm --filter @openexpertise/cli build
node packages/cli/dist/bin.js validate examples/review-branch 2>&1 | tail -5
```

Expected: exit 0, "validation passed" or equivalent.

- [ ] **Step 4: Commit**

```bash
git add examples/review-branch/tools/fetch_diff.mjs examples/review-branch/experience.yaml
git commit -m "demo(review-branch): fetch_diff tool + diff state field"
```

---

## Task 9: Narrow review prompts + inject `{{diff}}`

**Files:**

- Modify: `examples/review-branch/prompts/review.md`
- Modify: `examples/review-branch/prompts/verify.md`

- [ ] **Step 1: Rewrite `examples/review-branch/prompts/review.md`**

```markdown
You are reviewing a code change. You are the **{{$item.key}}** reviewer.

Focus ONLY on **{{$item.focus}}**. Do NOT report issues outside this scope —
other reviewers handle other dimensions, and out-of-scope findings will be
discarded.

Code under review:

\`\`\`diff
{{diff}}
\`\`\`

Return findings via the `structured_output` tool. Each finding needs:

- `title` (≤80 chars, specific)
- `severity` (one of `low`, `medium`, `high`)

If there are no in-scope issues, return `{ "findings": [] }`.
```

Note: in the actual file, the triple-backticks around `{{diff}}` are real backticks (not escaped); leave them as ``` so the LLM sees a properly fenced diff.

- [ ] **Step 2: Rewrite `examples/review-branch/prompts/verify.md`**

```markdown
You are an adversarial verifier. A reviewer has flagged this issue:

**{{$item.title}}** _(severity: {{$item.severity}})_

The code under review:

\`\`\`diff
{{diff}}
\`\`\`

Decide whether this finding is a real, actionable issue in the given diff.
Return via the `structured_output` tool:

- `verified_findings`: array of one object
- The object must have `is_real` (boolean). Optionally include `reason` (string ≤200 chars).

Reject findings that are speculative, out-of-scope, or not supported by the diff.
```

Same backtick note as above.

- [ ] **Step 3: Validate prompt files exist and load (smoke)**

```bash
node packages/cli/dist/bin.js validate examples/review-branch 2>&1 | tail -3
```

Expected: still passes (prompts are referenced as paths; validator only confirms files exist).

- [ ] **Step 4: Commit**

```bash
git add examples/review-branch/prompts/review.md examples/review-branch/prompts/verify.md
git commit -m "demo(review-branch): narrow reviewer prompts + inject diff"
```

---

## Task 10: Update `e2e/review-branch.e2e.test.ts` for the new graph

**Files:**

- Modify: `e2e/review-branch.e2e.test.ts`

**Reference:** the scripted LLM in this test matches prompts by substring. The new prompts say "You are the X reviewer" and "adversarial verifier" — the existing substring matches (`reviewing dimension`, `Adversarially verify`) need updating.

- [ ] **Step 1: Update the scripted LLM matchers**

Open `e2e/review-branch.e2e.test.ts`. Replace the `ScriptedLLM.complete` body so it matches the new prompt wording:

```ts
async complete(opts: LLMCompleteOpts) {
  this.calls.push(opts)
  const prompt = opts.messages[0]?.content ?? ''
  if (prompt.includes('You are the') && prompt.includes('reviewer')) {
    return {
      text: '',
      tool_calls: [
        {
          name: 'structured_output',
          input: { findings: [{ title: 'sample bug', severity: 'high' }] },
        },
      ],
    }
  }
  if (prompt.includes('adversarial verifier')) {
    return {
      text: '',
      tool_calls: [
        { name: 'structured_output', input: { verified_findings: [{ is_real: true }] } },
      ],
    }
  }
  if (prompt.includes('risk_score')) {
    return {
      text: '',
      tool_calls: [{ name: 'structured_output', input: { risk_score: 0.75 } }],
    }
  }
  return { text: 'unknown prompt' }
}
```

- [ ] **Step 2: Run the e2e test, confirm pass**

```bash
pnpm test e2e/review-branch.e2e.test.ts 2>&1 | tail -20
```

Expected: PASS. If the test was checking `findings.length === 3`, the assertion still holds (3 dimensions × 1 finding each).

If it fails because the `diff` field isn't being substituted into the prompt, the resolver may not have `diff` available when `for_each` expands. The fix is to verify the new edge `fetch_diff → seed_dimensions` is in place (Task 8) — every fan-out instance reads the same `diff` from state, which `runExperience` should provide via the state view.

- [ ] **Step 3: Run the full test suite to confirm no regression**

```bash
pnpm test 2>&1 | tail -10
```

Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add e2e/review-branch.e2e.test.ts
git commit -m "test(e2e): review-branch matches narrowed prompts + diff injection"
```

---

## Task 11: Tighten the evolution advisor system prompt

**Files:**

- Modify: `packages/evolution/src/prompts/proposal.md`

**Why:** the demo arc requires the advisor to reliably propose `add-node` (or rather, an `add-dataset-case`-style change to `list_dimensions.mjs`) for the `security` dimension when given the diff and a run that missed it. The current prompt is generic; this tweak biases it toward "look at the code, then ask what reviewer focus is missing."

- [ ] **Step 1: Read the existing prompt for context**

```bash
cat packages/evolution/src/prompts/proposal.md | head -80
```

- [ ] **Step 2: Append a focus paragraph**

Add at the end of the system prompt (or in the most appropriate section — read first to decide placement):

```markdown

## When the experience has a `dimensions`-style fan-out

If the experience uses a `for_each` over a list of "dimensions", "checks", "areas",
or similar (a fan-out where each item is a named focus area), and the run produced
findings or state that hint at a focus area NOT present in the dimension list, prefer
proposing an `add-dataset-case` (or equivalent edit to the tool that seeds the
dimensions) that adds the missing focus area. State the missing focus clearly in
the `title`, e.g. "Add `security` dimension".

Consider the actual code content (e.g. the `diff` state field if present) when
deciding what's missing — patterns like raw SQL string interpolation suggest a
security reviewer; missing log statements suggest an observability reviewer.
```

- [ ] **Step 3: Confirm the existing advisor tests still pass**

```bash
pnpm --filter @openexpertise/evolution build && pnpm --filter @openexpertise/evolution test 2>&1 | tail -15
```

Expected: 4 advisor tests still PASS (tests use a canned LLM, so prompt content doesn't affect them).

- [ ] **Step 4: Commit**

```bash
git add packages/evolution/src/prompts/proposal.md
git commit -m "feat(evolution): bias advisor toward missing-dimension proposals when diff present"
```

---

## Task 12: Root README hero rewrite

**Files:**

- Modify: `README.md` (root)

**Reference:** read the current root README first; the architecture/CLI table sections move below the fold but stay intact.

- [ ] **Step 1: Rewrite the top of `README.md`**

Replace everything from `# OpenExpertise` down to (but not including) `## All CLI commands` with:

````markdown
# OpenExpertise

> Heterogeneous executable graphs that codify expert knowledge — deterministic, persistent, and self-improving.

OpenExpertise is the **execution engine for "experience flows"**: graphs whose nodes can be tools, datasets, Claude/GPT agents, callable skills, or other experiences. Runs are durable artifacts (SQLite blackboard, JSONL event log), and the evolution advisor proposes graph upgrades after each run.

![hero demo placeholder](docs/assets/hero.gif)

## 90-second demo — the graph improves itself

```bash
git clone <repo-url> && cd OpenExpertise
pnpm install && pnpm -r build

export ANTHROPIC_API_KEY=sk-...    # or OPENAI_API_KEY
node packages/cli/dist/bin.js run examples/review-branch --tui
```

**Run 1** — three reviewers (bugs / perf / tests) read the diff. The SQL injection is missed:

```
ⓘ run-2026-05-26-a1b2c3 finished
  findings: 3 issues (null deref, missing test, unclosed cursor)
  risk_score: 0.30
```

**Evolve** — ask the advisor what's missing:

```bash
node packages/cli/dist/bin.js evolve run-2026-05-26-a1b2c3
# → wrote .openexpertise/proposals/run-2026-05-26-a1b2c3.md
#   proposal: "Add `security` dimension"
git apply .openexpertise/proposals/run-2026-05-26-a1b2c3.diff
```

**Run 2** — same command. Now four reviewers. SQL injection caught:

```
ⓘ run-2026-05-26-d4e5f6 finished
  findings: 4 issues (+ SQL injection in /users/<id>)
  risk_score: 0.85
```

The experience improved itself. State persisted across runs. The graph is a versioned artifact.

## Why OpenExpertise

- **Heterogeneous nodes.** Mix tools (deterministic code), agents (LLM calls with structured output), skills (SKILL.md packages), datasets (file / SQLite / HTTP), and nested experiences in a single graph.
- **Durable state.** A per-experience SQLite blackboard with declared schema and merge strategies. `oe state findings` works hours later.
- **Evolution loop.** After every run, the advisor reads the events + state diff and proposes graph upgrades (add node, tune param, add dataset case) as `git apply`-ready diffs.
- **Two LLM providers.** Anthropic and OpenAI, switch via `--llm` or env-var auto-detect.

For a fuller comparison vs LangGraph / CrewAI / Mastra / Inngest see [`docs/comparison.md`](docs/comparison.md).

## Install

```bash
git clone <repo-url> && cd OpenExpertise
pnpm install && pnpm -r build
node packages/cli/dist/bin.js --help
```

(Publication to npm is configured per-package; once npm-published you'll be able to `npm i -g @openexpertise/cli`.)

## Quick start — smaller examples

```bash
# Pure-tool, no LLM needed:
node packages/cli/dist/bin.js run examples/hello-tool
# → finalState: { greeting: 'hello, World' }

# Dataset aggregate:
node packages/cli/dist/bin.js run examples/dataset-aggregate
# → finalState: { rows: [...], total: 60 }
```
````

Leave everything from `## All CLI commands` down unchanged.

- [ ] **Step 2: Verify markdown renders sanely**

```bash
head -100 README.md
```

Visually confirm: heading hierarchy clean, no orphaned backticks, hero placeholder image is referenced.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(readme): hero section with evolution-loop narrative"
```

---

## Task 13: `docs/comparison.md` stub

**Files:**

- Create: `docs/comparison.md`

- [ ] **Step 1: Create the comparison doc**

```markdown
# OpenExpertise vs the alternatives

A short take on how OpenExpertise positions against the most-asked-about peers. Fuller treatment as the project matures and we get specific feedback.

## vs LangGraph

LangGraph is a Python library for building stateful, multi-actor LLM applications as graphs. It's deeply integrated with LangChain and excellent at iterative agent loops.

**Where they overlap:** graph-based orchestration, state, conditional edges.

**Where OpenExpertise differs:**

- Heterogeneous node kinds in one graph (tool, agent, skill, dataset, experience). LangGraph nodes are typically Python functions wrapping LLM calls.
- Declarative YAML format with strict schema validation — graph structure is reviewable by non-engineers.
- TypeScript / Node runtime — fits front-end-adjacent teams better.
- An explicit evolution advisor that proposes graph upgrades from runtime traces.

## vs CrewAI

CrewAI optimizes for multi-agent collaboration ("crews" of role-playing agents). The mental model is agent teams.

**Where they overlap:** structured agent orchestration, role specialization.

**Where OpenExpertise differs:**

- The unit is an _experience_ — a graph of mixed nodes, not a team of agents. Most nodes aren't LLM calls.
- State is structured and persistent across runs; CrewAI state is per-run.
- Determinism: tool/dataset nodes are pure code with cache keys. Reruns don't pay LLM cost.

## vs Mastra

Mastra is a TypeScript framework for building AI applications with workflows, agents, and RAG.

**Where they overlap:** TypeScript, workflows-as-graphs, agent abstractions.

**Where OpenExpertise differs:**

- Declarative YAML graph + Claude Code authoring skill (`experience-creator`) — the graph is data, not code.
- First-class evolution loop.
- Aimed at codifying _human_ expertise into a runnable artifact, not at building production app backends. Different problem framing.

## vs Inngest / Temporal

Inngest and Temporal are durable workflow engines (general-purpose, not LLM-specific) with retries, schedules, and event-driven steps.

**Where they overlap:** durability, retries, observable runs.

**Where OpenExpertise differs:**

- LLM-aware primitives (agent kind, structured output, schema-validated tool calls).
- Lighter — no separate service to deploy; runs as a CLI against a local SQLite store.
- Per-experience state schema rather than free-form workflow inputs/outputs.
- Trade-off: less production-grade as a general workflow engine. We're a different shape of tool.

## Picking the right one

- **Heavy production LLM app backend?** Mastra / Inngest + LangChain.
- **Multi-agent role-play patterns?** CrewAI.
- **Codifying an expert's runbook as a versioned, evolvable artifact?** OpenExpertise.
- **Stateful Python agent loops with deep LangChain integration?** LangGraph.

These are not exhaustive lists of features — they're positioning notes. PRs welcome to expand or correct.
```

- [ ] **Step 2: Commit**

```bash
git add docs/comparison.md
git commit -m "docs: comparison vs LangGraph / CrewAI / Mastra / Inngest"
```

---

## Task 14: `docs/demo-script.md` + assets dir

**Files:**

- Create: `docs/demo-script.md`
- Create: `docs/assets/.gitkeep`

- [ ] **Step 1: Create the assets dir placeholder**

```bash
mkdir -p docs/assets
touch docs/assets/.gitkeep
```

- [ ] **Step 2: Create `docs/demo-script.md`**

```markdown
# Recording the OpenExpertise hero GIF

This is the script for the `docs/assets/hero.gif` referenced in the root README. Recommended tools: `asciinema` for terminal capture + `agg` for GIF, or Loom if you want narration.

## Pre-flight (5 min before recording)

```bash
cd OpenExpertise
git status                           # clean tree
pnpm clean && pnpm install && pnpm -r build
rm -rf examples/review-branch/.openexpertise   # purge prior runs
unset ANTHROPIC_API_KEY OPENAI_API_KEY
export ANTHROPIC_API_KEY=sk-...      # or OPENAI_API_KEY=...
```

Terminal: 100×30 cells, a font that ligatures well (JetBrains Mono / FiraCode), prompt simplified to `$ `.

## Scene 1 — show the diff (8s)

Keystrokes:

```bash
cat examples/review-branch/fixtures/add-user-lookup.diff
```

Narration ("the team is reviewing a small Python diff that adds a user lookup endpoint"). Linger 2s on the SQL `f"SELECT ... WHERE id={user_id}"` line.

## Scene 2 — Run 1 (20s)

Keystrokes:

```bash
node packages/cli/dist/bin.js run examples/review-branch --tui
```

The TUI shows fan-out across `bugs`, `perf`, `tests` reviewers. Wait for completion. Capture the final state output, especially:

- `findings: [...]` — 3 items (null deref / missing test / unclosed cursor)
- `risk_score: 0.30` (will vary)

**Important:** copy the `runId` from the last output line. You need it in Scene 3.

Narration ("three reviewers — bugs, perf, tests — read the diff. They find three issues. The SQL injection on line 5 is missed because no reviewer was asked to look for security bugs.").

## Scene 3 — evolve (12s)

Keystrokes (substitute the captured runId):

```bash
node packages/cli/dist/bin.js evolve <runId>
cat .openexpertise/proposals/<runId>.md
```

The proposal should include "Add `security` dimension" with a diff block editing `tools/list_dimensions.mjs`.

Narration ("the advisor reads the run trace and the diff, notices no reviewer was looking for injection-class bugs, proposes adding a security dimension.").

### Fallback if the advisor doesn't propose `security`

Replace the proposal markdown manually with a pre-recorded version (kept in this repo at `docs/assets/canned-proposal.md` if you've prepared one). Note in the screencast description that production runs are stochastic.

## Scene 4 — apply (8s)

Keystrokes:

```bash
git apply .openexpertise/proposals/<runId>.diff
git diff examples/review-branch/tools/list_dimensions.mjs
```

The one-line addition is visible: `+ { key: 'security', focus: 'injection / authz / secrets' },`.

### Fallback if `git apply` fails

The advisor's diff format isn't always perfect. Fallback: edit `examples/review-branch/tools/list_dimensions.mjs` by hand to add the line shown above.

## Scene 5 — Run 2 (25s)

Keystrokes:

```bash
node packages/cli/dist/bin.js run examples/review-branch --tui
```

Now 4 reviewers. The `security` reviewer flags the SQL injection. Wait for completion. Capture:

- `findings: [...]` — 4 items including "SQL injection in /users/<id>"
- `risk_score: 0.85` (will vary)

Narration ("same command, now four reviewers. The security reviewer catches the injection. Risk score jumps. The graph improved itself.").

## Scene 6 — tagline overlay (5s)

Static text overlay:

> The graph improved itself. State persisted. This is OpenExpertise.

## Post-production

- Trim to ≤90s total.
- Export to `docs/assets/hero.gif` at ≤2 MB (use `agg` with `--theme monokai --speed 1.4` or similar).
- Commit the GIF separately so reverts are easy.

## Validation that the demo will work today

Before recording, verify the unmocked path runs to completion:

```bash
export ANTHROPIC_API_KEY=sk-...
node packages/cli/dist/bin.js run examples/review-branch
# (expect non-zero exit only on real Anthropic API errors)
```

If the run fails, capture the error and fix before recording — never record over a broken demo.
```

- [ ] **Step 3: Commit**

```bash
git add docs/demo-script.md docs/assets/.gitkeep
git commit -m "docs: demo-script.md recording checklist for hero GIF"
```

---

## Final verification

After all 14 tasks land, run the full sweep:

- [ ] **Step 1: Clean build**

```bash
pnpm clean && pnpm install && pnpm -r build
```

Expected: 0 errors.

- [ ] **Step 2: Typecheck + lint + format**

```bash
pnpm typecheck && pnpm lint && pnpm format:check
```

Expected: 0 errors. Warnings about `as any` in tests are OK.

- [ ] **Step 3: Full test suite**

```bash
pnpm test 2>&1 | tail -10
```

Expected: all green. Test count should be **105 baseline + 7 OpenAI client tests + 7 LLM-factory tests = 119+**.

- [ ] **Step 4: Unmocked review-branch smoke (manual, optional)**

```bash
export ANTHROPIC_API_KEY=sk-...
node packages/cli/dist/bin.js run examples/review-branch
```

Verify the run completes, findings are returned, and the SQL injection is plausibly NOT in the Run 1 output. If it IS, the prompt narrowing didn't hold — adjust `prompts/review.md` to be sharper before recording.

- [ ] **Step 5: Document in `docs/superpowers/overnight-progress.md`**

Append a new section:

```markdown
## Post-V1 Polish — Hero Demo + OpenAI Support

- Spec: `docs/superpowers/specs/2026-05-26-hero-demo-and-openai-support-design.md`
- Plan: `docs/superpowers/plans/2026-05-26-hero-demo-and-openai-support.md`
- HEAD after: `<final-commit-hash>`
- Tests: <count>/<count>
- New package: `@openexpertise/llm-openai`
- New CLI flag: `--llm anthropic|openai`
- review-branch rewritten with fixture diff + narrowed prompts + diff injection
- README hero section + comparison doc + demo script

Next: record the hero GIF, then start launch prep (npm publish + GitHub remote + docs site).
```

- [ ] **Step 6: Final commit + summary**

```bash
git add docs/superpowers/overnight-progress.md
git commit -m "docs(overnight): record post-V1 polish completion"
git log --oneline -20
```

Report to the user: the plan is complete, what shipped, and the recommended next concrete action (record the GIF).
