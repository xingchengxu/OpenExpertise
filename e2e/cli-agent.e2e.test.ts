import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseExperienceYaml } from '@openexpertise/schema'
import { DispatcherRegistry, EventBus, runExperience } from '@openexpertise/core'
import {
  CliAgentDispatcher,
  type SubprocessRunner,
  type SpawnSpec,
  type RunResult,
} from '@openexpertise/node-kinds-cli-agent'

class ScriptedRunner implements SubprocessRunner {
  public calls: Array<{ spec: SpawnSpec; cwd: string }> = []
  constructor(private outputs: Record<string, string>) {}
  async run(spec: SpawnSpec, opts: { timeoutMs: number; cwd: string }): Promise<RunResult> {
    this.calls.push({ spec, cwd: opts.cwd })
    const stdout = this.outputs[spec.cmd] ?? ''
    return { stdout, stderr: '', exitCode: 0, timedOut: false }
  }
}

const YAML = `
name: e2e-cli-agent
version: 0.1.0
state:
  schema:
    topic: { type: string }
    summary: { type: string }
    critique: { type: string }
graph:
  nodes:
    - id: summarize
      kind: cli-agent
      provider: claude-code
      prompt: "summarize {{topic}}"
      args: { topic: "caching" }
      writes: [summary]
    - id: critique
      kind: cli-agent
      provider: codex
      prompt: "critique {{summary}}"
      reads: [summary]
      writes: [critique]
  edges:
    - { from: summarize, to: critique }
`

let dir: string
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

describe('cli-agent end-to-end (mocked runner)', () => {
  it('runs two cli-agent nodes in sequence, state flows between them', async () => {
    dir = mkdtempSync(join(tmpdir(), 'oe-e2e-cli-'))
    writeFileSync(join(dir, 'experience.yaml'), YAML)
    mkdirSync(join(dir, '.openexpertise'), { recursive: true })

    const spec = parseExperienceYaml(YAML)
    const runner = new ScriptedRunner({
      claude: 'a three sentence summary about caching.',
      codex: 'the summary missed L1/L2 cache hierarchy.',
    })
    const dispatchers = new DispatcherRegistry()
    dispatchers.register(new CliAgentDispatcher({ runner }))

    const result = await runExperience({
      spec,
      experienceDir: dir,
      dispatchers,
      events: new EventBus(),
      args: {},
    })

    expect(result.status).toBe('success')
    expect(result.finalState.summary).toBe('a three sentence summary about caching.')
    expect(result.finalState.critique).toBe('the summary missed L1/L2 cache hierarchy.')

    // Verify the summarize node received the interpolated topic (run-level args
    // require `reads:` to flow into the prompt template).
    const claudeCall = runner.calls.find((c) => c.spec.cmd === 'claude')
    expect(claudeCall).toBeDefined()
    expect(claudeCall!.spec.args.some((a) => a.includes('caching'))).toBe(true)

    // Verify the critique node received the interpolated summary.
    const codexCall = runner.calls.find((c) => c.spec.cmd === 'codex')
    expect(codexCall).toBeDefined()
    expect(
      codexCall!.spec.args.some((a) => a.includes('a three sentence summary about caching.')),
    ).toBe(true)
  })
})
