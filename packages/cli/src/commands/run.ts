import { readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { parseExperienceYaml } from '@openexpertise/schema'
import { DispatcherRegistry, EventBus, runExperience } from '@openexpertise/core'
import type { LLMClient } from '@openexpertise/core'
import { ToolDispatcher } from '@openexpertise/node-kinds-tool'
import { AgentDispatcher } from '@openexpertise/node-kinds-agent'
import { SkillDispatcher } from '@openexpertise/node-kinds-skill'
import { DatasetDispatcher } from '@openexpertise/node-kinds-dataset'
import { ExperienceDispatcher } from '@openexpertise/node-kinds-experience'
import { startTui } from '@openexpertise/tui'
import { resolveExperienceYaml } from './validate.js'
import { makeLLMClient, resolveLLMProvider } from '../llm-factory.js'
import type { Logger } from 'pino'

export interface RunOpts {
  path: string
  args: Record<string, unknown>
  logger: Logger
  tui: boolean
  evolve: boolean
  llm?: string
}

export async function runCommand(opts: RunOpts): Promise<number> {
  const yamlPath = resolveExperienceYaml(opts.path)
  const source = readFileSync(yamlPath, 'utf8')
  const spec = parseExperienceYaml(source)
  const experienceDir = dirname(yamlPath)

  const dispatchers = new DispatcherRegistry()
  dispatchers.register(new ToolDispatcher())

  // LLM-backed dispatchers share one client. Construction is deferred until the
  // first complete() call so that experiences without agent/skill nodes (e.g.
  // hello-tool) run fine without any LLM env var set.
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
  dispatchers.register(new AgentDispatcher({ client: llm }))
  dispatchers.register(new SkillDispatcher({ client: llm }))

  dispatchers.register(new DatasetDispatcher())
  dispatchers.register(new ExperienceDispatcher({ runExperience }))

  const events = new EventBus()

  if (opts.tui) {
    const tuiInstance = startTui({
      events,
      nodes: spec.graph.nodes.map((n) => ({
        id: n.id,
        ...(n.phase ? { phase: n.phase } : {}),
      })),
    })
    // Wait for the run to complete, then let the TUI flush.
    const result = await runExperience({
      spec,
      experienceDir,
      dispatchers,
      events,
      args: opts.args,
    })
    // Give the TUI a tick to render the final state, then unmount.
    await new Promise((r) => setTimeout(r, 100))
    tuiInstance.unmount()
    return result.status === 'success' ? 0 : 1
  }

  events.subscribe((e) => opts.logger.info(e, e.type))

  const result = await runExperience({ spec, experienceDir, dispatchers, events, args: opts.args })
  opts.logger.info(
    { runId: result.runId, status: result.status, finalState: result.finalState },
    'run complete',
  )

  // Plan 6: optional auto-evolve trigger
  if (opts.evolve && result.status === 'success') {
    try {
      const { evolveCommand } = await import('./evolve.js')
      await evolveCommand({
        experiencePath: experienceDir,
        runId: result.runId,
        logger: opts.logger,
      })
    } catch (err) {
      opts.logger.warn({ err: (err as Error).message }, 'evolve trigger failed (non-blocking)')
    }
  }

  return result.status === 'success' ? 0 : 1
}
