import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseExperienceYaml } from '@openexpertise/schema'
import {
  DispatcherRegistry,
  EventBus,
  runExperience,
  type LLMClient,
  type LLMCompleteOpts,
} from '@openexpertise/core'
import { AgentDispatcher } from '@openexpertise/node-kinds-agent'

class CountingLLM implements LLMClient {
  public calls = 0
  async complete(_opts: LLMCompleteOpts) {
    this.calls++
    return { text: 'cached-ok' }
  }
}

let dir: string
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

describe('Cache + resume', () => {
  it('second run replays from cache without invoking the LLM', async () => {
    dir = mkdtempSync(join(tmpdir(), 'oe-e2e-cache-'))
    mkdirSync(join(dir, 'prompts'), { recursive: true })
    writeFileSync(join(dir, 'prompts/p.md'), 'hi')
    writeFileSync(
      join(dir, 'experience.yaml'),
      [
        'name: c',
        'version: 0.1.0',
        'state:',
        '  schema:',
        '    out: { type: string }',
        'graph:',
        '  nodes:',
        '    - id: greet',
        '      kind: agent',
        '      prompt: ./prompts/p.md',
        '      writes: [out]',
        '  edges: []',
      ].join('\n'),
    )

    const spec = parseExperienceYaml(readFileSync(join(dir, 'experience.yaml'), 'utf8'))
    const llm = new CountingLLM()
    const dispatchers = new DispatcherRegistry()
    dispatchers.register(new AgentDispatcher({ client: llm }))

    // Run 1: cold cache
    const r1 = await runExperience({
      spec,
      experienceDir: dir,
      dispatchers,
      events: new EventBus(),
      args: {},
    })
    expect(r1.status).toBe('success')
    expect(r1.finalState.out).toBe('cached-ok')
    expect(llm.calls).toBe(1)

    // Run 2: cache hit
    const r2 = await runExperience({
      spec,
      experienceDir: dir,
      dispatchers,
      events: new EventBus(),
      args: {},
    })
    expect(r2.status).toBe('success')
    expect(r2.finalState.out).toBe('cached-ok')
    expect(llm.calls).toBe(1) // still 1 — cache replayed
  })
})
