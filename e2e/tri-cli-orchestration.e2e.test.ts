import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, cpSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseExperienceYaml } from '@openexpertise/schema'
import { DispatcherRegistry, EventBus, runExperience } from '@openexpertise/core'
import {
  CliAgentDispatcher,
  type SubprocessRunner,
  type SpawnSpec,
  type RunResult,
} from '@openexpertise/node-kinds-cli-agent'

const HERE = dirname(fileURLToPath(import.meta.url))

// Three rival CLIs, scripted to canned outputs so CI doesn't need
// real claude/codex/gemini on PATH. Each output reflects the actual
// real-run transcript captured during manual smoke (see README).
class TriCliRunner implements SubprocessRunner {
  public calls: Array<{ cmd: string; promptArg: string }> = []
  async run(spec: SpawnSpec, _opts: { timeoutMs: number; cwd: string }): Promise<RunResult> {
    // Every CLI takes the prompt as one of the args; capture for assertions.
    const promptArg = spec.args.find((a) => a.length > 50) ?? ''
    this.calls.push({ cmd: spec.cmd, promptArg })
    let stdout = ''
    if (spec.cmd === 'claude') {
      stdout =
        'In-memory caching strategies for HTTP APIs store frequently requested response data ' +
        'directly in application memory to reduce latency, lower backend load, and improve ' +
        'throughput, using techniques like time-based expiration, LRU eviction, and cache ' +
        'invalidation on writes.'
    } else if (spec.cmd === 'codex') {
      stdout =
        'It misses that in-memory caches are per-process, so horizontally scaled APIs can ' +
        'serve inconsistent or stale data across instances unless you add coordination or ' +
        'use a distributed cache.'
    } else if (spec.cmd === 'gemini') {
      stdout =
        'No; specify that in-memory caches are per-process, which can lead to data ' +
        'inconsistency across horizontally scaled API instances.'
    }
    return { stdout, stderr: '', exitCode: 0, timedOut: false }
  }
}

let dir: string
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

describe('tri-cli-orchestration end-to-end (scripted Claude+Codex+Gemini)', () => {
  it('chains three rival CLIs with state flowing between them', async () => {
    dir = mkdtempSync(join(tmpdir(), 'oe-e2e-tri-'))
    const src = join(HERE, '..', 'examples', 'tri-cli-orchestration')
    cpSync(src, dir, { recursive: true })

    const spec = parseExperienceYaml(readFileSync(join(dir, 'experience.yaml'), 'utf8'))
    const runner = new TriCliRunner()
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

    // All three rival CLIs were invoked in order.
    const cmds = runner.calls.map((c) => c.cmd)
    expect(cmds).toEqual(['claude', 'codex', 'gemini'])

    // State propagated: codex's prompt must contain claude's summary, and
    // gemini's prompt must contain both summary and critique.
    const codexCall = runner.calls.find((c) => c.cmd === 'codex')
    expect(codexCall?.promptArg).toContain('frequently requested response data')
    const geminiCall = runner.calls.find((c) => c.cmd === 'gemini')
    expect(geminiCall?.promptArg).toContain('frequently requested response data')
    expect(geminiCall?.promptArg).toContain('per-process')

    // Final state has all three fields populated.
    expect((result.finalState.summary as string).length).toBeGreaterThan(50)
    expect((result.finalState.critique as string).length).toBeGreaterThan(50)
    expect((result.finalState.verdict as string).length).toBeGreaterThan(20)
    expect(result.finalState.verdict).toMatch(/^No/)
  })
})
