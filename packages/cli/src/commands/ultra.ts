import { resolve } from 'node:path'
import type { Logger } from 'pino'
import type { LLMClient } from '@openexpertise/core'
import { UltraExpertise } from '@openexpertise/authoring'
import { makeLLMClient, resolveLLMProvider, defaultModelFor } from '../llm-factory.js'

export interface UltraOpts {
  taskDescription: string
  draftRoot: string
  logger: Logger
  llm?: string
}

export async function ultraCommand(opts: UltraOpts): Promise<number> {
  const provider = resolveLLMProvider(opts.llm !== undefined ? { flag: opts.llm } : {})
  const model = defaultModelFor(provider)
  let cached: LLMClient | null = null
  const llm: LLMClient = {
    async complete(completeOpts) {
      if (!cached) cached = await makeLLMClient(provider)
      return cached.complete(completeOpts)
    },
  }

  const ultra = new UltraExpertise({ client: llm, model })
  const rootDir = resolve(opts.draftRoot)

  opts.logger.info({ task: opts.taskDescription }, 'ultraexpertise: starting analyze phase')
  const result = await ultra.author({
    taskDescription: opts.taskDescription,
    rootDir,
  })

  opts.logger.info(
    {
      slug: result.analysis.name,
      draftDir: result.draftDir,
      phases: result.analysis.phases.map((p) => p.id),
      nodes: result.analysis.node_sketches.map((n) => `${n.id}(${n.kind})`),
      open_questions: result.analysis.open_questions ?? [],
      files_written: result.files_written,
      valid: result.validation.valid,
      validation_errors: result.validation.errors ?? [],
      next_steps: result.synthesis.next_steps ?? [],
    },
    'ultraexpertise: draft created',
  )

  if (!result.validation.valid) {
    opts.logger.warn(
      { errors: result.validation.errors },
      'draft did not pass oe validate — inspect and fix before running',
    )
    return 2
  }

  opts.logger.info(
    {
      run: `oe run ${result.draftDir}`,
      promote: `mv ${result.draftDir} examples/${result.analysis.name}`,
    },
    'next: run or promote',
  )

  return 0
}
