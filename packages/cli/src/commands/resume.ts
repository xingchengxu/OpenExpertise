import { readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseExperienceYaml } from '@openexpertise/schema'
import { DispatcherRegistry, EventBus, runExperience } from '@openexpertise/core'
import { ToolDispatcher } from '@openexpertise/node-kinds-tool'
import { AgentDispatcher, AnthropicLLMClient } from '@openexpertise/node-kinds-agent'
import { SkillDispatcher } from '@openexpertise/node-kinds-skill'
import { DatasetDispatcher } from '@openexpertise/node-kinds-dataset'
import { ExperienceDispatcher } from '@openexpertise/node-kinds-experience'
import type { Logger } from 'pino'

export interface ResumeOpts {
  experiencePath: string
  runId: string
  logger: Logger
}

export async function resumeCommand(opts: ResumeOpts): Promise<number> {
  const expDir = resolve(opts.experiencePath)
  const yamlPath = join(expDir, 'experience.yaml')
  if (!existsSync(yamlPath)) {
    opts.logger.error({ yamlPath }, 'experience.yaml not found')
    return 1
  }
  const spec = parseExperienceYaml(readFileSync(yamlPath, 'utf8'))

  const logPath = join(expDir, '.openexpertise', 'runs', `${opts.runId}.jsonl`)
  if (!existsSync(logPath)) {
    opts.logger.error({ logPath }, 'run log not found; cannot recover args')
    return 1
  }
  // Recover args from the first event (run.started carries args)
  const firstLine = readFileSync(logPath, 'utf8').split('\n')[0] ?? '{}'
  const firstEvent = JSON.parse(firstLine) as { args?: Record<string, unknown> }
  const args = firstEvent.args ?? {}

  const dispatchers = new DispatcherRegistry()
  dispatchers.register(new ToolDispatcher())
  let lazyClient: AnthropicLLMClient | undefined
  const getClient = (): AnthropicLLMClient => {
    if (!lazyClient) lazyClient = new AnthropicLLMClient()
    return lazyClient
  }
  dispatchers.register(
    new AgentDispatcher({
      get client() {
        return getClient()
      },
    } as any),
  )
  dispatchers.register(
    new SkillDispatcher({
      get client() {
        return getClient()
      },
    } as any),
  )
  dispatchers.register(new DatasetDispatcher())
  dispatchers.register(new ExperienceDispatcher({ runExperience }))

  const events = new EventBus()
  events.subscribe((e) => opts.logger.info(e, e.type))

  const result = await runExperience({
    spec,
    experienceDir: expDir,
    dispatchers,
    events,
    args,
    cache: true, // explicit
  })
  opts.logger.info(
    { runId: result.runId, status: result.status, originalRunId: opts.runId },
    'resume complete',
  )
  return result.status === 'success' ? 0 : 1
}
