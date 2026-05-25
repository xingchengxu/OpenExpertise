import { readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { parseExperienceYaml } from '@openexpertise/schema'
import { DispatcherRegistry, EventBus, runExperience } from '@openexpertise/core'
import { ToolDispatcher } from '@openexpertise/node-kinds-tool'
import { AgentDispatcher, AnthropicLLMClient } from '@openexpertise/node-kinds-agent'
import { SkillDispatcher } from '@openexpertise/node-kinds-skill'
import { DatasetDispatcher } from '@openexpertise/node-kinds-dataset'
import { ExperienceDispatcher } from '@openexpertise/node-kinds-experience'
import { startTui } from '@openexpertise/tui'
import { resolveExperienceYaml } from './validate.js'
import type { Logger } from 'pino'

export interface RunOpts {
  path: string
  args: Record<string, unknown>
  logger: Logger
  tui: boolean
}

export async function runCommand(opts: RunOpts): Promise<number> {
  const yamlPath = resolveExperienceYaml(opts.path)
  const source = readFileSync(yamlPath, 'utf8')
  const spec = parseExperienceYaml(source)
  const experienceDir = dirname(yamlPath)

  const dispatchers = new DispatcherRegistry()
  dispatchers.register(new ToolDispatcher())

  // LLM-backed dispatchers share one Anthropic client. If ANTHROPIC_API_KEY is
  // absent, instantiation is deferred — the dispatchers throw only when actually
  // invoked, so experiences that don't use agent/skill nodes still work fine.
  let lazyClient: AnthropicLLMClient | undefined
  const getClient = (): AnthropicLLMClient => {
    if (!lazyClient) lazyClient = new AnthropicLLMClient()
    return lazyClient
  }
  // We register with a getter-based proxy so construction is lazy.
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

  if (opts.tui) {
    const tuiInstance = startTui({
      events,
      nodes: spec.graph.nodes.map((n) => ({
        id: n.id,
        ...(n.phase ? { phase: n.phase } : {}),
      })),
    })
    // Wait for the run to complete, then let the TUI flush.
    const result = await runExperience({ spec, experienceDir, dispatchers, events, args: opts.args })
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

  return result.status === 'success' ? 0 : 1
}
