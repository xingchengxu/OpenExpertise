import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import pino from 'pino'
import type { AnalysisOutput, SynthesisOutput } from '@openexpertise/authoring'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// ─── Shared fixtures ─────────────────────────────────────────────────────────

const ANALYSIS: AnalysisOutput = {
  name: 'weekly-digest',
  description: 'Summarise merged PRs into a weekly digest.',
  phases: [{ id: 'load' }, { id: 'classify' }, { id: 'synthesize' }, { id: 'save' }],
  state_fields: [{ name: 'prs', type: 'array' }],
  node_sketches: [
    { id: 'load_prs', kind: 'tool', purpose: 'fetch PRs' },
    { id: 'classify_pr', kind: 'agent', purpose: 'classify one PR', fan_out_over: 'prs' },
    { id: 'synthesize_digest', kind: 'agent', purpose: 'write digest' },
    { id: 'write_digest', kind: 'tool', purpose: 'save to file' },
  ],
  open_questions: [
    "What's the PR source? (defaulting to a JSON fixture)",
    'Should the digest go to a file or Slack? (defaulting to file)',
  ],
}

const SYNTHESIS: SynthesisOutput = {
  experience_yaml: `name: weekly-digest
version: 0.1.0
state:
  schema:
    prs: { type: array }
graph:
  nodes:
    - id: load_prs
      kind: tool
      impl: ./tools/load_prs.mjs
      writes: [prs]
  edges: []
phases:
  - { id: load }
  - { id: classify }
  - { id: synthesize }
  - { id: save }
`,
  files: [
    {
      path: 'tools/load_prs.mjs',
      content: 'export default async function() { return { state_delta: { prs: [] } } }\n',
    },
    {
      path: 'tools/write_digest.mjs',
      content: 'export default async function() { return { state_delta: {} } }\n',
    },
    { path: 'prompts/classify_pr.md', content: '# Classify PR\n' },
    { path: 'prompts/synthesize_digest.md', content: '# Synthesize\n' },
    { path: 'README.md', content: '# weekly-digest\n' },
  ],
  next_steps: [
    'cd .openexpertise/drafts/weekly-digest',
    'Fill in tools/load_prs.mjs with real GitHub API calls',
    'oe run . to test the scaffold',
  ],
}

// ─── Mock @openexpertise/authoring ───────────────────────────────────────────

vi.mock('@openexpertise/authoring', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@openexpertise/authoring')>()
  return {
    ...actual,
    UltraExpertise: vi.fn(),
  }
})

// ─── Mock llm-factory (no real LLM needed) ───────────────────────────────────

vi.mock('../src/llm-factory.js', () => ({
  resolveLLMProvider: vi.fn(() => 'anthropic'),
  defaultModelFor: vi.fn(() => 'claude-sonnet-4-6'),
  makeLLMClient: vi.fn(async () => ({ complete: vi.fn() })),
}))

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeLogger() {
  return pino({ level: 'silent' })
}

