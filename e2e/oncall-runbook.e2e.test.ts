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

const HERE = dirname(fileURLToPath(import.meta.url))

class ScriptedLLM implements LLMClient {
  async complete(opts: LLMCompleteOpts) {
    const prompt = opts.messages[0]?.content ?? ''
    if (prompt.includes('investigating an incident')) {
      return {
        text: '',
        tool_calls: [
          {
            name: 'structured_output',
            input: {
              findings: [
                { title: 'p99 latency spike', evidence: 'monitor #7421', impact: 'high' },
              ],
            },
          },
        ],
      }
    }
    if (prompt.includes('oncall triage assistant')) {
      return {
        text: '',
        tool_calls: [
          {
            name: 'structured_output',
            input: {
              prioritized_findings: [{ title: 'p99 latency spike', priority: 'P0' }],
            },
          },
        ],
      }
    }
    if (prompt.includes('one-page oncall summary')) {
      return {
        text: '',
        tool_calls: [
          { name: 'structured_output', input: { summary: '# Incident summary\n...\n' } },
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

describe('oncall-runbook end-to-end (mocked Anthropic)', () => {
  it('runs all 5 nodes and produces a summary', async () => {
    dir = mkdtempSync(join(tmpdir(), 'oe-e2e-oncall-'))
    const src = join(HERE, '..', 'examples', 'oncall-runbook')
    cpSync(src, dir, { recursive: true })

    const spec = parseExperienceYaml(readFileSync(join(dir, 'experience.yaml'), 'utf8'))
    const llm = new ScriptedLLM()
    const dispatchers = new DispatcherRegistry()
    dispatchers.register(new ToolDispatcher())
    dispatchers.register(new AgentDispatcher({ client: llm }))

    const result = await runExperience({
      spec,
      experienceDir: dir,
      dispatchers,
      events: new EventBus(),
      args: {},
    })

    expect(result.status).toBe('success')
    expect(Array.isArray(result.finalState.findings)).toBe(true)
    // 3 dimensions × 1 finding each = 3 findings.
    expect((result.finalState.findings as unknown[]).length).toBe(3)
    expect((result.finalState.prioritized_findings as unknown[]).length).toBe(1)
    expect(typeof result.finalState.summary).toBe('string')
    expect((result.finalState.summary as string).length).toBeGreaterThan(0)
  })
})
