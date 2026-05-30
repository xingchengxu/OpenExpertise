import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { parseExperienceYaml, type ExperienceSpec } from '@openexpertise/schema'
import { StateStore, type LLMClient } from '@openexpertise/core'
import { EvolutionAdvisor } from '@openexpertise/evolution'
import { makeLLMClient, resolveLLMProvider, defaultModelFor } from '@openexpertise/cli/llm-factory'
import type { ToolHandler } from './types.js'

interface RunInput {
  runEvents: unknown[]
  stateDiff: Array<{ field: string; before: unknown; after: unknown }>
}

/**
 * Read a single run's JSONL event log and compute its per-field state diff.
 * Throws if the run log is missing. The StateStore is passed in so a single
 * connection can be reused across many runs.
 */
function loadRunInput(
  dir: string,
  spec: ExperienceSpec,
  runId: string,
  store: StateStore | null,
): RunInput {
  const logPath = join(dir, '.openexpertise', 'runs', `${runId}.jsonl`)
  if (!existsSync(logPath)) throw new Error(`run log not found at ${logPath}`)
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

export const evolveTool: ToolHandler = {
  name: 'oe_evolve',
  description:
    'Generate evolution proposals for a prior run. Pass a single run_id, or run_ids ' +
    '(an array of ≥1 ids) for cross-run analysis that surfaces STABLE patterns across runs ' +
    'versus one-off blips. ' +
    'Returns { proposal_md, proposal_count } — markdown is also written to ' +
    '.openexpertise/evolution/<run_id>.md (single run) or ' +
    '.openexpertise/evolution/cross-run-*.md (cross-run).',
  inputSchema: {
    type: 'object',
    required: ['experience_path'],
    properties: {
      experience_path: { type: 'string' },
      run_id: { type: 'string', description: 'A single run id (single-run analysis)' },
      run_ids: {
        type: 'array',
        items: { type: 'string' },
        description: 'An array of ≥1 run ids for cross-run analysis (takes precedence over run_id)',
      },
      llm: { type: 'string', enum: ['anthropic', 'openai'] },
    },
  },
  async call(args) {
    const p = args['experience_path']
    if (typeof p !== 'string') throw new Error('experience_path is required')

    const rawRunIds = args['run_ids']
    const runIds =
      Array.isArray(rawRunIds) && rawRunIds.length > 0
        ? rawRunIds.map((id) => {
            if (typeof id !== 'string') throw new Error('run_ids must be an array of strings')
            return id
          })
        : null
    const runId = args['run_id']
    if (!runIds && typeof runId !== 'string') {
      throw new Error('provide run_id (a string) or run_ids (a non-empty array of strings)')
    }

    const dir = resolve(p)
    const yamlPath = join(dir, 'experience.yaml')
    if (!existsSync(yamlPath)) throw new Error(`experience.yaml not found at ${yamlPath}`)
    const yamlSource = readFileSync(yamlPath, 'utf8')
    const spec = parseExperienceYaml(yamlSource)

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

    // Open the StateStore once and reuse it for every run we analyze.
    const dbPath = join(dir, '.openexpertise', 'state.sqlite')
    const store = existsSync(dbPath) ? new StateStore({ dbPath, spec }) : null
    try {
      const outDir = join(dir, '.openexpertise', 'evolution')

      if (runIds) {
        // ── Cross-run path: surface STABLE patterns vs one-off blips ──────────
        const runs = runIds.map((id) => ({ runId: id, ...loadRunInput(dir, spec, id, store) }))
        const proposals = await advisor.analyzeAcrossRuns({
          experienceSpec: spec,
          experienceYamlSource: yamlSource,
          runs,
        })
        const usedIds = runs.map((r) => r.runId)
        const md = advisor.renderMarkdownCrossRun(proposals, usedIds)
        mkdirSync(outDir, { recursive: true })
        writeFileSync(join(outDir, `cross-run-${usedIds.length}runs-${usedIds[0]}.md`), md)
        return { proposal_md: md, proposal_count: proposals.length }
      }

      // ── Single-run path (unchanged behavior) ────────────────────────────────
      const input = loadRunInput(dir, spec, runId as string, store)
      const proposals = await advisor.analyze({
        experienceSpec: spec,
        experienceYamlSource: yamlSource,
        runEvents: input.runEvents,
        stateDiff: input.stateDiff,
      })
      const md = advisor.renderMarkdown(proposals, runId as string)
      mkdirSync(outDir, { recursive: true })
      writeFileSync(join(outDir, `${runId as string}.md`), md)
      return { proposal_md: md, proposal_count: proposals.length }
    } finally {
      store?.close()
    }
  },
}
