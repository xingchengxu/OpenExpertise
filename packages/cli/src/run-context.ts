import { DispatcherRegistry, EventBus, runExperience } from '@openexpertise/core'
import type { LLMClient } from '@openexpertise/core'
import { ToolDispatcher } from '@openexpertise/node-kinds-tool'
import { AgentDispatcher } from '@openexpertise/node-kinds-agent'
import { CliAgentDispatcher } from '@openexpertise/node-kinds-cli-agent'
import { SkillDispatcher } from '@openexpertise/node-kinds-skill'
import { DatasetDispatcher } from '@openexpertise/node-kinds-dataset'
import { ExperienceDispatcher } from '@openexpertise/node-kinds-experience'
import { makeLLMClient, resolveLLMProvider, defaultModelFor } from './llm-factory.js'

/**
 * Build the dispatcher registry + a lazy LLM proxy used to execute an
 * experience. Shared by `oe run` and `oe ultra --run` so the registry wiring
 * lives in exactly one place (DRY).
 *
 * The LLM provider is resolved eagerly so dispatchers know which default model
 * to send (Anthropic vs OpenAI model names). When no env var or flag is
 * configured we keep going with a fallback default — agent/skill dispatchers
 * won't fire for tool-only experiences like hello-tool, so the bogus default is
 * never used. SDK construction itself stays lazy via the proxy below, so a
 * missing key only surfaces when an agent/skill node actually runs.
 */
export function buildRunContext(opts: { llm?: string }): {
  dispatchers: DispatcherRegistry
  events: EventBus
} {
  const dispatchers = new DispatcherRegistry()
  dispatchers.register(new ToolDispatcher())

  let eagerProvider: ReturnType<typeof resolveLLMProvider> | null = null
  try {
    eagerProvider = resolveLLMProvider(opts.llm !== undefined ? { flag: opts.llm } : {})
  } catch (err) {
    if (opts.llm !== undefined) throw err // explicit --llm with missing/unknown value → surface
    // otherwise: no LLM configured; tolerable if no agent/skill nodes fire
  }
  const defaultModel = eagerProvider ? defaultModelFor(eagerProvider) : 'claude-sonnet-4-5'

  let cached: LLMClient | null = null
  const llm: LLMClient = {
    async complete(llmOpts) {
      if (!cached) {
        const provider =
          eagerProvider ?? resolveLLMProvider(opts.llm !== undefined ? { flag: opts.llm } : {})
        cached = await makeLLMClient(provider)
      }
      return cached.complete(llmOpts)
    },
  }
  dispatchers.register(new AgentDispatcher({ client: llm, defaultModel }))
  dispatchers.register(new SkillDispatcher({ client: llm, defaultModel }))

  dispatchers.register(new DatasetDispatcher())
  dispatchers.register(new ExperienceDispatcher({ runExperience }))
  dispatchers.register(new CliAgentDispatcher())

  const events = new EventBus()

  return { dispatchers, events }
}
