# OpenExpertise V1 — Plan 1: Walking Skeleton

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a working `oe run examples/hello-tool` that loads `experience.yaml`, validates it, builds a DAG, schedules a single `tool` node, writes results to a SQLite blackboard with schema enforcement, and emits a structured event stream. This is the architectural spine — every later plan attaches to these interfaces.

**Architecture:** TypeScript monorepo (pnpm workspaces) with four publishable packages: `@openexpertise/schema` (parser + validator), `@openexpertise/core` (runtime, state, scheduler, dispatcher framework), `@openexpertise/node-kinds-tool` (the first dispatcher), `@openexpertise/cli` (`oe` binary). One example (`examples/hello-tool`) and one end-to-end test prove the wiring.

**Tech Stack:**
- TypeScript 5.5+, Node 20+, pnpm 9+
- Test runner: `vitest`
- YAML: `yaml` package (better error positions than `js-yaml`)
- JSON Schema validator: `ajv` + `ajv-formats`
- SQLite: `better-sqlite3` (sync, native, fast — picked for V1 per spec §17)
- CLI: `commander`
- Logging: `pino` (structured) + `pino-pretty` for `--log-format=pretty`
- Hashing for cache keys (deferred): `object-hash` (will be added in Plan 3; not used in Plan 1)
- Lint/format: `eslint` (flat config) + `prettier`

**Plan 1 scope explicitly excludes** (covered by later plans):
- `agent` / `skill` / `dataset` / nested `experience` dispatchers (Plan 2)
- Fan-out, pipeline group, conditional edge, bounded loop (Plan 2)
- Cache, resume, TUI, remaining CLI commands (`init`, `state`, `reset-state`) (Plan 3)
- Authoring skill (Plan 4)
- Evolution advisor (Plan 5)

---

## File structure

After Plan 1 completes, the repository looks like:

```
/Users/xuxingcheng/SHLAB/github/OpenExpertise/
├── package.json                                  # workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .prettierrc.json
├── eslint.config.js
├── vitest.config.ts
├── .gitignore
├── .gitattributes
├── README.md
├── docs/                                         # existing (spec, plans)
├── claude-code-workflow-creator/                 # existing reference, untouched
├── openhuman/                                    # existing reference, untouched
├── packages/
│   ├── schema/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts                          # public exports
│   │   │   ├── types.ts                          # TS types for experience.yaml
│   │   │   ├── parser.ts                         # yaml string → ExperienceSpec
│   │   │   ├── validator.ts                      # AJV validation w/ readable errors
│   │   │   └── schemas/
│   │   │       └── experience.schema.json        # JSON Schema for v0.1.0
│   │   └── tests/
│   │       ├── parser.test.ts
│   │       └── validator.test.ts
│   ├── core/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts                          # public exports
│   │   │   ├── expressions/
│   │   │   │   └── resolve.ts                    # $.field resolution
│   │   │   ├── state/
│   │   │   │   ├── store.ts                      # SQLite blackboard
│   │   │   │   └── merge.ts                      # array_append / set_once / last_wins
│   │   │   ├── events/
│   │   │   │   ├── bus.ts                        # in-memory event emitter
│   │   │   │   └── sink.ts                       # jsonl file sink
│   │   │   ├── graph/
│   │   │   │   ├── dag.ts                        # build DAG, topo sort, cycle detect
│   │   │   │   └── scheduler.ts                  # sequential scheduler (Plan 1)
│   │   │   ├── dispatcher/
│   │   │   │   ├── types.ts                      # NodeDispatcher interface
│   │   │   │   └── registry.ts                   # kind → dispatcher
│   │   │   ├── run/
│   │   │   │   └── context.ts                    # RunContext
│   │   │   └── runner.ts                         # top-level orchestration
│   │   └── tests/
│   │       ├── expressions.test.ts
│   │       ├── state.test.ts
│   │       ├── events.test.ts
│   │       ├── dag.test.ts
│   │       └── runner.test.ts
│   ├── node-kinds-tool/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts                          # ToolDispatcher
│   │   │   └── loader.ts                         # dynamic import w/ ESM
│   │   └── tests/
│   │       └── tool.test.ts
│   └── cli/
│       ├── package.json
│       ├── tsconfig.json
│       ├── src/
│       │   ├── bin.ts                            # shebang entry
│       │   ├── index.ts                          # commander program
│       │   ├── commands/
│       │   │   ├── validate.ts
│       │   │   ├── run.ts
│       │   │   └── inspect.ts
│       │   └── logger.ts
│       └── tests/
│           └── cli.test.ts
├── examples/
│   └── hello-tool/
│       ├── experience.yaml
│       ├── tools/
│       │   └── greet.ts
│       └── README.md
└── e2e/
    ├── hello-tool.e2e.test.ts
    └── helpers.ts
```

---

## Task 1: Bootstrap monorepo

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.prettierrc.json`
- Create: `eslint.config.js`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `.gitattributes`
- Create: `README.md`

- [ ] **Step 1.1: Initialize git repo**

Run from `/Users/xuxingcheng/SHLAB/github/OpenExpertise/`:
```bash
git init
git branch -m main
```

Expected: `Initialized empty Git repository in .../OpenExpertise/.git/`

- [ ] **Step 1.2: Write `.gitignore`**

Create `.gitignore`:
```gitignore
# Dependencies
node_modules/
.pnpm-store/

# Build outputs
dist/
*.tsbuildinfo

# Test outputs
coverage/
.vitest-cache/

# Runtime artifacts
.openexpertise/

# Editor / OS
.DS_Store
.vscode/
.idea/

# Logs
*.log
npm-debug.log*
pnpm-debug.log*

# Env
.env
.env.local
```

- [ ] **Step 1.3: Write `.gitattributes`**

Create `.gitattributes`:
```
* text=auto eol=lf
*.png binary
*.jpg binary
*.sqlite binary
```

- [ ] **Step 1.4: Write root `package.json`**

Create `package.json`:
```json
{
  "name": "openexpertise",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=20.0.0",
    "pnpm": ">=9.0.0"
  },
  "scripts": {
    "build": "pnpm -r build",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "typecheck": "pnpm -r typecheck",
    "clean": "pnpm -r exec rm -rf dist .tsbuildinfo node_modules/.cache"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser": "^8.0.0",
    "eslint": "^9.0.0",
    "prettier": "^3.3.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  },
  "packageManager": "pnpm@9.10.0"
}
```

- [ ] **Step 1.5: Write `pnpm-workspace.yaml`**

Create `pnpm-workspace.yaml`:
```yaml
packages:
  - "packages/*"
  - "examples/*"
  - "e2e"
```

- [ ] **Step 1.6: Write `tsconfig.base.json`**

Create `tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "composite": true,
    "incremental": true
  }
}
```

- [ ] **Step 1.7: Write `.prettierrc.json`**

Create `.prettierrc.json`:
```json
{
  "semi": false,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "arrowParens": "always"
}
```

- [ ] **Step 1.8: Write `eslint.config.js`**

Create `eslint.config.js`:
```js
import tseslint from '@typescript-eslint/eslint-plugin'
import tsparser from '@typescript-eslint/parser'

export default [
  {
    files: ['**/*.ts'],
    ignores: ['**/dist/**', '**/node_modules/**'],
    languageOptions: {
      parser: tsparser,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
]
```

- [ ] **Step 1.9: Write `vitest.config.ts`**

Create `vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/*/tests/**/*.test.ts', 'e2e/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['packages/*/src/**'],
    },
    pool: 'forks', // better-sqlite3 + native modules
  },
})
```

- [ ] **Step 1.10: Write `README.md`**

Create `README.md`:
```markdown
# OpenExpertise

An open-source execution engine for **experience flows** — heterogeneous executable
graphs that codify expert knowledge into runnable, evolving artifacts.

See `docs/superpowers/specs/2026-05-25-openexpertise-design.md` for the V1 design.

## Status

Pre-alpha. Walking skeleton only. Not yet usable.

## Development

```bash
pnpm install
pnpm test
pnpm typecheck
```
```

- [ ] **Step 1.11: Install root deps**

Run:
```bash
pnpm install
```

Expected: workspaces detected (currently empty), dev deps installed, lockfile written.

- [ ] **Step 1.12: Verify tooling**

Run:
```bash
pnpm typecheck
pnpm format:check
```

Expected: both succeed (nothing to check yet, but commands resolve).

- [ ] **Step 1.13: Commit**

```bash
git add .
git commit -m "chore: bootstrap monorepo with pnpm/tsc/vitest/eslint/prettier"
```

---

## Task 2: Scaffold `@openexpertise/schema` package

**Files:**
- Create: `packages/schema/package.json`
- Create: `packages/schema/tsconfig.json`
- Create: `packages/schema/src/index.ts`
- Create: `packages/schema/src/types.ts`

- [ ] **Step 2.1: Create package directory and `package.json`**

Create `packages/schema/package.json`:
```json
{
  "name": "@openexpertise/schema",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./schema": "./src/schemas/experience.schema.json"
  },
  "files": ["dist", "src/schemas"],
  "scripts": {
    "build": "tsc -b",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "ajv": "^8.17.0",
    "ajv-formats": "^3.0.0",
    "yaml": "^2.5.0"
  }
}
```

- [ ] **Step 2.2: Create `tsconfig.json`**

Create `packages/schema/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 2.3: Write `src/types.ts` — TS types for `experience.yaml`**

Create `packages/schema/src/types.ts`:
```ts
// TypeScript types for the experience.yaml format v0.1.0.
// These are hand-authored to match `src/schemas/experience.schema.json`.
// Keep the two in sync — see tests/parser.test.ts for the consistency check.

export type NodeKind = 'agent' | 'skill' | 'tool' | 'dataset' | 'experience'

export type MergeStrategy = 'array_append' | 'set_once' | 'last_wins'

export interface StateFieldSchema {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null'
  description?: string
  items?: StateFieldSchema | { $ref: string }
  properties?: Record<string, StateFieldSchema>
  required?: string[]
  merge?: MergeStrategy
  $ref?: string
}

export interface StateSpec {
  schema: Record<string, StateFieldSchema>
  store?: string // path to SQLite file; default `.openexpertise/state.sqlite`
}

export interface PhaseSpec {
  id: string
  title?: string
}

export interface ToolNodeSpec {
  id: string
  kind: 'tool'
  phase?: string
  impl: string // path to .ts/.js module relative to experience.yaml
  args?: Record<string, unknown>
  reads?: string[]
  writes?: string[]
  on_error?: ErrorPolicy
}

// Placeholders for kinds added in later plans. They exist so the parser can
// accept full experience.yaml files now, even if Plan 1 only dispatches tool.
export interface AgentNodeSpec {
  id: string
  kind: 'agent'
  phase?: string
  prompt: string
  model?: string
  schema?: unknown
  reads?: string[]
  writes?: string[]
  args?: Record<string, unknown>
  on_error?: ErrorPolicy
}

export interface SkillNodeSpec {
  id: string
  kind: 'skill'
  phase?: string
  impl: string
  inputs?: Record<string, unknown>
  model?: string
  schema?: unknown
  reads?: string[]
  writes?: string[]
  on_error?: ErrorPolicy
}

export interface DatasetNodeSpec {
  id: string
  kind: 'dataset'
  phase?: string
  source: DatasetSource
  writes?: string[]
  on_error?: ErrorPolicy
}

export interface ExperienceNodeSpec {
  id: string
  kind: 'experience'
  phase?: string
  impl: string
  args?: Record<string, unknown>
  state_scope?: 'shared' | 'isolated'
  reads?: string[]
  writes?: string[]
  on_error?: ErrorPolicy
}

export type DatasetSource =
  | { type: 'file'; uri: string; format?: 'json' | 'jsonl' | 'csv' | 'parquet'; transform?: string }
  | { type: 'sqlite'; uri: string; query: string }
  | { type: 'http'; url: string; method?: 'GET' | 'POST'; body?: unknown }
  | { type: 'mcp-resource'; server: string; uri: string }

export type NodeSpec =
  | ToolNodeSpec
  | AgentNodeSpec
  | SkillNodeSpec
  | DatasetNodeSpec
  | ExperienceNodeSpec

export type ErrorPolicy =
  | { policy: 'skip' }
  | { policy: 'fail_run' }
  | { policy: 'retry'; attempts: number; backoff?: 'linear' | 'exponential'; base_ms?: number }

export interface EdgeSpec {
  from: string
  to: string
  when?: string // JSONPath-ish expression (Plan 2)
}

export interface GraphSpec {
  nodes: NodeSpec[]
  edges: EdgeSpec[]
}

export interface ExperienceSpec {
  name: string
  description?: string
  version: string
  state: StateSpec
  phases?: PhaseSpec[]
  graph: GraphSpec
}
```

