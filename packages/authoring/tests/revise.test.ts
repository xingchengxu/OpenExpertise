import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
