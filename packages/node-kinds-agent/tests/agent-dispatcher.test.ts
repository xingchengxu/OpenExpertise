import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AgentDispatcher } from '../src/agent-dispatcher.js'
import type { LLMClient, LLMCompleteOpts, LLMCompleteResult } from '@openexpertise/core'
import { RunContext, StateStore, EventBus, DispatcherRegistry, type RunEvent } from '@openexpertise/core'
import type { AgentNodeSpec, ExperienceSpec } from '@openexpertise/schema'

class FakeLLM implements LLMClient {
  public calls: LLMCompleteOpts[] = []
  constructor(private produce: (opts: LLMCompleteOpts) => LLMCompleteResult) {}
  async complete(opts: LLMCompleteOpts): Promise<LLMCompleteResult> {
    this.calls.push(opts)
    return this.produce(opts)
  }
}

const spec: ExperienceSpec = {
  name: 't',
  version: '0.1.0',
  state: { schema: { summary: { type: 'string' }, score: { type: 'number' } } },
  graph: { nodes: [], edges: [] },
}

let dir: string
let ctx: RunContext

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'oe-agent-'))
  mkdirSync(join(dir, 'prompts'), { recursive: true })
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

describe('AgentDispatcher emits node.activity + node.tokens', () => {
  it('emits activity transitions and a tokens event with usage from the LLM', async () => {
    const events = new EventBus()
    const captured: RunEvent[] = []
    events.subscribe((e) => captured.push(e))

    // Scripted LLM returns usage; the dispatcher should turn it into a node.tokens event.
    const llm = new FakeLLM(() => ({
      text: '',
      tool_calls: [{ name: 'structured_output', input: { result: 'hi' } }],
      usage: { input_tokens: 12, output_tokens: 7 },
    }))

    const store = new StateStore({ dbPath: join(dir, 'events-s.sqlite'), spec })
    const eventsCtx = new RunContext({
      runId: 'r2',
      spec,
      experienceDir: dir,
      store,
      events,
      dispatchers: new DispatcherRegistry(),
      args: {},
    })

    afterEach(() => {
      store.close()
    })

    writeFileSync(join(dir, 'prompts/evt.md'), 'Do something')
    const dispatcher = new AgentDispatcher({ client: llm })
    const node: AgentNodeSpec = {
      id: 'evt-node',
      kind: 'agent',
      prompt: './prompts/evt.md',
      schema: {
        type: 'object',
        required: ['result'],
        properties: { result: { type: 'string' } },
      },
      writes: ['summary'],
    }

    const impl = await dispatcher.resolve(node, eventsCtx)
    await dispatcher.run(impl, { state_view: {}, edge_inputs: {}, args: {} }, eventsCtx)

    store.close()

    // After running:
    const activities = captured.filter((e) => e.type === 'node.activity')
    expect(activities.length).toBeGreaterThanOrEqual(1)

    const tokens = captured.filter((e) => e.type === 'node.tokens')
    expect(tokens.length).toBe(1)
    expect(tokens[0]).toMatchObject({
      type: 'node.tokens',
      input_tokens: 12,
      output_tokens: 7,
    })
  })
})
