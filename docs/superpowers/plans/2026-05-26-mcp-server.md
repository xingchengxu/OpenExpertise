# Plan B — `@openexpertise/mcp-server` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a stdio MCP server (`oe-mcp` binary) that exposes 5 OpenExpertise capabilities (`oe_run`, `oe_validate`, `oe_state`, `oe_inspect`, `oe_evolve`) so any MCP-aware CLI (Claude Code, Codex, Gemini) can invoke OpenExpertise as a tool.

**Architecture:** A new `@openexpertise/mcp-server` package using `@modelcontextprotocol/sdk`. The server registers 5 tools, each a thin wrapper around the existing primitives (`runExperience`, `parseExperienceYaml`, `validateExperienceSpec`, `StateStore`, `EvolutionAdvisor`). The `oe_run` and `oe_evolve` tools reuse the CLI's LLM provider factory (resolved + constructed lazily). Tests use the SDK's in-process transport so no real subprocess is needed.

**Tech Stack:** TypeScript 5.5+, `@modelcontextprotocol/sdk ^1.0`, vitest. Workspace deps on schema, core, evolution, cli (for the factory), all 6 node-kind packages.

**Spec:** `docs/superpowers/specs/2026-05-26-agentic-cli-integration-design.md` (Plan B section)

---

## File Structure

**New package:** `packages/mcp-server/`

```
packages/mcp-server/
├── package.json                    # bin: { "oe-mcp": "./dist/bin.js" }
├── tsconfig.json
├── src/
│   ├── index.ts                    # exports createServer() for tests
│   ├── server.ts                   # createServer(opts) — registers tools, returns Server
│   ├── bin.ts                      # binary entry: createServer + stdio transport
│   └── tools/
│       ├── types.ts                # shared input/output types per tool
│       ├── validate.ts             # oe_validate handler
│       ├── state.ts                # oe_state handler
│       ├── inspect.ts              # oe_inspect handler
│       ├── run.ts                  # oe_run handler (uses lazy LLM proxy)
│       └── evolve.ts               # oe_evolve handler
└── tests/
    └── server.test.ts              # in-process round-trip for all 5 tools
```

**Modified — `packages/cli/package.json`:** add an `exports` map so `@openexpertise/cli/llm-factory` is a subpath import:

```json
"exports": {
  ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" },
  "./llm-factory": { "import": "./dist/llm-factory.js", "types": "./dist/llm-factory.d.ts" }
}
```

**New doc:** `docs/mcp-server.md`

**Modified — root `README.md`:** add a one-sentence mention of MCP under "Why OpenExpertise".

---

## Task 1: Scaffold `@openexpertise/mcp-server`

**Files:**

- Create: `packages/mcp-server/package.json`
- Create: `packages/mcp-server/tsconfig.json`
- Create: `packages/mcp-server/src/index.ts`
- Create: `packages/mcp-server/src/bin.ts`
- Create: `packages/mcp-server/tests/.gitkeep`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "@openexpertise/mcp-server",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "bin": {
    "oe-mcp": "./dist/bin.js"
  },
  "files": ["dist"],
  "publishConfig": { "access": "public" },
  "scripts": {
    "build": "tsc -b",
    "typecheck": "tsc --noEmit",
    "test": "vitest"
  },
  "dependencies": {
    "@openexpertise/cli": "workspace:*",
    "@openexpertise/core": "workspace:*",
    "@openexpertise/evolution": "workspace:*",
    "@openexpertise/node-kinds-agent": "workspace:*",
    "@openexpertise/node-kinds-cli-agent": "workspace:*",
    "@openexpertise/node-kinds-dataset": "workspace:*",
    "@openexpertise/node-kinds-experience": "workspace:*",
    "@openexpertise/node-kinds-skill": "workspace:*",
    "@openexpertise/node-kinds-tool": "workspace:*",
    "@openexpertise/schema": "workspace:*",
    "@modelcontextprotocol/sdk": "^1.0.0"
  }
}
```

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
  "references": [
    { "path": "../cli" },
    { "path": "../core" },
    { "path": "../evolution" },
    { "path": "../node-kinds-agent" },
    { "path": "../node-kinds-cli-agent" },
    { "path": "../node-kinds-dataset" },
    { "path": "../node-kinds-experience" },
    { "path": "../node-kinds-skill" },
    { "path": "../node-kinds-tool" },
    { "path": "../schema" }
  ]
}
```

- [ ] **Step 3: Create `src/index.ts`**

```ts
export { createServer, type CreateServerOpts } from './server.js'
```

This will fail to typecheck until Task 3 creates `server.ts` — TDD red state, expected.

- [ ] **Step 4: Create `src/bin.ts`** (placeholder; real wiring happens in Task 9)

```ts
#!/usr/bin/env node
// Placeholder — Task 9 wires StdioServerTransport.
import { createServer } from './server.js'

void createServer()
```

- [ ] **Step 5: Create empty `tests/.gitkeep`**

- [ ] **Step 6: Wire workspace**

```bash
pnpm install
```

Expected: `@modelcontextprotocol/sdk` downloaded; workspace links resolved.

- [ ] **Step 7: Commit**

```bash
git add packages/mcp-server/ pnpm-lock.yaml
git commit -m "scaffold: @openexpertise/mcp-server package"
```

---

## Task 2: Export `llm-factory` subpath from `@openexpertise/cli`

**Files:**

- Modify: `packages/cli/package.json`

The MCP server's `oe_run` and `oe_evolve` tools need provider selection; we reuse the CLI's factory rather than duplicating it.

