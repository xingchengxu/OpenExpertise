import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseExperienceYaml } from '@openexpertise/schema'
import { StateStore } from '@openexpertise/core'
import type { LLMClient } from '@openexpertise/core'
import { EvolutionAdvisor } from '@openexpertise/evolution'
import { makeLLMClient, resolveLLMProvider } from '../llm-factory.js'
import type { Logger } from 'pino'

export interface EvolveOpts {
  experiencePath: string
  runId: string
  logger: Logger
  llm?: string
}

export async function evolveCommand(opts: EvolveOpts): Promise<number> {
  const dir = resolve(opts.experiencePath)
  const yamlPath = join(dir, 'experience.yaml')
  if (!existsSync(yamlPath)) {
    opts.logger.error({ yamlPath }, 'experience.yaml not found')
    return 1
  }
  const yamlSource = readFileSync(yamlPath, 'utf8')
  const spec = parseExperienceYaml(yamlSource)

  const logPath = join(dir, '.openexpertise', 'runs', `${opts.runId}.jsonl`)
  if (!existsSync(logPath)) {
    opts.logger.error({ logPath }, 'run log not found')
    return 1
  }
  const events = readFileSync(logPath, 'utf8')
    .trim()
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l))

  // Compute state diff from history for this run
  const dbPath = join(dir, '.openexpertise', 'state.sqlite')
  let stateDiff: Array<{ field: string; before: unknown; after: unknown }> = []
  if (existsSync(dbPath)) {
    const store = new StateStore({ dbPath, spec })
    try {
      const fields = Object.keys(spec.state.schema)
      for (const f of fields) {
        const rows = store.history(f).filter((r) => r.run_id === opts.runId)
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

  // Lazy: resolves provider + constructs client only on first complete() call.
  // Consistent with run.ts closure pattern for multi-provider support.
  let cached: LLMClient | null = null
  const llm: LLMClient = {
    async complete(llmOpts) {
      if (!cached) {
        const provider = resolveLLMProvider(opts.llm !== undefined ? { flag: opts.llm } : {})
        cached = await makeLLMClient(provider)
      }
      return cached.complete(llmOpts)
    },
  }
  const advisor = new EvolutionAdvisor({ client: llm })
  const proposals = await advisor.analyze({
    experienceSpec: spec,
    experienceYamlSource: yamlSource,
    runEvents: events,
    stateDiff,
  })
  const md = advisor.renderMarkdown(proposals, opts.runId)
  const outDir = join(dir, '.openexpertise', 'evolution')
  mkdirSync(outDir, { recursive: true })
  const outPath = join(outDir, `${opts.runId}.md`)
  writeFileSync(outPath, md)
  opts.logger.info({ outPath, proposalCount: proposals.length }, 'evolution proposal written')
  return 0
}
