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

class ScriptedLLM implements LLMClient {
  async complete(opts: LLMCompleteOpts) {
    const prompt = opts.messages[0]?.content ?? ''
    if (prompt.includes('You are a debugger')) {
      return {
        text: '',
        tool_calls: [
          {
            name: 'structured_output',
            input: {
              hypotheses: [
                {
                  id: 'h1',
                  text: 'Off-by-one in the upper bound check of validateUserId.',
                  confidence: 'high',
                  predicted_check: 'Read index.mjs:11 — check operator on MAX_USER_ID comparison.',
                },
                {
                  id: 'h2',
                  text: 'MAX_USER_ID is exported as the wrong constant value.',
                  confidence: 'low',
                  predicted_check: 'Read index.mjs:5 — confirm MAX_USER_ID is 1000.',
                },
              ],
            },
          },
        ],
      }
    }
    if (prompt.includes('diagnosis lead')) {
      return {
        text: '',
        tool_calls: [
          {
            name: 'structured_output',
            input: {
              diagnosis: {
                root_cause:
                  "validateUserId uses `id < MAX_USER_ID` where `id > MAX_USER_ID` was intended, rejecting the boundary value.",
                location: 'fixtures/buggy_repo/index.mjs:11',
                supported_hypothesis_id: 'h1',
              },
            },
          },
        ],
      }
    }
    return { text: 'unknown prompt' }
  }
}

class ScriptedRunner implements SubprocessRunner {
  public calls: Array<{ spec: SpawnSpec; cwd: string }> = []
  async run(spec: SpawnSpec, opts: { timeoutMs: number; cwd: string }): Promise<RunResult> {
    this.calls.push({ spec, cwd: opts.cwd })
    const prompt = spec.args.find((a) => typeof a === 'string' && a.length > 20) ?? ''
    if (prompt.includes('verifying a hypothesis')) {
      const idMatch = /Hypothesis \((h\d+)\)/.exec(prompt)
      const hypothesis_id = idMatch?.[1] ?? 'h1'
      const verdict = hypothesis_id === 'h1' ? 'supported' : 'refuted'
      return {
        stdout: JSON.stringify({
          check_results: [
            {
              hypothesis_id,
              evidence:
                hypothesis_id === 'h1'
                  ? 'index.mjs:11 uses < instead of >; boundary is rejected.'
                  : 'MAX_USER_ID is 1000 as expected.',
              verdict,
            },
          ],
        }),
        stderr: '',
        exitCode: 0,
        timedOut: false,
      }
    }
    if (prompt.includes('propose a fix') || prompt.includes('failing test has been diagnosed')) {
      return {
        stdout:
          'Changed `id < MAX_USER_ID` to `id > MAX_USER_ID` on line 11 of index.mjs. (mocked — fixture file unchanged in test mode)',
        stderr: '',
        exitCode: 0,
        timedOut: false,
      }
    }
    return { stdout: '', stderr: 'unknown', exitCode: 1, timedOut: false }
  }
}

let dir: string
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

describe('systematic-debugging end-to-end (mocked LLM + cli-agent)', () => {
  it('runs all phases; verify_fix correctly reports failure since the mock did not edit the fixture', async () => {
    dir = mkdtempSync(join(tmpdir(), 'oe-e2e-sysdbg-'))
    const src = join(HERE, '..', 'examples', 'systematic-debugging')
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
    const symptoms = result.finalState.symptoms as { exit_code: number; stderr: string }
    expect(typeof symptoms).toBe('object')
    expect(symptoms.exit_code).not.toBe(0)
    expect((result.finalState.hypotheses as unknown[]).length).toBe(2)
    expect((result.finalState.check_results as unknown[]).length).toBe(2)
    const diag = result.finalState.diagnosis as { root_cause: string; supported_hypothesis_id: string }
    expect(diag.supported_hypothesis_id).toBe('h1')
    expect(diag.root_cause).toMatch(/off-by-one|MAX_USER_ID|boundary/i)
    expect(typeof result.finalState.fix_proposal).toBe('string')
    expect((result.finalState.fix_proposal as string).length).toBeGreaterThan(0)
    expect(result.finalState.verification_status).toBe('failed')
  })
})