- [ ] **Step 1: Add an `exports` map to `packages/cli/package.json`**

Insert this block after `"types": "./dist/index.d.ts",`:

```json
"exports": {
  ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" },
  "./llm-factory": { "import": "./dist/llm-factory.js", "types": "./dist/llm-factory.d.ts" }
}
```

- [ ] **Step 2: Verify subpath resolves**

```bash
pnpm --filter @openexpertise/cli build 2>&1 | tail -3
node -e "import('@openexpertise/cli/llm-factory').then(m => console.log(Object.keys(m)))" 2>&1 | tail -3
```

Expected: the dynamic import logs `[ 'resolveLLMProvider', 'defaultModelFor', 'makeLLMClient' ]` (or similar). If `node` cannot resolve the subpath, the exports map is wrong — fix before continuing.

- [ ] **Step 3: Regression — full test suite**

```bash
pnpm test 2>&1 | tail -5
```

Expected: still 157 passing (subpath export change is non-functional for tests).

- [ ] **Step 4: Commit**

```bash
git add packages/cli/package.json
git commit -m "feat(cli): export llm-factory subpath for MCP server reuse"
```

---

## Task 3: Server skeleton + ListTools handler (TDD)

**Files:**

- Create: `packages/mcp-server/src/server.ts`
- Create: `packages/mcp-server/src/tools/types.ts`
- Create: `packages/mcp-server/tests/server.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/mcp-server/tests/server.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import {
  InMemoryTransport,
} from '@modelcontextprotocol/sdk/inMemory.js'
import { createServer } from '../src/server.js'

async function connectClient() {
  const server = createServer({})
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  const client = new Client({ name: 'test-client', version: '0.0.0' }, { capabilities: {} })
  await client.connect(clientTransport)
  return { client, server }
}

describe('mcp-server', () => {
  it('listTools returns the 5 OE tools', async () => {
    const { client } = await connectClient()
    const result = await client.listTools()
    const names = result.tools.map((t) => t.name).sort()
    expect(names).toEqual(['oe_evolve', 'oe_inspect', 'oe_run', 'oe_state', 'oe_validate'])
  })
})
```

- [ ] **Step 2: Confirm RED**

```bash
pnpm exec vitest run packages/mcp-server/tests/server.test.ts 2>&1 | tail -10
```

Expected: FAIL — server.ts doesn't exist yet (or createServer throws).

- [ ] **Step 3: Create `src/tools/types.ts`** (shared tool input/output shapes — placeholder for now)

```ts
// Each tool exports a handler with this contract.
// Tools added in later tasks register themselves via the registry in server.ts.
export interface ToolHandler {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  call(args: Record<string, unknown>): Promise<unknown>
}
```

- [ ] **Step 4: Create `src/server.ts`**

```ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import type { ToolHandler } from './tools/types.js'

// Tasks 4-8 append imports and entries here as each tool lands. Once all
// 5 land, this is the full set: validate, state, inspect, run, evolve.
const ALL_TOOLS: ToolHandler[] = []

export interface CreateServerOpts {
  // Reserved for future DI (e.g., custom logger or test overrides).
  // Kept as an object param so the signature can grow without breaking callers.
}

export function createServer(_opts: CreateServerOpts = {}): Server {
  const server = new Server(
    { name: 'openexpertise', version: '0.1.0' },
    { capabilities: { tools: {} } },
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: ALL_TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }))

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params
    const tool = ALL_TOOLS.find((t) => t.name === name)
    if (!tool) {
      return {
        content: [{ type: 'text', text: `unknown tool: ${name}` }],
        isError: true,
      }
    }
    try {
      const result = await tool.call((args ?? {}) as Record<string, unknown>)
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    } catch (err) {
      return {
        content: [{ type: 'text', text: `error in ${name}: ${(err as Error).message}` }],
        isError: true,
      }
    }
  })

  return server
}
```

- [ ] **Step 5: Update the test to assert the empty list for now**

Replace the assertion block in `server.test.ts` with:

```ts
describe('mcp-server', () => {
  it('listTools returns the registered set (empty in skeleton)', async () => {
    const { client } = await connectClient()
    const result = await client.listTools()
    const names = result.tools.map((t) => t.name).sort()
    // Will grow to the full 5 as Tasks 4-8 register tools. Skeleton task asserts
    // the framework is wired and listTools round-trips.
    expect(Array.isArray(names)).toBe(true)
    expect(names).toEqual([])
  })
})
```

- [ ] **Step 6: Confirm GREEN**

```bash
pnpm --filter @openexpertise/mcp-server build 2>&1 | tail -5
pnpm exec vitest run packages/mcp-server/tests/server.test.ts 2>&1 | tail -10
```

Expected: build clean; 1 test passes.

- [ ] **Step 7: Commit**

```bash
git add packages/mcp-server/src/server.ts packages/mcp-server/src/tools/types.ts packages/mcp-server/tests/server.test.ts
git commit -m "feat(mcp-server): server skeleton with empty tool registry + listTools round-trip"
```

---

## Task 4: `oe_validate` tool (TDD)

**Files:**

- Create: `packages/mcp-server/src/tools/validate.ts`
- Modify: `packages/mcp-server/src/server.ts` (register tool)
- Modify: `packages/mcp-server/tests/server.test.ts` (extend with oe_validate test)

- [ ] **Step 1: Extend the test**

In `server.test.ts`, ADD imports at the top:

```ts
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
```

REPLACE the existing `expect(names).toEqual([])` with `expect(names).toContain('oe_validate')`.

