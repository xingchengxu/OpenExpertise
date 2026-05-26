import { describe, it, expect } from 'vitest'
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
    const llm: LLMClient = { async complete() { return { text: 'no tool call here' } } }
    const ultra = new UltraExpertise({ client: llm })
    await expect(ultra.analyze('x')).rejects.toThrow(/structured_output/i)
  })

  it('throws when analysis output fails AJV validation', async () => {
    const llm: LLMClient = {
      async complete() {
        return {
          text: '',
          tool_calls: [
            { name: 'structured_output', input: { name: 'BAD UPPER', description: 'x', phases: [], state_fields: [], node_sketches: [] } },
          ],
        }
      },
    }
    const ultra = new UltraExpertise({ client: llm })
    await expect(ultra.analyze('x')).rejects.toThrow(/validation/i)
  })
})