function captureStdout(): { lines: string[]; restore: () => void } {
  const lines: string[] = []
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    lines.push(String(chunk))
    return true
  })
  return {
    lines,
    restore: () => spy.mockRestore(),
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ultraCommand — full run', () => {
  let tmp: string

  beforeEach(async () => {
    tmp = mkdtempSync(join(tmpdir(), 'oe-ultra-'))
    vi.clearAllMocks()

    const { UltraExpertise } = await import('@openexpertise/authoring')
    const mockAuthor = vi.fn(
      async (opts: { onPhase?: (e: unknown) => void; stopAfterAnalyze?: boolean }) => {
        // Fire onPhase events to simulate the real flow
        opts.onPhase?.({ phase: 'analyze', status: 'start' })
        opts.onPhase?.({ phase: 'analyze', status: 'done', duration_ms: 1234, result: ANALYSIS })
        if (opts.stopAfterAnalyze) {
          return { analysis: ANALYSIS, stopped: true }
        }
        opts.onPhase?.({ phase: 'synthesize', status: 'start' })
        opts.onPhase?.({
          phase: 'synthesize',
          status: 'done',
          duration_ms: 4567,
          result: SYNTHESIS,
        })
        return {
          analysis: ANALYSIS,
          synthesis: SYNTHESIS,
          draftDir: join(tmp, 'weekly-digest'),
          files_written: ['experience.yaml', ...SYNTHESIS.files.map((f) => f.path)],
          validation: { valid: true },
        }
      },
    )
    vi.mocked(UltraExpertise).mockImplementation(() => ({ author: mockAuthor }) as never)
  })

  afterEach(() => {
    if (tmp) rmSync(tmp, { recursive: true, force: true })
  })

  it('prints Phase 1/2 and Phase 2/2 progress lines', async () => {
    const { ultraCommand } = await import('../src/commands/ultra.js')
    const cap = captureStdout()
    await ultraCommand({ taskDescription: 'weekly digest', draftRoot: tmp, logger: makeLogger() })
    cap.restore()

    const all = cap.lines.join('')
    expect(all).toContain('Phase 1/2')
    expect(all).toContain('Phase 2/2')
  })

  it('prints the check ✓ character after each phase completes', async () => {
    const { ultraCommand } = await import('../src/commands/ultra.js')
    const cap = captureStdout()
    await ultraCommand({ taskDescription: 'weekly digest', draftRoot: tmp, logger: makeLogger() })
    cap.restore()

    const all = cap.lines.join('')
    expect(all).toContain('✓')
  })

  it('prints detected shape info (node count, phases)', async () => {
    const { ultraCommand } = await import('../src/commands/ultra.js')
    const cap = captureStdout()
    await ultraCommand({ taskDescription: 'weekly digest', draftRoot: tmp, logger: makeLogger() })
    cap.restore()

    const all = cap.lines.join('')
    expect(all).toContain('Detected shape')
    expect(all).toContain('4 nodes')
    expect(all).toContain('load → classify → synthesize → save')
  })

  it('prints synthesis.next_steps as a numbered list (not JSON)', async () => {
    const { ultraCommand } = await import('../src/commands/ultra.js')
    const cap = captureStdout()
    await ultraCommand({ taskDescription: 'weekly digest', draftRoot: tmp, logger: makeLogger() })
    cap.restore()

    const all = cap.lines.join('')
    // Should have numbered list items
    expect(all).toContain('1.')
    expect(all).toContain('2.')
    expect(all).toContain('3.')
    // Confirm the actual next_steps content from SYNTHESIS appears
    expect(all).toContain('Fill in tools/load_prs.mjs')
    // Should NOT be a raw JSON dump
    expect(all).not.toContain('"next_steps"')
  })

  it('prints Reference link', async () => {
    const { ultraCommand } = await import('../src/commands/ultra.js')
    const cap = captureStdout()
    await ultraCommand({ taskDescription: 'weekly digest', draftRoot: tmp, logger: makeLogger() })
    cap.restore()

    const all = cap.lines.join('')
    expect(all).toContain('Reference:')
    expect(all).toContain('authoring-ultra')
  })

  it('returns exit code 0 for a valid draft', async () => {
    const { ultraCommand } = await import('../src/commands/ultra.js')
    const cap = captureStdout()
    const code = await ultraCommand({
      taskDescription: 'weekly digest',
      draftRoot: tmp,
      logger: makeLogger(),
    })
    cap.restore()
    expect(code).toBe(0)
  })
})

