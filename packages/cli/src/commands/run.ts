import { readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { parseExperienceYaml } from '@openexpertise/schema'
import { DispatcherRegistry, EventBus, runExperience } from '@openexpertise/core'
import { ToolDispatcher } from '@openexpertise/node-kinds-tool'
import { resolveExperienceYaml } from './validate.js'
import type { Logger } from 'pino'

export interface RunOpts {
  path: string
  args: Record<string, unknown>
  logger: Logger
}

export async function runCommand(opts: RunOpts): Promise<number> {
  const yamlPath = resolveExperienceYaml(opts.path)
  const source = readFileSync(yamlPath, 'utf8')
  const spec = parseExperienceYaml(source)
  const experienceDir = dirname(yamlPath)

  const dispatchers = new DispatcherRegistry()
  dispatchers.register(new ToolDispatcher())
  // Plan 2: register agent / skill / dataset / experience dispatchers here.

  const events = new EventBus()
  events.subscribe((e) => opts.logger.info(e, e.type))

  const result = await runExperience({ spec, experienceDir, dispatchers, events, args: opts.args })
  opts.logger.info(
    { runId: result.runId, status: result.status, finalState: result.finalState },
    'run complete',
  )

  return result.status === 'success' ? 0 : 1
}