- [ ] **Step 2.4: Write `src/index.ts` placeholder**

Create `packages/schema/src/index.ts`:
```ts
export * from './types.js'
export { parseExperienceYaml } from './parser.js'
export { validateExperienceSpec, ValidationError } from './validator.js'
```

(The two imported files will be created in Tasks 3 and 4. `pnpm typecheck` will currently fail — that's expected and resolved at the end of Task 4.)

- [ ] **Step 2.5: Install package deps**

Run from repo root:
```bash
pnpm install
```

Expected: `@openexpertise/schema` deps installed under `packages/schema/node_modules`.

- [ ] **Step 2.6: Commit**

```bash
git add packages/schema/
git commit -m "feat(schema): scaffold @openexpertise/schema package + types"
```

---

## Task 3: Write JSON Schema for `experience.yaml` v0.1.0

**Files:**
- Create: `packages/schema/src/schemas/experience.schema.json`
- Test: `packages/schema/tests/validator.test.ts` (added in Task 4)

- [ ] **Step 3.1: Write the JSON Schema**

Create `packages/schema/src/schemas/experience.schema.json`:
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://openexpertise.dev/schemas/experience-v0.1.0.json",
  "title": "ExperienceSpec",
  "type": "object",
  "required": ["name", "version", "state", "graph"],
  "additionalProperties": false,
  "properties": {
    "name": { "type": "string", "minLength": 1 },
    "description": { "type": "string" },
    "version": { "type": "string", "pattern": "^\\d+\\.\\d+\\.\\d+$" },
    "state": {
      "type": "object",
      "required": ["schema"],
      "additionalProperties": false,
      "properties": {
        "schema": {
          "type": "object",
          "additionalProperties": { "$ref": "#/$defs/stateField" }
        },
        "store": { "type": "string" }
      }
    },
    "phases": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id"],
        "additionalProperties": false,
        "properties": {
          "id": { "type": "string" },
          "title": { "type": "string" }
        }
      }
    },
    "graph": {
      "type": "object",
      "required": ["nodes", "edges"],
      "additionalProperties": false,
      "properties": {
        "nodes": {
          "type": "array",
          "minItems": 1,
          "items": { "$ref": "#/$defs/node" }
        },
        "edges": {
          "type": "array",
          "items": { "$ref": "#/$defs/edge" }
        }
      }
    }
  },
  "$defs": {
    "stateField": {
      "type": "object",
      "additionalProperties": true,
      "properties": {
        "type": {
          "type": "string",
          "enum": ["string", "number", "boolean", "object", "array", "null"]
        },
        "description": { "type": "string" },
        "merge": { "enum": ["array_append", "set_once", "last_wins"] }
      }
    },
    "edge": {
      "type": "object",
      "required": ["from", "to"],
      "additionalProperties": false,
      "properties": {
        "from": { "type": "string" },
        "to": { "type": "string" },
        "when": { "type": "string" }
      }
    },
    "errorPolicy": {
      "oneOf": [
        { "type": "object", "required": ["policy"], "properties": { "policy": { "const": "skip" } }, "additionalProperties": false },
        { "type": "object", "required": ["policy"], "properties": { "policy": { "const": "fail_run" } }, "additionalProperties": false },
        {
          "type": "object",
          "required": ["policy", "attempts"],
          "properties": {
            "policy": { "const": "retry" },
            "attempts": { "type": "integer", "minimum": 1, "maximum": 20 },
            "backoff": { "enum": ["linear", "exponential"] },
            "base_ms": { "type": "integer", "minimum": 0 }
          },
          "additionalProperties": false
        }
      ]
    },
    "nodeBase": {
      "type": "object",
      "required": ["id", "kind"],
      "properties": {
        "id": { "type": "string", "minLength": 1, "pattern": "^[a-zA-Z_][a-zA-Z0-9_]*$" },
        "phase": { "type": "string" },
        "reads": { "type": "array", "items": { "type": "string" } },
        "writes": { "type": "array", "items": { "type": "string" } },
        "on_error": { "$ref": "#/$defs/errorPolicy" }
      }
    },
    "node": {
      "oneOf": [
        {
          "allOf": [
            { "$ref": "#/$defs/nodeBase" },
            {
              "type": "object",
              "required": ["impl"],
              "properties": {
                "kind": { "const": "tool" },
                "impl": { "type": "string" },
                "args": { "type": "object" }
              }
            }
          ]
        },
        {
          "allOf": [
            { "$ref": "#/$defs/nodeBase" },
            {
              "type": "object",
              "required": ["prompt"],
              "properties": {
                "kind": { "const": "agent" },
                "prompt": { "type": "string" },
                "model": { "type": "string" },
                "schema": {},
                "args": { "type": "object" }
              }
            }
          ]
        },
        {
          "allOf": [
            { "$ref": "#/$defs/nodeBase" },
            {
              "type": "object",
              "required": ["impl"],
              "properties": {
                "kind": { "const": "skill" },
                "impl": { "type": "string" },
                "inputs": { "type": "object" },
                "model": { "type": "string" },
                "schema": {}
              }
            }
          ]
        },
        {
          "allOf": [
            { "$ref": "#/$defs/nodeBase" },
            {
              "type": "object",
              "required": ["source"],
              "properties": {
                "kind": { "const": "dataset" },
                "source": { "type": "object" }
              }
            }
          ]
        },
        {
          "allOf": [
            { "$ref": "#/$defs/nodeBase" },
            {
              "type": "object",
              "required": ["impl"],
              "properties": {
                "kind": { "const": "experience" },
                "impl": { "type": "string" },
                "args": { "type": "object" },
                "state_scope": { "enum": ["shared", "isolated"] }
              }
            }
          ]
        }
      ]
    }
  }
}
```

- [ ] **Step 3.2: Verify schema is itself valid JSON**

Run:
```bash
node -e "JSON.parse(require('fs').readFileSync('packages/schema/src/schemas/experience.schema.json','utf8')); console.log('ok')"
```

Expected: `ok`

- [ ] **Step 3.3: Commit**

```bash
git add packages/schema/src/schemas/
git commit -m "feat(schema): add JSON Schema for experience.yaml v0.1.0"
```

---

## Task 4: Implement parser + validator with TDD

**Files:**
- Create: `packages/schema/src/parser.ts`
- Create: `packages/schema/src/validator.ts`
- Test: `packages/schema/tests/parser.test.ts`
- Test: `packages/schema/tests/validator.test.ts`

- [ ] **Step 4.1: Write the failing parser test**

Create `packages/schema/tests/parser.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { parseExperienceYaml } from '../src/parser.js'

describe('parseExperienceYaml', () => {
  it('parses a minimal valid experience', () => {
    const yaml = `
name: hello
version: 0.1.0
state:
  schema:
    greeting:
      type: string
graph:
  nodes:
    - id: greet
      kind: tool
      impl: ./tools/greet.ts
      writes: [greeting]
  edges: []
`
    const spec = parseExperienceYaml(yaml)
    expect(spec.name).toBe('hello')
    expect(spec.graph.nodes).toHaveLength(1)
    expect(spec.graph.nodes[0]?.kind).toBe('tool')
  })

  it('surfaces YAML syntax errors with line numbers', () => {
    const yaml = 'name: hello\nversion: [unclosed'
    expect(() => parseExperienceYaml(yaml)).toThrow(/line 2/i)
  })
})
```

- [ ] **Step 4.2: Run the test — confirm it fails**

Run:
```bash
pnpm vitest run packages/schema/tests/parser.test.ts
```

Expected: FAIL — `parser.ts` doesn't exist.

- [ ] **Step 4.3: Implement `parser.ts`**

Create `packages/schema/src/parser.ts`:
```ts
import { parseDocument, YAMLError } from 'yaml'
import type { ExperienceSpec } from './types.js'

export class ParseError extends Error {
  constructor(message: string, public readonly line?: number, public readonly column?: number) {
    super(message)
    this.name = 'ParseError'
  }
}

export function parseExperienceYaml(source: string): ExperienceSpec {
  const doc = parseDocument(source, { prettyErrors: true })
  if (doc.errors.length > 0) {
    const first = doc.errors[0] as YAMLError
    const pos = first.linePos?.[0]
    throw new ParseError(
      `YAML parse error at line ${pos?.line ?? '?'}, column ${pos?.col ?? '?'}: ${first.message}`,
      pos?.line,
      pos?.col,
    )
  }
  const parsed = doc.toJS()
  if (typeof parsed !== 'object' || parsed === null) {
    throw new ParseError('experience.yaml must be a YAML mapping at the top level')
  }
  return parsed as ExperienceSpec
}
```

- [ ] **Step 4.4: Run the test — confirm it passes**

Run:
```bash
pnpm vitest run packages/schema/tests/parser.test.ts
```

Expected: PASS — 2/2.

- [ ] **Step 4.5: Write the failing validator test**

Create `packages/schema/tests/validator.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { validateExperienceSpec, ValidationError } from '../src/validator.js'
import type { ExperienceSpec } from '../src/types.js'

const validSpec: ExperienceSpec = {
  name: 'hello',
  version: '0.1.0',
  state: { schema: { greeting: { type: 'string' } } },
  graph: {
    nodes: [{ id: 'greet', kind: 'tool', impl: './tools/greet.ts', writes: ['greeting'] }],
    edges: [],
  },
}

