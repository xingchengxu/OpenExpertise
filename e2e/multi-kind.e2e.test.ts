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
import { ToolDispatcher } from '@openexpertise/node-kinds-tool'
import { AgentDispatcher } from '@openexpertise/node-kinds-agent'
import { DatasetDispatcher } from '@openexpertise/node-kinds-dataset'
import { ExperienceDispatcher } from '@openexpertise/node-kinds-experience'

let dir: string
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

class CannedLLM implements LLMClient {
  public calls: LLMCompleteOpts[] = []
  async complete(opts: LLMCompleteOpts) {
    this.calls.push(opts)
    return { text: 'summarized: 3 rows seen', usage: { input_tokens: 5, output_tokens: 7 } }
  }
}

describe('multi-kind end-to-end (mocked Anthropic)', () => {
  it('runs dataset → tool → agent in sequence', async () => {
    dir = mkdtempSync(join(tmpdir(), 'oe-e2e-mk-'))
    mkdirSync(join(dir, 'data'), { recursive: true })
    mkdirSync(join(dir, 'tools'), { recursive: true })
    mkdirSync(join(dir, 'prompts'), { recursive: true })
    writeFileSync(join(dir, 'data/items.json'), JSON.stringify([{ v: 1 }, { v: 2 }, { v: 3 }]))
    writeFileSync(
      join(dir, 'tools/count.mjs'),
      `export default async (args) => ({ state_delta: { count: args._state.rows.length } })\n`,
    )
    writeFileSync(join(dir, 'prompts/summary.md'), 'There are {{count}} rows. Summarize.')
    writeFileSync(
      join(dir, 'experience.yaml'),
      [
        'name: mk',
        'version: 0.1.0',
        'state:',
        '  schema:',
        '    rows: { type: array, items: { type: object } }',
        '    count: { type: number }',
        '    summary: { type: string }',
        'graph:',
        '  nodes:',
        '    - id: load',
        '      kind: dataset',
        '      source: { type: file, uri: ./data/items.json, format: json }',
        '      writes: [rows]',
        '    - id: count',
        '      kind: tool',
        '      impl: ./tools/count.mjs',
        '      reads: [rows]',
        '      writes: [count]',
        '    - id: summarize',
        '      kind: agent',
        '      prompt: ./prompts/summary.md',
        '      reads: [count]',
        '      writes: [summary]',
        '  edges:',
        '    - { from: load,  to: count }',
        '    - { from: count, to: summarize }',
      ].join('\n'),
    )

    const spec = parseExperienceYaml(readFileSync(join(dir, 'experience.yaml'), 'utf8'))

    const llm = new CannedLLM()
    const dispatchers = new DispatcherRegistry()
    dispatchers.register(new ToolDispatcher())
    dispatchers.register(new AgentDispatcher({ client: llm }))
    dispatchers.register(new DatasetDispatcher())
    dispatchers.register(new ExperienceDispatcher({ runExperience }))

    const result = await runExperience({
      spec,
      experienceDir: dir,
      dispatchers,
      events: new EventBus(),
    })

    expect(result.status).toBe('success')
    expect(result.finalState.rows).toEqual([{ v: 1 }, { v: 2 }, { v: 3 }])
    expect(result.finalState.count).toBe(3)
    expect(result.finalState.summary).toBe('summarized: 3 rows seen')

    // Agent prompt should have interpolated `count` = 3
    expect(llm.calls[0]?.messages[0]?.content).toBe('There are 3 rows. Summarize.')
  })
})
