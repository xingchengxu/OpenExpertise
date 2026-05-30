import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import pino from 'pino'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// ─── Mock llm-factory (no real LLM needed) ───────────────────────────────────

const complete = vi.fn(async () => ({
  text: '',
  tool_calls: [
    {
      name: 'structured_output',
      input: {
        proposals: [
          {
            operation: 'tune-param',
            confidence: 'high',
            title: 'Bump retries',
            rationale: 'Recurs across runs.',
            diff: '- attempts: 1\n+ attempts: 3\n',
          },
        ],
      },
    },
  ],
}))

vi.mock('../src/llm-factory.js', () => ({
  resolveLLMProvider: vi.fn(() => 'anthropic'),
  defaultModelFor: vi.fn(() => 'claude-sonnet-4-6'),
  makeLLMClient: vi.fn(async () => ({ complete })),
}))

function makeLogger() {
  return pino({ level: 'silent' })
}

const EXPERIENCE_YAML = [
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
].join('\n')

function seedRun(dir: string, runId: string): void {
  const runsDir = join(dir, '.openexpertise', 'runs')
  mkdirSync(runsDir, { recursive: true })
  const events = [
    { type: 'run.started', run_id: runId },
    { type: 'node.finished', run_id: runId, node_id: 'inc' },
    { type: 'run.finished', run_id: runId, status: 'success' },
  ]
  writeFileSync(join(runsDir, `${runId}.jsonl`), events.map((e) => JSON.stringify(e)).join('\n'))
}

let dir: string
beforeEach(() => {
  complete.mockClear()
  dir = mkdtempSync(join(tmpdir(), 'oe-evolve-'))
  writeFileSync(join(dir, 'experience.yaml'), EXPERIENCE_YAML)
})
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

describe('evolveCommand — single-run (back-compat)', () => {
  it('writes <runId>.md and returns 0', async () => {
    seedRun(dir, 'r1')
    const { evolveCommand } = await import('../src/commands/evolve.js')
    const code = await evolveCommand({ experiencePath: dir, runId: 'r1', logger: makeLogger() })
    expect(code).toBe(0)
    const md = readFileSync(join(dir, '.openexpertise', 'evolution', 'r1.md'), 'utf8')
    expect(md).toContain('# Evolution Proposals for run `r1`')
    expect(md).toContain('Bump retries')
  })

  it('returns 1 when the run log is missing', async () => {
    const { evolveCommand } = await import('../src/commands/evolve.js')
    const code = await evolveCommand({ experiencePath: dir, runId: 'nope', logger: makeLogger() })
    expect(code).toBe(1)
  })
})

describe('evolveCommand — cross-run (--runs)', () => {
  it('writes a cross-run markdown file and returns 0', async () => {
    seedRun(dir, 'r1')
    seedRun(dir, 'r2')
    const { evolveCommand } = await import('../src/commands/evolve.js')
    const code = await evolveCommand({
      experiencePath: dir,
      runIds: ['r1', 'r2'],
      logger: makeLogger(),
    })
    expect(code).toBe(0)
    const evoDir = join(dir, '.openexpertise', 'evolution')
    const files = readdirSync(evoDir).filter((f) => f.startsWith('cross-run'))
    expect(files).toHaveLength(1)
    const md = readFileSync(join(evoDir, files[0]!), 'utf8')
    expect(md).toContain('# Cross-Run Evolution Proposals')
    expect(md).toContain('r1')
    expect(md).toContain('r2')
    expect(md).toContain('Bump retries')
  })

  it('returns 1 when none of the run logs exist', async () => {
    const { evolveCommand } = await import('../src/commands/evolve.js')
    const code = await evolveCommand({
      experiencePath: dir,
      runIds: ['x', 'y'],
      logger: makeLogger(),
    })
    expect(code).toBe(1)
  })

  it('returns 1 when neither runId nor runIds is provided', async () => {
    const { evolveCommand } = await import('../src/commands/evolve.js')
    const code = await evolveCommand({ experiencePath: dir, logger: makeLogger() })
    expect(code).toBe(1)
  })
})
