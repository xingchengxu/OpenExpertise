import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AgentDispatcher } from '../src/agent-dispatcher.js'
import type { LLMClient, LLMCompleteOpts, LLMCompleteResult } from '@openexpertise/core'
import { RunContext, StateStore, EventBus, DispatcherRegistry } from '@openexpertise/core'
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

describe('AgentDispatcher', () => {
  it('reads prompt file, interpolates args, calls LLMClient, writes text to single-field state', async () => {
    writeFileSync(join(dir, 'prompts/echo.md'), 'Say hi to {{name}}.')
    const llm = new FakeLLM(() => ({ text: 'hello Alice' }))
    const dispatcher = new AgentDispatcher({ client: llm })
    const node: AgentNodeSpec = {
      id: 'a',
      kind: 'agent',
      prompt: './prompts/echo.md',
      writes: ['summary'],
    }

    const impl = await dispatcher.resolve(node, ctx)
    const output = await dispatcher.run(
      impl,
      { state_view: {}, edge_inputs: {}, args: { name: 'Alice' } },
      ctx,
    )

    expect(llm.calls).toHaveLength(1)
    expect(llm.calls[0]?.messages[0]?.content).toBe('Say hi to Alice.')
    expect(output.state_delta).toEqual({ summary: 'hello Alice' })
  })

  it('throws when text mode is used with multiple write fields', async () => {
    writeFileSync(join(dir, 'prompts/p.md'), 'go')
    const llm = new FakeLLM(() => ({ text: 'whatever' }))
    const dispatcher = new AgentDispatcher({ client: llm })
    const node: AgentNodeSpec = {
      id: 'a',
      kind: 'agent',
      prompt: './prompts/p.md',
      writes: ['summary', 'score'],
    }
    const impl = await dispatcher.resolve(node, ctx)
    await expect(
      dispatcher.run(impl, { state_view: {}, edge_inputs: {}, args: {} }, ctx),
    ).rejects.toThrow(/single write field/i)
  })

  it('uses structured output via tool when schema is set', async () => {
    writeFileSync(join(dir, 'prompts/score.md'), 'Score it')
    const llm = new FakeLLM((opts) => {
      expect(opts.tools?.[0]?.name).toBe('structured_output')
      return {
        text: '',
        tool_calls: [{ name: 'structured_output', input: { score: 0.92 } }],
        stop_reason: 'tool_use',
      }
    })
    const dispatcher = new AgentDispatcher({ client: llm })
    const node: AgentNodeSpec = {
      id: 'a',
      kind: 'agent',
      prompt: './prompts/score.md',
      schema: {
        type: 'object',
        required: ['score'],
        properties: { score: { type: 'number' } },
      },
      writes: ['score'],
    }
    const impl = await dispatcher.resolve(node, ctx)
    const output = await dispatcher.run(impl, { state_view: {}, edge_inputs: {}, args: {} }, ctx)
    expect(output.state_delta).toEqual({ score: 0.92 })
  })

  it('errors when structured-output call violates schema', async () => {
    writeFileSync(join(dir, 'prompts/score.md'), 'Score it')
    const llm = new FakeLLM(() => ({
      text: '',
      tool_calls: [{ name: 'structured_output', input: { score: 'not-a-number' } }],
      stop_reason: 'tool_use',
    }))
    const dispatcher = new AgentDispatcher({ client: llm })
    const node: AgentNodeSpec = {
      id: 'a',
      kind: 'agent',
      prompt: './prompts/score.md',
      schema: { type: 'object', required: ['score'], properties: { score: { type: 'number' } } },
      writes: ['score'],
    }
    const impl = await dispatcher.resolve(node, ctx)
    await expect(
      dispatcher.run(impl, { state_view: {}, edge_inputs: {}, args: {} }, ctx),
    ).rejects.toThrow(/schema|score/i)
  })

  it('reports usage metrics from the LLM response', async () => {
    writeFileSync(join(dir, 'prompts/p.md'), 'hi')
    const llm = new FakeLLM(() => ({
      text: 'ok',
      usage: { input_tokens: 12, output_tokens: 5 },
    }))
    const dispatcher = new AgentDispatcher({ client: llm })
    const node: AgentNodeSpec = {
      id: 'a',
      kind: 'agent',
      prompt: './prompts/p.md',
      writes: ['summary'],
    }
    const impl = await dispatcher.resolve(node, ctx)
    const output = await dispatcher.run(impl, { state_view: {}, edge_inputs: {}, args: {} }, ctx)
    expect(output.metrics).toEqual({ tokens_in: 12, tokens_out: 5 })
  })
})