describe('validateExperienceSpec', () => {
  it('accepts a minimal valid spec', () => {
    expect(() => validateExperienceSpec(validSpec)).not.toThrow()
  })

  it('rejects spec missing required fields', () => {
    const bad = { ...validSpec, name: undefined } as unknown as ExperienceSpec
    expect(() => validateExperienceSpec(bad)).toThrow(ValidationError)
  })

  it('rejects unknown node kind', () => {
    const bad: ExperienceSpec = {
      ...validSpec,
      graph: { ...validSpec.graph, nodes: [{ id: 'x', kind: 'weird' as any, impl: 'x' } as any] },
    }
    expect(() => validateExperienceSpec(bad)).toThrow(ValidationError)
  })

  it('rejects edge referencing nonexistent node', () => {
    const bad: ExperienceSpec = {
      ...validSpec,
      graph: { ...validSpec.graph, edges: [{ from: 'greet', to: 'nope' }] },
    }
    expect(() => validateExperienceSpec(bad)).toThrow(/unknown node id "nope"/)
  })

  it('rejects writes referencing undeclared state field', () => {
    const bad: ExperienceSpec = {
      ...validSpec,
      graph: {
        ...validSpec.graph,
        nodes: [{ id: 'greet', kind: 'tool', impl: './t.ts', writes: ['nonexistent'] }],
      },
    }
    expect(() => validateExperienceSpec(bad)).toThrow(/undeclared state field "nonexistent"/)
  })
})
```

- [ ] **Step 4.6: Run the test — confirm it fails**

Run:
```bash
pnpm vitest run packages/schema/tests/validator.test.ts
```

Expected: FAIL — `validator.ts` doesn't exist.

- [ ] **Step 4.7: Implement `validator.ts`**

Create `packages/schema/src/validator.ts`:
```ts
import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import type { ExperienceSpec } from './types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const schemaPath = resolve(__dirname, 'schemas/experience.schema.json')
const schema = JSON.parse(readFileSync(schemaPath, 'utf8'))

const ajv = new Ajv({ allErrors: true, strict: false })
addFormats(ajv)
const validateJsonSchema = ajv.compile(schema)

export class ValidationError extends Error {
  constructor(message: string, public readonly errors: string[] = []) {
    super(message)
    this.name = 'ValidationError'
  }
}

export function validateExperienceSpec(spec: unknown): asserts spec is ExperienceSpec {
  if (!validateJsonSchema(spec)) {
    const messages = (validateJsonSchema.errors ?? []).map(
      (e) => `${e.instancePath || '(root)'}: ${e.message ?? 'invalid'}`,
    )
    throw new ValidationError(`Schema validation failed:\n${messages.join('\n')}`, messages)
  }

  // Beyond JSON Schema: referential integrity checks
  const s = spec as ExperienceSpec
  const nodeIds = new Set(s.graph.nodes.map((n) => n.id))
  for (const edge of s.graph.edges) {
    if (!nodeIds.has(edge.from)) {
      throw new ValidationError(`Edge references unknown node id "${edge.from}"`)
    }
    if (!nodeIds.has(edge.to)) {
      throw new ValidationError(`Edge references unknown node id "${edge.to}"`)
    }
  }

  const declaredFields = new Set(Object.keys(s.state.schema))
  for (const node of s.graph.nodes) {
    for (const field of node.writes ?? []) {
      if (!declaredFields.has(field)) {
        throw new ValidationError(
          `Node "${node.id}" writes undeclared state field "${field}". Declare it in state.schema.`,
        )
      }
    }
    for (const field of node.reads ?? []) {
      if (!declaredFields.has(field)) {
        throw new ValidationError(
          `Node "${node.id}" reads undeclared state field "${field}". Declare it in state.schema.`,
        )
      }
    }
  }

  // Duplicate node ids
  if (nodeIds.size !== s.graph.nodes.length) {
    throw new ValidationError('Duplicate node ids in graph.nodes')
  }
}
```

- [ ] **Step 4.8: Run all schema tests — confirm pass**

Run:
```bash
pnpm vitest run packages/schema/
```

Expected: PASS — all 7 tests green.

- [ ] **Step 4.9: Typecheck**

Run:
```bash
pnpm --filter @openexpertise/schema typecheck
```

Expected: no errors.

- [ ] **Step 4.10: Commit**

```bash
git add packages/schema/src/parser.ts packages/schema/src/validator.ts packages/schema/tests/
git commit -m "feat(schema): parser + validator with referential integrity checks"
```

---

## Task 5: Scaffold `@openexpertise/core` package

**Files:**
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/src/index.ts`

- [ ] **Step 5.1: Create `package.json`**

Create `packages/core/package.json`:
```json
{
  "name": "@openexpertise/core",
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
    "@openexpertise/schema": "workspace:*",
    "better-sqlite3": "^11.0.0",
    "pino": "^9.0.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0"
  }
}
```

- [ ] **Step 5.2: Create `tsconfig.json`**

Create `packages/core/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "references": [{ "path": "../schema" }],
  "include": ["src/**/*"]
}
```

- [ ] **Step 5.3: Create `src/index.ts` placeholder**

Create `packages/core/src/index.ts`:
```ts
// Public exports — populated as Tasks 6–11 complete.
export { resolveExpression } from './expressions/resolve.js'
export { StateStore } from './state/store.js'
export { EventBus, type RunEvent } from './events/bus.js'
export { JsonlEventSink } from './events/sink.js'
export { buildDag, type Dag } from './graph/dag.js'
export { SequentialScheduler } from './graph/scheduler.js'
export { RunContext } from './run/context.js'
export { DispatcherRegistry, type NodeDispatcher, type NodeInputBundle, type NodeOutput } from './dispatcher/registry.js'
export { runExperience } from './runner.js'
```

(All imported files added in subsequent tasks. `pnpm typecheck` will fail until Task 11.)

- [ ] **Step 5.4: Install deps**

Run:
```bash
pnpm install
```

Expected: `better-sqlite3` compiles its native binding. If it fails, see [better-sqlite3 troubleshooting](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/troubleshooting.md).

- [ ] **Step 5.5: Commit**

```bash
git add packages/core/
git commit -m "feat(core): scaffold @openexpertise/core package"
```

---

## Task 6: Expression evaluator (`$.field` resolution)

**Files:**
- Create: `packages/core/src/expressions/resolve.ts`
- Test: `packages/core/tests/expressions.test.ts`

- [ ] **Step 6.1: Write failing tests**

Create `packages/core/tests/expressions.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { resolveExpression } from '../src/expressions/resolve.js'

describe('resolveExpression', () => {
  const state = {
    pr_id: 'PR-1',
    findings: [{ file: 'a.ts' }, { file: 'b.ts' }],
    nested: { count: 3 },
  }

  it('returns literal values unchanged', () => {
    expect(resolveExpression(42, state)).toBe(42)
    expect(resolveExpression('hello', state)).toBe('hello')
    expect(resolveExpression(null, state)).toBe(null)
  })

  it('resolves $.field to state value', () => {
    expect(resolveExpression('$.pr_id', state)).toBe('PR-1')
  })

  it('resolves $.nested.path', () => {
    expect(resolveExpression('$.nested.count', state)).toBe(3)
  })

  it('returns undefined for missing path', () => {
    expect(resolveExpression('$.missing', state)).toBeUndefined()
    expect(resolveExpression('$.nested.absent', state)).toBeUndefined()
  })

  it('walks object literals recursively', () => {
    const obj = { id: '$.pr_id', extra: { n: '$.nested.count' } }
    expect(resolveExpression(obj, state)).toEqual({ id: 'PR-1', extra: { n: 3 } })
  })

  it('walks arrays', () => {
    expect(resolveExpression(['$.pr_id', 'literal'], state)).toEqual(['PR-1', 'literal'])
  })

  it('returns deep copies, not aliases', () => {
    const r = resolveExpression('$.findings', state) as any[]
    r[0].file = 'mutated'
    expect(state.findings[0].file).toBe('a.ts')
  })
})
```

- [ ] **Step 6.2: Run — confirm fail**

Run:
```bash
pnpm vitest run packages/core/tests/expressions.test.ts
```

Expected: FAIL.

- [ ] **Step 6.3: Implement `resolve.ts`**

Create `packages/core/src/expressions/resolve.ts`:
```ts
// Tiny JSONPath-like resolver. Supports only $.field.subfield syntax in Plan 1.
// Plan 2 will add operators (==, &&, etc.) for `when:` / `until:` predicates.

const PATH_RE = /^\$\.[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)*$/

export function resolveExpression(value: unknown, state: Record<string, unknown>): unknown {
  if (typeof value === 'string' && PATH_RE.test(value)) {
    return resolvePath(value, state)
  }
  if (Array.isArray(value)) {
    return value.map((v) => resolveExpression(v, state))
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      out[k] = resolveExpression(v, state)
    }
    return out
  }
  return value
}

function resolvePath(path: string, state: Record<string, unknown>): unknown {
  const parts = path.slice(2).split('.') // strip leading "$."
  let cur: unknown = state
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined
    if (typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[p]
  }
  return deepCopy(cur)
}

function deepCopy<T>(v: T): T {
  if (v === null || typeof v !== 'object') return v
  return JSON.parse(JSON.stringify(v))
}
```

- [ ] **Step 6.4: Run — confirm pass**

Run:
```bash
pnpm vitest run packages/core/tests/expressions.test.ts
```

Expected: PASS — 7/7.

- [ ] **Step 6.5: Commit**

```bash
git add packages/core/src/expressions/ packages/core/tests/expressions.test.ts
git commit -m "feat(core): \$.field expression resolver"
```

---

## Task 7: State store (SQLite blackboard + schema enforcement)

**Files:**
- Create: `packages/core/src/state/merge.ts`
- Create: `packages/core/src/state/store.ts`
- Test: `packages/core/tests/state.test.ts`

- [ ] **Step 7.1: Write the failing test**

Create `packages/core/tests/state.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { StateStore } from '../src/state/store.js'
import type { ExperienceSpec } from '@openexpertise/schema'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const baseSpec: ExperienceSpec = {
  name: 't',
  version: '0.1.0',
  state: {
    schema: {
      greeting: { type: 'string' },
      counts: { type: 'array', items: { type: 'number' }, merge: 'array_append' },
      once: { type: 'string', merge: 'set_once' },
    },
  },
  graph: { nodes: [{ id: 'x', kind: 'tool', impl: 't.ts' }], edges: [] },
}

let tmp: string
let store: StateStore

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'oe-state-'))
  store = new StateStore({ dbPath: join(tmp, 'state.sqlite'), spec: baseSpec })
})

afterEach(() => {
  store.close()
  rmSync(tmp, { recursive: true, force: true })
})

describe('StateStore', () => {
  it('reads undefined for unset field', () => {
    expect(store.get('greeting')).toBeUndefined()
  })

  it('writes and reads a string field', () => {
    store.write({ greeting: 'hi' }, { runId: 'r1', nodeId: 'x' })
    expect(store.get('greeting')).toBe('hi')
  })

  it('rejects writes to undeclared fields', () => {
    expect(() => store.write({ undeclared: 1 } as any, { runId: 'r', nodeId: 'x' }))
      .toThrow(/undeclared state field "undeclared"/)
  })

  it('rejects writes that violate field type', () => {
    expect(() => store.write({ greeting: 42 } as any, { runId: 'r', nodeId: 'x' }))
      .toThrow(/greeting/)
  })

  it('appends arrays under array_append strategy', () => {
    store.write({ counts: [1] }, { runId: 'r', nodeId: 'x' })
    store.write({ counts: [2, 3] }, { runId: 'r', nodeId: 'y' })
    expect(store.get('counts')).toEqual([1, 2, 3])
  })

  it('throws on second write to set_once field', () => {
    store.write({ once: 'a' }, { runId: 'r', nodeId: 'x' })
    expect(() => store.write({ once: 'b' }, { runId: 'r', nodeId: 'y' }))
      .toThrow(/set_once/)
  })

  it('records history rows for every write', () => {
    store.write({ greeting: 'hello' }, { runId: 'r1', nodeId: 'x' })
    const history = store.history('greeting')
    expect(history).toHaveLength(1)
    expect(history[0]?.run_id).toBe('r1')
    expect(history[0]?.value_new).toBe('hello')
  })

  it('persists across StateStore instances', () => {
    store.write({ greeting: 'persist' }, { runId: 'r', nodeId: 'x' })
    const dbPath = (store as any).dbPath
    store.close()
    const store2 = new StateStore({ dbPath, spec: baseSpec })
    expect(store2.get('greeting')).toBe('persist')
    store2.close()
  })
})
```

