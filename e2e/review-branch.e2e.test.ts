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
  public calls: LLMCompleteOpts[] = []
  async complete(opts: LLMCompleteOpts) {
    this.calls.push(opts)
    const prompt = opts.messages[0]?.content ?? ''
    // Pattern-match by prompt content to return appropriate tool_calls.
    if (prompt.includes('reviewing dimension')) {
      return {
        text: '',
        tool_calls: [
          {
            name: 'structured_output',
            input: {
              findings: [{ title: 'sample bug', severity: 'high' }],
            },
          },
        ],
      }
    }
    if (prompt.includes('Adversarially verify')) {
      return {
        text: '',
        tool_calls: [
          { name: 'structured_output', input: { verified_findings: [{ is_real: true }] } },
        ],
      }
    }
    if (prompt.includes('compute a risk_score')) {
      return {
        text: '',
        tool_calls: [{ name: 'structured_output', input: { risk_score: 0.75 } }],
      }
    }
    return { text: 'unknown prompt' }
  }
}

let dir: string
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

describe('review-branch end-to-end (mocked Anthropic)', () => {
  it('runs all stages and produces a risk_score', async () => {
    dir = mkdtempSync(join(tmpdir(), 'oe-e2e-review-'))
    const src = join(HERE, '..', 'examples', 'review-branch')
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
      args: { pr_id: 'PR-1' },
    })

    expect(result.status).toBe('success')
    // 3 dimensions × 1 finding each = 3 findings; all verified is_real
    expect((result.finalState.findings as unknown[])?.length).toBe(3)
    expect((result.finalState.verified_findings as unknown[])?.length).toBe(3)
    expect(result.finalState.risk_score).toBe(0.75)
  })
})