describe('ultraCommand — validation failure path', () => {
  let tmp: string

  beforeEach(async () => {
    tmp = mkdtempSync(join(tmpdir(), 'oe-ultra-bad-'))
    vi.clearAllMocks()

    const { UltraExpertise } = await import('@openexpertise/authoring')
    const mockAuthor = vi.fn(
      async (opts: { onPhase?: (e: unknown) => void; stopAfterAnalyze?: boolean }) => {
        opts.onPhase?.({ phase: 'analyze', status: 'start' })
        opts.onPhase?.({ phase: 'analyze', status: 'done', duration_ms: 100, result: ANALYSIS })
        opts.onPhase?.({ phase: 'synthesize', status: 'start' })
        opts.onPhase?.({ phase: 'synthesize', status: 'done', duration_ms: 200, result: SYNTHESIS })
        return {
          analysis: ANALYSIS,
          synthesis: SYNTHESIS,
          draftDir: join(tmp, 'weekly-digest'),
          files_written: ['experience.yaml'],
          validation: {
            valid: false,
            errors: ['missing required field: version', 'state.schema must be an object'],
          },
        }
      },
    )
    vi.mocked(UltraExpertise).mockImplementation(() => ({ author: mockAuthor }) as never)
  })

  afterEach(() => {
    if (tmp) rmSync(tmp, { recursive: true, force: true })
  })

  it('prints validation error messages', async () => {
    const { ultraCommand } = await import('../src/commands/ultra.js')
    const cap = captureStdout()
    await ultraCommand({ taskDescription: 'broken', draftRoot: tmp, logger: makeLogger() })
    cap.restore()

    const all = cap.lines.join('')
    expect(all).toContain('missing required field: version')
    expect(all).toContain('state.schema must be an object')
  })

  it('prints actionable guidance to fix or re-run', async () => {
    const { ultraCommand } = await import('../src/commands/ultra.js')
    const cap = captureStdout()
    await ultraCommand({ taskDescription: 'broken', draftRoot: tmp, logger: makeLogger() })
    cap.restore()

    const all = cap.lines.join('')
    expect(all).toContain('fix manually')
    expect(all).toContain('re-run oe ultra')
  })

  it('returns exit code 2 on validation failure', async () => {
    const { ultraCommand } = await import('../src/commands/ultra.js')
    const cap = captureStdout()
    const code = await ultraCommand({
      taskDescription: 'broken',
      draftRoot: tmp,
      logger: makeLogger(),
    })
    cap.restore()
    expect(code).toBe(2)
  })
})

describe('ultraCommand — --dry-run flag', () => {
  let tmp: string

  beforeEach(async () => {
    tmp = mkdtempSync(join(tmpdir(), 'oe-ultra-dry-'))
    vi.clearAllMocks()

    const { UltraExpertise } = await import('@openexpertise/authoring')
    const mockAuthor = vi.fn(
      async (opts: { onPhase?: (e: unknown) => void; stopAfterAnalyze?: boolean }) => {
        opts.onPhase?.({ phase: 'analyze', status: 'start' })
        opts.onPhase?.({ phase: 'analyze', status: 'done', duration_ms: 1080, result: ANALYSIS })
        if (opts.stopAfterAnalyze) {
          return { analysis: ANALYSIS, stopped: true }
        }
        // Should never reach here in dry-run
        throw new Error('synthesize called unexpectedly in dry-run')
      },
    )
    vi.mocked(UltraExpertise).mockImplementation(() => ({ author: mockAuthor }) as never)
  })

  afterEach(() => {
    if (tmp) rmSync(tmp, { recursive: true, force: true })
  })

  it('prints Phase 1/2 but NOT Phase 2/2', async () => {
    const { ultraCommand } = await import('../src/commands/ultra.js')
    const cap = captureStdout()
    await ultraCommand({
      taskDescription: 'weekly digest',
      draftRoot: tmp,
      logger: makeLogger(),
      dryRun: true,
    })
    cap.restore()

    const all = cap.lines.join('')
    expect(all).toContain('Phase 1/2')
    expect(all).not.toContain('Phase 2/2')
  })

  it('prints Detected shape section', async () => {
    const { ultraCommand } = await import('../src/commands/ultra.js')
    const cap = captureStdout()
    await ultraCommand({
      taskDescription: 'weekly digest',
      draftRoot: tmp,
      logger: makeLogger(),
      dryRun: true,
    })
    cap.restore()

    const all = cap.lines.join('')
    expect(all).toContain('Detected shape')
    expect(all).toContain('weekly-digest')
    expect(all).toContain('load → classify → synthesize → save')
  })

  it('prints all nodes with kind', async () => {
    const { ultraCommand } = await import('../src/commands/ultra.js')
    const cap = captureStdout()
    await ultraCommand({
      taskDescription: 'weekly digest',
      draftRoot: tmp,
      logger: makeLogger(),
      dryRun: true,
    })
    cap.restore()

    const all = cap.lines.join('')
    expect(all).toContain('load_prs')
    expect(all).toContain('tool')
    expect(all).toContain('classify_pr')
    expect(all).toContain('agent')
  })

  it('prints open questions', async () => {
    const { ultraCommand } = await import('../src/commands/ultra.js')
    const cap = captureStdout()
    await ultraCommand({
      taskDescription: 'weekly digest',
      draftRoot: tmp,
      logger: makeLogger(),
      dryRun: true,
    })
    cap.restore()

    const all = cap.lines.join('')
    expect(all).toContain('Open questions')
    expect(all).toContain("What's the PR source")
  })

  it('prints dry-run notice and instructions to re-run without the flag', async () => {
    const { ultraCommand } = await import('../src/commands/ultra.js')
    const cap = captureStdout()
    await ultraCommand({
      taskDescription: 'weekly digest',
      draftRoot: tmp,
      logger: makeLogger(),
      dryRun: true,
    })
    cap.restore()

    const all = cap.lines.join('')
    expect(all).toContain('dry-run')
    expect(all).toContain('no files written')
    expect(all).toContain('re-run without --dry-run')
  })

  it('returns exit code 0 for dry-run', async () => {
    const { ultraCommand } = await import('../src/commands/ultra.js')
    const cap = captureStdout()
    const code = await ultraCommand({
      taskDescription: 'weekly digest',
      draftRoot: tmp,
      logger: makeLogger(),
      dryRun: true,
    })
    cap.restore()
    expect(code).toBe(0)
  })

  it('does NOT write any files in dry-run mode', async () => {
    const { ultraCommand } = await import('../src/commands/ultra.js')
    const cap = captureStdout()
    await ultraCommand({
      taskDescription: 'weekly digest',
      draftRoot: tmp,
      logger: makeLogger(),
      dryRun: true,
    })
    cap.restore()

    // The draft dir for 'weekly-digest' slug should not exist
    const draftDir = join(tmp, 'weekly-digest')
    const { existsSync } = await import('node:fs')
    expect(existsSync(draftDir)).toBe(false)
  })
})

