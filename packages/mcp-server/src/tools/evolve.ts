import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { parseExperienceYaml } from '@openexpertise/schema'
import { StateStore, type LLMClient } from '@openexpertise/core'
import { EvolutionAdvisor } from '@openexpertise/evolution'
import {
  makeLLMClient,
  resolveLLMProvider,
  defaultModelFor,
} from '@openexpertise/cli/llm-factory'
import type { ToolHandler } from './types.js'

export const evolveTool: ToolHandler = {
  name: 'oe_evolve',
  description:
    'Generate evolution proposals for a prior run. ' +
    'Returns { proposal_md, proposal_count } — markdown is also written to ' +
    '.openexpertise/evolution/<run_id>.md.',
  inputSchema: {
    type: 'object',
    required: ['experience_path', 'run_id'],
    properties: {
      experience_path: { type: 'string' },
      run_id: { type: 'string' },
      llm: { type: 'string', enum: ['anthropic', 'openai'] },
    },
  },
  async call(args) {
    const p = args['experience_path']
    const runId = args['run_id']
    if (typeof p !== 'string') throw new Error('experience_path is required')
    if (typeof runId !== 'string') throw new Error('run_id is required')

    const dir = resolve(p)
    const yamlPath = join(dir, 'experience.yaml')
    if (!existsSync(yamlPath)) throw new Error(`experience.yaml not found at ${yamlPath}`)
    const yamlSource = readFileSync(yamlPath, 'utf8')
    const spec = parseExperienceYaml(yamlSource)

    const logPath = join(dir, '.openexpertise', 'runs', `${runId}.jsonl`)
    if (!existsSync(logPath)) throw new Error(`run log not found at ${logPath}`)
    const events = readFileSync(logPath, 'utf8')
      .trim()
      .split('\n')
      .filter((l) => l.length > 0)
      .map((l) => JSON.parse(l))

    // Compute state diff from history for this run
    const dbPath = join(dir, '.openexpertise', 'state.sqlite')
    const stateDiff: Array<{ field: string; before: unknown; after: unknown }> = []
    if (existsSync(dbPath)) {
      const store = new StateStore({ dbPath, spec })
      try {
        const fields = Object.keys(spec.state.schema)
        for (const f of fields) {
          const rows = store.history(f).filter((r) => r.run_id === runId)
          if (rows.length === 0) continue
          const first = rows[0]
          const last = rows[rows.length - 1]
          if (!first || !last) continue
          stateDiff.push({ field: f, before: first.value_old, after: last.value_new })
        }
      } finally {
        store.close()
      }
    }

    const llmFlag = typeof args['llm'] === 'string' ? (args['llm'] as string) : undefined
    const provider = resolveLLMProvider(llmFlag !== undefined ? { flag: llmFlag } : {})
    const model = defaultModelFor(provider)
    let cached: LLMClient | null = null
    const llm: LLMClient = {
      async complete(opts) {
        if (!cached) cached = await makeLLMClient(provider)
        return cached.complete(opts)
      },
    }

    const advisor = new EvolutionAdvisor({ client: llm, model })
    const proposals = await advisor.analyze({
      experienceSpec: spec,
      experienceYamlSource: yamlSource,
      runEvents: events,
      stateDiff,
    })
    const md = advisor.renderMarkdown(proposals, runId)
    const outDir = join(dir, '.openexpertise', 'evolution')
    mkdirSync(outDir, { recursive: true })
    writeFileSync(join(outDir, `${runId}.md`), md)
    return { proposal_md: md, proposal_count: proposals.length }
  },
}