APPEND a new test block:

```ts
it('oe_validate accepts a well-formed experience and reports valid', async () => {
  const { client } = await connectClient()
  const dir = mkdtempSync(join(tmpdir(), 'oe-mcp-validate-'))
  try {
    writeFileSync(
      join(dir, 'experience.yaml'),
      `name: t
version: 0.1.0
state: { schema: { x: { type: string } } }
graph:
  nodes: [{ id: a, kind: tool, impl: ./x.mjs, writes: [x] }]
  edges: []`,
    )
    const result = await client.callTool({
      name: 'oe_validate',
      arguments: { experience_path: dir },
    })
    const content = result.content as Array<{ type: string; text: string }>
    const payload = JSON.parse(content[0]!.text) as { valid: boolean; errors?: string[] }
    expect(payload.valid).toBe(true)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

it('oe_validate reports errors when experience is malformed', async () => {
  const { client } = await connectClient()
  const dir = mkdtempSync(join(tmpdir(), 'oe-mcp-validate-bad-'))
  try {
    writeFileSync(join(dir, 'experience.yaml'), `name: missing-graph\nversion: 0.1.0\n`)
    const result = await client.callTool({
      name: 'oe_validate',
      arguments: { experience_path: dir },
    })
    const content = result.content as Array<{ type: string; text: string }>
    const payload = JSON.parse(content[0]!.text) as { valid: boolean; errors?: string[] }
    expect(payload.valid).toBe(false)
    expect(payload.errors?.length ?? 0).toBeGreaterThan(0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
```

- [ ] **Step 2: Confirm RED**

```bash
pnpm exec vitest run packages/mcp-server/tests/server.test.ts 2>&1 | tail -15
```

Expected: FAIL — oe_validate not registered.

- [ ] **Step 3: Implement `src/tools/validate.ts`**

```ts
import { readFileSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import {
  parseExperienceYaml,
  validateExperienceSpec,
  ValidationError,
} from '@openexpertise/schema'
import type { ToolHandler } from './types.js'

export const validateTool: ToolHandler = {
  name: 'oe_validate',
  description:
    'Validate an OpenExpertise experience.yaml. Returns { valid, errors? }. ' +
    'errors[] is populated when valid is false.',
  inputSchema: {
    type: 'object',
    required: ['experience_path'],
    properties: {
      experience_path: {
        type: 'string',
        description: 'Path to the experience directory or a .yaml file',
      },
    },
  },
  async call(args) {
    const p = args['experience_path']
    if (typeof p !== 'string') {
      return { valid: false, errors: ['experience_path is required and must be a string'] }
    }
    const yamlPath = resolveExperienceYaml(p)
    if (!existsSync(yamlPath)) {
      return { valid: false, errors: [`experience.yaml not found at ${yamlPath}`] }
    }
    try {
      const source = readFileSync(yamlPath, 'utf8')
      const spec = parseExperienceYaml(source)
      validateExperienceSpec(spec)
      return { valid: true }
    } catch (err) {
      if (err instanceof ValidationError) {
        return { valid: false, errors: err.errors.length > 0 ? err.errors : [err.message] }
      }
      return { valid: false, errors: [(err as Error).message] }
    }
  },
}

function resolveExperienceYaml(input: string): string {
  const abs = resolve(input)
  if (abs.endsWith('.yaml') || abs.endsWith('.yml')) return abs
  return join(abs, 'experience.yaml')
}
```

- [ ] **Step 4: Register in `server.ts`**

In `src/server.ts`, add the import:

```ts
import { validateTool } from './tools/validate.js'
```

And change `ALL_TOOLS`:

```ts
const ALL_TOOLS: ToolHandler[] = [validateTool]
```

- [ ] **Step 5: Confirm GREEN**

```bash
pnpm --filter @openexpertise/mcp-server build 2>&1 | tail -3
pnpm exec vitest run packages/mcp-server/tests/server.test.ts 2>&1 | tail -15
```

Expected: 3 tests pass (listTools + 2 validate).

- [ ] **Step 6: Commit**

```bash
git add packages/mcp-server/src/tools/validate.ts packages/mcp-server/src/server.ts packages/mcp-server/tests/server.test.ts
git commit -m "feat(mcp-server): oe_validate tool"
```

---

## Task 5: `oe_state` tool (TDD)

**Files:**

- Create: `packages/mcp-server/src/tools/state.ts`
- Modify: `packages/mcp-server/src/server.ts`
- Modify: `packages/mcp-server/tests/server.test.ts`

- [ ] **Step 1: Extend the test**

In `server.test.ts`, REPLACE the listTools assertion with:

```ts
expect(names).toContain('oe_state')
```

(keep `oe_validate` in toContain assertions you already have).

APPEND:

```ts
it('oe_state returns "no state yet" when no runs have happened', async () => {
  const { client } = await connectClient()
  const dir = mkdtempSync(join(tmpdir(), 'oe-mcp-state-'))
  try {
    writeFileSync(
      join(dir, 'experience.yaml'),
      `name: t
version: 0.1.0
state: { schema: { x: { type: string } } }
graph: { nodes: [{ id: a, kind: tool, impl: ./x.mjs, writes: [x] }], edges: [] }`,
    )
    const result = await client.callTool({
      name: 'oe_state',
      arguments: { experience_path: dir },
    })
    const content = result.content as Array<{ type: string; text: string }>
    const payload = JSON.parse(content[0]!.text) as { snapshot?: unknown; note?: string }
    expect(payload.note).toMatch(/no runs/i)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
```

