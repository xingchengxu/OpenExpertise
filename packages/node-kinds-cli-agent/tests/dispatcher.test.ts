import { describe, it, expect } from 'vitest'
import { CliAgentDispatcher } from '../src/dispatcher.js'
import type { SubprocessRunner, SpawnSpec, RunResult } from '../src/runner.js'
import type { CliAgentNodeSpec } from '@openexpertise/schema'
import type { RunContext } from '@openexpertise/core'
import { EventBus, type RunEvent } from '@openexpertise/core'

class FakeRunner implements SubprocessRunner {
  public lastSpec: SpawnSpec | null = null
  public lastOpts: { timeoutMs: number; cwd: string } | null = null
  constructor(private scripted: RunResult) {}
  async run(spec: SpawnSpec, opts: { timeoutMs: number; cwd: string }) {
    this.lastSpec = spec
    this.lastOpts = opts
    return this.scripted
  }
}

// The CliAgentDispatcher reads ctx.experienceDir, ctx.runId, and ctx.events.
// Everything else is safely cast away. If the implementer finds RunContext requires more fields
// at compile time, add only what's strictly needed.
const ctx = {
  experienceDir: '/tmp/exp',
  runId: 'r1',
  events: new EventBus(),
} as unknown as RunContext

describe('CliAgentDispatcher', () => {
  it('kind is "cli-agent"', () => {
    const d = new CliAgentDispatcher({
      runner: new FakeRunner({ stdout: '', stderr: '', exitCode: 0, timedOut: false }),
    })
    expect(d.kind).toBe('cli-agent')
  })

  it('text mode: stdout maps to single writes field', async () => {
    const runner = new FakeRunner({
      stdout: 'the answer',
      stderr: '',
      exitCode: 0,
      timedOut: false,
    })
    const d = new CliAgentDispatcher({ runner })
    const node: CliAgentNodeSpec = {
      id: 'n1',
      kind: 'cli-agent',
      provider: 'claude-code',
      prompt: 'tell me',
      writes: ['answer'],
    }
    const impl = await d.resolve(node, ctx)
    const out = await d.run(impl, { state_view: {}, edge_inputs: {}, args: {} }, ctx)
    expect(out.state_delta).toEqual({ answer: 'the answer' })
    expect(runner.lastSpec?.cmd).toBe('claude')
    expect(runner.lastSpec?.args).toContain('--output-format')
  })

  it('json mode with schema: parses + validates', async () => {
    const runner = new FakeRunner({
      stdout: '{"findings":[{"title":"x","severity":"high"}]}',
      stderr: '',
      exitCode: 0,
      timedOut: false,
    })
    const d = new CliAgentDispatcher({ runner })
    const node: CliAgentNodeSpec = {
      id: 'n1',
      kind: 'cli-agent',
      provider: 'codex',
      prompt: 'review',
      output_format: 'json',
      writes: ['findings'],
      schema: {
        type: 'object',
        required: ['findings'],
        properties: { findings: { type: 'array' } },
      },
    }
    const impl = await d.resolve(node, ctx)
    const out = await d.run(impl, { state_view: {}, edge_inputs: {}, args: {} }, ctx)
    expect(out.state_delta).toEqual({ findings: [{ title: 'x', severity: 'high' }] })
  })

  it('interpolates {{placeholders}} from state_view into the prompt', async () => {
    const runner = new FakeRunner({ stdout: 'done', stderr: '', exitCode: 0, timedOut: false })
    const d = new CliAgentDispatcher({ runner })
    const node: CliAgentNodeSpec = {
      id: 'n1',
      kind: 'cli-agent',
      provider: 'gemini',
      prompt: 'review: {{diff}}',
      writes: ['report'],
    }
    const impl = await d.resolve(node, ctx)
    await d.run(impl, { state_view: { diff: 'PR-123' }, edge_inputs: {}, args: {} }, ctx)
    expect(runner.lastSpec?.args.some((a) => a.includes('PR-123'))).toBe(true)
  })

  it('subprocess non-zero exit code throws (so on_error policy applies)', async () => {
    const runner = new FakeRunner({
      stdout: '',
      stderr: 'boom',
      exitCode: 1,
      timedOut: false,
    })
    const d = new CliAgentDispatcher({ runner })
    const node: CliAgentNodeSpec = {
      id: 'n1',
      kind: 'cli-agent',
      provider: 'claude-code',
      prompt: 'x',
      writes: ['out'],
    }
    const impl = await d.resolve(node, ctx)
    await expect(d.run(impl, { state_view: {}, edge_inputs: {}, args: {} }, ctx)).rejects.toThrow(
      /exit code 1.*boom/s,
    )
  })

  it('timeout throws a specific error', async () => {
    const runner = new FakeRunner({
      stdout: '',
      stderr: '',
      exitCode: -1,
      timedOut: true,
    })
    const d = new CliAgentDispatcher({ runner })
    const node: CliAgentNodeSpec = {
      id: 'n1',
      kind: 'cli-agent',
      provider: 'claude-code',
      prompt: 'x',
      writes: ['out'],
      timeout_ms: 5000,
    }
    const impl = await d.resolve(node, ctx)
    await expect(d.run(impl, { state_view: {}, edge_inputs: {}, args: {} }, ctx)).rejects.toThrow(
      /timed out/i,
    )
  })

  it('respects workdir relative to experienceDir', async () => {
    const runner = new FakeRunner({ stdout: 'ok', stderr: '', exitCode: 0, timedOut: false })
    const d = new CliAgentDispatcher({ runner })
    const node: CliAgentNodeSpec = {
      id: 'n1',
      kind: 'cli-agent',
      provider: 'claude-code',
      prompt: 'x',
      workdir: './sub',
      writes: ['out'],
    }
    const impl = await d.resolve(node, ctx)
    await d.run(impl, { state_view: {}, edge_inputs: {}, args: {} }, ctx)
    expect(runner.lastOpts?.cwd).toMatch(/sub$/)
  })
})

describe('CliAgentDispatcher emits node.activity', () => {
  it('emits at least two activity events (spawn + parse)', async () => {
    const events = new EventBus()
    const captured: RunEvent[] = []
    events.subscribe((e) => captured.push(e))

    const runner = new FakeRunner({ stdout: 'ok', stderr: '', exitCode: 0, timedOut: false })
    const dispatcher = new CliAgentDispatcher({ runner })

    const node: CliAgentNodeSpec = {
      id: 'n1',
      kind: 'cli-agent',
      provider: 'claude-code',
      prompt: 'hi',
      writes: ['out'],
    }
    const ctx = { experienceDir: '/tmp/exp', runId: 'r1', events } as unknown as RunContext

    const impl = await dispatcher.resolve(node, ctx)
    await dispatcher.run(impl, { state_view: {}, edge_inputs: {}, args: {} }, ctx)

    const activities = captured.filter((e) => e.type === 'node.activity')
    expect(activities.length).toBeGreaterThanOrEqual(2)
    expect(activities.every((a) => a.node_id === 'n1')).toBe(true)
    // First activity mentions spawn / provider; final activity mentions parsing.
    expect(activities[0].activity.toLowerCase()).toMatch(/spawn|claude-code/)
    expect(activities[activities.length - 1].activity.toLowerCase()).toMatch(/parsing|output/)
  })
})
