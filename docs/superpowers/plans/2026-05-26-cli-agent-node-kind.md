# Plan A — `cli-agent` Node Kind Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new `cli-agent` node kind so experiences can delegate a step to Claude Code / Codex / Gemini CLI subprocesses, capture their structured output, and write it into state.

**Architecture:** A new `@openexpertise/node-kinds-cli-agent` package with a single `CliAgentDispatcher` that switches on a `provider:` field. Three provider implementations (claude-code / codex / gemini) each define how to construct the subprocess command. A `SubprocessRunner` interface allows test injection of canned output (mirroring the `sdkClient` injection pattern in `AnthropicLLMClient`). Each cli-agent node spawns the CLI once, captures stdout, optionally parses JSON + validates against an AJV schema, and writes the result to state.

**Tech Stack:** TypeScript 5.5+, Node `node:child_process.spawn`, AJV 8 (already a workspace dep), vitest. No new external runtime deps for this plan.

**Spec:** `docs/superpowers/specs/2026-05-26-agentic-cli-integration-design.md`

---

## File Structure

**Modified:**

- `packages/schema/src/types.ts` — extend `NodeKind` with `'cli-agent'`; add `CliAgentNodeSpec` interface; add it to the `NodeSpec` union.
- `packages/schema/src/schemas/experience.schema.json` — add a sixth `oneOf` variant under `$defs.node`.
- `packages/schema/tests/validator.test.ts` — accept-valid + reject-invalid cases for cli-agent.
- `packages/cli/src/commands/run.ts` — register `CliAgentDispatcher`.
- `packages/cli/package.json` — add `@openexpertise/node-kinds-cli-agent` workspace dep.
- `packages/cli/tsconfig.json` — add project ref to `../node-kinds-cli-agent`.

**New package:** `packages/node-kinds-cli-agent/`

```
packages/node-kinds-cli-agent/
├── package.json                       # deps: @openexpertise/core, @openexpertise/schema, ajv
├── tsconfig.json                      # extends base, refs core + schema
├── src/
│   ├── index.ts                       # re-exports CliAgentDispatcher + types + providers
│   ├── dispatcher.ts                  # CliAgentDispatcher implements NodeDispatcher
│   ├── runner.ts                      # SubprocessRunner interface + DefaultSubprocessRunner
│   ├── parse.ts                       # parseOutput() — text or JSON, with optional AJV
│   └── providers/
│       ├── index.ts                   # providerFor(name) registry function
│       ├── types.ts                   # CliAgentProvider interface, SpawnSpec, BuildCommandOpts
│       ├── claude-code.ts             # ClaudeCodeProvider
│       ├── codex.ts                   # CodexProvider
│       └── gemini.ts                  # GeminiProvider
└── tests/
    ├── runner.test.ts
    ├── claude-code.test.ts
    ├── codex.test.ts
    ├── gemini.test.ts
    ├── parse.test.ts
    └── dispatcher.test.ts
```

**New example:** `examples/cli-orchestration/`

```
examples/cli-orchestration/
├── experience.yaml                    # 2 cli-agent nodes (claude-code + codex)
├── package.json                       # name: example, type: module
└── README.md
```

**New e2e test:** `e2e/cli-agent.e2e.test.ts`

**New doc:** `docs/cli-agent.md`

---

## Task 1: Schema additions for `cli-agent` node kind

**Files:**

- Modify: `packages/schema/src/types.ts`
- Modify: `packages/schema/src/schemas/experience.schema.json`
- Modify: `packages/schema/tests/validator.test.ts`

**Why first:** the dispatcher's `kind = 'cli-agent' as const` won't typecheck until `NodeKind` includes the new value. Schema goes first so everything downstream compiles.

- [ ] **Step 1: Write the failing test**

Open `packages/schema/tests/validator.test.ts` and append:

```ts
describe('cli-agent node kind', () => {
  const base = {
    name: 'x',
    version: '0.1.0',
    state: { schema: { result: { type: 'string' } } },
    graph: {
      nodes: [
        {
          id: 'n1',
          kind: 'cli-agent',
          provider: 'claude-code',
          prompt: 'do the thing',
          writes: ['result'],
        },
      ],
      edges: [],
    },
  }

  it('accepts a minimal cli-agent node', () => {
    expect(() => validateExperienceSpec(structuredClone(base))).not.toThrow()
  })

  it('accepts all three providers', () => {
    for (const provider of ['claude-code', 'codex', 'gemini'] as const) {
      const spec = structuredClone(base)
      ;(spec.graph.nodes[0] as { provider: string }).provider = provider
      expect(() => validateExperienceSpec(spec)).not.toThrow()
    }
  })

  it('rejects unknown provider', () => {
    const spec = structuredClone(base) as { graph: { nodes: Array<Record<string, unknown>> } }
    spec.graph.nodes[0]!['provider'] = 'gpt-9001'
    expect(() => validateExperienceSpec(spec)).toThrow(/Schema validation failed/)
  })

  it('rejects missing prompt', () => {
    const spec = structuredClone(base) as { graph: { nodes: Array<Record<string, unknown>> } }
    delete spec.graph.nodes[0]!['prompt']
    expect(() => validateExperienceSpec(spec)).toThrow(/Schema validation failed/)
  })

  it('accepts optional fields (workdir, output_format, timeout_ms, extra_args, model, schema)', () => {
    const spec = structuredClone(base) as { graph: { nodes: Array<Record<string, unknown>> } }
    Object.assign(spec.graph.nodes[0]!, {
      model: 'gpt-4o-2024-11-20',
      workdir: './sub',
      output_format: 'json',
      schema: { type: 'object' },
      timeout_ms: 30000,
      extra_args: ['--verbose'],
    })
    expect(() => validateExperienceSpec(spec)).not.toThrow()
  })
})
```

- [ ] **Step 2: Run the test, confirm failure**

```bash
pnpm --filter @openexpertise/schema build && pnpm --filter @openexpertise/schema test 2>&1 | tail -20
```

Expected: FAIL — cli-agent not in NodeKind enum, JSON Schema rejects it.

- [ ] **Step 3: Extend `NodeKind` and add `CliAgentNodeSpec` in `packages/schema/src/types.ts`**

Replace the existing `NodeKind` line and append the new interface + extend the `NodeSpec` union.

Replace:

```ts
export type NodeKind = 'agent' | 'skill' | 'tool' | 'dataset' | 'experience'
```

With:

```ts
export type NodeKind = 'agent' | 'skill' | 'tool' | 'dataset' | 'experience' | 'cli-agent'
```

Add this interface near the other `*NodeSpec` interfaces (after `ExperienceNodeSpec`):

