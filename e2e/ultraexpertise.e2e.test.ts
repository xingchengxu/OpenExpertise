import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { LLMClient, LLMCompleteOpts } from '@openexpertise/core'
import { UltraExpertise } from '@openexpertise/authoring'
import { parseExperienceYaml } from '@openexpertise/schema'
import { DispatcherRegistry, EventBus, runExperience } from '@openexpertise/core'
import { ToolDispatcher } from '@openexpertise/node-kinds-tool'

class CannedLLM implements LLMClient {
  constructor(
    private analysis: unknown,
    private synthesis: unknown,
  ) {}
  async complete(opts: LLMCompleteOpts) {
    if (opts.system?.includes('SOP architect')) {
      return { text: '', tool_calls: [{ name: 'structured_output', input: this.analysis }] }
    }
    return { text: '', tool_calls: [{ name: 'structured_output', input: this.synthesis }] }
  }
}

let dir: string
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

describe('ultraexpertise end-to-end', () => {
  it('authored draft is structurally valid and runnable', async () => {
    dir = mkdtempSync(join(tmpdir(), 'oe-e2e-ultra-'))
    const analysis = {
      name: 'e2e-author',
      description: 'A trivial generated SOP',
      phases: [{ id: 'main' }],
      state_fields: [{ name: 'greeting', type: 'string' }],
      node_sketches: [{ id: 'greet', kind: 'tool', phase: 'main', purpose: 'emit greeting' }],
    }
    const synthesis = {
      experience_yaml: `name: e2e-author
version: 0.1.0
state:
  schema:
    greeting: { type: string }
phases:
  - { id: main }
graph:
  nodes:
    - id: greet
      kind: tool
      phase: main
      impl: ./tools/greet.mjs
      writes: [greeting]
  edges: []
`,
      files: [
        {
          path: 'tools/greet.mjs',
          content: `export default async function () {
  return { state_delta: { greeting: 'hello from authored draft' } }
}
`,
        },
        { path: 'README.md', content: '# e2e-author\n' },
      ],
      next_steps: [],
    }

    const llm = new CannedLLM(analysis, synthesis)
    const ultra = new UltraExpertise({ client: llm })
    const result = await ultra.author({ taskDescription: 'greet', rootDir: dir })

    expect(result.validation.valid).toBe(true)
    expect(result.files_written).toContain('experience.yaml')
    expect(result.files_written).toContain('tools/greet.mjs')

    // The generated draft must actually be runnable end-to-end.
    const spec = parseExperienceYaml(readFileSync(join(result.draftDir, 'experience.yaml'), 'utf8'))
    const dispatchers = new DispatcherRegistry()
    dispatchers.register(new ToolDispatcher())
    const runResult = await runExperience({
      spec,
      experienceDir: result.draftDir,
      dispatchers,
      events: new EventBus(),
      args: {},
    })
    expect(runResult.status).toBe('success')
    expect(runResult.finalState.greeting).toBe('hello from authored draft')
  })
})
