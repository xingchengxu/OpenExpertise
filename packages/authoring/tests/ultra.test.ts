import { describe, it, expect, afterEach } from 'vitest'
import type { LLMClient, LLMCompleteOpts } from '@openexpertise/core'
import { UltraExpertise } from '../src/ultra.js'
import type { AnalysisOutput, SynthesisOutput } from '../src/schemas.js'

class ScriptedLLM implements LLMClient {
  public calls: LLMCompleteOpts[] = []
  constructor(
    private analysis: AnalysisOutput,
    private synthesis: SynthesisOutput,
  ) {}
  async complete(opts: LLMCompleteOpts) {
    this.calls.push(opts)
    // Phase 1: system contains "SOP architect" → return analysis
    if (opts.system?.includes('SOP architect')) {
      return {
        text: '',
        tool_calls: [{ name: 'structured_output', input: this.analysis }],
      }
    }
    // Phase 2: system contains "SOP synthesizer" → return synthesis
    return {
      text: '',
      tool_calls: [{ name: 'structured_output', input: this.synthesis }],
    }
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

describe('UltraExpertise', () => {
  it('phase 1 returns the analysis from the LLM', async () => {
    const llm = new ScriptedLLM(ANALYSIS, SYNTHESIS)
    const ultra = new UltraExpertise({ client: llm })
    const analysis = await ultra.analyze('say hi')
    expect(analysis.name).toBe('hello-author')
    expect(analysis.node_sketches[0]!.id).toBe('greet')
    // Phase 1 called once
    expect(llm.calls.length).toBe(1)
    expect(llm.calls[0]!.system).toContain('SOP architect')
  })

  it('phase 2 returns the synthesis from the LLM', async () => {
    const llm = new ScriptedLLM(ANALYSIS, SYNTHESIS)
    const ultra = new UltraExpertise({ client: llm })
    const synth = await ultra.synthesize('say hi', ANALYSIS)
    expect(synth.experience_yaml).toContain('hello-author')
    expect(synth.files).toHaveLength(2)
    expect(llm.calls.length).toBe(1)
    expect(llm.calls[0]!.system).toContain('SOP synthesizer')
  })

  it('throws when LLM response lacks the structured_output tool call', async () => {
    const llm: LLMClient = {
      async complete() {
        return { text: 'no tool call here' }
      },
    }
    const ultra = new UltraExpertise({ client: llm })
    await expect(ultra.analyze('x')).rejects.toThrow(/structured_output/i)
  })

  it('throws when analysis output fails AJV validation', async () => {
    const llm: LLMClient = {
      async complete() {
        return {
          text: '',
          tool_calls: [
            {
              name: 'structured_output',
              input: {
                name: 'BAD UPPER',
                description: 'x',
                phases: [],
                state_fields: [],
                node_sketches: [],
              },
            },
          ],
        }
      },
    }
    const ultra = new UltraExpertise({ client: llm })
    await expect(ultra.analyze('x')).rejects.toThrow(/validation/i)
  })
})

describe('UltraExpertise.critique', () => {
  it('returns AJV-valid findings, surfaces usage, and routes on the SOP critic marker', async () => {
    const llm: LLMClient = {
      async complete(opts) {
        expect(opts.system).toContain('SOP critic')
        return {
          text: '',
          tool_calls: [
            {
              name: 'structured_output',
              input: {
                score: 70,
                findings: [
                  {
                    dimension: 'decomposition',
                    severity: 'high',
                    anchor: { node_id: 'greet' },
                    evidence: 'no verifier',
                    fix: 'add a verifier',
                  },
                ],
              },
            },
          ],
          usage: { input_tokens: 11, output_tokens: 22 },
        }
      },
    }
    const ultra = new UltraExpertise({ client: llm })
    const { critique: c, usage } = await ultra.critique('say hi', ANALYSIS, SYNTHESIS, { ok: true, issues: [] }, { valid: true })
    expect(c).not.toBeNull()
    expect(c!.findings).toHaveLength(1)
    expect(usage).toEqual({ input_tokens: 11, output_tokens: 22 })
  })

  it('drops findings whose anchor is absent from the draft (post-filter)', async () => {
    const llm: LLMClient = {
      async complete() {
        return {
          text: '',
          tool_calls: [
            {
              name: 'structured_output',
              input: {
                score: 60,
                findings: [
                  { dimension: 'decomposition', severity: 'high', anchor: { node_id: 'ghost-node' }, evidence: 'x', fix: 'y' },
                ],
              },
            },
          ],
        }
      },
    }
    const ultra = new UltraExpertise({ client: llm })
    const { critique: c } = await ultra.critique('say hi', ANALYSIS, SYNTHESIS, { ok: true, issues: [] }, { valid: true })
    expect(c!.findings).toHaveLength(0)
  })

  it('drops findings whose anchor is empty ({}) — unverifiable → drop', async () => {
    const llm: LLMClient = {
      async complete() {
        return {
          text: '',
          tool_calls: [
            {
              name: 'structured_output',
              input: {
                score: 60,
                findings: [
                  { dimension: 'decomposition', severity: 'high', anchor: {}, evidence: 'x', fix: 'y' },
                ],
              },
            },
          ],
        }
      },
    }
    const ultra = new UltraExpertise({ client: llm })
    const { critique: c } = await ultra.critique('say hi', ANALYSIS, SYNTHESIS, { ok: true, issues: [] }, { valid: true })
    expect(c!.findings).toHaveLength(0)
  })

  it('fails soft (returns null critique) when there is no structured_output tool call', async () => {
    const llm: LLMClient = {
      async complete() {
        return { text: 'just prose, no tool call' }
      },
    }
    const ultra = new UltraExpertise({ client: llm })
    const { critique: c } = await ultra.critique('say hi', ANALYSIS, SYNTHESIS, { ok: true, issues: [] }, { valid: true })
    expect(c).toBeNull()
  })

  it('uses criticModel (when set) for the critique complete() call, not the base model', async () => {
    let seenModel = ''
    const llm: LLMClient = {
      async complete(opts) {
        seenModel = opts.model
        return { text: '', tool_calls: [{ name: 'structured_output', input: { score: 90, findings: [] } }] }
      },
    }
    const ultra = new UltraExpertise({ client: llm, model: 'base-model', criticModel: 'critic-model' })
    await ultra.critique('say hi', ANALYSIS, SYNTHESIS, { ok: true, issues: [] }, { valid: true })
    expect(seenModel).toBe('critic-model')
  })
})

import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('UltraExpertise.author end-to-end', () => {
  let tmp: string
  afterEach(() => {
    if (tmp) rmSync(tmp, { recursive: true, force: true })
  })

  it('runs analyze + synthesize + writeDraft and returns a draft path', async () => {
    tmp = mkdtempSync(join(tmpdir(), 'oe-author-'))
    const llm = new ScriptedLLM(ANALYSIS, SYNTHESIS)
    const ultra = new UltraExpertise({ client: llm })
    const result = await ultra.author({
      taskDescription: 'say hi',
      rootDir: tmp,
    })
    expect(result.analysis.name).toBe('hello-author')
    expect(result.synthesis.files).toHaveLength(2)
    expect(result.draftDir).toMatch(/hello-author$/)
    expect(result.files_written).toContain('experience.yaml')
    expect(result.validation.valid).toBe(true)
    // experience.yaml landed
    const yaml = readFileSync(join(result.draftDir, 'experience.yaml'), 'utf8')
    expect(yaml).toContain('hello-author')
  })

  it('reports validation errors but still writes the draft', async () => {
    tmp = mkdtempSync(join(tmpdir(), 'oe-author-bad-'))
    const badSynth = {
      ...SYNTHESIS,
      experience_yaml: `name: bad\n`, // missing version/state/graph → invalid
    }
    const llm = new ScriptedLLM(ANALYSIS, badSynth)
    const ultra = new UltraExpertise({ client: llm })
    const result = await ultra.author({
      taskDescription: 'say hi',
      rootDir: tmp,
    })
    expect(result.validation.valid).toBe(false)
    expect(result.validation.errors?.length ?? 0).toBeGreaterThan(0)
    // Files still written so user can inspect
    expect(result.files_written).toContain('experience.yaml')
  })
})
