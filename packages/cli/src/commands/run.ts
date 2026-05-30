import { readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { parseExperienceYaml } from '@openexpertise/schema'
import { runExperience } from '@openexpertise/core'
import { startTui } from '@openexpertise/tui'
import { resolveExperienceYaml } from './validate.js'
import { buildRunContext } from '../run-context.js'
import { printNextSteps } from '../output-helpers.js'
import type { Logger } from 'pino'

export interface RunOpts {
  path: string
  args: Record<string, unknown>
  logger: Logger
  tui: boolean
  evolve: boolean
  llm?: string
  concurrency?: number
}

export async function runCommand(opts: RunOpts): Promise<number> {
  const yamlPath = resolveExperienceYaml(opts.path)
  const source = readFileSync(yamlPath, 'utf8')
  const spec = parseExperienceYaml(source)
  const experienceDir = dirname(yamlPath)

  // Dispatcher registry + lazy LLM proxy live in buildRunContext (shared with
  // `oe ultra --run`). Behavior is identical to the inline wiring this replaced.
  const { dispatchers, events } = buildRunContext(opts.llm !== undefined ? { llm: opts.llm } : {})

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
      ...(opts.concurrency !== undefined ? { concurrency: opts.concurrency } : {}),
    })
    // Give the TUI a tick to render the final state, then unmount.
    await new Promise((r) => setTimeout(r, 100))
    tuiInstance.unmount()
    return result.status === 'success' ? 0 : 1
  }

  events.subscribe((e) => opts.logger.info(e, e.type))

  const result = await runExperience({
    spec,
    experienceDir,
    dispatchers,
    events,
    args: opts.args,
    ...(opts.concurrency !== undefined ? { concurrency: opts.concurrency } : {}),
  })
  opts.logger.info(
    { runId: result.runId, status: result.status, finalState: result.finalState },
    'run complete',
  )
  printNextSteps([
    `oe inspect ${result.runId} --experience ${experienceDir} --html -o report.html  — open a shareable run report`,
    `oe graph ${experienceDir}  — see the DAG as a Mermaid diagram`,
    `oe evolve ${result.runId} --experience ${experienceDir}  — ask the advisor what to improve`,
  ])

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
