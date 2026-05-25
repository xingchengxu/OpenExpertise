# OpenExpertise V1 — Plan 6: Evolution Advisor + Distribution

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close out V1 by implementing the **evolution advisor** (the `e`-axis proof point from spec §18) and preparing the project for distribution. After Plan 6, `oe evolve <run-id>` produces a structured markdown proposal of graph edits, `oe diff` lists pending proposals, and the npm packages declare their publish configs.

**Architecture:** A new `@openexpertise/evolution` package houses the `EvolutionAdvisor` — given a run's event stream + state diff + current `experience.yaml`, it asks an `LLMClient` (the same interface as agent/skill dispatchers) for a structured list of three permitted operations: `add-node`, `tune-param`, `add-dataset-case`. Output is markdown with embedded diff blocks, written to `.openexpertise/evolution/<run-id>.md`. CLI `oe evolve` runs it on demand; `oe run --evolve` runs it after a successful run. `oe diff` from Plan 4's stub becomes a real listing command.

**Tech Stack additions:** none — reuses `@openexpertise/core` `LLMClient` + `@openexpertise/node-kinds-agent` `AnthropicLLMClient`.

**Scope explicitly excludes:**
- Auto-applying evolutions (V1 keeps human-in-the-loop per spec §8)
- Edge rewiring / node removal (V1 limits to add-node / tune-param / add-dataset-case per spec §8)
- Cross-experience evolution proposals

---

## File structure

```
packages/evolution/                          # NEW package
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts                             # public exports
    ├── advisor.ts                           # EvolutionAdvisor class
    └── prompts/
        └── proposal.md                      # the system prompt the LLM sees
packages/cli/src/commands/
├── evolve.ts                                # NEW: oe evolve <run-id>
└── diff.ts                                  # MODIFIED: real listing logic
packages/cli/src/commands/run.ts             # MODIFIED: --evolve flag
packages/core/src/runner.ts                  # MODIFIED: expose evolveAfter hook
e2e/
└── evolution.e2e.test.ts                    # NEW
README.md                                    # MODIFIED: full quickstart + install
packages/*/package.json                      # MODIFIED: publishConfig where needed
```

---

## Task 1: Scaffold `@openexpertise/evolution` package

**Files:**
- Create: `packages/evolution/package.json`
- Create: `packages/evolution/tsconfig.json`
- Create: `packages/evolution/src/index.ts` (placeholder)

- [ ] **Step 1.1: `package.json`**

```json
{
  "name": "@openexpertise/evolution",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist", "src/prompts"],
  "scripts": {
    "build": "tsc -b && node -e \"require('node:fs').cpSync('src/prompts','dist/prompts',{recursive:true})\"",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@openexpertise/core": "workspace:*",
    "@openexpertise/schema": "workspace:*"
  }
}
```

- [ ] **Step 1.2: `tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "references": [{ "path": "../core" }, { "path": "../schema" }],
  "include": ["src/**/*"]
}
```

- [ ] **Step 1.3: `src/index.ts`**

```ts
export { EvolutionAdvisor, type EvolutionAdvisorOpts, type EvolutionProposal } from './advisor.js'
```

- [ ] **Step 1.4: Install + commit**

```bash
cd /Users/xuxingcheng/SHLAB/github/OpenExpertise/.claude/worktrees/overnight-plans-2-6
pnpm install
git add packages/evolution/
git commit -m "feat(evolution): scaffold @openexpertise/evolution package"
```

---

## Task 2: `EvolutionAdvisor` implementation

**Files:**
- Create: `packages/evolution/src/prompts/proposal.md`
- Create: `packages/evolution/src/advisor.ts`
- Create: `packages/evolution/tests/advisor.test.ts`

- [ ] **Step 2.1: Write the LLM prompt template**

Create `packages/evolution/src/prompts/proposal.md`:
```
You are an OpenExpertise evolution advisor. Given a run's event log, state diff,
and current experience.yaml, propose at most 5 concrete edits to the experience.

Permitted operations (V1):
- `add-node`: insert a new node and the edges that connect it
- `tune-param`: adjust a literal in experience.yaml (a threshold, a prompt path,
  a model alias, a phase label)
- `add-dataset-case`: append rows to a dataset source

Forbidden (V1, do NOT propose):
- removing nodes
- rewiring or removing edges
- changing a node's kind
- changing state.schema

For each proposal, return: operation, confidence (high/medium/low), rationale
(one paragraph, link to evidence), and the unified diff or rows to append.

Return your response as a structured object via the structured_output tool.
```