```ts
export interface CliAgentNodeSpec {
  id: string
  kind: 'cli-agent'
  phase?: string
  provider: 'claude-code' | 'codex' | 'gemini'
  prompt: string // inline only in V1 — no file-path loading
  model?: string
  workdir?: string // relative to experience dir; default = experience dir
  output_format?: 'text' | 'json' // default 'text'
  schema?: Record<string, unknown> // AJV schema validated against parsed JSON output
  timeout_ms?: number // default 600_000
  extra_args?: string[]
  reads?: string[]
  writes?: string[]
  on_error?: ErrorPolicy
  for_each?: ForEachClause
}
```

Update the `NodeSpec` union to include it:

```ts
export type NodeSpec =
  | ToolNodeSpec
  | AgentNodeSpec
  | SkillNodeSpec
  | DatasetNodeSpec
  | ExperienceNodeSpec
  | CliAgentNodeSpec
```

- [ ] **Step 4: Add the cli-agent oneOf variant to `packages/schema/src/schemas/experience.schema.json`**

Locate `$defs.node.oneOf` (an array of 5 variants today — tool, agent, skill, dataset, experience). Append a sixth variant:

```json
{
  "allOf": [
    { "$ref": "#/$defs/nodeBase" },
    {
      "type": "object",
      "required": ["provider", "prompt"],
      "properties": {
        "kind": { "const": "cli-agent" },
        "provider": { "enum": ["claude-code", "codex", "gemini"] },
        "prompt": { "type": "string", "minLength": 1 },
        "model": { "type": "string" },
        "workdir": { "type": "string" },
        "output_format": { "enum": ["text", "json"] },
        "schema": {},
        "timeout_ms": { "type": "integer", "minimum": 1000 },
        "extra_args": { "type": "array", "items": { "type": "string" } }
      }
    }
  ]
}
```

- [ ] **Step 5: Run the test, confirm pass**

```bash
pnpm --filter @openexpertise/schema build && pnpm --filter @openexpertise/schema test 2>&1 | tail -20
```

Expected: PASS, including the 5 new cli-agent tests.

- [ ] **Step 6: Run the full test suite — no regressions**

```bash
pnpm -r build 2>&1 | tail -5
pnpm test 2>&1 | tail -8
```

Expected: 119 baseline + 5 new = 124 passing.

- [ ] **Step 7: Commit**

```bash
git add packages/schema/src/types.ts packages/schema/src/schemas/experience.schema.json packages/schema/tests/validator.test.ts
git commit -m "feat(schema): add cli-agent node kind variant"
```

---

## Task 2: Scaffold `@openexpertise/node-kinds-cli-agent`

**Files:**

- Create: `packages/node-kinds-cli-agent/package.json`
- Create: `packages/node-kinds-cli-agent/tsconfig.json`
- Create: `packages/node-kinds-cli-agent/src/index.ts`
- Create: `packages/node-kinds-cli-agent/tests/.gitkeep`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "@openexpertise/node-kinds-cli-agent",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist"],
  "publishConfig": { "access": "public" },
  "scripts": {
    "build": "tsc -b",
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

- [ ] **Step 2: Create `tsconfig.json`**

Mirror `packages/node-kinds-agent/tsconfig.json`. Concretely:

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
export { CliAgentDispatcher, type CliAgentDispatcherOpts } from './dispatcher.js'
export {
  DefaultSubprocessRunner,
  type SubprocessRunner,
  type SpawnSpec,
  type RunResult,
} from './runner.js'
export { providerFor, type ProviderName } from './providers/index.js'
```

This will fail to typecheck until later tasks create those modules — TDD red state.

- [ ] **Step 4: Create empty `tests/.gitkeep`**

- [ ] **Step 5: Wire workspace**

```bash
pnpm install
```

Expected: workspace links resolved; no new external downloads (ajv is already in the lockfile).

- [ ] **Step 6: Commit**

```bash
git add packages/node-kinds-cli-agent/ pnpm-lock.yaml
git commit -m "scaffold: @openexpertise/node-kinds-cli-agent package"
```

---

## Task 3: `SubprocessRunner` interface + default impl (TDD)

**Files:**

- Create: `packages/node-kinds-cli-agent/src/runner.ts`
- Create: `packages/node-kinds-cli-agent/tests/runner.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/node-kinds-cli-agent/tests/runner.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { DefaultSubprocessRunner, type SubprocessRunner } from '../src/runner.js'

describe('DefaultSubprocessRunner', () => {
  const runner: SubprocessRunner = new DefaultSubprocessRunner()

  it('captures stdout from a successful subprocess', async () => {
    const res = await runner.run(
      { cmd: process.execPath, args: ['-e', 'process.stdout.write("hello")'] },
      { timeoutMs: 5000, cwd: process.cwd() },
    )
    expect(res.exitCode).toBe(0)
    expect(res.stdout).toBe('hello')
    expect(res.stderr).toBe('')
    expect(res.timedOut).toBe(false)
  })

  it('captures stderr separately', async () => {
    const res = await runner.run(
      { cmd: process.execPath, args: ['-e', 'process.stderr.write("oops")'] },
      { timeoutMs: 5000, cwd: process.cwd() },
    )
    expect(res.stderr).toBe('oops')
    expect(res.stdout).toBe('')
  })

  it('reports non-zero exit codes without throwing', async () => {
    const res = await runner.run(
      { cmd: process.execPath, args: ['-e', 'process.exit(2)'] },
      { timeoutMs: 5000, cwd: process.cwd() },
    )
    expect(res.exitCode).toBe(2)
    expect(res.timedOut).toBe(false)
  })

  it('enforces timeout via SIGTERM', async () => {
    const start = Date.now()
    const res = await runner.run(
      { cmd: process.execPath, args: ['-e', 'setInterval(()=>{}, 1000)'] },
      { timeoutMs: 200, cwd: process.cwd() },
    )
    const elapsed = Date.now() - start
    expect(res.timedOut).toBe(true)
    expect(elapsed).toBeLessThan(5000)
  })

  it('pipes stdin when SpawnSpec.stdin is set', async () => {
    const res = await runner.run(
      {
        cmd: process.execPath,
        args: ['-e', 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>process.stdout.write(d))'],
        stdin: 'piped-input',
      },
      { timeoutMs: 5000, cwd: process.cwd() },
    )
    expect(res.stdout).toBe('piped-input')
  })

  it('respects env overrides', async () => {
    const res = await runner.run(
      {
        cmd: process.execPath,
        args: ['-e', 'process.stdout.write(process.env.OE_TEST||"none")'],
        env: { OE_TEST: 'visible' },
      },
      { timeoutMs: 5000, cwd: process.cwd() },
    )
    expect(res.stdout).toBe('visible')
  })
})
```

- [ ] **Step 2: Run, confirm failure**

```bash
pnpm --filter @openexpertise/node-kinds-cli-agent test 2>&1 | tail -15
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/runner.ts`**

```ts
import { spawn } from 'node:child_process'

export interface SpawnSpec {
  cmd: string
  args: string[]
  env?: Record<string, string>
  stdin?: string
}

export interface RunResult {
  stdout: string
  stderr: string
  exitCode: number
  timedOut: boolean
}

export interface SubprocessRunner {
  run(spec: SpawnSpec, opts: { timeoutMs: number; cwd: string }): Promise<RunResult>
}

export class DefaultSubprocessRunner implements SubprocessRunner {
  async run(spec: SpawnSpec, opts: { timeoutMs: number; cwd: string }): Promise<RunResult> {
    return new Promise<RunResult>((resolve) => {
      const child = spawn(spec.cmd, spec.args, {
        cwd: opts.cwd,
        env: { ...process.env, ...(spec.env ?? {}) },
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      let stdout = ''
      let stderr = ''
      let timedOut = false
      let settled = false

      const settle = (exitCode: number) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        clearTimeout(killTimer)
        resolve({ stdout, stderr, exitCode, timedOut })
      }

      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8')
      })
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8')
      })
      child.on('error', () => settle(-1))
      child.on('close', (code) => settle(code ?? -1))

      let killTimer: NodeJS.Timeout = setTimeout(() => undefined, 0)
      const timer = setTimeout(() => {
        timedOut = true
        child.kill('SIGTERM')
        killTimer = setTimeout(() => {
          if (!child.killed) child.kill('SIGKILL')
        }, 2000)
      }, opts.timeoutMs)

      if (spec.stdin !== undefined) {
        child.stdin.write(spec.stdin)
      }
      child.stdin.end()
    })
  }
}
```

- [ ] **Step 4: Run tests, confirm pass**

```bash
pnpm --filter @openexpertise/node-kinds-cli-agent build && pnpm --filter @openexpertise/node-kinds-cli-agent test 2>&1 | tail -20
```

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/node-kinds-cli-agent/src/runner.ts packages/node-kinds-cli-agent/tests/runner.test.ts
git commit -m "feat(cli-agent): SubprocessRunner interface + default spawn-based impl"
```

