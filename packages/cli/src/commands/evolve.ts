import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseExperienceYaml, type ExperienceSpec } from '@openexpertise/schema'
import { StateStore } from '@openexpertise/core'
import type { LLMClient } from '@openexpertise/core'
import { EvolutionAdvisor } from '@openexpertise/evolution'
import { makeLLMClient, resolveLLMProvider, defaultModelFor } from '../llm-factory.js'
import type { Logger } from 'pino'

export interface EvolveOpts {
  experiencePath: string
  runId?: string
  runIds?: string[]
  logger: Logger
  llm?: string
}

interface RunInput {
  runEvents: unknown[]
  stateDiff: Array<{ field: string; before: unknown; after: unknown }>
}

/**
 * Read a single run's JSONL event log and compute its per-field state diff.
 * Returns null (and logs an error) if the run log is missing. The StateStore is
 * passed in so a single connection can be reused across many runs.
 */
function loadRunInput(
  dir: string,
  spec: ExperienceSpec,
  runId: string,
  store: StateStore | null,
  logger: Logger,
): RunInput | null {
  const logPath = join(dir, '.openexpertise', 'runs', `${runId}.jsonl`)
  if (!existsSync(logPath)) {
    logger.error({ logPath, runId }, 'run log not found')
    return null
  }
  const runEvents = readFileSync(logPath, 'utf8')
    .trim()
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l))

  const stateDiff: Array<{ field: string; before: unknown; after: unknown }> = []
  if (store) {
    for (const f of Object.keys(spec.state.schema)) {
      const rows = store.history(f).filter((r) => r.run_id === runId)
      if (rows.length === 0) continue
      const first = rows[0]
      const last = rows[rows.length - 1]
      if (!first || !last) continue
      stateDiff.push({ field: f, before: first.value_old, after: last.value_new })
    }
  }
  return { runEvents, stateDiff }
}

export async function evolveCommand(opts: EvolveOpts): Promise<number> {
  const runIds = opts.runIds && opts.runIds.length > 0 ? opts.runIds : null
  if (!runIds && !opts.runId) {
    opts.logger.error('oe evolve: provide a <run-id> or --runs a,b,c')
    return 1
  }

  const dir = resolve(opts.experiencePath)
  const yamlPath = join(dir, 'experience.yaml')
  if (!existsSync(yamlPath)) {
    opts.logger.error({ yamlPath }, 'experience.yaml not found')
    return 1
  }
  const yamlSource = readFileSync(yamlPath, 'utf8')
  const spec = parseExperienceYaml(yamlSource)

  // Resolve provider eagerly so the advisor sends a provider-appropriate model
  // name (Claude vs GPT). evolve always needs an LLM, so any resolution error
  // here surfaces immediately rather than being deferred.
  const provider = resolveLLMProvider(opts.llm !== undefined ? { flag: opts.llm } : {})
  const model = defaultModelFor(provider)

  let cached: LLMClient | null = null
  const llm: LLMClient = {
    async complete(llmOpts) {
      if (!cached) cached = await makeLLMClient(provider)
      return cached.complete(llmOpts)
    },
  }
  const advisor = new EvolutionAdvisor({ client: llm, model })

  // Open the StateStore once and reuse it for every run we analyze.
  const dbPath = join(dir, '.openexpertise', 'state.sqlite')
  const store = existsSync(dbPath) ? new StateStore({ dbPath, spec }) : null
  try {
    if (runIds) {
      // ── Cross-run path: surface STABLE patterns vs one-off blips ──────────
      const runs: Array<{
        runId: string
        runEvents: unknown[]
        stateDiff: Array<{ field: string; before: unknown; after: unknown }>
      }> = []
      for (const runId of runIds) {
        const input = loadRunInput(dir, spec, runId, store, opts.logger)
        if (input) runs.push({ runId, ...input })
      }
      if (runs.length === 0) {
        opts.logger.error({ runIds }, 'no readable run logs for cross-run analysis')
        return 1
      }
      const proposals = await advisor.analyzeAcrossRuns({
        experienceSpec: spec,
        experienceYamlSource: yamlSource,
        runs,
      })
      const usedIds = runs.map((r) => r.runId)
      const md = advisor.renderMarkdownCrossRun(proposals, usedIds)
      const outDir = join(dir, '.openexpertise', 'evolution')
      mkdirSync(outDir, { recursive: true })
      const safeName = `cross-run-${usedIds.length}runs-${usedIds[0]}.md`
      const outPath = join(outDir, safeName)
      writeFileSync(outPath, md)
      opts.logger.info(
        { outPath, runIds: usedIds, proposalCount: proposals.length },
        'cross-run evolution proposal written',
      )
      return 0
    }

    // ── Single-run path (unchanged behavior) ────────────────────────────────
    const runId = opts.runId!
    const input = loadRunInput(dir, spec, runId, store, opts.logger)
    if (!input) return 1
    const proposals = await advisor.analyze({
      experienceSpec: spec,
      experienceYamlSource: yamlSource,
      runEvents: input.runEvents,
      stateDiff: input.stateDiff,
    })
    const md = advisor.renderMarkdown(proposals, runId)
    const outDir = join(dir, '.openexpertise', 'evolution')
    mkdirSync(outDir, { recursive: true })
    const outPath = join(outDir, `${runId}.md`)
    writeFileSync(outPath, md)
    opts.logger.info({ outPath, proposalCount: proposals.length }, 'evolution proposal written')
    return 0
  } finally {
    store?.close()
  }
}