- [ ] **Step 2: Confirm RED**

```bash
pnpm exec vitest run packages/mcp-server/tests/server.test.ts 2>&1 | tail -10
```

Expected: FAIL — oe_state not registered.

- [ ] **Step 3: Implement `src/tools/state.ts`**

```ts
import { readFileSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { parseExperienceYaml } from '@openexpertise/schema'
import { StateStore } from '@openexpertise/core'
import type { ToolHandler } from './types.js'

export const stateTool: ToolHandler = {
  name: 'oe_state',
  description:
    "Inspect the SQLite blackboard for an experience. " +
    "Returns { field, value } if 'field' is provided, otherwise { snapshot } with all fields.",
  inputSchema: {
    type: 'object',
    required: ['experience_path'],
    properties: {
      experience_path: { type: 'string' },
      field: { type: 'string', description: 'Optional: a single field name to read' },
    },
  },
  async call(args) {
    const p = args['experience_path']
    if (typeof p !== 'string') {
      throw new Error('experience_path is required and must be a string')
    }
    const dir = resolve(p)
    const yamlPath = join(dir, 'experience.yaml')
    if (!existsSync(yamlPath)) {
      throw new Error(`experience.yaml not found at ${yamlPath}`)
    }
    const spec = parseExperienceYaml(readFileSync(yamlPath, 'utf8'))
    const dbPath = join(dir, '.openexpertise', 'state.sqlite')
    if (!existsSync(dbPath)) {
      return { note: 'no runs have populated state yet', dbPath }
    }
    const store = new StateStore({ dbPath, spec })
    try {
      const field = args['field']
      if (typeof field === 'string') {
        return { field, value: store.get(field) }
      }
      return { snapshot: store.snapshot() }
    } finally {
      store.close()
    }
  },
}
```

- [ ] **Step 4: Register in `server.ts`**

```ts
import { stateTool } from './tools/state.js'
```

```ts
const ALL_TOOLS: ToolHandler[] = [validateTool, stateTool]
```

- [ ] **Step 5: Confirm GREEN**

```bash
pnpm --filter @openexpertise/mcp-server build 2>&1 | tail -3
pnpm exec vitest run packages/mcp-server/tests/server.test.ts 2>&1 | tail -15
```

Expected: 4 tests pass (listTools + 2 validate + 1 state).

- [ ] **Step 6: Commit**

```bash
git add packages/mcp-server/src/tools/state.ts packages/mcp-server/src/server.ts packages/mcp-server/tests/server.test.ts
git commit -m "feat(mcp-server): oe_state tool"
```

---

## Task 6: `oe_inspect` tool (TDD)

**Files:**

- Create: `packages/mcp-server/src/tools/inspect.ts`
- Modify: `packages/mcp-server/src/server.ts`
- Modify: `packages/mcp-server/tests/server.test.ts`

- [ ] **Step 1: Extend the test**

UPDATE the listTools assertion to also `toContain('oe_inspect')`.

APPEND:

```ts
it('oe_inspect reads the event log for a run', async () => {
  const { client } = await connectClient()
  const dir = mkdtempSync(join(tmpdir(), 'oe-mcp-inspect-'))
  try {
    const runsDir = join(dir, '.openexpertise', 'runs')
    require('node:fs').mkdirSync(runsDir, { recursive: true })
    const events = [
      { type: 'run.started', run_id: 'r1', ts: '2026-05-26T00:00:00Z' },
      { type: 'node.completed', run_id: 'r1', node_id: 'a', ts: '2026-05-26T00:00:01Z' },
      { type: 'run.finished', run_id: 'r1', ts: '2026-05-26T00:00:02Z', status: 'success' },
    ]
    writeFileSync(
      join(runsDir, 'r1.jsonl'),
      events.map((e) => JSON.stringify(e)).join('\n'),
    )
    const result = await client.callTool({
      name: 'oe_inspect',
      arguments: { experience_path: dir, run_id: 'r1' },
    })
    const content = result.content as Array<{ type: string; text: string }>
    const payload = JSON.parse(content[0]!.text) as { events: unknown[] }
    expect(payload.events.length).toBe(3)
    expect((payload.events[0] as { type: string }).type).toBe('run.started')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
```

(Note: `require('node:fs').mkdirSync` is awkward in ESM; replace with `mkdirSync` from the `node:fs` import block at the top of the file. Add `mkdirSync` to the existing `import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'` line.)

- [ ] **Step 2: Confirm RED**

```bash
pnpm exec vitest run packages/mcp-server/tests/server.test.ts 2>&1 | tail -10
```

- [ ] **Step 3: Implement `src/tools/inspect.ts`**

```ts
import { readFileSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import type { ToolHandler } from './types.js'

export const inspectTool: ToolHandler = {
  name: 'oe_inspect',
  description:
    'Return the parsed event log for a prior run. Each event is one parsed JSONL line.',
  inputSchema: {
    type: 'object',
    required: ['experience_path', 'run_id'],
    properties: {
      experience_path: { type: 'string' },
      run_id: { type: 'string' },
    },
  },
  async call(args) {
    const p = args['experience_path']
    const runId = args['run_id']
    if (typeof p !== 'string') throw new Error('experience_path is required')
    if (typeof runId !== 'string') throw new Error('run_id is required')
    const dir = resolve(p)
    const logPath = join(dir, '.openexpertise', 'runs', `${runId}.jsonl`)
    if (!existsSync(logPath)) {
      throw new Error(`run log not found at ${logPath}`)
    }
    const events = readFileSync(logPath, 'utf8')
      .trim()
      .split('\n')
      .filter((l) => l.length > 0)
      .map((l) => JSON.parse(l))
    return { events }
  },
}
```