describe('ultraCommand — default next-steps fallback', () => {
  let tmp: string

  beforeEach(async () => {
    tmp = mkdtempSync(join(tmpdir(), 'oe-ultra-fallback-'))
    vi.clearAllMocks()

    const synthNoNextSteps: SynthesisOutput = { ...SYNTHESIS, next_steps: [] }

    const { UltraExpertise } = await import('@openexpertise/authoring')
    const mockAuthor = vi.fn(async (opts: { onPhase?: (e: unknown) => void }) => {
      opts.onPhase?.({ phase: 'analyze', status: 'start' })
      opts.onPhase?.({ phase: 'analyze', status: 'done', duration_ms: 100, result: ANALYSIS })
      opts.onPhase?.({ phase: 'synthesize', status: 'start' })
      opts.onPhase?.({
        phase: 'synthesize',
        status: 'done',
        duration_ms: 200,
        result: synthNoNextSteps,
      })
      return {
        analysis: ANALYSIS,
        synthesis: synthNoNextSteps,
        draftDir: join(tmp, 'weekly-digest'),
        files_written: ['experience.yaml'],
        validation: { valid: true },
      }
    })
    vi.mocked(UltraExpertise).mockImplementation(() => ({ author: mockAuthor }) as never)
  })

  afterEach(() => {
    if (tmp) rmSync(tmp, { recursive: true, force: true })
  })

  it('falls back to static numbered checklist when synthesis.next_steps is empty', async () => {
    const { ultraCommand } = await import('../src/commands/ultra.js')
    const cap = captureStdout()
    await ultraCommand({ taskDescription: 'weekly digest', draftRoot: tmp, logger: makeLogger() })
    cap.restore()

    const all = cap.lines.join('')
    // Static fallback items
    expect(all).toContain('oe run')
    expect(all).toContain('oe inspect')
    // Numbered format
    expect(all).toContain('1.')
    expect(all).toContain('2.')
  })
})
