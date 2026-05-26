import { readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { parseExperienceYaml } from '@openexpertise/schema'
import {
  DispatcherRegistry,
  EventBus,
  runExperience,
  type LLMClient,
} from '@openexpertise/core'
import { ToolDispatcher } from '@openexpertise/node-kinds-tool'
import { AgentDispatcher } from '@openexpertise/node-kinds-agent'
import { SkillDispatcher } from '@openexpertise/node-kinds-skill'
import { DatasetDispatcher } from '@openexpertise/node-kinds-dataset'
import { ExperienceDispatcher } from '@openexpertise/node-kinds-experience'
import { CliAgentDispatcher } from '@openexpertise/node-kinds-cli-agent'
import {
  makeLLMClient,
  resolveLLMProvider,
  defaultModelFor,
} from '@openexpertise/cli/llm-factory'
import { resolveExperienceYaml } from './validate-path.js'
import type { ToolHandler } from './types.js'

export const runTool: ToolHandler = {
  name: 'oe_run',
  description:
    'Execute an OpenExpertise experience. Returns { run_id, status, final_state }. ' +
    'Reuses the same lazy-LLM logic as the CLI: experiences without agent/skill nodes ' +
    'run without any LLM env var.',
  inputSchema: {
    type: 'object',
    required: ['experience_path'],
    properties: {
      experience_path: { type: 'string' },
      args: { type: 'object', description: 'Per-node args passed via RunContext (V1 caveat: not auto-propagated into node bundles)' },
      llm: { type: 'string', enum: ['anthropic', 'openai'], description: 'Optional LLM provider override' },
    },
  },
  async call(args) {
    const p = args['experience_path']
    if (typeof p !== 'string') throw new Error('experience_path is required')
    const yamlPath = resolveExperienceYaml(p)
    const source = readFileSync(yamlPath, 'utf8')
    const spec = parseExperienceYaml(source)
    const experienceDir = dirname(yamlPath)

    // Lazy LLM proxy — mirrors packages/cli/src/commands/run.ts
    const llmFlag = typeof args['llm'] === 'string' ? (args['llm'] as string) : undefined
    let eagerProvider: ReturnType<typeof resolveLLMProvider> | null = null
    try {
      eagerProvider = resolveLLMProvider(llmFlag !== undefined ? { flag: llmFlag } : {})
    } catch (err) {
      if (llmFlag !== undefined) throw err
    }
    const defaultModel = eagerProvider ? defaultModelFor(eagerProvider) : 'claude-sonnet-4-5'

    let cached: LLMClient | null = null
    const llm: LLMClient = {
      async complete(opts) {
        if (!cached) {
          const provider =
            eagerProvider ?? resolveLLMProvider(llmFlag !== undefined ? { flag: llmFlag } : {})
          cached = await makeLLMClient(provider)
        }
        return cached.complete(opts)
      },
    }

    const dispatchers = new DispatcherRegistry()
    dispatchers.register(new ToolDispatcher())
    dispatchers.register(new AgentDispatcher({ client: llm, defaultModel }))
    dispatchers.register(new SkillDispatcher({ client: llm, defaultModel }))
    dispatchers.register(new DatasetDispatcher())
    dispatchers.register(new ExperienceDispatcher({ runExperience }))
    dispatchers.register(new CliAgentDispatcher())

    const runArgs = (args['args'] as Record<string, unknown> | undefined) ?? {}
    const result = await runExperience({
      spec,
      experienceDir,
      dispatchers,
      events: new EventBus(),
      args: runArgs,
    })
    return {
      run_id: result.runId,
      status: result.status,
      final_state: result.finalState,
    }
  },
}