- [ ] **Step 7.2: Run — confirm fail**

Run:
```bash
pnpm vitest run packages/core/tests/state.test.ts
```

Expected: FAIL — `state/store.ts` missing.

- [ ] **Step 7.3: Implement `merge.ts`**

Create `packages/core/src/state/merge.ts`:
```ts
import type { MergeStrategy, StateFieldSchema } from '@openexpertise/schema'

export interface MergeContext {
  field: string
  schema: StateFieldSchema
  existing: unknown
  incoming: unknown
}

export function applyMerge(ctx: MergeContext): unknown {
  const strategy: MergeStrategy = ctx.schema.merge ?? 'last_wins'
  switch (strategy) {
    case 'array_append': {
      if (!Array.isArray(ctx.incoming)) {
        throw new Error(`Field "${ctx.field}" uses array_append but write is not an array`)
      }
      const base = Array.isArray(ctx.existing) ? ctx.existing : []
      return [...base, ...ctx.incoming]
    }
    case 'set_once': {
      if (ctx.existing !== undefined && ctx.existing !== null) {
        throw new Error(`Field "${ctx.field}" is set_once and already has a value`)
      }
      return ctx.incoming
    }
    case 'last_wins':
    default:
      return ctx.incoming
  }
}
```

- [ ] **Step 7.4: Implement `store.ts`**