- [ ] **Step 2.2: Implement `advisor.ts`**

Create `packages/evolution/src/advisor.ts`:
```ts
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { LLMClient, LLMTool } from '@openexpertise/core'
import type { ExperienceSpec } from '@openexpertise/schema'

const HERE = dirname(fileURLToPath(import.meta.url))

export type EvolutionOperation = 'add-node' | 'tune-param' | 'add-dataset-case'
export type EvolutionConfidence = 'high' | 'medium' | 'low'

export interface EvolutionProposal {
  operation: EvolutionOperation
  confidence: EvolutionConfidence
  rationale: string
  diff: string // unified diff snippet (for add-node / tune-param) OR JSON array (for add-dataset-case)
  title: string
}

export interface EvolutionAdvisorOpts {
  client: LLMClient
  model?: string
}

export interface EvolutionInput {
  experienceSpec: ExperienceSpec
  experienceYamlSource: string
  runEvents: unknown[] // jsonl lines parsed
  stateDiff: Array<{ field: string; before: unknown; after: unknown }>
}

const PROPOSAL_SCHEMA = {
  type: 'object',
  required: ['proposals'],
  properties: {
    proposals: {
      type: 'array',
      maxItems: 5,
      items: {
        type: 'object',
        required: ['operation', 'confidence', 'title', 'rationale', 'diff'],
        properties: {
          operation: { type: 'string', enum: ['add-node', 'tune-param', 'add-dataset-case'] },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          title: { type: 'string' },
          rationale: { type: 'string' },
          diff: { type: 'string' },
        },
      },
    },
  },
}

export class EvolutionAdvisor {
  constructor(private readonly opts: EvolutionAdvisorOpts) {}

  async analyze(input: EvolutionInput): Promise<EvolutionProposal[]> {
    const systemPath = resolve(HERE, 'prompts/proposal.md')
    const system = readFileSync(systemPath, 'utf8')
    const userPayload = {
      experience_yaml: input.experienceYamlSource,
      run_event_count: input.runEvents.length,
      state_diff: input.stateDiff,
      // a small slice of events so we don't blow the context budget
      sample_events: input.runEvents.slice(0, 30),
    }
    const tool: LLMTool = {
      name: 'structured_output',
      description: 'Return a list of evolution proposals matching the schema',
      input_schema: PROPOSAL_SCHEMA,
    }
    const result = await this.opts.client.complete({
      model: this.opts.model ?? 'claude-sonnet-4-5',
      system,
      messages: [{ role: 'user', content: JSON.stringify(userPayload, null, 2) }],
      tools: [tool],
      max_tokens: 8192,
    })
    const call = result.tool_calls?.find((c) => c.name === 'structured_output')
    if (!call) return []
    const input2 = call.input as { proposals?: EvolutionProposal[] }
    return input2.proposals ?? []
  }

  renderMarkdown(proposals: EvolutionProposal[], runId: string): string {
    const lines: string[] = []
    lines.push(`# Evolution Proposals for run \`${runId}\``)
    lines.push('')
    lines.push(`Generated by OpenExpertise EvolutionAdvisor. Review each suggestion`)
    lines.push(`and \`git apply\` the diff blocks you accept; runtime never auto-applies.`)
    lines.push('')
    if (proposals.length === 0) {
      lines.push('_No proposals generated for this run._')
      return lines.join('\n') + '\n'
    }
    for (let i = 0; i < proposals.length; i++) {
      const p = proposals[i]!
      lines.push(`## ${i + 1}. ${p.title} _(${p.operation}, confidence: ${p.confidence})_`)
      lines.push('')
      lines.push(p.rationale)
      lines.push('')
      lines.push('```diff')
      lines.push(p.diff)
      lines.push('```')
      lines.push('')
    }
    return lines.join('\n')
  }
}
```

- [ ] **Step 2.3: Write tests**

Create `packages/evolution/tests/advisor.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { EvolutionAdvisor } from '../src/index.js'
import type { LLMClient, LLMCompleteOpts } from '@openexpertise/core'
import type { ExperienceSpec } from '@openexpertise/schema'

