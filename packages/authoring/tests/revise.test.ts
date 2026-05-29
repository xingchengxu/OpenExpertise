import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { LLMClient, LLMCompleteOpts } from '@openexpertise/core'
import { UltraExpertise } from '../src/ultra.js'
import { writeDraft, readDraft, PathTraversalError } from '../src/writer.js'
import type { AnalysisOutput, SynthesisOutput, CritiqueOutput } from '../src/schemas.js'

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
      files: [
        { path: 'tools/sub/x.mjs', content: 'export default async () => ({ state_delta: {} })\n' },
      ],
    })
    const r = readDraft(written.draftDir)
    const paths = r.synthesis.files.map((f) => f.path)
    expect(paths).toContain('tools/sub/x.mjs')
    expect(r.synthesis.files.find((f) => f.path === 'tools/sub/x.mjs')?.content).toBe(
      'export default async () => ({ state_delta: {} })\n',
    )
  })
})

// Plan A's QueuedScriptedLLM convention: per-role response arrays + index.
class QueuedScriptedLLM implements LLMClient {
  public calls: LLMCompleteOpts[] = []
  private idx: Record<string, number> = { architect: 0, synthesizer: 0, critic: 0, reviser: 0 }
  constructor(
    private q: {
      analysis: AnalysisOutput[]
      synthesis: SynthesisOutput[]
      critique: Array<CritiqueOutput | null>
      revise: SynthesisOutput[]
    },
  ) {}
  private next<T>(role: string, arr: T[]): T {
    const i = Math.min(this.idx[role]!, arr.length - 1)
    this.idx[role]!++
    return arr[i]!
  }
  async complete(opts: LLMCompleteOpts) {
    this.calls.push(opts)
    const s = opts.system ?? ''
    if (s.includes('SOP architect'))
      return {
        text: '',
        tool_calls: [{ name: 'structured_output', input: this.next('architect', this.q.analysis) }],
      }
    if (s.includes('SOP critic')) {
      const c = this.next('critic', this.q.critique)
      if (c === null) return { text: 'no tool call' }
      return { text: '', tool_calls: [{ name: 'structured_output', input: c }] }
    }
    if (s.includes('SOP reviser'))
      return {
        text: '',
        tool_calls: [{ name: 'structured_output', input: this.next('reviser', this.q.revise) }],
      }
    return {
      text: '',
      tool_calls: [
        { name: 'structured_output', input: this.next('synthesizer', this.q.synthesis) },
      ],
    }
  }
}

const HIGH_FINDING: CritiqueOutput = {
  score: 60,
  findings: [
    {
      dimension: 'decomposition',
      severity: 'high',
      anchor: { node_id: 'greet' },
      evidence: 'x',
      fix: 'split it',
    },
  ],
}

// A reviser output that ADDS a second tool file + node (incremental edit on top of SYNTHESIS).
const REVISED_SYNTH: SynthesisOutput = {
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
    - id: greet2
      kind: tool
      phase: main
      impl: ./tools/greet2.mjs
      writes: [greeting]
  edges: []
phases:
  - { id: main }
`,
  files: [
    { path: 'tools/greet.mjs', content: SYNTHESIS.files[0]!.content },
    {
      path: 'tools/greet2.mjs',
      content: 'export default async function () { return { state_delta: {} } }\n',
    },
    { path: 'README.md', content: '# hello-author\n' },
  ],
  next_steps: [],
}

// Round-2 reviser output: builds on REVISED_SYNTH by adding a THIRD node, greet3.
// greet3 is an agent node with an inline `prompt` (prompt is inline TEXT, not a
// file-path — see preflight.ts), so it needs NO entry in files[] and stays
// preflight-clean. writes: [greeting] references the declared state field.
const REVISED_SYNTH_2: SynthesisOutput = {
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
    - id: greet2
      kind: tool
      phase: main
      impl: ./tools/greet2.mjs
      writes: [greeting]
    - id: greet3
      kind: agent
      phase: main
      prompt: Say hello a third time and write the greeting.
      writes: [greeting]
  edges: []
phases:
  - { id: main }
`,
  files: [
    { path: 'tools/greet.mjs', content: SYNTHESIS.files[0]!.content },
    {
      path: 'tools/greet2.mjs',
      content: 'export default async function () { return { state_delta: {} } }\n',
    },
    { path: 'README.md', content: '# hello-author\n' },
  ],
  next_steps: [],
}

