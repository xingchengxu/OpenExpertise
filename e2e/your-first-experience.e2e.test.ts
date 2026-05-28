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

    if (prompt.includes('classifying merged pull requests')) {
      // Extract the PR number from the prompt using a regex
      const numberMatch = /Number: #(\d+)/.exec(prompt)
      const number = numberMatch ? parseInt(numberMatch[1], 10) : 0
      return {
        text: '',
        tool_calls: [
          {
            name: 'structured_output',
            input: {
              classified: [{ number, category: 'feature', summary: 'sample classification' }],
            },
          },
        ],
      }
    }

    if (prompt.includes('weekly engineering digest')) {
      return {
        text: '',
        tool_calls: [
          {
            name: 'structured_output',
            input: {
              digest: {
                headline: 'A productive week',
                bullets: [
                  'Scheduler now retries with exponential backoff on rate-limit responses.',
                  'Two CLI crashes are fixed: undefined state field and TUI scroll overflow.',
                  'HTML inspection report ships as a self-contained file with Mermaid graph.',
                  'Internal timeout handling is unified across all three dispatcher kinds.',
                  'Documentation and cookbook updated with retry recipe and animated demo.',
                ],
                by_category: { feature: 2, fix: 2, chore: 1, refactor: 1, docs: 2 },
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

describe('your-first-experience end-to-end (mocked LLM)', () => {
  it('loads 8 PRs, classifies each, synthesizes digest, and writes digest.md', async () => {
    dir = mkdtempSync(join(tmpdir(), 'oe-e2e-your-first-'))
    const src = join(HERE, '..', 'examples', 'your-first-experience')
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

    // prs: 8 entries loaded from fixture
    expect(Array.isArray(result.finalState.prs)).toBe(true)
    expect((result.finalState.prs as unknown[]).length).toBe(8)

    // classified: one entry per PR (8 total via for_each fan-out + array_append merge)
    expect(Array.isArray(result.finalState.classified)).toBe(true)
    expect((result.finalState.classified as unknown[]).length).toBe(8)

    // digest: headline + exactly 5 bullets
    const digest = result.finalState.digest as {
      headline: string
      bullets: string[]
      by_category: Record<string, number>
    }
    expect(digest).toBeDefined()
    expect(typeof digest.headline).toBe('string')
    expect(digest.headline.length).toBeGreaterThan(0)
    expect(Array.isArray(digest.bullets)).toBe(true)
    expect(digest.bullets.length).toBe(5)

    // digest_path ends with out/digest.md
    const digestPath = result.finalState.digest_path as string
    expect(typeof digestPath).toBe('string')
    expect(digestPath.endsWith('out/digest.md')).toBe(true)

    // the written file contains the headline and at least one bullet
    const written = readFileSync(digestPath, 'utf8')
    expect(written).toContain(digest.headline)
    expect(written).toContain(digest.bullets[0])
  })
})
