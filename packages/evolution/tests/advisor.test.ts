import { describe, it, expect } from 'vitest'
import { EvolutionAdvisor } from '../src/index.js'
import type { LLMClient, LLMCompleteOpts } from '@openexpertise/core'
import type { ExperienceSpec } from '@openexpertise/schema'

class CannedLLM implements LLMClient {
  constructor(private proposals: unknown[]) {}
  async complete(_opts: LLMCompleteOpts) {
    return {
      text: '',
      tool_calls: [
        {
          name: 'structured_output',
          input: { proposals: this.proposals },
        },
      ],
    }
  }
}

const spec: ExperienceSpec = {
  name: 't',
  version: '0.1.0',
  state: { schema: { x: { type: 'string' } } },
  graph: { nodes: [{ id: 'a', kind: 'tool', impl: 'x' }], edges: [] },
}

describe('EvolutionAdvisor', () => {
  it('returns parsed proposals from the LLM response', async () => {
    const llm = new CannedLLM([
      {
        operation: 'tune-param',
        confidence: 'high',
        title: 'Bump retry attempts',
        rationale: 'Two transient failures observed.',
        diff: '- attempts: 1\n+ attempts: 3\n',
      },
    ])
    const advisor = new EvolutionAdvisor({ client: llm })
    const proposals = await advisor.analyze({
      experienceSpec: spec,
      experienceYamlSource: 'name: t\nversion: 0.1.0\n',
      runEvents: [{ type: 'run.started' }],
      stateDiff: [],
    })
    expect(proposals).toHaveLength(1)
    expect(proposals[0]?.operation).toBe('tune-param')
    expect(proposals[0]?.confidence).toBe('high')
  })

  it('renders markdown with diff blocks', async () => {
    const advisor = new EvolutionAdvisor({ client: new CannedLLM([]) })
    const md = advisor.renderMarkdown(
      [
        {
          operation: 'add-node',
          confidence: 'medium',
          title: 'Add licence-check',
          rationale: 'Findings touched 3rd-party deps; no licence node exists.',
          diff: '+ - id: licence_check\n+   kind: skill\n',
        },
      ],
      'run-123',
    )
    expect(md).toContain('# Evolution Proposals for run `run-123`')
    expect(md).toContain('## 1. Add licence-check _(add-node, confidence: medium)_')
    expect(md).toContain('```diff')
    expect(md).toContain('+ - id: licence_check')
  })

  it('renders an empty notice when no proposals', () => {
    const advisor = new EvolutionAdvisor({ client: new CannedLLM([]) })
    const md = advisor.renderMarkdown([], 'r')
    expect(md).toContain('_No proposals generated for this run._')
  })

  it('returns empty array when LLM did not call structured_output', async () => {
    const llm: LLMClient = {
      async complete() {
        return { text: 'just talking' }
      },
    }
    const advisor = new EvolutionAdvisor({ client: llm })
    const proposals = await advisor.analyze({
      experienceSpec: spec,
      experienceYamlSource: '',
      runEvents: [],
      stateDiff: [],
    })
    expect(proposals).toEqual([])
  })
})