Create `packages/core/src/state/store.ts`:
```ts
import Database from 'better-sqlite3'
import type { Database as DB } from 'better-sqlite3'
import type { ExperienceSpec, StateFieldSchema } from '@openexpertise/schema'
import { applyMerge } from './merge.js'

export interface StateStoreOpts {
  dbPath: string
  spec: ExperienceSpec
}

export interface WriteMeta {
  runId: string
  nodeId: string
}

export interface HistoryRow {
  id: number
  field: string
  value_old: unknown
  value_new: unknown
  node_id: string
  run_id: string
  ts: string
}

export class StateStore {
  private readonly db: DB
  private readonly spec: ExperienceSpec
  private readonly dbPath: string

  constructor(opts: StateStoreOpts) {
    this.dbPath = opts.dbPath
    this.spec = opts.spec
    this.db = new Database(opts.dbPath)
    this.db.pragma('journal_mode = WAL')
    this.initSchema()
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS state_snapshot (
        field TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        updated_by_node TEXT NOT NULL,
        updated_by_run TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS state_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        field TEXT NOT NULL,
        value_old TEXT,
        value_new TEXT NOT NULL,
        node_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        ts TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_history_field ON state_history(field);
      CREATE INDEX IF NOT EXISTS idx_history_run ON state_history(run_id);
    `)
  }

  get(field: string): unknown {
    const row = this.db
      .prepare('SELECT value FROM state_snapshot WHERE field = ?')
      .get(field) as { value: string } | undefined
    return row ? JSON.parse(row.value) : undefined
  }

  snapshot(fields?: string[]): Record<string, unknown> {
    const list = fields ?? Object.keys(this.spec.state.schema)
    const out: Record<string, unknown> = {}
    for (const f of list) out[f] = this.get(f)
    return out
  }

  history(field: string): HistoryRow[] {
    const rows = this.db
      .prepare(
        'SELECT id, field, value_old, value_new, node_id, run_id, ts FROM state_history WHERE field = ? ORDER BY id ASC',
      )
      .all(field) as Array<{
        id: number
        field: string
        value_old: string | null
        value_new: string
        node_id: string
        run_id: string
        ts: string
      }>
    return rows.map((r) => ({
      id: r.id,
      field: r.field,
      value_old: r.value_old === null ? undefined : JSON.parse(r.value_old),
      value_new: JSON.parse(r.value_new),
      node_id: r.node_id,
      run_id: r.run_id,
      ts: r.ts,
    }))
  }

  write(delta: Record<string, unknown>, meta: WriteMeta): void {
    const schema = this.spec.state.schema
    const now = new Date().toISOString()

    const tx = this.db.transaction(() => {
      for (const [field, incoming] of Object.entries(delta)) {
        const fieldSchema: StateFieldSchema | undefined = schema[field]
        if (!fieldSchema) {
          throw new Error(`Write to undeclared state field "${field}". Declare it in state.schema.`)
        }
        this.assertTypeMatches(field, fieldSchema, incoming)

        const existing = this.get(field)
        const merged = applyMerge({ field, schema: fieldSchema, existing, incoming })

        this.db
          .prepare(
            `INSERT INTO state_snapshot (field, value, updated_at, updated_by_node, updated_by_run)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(field) DO UPDATE SET
               value = excluded.value,
               updated_at = excluded.updated_at,
               updated_by_node = excluded.updated_by_node,
               updated_by_run = excluded.updated_by_run`,
          )
          .run(field, JSON.stringify(merged), now, meta.nodeId, meta.runId)

        this.db
          .prepare(
            `INSERT INTO state_history (field, value_old, value_new, node_id, run_id, ts)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .run(
            field,
            existing === undefined ? null : JSON.stringify(existing),
            JSON.stringify(merged),
            meta.nodeId,
            meta.runId,
            now,
          )
      }
    })

    tx()
  }

  close(): void {
    this.db.close()
  }

  private assertTypeMatches(field: string, schema: StateFieldSchema, value: unknown): void {
    if (value === null || value === undefined) return // null tolerated unless explicitly disallowed
    const t = schema.type
    if (!t) return
    if (t === 'array' && !Array.isArray(value)) {
      throw new Error(`Field "${field}" expects type array; got ${typeof value}`)
    }
    if (t === 'object' && (typeof value !== 'object' || Array.isArray(value))) {
      throw new Error(`Field "${field}" expects type object; got ${typeof value}`)
    }
    if (t === 'string' && typeof value !== 'string') {
      throw new Error(`Field "${field}" expects type string; got ${typeof value}`)
    }
    if (t === 'number' && typeof value !== 'number') {
      throw new Error(`Field "${field}" expects type number; got ${typeof value}`)
    }
    if (t === 'boolean' && typeof value !== 'boolean') {
      throw new Error(`Field "${field}" expects type boolean; got ${typeof value}`)
    }
  }
}
```

- [ ] **Step 7.5: Run — confirm pass**

Run:
```bash
pnpm vitest run packages/core/tests/state.test.ts
```

Expected: PASS — 8/8.

- [ ] **Step 7.6: Commit**

```bash
git add packages/core/src/state/ packages/core/tests/state.test.ts
git commit -m "feat(core): SQLite-backed StateStore with schema + merge strategies"
```

---

## Task 8: Event bus and JSONL sink

**Files:**
- Create: `packages/core/src/events/bus.ts`
- Create: `packages/core/src/events/sink.ts`
- Test: `packages/core/tests/events.test.ts`

- [ ] **Step 8.1: Write the failing test**

Create `packages/core/tests/events.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { EventBus, type RunEvent } from '../src/events/bus.js'
import { JsonlEventSink } from '../src/events/sink.js'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('EventBus', () => {
  it('delivers events to all subscribers in order', () => {
    const bus = new EventBus()
    const received: RunEvent[] = []
    bus.subscribe((e) => received.push(e))
    bus.emit({ type: 'run.started', run_id: 'r1', ts: '2026-01-01T00:00:00Z' })
    bus.emit({ type: 'run.finished', run_id: 'r1', ts: '2026-01-01T00:00:01Z', status: 'success' })
    expect(received).toHaveLength(2)
    expect(received[0]?.type).toBe('run.started')
  })

  it('returns an unsubscribe handle', () => {
    const bus = new EventBus()
    const seen: RunEvent[] = []
    const unsub = bus.subscribe((e) => seen.push(e))
    bus.emit({ type: 'run.started', run_id: 'r', ts: 't' })
    unsub()
    bus.emit({ type: 'run.started', run_id: 'r', ts: 't' })
    expect(seen).toHaveLength(1)
  })
})

describe('JsonlEventSink', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'oe-sink-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('writes one line per event', () => {
    const sink = new JsonlEventSink(join(dir, 'run.jsonl'))
    sink.write({ type: 'run.started', run_id: 'r', ts: 't' })
    sink.write({ type: 'node.started', run_id: 'r', node_id: 'x', ts: 't' })
    sink.close()
    const content = readFileSync(join(dir, 'run.jsonl'), 'utf8')
    const lines = content.trim().split('\n')
    expect(lines).toHaveLength(2)
    expect(JSON.parse(lines[0]!).type).toBe('run.started')
    expect(JSON.parse(lines[1]!).node_id).toBe('x')
  })
})
```

- [ ] **Step 8.2: Run — confirm fail**

Run:
```bash
pnpm vitest run packages/core/tests/events.test.ts
```

Expected: FAIL.

- [ ] **Step 8.3: Implement `bus.ts`**

Create `packages/core/src/events/bus.ts`:
```ts
export type RunEvent =
  | { type: 'run.started'; run_id: string; ts: string; args?: unknown }
  | { type: 'run.finished'; run_id: string; ts: string; status: 'success' | 'failed' | 'partial' }
  | { type: 'node.ready'; run_id: string; node_id: string; ts: string }
  | { type: 'node.started'; run_id: string; node_id: string; ts: string }
  | { type: 'node.finished'; run_id: string; node_id: string; ts: string; metrics?: { tokens_in?: number; tokens_out?: number; cost_usd?: number } }
  | { type: 'node.failed'; run_id: string; node_id: string; ts: string; error: string }
  | { type: 'node.skipped'; run_id: string; node_id: string; ts: string; reason: string }
  | { type: 'state.write'; run_id: string; node_id: string; field: string; ts: string }

export type EventListener = (event: RunEvent) => void

export class EventBus {
  private listeners: Set<EventListener> = new Set()

  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  emit(event: RunEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch (err) {
        // Subscriber errors must not abort the run; log to stderr and continue.
        process.stderr.write(`event listener error: ${(err as Error).message}\n`)
      }
    }
  }
}
```

- [ ] **Step 8.4: Implement `sink.ts`**

Create `packages/core/src/events/sink.ts`:
```ts
import { createWriteStream, mkdirSync, type WriteStream } from 'node:fs'
import { dirname } from 'node:path'
import type { RunEvent } from './bus.js'

export class JsonlEventSink {
  private readonly stream: WriteStream

  constructor(filePath: string) {
    mkdirSync(dirname(filePath), { recursive: true })
    this.stream = createWriteStream(filePath, { flags: 'a' })
  }

  write(event: RunEvent): void {
    this.stream.write(JSON.stringify(event) + '\n')
  }

  close(): void {
    this.stream.end()
  }
}
```

- [ ] **Step 8.5: Run — confirm pass**

Run:
```bash
pnpm vitest run packages/core/tests/events.test.ts
```

Expected: PASS — 3/3.

- [ ] **Step 8.6: Commit**

```bash
git add packages/core/src/events/ packages/core/tests/events.test.ts
git commit -m "feat(core): event bus and jsonl sink"
```

---

## Task 9: DAG builder + cycle detection

**Files:**
- Create: `packages/core/src/graph/dag.ts`
- Test: `packages/core/tests/dag.test.ts`

- [ ] **Step 9.1: Write the failing test**

Create `packages/core/tests/dag.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { buildDag } from '../src/graph/dag.js'
import type { ExperienceSpec } from '@openexpertise/schema'

function spec(nodes: string[], edges: Array<[string, string]>): ExperienceSpec {
  return {
    name: 't',
    version: '0.1.0',
    state: { schema: {} },
    graph: {
      nodes: nodes.map((id) => ({ id, kind: 'tool', impl: 't' })),
      edges: edges.map(([from, to]) => ({ from, to })),
    },
  }
}

describe('buildDag', () => {
  it('returns nodes in topological order for a linear DAG', () => {
    const dag = buildDag(spec(['a', 'b', 'c'], [['a', 'b'], ['b', 'c']]))
    expect(dag.topoOrder.map((n) => n.id)).toEqual(['a', 'b', 'c'])
  })

  it('groups parallel branches in any valid topological order', () => {
    const dag = buildDag(spec(['root', 'left', 'right', 'join'],
      [['root', 'left'], ['root', 'right'], ['left', 'join'], ['right', 'join']]))
    const order = dag.topoOrder.map((n) => n.id)
    expect(order[0]).toBe('root')
    expect(order[3]).toBe('join')
    expect(order.slice(1, 3).sort()).toEqual(['left', 'right'])
  })

  it('throws on cycle', () => {
    expect(() => buildDag(spec(['a', 'b'], [['a', 'b'], ['b', 'a']])))
      .toThrow(/cycle/i)
  })

  it('reports predecessors for each node', () => {
    const dag = buildDag(spec(['a', 'b', 'c'], [['a', 'c'], ['b', 'c']]))
    const c = dag.nodes.get('c')!
    expect(new Set(c.predecessors)).toEqual(new Set(['a', 'b']))
  })

  it('handles isolated nodes (no edges)', () => {
    const dag = buildDag(spec(['a', 'b'], []))
    expect(dag.topoOrder.map((n) => n.id).sort()).toEqual(['a', 'b'])
  })
})
```

- [ ] **Step 9.2: Run — confirm fail**

Run:
```bash
pnpm vitest run packages/core/tests/dag.test.ts
```

Expected: FAIL.

- [ ] **Step 9.3: Implement `dag.ts`**

Create `packages/core/src/graph/dag.ts`:
```ts
import type { ExperienceSpec, NodeSpec } from '@openexpertise/schema'

export interface DagNode {
  id: string
  spec: NodeSpec
  predecessors: string[]
  successors: string[]
}

export interface Dag {
  nodes: Map<string, DagNode>
  topoOrder: DagNode[]
}

export function buildDag(spec: ExperienceSpec): Dag {
  const nodes = new Map<string, DagNode>()

  for (const n of spec.graph.nodes) {
    nodes.set(n.id, { id: n.id, spec: n, predecessors: [], successors: [] })
  }

  for (const edge of spec.graph.edges) {
    const from = nodes.get(edge.from)
    const to = nodes.get(edge.to)
    if (!from || !to) {
      throw new Error(`Edge references missing node: ${edge.from} -> ${edge.to}`)
    }
    from.successors.push(edge.to)
    to.predecessors.push(edge.from)
  }

  const topoOrder = topoSort(nodes)
  return { nodes, topoOrder }
}

function topoSort(nodes: Map<string, DagNode>): DagNode[] {
  const indegree = new Map<string, number>()
  for (const n of nodes.values()) indegree.set(n.id, n.predecessors.length)

  const ready: string[] = []
  for (const [id, deg] of indegree) if (deg === 0) ready.push(id)

  const result: DagNode[] = []
  while (ready.length > 0) {
    const id = ready.shift()!
    const node = nodes.get(id)!
    result.push(node)
    for (const succId of node.successors) {
      const next = (indegree.get(succId) ?? 0) - 1
      indegree.set(succId, next)
      if (next === 0) ready.push(succId)
    }
  }

  if (result.length !== nodes.size) {
    const remaining = [...nodes.keys()].filter((id) => !result.find((r) => r.id === id))
    throw new Error(`Graph contains a cycle involving: ${remaining.join(', ')}`)
  }

  return result
}
```

- [ ] **Step 9.4: Run — confirm pass**

Run:
```bash
pnpm vitest run packages/core/tests/dag.test.ts
```

Expected: PASS — 5/5.

- [ ] **Step 9.5: Commit**

```bash
git add packages/core/src/graph/dag.ts packages/core/tests/dag.test.ts
git commit -m "feat(core): DAG builder with topological sort and cycle detection"
```

---

## Task 10: Dispatcher framework + RunContext

**Files:**
- Create: `packages/core/src/dispatcher/types.ts`
- Create: `packages/core/src/dispatcher/registry.ts`
- Create: `packages/core/src/run/context.ts`

- [ ] **Step 10.1: Implement `dispatcher/types.ts`**

Create `packages/core/src/dispatcher/types.ts`:
```ts
import type { NodeKind, NodeSpec } from '@openexpertise/schema'
import type { RunContext } from '../run/context.js'

export interface NodeInputBundle {
  state_view: Readonly<Record<string, unknown>>
  edge_inputs: Record<string, unknown>
  args: Record<string, unknown>
}

export interface NodeOutput {
  state_delta: Record<string, unknown>
  edge_output?: unknown
  metrics?: { tokens_in?: number; tokens_out?: number; cost_usd?: number }
}

export interface ResolvedImpl {
  /* opaque to the runtime; each dispatcher fills it as needed */
  [k: string]: unknown
}

export interface NodeDispatcher {
  readonly kind: NodeKind
  resolve(node: NodeSpec, ctx: RunContext): Promise<ResolvedImpl>
  run(impl: ResolvedImpl, bundle: NodeInputBundle, ctx: RunContext): Promise<NodeOutput>
}
```

- [ ] **Step 10.2: Implement `dispatcher/registry.ts`**

Create `packages/core/src/dispatcher/registry.ts`:
```ts
import type { NodeKind } from '@openexpertise/schema'
import type { NodeDispatcher } from './types.js'
export type { NodeDispatcher, NodeInputBundle, NodeOutput, ResolvedImpl } from './types.js'

export class DispatcherRegistry {
  private readonly map = new Map<NodeKind, NodeDispatcher>()

  register(dispatcher: NodeDispatcher): void {
    if (this.map.has(dispatcher.kind)) {
      throw new Error(`Dispatcher for kind "${dispatcher.kind}" already registered`)
    }
    this.map.set(dispatcher.kind, dispatcher)
  }

  get(kind: NodeKind): NodeDispatcher {
    const d = this.map.get(kind)
    if (!d) throw new Error(`No dispatcher registered for kind "${kind}"`)
    return d
  }

  has(kind: NodeKind): boolean {
    return this.map.has(kind)
  }
}
```

- [ ] **Step 10.3: Implement `run/context.ts`**

Create `packages/core/src/run/context.ts`:
```ts
import type { ExperienceSpec } from '@openexpertise/schema'
import type { StateStore } from '../state/store.js'
import type { EventBus } from '../events/bus.js'
import type { DispatcherRegistry } from '../dispatcher/registry.js'

export interface RunContextOpts {
  runId: string
  spec: ExperienceSpec
  experienceDir: string
  store: StateStore
  events: EventBus
  dispatchers: DispatcherRegistry
  args: Record<string, unknown>
}

export class RunContext {
  readonly runId: string
  readonly spec: ExperienceSpec
  readonly experienceDir: string
  readonly store: StateStore
  readonly events: EventBus
  readonly dispatchers: DispatcherRegistry
  readonly args: Record<string, unknown>

  constructor(opts: RunContextOpts) {
    this.runId = opts.runId
    this.spec = opts.spec
    this.experienceDir = opts.experienceDir
    this.store = opts.store
    this.events = opts.events
    this.dispatchers = opts.dispatchers
    this.args = opts.args
  }

  now(): string {
    return new Date().toISOString()
  }
}
```

- [ ] **Step 10.4: Typecheck**

Run:
```bash
pnpm --filter @openexpertise/core typecheck
```

Expected: no errors.

- [ ] **Step 10.5: Commit**

```bash
git add packages/core/src/dispatcher/ packages/core/src/run/
git commit -m "feat(core): dispatcher registry + RunContext"
```

---

## Task 11: Sequential scheduler + runner

**Files:**
- Create: `packages/core/src/graph/scheduler.ts`
- Create: `packages/core/src/runner.ts`
- Test: `packages/core/tests/runner.test.ts`

- [ ] **Step 11.1: Write failing integration test**

Create `packages/core/tests/runner.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { runExperience } from '../src/runner.js'
import { DispatcherRegistry } from '../src/dispatcher/registry.js'
import type { NodeDispatcher, NodeInputBundle, NodeOutput } from '../src/dispatcher/types.js'
import type { ExperienceSpec, NodeSpec } from '@openexpertise/schema'
import { EventBus, type RunEvent } from '../src/events/bus.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

class FakeTool implements NodeDispatcher {
  readonly kind = 'tool' as const
  constructor(private produce: (b: NodeInputBundle) => NodeOutput) {}
  async resolve(_n: NodeSpec) { return {} }
  async run(_impl: unknown, bundle: NodeInputBundle): Promise<NodeOutput> {
    return this.produce(bundle)
  }
}

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'oe-runner-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

const spec: ExperienceSpec = {
  name: 't',
  version: '0.1.0',
  state: { schema: { a: { type: 'number' }, b: { type: 'number' } } },
  graph: {
    nodes: [
      { id: 'set_a', kind: 'tool', impl: 'x', writes: ['a'] },
      { id: 'set_b', kind: 'tool', impl: 'x', reads: ['a'], writes: ['b'] },
    ],
    edges: [{ from: 'set_a', to: 'set_b' }],
  },
}

describe('runExperience', () => {
  it('runs nodes in topological order and threads state', async () => {
    const dispatchers = new DispatcherRegistry()
    dispatchers.register(new FakeTool((b) => {
      if (b.state_view.a === undefined) return { state_delta: { a: 7 } }
      return { state_delta: { b: (b.state_view.a as number) * 2 } }
    }))
    const events = new EventBus()
    const seen: RunEvent[] = []
    events.subscribe((e) => seen.push(e))

    const result = await runExperience({
      spec, experienceDir: dir, dispatchers, events, args: {}, dbPath: join(dir, 's.sqlite'),
    })

    expect(result.status).toBe('success')
    expect(result.finalState.a).toBe(7)
    expect(result.finalState.b).toBe(14)
    expect(seen.find((e) => e.type === 'run.started')).toBeDefined()
    expect(seen.find((e) => e.type === 'run.finished')).toBeDefined()
    const nodeFinishes = seen.filter((e) => e.type === 'node.finished')
    expect(nodeFinishes).toHaveLength(2)
  })

  it('marks run failed when a dispatcher throws', async () => {
    const dispatchers = new DispatcherRegistry()
    dispatchers.register(new FakeTool(() => { throw new Error('boom') }))
    const result = await runExperience({
      spec: {
        ...spec,
        graph: { ...spec.graph, nodes: [spec.graph.nodes[0]!], edges: [] },
      },
      experienceDir: dir, dispatchers, events: new EventBus(), args: {},
      dbPath: join(dir, 's.sqlite'),
    })
    expect(result.status).toBe('failed')
  })
})
```

- [ ] **Step 11.2: Run — confirm fail**

Run:
```bash
pnpm vitest run packages/core/tests/runner.test.ts
```

Expected: FAIL.

- [ ] **Step 11.3: Implement `scheduler.ts`**

Create `packages/core/src/graph/scheduler.ts`:
```ts
import type { Dag, DagNode } from './dag.js'
import type { RunContext } from '../run/context.js'
import type { NodeDispatcher, NodeInputBundle, NodeOutput } from '../dispatcher/types.js'
import { resolveExpression } from '../expressions/resolve.js'

export interface NodeRunResult {
  nodeId: string
  status: 'success' | 'failed' | 'skipped'
  output?: NodeOutput
  error?: Error
}

export class SequentialScheduler {
  constructor(private readonly dag: Dag, private readonly ctx: RunContext) {}

  async run(): Promise<{ status: 'success' | 'failed' | 'partial'; results: NodeRunResult[] }> {
    const results: NodeRunResult[] = []
    const edgeBuffer = new Map<string, Record<string, unknown>>() // nodeId -> edge_inputs by predecessor
    const skipped = new Set<string>()
    let anyFailed = false

    for (const node of this.dag.topoOrder) {
      // skip if any predecessor was skipped or failed (Plan 1 default = skip downstream)
      const predSkipped = node.predecessors.some((p) => skipped.has(p))
      if (predSkipped) {
        skipped.add(node.id)
        this.ctx.events.emit({
          type: 'node.skipped', run_id: this.ctx.runId, node_id: node.id,
          ts: this.ctx.now(), reason: 'predecessor failed or skipped',
        })
        results.push({ nodeId: node.id, status: 'skipped' })
        continue
      }

      this.ctx.events.emit({ type: 'node.ready', run_id: this.ctx.runId, node_id: node.id, ts: this.ctx.now() })

      const bundle = this.assembleBundle(node, edgeBuffer.get(node.id) ?? {})
      const dispatcher: NodeDispatcher = this.ctx.dispatchers.get(node.spec.kind)

      this.ctx.events.emit({ type: 'node.started', run_id: this.ctx.runId, node_id: node.id, ts: this.ctx.now() })
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
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))
        this.ctx.events.emit({
          type: 'node.failed', run_id: this.ctx.runId, node_id: node.id,
          ts: this.ctx.now(), error: error.message,
        })
        results.push({ nodeId: node.id, status: 'failed', error })
        skipped.add(node.id)
        anyFailed = true
      }
    }

    const status = anyFailed
      ? results.every((r) => r.status === 'failed' || r.status === 'skipped') ? 'failed' : 'partial'
      : 'success'
    return { status, results }
  }

  private assembleBundle(node: DagNode, edgeInputs: Record<string, unknown>): NodeInputBundle {
    const declaredReads = node.spec.reads ?? []
    const state_view: Record<string, unknown> = {}
    for (const field of declaredReads) {
      state_view[field] = this.ctx.store.get(field)
    }

    const fullState = this.ctx.store.snapshot()
    const args = ('args' in node.spec ? node.spec.args : undefined) ?? {}
    const resolvedArgs = resolveExpression(args, fullState) as Record<string, unknown>

    return {
      state_view: Object.freeze({ ...state_view }),
      edge_inputs: edgeInputs,
      args: resolvedArgs,
    }
  }
}
```

- [ ] **Step 11.4: Implement `runner.ts`**

Create `packages/core/src/runner.ts`:
```ts
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { validateExperienceSpec } from '@openexpertise/schema'
import type { ExperienceSpec } from '@openexpertise/schema'
import { StateStore } from './state/store.js'
import { EventBus } from './events/bus.js'
import { JsonlEventSink } from './events/sink.js'
import { buildDag } from './graph/dag.js'
import { SequentialScheduler } from './graph/scheduler.js'
import { RunContext } from './run/context.js'
import { DispatcherRegistry } from './dispatcher/registry.js'

export interface RunOpts {
  spec: ExperienceSpec
  experienceDir: string
  dispatchers: DispatcherRegistry
  events?: EventBus
  args?: Record<string, unknown>
  dbPath?: string
  runId?: string
  eventLogPath?: string
}

export interface RunResult {
  runId: string
  status: 'success' | 'failed' | 'partial'
  finalState: Record<string, unknown>
}

export async function runExperience(opts: RunOpts): Promise<RunResult> {
  validateExperienceSpec(opts.spec)

  const runId = opts.runId ?? randomUUID()
  const events = opts.events ?? new EventBus()

  const runDir = join(opts.experienceDir, '.openexpertise')
  mkdirSync(runDir, { recursive: true })
  const dbPath = opts.dbPath ?? join(runDir, 'state.sqlite')
  const eventLogPath = opts.eventLogPath ?? join(runDir, 'runs', `${runId}.jsonl`)

  const sink = new JsonlEventSink(eventLogPath)
  const unsub = events.subscribe((e) => sink.write(e))

  const store = new StateStore({ dbPath, spec: opts.spec })

  try {
    events.emit({ type: 'run.started', run_id: runId, ts: new Date().toISOString(), args: opts.args ?? {} })

    const dag = buildDag(opts.spec)
    const ctx = new RunContext({
      runId, spec: opts.spec, experienceDir: opts.experienceDir,
      store, events, dispatchers: opts.dispatchers, args: opts.args ?? {},
    })
    const scheduler = new SequentialScheduler(dag, ctx)
    const { status } = await scheduler.run()

    events.emit({ type: 'run.finished', run_id: runId, ts: new Date().toISOString(), status })

    const finalState = store.snapshot()
    return { runId, status, finalState }
  } finally {
    unsub()
    sink.close()
    store.close()
  }
}
```

- [ ] **Step 11.5: Run — confirm pass**

Run:
```bash
pnpm vitest run packages/core/tests/runner.test.ts
```

Expected: PASS — 2/2.

- [ ] **Step 11.6: Run full core test suite + typecheck**

Run:
```bash
pnpm vitest run packages/core/
pnpm --filter @openexpertise/core typecheck
```

Expected: all green.

- [ ] **Step 11.7: Commit**

```bash
git add packages/core/src/graph/scheduler.ts packages/core/src/runner.ts packages/core/tests/runner.test.ts
git commit -m "feat(core): sequential scheduler + runExperience orchestrator"
```

---

## Task 12: `@openexpertise/node-kinds-tool` — tool dispatcher

**Files:**
- Create: `packages/node-kinds-tool/package.json`
- Create: `packages/node-kinds-tool/tsconfig.json`
- Create: `packages/node-kinds-tool/src/loader.ts`
- Create: `packages/node-kinds-tool/src/index.ts`
- Test: `packages/node-kinds-tool/tests/tool.test.ts`

- [ ] **Step 12.1: Create `package.json`**

Create `packages/node-kinds-tool/package.json`:
```json
{
  "name": "@openexpertise/node-kinds-tool",
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

- [ ] **Step 12.2: Create `tsconfig.json`**

Create `packages/node-kinds-tool/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "references": [{ "path": "../core" }, { "path": "../schema" }],
  "include": ["src/**/*"]
}
```

- [ ] **Step 12.3: Write failing test**

Create `packages/node-kinds-tool/tests/tool.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ToolDispatcher } from '../src/index.js'
import { RunContext } from '@openexpertise/core'
import { StateStore, EventBus, DispatcherRegistry } from '@openexpertise/core'
import type { ToolNodeSpec, ExperienceSpec } from '@openexpertise/schema'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let dir: string
let ctx: RunContext

const spec: ExperienceSpec = {
  name: 't', version: '0.1.0',
  state: { schema: { out: { type: 'string' } } },
  graph: { nodes: [{ id: 'x', kind: 'tool', impl: './t.mjs', writes: ['out'] }], edges: [] },
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'oe-tool-'))
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

describe('ToolDispatcher', () => {
  it('loads a tool module and invokes its default export', async () => {
    const modulePath = join(dir, 'greet.mjs')
    writeFileSync(modulePath, `export default async (args) => ({ state_delta: { out: 'hello ' + args.name } })\n`)

    const node: ToolNodeSpec = { id: 'x', kind: 'tool', impl: './greet.mjs', writes: ['out'], args: { name: 'world' } }
    const dispatcher = new ToolDispatcher()
    const impl = await dispatcher.resolve(node, ctx)
    const output = await dispatcher.run(impl, { state_view: {}, edge_inputs: {}, args: { name: 'world' } }, ctx)

    expect(output.state_delta).toEqual({ out: 'hello world' })
  })

  it('throws a clear error when impl file is missing', async () => {
    const node: ToolNodeSpec = { id: 'x', kind: 'tool', impl: './does-not-exist.mjs' }
    const dispatcher = new ToolDispatcher()
    await expect(dispatcher.resolve(node, ctx)).rejects.toThrow(/does-not-exist/)
  })

  it('throws when module has no default export', async () => {
    const modulePath = join(dir, 'no-default.mjs')
    writeFileSync(modulePath, `export const named = () => {}\n`)
    const node: ToolNodeSpec = { id: 'x', kind: 'tool', impl: './no-default.mjs' }
    const dispatcher = new ToolDispatcher()
    const impl = await dispatcher.resolve(node, ctx)
    await expect(dispatcher.run(impl, { state_view: {}, edge_inputs: {}, args: {} }, ctx))
      .rejects.toThrow(/default export/)
  })
})
```

- [ ] **Step 12.4: Run — confirm fail**

Run:
```bash
pnpm vitest run packages/node-kinds-tool/tests/tool.test.ts
```

Expected: FAIL.

- [ ] **Step 12.5: Implement `loader.ts`**

Create `packages/node-kinds-tool/src/loader.ts`:
```ts
import { pathToFileURL } from 'node:url'
import { resolve, isAbsolute } from 'node:path'
import { existsSync } from 'node:fs'

export interface LoadedToolModule {
  default?: (args: unknown, ctx?: unknown) => Promise<unknown> | unknown
  [k: string]: unknown
}

export async function loadToolModule(impl: string, experienceDir: string): Promise<LoadedToolModule> {
  const abs = isAbsolute(impl) ? impl : resolve(experienceDir, impl)
  if (!existsSync(abs)) {
    throw new Error(`Tool impl not found: ${abs} (declared as "${impl}" in experience.yaml)`)
  }
  const url = pathToFileURL(abs).href
  return (await import(url)) as LoadedToolModule
}
```

- [ ] **Step 12.6: Implement `index.ts`**

Create `packages/node-kinds-tool/src/index.ts`:
```ts
import type {
  NodeDispatcher, NodeInputBundle, NodeOutput, ResolvedImpl,
} from '@openexpertise/core'
import { RunContext } from '@openexpertise/core'
import type { NodeSpec, ToolNodeSpec } from '@openexpertise/schema'
import { loadToolModule, type LoadedToolModule } from './loader.js'

interface ToolImpl extends ResolvedImpl {
  module: LoadedToolModule
  nodeId: string
}

export class ToolDispatcher implements NodeDispatcher {
  readonly kind = 'tool' as const

  async resolve(node: NodeSpec, ctx: RunContext): Promise<ToolImpl> {
    if (node.kind !== 'tool') throw new Error(`ToolDispatcher cannot resolve kind=${node.kind}`)
    const t = node as ToolNodeSpec
    const mod = await loadToolModule(t.impl, ctx.experienceDir)
    return { module: mod, nodeId: t.id }
  }

  async run(impl: ResolvedImpl, bundle: NodeInputBundle, _ctx: RunContext): Promise<NodeOutput> {
    const ti = impl as ToolImpl
    const fn = ti.module.default
    if (typeof fn !== 'function') {
      throw new Error(`Tool "${ti.nodeId}" module has no default export (or it is not a function)`)
    }
    const result = await fn({ ...bundle.args, _edge_inputs: bundle.edge_inputs, _state: bundle.state_view })
    if (result === null || typeof result !== 'object') {
      throw new Error(`Tool "${ti.nodeId}" default export must return an object with at least { state_delta }`)
    }
    const obj = result as Record<string, unknown>
    return {
      state_delta: (obj.state_delta as Record<string, unknown>) ?? {},
      ...(obj.edge_output !== undefined ? { edge_output: obj.edge_output } : {}),
      ...(obj.metrics ? { metrics: obj.metrics as NodeOutput['metrics'] } : {}),
    }
  }
}
```

- [ ] **Step 12.7: Install deps + run tests**

Run:
```bash
pnpm install
pnpm vitest run packages/node-kinds-tool/
pnpm --filter @openexpertise/node-kinds-tool typecheck
```

Expected: PASS — 3/3 tests; typecheck clean.

- [ ] **Step 12.8: Commit**

```bash
git add packages/node-kinds-tool/
git commit -m "feat(node-kinds-tool): tool dispatcher with dynamic import"
```

---

## Task 13: `@openexpertise/cli` — `oe validate`, `oe run`, `oe inspect`

**Files:**
- Create: `packages/cli/package.json`
- Create: `packages/cli/tsconfig.json`
- Create: `packages/cli/src/bin.ts`
- Create: `packages/cli/src/index.ts`
- Create: `packages/cli/src/logger.ts`
- Create: `packages/cli/src/commands/validate.ts`
- Create: `packages/cli/src/commands/run.ts`
- Create: `packages/cli/src/commands/inspect.ts`
- Test: `packages/cli/tests/cli.test.ts`

- [ ] **Step 13.1: Create `package.json`**

Create `packages/cli/package.json`:
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
    "commander": "^12.0.0",
    "pino": "^9.0.0",
    "pino-pretty": "^11.0.0"
  }
}
```

- [ ] **Step 13.2: Create `tsconfig.json`**

Create `packages/cli/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "references": [
    { "path": "../schema" },
    { "path": "../core" },
    { "path": "../node-kinds-tool" }
  ],
  "include": ["src/**/*"]
}
```

- [ ] **Step 13.3: Implement `logger.ts`**

Create `packages/cli/src/logger.ts`:
```ts
import pino from 'pino'

export function makeLogger(opts: { pretty?: boolean; level?: string } = {}) {
  if (opts.pretty) {
    return pino({
      level: opts.level ?? 'info',
      transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } },
    })
  }
  return pino({ level: opts.level ?? 'info' })
}
```

- [ ] **Step 13.4: Implement `commands/validate.ts`**

Create `packages/cli/src/commands/validate.ts`:
```ts
import { readFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { parseExperienceYaml, validateExperienceSpec, ValidationError } from '@openexpertise/schema'
import type { Logger } from 'pino'

export interface ValidateOpts {
  path: string
  logger: Logger
}

export async function validateCommand(opts: ValidateOpts): Promise<number> {
  const yamlPath = resolveExperienceYaml(opts.path)
  const source = readFileSync(yamlPath, 'utf8')
  try {
    const spec = parseExperienceYaml(source)
    validateExperienceSpec(spec)
    opts.logger.info({ path: yamlPath }, 'experience valid')
    return 0
  } catch (err) {
    if (err instanceof ValidationError) {
      opts.logger.error({ errors: err.errors }, err.message)
    } else {
      opts.logger.error({ err: (err as Error).message }, 'validation failed')
    }
    return 1
  }
}

export function resolveExperienceYaml(input: string): string {
  const abs = resolve(input)
  if (abs.endsWith('.yaml') || abs.endsWith('.yml')) return abs
  return join(abs, 'experience.yaml')
}
```

- [ ] **Step 13.5: Implement `commands/run.ts`**

Create `packages/cli/src/commands/run.ts`:
```ts
import { readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { parseExperienceYaml } from '@openexpertise/schema'
import { DispatcherRegistry, EventBus, runExperience } from '@openexpertise/core'
import { ToolDispatcher } from '@openexpertise/node-kinds-tool'
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
  // Plan 2: register agent / skill / dataset / experience dispatchers here.

  const events = new EventBus()
  events.subscribe((e) => opts.logger.info(e, e.type))

  const result = await runExperience({ spec, experienceDir, dispatchers, events, args: opts.args })
  opts.logger.info({ runId: result.runId, status: result.status, finalState: result.finalState }, 'run complete')

  return result.status === 'success' ? 0 : 1
}
```

- [ ] **Step 13.6: Implement `commands/inspect.ts`**

Create `packages/cli/src/commands/inspect.ts`:
```ts
import { readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Logger } from 'pino'

export interface InspectOpts {
  experiencePath: string
  runId: string
  logger: Logger
}

export async function inspectCommand(opts: InspectOpts): Promise<number> {
  const dir = resolve(opts.experiencePath)
  const logPath = join(dir, '.openexpertise', 'runs', `${opts.runId}.jsonl`)
  if (!existsSync(logPath)) {
    opts.logger.error({ logPath }, 'run log not found')
    return 1
  }
  const lines = readFileSync(logPath, 'utf8').trim().split('\n')
  for (const line of lines) {
    const event = JSON.parse(line)
    opts.logger.info(event, event.type)
  }
  return 0
}
```

- [ ] **Step 13.7: Implement `index.ts` and `bin.ts`**

Create `packages/cli/src/index.ts`:
```ts
import { Command } from 'commander'
import { validateCommand } from './commands/validate.js'
import { runCommand } from './commands/run.js'
import { inspectCommand } from './commands/inspect.js'
import { makeLogger } from './logger.js'

export function buildProgram(): Command {
  const program = new Command()
  program
    .name('oe')
    .description('OpenExpertise CLI — execute and inspect experience flows')
    .version('0.1.0')
    .option('--log-format <fmt>', 'log format: json | pretty', 'pretty')
    .option('--log-level <level>', 'log level', 'info')

  program
    .command('validate')
    .description('Validate an experience.yaml file or directory')
    .argument('[path]', 'path to experience.yaml or experience directory', '.')
    .action(async (path: string, _cmdOpts, cmd: Command) => {
      const root = cmd.optsWithGlobals()
      const logger = makeLogger({ pretty: root.logFormat === 'pretty', level: root.logLevel })
      process.exit(await validateCommand({ path, logger }))
    })

  program
    .command('run')
    .description('Execute an experience')
    .argument('[path]', 'path to experience.yaml or experience directory', '.')
    .option('--args <json>', 'JSON object passed as args to the experience', '{}')
    .action(async (path: string, cmdOpts: { args: string }, cmd: Command) => {
      const root = cmd.optsWithGlobals()
      const logger = makeLogger({ pretty: root.logFormat === 'pretty', level: root.logLevel })
      let args: Record<string, unknown> = {}
      try { args = JSON.parse(cmdOpts.args) } catch { logger.error('--args must be valid JSON'); process.exit(2) }
      process.exit(await runCommand({ path, args, logger }))
    })

  program
    .command('inspect')
    .description('Render a run trace from .openexpertise/runs/<run-id>.jsonl')
    .argument('<run-id>', 'run id')
    .option('--experience <path>', 'experience path', '.')
    .action(async (runId: string, cmdOpts: { experience: string }, cmd: Command) => {
      const root = cmd.optsWithGlobals()
      const logger = makeLogger({ pretty: root.logFormat === 'pretty', level: root.logLevel })
      process.exit(await inspectCommand({ experiencePath: cmdOpts.experience, runId, logger }))
    })

  return program
}
```

Create `packages/cli/src/bin.ts`:
```ts
#!/usr/bin/env node
import { buildProgram } from './index.js'

const program = buildProgram()
program.parseAsync(process.argv).catch((err) => {
  process.stderr.write(`oe: ${(err as Error).message}\n`)
  process.exit(1)
})
```

- [ ] **Step 13.8: Write CLI test**

Create `packages/cli/tests/cli.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { buildProgram } from '../src/index.js'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'oe-cli-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

describe('oe CLI', () => {
  it('exits 0 on valid experience', async () => {
    const yaml = `
name: t
version: 0.1.0
state: { schema: { greeting: { type: string } } }
graph:
  nodes: [{ id: g, kind: tool, impl: ./greet.mjs, writes: [greeting] }]
  edges: []
`
    writeFileSync(join(dir, 'experience.yaml'), yaml)
    const program = buildProgram()
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit') })
    await expect(program.parseAsync(['node', 'oe', 'validate', dir]))
      .rejects.toThrow('exit')
    expect(exit).toHaveBeenCalledWith(0)
    exit.mockRestore()
  })
})
```

- [ ] **Step 13.9: Install + run tests**

Run:
```bash
pnpm install
pnpm vitest run packages/cli/
pnpm --filter @openexpertise/cli typecheck
```

Expected: PASS — 1/1; typecheck clean.

- [ ] **Step 13.10: Commit**

```bash
git add packages/cli/
git commit -m "feat(cli): oe validate / run / inspect with commander + pino"
```

---

## Task 14: `examples/hello-tool` walking-skeleton example

**Files:**
- Create: `examples/hello-tool/experience.yaml`
- Create: `examples/hello-tool/tools/greet.ts`
- Create: `examples/hello-tool/package.json`
- Create: `examples/hello-tool/README.md`

- [ ] **Step 14.1: Write `experience.yaml`**

Create `examples/hello-tool/experience.yaml`:
```yaml
name: hello-tool
description: Smallest possible experience. One tool node writes a greeting to state.
version: 0.1.0

state:
  schema:
    name:
      type: string
      description: Subject of the greeting; passed in via --args
    greeting:
      type: string
      description: The greeting produced by the tool

graph:
  nodes:
    - id: greet
      kind: tool
      impl: ./tools/greet.mjs
      args:
        name: World
      writes: [greeting]
  edges: []
```

- [ ] **Step 14.2: Write `tools/greet.ts` and a compiled `.mjs` copy**

Create `examples/hello-tool/tools/greet.ts`:
```ts
export default async function greet(args: { name: string }) {
  return { state_delta: { greeting: `hello, ${args.name}` } }
}
```

Because the runtime dynamically imports the path declared in `impl:` (`./tools/greet.mjs`), we ship a hand-written `.mjs` alongside the `.ts` so the example runs without a build step.

Create `examples/hello-tool/tools/greet.mjs`:
```js
export default async function greet(args) {
  return { state_delta: { greeting: `hello, ${args.name}` } }
}
```

- [ ] **Step 14.3: Write `package.json` and `README.md`**

Create `examples/hello-tool/package.json`:
```json
{
  "name": "@openexpertise/example-hello-tool",
  "version": "0.1.0",
  "private": true,
  "type": "module"
}
```

Create `examples/hello-tool/README.md`:
```markdown
# hello-tool

Smallest OpenExpertise experience. Walks through one tool node.

```bash
oe validate examples/hello-tool
oe run examples/hello-tool --args '{}'
```

Expected: `greeting` state field is set to `hello, World`.
```

- [ ] **Step 14.4: Smoke-test by running locally**

Build the workspace, then run the CLI against the example:
```bash
pnpm -r build
node packages/cli/dist/bin.js validate examples/hello-tool
node packages/cli/dist/bin.js run examples/hello-tool
```

Expected:
- `validate` prints `experience valid` and exits 0.
- `run` emits event lines (`run.started`, `node.ready`, `node.started`, `state.write`, `node.finished`, `run.finished`) and exits 0.
- `examples/hello-tool/.openexpertise/state.sqlite` exists.
- `examples/hello-tool/.openexpertise/runs/<run-id>.jsonl` exists.

- [ ] **Step 14.5: Commit**

```bash
git add examples/hello-tool/
git commit -m "feat(examples): hello-tool walking-skeleton example"
```

---

## Task 15: End-to-end test

**Files:**
- Create: `e2e/package.json`
- Create: `e2e/tsconfig.json`
- Create: `e2e/helpers.ts`
- Create: `e2e/hello-tool.e2e.test.ts`

- [ ] **Step 15.1: Create `package.json`**

Create `e2e/package.json`:
```json
{
  "name": "@openexpertise/e2e",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run"
  },
  "dependencies": {
    "@openexpertise/cli": "workspace:*",
    "@openexpertise/core": "workspace:*",
    "@openexpertise/schema": "workspace:*",
    "@openexpertise/node-kinds-tool": "workspace:*"
  }
}
```

- [ ] **Step 15.2: Create `tsconfig.json`**

Create `e2e/tsconfig.json`:
```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": { "rootDir": ".", "outDir": "dist", "composite": false },
  "include": ["**/*.ts"]
}
```

- [ ] **Step 15.3: Write helpers**

Create `e2e/helpers.ts`:
```ts
import { mkdtempSync, cpSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

export interface Sandbox {
  dir: string
  cleanup(): void
}

export function copyExampleToSandbox(exampleName: string): Sandbox {
  const dir = mkdtempSync(join(tmpdir(), `oe-e2e-${exampleName}-`))
  const src = resolve(__dirname, '..', 'examples', exampleName)
  cpSync(src, dir, { recursive: true })
  return {
    dir,
    cleanup() { rmSync(dir, { recursive: true, force: true }) },
  }
}
```

Note: `e2e/tsconfig.json` uses `composite: false`; we rely on `vitest` to handle TS directly. If the workspace runs with `__dirname` undefined under ESM, switch to:
```ts
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
const __dirname = dirname(fileURLToPath(import.meta.url))
```

Use the import.meta.url variant — it's always safe under ESM.

Final `e2e/helpers.ts`:
```ts
import { mkdtempSync, cpSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

export interface Sandbox {
  dir: string
  cleanup(): void
}

export function copyExampleToSandbox(exampleName: string): Sandbox {
  const dir = mkdtempSync(join(tmpdir(), `oe-e2e-${exampleName}-`))
  const src = resolve(HERE, '..', 'examples', exampleName)
  cpSync(src, dir, { recursive: true })
  return {
    dir,
    cleanup() { rmSync(dir, { recursive: true, force: true }) },
  }
}
```

- [ ] **Step 15.4: Write the E2E test**

Create `e2e/hello-tool.e2e.test.ts`:
```ts
import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { parseExperienceYaml } from '@openexpertise/schema'
import { DispatcherRegistry, EventBus, runExperience, StateStore } from '@openexpertise/core'
import { ToolDispatcher } from '@openexpertise/node-kinds-tool'
import { copyExampleToSandbox, type Sandbox } from './helpers.js'

let sandbox: Sandbox
afterEach(() => sandbox?.cleanup())

describe('hello-tool E2E', () => {
  it('runs to completion and writes greeting to state', async () => {
    sandbox = copyExampleToSandbox('hello-tool')
    const yamlPath = join(sandbox.dir, 'experience.yaml')
    const spec = parseExperienceYaml(readFileSync(yamlPath, 'utf8'))

    const dispatchers = new DispatcherRegistry()
    dispatchers.register(new ToolDispatcher())

    const result = await runExperience({
      spec,
      experienceDir: sandbox.dir,
      dispatchers,
      events: new EventBus(),
      args: {},
    })

    expect(result.status).toBe('success')
    expect(result.finalState.greeting).toBe('hello, World')

    // Run log was written
    const runLog = join(sandbox.dir, '.openexpertise', 'runs', `${result.runId}.jsonl`)
    expect(existsSync(runLog)).toBe(true)
    const events = readFileSync(runLog, 'utf8').trim().split('\n').map((l) => JSON.parse(l))
    expect(events.find((e) => e.type === 'run.started')).toBeDefined()
    expect(events.find((e) => e.type === 'state.write' && e.field === 'greeting')).toBeDefined()
    expect(events.find((e) => e.type === 'run.finished' && e.status === 'success')).toBeDefined()

    // SQLite persists the state
    const store = new StateStore({ dbPath: join(sandbox.dir, '.openexpertise', 'state.sqlite'), spec })
    expect(store.get('greeting')).toBe('hello, World')
    store.close()
  })
})
```

- [ ] **Step 15.5: Run E2E test**

Run:
```bash
pnpm install
pnpm vitest run e2e/
```

Expected: PASS — 1/1.

- [ ] **Step 15.6: Full suite + typecheck**

Run:
```bash
pnpm test
pnpm typecheck
pnpm lint
```

Expected: all green. If `lint` flags issues, fix them inline before committing.

- [ ] **Step 15.7: Commit**

```bash
git add e2e/
git commit -m "test(e2e): end-to-end test for hello-tool walking skeleton"
```

---

## Task 16: README polish and CI setup

**Files:**
- Modify: `README.md`
- Create: `.github/workflows/ci.yml`

- [ ] **Step 16.1: Expand `README.md`**

Replace the body of `README.md` with:
```markdown
# OpenExpertise

An open-source execution engine for **experience flows** — heterogeneous executable
graphs that codify expert knowledge into runnable, evolving artifacts.

See `docs/superpowers/specs/2026-05-25-openexpertise-design.md` for the V1 design.

## Status

Walking skeleton (Plan 1 of 5). One node kind (`tool`) wired end-to-end.
Not yet usable for real experiences.

## Quick start

```bash
pnpm install
pnpm -r build
node packages/cli/dist/bin.js run examples/hello-tool
```

You should see structured log lines for `run.started`, `state.write`,
`run.finished`, and a final state of `{ greeting: 'hello, World' }`.

## Development

```bash
pnpm test          # all unit + e2e tests
pnpm typecheck     # tsc across all packages
pnpm lint          # eslint
pnpm format:check  # prettier
```

## What's next

- Plan 2: agent / skill / dataset / experience dispatchers + control-flow primitives.
- Plan 3: cache + resume + remaining CLI commands + TUI.
- Plan 4: `experience-creator` authoring skill.
- Plan 5: evolution advisor + binary distribution.

See `docs/superpowers/plans/` for the breakdown.
```

- [ ] **Step 16.2: Create CI workflow**

Create `.github/workflows/ci.yml`:
```yaml
name: CI

on:
  push: { branches: [main] }
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm -r build
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm format:check
      - run: pnpm test
```

- [ ] **Step 16.3: Commit**

```bash
git add README.md .github/
git commit -m "docs: expand README + add GitHub Actions CI"
```

---

## Final verification

- [ ] **Step F.1: Clean rebuild**

Run:
```bash
pnpm clean
pnpm install
pnpm -r build
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
```

Expected: every step green. This mirrors what CI will do; if it passes locally, CI will pass.

- [ ] **Step F.2: Manual smoke**

Run:
```bash
node packages/cli/dist/bin.js validate examples/hello-tool
node packages/cli/dist/bin.js run examples/hello-tool
```

Then check:
```bash
ls examples/hello-tool/.openexpertise/runs/
node packages/cli/dist/bin.js inspect <the-run-id-from-above> --experience examples/hello-tool
```

Expected: events replay from the JSONL log.

- [ ] **Step F.3: Push initial commits (optional)**

If a remote is configured:
```bash
git remote -v
# if `origin` exists, push:
git push -u origin main
```

If no remote yet, leave the commits local; the user will create the GitHub repo and push later.

---

## Coverage check against spec

| Spec section | Plan 1 task(s) | Coverage |
|---|---|---|
| §2.4 Format (D) — declarative + impl escape | Task 3 (schema), Task 12 (tool dispatcher loads impl) | ✅ |
| §3 Repository layout | Tasks 1, 2, 5, 12, 13, 14, 15 | ✅ partial — only `tool` package + skeleton for others; rest land in Plan 2+ |
| §4 Experience file layout | Task 14 (`hello-tool` example) | ✅ |
| §5 Runtime data flow | Tasks 8 (events), 9 (DAG), 10 (registry), 11 (scheduler + runner) | ✅ sequential only; fan-out/pipeline/loop = Plan 2 |
| §6 Dispatcher contract | Task 10 (interface), Task 12 (tool impl) | ✅ for tool; agent/skill/dataset/experience = Plan 2 |
| §7 State layer | Task 7 | ✅ |
| §8 Evolution | — | ⏳ Plan 5 |
| §9 Control flow | Sequential only via DAG topo-sort | ⏳ fan-out/pipeline/conditional/loop = Plan 2 |
| §10 Authoring skill | — | ⏳ Plan 4 |
| §11 CLI surface | Task 13 (validate/run/inspect) | ✅ for these 3; init/resume/state/reset-state/diff = Plan 3+ |
| §12 Caching + resume | — | ⏳ Plan 3 |
| §13 Error handling | Task 11 (skip-downstream default) | ✅ partial — retry policy = Plan 2 |
| §14 Testing | Tasks 4, 7, 8, 9, 11, 12, 13, 15 | ✅ |
| §15 Observability | Task 8 (jsonl), Task 13 (pino logs) | ✅ |
| §16 MVP scope | Plans 1–5 collectively | ⏳ Plan 1 covers a slice |
| §17 Open questions | Decided: SQLite=`better-sqlite3`, foreground default; others deferred | ✅ partial |

Gaps that are explicitly punted to later plans are flagged ⏳. No silent gaps.

---

## Notes for the executor

- **Always TDD**: every code task above starts with a failing test, runs it red, then writes code, then runs it green. Don't skip the red step — it catches "I wrote a test that passes vacuously" bugs.
- **Commit at the end of every task**, not at the end of every step. Each task above ends with a commit; that's the right granularity.
- **`pnpm -r build` between major tasks** if you hit cross-package type errors. Composite project references require built artifacts to be present.
- **`better-sqlite3` is a native module**. If `pnpm install` fails on macOS/Linux due to compiler issues, run `xcode-select --install` (macOS) or install `build-essential` (Linux). On a fresh machine this is the most likely first stumble.
- **ESM imports use `.js` extensions** in source — TypeScript's NodeNext/Bundler module resolution requires this even though the source file is `.ts`. Don't strip them.
- **If a step's expected output differs**, stop and investigate. Don't paper over with retries. The whole point of TDD here is precise feedback.
