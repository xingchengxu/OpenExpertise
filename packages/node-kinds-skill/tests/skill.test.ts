import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SkillDispatcher, loadSkillFile } from '../src/index.js'
import type { LLMClient, LLMCompleteOpts } from '@openexpertise/core'
import { RunContext, StateStore, EventBus, DispatcherRegistry } from '@openexpertise/core'
import type { SkillNodeSpec, ExperienceSpec } from '@openexpertise/schema'

class FakeLLM implements LLMClient {
  public calls: LLMCompleteOpts[] = []
  async complete(opts: LLMCompleteOpts) {
    this.calls.push(opts)
    return { text: 'classified: greeting' }
  }
}

const spec: ExperienceSpec = {
  name: 't',
  version: '0.1.0',
  state: { schema: { label: { type: 'string' } } },
  graph: { nodes: [], edges: [] },
}

let dir: string
let ctx: RunContext

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'oe-skill-'))
  mkdirSync(join(dir, 'skills/classify'), { recursive: true })
  writeFileSync(
    join(dir, 'skills/classify/SKILL.md'),
    [
      '---',
      'name: classify',
      'description: Classifies user utterances',
      '---',
      '',
      '# Classify',
      '',
      'You receive a user message. Output one of: greeting, question, farewell.',
    ].join('\n'),
  )
  const store = new StateStore({ dbPath: join(dir, 's.sqlite'), spec })
  ctx = new RunContext({
    runId: 'r',
    spec,
    experienceDir: dir,
    store,
    events: new EventBus(),
    dispatchers: new DispatcherRegistry(),
    args: {},
  })
})

afterEach(() => {
  ctx.store.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('loadSkillFile', () => {
  it('parses SKILL.md frontmatter + body', () => {
    const skillPath = join(dir, 'skills/classify')
    const loaded = loadSkillFile(skillPath)
    expect(loaded.frontmatter.name).toBe('classify')
    expect(loaded.frontmatter.description).toBe('Classifies user utterances')
    expect(loaded.body).toContain('# Classify')
  })

  it('throws when SKILL.md is missing', () => {
    expect(() => loadSkillFile(join(dir, 'skills/nope'))).toThrow(/SKILL\.md/)
  })
})

describe('SkillDispatcher', () => {
  it('uses SKILL.md body as system prompt and inputs as user message', async () => {
    const llm = new FakeLLM()
    const dispatcher = new SkillDispatcher({ client: llm })
    const node: SkillNodeSpec = {
      id: 's',
      kind: 'skill',
      impl: './skills/classify',
      inputs: { utterance: 'hello there' },
      writes: ['label'],
    }
    const impl = await dispatcher.resolve(node, ctx)
    const output = await dispatcher.run(
      impl,
      { state_view: {}, edge_inputs: {}, args: { utterance: 'hello there' } },
      ctx,
    )

    expect(llm.calls).toHaveLength(1)
    expect(llm.calls[0]?.system).toContain('# Classify')
    expect(llm.calls[0]?.messages[0]?.content).toContain('hello there')
    expect(output.state_delta).toEqual({ label: 'classified: greeting' })
  })
})