---

## Task 4: `CliAgentProvider` interface + ClaudeCodeProvider (TDD)

**Files:**

- Create: `packages/node-kinds-cli-agent/src/providers/types.ts`
- Create: `packages/node-kinds-cli-agent/src/providers/claude-code.ts`
- Create: `packages/node-kinds-cli-agent/tests/claude-code.test.ts`

**Flag verification note (applies to Tasks 4-6):** The CLI flag choices in these tasks are based on the spec author's reading of each CLI's help. The unit tests only assert argv shape — they don't run the real CLI. If you have `claude`, `codex`, `gemini` installed locally, run `claude --help`, `codex exec --help`, `gemini --help` to confirm the flag names before locking the implementation. If a flag differs, adjust the implementation AND the test to match the real CLI rather than the plan.

- [ ] **Step 1: Write the failing test**

Create `packages/node-kinds-cli-agent/tests/claude-code.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { ClaudeCodeProvider } from '../src/providers/claude-code.js'

describe('ClaudeCodeProvider', () => {
  const provider = new ClaudeCodeProvider()

  it('name is "claude-code"', () => {
    expect(provider.name).toBe('claude-code')
  })

  it('builds the basic command with -p and output format text', () => {
    const spec = provider.buildCommand({
      prompt: 'hello world',
      workdir: '/tmp/x',
      outputFormat: 'text',
    })
    expect(spec.cmd).toBe('claude')
    expect(spec.args).toEqual(['-p', 'hello world', '--output-format', 'text'])
  })

  it('switches to json output format when requested', () => {
    const spec = provider.buildCommand({
      prompt: 'hi',
      workdir: '/tmp/x',
      outputFormat: 'json',
    })
    expect(spec.args).toContain('--output-format')
    expect(spec.args).toContain('json')
  })

  it('passes model via --model when set', () => {
    const spec = provider.buildCommand({
      prompt: 'hi',
      workdir: '/tmp/x',
      outputFormat: 'text',
      model: 'claude-sonnet-4-6',
    })
    expect(spec.args).toContain('--model')
    expect(spec.args).toContain('claude-sonnet-4-6')
  })

  it('appends extra_args verbatim', () => {
    const spec = provider.buildCommand({
      prompt: 'hi',
      workdir: '/tmp/x',
      outputFormat: 'text',
      extra_args: ['--allowed-tools', 'Read,Grep'],
    })
    expect(spec.args.slice(-2)).toEqual(['--allowed-tools', 'Read,Grep'])
  })
})
```

- [ ] **Step 2: Run, confirm failure**

```bash
pnpm --filter @openexpertise/node-kinds-cli-agent test 2>&1 | tail -15
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/providers/types.ts`**

```ts
import type { SpawnSpec } from '../runner.js'

export type ProviderName = 'claude-code' | 'codex' | 'gemini'

export interface BuildCommandOpts {
  prompt: string
  workdir: string
  outputFormat: 'text' | 'json'
  model?: string
  extra_args?: string[]
}

export interface CliAgentProvider {
  readonly name: ProviderName
  buildCommand(opts: BuildCommandOpts): SpawnSpec
}
```

- [ ] **Step 4: Implement `src/providers/claude-code.ts`**

```ts
import type { SpawnSpec } from '../runner.js'
import type { BuildCommandOpts, CliAgentProvider } from './types.js'

export class ClaudeCodeProvider implements CliAgentProvider {
  readonly name = 'claude-code' as const

  buildCommand(opts: BuildCommandOpts): SpawnSpec {
    const args: string[] = ['-p', opts.prompt, '--output-format', opts.outputFormat]
    if (opts.model) {
      args.push('--model', opts.model)
    }
    if (opts.extra_args && opts.extra_args.length > 0) {
      args.push(...opts.extra_args)
    }
    return { cmd: 'claude', args }
  }
}
```

- [ ] **Step 5: Run tests, confirm pass**

```bash
pnpm --filter @openexpertise/node-kinds-cli-agent build && pnpm --filter @openexpertise/node-kinds-cli-agent test 2>&1 | tail -15
```