describe('UltraExpertise.reviseDraft', () => {
  let tmp: string
  afterEach(() => {
    if (tmp) rmSync(tmp, { recursive: true, force: true })
  })

  async function seedDraft(): Promise<string> {
    tmp = mkdtempSync(join(tmpdir(), 'oe-revisedraft-'))
    const seedLlm = new ScriptedLLM(ANALYSIS, SYNTHESIS)
    const ultra = new UltraExpertise({ client: seedLlm })
    const r = (await ultra.author({ taskDescription: 'say hi', rootDir: tmp, maxRounds: 0 })) as {
      draftDir: string
    }
    return r.draftDir
  }

  it('applies feedback as an incremental edit and returns the success-only shape', async () => {
    const draftDir = await seedDraft()
    const llm = new QueuedScriptedLLM({
      analysis: [ANALYSIS],
      synthesis: [SYNTHESIS],
      critique: [HIGH_FINDING],
      revise: [REVISED_SYNTH],
    })
    const ultra = new UltraExpertise({ client: llm })
    const result = await ultra.reviseDraft({
      draftDir,
      feedback: 'add a second greet node',
      maxRounds: 1,
    })
    expect('stopped' in result).toBe(false) // success-only, never the stopped arm
    expect(result.validation.valid).toBe(true)
    expect(result.loop.rounds_run).toBeGreaterThanOrEqual(1)
    // incremental: untouched README.md is byte-identical
    const readme = readFileSync(join(draftDir, 'README.md'), 'utf8')
    expect(readme).toBe('# hello-author\n')
    // the targeted edit landed
    const written = readFileSync(join(draftDir, 'experience.yaml'), 'utf8')
    expect(written).toContain('greet2')
  })

  it('the user feedback reaches the reviser as a high-priority directive finding', async () => {
    const draftDir = await seedDraft()
    const llm = new QueuedScriptedLLM({
      analysis: [ANALYSIS],
      synthesis: [SYNTHESIS],
      critique: [{ score: 80, findings: [] }], // critic adds nothing; feedback must still steer
      revise: [REVISED_SYNTH],
    })
    const ultra = new UltraExpertise({ client: llm })
    await ultra.reviseDraft({ draftDir, feedback: 'add a second greet node', maxRounds: 1 })
    const reviseCall = llm.calls.find((c) => c.system?.includes('SOP reviser'))
    expect(reviseCall).toBeDefined()
    expect(reviseCall!.messages[0]!.content).toContain('add a second greet node')
  })

  it('prunes a tool file absent from the new files[] but never analysis.json', async () => {
    const draftDir = await seedDraft()
    // start with a draft that has tools/greet.mjs; reviser drops the tool, replacing
    // the greet node with an inline-prompt agent node (no impl file). A coherent draft:
    // the YAML no longer references the dropped tool, so it still preflights/validates
    // clean and wins keep-best — which is what lets the prune actually run.
    const DROPPED: SynthesisOutput = {
      experience_yaml: `name: hello-author
version: 0.1.0
state:
  schema:
    greeting: { type: string }
graph:
  nodes:
    - id: greet
      kind: agent
      phase: main
      prompt: Say hello and write the greeting.
      writes: [greeting]
  edges: []
phases:
  - { id: main }
`,
      files: [{ path: 'README.md', content: '# hello-author\n' }], // tools/greet.mjs removed
    }
    const llm = new QueuedScriptedLLM({
      analysis: [ANALYSIS],
      synthesis: [SYNTHESIS],
      critique: [HIGH_FINDING],
      revise: [DROPPED],
    })
    const ultra = new UltraExpertise({ client: llm })
    await ultra.reviseDraft({ draftDir, feedback: 'remove the greet tool', maxRounds: 1 })
    expect(existsSync(join(draftDir, 'tools/greet.mjs'))).toBe(false) // pruned
    expect(existsSync(join(draftDir, 'analysis.json'))).toBe(true) // never pruned
  })

  it('rejects a draftDir escaping via .. with PathTraversalError', async () => {
    const ultra = new UltraExpertise({ client: new ScriptedLLM(ANALYSIS, SYNTHESIS) })
    await expect(ultra.reviseDraft({ draftDir: '../../etc', feedback: 'x' })).rejects.toThrow(
      PathTraversalError,
    )
  })

  it('applies a valid user edit even when the critic gives a clean assessment (no findings)', async () => {
    const draftDir = await seedDraft()
    const llm = new QueuedScriptedLLM({
      analysis: [ANALYSIS],
      synthesis: [SYNTHESIS],
      critique: [{ score: 85, findings: [] }], // critic finds NOTHING wrong with the original
      revise: [REVISED_SYNTH], // but the user's directive still produces an edit
    })
    const ultra = new UltraExpertise({ client: llm })
    const result = await ultra.reviseDraft({
      draftDir,
      feedback: 'add a second greet node',
      maxRounds: 1,
    })
    expect(result.validation.valid).toBe(true)
    // the user's edit MUST land even though round-0 scored equally well:
    const written = readFileSync(join(draftDir, 'experience.yaml'), 'utf8')
    expect(written).toContain('greet2')
  })

  it('runs multiple rounds (maxRounds=2), accumulating edits', async () => {
    const draftDir = await seedDraft()
    const llm = new QueuedScriptedLLM({
      analysis: [ANALYSIS],
      synthesis: [SYNTHESIS],
      critique: [HIGH_FINDING, HIGH_FINDING],
      revise: [REVISED_SYNTH, REVISED_SYNTH_2], // round1 → greet2, round2 → greet3
    })
    const ultra = new UltraExpertise({ client: llm })
    const result = await ultra.reviseDraft({
      draftDir,
      feedback: 'keep adding greet nodes',
      maxRounds: 2,
    })
    expect(result.loop.rounds_run).toBe(2)
    expect(result.validation.valid).toBe(true)
    const written = readFileSync(join(draftDir, 'experience.yaml'), 'utf8')
    expect(written).toContain('greet3')
  })

  it('writes the original unchanged when the reviser throws (no valid revise)', async () => {
    const draftDir = await seedDraft()
    const before = readFileSync(join(draftDir, 'experience.yaml'), 'utf8')
    const llm: LLMClient = {
      async complete(opts: LLMCompleteOpts) {
        if (opts.system?.includes('SOP architect'))
          return { text: '', tool_calls: [{ name: 'structured_output', input: ANALYSIS }] }
        if (opts.system?.includes('SOP critic'))
          return { text: '', tool_calls: [{ name: 'structured_output', input: HIGH_FINDING }] }
        if (opts.system?.includes('SOP reviser')) return { text: 'no tool call' } // → revise() throws
        return { text: '', tool_calls: [{ name: 'structured_output', input: SYNTHESIS }] }
      },
    }
    const ultra = new UltraExpertise({ client: llm })
    const result = await ultra.reviseDraft({ draftDir, feedback: 'x', maxRounds: 1 })
    expect(result.validation.valid).toBe(true)
    expect(readFileSync(join(draftDir, 'experience.yaml'), 'utf8')).toBe(before) // unchanged
  })

  it('accepts a valid revise when the existing draft (round-0) is invalid', async () => {
    const draftDir = await seedDraft()
    // corrupt the on-disk draft so round-0 is invalid
    const yamlPath = join(draftDir, 'experience.yaml')
    writeFileSync(
      yamlPath,
      readFileSync(yamlPath, 'utf8').replace('writes: [greeting]', 'writes: [undeclared_field]'),
    )
    const llm = new QueuedScriptedLLM({
      analysis: [ANALYSIS],
      synthesis: [SYNTHESIS],
      critique: [HIGH_FINDING],
      revise: [REVISED_SYNTH], // valid
    })
    const ultra = new UltraExpertise({ client: llm })
    const result = await ultra.reviseDraft({ draftDir, feedback: 'fix and extend', maxRounds: 1 })
    expect(result.validation.valid).toBe(true) // recovered from invalid round-0
    expect(readFileSync(yamlPath, 'utf8')).toContain('greet2')
  })
})
