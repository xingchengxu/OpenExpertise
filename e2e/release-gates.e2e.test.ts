import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, cpSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
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
import {
  CliAgentDispatcher,
  type SubprocessRunner,
  type SpawnSpec,
  type RunResult,
} from '@openexpertise/node-kinds-cli-agent'

const HERE = dirname(fileURLToPath(import.meta.url))

class ScriptedRunner implements SubprocessRunner {
  async run(_spec: SpawnSpec, _opts: { timeoutMs: number; cwd: string }): Promise<RunResult> {
    return {
      stdout: JSON.stringify({
        security_findings: [
          { title: 'SQL injection via f-string in search_users', severity: 'high' },
        ],
      }),
      stderr: '',
      exitCode: 0,
      timedOut: false,
    }
  }
}

class ScriptedLLM implements LLMClient {
  async complete(opts: LLMCompleteOpts) {
    const prompt = opts.messages[0]?.content ?? ''
    if (prompt.includes('release gate')) {
      return {
        text: '',
        tool_calls: [
          {
            name: 'structured_output',
            input: {
              decision: {
                ready_to_release: false,
                score: 0.8,
                blocking_issues: ['high-severity security finding', 'coverage regression'],
                recommendation: 'Fix SQL injection in search_users before release.',
              },
            },
          },
        ],
      }
    }
    return { text: 'unknown prompt' }
  }
}

let dir: string
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

describe('release-gates end-to-end (mocked)', () => {
  it('runs 4 scan nodes + score agent, produces no-release decision', async () => {
    dir = mkdtempSync(join(tmpdir(), 'oe-e2e-release-'))
    const src = join(HERE, '..', 'examples', 'release-gates')
    cpSync(src, dir, { recursive: true })

    const spec = parseExperienceYaml(readFileSync(join(dir, 'experience.yaml'), 'utf8'))
    const llm = new ScriptedLLM()
    const runner = new ScriptedRunner()
    const dispatchers = new DispatcherRegistry()
    dispatchers.register(new ToolDispatcher())
    dispatchers.register(new AgentDispatcher({ client: llm }))
    dispatchers.register(new CliAgentDispatcher({ runner }))

    const result = await runExperience({
      spec,
      experienceDir: dir,
      dispatchers,
      events: new EventBus(),
      args: {},
    })

    expect(result.status).toBe('success')
    // license_issues: tslib is 0BSD, not on the allow-list
    expect((result.finalState.license_issues as unknown[]).length).toBe(1)
    // breaking_changes: at least one BREAKING line in the changelog
    expect((result.finalState.breaking_changes as unknown[]).length).toBeGreaterThan(0)
    // coverage regression: delta_pct < 0
    expect((result.finalState.coverage_delta as { regression: boolean }).regression).toBe(true)
    // security_findings: scripted runner returned one high-severity finding
    expect((result.finalState.security_findings as unknown[]).length).toBe(1)
    // Final decision: not ready, with blocking issues
    const decision = result.finalState.decision as {
      ready_to_release: boolean
      blocking_issues: string[]
    }
    expect(decision.ready_to_release).toBe(false)
    expect(decision.blocking_issues.length).toBeGreaterThan(0)
  })
})
