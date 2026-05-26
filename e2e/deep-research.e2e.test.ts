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
    if (prompt.includes('research lead')) {
      return {
        text: '',
        tool_calls: [
          {
            name: 'structured_output',
            input: {
              clarified_question:
                'In 2026, when does in-memory caching beat Redis for HTTP API response caching?',
            },
          },
        ],
      }
    }
    if (prompt.includes('research planner')) {
      return {
        text: '',
        tool_calls: [
          {
            name: 'structured_output',
            input: {
              research_plan: {
                rationale: 'Split technical trade-offs from current-vendor news.',
                parallelism_strategy: 'Claude for trade-offs, Gemini for recent benchmarks.',
              },
              claude_subqs: [
                { id: 'c1', text: 'Latency trade-offs', rationale: 'Established methodology.' },
              ],
              gemini_subqs: [{ id: 'g1', text: 'Redis 8 release news', rationale: 'Very recent.' }],
            },
          },
        ],
      }
    }
    if (prompt.includes('synthesis lead')) {
      return {
        text: '',
        tool_calls: [
          {
            name: 'structured_output',
            input: {
              cross_referenced: {
                executive_summary:
                  'In-memory caching beats Redis below a single-host cap; switch once you scale horizontally.',
                key_findings: [
                  {
                    claim:
                      'Single-host in-memory latency is sub-microsecond vs ~100us for local Redis.',
                    supporting_urls: ['https://example.com/c1'],
                  },
                  {
                    claim: 'Redis 8 ships with improved replication latency.',
                    supporting_urls: ['https://example.com/g1'],
                  },
                ],
                open_questions: ['How does TLS overhead change the Redis baseline in 2026?'],
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
  async run(spec: SpawnSpec, _opts: { timeoutMs: number; cwd: string }): Promise<RunResult> {
    if (spec.cmd === 'claude') {
      return {
        stdout: JSON.stringify({
          raw_findings: [
            {
              sub_question_id: 'c1',
              claim: 'Single-host in-memory beats Redis by ~100x at low scale.',
              evidence: 'Microbenchmark from a 2024 article.',
              url: 'https://example.com/c1',
            },
          ],
        }),
        stderr: '',
        exitCode: 0,
        timedOut: false,
      }
    }
    if (spec.cmd === 'gemini') {
      return {
        stdout: JSON.stringify({
          raw_findings: [
            {
              sub_question_id: 'g1',
              claim: 'Redis 8.0 launched 2026-02 with improved replication.',
              evidence: 'Redis Labs press release.',
              url: 'https://example.com/g1',
            },
          ],
        }),
        stderr: '',
        exitCode: 0,
        timedOut: false,
      }
    }
    return { stdout: '', stderr: 'unknown cmd', exitCode: 1, timedOut: false }
  }
}

let dir: string
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

describe('deep-research end-to-end (mocked)', () => {
  it('runs the full pipeline and produces a cross-referenced summary', async () => {
    dir = mkdtempSync(join(tmpdir(), 'oe-e2e-deep-'))
    const src = join(HERE, '..', 'examples', 'deep-research')
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
    expect(typeof result.finalState.clarified_question).toBe('string')
    expect((result.finalState.claude_subqs as unknown[])?.length).toBe(1)
    expect((result.finalState.gemini_subqs as unknown[])?.length).toBe(1)
    // 1 finding per for_each iteration × 2 iterations = 2 raw_findings
    expect((result.finalState.raw_findings as unknown[]).length).toBe(2)
    // Two unique URLs
    expect((result.finalState.citations as string[]).sort()).toEqual([
      'https://example.com/c1',
      'https://example.com/g1',
    ])
    // Cross-reference produced an executive_summary + key_findings
    const cr = result.finalState.cross_referenced as {
      executive_summary: string
      key_findings: unknown[]
      open_questions: string[]
    }
    expect(cr.executive_summary.length).toBeGreaterThan(0)
    expect(cr.key_findings.length).toBeGreaterThan(0)
    expect(cr.open_questions.length).toBeGreaterThan(0)
  })
})