class CannedLLM implements LLMClient {
  constructor(private proposals: unknown[]) {}
  async complete(_opts: LLMCompleteOpts) {
    return {
      text: '',
      tool_calls: [{
        name: 'structured_output',
        input: { proposals: this.proposals },
      }],
    }
  }
}

const spec: ExperienceSpec = {
  name: 't', version: '0.1.0',
  state: { schema: { x: { type: 'string' } } },
  graph: { nodes: [{ id: 'a', kind: 'tool', impl: 'x' }], edges: [] },
}

describe('EvolutionAdvisor', () => {
  it('returns parsed proposals from the LLM response', async () => {
    const llm = new CannedLLM([
      {
        operation: 'tune-param',
        confidence: 'high',
        title: 'Bump retry attempts',
        rationale: 'Two transient failures observed.',
        diff: '- attempts: 1\n+ attempts: 3\n',
      },
    ])
    const advisor = new EvolutionAdvisor({ client: llm })
    const proposals = await advisor.analyze({
      experienceSpec: spec,
      experienceYamlSource: 'name: t\nversion: 0.1.0\n',
      runEvents: [{ type: 'run.started' }],
      stateDiff: [],
    })
    expect(proposals).toHaveLength(1)
    expect(proposals[0]?.operation).toBe('tune-param')
    expect(proposals[0]?.confidence).toBe('high')
  })

  it('renders markdown with diff blocks', async () => {
    const advisor = new EvolutionAdvisor({ client: new CannedLLM([]) })
    const md = advisor.renderMarkdown([
      {
        operation: 'add-node',
        confidence: 'medium',
        title: 'Add licence-check',
        rationale: 'Findings touched 3rd-party deps; no licence node exists.',
        diff: '+ - id: licence_check\n+   kind: skill\n',
      },
    ], 'run-123')
    expect(md).toContain('# Evolution Proposals for run `run-123`')
    expect(md).toContain('## 1. Add licence-check _(add-node, confidence: medium)_')
    expect(md).toContain('```diff')
    expect(md).toContain('+ - id: licence_check')
  })

  it('renders an empty notice when no proposals', () => {
    const advisor = new EvolutionAdvisor({ client: new CannedLLM([]) })
    const md = advisor.renderMarkdown([], 'r')
    expect(md).toContain('_No proposals generated for this run._')
  })

  it('returns empty array when LLM did not call structured_output', async () => {
    const llm: LLMClient = { async complete() { return { text: 'just talking' } } }
    const advisor = new EvolutionAdvisor({ client: llm })
    const proposals = await advisor.analyze({
      experienceSpec: spec,
      experienceYamlSource: '',
      runEvents: [],
      stateDiff: [],
    })
    expect(proposals).toEqual([])
  })
})
```

- [ ] **Step 2.4: Build + run + commit**

```bash
pnpm --filter @openexpertise/evolution build
pnpm vitest run packages/evolution/
git add packages/evolution/src/ packages/evolution/tests/
git commit -m "feat(evolution): EvolutionAdvisor + proposal markdown renderer"
```

---

## Task 3: `oe evolve <run-id>` CLI command

**Files:**
- Modify: `packages/cli/package.json` — add `@openexpertise/evolution` dep
- Modify: `packages/cli/tsconfig.json` — reference
- Create: `packages/cli/src/commands/evolve.ts`
- Modify: `packages/cli/src/index.ts` — register `evolve` command

- [ ] **Step 3.1: Add `@openexpertise/evolution` to CLI deps**

Edit `packages/cli/package.json`:
```json
"@openexpertise/evolution": "workspace:*"
```

Edit `packages/cli/tsconfig.json` `references` to include `{ "path": "../evolution" }`.

- [ ] **Step 3.2: Implement `evolve.ts`**

Create `packages/cli/src/commands/evolve.ts`:
```ts
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseExperienceYaml } from '@openexpertise/schema'
import { StateStore } from '@openexpertise/core'
import { EvolutionAdvisor } from '@openexpertise/evolution'
import { AnthropicLLMClient } from '@openexpertise/node-kinds-agent'
import type { Logger } from 'pino'

export interface EvolveOpts {
  experiencePath: string
  runId: string
  logger: Logger
}