Expected: PASS (6 runner + 5 claude-code = 11 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/node-kinds-cli-agent/src/providers/types.ts packages/node-kinds-cli-agent/src/providers/claude-code.ts packages/node-kinds-cli-agent/tests/claude-code.test.ts
git commit -m "feat(cli-agent): CliAgentProvider interface + ClaudeCodeProvider"
```

---

## Task 5: CodexProvider (TDD)

**Files:**

- Create: `packages/node-kinds-cli-agent/src/providers/codex.ts`
- Create: `packages/node-kinds-cli-agent/tests/codex.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/node-kinds-cli-agent/tests/codex.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { CodexProvider } from '../src/providers/codex.js'

describe('CodexProvider', () => {
  const provider = new CodexProvider()

  it('name is "codex"', () => {
    expect(provider.name).toBe('codex')
  })

  it('uses `codex exec --skip-git-repo-check` with prompt as final arg', () => {
    const spec = provider.buildCommand({
      prompt: 'analyze the file',
      workdir: '/tmp/x',
      outputFormat: 'text',
    })
    expect(spec.cmd).toBe('codex')
    expect(spec.args[0]).toBe('exec')
    expect(spec.args).toContain('--skip-git-repo-check')
    expect(spec.args[spec.args.length - 1]).toBe('analyze the file')
  })

  it('passes model via --model when set', () => {
    const spec = provider.buildCommand({
      prompt: 'p',
      workdir: '/tmp/x',
      outputFormat: 'text',
      model: 'gpt-4o-2024-11-20',
    })
    const i = spec.args.indexOf('--model')
    expect(i).toBeGreaterThanOrEqual(0)
    expect(spec.args[i + 1]).toBe('gpt-4o-2024-11-20')
  })

  it('appends extra_args before the prompt arg', () => {
    const spec = provider.buildCommand({
      prompt: 'p',
      workdir: '/tmp/x',
      outputFormat: 'text',
      extra_args: ['--sandbox', 'read-only'],
    })
    const promptIdx = spec.args.indexOf('p')
    const sandboxIdx = spec.args.indexOf('--sandbox')
    expect(sandboxIdx).toBeGreaterThanOrEqual(0)
    expect(sandboxIdx).toBeLessThan(promptIdx)
  })
})
```

- [ ] **Step 2: Run, confirm failure**

```bash
pnpm --filter @openexpertise/node-kinds-cli-agent test 2>&1 | tail -15
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/providers/codex.ts`**

```ts
import type { SpawnSpec } from '../runner.js'
import type { BuildCommandOpts, CliAgentProvider } from './types.js'

export class CodexProvider implements CliAgentProvider {
  readonly name = 'codex' as const

  buildCommand(opts: BuildCommandOpts): SpawnSpec {
    const args: string[] = ['exec', '--skip-git-repo-check']
    if (opts.model) {
      args.push('--model', opts.model)
    }
    if (opts.extra_args && opts.extra_args.length > 0) {
      args.push(...opts.extra_args)
    }
    args.push(opts.prompt)
    return { cmd: 'codex', args }
  }
}
```

Note on `--skip-git-repo-check`: `codex exec` refuses to run outside a git repo without this flag, which makes e2e tests in tmp dirs fail. Including it always is fine for V1; users can override via `extra_args` if they need different behavior.

`outputFormat` is currently not mapped — codex exec just emits its final answer to stdout. The dispatcher parses it according to the node's `output_format` setting regardless of what the CLI produces.

- [ ] **Step 4: Run, confirm pass**

```bash
pnpm --filter @openexpertise/node-kinds-cli-agent build && pnpm --filter @openexpertise/node-kinds-cli-agent test 2>&1 | tail -10
```

Expected: PASS (11 + 4 = 15 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/node-kinds-cli-agent/src/providers/codex.ts packages/node-kinds-cli-agent/tests/codex.test.ts
git commit -m "feat(cli-agent): CodexProvider"
```

---

## Task 6: GeminiProvider (TDD)

**Files:**

- Create: `packages/node-kinds-cli-agent/src/providers/gemini.ts`
- Create: `packages/node-kinds-cli-agent/tests/gemini.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/node-kinds-cli-agent/tests/gemini.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { GeminiProvider } from '../src/providers/gemini.js'

describe('GeminiProvider', () => {
  const provider = new GeminiProvider()

  it('name is "gemini"', () => {
    expect(provider.name).toBe('gemini')
  })

  it('uses `gemini --yolo --prompt`', () => {
    const spec = provider.buildCommand({
      prompt: 'tell me about the codebase',
      workdir: '/tmp/x',
      outputFormat: 'text',
    })
    expect(spec.cmd).toBe('gemini')
    expect(spec.args).toContain('--yolo')
    const i = spec.args.indexOf('--prompt')
    expect(i).toBeGreaterThanOrEqual(0)
    expect(spec.args[i + 1]).toBe('tell me about the codebase')
  })

  it('passes model via --model', () => {
    const spec = provider.buildCommand({
      prompt: 'p',
      workdir: '/tmp/x',
      outputFormat: 'text',
      model: 'gemini-2.5-pro',
    })
    const i = spec.args.indexOf('--model')
    expect(i).toBeGreaterThanOrEqual(0)
    expect(spec.args[i + 1]).toBe('gemini-2.5-pro')
  })

  it('appends extra_args', () => {
    const spec = provider.buildCommand({
      prompt: 'p',
      workdir: '/tmp/x',
      outputFormat: 'text',
      extra_args: ['--debug'],
    })
    expect(spec.args).toContain('--debug')
  })
})
```

- [ ] **Step 2: Run, confirm failure**

```bash
pnpm --filter @openexpertise/node-kinds-cli-agent test 2>&1 | tail -10
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/providers/gemini.ts`**

```ts
import type { SpawnSpec } from '../runner.js'
import type { BuildCommandOpts, CliAgentProvider } from './types.js'

export class GeminiProvider implements CliAgentProvider {
  readonly name = 'gemini' as const

  buildCommand(opts: BuildCommandOpts): SpawnSpec {
    // --yolo bypasses interactive permission prompts so the CLI can run
    // non-interactively. Users can override via extra_args if they want
    // a stricter permission mode.
    const args: string[] = ['--yolo', '--prompt', opts.prompt]
    if (opts.model) {
      args.push('--model', opts.model)
    }
    if (opts.extra_args && opts.extra_args.length > 0) {
      args.push(...opts.extra_args)
    }
    return { cmd: 'gemini', args }
  }
}
```

- [ ] **Step 4: Run, confirm pass**

```bash
pnpm --filter @openexpertise/node-kinds-cli-agent build && pnpm --filter @openexpertise/node-kinds-cli-agent test 2>&1 | tail -10
```

Expected: PASS (15 + 4 = 19 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/node-kinds-cli-agent/src/providers/gemini.ts packages/node-kinds-cli-agent/tests/gemini.test.ts
git commit -m "feat(cli-agent): GeminiProvider"
```

---

## Task 7: Provider registry + output parser (TDD)

**Files:**

- Create: `packages/node-kinds-cli-agent/src/providers/index.ts`
- Create: `packages/node-kinds-cli-agent/src/parse.ts`
- Create: `packages/node-kinds-cli-agent/tests/parse.test.ts`

- [ ] **Step 1: Write the failing parse test**

Create `packages/node-kinds-cli-agent/tests/parse.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseOutput } from '../src/parse.js'

describe('parseOutput', () => {
  it('text mode with one writes field returns { field: stdout }', () => {
    const out = parseOutput({
      stdout: 'hello world',
      outputFormat: 'text',
      writes: ['greeting'],
    })
    expect(out).toEqual({ greeting: 'hello world' })
  })

  it('text mode with no writes returns {}', () => {
    const out = parseOutput({ stdout: 'whatever', outputFormat: 'text', writes: [] })
    expect(out).toEqual({})
  })

  it('text mode with multiple writes throws (ambiguous mapping)', () => {
    expect(() =>
      parseOutput({ stdout: 'x', outputFormat: 'text', writes: ['a', 'b'] }),
    ).toThrow(/text mode requires/i)
  })

  it('json mode parses stdout and returns the parsed object', () => {
    const out = parseOutput({
      stdout: '{"findings":[{"title":"x"}]}',
      outputFormat: 'json',
      writes: ['findings'],
    })
    expect(out).toEqual({ findings: [{ title: 'x' }] })
  })

  it('json mode throws on invalid JSON', () => {
    expect(() =>
      parseOutput({ stdout: 'not json', outputFormat: 'json', writes: [] }),
    ).toThrow(/JSON/i)
  })

  it('json mode validates against schema when provided', () => {
    const schema = {
      type: 'object',
      required: ['n'],
      properties: { n: { type: 'number' } },
    }
    expect(() =>
      parseOutput({ stdout: '{"n":"oops"}', outputFormat: 'json', writes: ['n'], schema }),
    ).toThrow(/schema/i)
    expect(
      parseOutput({ stdout: '{"n":42}', outputFormat: 'json', writes: ['n'], schema }),
    ).toEqual({ n: 42 })
  })
})
```

- [ ] **Step 2: Run, confirm failure**

```bash
pnpm --filter @openexpertise/node-kinds-cli-agent test 2>&1 | tail -10
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/parse.ts`**

```ts
import Ajv from 'ajv'

const ajv = new Ajv({ allErrors: true, strict: false })

export interface ParseOpts {
  stdout: string
  outputFormat: 'text' | 'json'
  writes: string[]
  schema?: Record<string, unknown>
  nodeId?: string
}

export function parseOutput(opts: ParseOpts): Record<string, unknown> {
  const tag = opts.nodeId ? ` for node "${opts.nodeId}"` : ''
  if (opts.outputFormat === 'text') {
    if (opts.writes.length === 0) return {}
    if (opts.writes.length > 1) {
      throw new Error(
        `cli-agent${tag}: text mode requires zero or one writes field; got ${opts.writes.length}. ` +
          `Use output_format: json with a schema for multi-field output.`,
      )
    }
    const field = opts.writes[0]!
    return { [field]: opts.stdout }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(opts.stdout)
  } catch (err) {
    throw new Error(
      `cli-agent${tag}: stdout was not valid JSON (${(err as Error).message}); raw start: ${opts.stdout.slice(0, 120)}`,
    )
  }

  if (opts.schema) {
    const validate = ajv.compile(opts.schema)
    if (!validate(parsed)) {
      const msgs = (validate.errors ?? []).map(
        (e) => `${e.instancePath || '(root)'}: ${e.message ?? 'invalid'}`,
      )
      throw new Error(
        `cli-agent${tag}: parsed output failed schema validation: ${msgs.join(', ')}`,
      )
    }
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(
      `cli-agent${tag}: JSON output must be a plain object (got ${typeof parsed}); ` +
        `the dispatcher needs key-value pairs to map into state_delta.`,
    )
  }
  return parsed as Record<string, unknown>
}
```

- [ ] **Step 4: Implement `src/providers/index.ts`**

```ts
import { ClaudeCodeProvider } from './claude-code.js'
import { CodexProvider } from './codex.js'
import { GeminiProvider } from './gemini.js'
import type { CliAgentProvider, ProviderName } from './types.js'

export type { CliAgentProvider, ProviderName, BuildCommandOpts } from './types.js'

const PROVIDERS: Record<ProviderName, CliAgentProvider> = {
  'claude-code': new ClaudeCodeProvider(),
  codex: new CodexProvider(),
  gemini: new GeminiProvider(),
}

export function providerFor(name: ProviderName): CliAgentProvider {
  const p = PROVIDERS[name]
  if (!p) throw new Error(`Unknown cli-agent provider: ${name}`)
  return p
}
```

- [ ] **Step 5: Run, confirm pass**

```bash
pnpm --filter @openexpertise/node-kinds-cli-agent build && pnpm --filter @openexpertise/node-kinds-cli-agent test 2>&1 | tail -10
```

Expected: PASS (19 + 6 = 25 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/node-kinds-cli-agent/src/providers/index.ts packages/node-kinds-cli-agent/src/parse.ts packages/node-kinds-cli-agent/tests/parse.test.ts
git commit -m "feat(cli-agent): provider registry + output parser"
```

---

## Task 8: `CliAgentDispatcher` (TDD)

**Files:**

- Create: `packages/node-kinds-cli-agent/src/dispatcher.ts`
- Create: `packages/node-kinds-cli-agent/tests/dispatcher.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/node-kinds-cli-agent/tests/dispatcher.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { CliAgentDispatcher } from '../src/dispatcher.js'
import type { SubprocessRunner, SpawnSpec, RunResult } from '../src/runner.js'
import type { CliAgentNodeSpec } from '@openexpertise/schema'
import type { RunContext } from '@openexpertise/core'

class FakeRunner implements SubprocessRunner {
  public lastSpec: SpawnSpec | null = null
  public lastOpts: { timeoutMs: number; cwd: string } | null = null
  constructor(private scripted: RunResult) {}
  async run(spec: SpawnSpec, opts: { timeoutMs: number; cwd: string }) {
    this.lastSpec = spec
    this.lastOpts = opts
    return this.scripted
  }
}

// The CliAgentDispatcher only reads ctx.experienceDir; everything else is
// safely cast away. If the implementer finds RunContext requires more fields
// at compile time, add only what's strictly needed.
const ctx = { experienceDir: '/tmp/exp' } as unknown as RunContext

describe('CliAgentDispatcher', () => {
  it('kind is "cli-agent"', () => {
    const d = new CliAgentDispatcher({
      runner: new FakeRunner({ stdout: '', stderr: '', exitCode: 0, timedOut: false }),
    })
    expect(d.kind).toBe('cli-agent')
  })

  it('text mode: stdout maps to single writes field', async () => {
    const runner = new FakeRunner({ stdout: 'the answer', stderr: '', exitCode: 0, timedOut: false })
    const d = new CliAgentDispatcher({ runner })
    const node: CliAgentNodeSpec = {
      id: 'n1',
      kind: 'cli-agent',
      provider: 'claude-code',
      prompt: 'tell me',
      writes: ['answer'],
    }
    const impl = await d.resolve(node, ctx)
    const out = await d.run(
      impl,
      { state_view: {}, edge_inputs: {}, args: {} },
      ctx,
    )
    expect(out.state_delta).toEqual({ answer: 'the answer' })
    expect(runner.lastSpec?.cmd).toBe('claude')
    expect(runner.lastSpec?.args).toContain('--output-format')
  })

  it('json mode with schema: parses + validates', async () => {
    const runner = new FakeRunner({
      stdout: '{"findings":[{"title":"x","severity":"high"}]}',
      stderr: '',
      exitCode: 0,
      timedOut: false,
    })
    const d = new CliAgentDispatcher({ runner })
    const node: CliAgentNodeSpec = {
      id: 'n1',
      kind: 'cli-agent',
      provider: 'codex',
      prompt: 'review',
      output_format: 'json',
      writes: ['findings'],
      schema: {
        type: 'object',
        required: ['findings'],
        properties: { findings: { type: 'array' } },
      },
    }
    const impl = await d.resolve(node, ctx)
    const out = await d.run(impl, { state_view: {}, edge_inputs: {}, args: {} }, ctx)
    expect(out.state_delta).toEqual({ findings: [{ title: 'x', severity: 'high' }] })
  })

  it('interpolates {{placeholders}} from state_view into the prompt', async () => {
    const runner = new FakeRunner({ stdout: 'done', stderr: '', exitCode: 0, timedOut: false })
    const d = new CliAgentDispatcher({ runner })
    const node: CliAgentNodeSpec = {
      id: 'n1',
      kind: 'cli-agent',
      provider: 'gemini',
      prompt: 'review: {{diff}}',
      writes: ['report'],
    }
    const impl = await d.resolve(node, ctx)
    await d.run(
      impl,
      { state_view: { diff: 'PR-123' }, edge_inputs: {}, args: {} },
      ctx,
    )
    expect(runner.lastSpec?.args.some((a) => a.includes('PR-123'))).toBe(true)
  })

  it('subprocess non-zero exit code throws (so on_error policy applies)', async () => {
    const runner = new FakeRunner({
      stdout: '',
      stderr: 'boom',
      exitCode: 1,
      timedOut: false,
    })
    const d = new CliAgentDispatcher({ runner })
    const node: CliAgentNodeSpec = {
      id: 'n1',
      kind: 'cli-agent',
      provider: 'claude-code',
      prompt: 'x',
      writes: ['out'],
    }
    const impl = await d.resolve(node, ctx)
    await expect(
      d.run(impl, { state_view: {}, edge_inputs: {}, args: {} }, ctx),
    ).rejects.toThrow(/exit code 1.*boom/s)
  })

  it('timeout throws a specific error', async () => {
    const runner = new FakeRunner({
      stdout: '',
      stderr: '',
      exitCode: -1,
      timedOut: true,
    })
    const d = new CliAgentDispatcher({ runner })
    const node: CliAgentNodeSpec = {
      id: 'n1',
      kind: 'cli-agent',
      provider: 'claude-code',
      prompt: 'x',
      writes: ['out'],
      timeout_ms: 5000,
    }
    const impl = await d.resolve(node, ctx)
    await expect(
      d.run(impl, { state_view: {}, edge_inputs: {}, args: {} }, ctx),
    ).rejects.toThrow(/timed out/i)
  })

  it('respects workdir relative to experienceDir', async () => {
    const runner = new FakeRunner({ stdout: 'ok', stderr: '', exitCode: 0, timedOut: false })
    const d = new CliAgentDispatcher({ runner })
    const node: CliAgentNodeSpec = {
      id: 'n1',
      kind: 'cli-agent',
      provider: 'claude-code',
      prompt: 'x',
      workdir: './sub',
      writes: ['out'],
    }
    const impl = await d.resolve(node, ctx)
    await d.run(impl, { state_view: {}, edge_inputs: {}, args: {} }, ctx)
    expect(runner.lastOpts?.cwd).toMatch(/sub$/)
  })
})
```

- [ ] **Step 2: Run, confirm failure**

```bash
pnpm --filter @openexpertise/node-kinds-cli-agent test 2>&1 | tail -15
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/dispatcher.ts`**

```ts
import { resolve as resolvePath } from 'node:path'
import type {
  NodeDispatcher,
  NodeInputBundle,
  NodeOutput,
  ResolvedImpl,
  RunContext,
} from '@openexpertise/core'
import { interpolatePrompt } from '@openexpertise/core'
import type { NodeSpec, CliAgentNodeSpec } from '@openexpertise/schema'
import { DefaultSubprocessRunner, type SubprocessRunner } from './runner.js'
import { providerFor } from './providers/index.js'
import { parseOutput } from './parse.js'

export interface CliAgentDispatcherOpts {
  runner?: SubprocessRunner
  defaultTimeoutMs?: number
}

interface CliAgentImpl extends ResolvedImpl {
  spec: CliAgentNodeSpec
  [k: string]: unknown
}

export class CliAgentDispatcher implements NodeDispatcher {
  readonly kind = 'cli-agent' as const
  private readonly runner: SubprocessRunner
  private readonly defaultTimeoutMs: number

  constructor(opts: CliAgentDispatcherOpts = {}) {
    this.runner = opts.runner ?? new DefaultSubprocessRunner()
    this.defaultTimeoutMs = opts.defaultTimeoutMs ?? 600_000
  }

  async resolve(node: NodeSpec, _ctx: RunContext): Promise<CliAgentImpl> {
    if (node.kind !== 'cli-agent') {
      throw new Error(`CliAgentDispatcher cannot resolve kind=${node.kind}`)
    }
    return { spec: node as CliAgentNodeSpec }
  }

  async run(impl: ResolvedImpl, bundle: NodeInputBundle, ctx: RunContext): Promise<NodeOutput> {
    const ci = impl as CliAgentImpl
    const spec = ci.spec
    const provider = providerFor(spec.provider)
    const outputFormat = spec.output_format ?? 'text'

    const prompt = interpolatePrompt({
      template: spec.prompt,
      values: { ...bundle.state_view, ...bundle.edge_inputs, ...bundle.args },
      strict: false,
    })

    const workdir = spec.workdir
      ? resolvePath(ctx.experienceDir, spec.workdir)
      : ctx.experienceDir

    const buildOpts: Parameters<typeof provider.buildCommand>[0] = {
      prompt,
      workdir,
      outputFormat,
    }
    if (spec.model) buildOpts.model = spec.model
    if (spec.extra_args) buildOpts.extra_args = spec.extra_args

    const cmd = provider.buildCommand(buildOpts)
    const timeoutMs = spec.timeout_ms ?? this.defaultTimeoutMs

    const res = await this.runner.run(cmd, { timeoutMs, cwd: workdir })

    if (res.timedOut) {
      throw new Error(
        `cli-agent "${spec.id}" timed out after ${timeoutMs}ms (provider=${spec.provider})`,
      )
    }
    if (res.exitCode !== 0) {
      throw new Error(
        `cli-agent "${spec.id}" (provider=${spec.provider}) exited with code ${res.exitCode}. ` +
          `stderr: ${res.stderr.slice(0, 500)}`,
      )
    }

    const parseOpts: Parameters<typeof parseOutput>[0] = {
      stdout: res.stdout,
      outputFormat,
      writes: spec.writes ?? [],
      nodeId: spec.id,
    }
    if (spec.schema) parseOpts.schema = spec.schema
    const stateDelta = parseOutput(parseOpts)

    return { state_delta: stateDelta }
  }
}
```

- [ ] **Step 4: Run, confirm pass**

```bash
pnpm --filter @openexpertise/node-kinds-cli-agent build && pnpm --filter @openexpertise/node-kinds-cli-agent test 2>&1 | tail -10
```

Expected: PASS (25 + 6 = 31 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/node-kinds-cli-agent/src/dispatcher.ts packages/node-kinds-cli-agent/tests/dispatcher.test.ts
git commit -m "feat(cli-agent): CliAgentDispatcher with provider switch + runner DI"
```

---

## Task 9: Wire `CliAgentDispatcher` into `oe run` and `oe evolve`

**Files:**

- Modify: `packages/cli/package.json`
- Modify: `packages/cli/tsconfig.json`
- Modify: `packages/cli/src/commands/run.ts`

Note: `oe evolve` doesn't run user experiences (only the advisor); only `oe run` needs the new dispatcher registered.

- [ ] **Step 1: Add workspace dep to CLI**

In `packages/cli/package.json`, add to `dependencies`:

```json
"@openexpertise/node-kinds-cli-agent": "workspace:*"
```

In `packages/cli/tsconfig.json`, add to `references`:

```json
{ "path": "../node-kinds-cli-agent" }
```

Run `pnpm install`.

- [ ] **Step 2: Register the dispatcher in `packages/cli/src/commands/run.ts`**

Add import:

```ts
import { CliAgentDispatcher } from '@openexpertise/node-kinds-cli-agent'
```

After the existing `dispatchers.register(new ExperienceDispatcher(...))` line, add:

```ts
dispatchers.register(new CliAgentDispatcher())
```

- [ ] **Step 3: Build + smoke**

```bash
pnpm --filter @openexpertise/cli build 2>&1 | tail -5
node packages/cli/dist/bin.js validate examples/hello-tool 2>&1 | tail -5
```

Expected: build clean; hello-tool still validates (no regression).

- [ ] **Step 4: Full typecheck + tests**

```bash
pnpm typecheck 2>&1 | tail -5
pnpm test 2>&1 | tail -8
```

Expected: clean; test count now 124 + 31 = 155.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/package.json packages/cli/tsconfig.json packages/cli/src/commands/run.ts pnpm-lock.yaml
git commit -m "feat(cli): register CliAgentDispatcher in oe run"
```

---

## Task 10: Sample experience `examples/cli-orchestration/`

**Files:**

- Create: `examples/cli-orchestration/experience.yaml`
- Create: `examples/cli-orchestration/package.json`
- Create: `examples/cli-orchestration/README.md`

This is a deliberately small experience that demonstrates two cli-agent nodes with different providers. It's runnable IF the `claude` and `codex` CLIs are installed and configured (auth, etc.); CI does not exercise the real CLIs.

- [ ] **Step 1: Create `experience.yaml`**

```yaml
name: cli-orchestration
description: Two cli-agent nodes — Claude Code summarizes a topic, Codex critiques the summary.
version: 0.1.0

state:
  schema:
    topic: { type: string }
    summary: { type: string }
    critique: { type: string }

graph:
  nodes:
    - id: summarize
      kind: cli-agent
      provider: claude-code
      prompt: |
        Write a 3-sentence summary of the following topic. Just the summary,
        no preamble.

        Topic: {{topic}}
      writes: [summary]
      timeout_ms: 120000
    - id: critique
      kind: cli-agent
      provider: codex
      prompt: |
        Critique this summary in 2 sentences. Be specific about what's missing
        or wrong. Just the critique, no preamble.

        Summary: {{summary}}
      writes: [critique]
      timeout_ms: 120000
  edges:
    - { from: summarize, to: critique }
```

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "@openexpertise/example-cli-orchestration",
  "version": "0.1.0",
  "private": true,
  "type": "module"
}
```

- [ ] **Step 3: Create `README.md`**

```markdown
# cli-orchestration

Smallest demo of the `cli-agent` node kind. Two nodes:

1. `summarize` — Claude Code writes a 3-sentence summary
2. `critique` — Codex critiques it

## Prereqs

Both `claude` and `codex` must be on `PATH` and authenticated. Run `claude` and `codex` once interactively first if you haven't.

## Run

\`\`\`bash
node packages/cli/dist/bin.js run examples/cli-orchestration \\
  --args '{"topic":"In-memory caching strategies for HTTP APIs"}'
\`\`\`

## What it shows

- Two providers in one graph
- State flow: `summary` written by node 1 is read by node 2 via `{{summary}}`
- Sequential edge ordering (`summarize → critique`)
\`\`\`

In the actual file, the triple-backticks above should be literal backticks (not escaped).

- [ ] **Step 4: Validate the experience**

```bash
node packages/cli/dist/bin.js validate examples/cli-orchestration 2>&1 | tail -5
```

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add examples/cli-orchestration/
git commit -m "demo(cli-orchestration): two-provider sample experience"
```

---

## Task 11: e2e test with mocked subprocess runner

**Files:**

- Create: `e2e/cli-agent.e2e.test.ts`

- [ ] **Step 1: Write the test**

Create `e2e/cli-agent.e2e.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseExperienceYaml } from '@openexpertise/schema'
import { DispatcherRegistry, EventBus, runExperience } from '@openexpertise/core'
import {
  CliAgentDispatcher,
  type SubprocessRunner,
  type SpawnSpec,
  type RunResult,
} from '@openexpertise/node-kinds-cli-agent'

class ScriptedRunner implements SubprocessRunner {
  public calls: Array<{ spec: SpawnSpec; cwd: string }> = []
  constructor(private outputs: Record<string, string>) {}
  async run(spec: SpawnSpec, opts: { timeoutMs: number; cwd: string }): Promise<RunResult> {
    this.calls.push({ spec, cwd: opts.cwd })
    const stdout = this.outputs[spec.cmd] ?? ''
    return { stdout, stderr: '', exitCode: 0, timedOut: false }
  }
}

const YAML = `
name: e2e-cli-agent
version: 0.1.0
state:
  schema:
    topic: { type: string }
    summary: { type: string }
    critique: { type: string }
graph:
  nodes:
    - id: summarize
      kind: cli-agent
      provider: claude-code
      prompt: "summarize {{topic}}"
      writes: [summary]
    - id: critique
      kind: cli-agent
      provider: codex
      prompt: "critique {{summary}}"
      writes: [critique]
  edges:
    - { from: summarize, to: critique }
`

let dir: string
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

describe('cli-agent end-to-end (mocked runner)', () => {
  it('runs two cli-agent nodes in sequence, state flows between them', async () => {
    dir = mkdtempSync(join(tmpdir(), 'oe-e2e-cli-'))
    writeFileSync(join(dir, 'experience.yaml'), YAML)
    mkdirSync(join(dir, '.openexpertise'), { recursive: true })

    const spec = parseExperienceYaml(YAML)
    const runner = new ScriptedRunner({
      claude: 'a three sentence summary about caching.',
      codex: 'the summary missed L1/L2 cache hierarchy.',
    })
    const dispatchers = new DispatcherRegistry()
    dispatchers.register(new CliAgentDispatcher({ runner }))

    const result = await runExperience({
      spec,
      experienceDir: dir,
      dispatchers,
      events: new EventBus(),
      args: { topic: 'caching' },
    })

    expect(result.status).toBe('success')
    expect(result.finalState.summary).toBe('a three sentence summary about caching.')
    expect(result.finalState.critique).toBe('the summary missed L1/L2 cache hierarchy.')

    // Verify the critique node received the interpolated summary.
    const codexCall = runner.calls.find((c) => c.spec.cmd === 'codex')
    expect(codexCall).toBeDefined()
    expect(
      codexCall!.spec.args.some((a) => a.includes('a three sentence summary about caching.')),
    ).toBe(true)
  })
})
```

- [ ] **Step 2: Add the package as an e2e dep**

In `e2e/package.json`, add to `dependencies`:

```json
"@openexpertise/node-kinds-cli-agent": "workspace:*"
```

Run `pnpm install`.

- [ ] **Step 3: Run the e2e test**

```bash
pnpm test e2e/cli-agent.e2e.test.ts 2>&1 | tail -15
```

Expected: PASS (1 test).

- [ ] **Step 4: Full suite**

```bash
pnpm test 2>&1 | tail -8
```

Expected: 155 + 1 = 156 passing.

- [ ] **Step 5: Commit**

```bash
git add e2e/cli-agent.e2e.test.ts e2e/package.json pnpm-lock.yaml
git commit -m "test(e2e): cli-agent two-node flow with scripted runner"
```

---

## Task 12: `docs/cli-agent.md`

**Files:**

- Create: `docs/cli-agent.md`

- [ ] **Step 1: Write the doc**

Create `docs/cli-agent.md`:

````markdown
# The `cli-agent` node kind

`cli-agent` delegates a graph step to an agentic CLI subprocess (Claude Code, Codex, or Gemini). Each invocation is stateless: one subprocess per node run, captures the final stdout, optionally parses JSON and validates against an AJV schema, writes the result to state.

## Why use it

Three reasons to pick `cli-agent` over the SDK-only `agent` kind:

1. **The CLI has tools.** Claude Code can read/edit files, search code, run bash. Codex and Gemini have their own. With `cli-agent`, the CLI does its own tool use — you only see the final answer.
2. **Skills, plugins, MCP.** All three CLIs have their own extension ecosystems. `cli-agent` invokes them in the user's normal CLI environment, so installed skills/plugins/MCP servers Just Work.
3. **No API key juggling.** The CLI uses whatever auth the user already set up.

## YAML reference

\`\`\`yaml
- id: my_step
  kind: cli-agent
  provider: claude-code   # or codex, or gemini
  prompt: |               # inline only; use {{state_field}} for templating
    Review the diff:
    {{diff}}
  workdir: ./checkout     # optional; default = experience dir
  model: claude-sonnet-4-6  # optional, provider-specific
  output_format: json     # text (default) | json
  schema:                 # only used in json mode; AJV-validated
    type: object
    required: [findings]
  timeout_ms: 600000      # default 10min
  extra_args: ['--allowed-tools', 'Read,Grep']  # passed verbatim to the CLI
  reads: [diff]           # standard state-view declaration
  writes: [findings]      # output state field
\`\`\`

## Providers (V1)

| Provider | Command shape |
|---|---|
| `claude-code` | `claude -p "<prompt>" --output-format <text\|json> [--model X] [extra_args]` |
| `codex` | `codex exec --skip-git-repo-check [--model X] [extra_args] "<prompt>"` |
| `gemini` | `gemini --yolo --prompt "<prompt>" [--model X] [extra_args]` |

The provider field is enforced by the schema; unknown values are rejected at `oe validate`.

## Output handling

- **text mode (default):** stdout is written to a single field — the first entry in `writes:`. If `writes:` is empty, the output is dropped. If `writes:` has more than one entry, the dispatcher refuses to run (ambiguous mapping).
- **json mode:** stdout is `JSON.parse`'d. If `schema:` is set, AJV validates the result. Validation failures throw, triggering the node's `on_error` policy.

## Error policy interaction

- Subprocess exits non-zero → throws → `on_error` applies
- Subprocess times out → throws → `on_error` applies
- JSON parse fails or schema invalid → throws → `on_error` applies

Use `on_error: { policy: retry, attempts: 3, backoff: exponential, base_ms: 1000 }` for flaky CLI invocations.

## Testing

For deterministic tests, inject a `SubprocessRunner`:

\`\`\`ts
class FakeRunner implements SubprocessRunner {
  async run(spec, opts) {
    return { stdout: 'canned', stderr: '', exitCode: 0, timedOut: false }
  }
}
dispatchers.register(new CliAgentDispatcher({ runner: new FakeRunner() }))
\`\`\`

See `e2e/cli-agent.e2e.test.ts` for a worked example.

## V1 limitations

- **Stateless only.** Each node runs a fresh subprocess; no conversation memory across nodes. Session-mode is a V2 candidate.
- **Inline prompts only.** No file-path loading (unlike the `agent` kind). Read the file in a preceding `tool` node and pass it via `reads:` if you need that.
- **No streaming.** We wait for the subprocess to finish, then parse stdout in one go.
- **No concurrency within a node.** Use `for_each` for fan-out (still sequential per the V1 scheduler).
- **CLI versions are not version-pinned.** If a provider release changes its flags, the provider file in `packages/node-kinds-cli-agent/src/providers/` needs updating.
````

In the actual file, all triple-backtick fences are literal backticks.

- [ ] **Step 2: Commit**

```bash
git add docs/cli-agent.md
git commit -m "docs: cli-agent node kind reference"
```

---

## Final verification

After all 12 tasks land:

- [ ] **Step 1: Clean build**

```bash
pnpm clean && pnpm install && pnpm -r build 2>&1 | tail -10
```

Expected: 0 errors.

- [ ] **Step 2: Typecheck + lint + format + tests**

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test 2>&1 | tail -10
```

Expected: typecheck clean; lint 0 errors (warnings about `as any` in tests OK); format clean; test count = 119 baseline + 5 (schema) + 6 (runner) + 5 (claude-code) + 4 (codex) + 4 (gemini) + 6 (parse) + 6 (dispatcher) + 1 (e2e) = **156 passing**.

- [ ] **Step 3: Smoke test the example experience structurally (no real CLI)**

```bash
node packages/cli/dist/bin.js validate examples/cli-orchestration 2>&1 | tail -3
```

Expected: exit 0.

- [ ] **Step 4: Update `docs/superpowers/overnight-progress.md`**

Append a section noting Plan A completion: scope, commits, test count, what's next (Plan B — MCP server).

- [ ] **Step 5: Final commit**

```bash
git add docs/superpowers/overnight-progress.md
git commit -m "docs(progress): record Plan A (cli-agent node kind) completion"
git log --oneline -15
```
