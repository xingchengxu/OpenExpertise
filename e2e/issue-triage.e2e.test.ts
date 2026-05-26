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
    if (prompt.includes('Classify this GitHub issue')) {
      return {
        text: '',
        tool_calls: [
          {
            name: 'structured_output',
            input: { classification: { type: 'bug', severity: 'medium', area: 'auth' } },
          },
        ],
      }
    }
    if (prompt.includes('duplicates any of the similar')) {
      return {
        text: '',
        tool_calls: [
          {
            name: 'structured_output',
            input: { is_duplicate: true, duplicate_of: '901' },
          },
        ],
      }
    }
    if (prompt.includes('Propose labels')) {
      return {
        text: '',
        tool_calls: [
          {
            name: 'structured_output',
            input: { labels: ['type:bug', 'area:auth', 'severity:medium'] },
          },
        ],
      }
    }
    if (prompt.includes('most likely owner')) {
      return {
        text: '',
        tool_calls: [{ name: 'structured_output', input: { suggested_owner: '@security-team' } }],
      }
    }
    return { text: 'unknown prompt' }
  }
}

let dir: string
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

describe('issue-triage end-to-end (mocked Anthropic)', () => {
  it('classifies, dedups, labels, and suggests an owner', async () => {
    dir = mkdtempSync(join(tmpdir(), 'oe-e2e-triage-'))
    const src = join(HERE, '..', 'examples', 'issue-triage')
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
    expect(result.finalState.classification).toMatchObject({ type: 'bug', area: 'auth' })
    expect(result.finalState.is_duplicate).toBe(true)
    expect(result.finalState.duplicate_of).toBe('901')
    expect((result.finalState.labels as unknown[]).length).toBeGreaterThan(0)
    expect(result.finalState.suggested_owner).toBe('@security-team')
  })
})