- [ ] **Step 4: Register in `server.ts`**

```ts
import { inspectTool } from './tools/inspect.js'
```

```ts
const ALL_TOOLS: ToolHandler[] = [validateTool, stateTool, inspectTool]
```

- [ ] **Step 5: Confirm GREEN**

```bash
pnpm --filter @openexpertise/mcp-server build 2>&1 | tail -3
pnpm exec vitest run packages/mcp-server/tests/server.test.ts 2>&1 | tail -15
```

Expected: 5 tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/mcp-server/src/tools/inspect.ts packages/mcp-server/src/server.ts packages/mcp-server/tests/server.test.ts
git commit -m "feat(mcp-server): oe_inspect tool"
```

---

## Task 7: `oe_run` tool (TDD)

**Files:**

- Create: `packages/mcp-server/src/tools/run.ts`
- Modify: `packages/mcp-server/src/server.ts`
- Modify: `packages/mcp-server/tests/server.test.ts`

- [ ] **Step 1: Extend the test**

UPDATE listTools assertion to `toContain('oe_run')`.

APPEND a test using the existing `examples/hello-tool` (LLM-free, deterministic):

```ts
it('oe_run executes hello-tool and returns final state', async () => {
  const { client } = await connectClient()
  // Use the actual hello-tool example (LLM-free, deterministic).
  const helloPath = resolve(import.meta.dirname, '..', '..', '..', 'examples', 'hello-tool')
  const result = await client.callTool({
    name: 'oe_run',
    arguments: { experience_path: helloPath },
  })
  const content = result.content as Array<{ type: string; text: string }>
  const payload = JSON.parse(content[0]!.text) as {
    run_id: string
    status: string
    final_state: Record<string, unknown>
  }
  expect(payload.status).toBe('success')
  expect(payload.final_state).toHaveProperty('greeting')
  expect(payload.run_id).toMatch(/^[0-9a-f-]+$/)
}, 30000)
```

Add `import { resolve } from 'node:path'` to the top of the file (alongside `import { join } from 'node:path'` — merge into one line).

- [ ] **Step 2: Confirm RED**

```bash
pnpm exec vitest run packages/mcp-server/tests/server.test.ts 2>&1 | tail -10
```

- [ ] **Step 3: Implement `src/tools/run.ts`**

```ts
import { readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { parseExperienceYaml } from '@openexpertise/schema'
import {
  DispatcherRegistry,
  EventBus,
  runExperience,
  type LLMClient,
} from '@openexpertise/core'
import { ToolDispatcher } from '@openexpertise/node-kinds-tool'
import { AgentDispatcher } from '@openexpertise/node-kinds-agent'
import { SkillDispatcher } from '@openexpertise/node-kinds-skill'
import { DatasetDispatcher } from '@openexpertise/node-kinds-dataset'
import { ExperienceDispatcher } from '@openexpertise/node-kinds-experience'
import { CliAgentDispatcher } from '@openexpertise/node-kinds-cli-agent'
import {
  makeLLMClient,
  resolveLLMProvider,
  defaultModelFor,
} from '@openexpertise/cli/llm-factory'
import { resolveExperienceYaml } from './validate-path.js'
import type { ToolHandler } from './types.js'

export const runTool: ToolHandler = {
  name: 'oe_run',
  description:
    'Execute an OpenExpertise experience. Returns { run_id, status, final_state }. ' +
    'Reuses the same lazy-LLM logic as the CLI: experiences without agent/skill nodes ' +
    'run without any LLM env var.',
  inputSchema: {
    type: 'object',
    required: ['experience_path'],
    properties: {
      experience_path: { type: 'string' },
      args: { type: 'object', description: 'Per-node args passed via RunContext (V1 caveat: not auto-propagated into node bundles)' },
      llm: { type: 'string', enum: ['anthropic', 'openai'], description: 'Optional LLM provider override' },
    },
  },
  async call(args) {
    const p = args['experience_path']
    if (typeof p !== 'string') throw new Error('experience_path is required')
    const yamlPath = resolveExperienceYaml(p)
    const source = readFileSync(yamlPath, 'utf8')
    const spec = parseExperienceYaml(source)
    const experienceDir = dirname(yamlPath)

    // Lazy LLM proxy — mirrors packages/cli/src/commands/run.ts
    const llmFlag = typeof args['llm'] === 'string' ? (args['llm'] as string) : undefined
    let eagerProvider: ReturnType<typeof resolveLLMProvider> | null = null
    try {
      eagerProvider = resolveLLMProvider(llmFlag !== undefined ? { flag: llmFlag } : {})
    } catch (err) {
      if (llmFlag !== undefined) throw err
    }
    const defaultModel = eagerProvider ? defaultModelFor(eagerProvider) : 'claude-sonnet-4-5'

    let cached: LLMClient | null = null
    const llm: LLMClient = {
      async complete(opts) {
        if (!cached) {
          const provider =
            eagerProvider ?? resolveLLMProvider(llmFlag !== undefined ? { flag: llmFlag } : {})
          cached = await makeLLMClient(provider)
        }
        return cached.complete(opts)
      },
    }

    const dispatchers = new DispatcherRegistry()
    dispatchers.register(new ToolDispatcher())
    dispatchers.register(new AgentDispatcher({ client: llm, defaultModel }))
    dispatchers.register(new SkillDispatcher({ client: llm, defaultModel }))
    dispatchers.register(new DatasetDispatcher())
    dispatchers.register(new ExperienceDispatcher({ runExperience }))
    dispatchers.register(new CliAgentDispatcher())

    const runArgs = (args['args'] as Record<string, unknown> | undefined) ?? {}
    const result = await runExperience({
      spec,
      experienceDir,
      dispatchers,
      events: new EventBus(),
      args: runArgs,
    })
    return {
      run_id: result.runId,
      status: result.status,
      final_state: result.finalState,
    }
  },
}
```

- [ ] **Step 4: Create `src/tools/validate-path.ts`** (extracted helper, reused by validate + run)

```ts
import { resolve, join } from 'node:path'

export function resolveExperienceYaml(input: string): string {
  const abs = resolve(input)
  if (abs.endsWith('.yaml') || abs.endsWith('.yml')) return abs
  return join(abs, 'experience.yaml')
}
```

UPDATE `src/tools/validate.ts` to import from `./validate-path.js` instead of defining the function locally — remove the local `resolveExperienceYaml` function and add the import. This is a small refactor to share the helper between validate and run.

- [ ] **Step 5: Register in `server.ts`**

```ts
import { runTool } from './tools/run.js'
```

```ts
const ALL_TOOLS: ToolHandler[] = [validateTool, stateTool, inspectTool, runTool]
```

- [ ] **Step 6: Confirm GREEN**

```bash
pnpm --filter @openexpertise/mcp-server build 2>&1 | tail -3
pnpm exec vitest run packages/mcp-server/tests/server.test.ts 2>&1 | tail -15
```

Expected: 6 tests pass.

- [ ] **Step 7: Commit**

```bash
git add packages/mcp-server/src/tools/run.ts packages/mcp-server/src/tools/validate-path.ts packages/mcp-server/src/tools/validate.ts packages/mcp-server/src/server.ts packages/mcp-server/tests/server.test.ts
git commit -m "feat(mcp-server): oe_run tool with lazy LLM proxy + shared path helper"
```

---

## Task 8: `oe_evolve` tool (TDD)

**Files:**

- Create: `packages/mcp-server/src/tools/evolve.ts`
- Modify: `packages/mcp-server/src/server.ts`
- Modify: `packages/mcp-server/tests/server.test.ts`

- [ ] **Step 1: Extend the test**

UPDATE listTools assertion to `toContain('oe_evolve')` (the final shape should be `expect(names).toEqual(['oe_evolve','oe_inspect','oe_run','oe_state','oe_validate'])`).

APPEND a test using an injected canned LLM via the existing run log fixture. The evolve tool requires an LLM, so we test with the env var unset path — we expect it to throw a helpful error rather than make an LLM call.

```ts
it('oe_evolve throws a helpful error when no LLM env var is set', async () => {
  const { client } = await connectClient()
  const dir = mkdtempSync(join(tmpdir(), 'oe-mcp-evolve-'))
  try {
    const runsDir = join(dir, '.openexpertise', 'runs')
    mkdirSync(runsDir, { recursive: true })
    writeFileSync(
      join(dir, 'experience.yaml'),
      `name: t
version: 0.1.0
state: { schema: { x: { type: string } } }
graph: { nodes: [{ id: a, kind: tool, impl: ./x.mjs, writes: [x] }], edges: [] }`,
    )
    writeFileSync(
      join(runsDir, 'r1.jsonl'),
      JSON.stringify({ type: 'run.started', run_id: 'r1' }),
    )
    // Clear any LLM env vars for this test.
    const prevA = process.env.ANTHROPIC_API_KEY
    const prevO = process.env.OPENAI_API_KEY
    delete process.env.ANTHROPIC_API_KEY
    delete process.env.OPENAI_API_KEY
    try {
      const result = await client.callTool({
        name: 'oe_evolve',
        arguments: { experience_path: dir, run_id: 'r1' },
      })
      expect(result.isError).toBe(true)
      const content = result.content as Array<{ type: string; text: string }>
      expect(content[0]!.text).toMatch(/ANTHROPIC_API_KEY|OPENAI_API_KEY/)
    } finally {
      if (prevA !== undefined) process.env.ANTHROPIC_API_KEY = prevA
      if (prevO !== undefined) process.env.OPENAI_API_KEY = prevO
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
```

- [ ] **Step 2: Confirm RED**

```bash
pnpm exec vitest run packages/mcp-server/tests/server.test.ts 2>&1 | tail -10
```

- [ ] **Step 3: Implement `src/tools/evolve.ts`**

```ts
import { readFileSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { parseExperienceYaml } from '@openexpertise/schema'
import { StateStore, type LLMClient } from '@openexpertise/core'
import { EvolutionAdvisor } from '@openexpertise/evolution'
import {
  makeLLMClient,
  resolveLLMProvider,
  defaultModelFor,
} from '@openexpertise/cli/llm-factory'
import type { ToolHandler } from './types.js'

export const evolveTool: ToolHandler = {
  name: 'oe_evolve',
  description:
    'Generate evolution proposals for a prior run. ' +
    'Returns { proposal_md, proposal_count } — markdown is also written to ' +
    '.openexpertise/evolution/<run_id>.md.',
  inputSchema: {
    type: 'object',
    required: ['experience_path', 'run_id'],
    properties: {
      experience_path: { type: 'string' },
      run_id: { type: 'string' },
      llm: { type: 'string', enum: ['anthropic', 'openai'] },
    },
  },
  async call(args) {
    const p = args['experience_path']
    const runId = args['run_id']
    if (typeof p !== 'string') throw new Error('experience_path is required')
    if (typeof runId !== 'string') throw new Error('run_id is required')

    const dir = resolve(p)
    const yamlPath = join(dir, 'experience.yaml')
    if (!existsSync(yamlPath)) throw new Error(`experience.yaml not found at ${yamlPath}`)
    const yamlSource = readFileSync(yamlPath, 'utf8')
    const spec = parseExperienceYaml(yamlSource)

    const logPath = join(dir, '.openexpertise', 'runs', `${runId}.jsonl`)
    if (!existsSync(logPath)) throw new Error(`run log not found at ${logPath}`)
    const events = readFileSync(logPath, 'utf8')
      .trim()
      .split('\n')
      .filter((l) => l.length > 0)
      .map((l) => JSON.parse(l))

    // Compute state diff from history for this run
    const dbPath = join(dir, '.openexpertise', 'state.sqlite')
    const stateDiff: Array<{ field: string; before: unknown; after: unknown }> = []
    if (existsSync(dbPath)) {
      const store = new StateStore({ dbPath, spec })
      try {
        const fields = Object.keys(spec.state.schema)
        for (const f of fields) {
          const rows = store.history(f).filter((r) => r.run_id === runId)
          if (rows.length === 0) continue
          const first = rows[0]
          const last = rows[rows.length - 1]
          if (!first || !last) continue
          stateDiff.push({ field: f, before: first.value_old, after: last.value_new })
        }
      } finally {
        store.close()
      }
    }

    const llmFlag = typeof args['llm'] === 'string' ? (args['llm'] as string) : undefined
    const provider = resolveLLMProvider(llmFlag !== undefined ? { flag: llmFlag } : {})
    const model = defaultModelFor(provider)
    let cached: LLMClient | null = null
    const llm: LLMClient = {
      async complete(opts) {
        if (!cached) cached = await makeLLMClient(provider)
        return cached.complete(opts)
      },
    }

    const advisor = new EvolutionAdvisor({ client: llm, model })
    const proposals = await advisor.analyze({
      experienceSpec: spec,
      experienceYamlSource: yamlSource,
      runEvents: events,
      stateDiff,
    })
    const md = advisor.renderMarkdown(proposals, runId)
    const outDir = join(dir, '.openexpertise', 'evolution')
    const { mkdirSync, writeFileSync } = await import('node:fs')
    mkdirSync(outDir, { recursive: true })
    writeFileSync(join(outDir, `${runId}.md`), md)
    return { proposal_md: md, proposal_count: proposals.length }
  },
}
```

- [ ] **Step 4: Register in `server.ts`**

```ts
import { evolveTool } from './tools/evolve.js'
```

```ts
const ALL_TOOLS: ToolHandler[] = [validateTool, stateTool, inspectTool, runTool, evolveTool]
```

- [ ] **Step 5: Confirm GREEN**

```bash
pnpm --filter @openexpertise/mcp-server build 2>&1 | tail -3
pnpm exec vitest run packages/mcp-server/tests/server.test.ts 2>&1 | tail -15
```

Expected: 7 tests pass total (listTools + 2 validate + 1 state + 1 inspect + 1 run + 1 evolve).

- [ ] **Step 6: Commit**

```bash
git add packages/mcp-server/src/tools/evolve.ts packages/mcp-server/src/server.ts packages/mcp-server/tests/server.test.ts
git commit -m "feat(mcp-server): oe_evolve tool"
```

---

## Task 9: Bin entry (stdio transport)

**Files:**

- Modify: `packages/mcp-server/src/bin.ts`

- [ ] **Step 1: Rewrite `src/bin.ts`**

```ts
#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createServer } from './server.js'

async function main() {
  const server = createServer({})
  const transport = new StdioServerTransport()
  await server.connect(transport)
  // Stay alive; transport keeps the process running until stdin closes.
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(`oe-mcp failed to start: ${(err as Error).message}`)
  process.exit(1)
})
```

- [ ] **Step 2: Make sure the dist binary is executable**

After building, the `bin.js` needs the shebang and exec bit. The shebang is in source; pnpm's bin install will run `chmod +x` on workspace install. Verify:

```bash
pnpm --filter @openexpertise/mcp-server build 2>&1 | tail -3
pnpm install 2>&1 | tail -3
ls -la node_modules/.bin/oe-mcp 2>&1 | tail -1
```

Expected: a symlink to `packages/mcp-server/dist/bin.js` exists and is executable.

- [ ] **Step 3: Smoke — run the binary, send a listTools request, check response**

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node packages/mcp-server/dist/bin.js 2>&1 | head -20
```

Expected: a JSON response containing the 5 tool names. (The stdio transport reads JSON-RPC from stdin and writes responses to stdout.) If the response shape looks like an MCP `tools/list` result, the binary works.

- [ ] **Step 4: Commit**

```bash
git add packages/mcp-server/src/bin.ts
git commit -m "feat(mcp-server): stdio binary entry (oe-mcp)"
```

---

## Task 10: `docs/mcp-server.md`

**Files:**

- Create: `docs/mcp-server.md`

- [ ] **Step 1: Write the doc**

Use the Write tool. Triple-backticks below are LITERAL (not escaped).

```markdown
# `@openexpertise/mcp-server`

A stdio MCP server that exposes OpenExpertise as 5 tools, callable from any MCP-aware CLI (Claude Code, Codex, Gemini, or other MCP clients).

## Tools

| Tool | Input | Output |
|---|---|---|
| `oe_validate` | `{ experience_path }` | `{ valid: bool, errors?: string[] }` |
| `oe_state` | `{ experience_path, field? }` | `{ field, value }` or `{ snapshot }` or `{ note }` |
| `oe_inspect` | `{ experience_path, run_id }` | `{ events: object[] }` |
| `oe_run` | `{ experience_path, args?, llm? }` | `{ run_id, status, final_state }` |
| `oe_evolve` | `{ experience_path, run_id, llm? }` | `{ proposal_md, proposal_count }` |

`oe_run` and `oe_evolve` use the same LLM provider resolution as `oe run` / `oe evolve` (env var auto-detect + optional `llm` flag).

## Install

\`\`\`bash
# From workspace (post-build):
node packages/mcp-server/dist/bin.js   # for smoke

# Or via the workspace bin symlink:
./node_modules/.bin/oe-mcp
\`\`\`

After npm publish, the canonical install will be `npx -y @openexpertise/mcp-server`.

## Register with each CLI

### Claude Code

\`\`\`bash
claude mcp add openexpertise -- npx -y @openexpertise/mcp-server
\`\`\`

Inside a Claude Code session, you can then say "use the openexpertise tool to validate examples/hello-tool" or "run examples/review-branch".

### Codex CLI

Add to `~/.codex/config.toml`:

\`\`\`toml
[mcp_servers.openexpertise]
command = "npx"
args = ["-y", "@openexpertise/mcp-server"]
\`\`\`

(Exact config path/syntax follows Codex's MCP convention; check `codex --help` if unsure.)

### Gemini CLI

Gemini supports MCP via its extension/MCP config. See `gemini --help` for the latest registration command.

## Permission notes

- The server has no network surface — it's stdio-only, runs in the user's CLI process.
- Tools that hit disk (run, evolve) write to the experience's `.openexpertise/` dir.
- `oe_run` may spawn subprocesses if the experience uses `cli-agent` nodes — these inherit the user's environment.
- Only enable this MCP server in trusted CLI sessions.

## Testing

The server uses `@modelcontextprotocol/sdk`'s `InMemoryTransport` for in-process round-trips. See `packages/mcp-server/tests/server.test.ts` for the pattern.

## V1 limitations

- **No `oe_init` / `oe_resume` / `oe_diff` / `oe_reset-state` yet.** Could be added in a follow-up; the 5 shipped tools cover most agentic flows.
- **No streaming output.** `oe_run` blocks until the experience finishes, then returns the final state. Long runs may stress the MCP client's tool-call timeout.
- **No progress events.** MCP supports server-initiated notifications; not used yet. Future work could stream per-node `node.completed` events to the client.
- **No auth.** Trust model = the CLI session.
```

- [ ] **Step 2: Commit**

```bash
git add docs/mcp-server.md
git commit -m "docs: mcp-server reference + per-CLI registration instructions"
```

---

## Task 11: README mention + progress log

**Files:**

- Modify: `README.md` (root)
- Modify: `docs/superpowers/overnight-progress.md`

- [ ] **Step 1: Add MCP bullet to root README**

In `README.md`, find the `## Why OpenExpertise` section. After the existing 4 bullets, add a 5th:

```markdown
- **Two-way agentic-CLI integration.** Outbound: the `cli-agent` node kind delegates steps to Claude Code, Codex, or Gemini. Inbound: `@openexpertise/mcp-server` exposes 5 OE tools over MCP, callable from any of those CLIs. See [`docs/cli-agent.md`](docs/cli-agent.md) and [`docs/mcp-server.md`](docs/mcp-server.md).
```

- [ ] **Step 2: Append progress entry**

In `docs/superpowers/overnight-progress.md`, append:

```markdown

---

## Plan B — MCP Server (2026-05-26)

Branch: `feat/mcp-server` (off `main`)
Spec: `docs/superpowers/specs/2026-05-26-agentic-cli-integration-design.md` (Plan B section)
Plan: `docs/superpowers/plans/2026-05-26-mcp-server.md`

### What shipped

| Area | Result |
|---|---|
| New package | `@openexpertise/mcp-server` with `oe-mcp` bin |
| Tools | `oe_validate`, `oe_state`, `oe_inspect`, `oe_run`, `oe_evolve` |
| CLI integration | Reuses `@openexpertise/cli/llm-factory` via new subpath export |
| Tests | In-process MCP round-trip via SDK's InMemoryTransport |
| Docs | `docs/mcp-server.md` with per-CLI registration instructions |

### Next concrete actions

1. Merge `feat/mcp-server` into `main`.
2. Register the server in Claude Code: `claude mcp add openexpertise -- node $PWD/packages/mcp-server/dist/bin.js`. Validate by asking Claude to "use oe_validate on examples/hello-tool".
3. Launch prep: npm publish (all packages have publishConfig), GitHub remote, docs site.
```

- [ ] **Step 3: Final verification**

```bash
pnpm clean && pnpm install && pnpm -r build 2>&1 | tail -5
pnpm typecheck 2>&1 | tail -3
pnpm lint 2>&1 | tail -3
pnpm format:check 2>&1 | tail -3
pnpm test 2>&1 | tail -5
```

Expected: clean across all; test count = 157 baseline + 7 mcp-server = 164.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/superpowers/overnight-progress.md
git commit -m "docs: README MCP bullet + Plan B progress log"
git log --oneline main..HEAD | head -20
```