export async function evolveCommand(opts: EvolveOpts): Promise<number> {
  const dir = resolve(opts.experiencePath)
  const yamlPath = join(dir, 'experience.yaml')
  if (!existsSync(yamlPath)) {
    opts.logger.error({ yamlPath }, 'experience.yaml not found')
    return 1
  }
  const yamlSource = readFileSync(yamlPath, 'utf8')
  const spec = parseExperienceYaml(yamlSource)

  const logPath = join(dir, '.openexpertise', 'runs', `${opts.runId}.jsonl`)
  if (!existsSync(logPath)) {
    opts.logger.error({ logPath }, 'run log not found')
    return 1
  }
  const events = readFileSync(logPath, 'utf8')
    .trim().split('\n').filter((l) => l.length > 0)
    .map((l) => JSON.parse(l))

  // Compute state diff from history for this run
  const dbPath = join(dir, '.openexpertise', 'state.sqlite')
  let stateDiff: Array<{ field: string; before: unknown; after: unknown }> = []
  if (existsSync(dbPath)) {
    const store = new StateStore({ dbPath, spec })
    try {
      const fields = Object.keys(spec.state.schema)
      for (const f of fields) {
        const rows = store.history(f).filter((r) => r.run_id === opts.runId)
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

  const advisor = new EvolutionAdvisor({ client: new AnthropicLLMClient() })
  const proposals = await advisor.analyze({
    experienceSpec: spec,
    experienceYamlSource: yamlSource,
    runEvents: events,
    stateDiff,
  })
  const md = advisor.renderMarkdown(proposals, opts.runId)
  const outDir = join(dir, '.openexpertise', 'evolution')
  mkdirSync(outDir, { recursive: true })
  const outPath = join(outDir, `${opts.runId}.md`)
  writeFileSync(outPath, md)
  opts.logger.info({ outPath, proposalCount: proposals.length }, 'evolution proposal written')
  return 0
}
```

- [ ] **Step 3.3: Register in `cli/src/index.ts`**

Add:
```ts
import { evolveCommand } from './commands/evolve.js'

  program
    .command('evolve')
    .description('Generate evolution proposals for a prior run')
    .argument('<run-id>', 'prior run id')
    .option('--experience <path>', 'experience path', '.')
    .action(async (runId: string, cmdOpts: { experience: string }, cmd: Command) => {
      const root = cmd.optsWithGlobals()
      const logger = makeLogger({ pretty: root.logFormat === 'pretty', level: root.logLevel })
      process.exit(await evolveCommand({ experiencePath: cmdOpts.experience, runId, logger }))
    })
```

- [ ] **Step 3.4: Install + build + smoke**

```bash
pnpm install
pnpm --filter @openexpertise/cli build
node packages/cli/dist/bin.js evolve --help
git add packages/cli/package.json packages/cli/tsconfig.json packages/cli/src/commands/evolve.ts packages/cli/src/index.ts
git commit -m "feat(cli): oe evolve <run-id> writes evolution proposals"
```

---

## Task 4: Real `oe diff` listing pending proposals

**Files:**
- Modify: `packages/cli/src/commands/diff.ts` — list `.openexpertise/evolution/*.md`

- [ ] **Step 4.1: Replace `diff.ts` stub**

Replace contents of `packages/cli/src/commands/diff.ts`:
```ts
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Logger } from 'pino'

export interface DiffOpts {
  experiencePath: string
  logger: Logger
}

export async function diffCommand(opts: DiffOpts): Promise<number> {
  const dir = resolve(opts.experiencePath)
  const evoDir = join(dir, '.openexpertise', 'evolution')
  if (!existsSync(evoDir)) {
    opts.logger.info({ evoDir }, 'no evolution proposals yet — run `oe evolve <run-id>` first')
    return 0
  }
  const files = readdirSync(evoDir).filter((f) => f.endsWith('.md'))
  if (files.length === 0) {
    opts.logger.info({ evoDir }, 'evolution directory is empty')
    return 0
  }
  files.sort()
  opts.logger.info({ count: files.length }, 'pending evolution proposals')
  for (const f of files) {
    const md = readFileSync(join(evoDir, f), 'utf8')
    // First 20 lines for compact listing
    const preview = md.split('\n').slice(0, 20).join('\n')
    opts.logger.info({ file: f }, 'proposal')
    process.stdout.write(preview + '\n---\n')
  }
  return 0
}
```

- [ ] **Step 4.2: Build + commit**

```bash
pnpm --filter @openexpertise/cli build
git add packages/cli/src/commands/diff.ts
git commit -m "feat(cli): oe diff lists pending evolution proposals"
```

---

## Task 5: `oe run --evolve` flag (auto-trigger after success)

**Files:**
- Modify: `packages/cli/src/commands/run.ts` — accept `evolve: boolean`; if true and run.status==='success', invoke evolveCommand
- Modify: `packages/cli/src/index.ts` — add `--evolve` option

- [ ] **Step 5.1: Modify `run.ts`**

After the existing run-complete block, add (before returning):
```ts
  // Plan 6: optional auto-evolve trigger
  if (opts.evolve && result.status === 'success') {
    try {
      const { evolveCommand } = await import('./evolve.js')
      await evolveCommand({ experiencePath: experienceDir, runId: result.runId, logger: opts.logger })
    } catch (err) {
      opts.logger.warn({ err: (err as Error).message }, 'evolve trigger failed (non-blocking)')
    }
  }
```

And add `evolve: boolean` to `RunOpts`.

- [ ] **Step 5.2: Add `--evolve` flag in `cli/index.ts`**

Modify the `run` command:
```ts
  program
    .command('run')
    .description('Execute an experience')
    .argument('[path]', 'path to experience.yaml or experience directory', '.')
    .option('--args <json>', 'JSON object passed as args to the experience', '{}')
    .option('--tui', 'show interactive dashboard instead of log output', false)
    .option('--evolve', 'after a successful run, generate evolution proposals', false)
    .action(async (path: string, cmdOpts: { args: string; tui: boolean; evolve: boolean }, cmd: Command) => {
      const root = cmd.optsWithGlobals()
      const logger = makeLogger({ pretty: root.logFormat === 'pretty', level: root.logLevel })
      let args: Record<string, unknown> = {}
      try { args = JSON.parse(cmdOpts.args) } catch { logger.error('--args must be valid JSON'); process.exit(2) }
      process.exit(await runCommand({ path, args, logger, tui: cmdOpts.tui, evolve: cmdOpts.evolve }))
    })
```

- [ ] **Step 5.3: Build + commit**

```bash
pnpm --filter @openexpertise/cli build
git add packages/cli/src/commands/run.ts packages/cli/src/index.ts
git commit -m "feat(cli): --evolve flag auto-triggers evolution after success"
```

---

## Task 6: E2E for evolution with mocked LLM

**Files:**
- Create: `e2e/evolution.e2e.test.ts`

- [ ] **Step 6.1: Write test**

Create `e2e/evolution.e2e.test.ts`:
```ts
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseExperienceYaml } from '@openexpertise/schema'
import {
  DispatcherRegistry, EventBus, runExperience, StateStore,
  type LLMClient, type LLMCompleteOpts,
} from '@openexpertise/core'
import { ToolDispatcher } from '@openexpertise/node-kinds-tool'
import { EvolutionAdvisor } from '@openexpertise/evolution'

class CannedLLM implements LLMClient {
  async complete(_opts: LLMCompleteOpts) {
    return {
      text: '',
      tool_calls: [{
        name: 'structured_output',
        input: {
          proposals: [
            {
              operation: 'tune-param',
              confidence: 'high',
              title: 'Tighten threshold',
              rationale: 'Saw underflow.',
              diff: '- threshold: 0.5\n+ threshold: 0.6\n',
            },
          ],
        },
      }],
    }
  }
}

let dir: string
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }) })

describe('Evolution end-to-end', () => {
  it('runs an experience, then generates an evolution markdown file', async () => {
    dir = mkdtempSync(join(tmpdir(), 'oe-e2e-evo-'))
    mkdirSync(join(dir, 'tools'), { recursive: true })
    writeFileSync(join(dir, 'tools/inc.mjs'),
      `export default async () => ({ state_delta: { count: 1 } })\n`)
    writeFileSync(join(dir, 'experience.yaml'), [
      'name: e',
      'version: 0.1.0',
      'state:',
      '  schema:',
      '    count: { type: number }',
      'graph:',
      '  nodes:',
      '    - id: inc',
      '      kind: tool',
      '      impl: ./tools/inc.mjs',
      '      writes: [count]',
      '  edges: []',
    ].join('\n'))
    const yamlSource = readFileSync(join(dir, 'experience.yaml'), 'utf8')
    const spec = parseExperienceYaml(yamlSource)

    const dispatchers = new DispatcherRegistry()
    dispatchers.register(new ToolDispatcher())

    const r = await runExperience({
      spec, experienceDir: dir, dispatchers, events: new EventBus(), args: {},
    })
    expect(r.status).toBe('success')

    const logPath = join(dir, '.openexpertise', 'runs', `${r.runId}.jsonl`)
    expect(existsSync(logPath)).toBe(true)
    const events = readFileSync(logPath, 'utf8').trim().split('\n').map((l) => JSON.parse(l))

    const store = new StateStore({
      dbPath: join(dir, '.openexpertise', 'state.sqlite'),
      spec,
    })
    const stateDiff: { field: string; before: unknown; after: unknown }[] = []
    for (const f of Object.keys(spec.state.schema)) {
      const h = store.history(f).filter((row) => row.run_id === r.runId)
      if (h.length > 0) {
        stateDiff.push({ field: f, before: h[0]?.value_old, after: h[h.length - 1]?.value_new })
      }
    }
    store.close()

    const advisor = new EvolutionAdvisor({ client: new CannedLLM() })
    const proposals = await advisor.analyze({
      experienceSpec: spec,
      experienceYamlSource: yamlSource,
      runEvents: events,
      stateDiff,
    })
    expect(proposals).toHaveLength(1)
    const md = advisor.renderMarkdown(proposals, r.runId)
    expect(md).toContain('Tighten threshold')
    expect(md).toContain('tune-param')
  })
})
```

- [ ] **Step 6.2: Add e2e dep on evolution**

Edit `e2e/package.json` to add:
```json
"@openexpertise/evolution": "workspace:*"
```

- [ ] **Step 6.3: Install + run + commit**

```bash
pnpm install
pnpm -r build
pnpm vitest run e2e/evolution.e2e.test.ts
git add e2e/evolution.e2e.test.ts e2e/package.json
git commit -m "test(e2e): evolution advisor end-to-end with canned LLM"
```

---

## Task 7: Distribution polish — README + publish configs

**Files:**
- Modify: `README.md` — full quickstart, install, link to all 6 plans
- Modify: each `packages/*/package.json` — add `publishConfig: { access: "public" }`

- [ ] **Step 7.1: Rewrite root `README.md`**

Replace with:
```markdown
# OpenExpertise

An open-source execution engine for **experience flows** — heterogeneous executable graphs that codify expert knowledge into runnable, evolving artifacts.

Think of it as: deterministic graph orchestrator (like `/workflows`) **plus** a persistent blackboard for domain state **plus** an evolution loop that proposes graph edits after each run. Authoring is mediated by a Claude Code skill so non-engineers can capture their expertise.

## Status

V1 complete. All 6 plans landed. ≥100 tests pass.

## Install

```bash
# From source (workspace):
git clone <repo-url>
cd OpenExpertise
pnpm install
pnpm -r build

# Use the CLI:
node packages/cli/dist/bin.js --help
```

(Publication to npm is configured per-package; once npm-published you'll be able to `npm i -g @openexpertise/cli`.)

## Quick start — `hello-tool`

```bash
node packages/cli/dist/bin.js run examples/hello-tool
# → finalState: { greeting: 'hello, World' }
```

## Quick start — `dataset-aggregate`

```bash
node packages/cli/dist/bin.js run examples/dataset-aggregate
# → finalState: { rows: [...4 rows...], total: 60 }
```

## Quick start — `review-branch` (requires `ANTHROPIC_API_KEY`)

```bash
export ANTHROPIC_API_KEY=sk-...
node packages/cli/dist/bin.js run examples/review-branch --args '{"pr_id":"PR-1"}'
```

## All CLI commands

| Command | Purpose |
|---|---|
| `oe init <name>` | Scaffold a new experience directory |
| `oe validate [path]` | Validate `experience.yaml` |
| `oe run [path]` | Execute an experience (`--tui`, `--evolve` flags) |
| `oe resume <run-id>` | Re-run with cache replay |
| `oe inspect <run-id>` | Replay a run's event log |
| `oe state [field]` | Inspect blackboard |
| `oe reset-state --yes` | Wipe blackboard |
| `oe evolve <run-id>` | Generate evolution proposals |
| `oe diff` | List pending evolution proposals |

## Authoring with Claude Code

Install the `experience-creator` skill:

```bash
mkdir -p ~/.claude/skills
cp -R packages/skill-experience-creator ~/.claude/skills/experience-creator
```

Then in Claude Code: "make an OpenExpertise experience for X".

## Architecture

The 6-plan V1 buildout:

1. **Plan 1** — Walking skeleton: monorepo, schema package, core runtime, ToolDispatcher, CLI, hello-tool example
2. **Plan 2** — Heterogeneous dispatchers: AgentDispatcher (Anthropic SDK), SkillDispatcher, DatasetDispatcher, ExperienceDispatcher, on_error policies
3. **Plan 3** — Control flow: for_each, conditional edges (when:), pipeline groups, phase grouping, review-branch demo
4. **Plan 4** — Cache + resume + bounded loop + TUI (ink) + remaining CLI commands
5. **Plan 5** — `experience-creator` authoring skill for Claude Code
6. **Plan 6** — `EvolutionAdvisor` + `oe evolve` / `oe diff` / `oe run --evolve`

Design doc: `docs/superpowers/specs/2026-05-25-openexpertise-design.md`.
Implementation plans: `docs/superpowers/plans/`.

## Development

```bash
pnpm test          # all unit + e2e tests
pnpm typecheck     # tsc across all packages
pnpm lint          # eslint
pnpm format:check  # prettier
pnpm format        # prettier --write
```

## License

(TBD by the maintainer)
```

- [ ] **Step 7.2: Add `publishConfig` to each publishable package**

For each of `packages/{schema,core,node-kinds-tool,node-kinds-agent,node-kinds-skill,node-kinds-dataset,node-kinds-experience,evolution,tui,cli,skill-experience-creator}/package.json`, add:
```json
"publishConfig": { "access": "public" }
```

This is a small targeted edit per file; do not change other fields.

- [ ] **Step 7.3: Commit**

```bash
git add README.md packages/*/package.json
git commit -m "docs+chore(plan-6): root README quickstart + publishConfig on all packages"
```

---

## Task 8: Final clean rebuild + summary commit

- [ ] **Step 8.1:**

```bash
cd /Users/xuxingcheng/SHLAB/github/OpenExpertise/.claude/worktrees/overnight-plans-2-6
pnpm clean
pnpm install
pnpm -r build
pnpm typecheck
pnpm format
pnpm format:check
pnpm lint
pnpm test
git status
git add -A
git commit -m "style(plan-6): prettier/lint cleanup" || true
```

Expected: ~106 tests pass (100 + advisor 4 + evolution e2e 1 + ~1 misc).

---

## Coverage check

| Spec section | Plan 6 task(s) | Coverage |
|---|---|---|
| §8 EvolutionAdvisor | Tasks 1-2 | ✅ |
| §8 three permitted operations (add-node / tune-param / add-dataset-case) | Task 2 (schema in PROPOSAL_SCHEMA) | ✅ |
| §8 markdown render with diff blocks | Task 2 (renderMarkdown) | ✅ |
| §8 human-only apply (no auto-apply) | Tasks 3, 5 (only writes file; never modifies experience.yaml) | ✅ |
| §11 `oe diff` real impl | Task 4 | ✅ |
| §18 evolution proof point in success criteria | Tasks 2, 6 | ✅ |
| Distribution (publishConfig, README) | Task 7 | ✅ |

---

## Notes

- Auto-evolve on every run is opt-in (`--evolve` flag) — the spec emphasizes human review, so default off is the right safety choice.
- The state diff in `evolveCommand` is computed from `state_history` filtered by run_id — works because Plan 1 already tracked these rows.
- The prompt asks for ≤5 proposals so the LLM doesn't fire-hose ideas; high-confidence ones come first.
- Bin distribution (`bun compile`) is intentionally deferred — npm packages + `node packages/cli/dist/bin.js` works today and is enough for V1 release. The single-binary distribution is a v1.1 polish item.
