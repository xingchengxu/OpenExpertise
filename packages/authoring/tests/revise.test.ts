import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { LLMClient, LLMCompleteOpts } from '@openexpertise/core'
import { UltraExpertise } from '../src/ultra.js'
import { writeDraft, readDraft, PathTraversalError } from '../src/writer.js'
import type { AnalysisOutput, SynthesisOutput } from '../src/schemas.js'

class ScriptedLLM implements LLMClient {
  public calls: LLMCompleteOpts[] = []
  constructor(
    private analysis: AnalysisOutput,
    private synthesis: SynthesisOutput,
  ) {}
  async complete(opts: LLMCompleteOpts) {
    this.calls.push(opts)
    if (opts.system?.includes('SOP architect')) {
      return { text: '', tool_calls: [{ name: 'structured_output', input: this.analysis }] }
    }
    return { text: '', tool_calls: [{ name: 'structured_output', input: this.synthesis }] }
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

describe('author() persists an analysis.json sidecar without changing files_written', () => {
  let tmp: string
  afterEach(() => {
    if (tmp) rmSync(tmp, { recursive: true, force: true })
  })

  it('writes analysis.json beside experience.yaml but keeps files_written byte-for-byte', async () => {
    tmp = mkdtempSync(join(tmpdir(), 'oe-revise-sidecar-'))
    const llm = new ScriptedLLM(ANALYSIS, SYNTHESIS)
    const ultra = new UltraExpertise({ client: llm })
    const result = (await ultra.author({
      taskDescription: 'say hi',
      rootDir: tmp,
      maxRounds: 0,
    })) as { draftDir: string; files_written: string[] }

    // analysis.json exists on disk and round-trips the analysis
    const sidecarPath = join(result.draftDir, 'analysis.json')
    expect(existsSync(sidecarPath)).toBe(true)
    const loaded = JSON.parse(readFileSync(sidecarPath, 'utf8'))
    expect(loaded.name).toBe('hello-author')

    // files_written is UNCHANGED — analysis.json is NOT in it (ground truth)
    expect(result.files_written).toEqual(['experience.yaml', 'tools/greet.mjs', 'README.md'])
    expect(result.files_written).not.toContain('analysis.json')
  })
})

describe('readDraft', () => {
  let tmp: string
  afterEach(() => {
    if (tmp) rmSync(tmp, { recursive: true, force: true })
  })

  it('round-trips a writeDraft output, excluding analysis.json from files[]', async () => {
    tmp = mkdtempSync(join(tmpdir(), 'oe-readdraft-'))
    const written = await writeDraft({
      draftDir: join(tmp, 'd'),
      experienceYaml: SYNTHESIS.experience_yaml,
      files: SYNTHESIS.files,
    })
    // simulate the author()-written sidecar
    writeFileSync(join(written.draftDir, 'analysis.json'), JSON.stringify(ANALYSIS, null, 2))

    const r = readDraft(written.draftDir)
    expect(r.synthesis.experience_yaml).toBe(SYNTHESIS.experience_yaml)
    const paths = r.synthesis.files.map((f) => f.path).sort()
    expect(paths).toEqual(['README.md', 'tools/greet.mjs'])
    expect(paths).not.toContain('analysis.json') // sidecar excluded from files[]
    expect(r.analysis.name).toBe('hello-author') // analysis.json loaded as the analysis
    // supporting-file content round-trips
    expect(r.synthesis.files.find((f) => f.path === 'README.md')?.content).toBe('# hello-author\n')
  })

  it('falls back to a re-derived minimal analysis when analysis.json is absent', async () => {
    tmp = mkdtempSync(join(tmpdir(), 'oe-readdraft-fb-'))
    const written = await writeDraft({
      draftDir: join(tmp, 'd'),
      experienceYaml: SYNTHESIS.experience_yaml,
      files: SYNTHESIS.files,
    })
    const r = readDraft(written.draftDir) // no analysis.json on disk
    expect(r.analysis.name).toBe('hello-author') // derived from experience.yaml name
    expect(r.analysis.node_sketches.length).toBeGreaterThanOrEqual(1)
  })

  it('rejects a draftDir escaping via .. with PathTraversalError', () => {
    expect(() => readDraft('../../etc')).toThrow(PathTraversalError)
  })

  it('round-trips a deeply nested file (depth > 1) with forward-slash normalization', async () => {
    tmp = mkdtempSync(join(tmpdir(), 'oe-readdraft-deep-'))
    const written = await writeDraft({
      draftDir: join(tmp, 'd'),
      experienceYaml: SYNTHESIS.experience_yaml,
      files: [{ path: 'tools/sub/x.mjs', content: 'export default async () => ({ state_delta: {} })\n' }],
    })
    const r = readDraft(written.draftDir)
    const paths = r.synthesis.files.map((f) => f.path)
    expect(paths).toContain('tools/sub/x.mjs')
    expect(r.synthesis.files.find((f) => f.path === 'tools/sub/x.mjs')?.content).toBe(
      'export default async () => ({ state_delta: {} })\n',
    )
  })
})
