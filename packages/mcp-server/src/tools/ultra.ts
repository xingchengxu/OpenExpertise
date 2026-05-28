import { resolve } from 'node:path'
import type { LLMClient } from '@openexpertise/core'
import { UltraExpertise } from '@openexpertise/authoring'
import { makeLLMClient, resolveLLMProvider, defaultModelFor } from '@openexpertise/cli/llm-factory'
import type { ToolHandler } from './types.js'

export const ultraTool: ToolHandler = {
  name: 'oe_ultra',
  description:
    'Author a new OpenExpertise experience from a natural-language task description. ' +
    'LLM analyzes the task, synthesizes experience.yaml + supporting files, writes them ' +
    'to a draft directory, and validates. Returns { draft_dir, slug, analysis, synthesis, validation }.',
  inputSchema: {
    type: 'object',
    required: ['task'],
    properties: {
      task: { type: 'string', description: 'Natural-language description of the SOP to author' },
      draft_root: {
        type: 'string',
        description: 'Directory for the draft (default: .openexpertise/drafts in CWD)',
      },
      llm: { type: 'string', enum: ['anthropic', 'openai'] },
    },
  },
  async call(args) {
    const task = args['task']
    if (typeof task !== 'string') throw new Error('task is required')
    const draftRoot =
      typeof args['draft_root'] === 'string' ? args['draft_root'] : resolve('.openexpertise/drafts')

    const llmFlag = typeof args['llm'] === 'string' ? (args['llm'] as string) : undefined
    const provider = resolveLLMProvider(llmFlag !== undefined ? { flag: llmFlag } : {})
    const model = defaultModelFor(provider)
    let cached: LLMClient | null = null
    const llm: LLMClient = {
      async complete(completeOpts) {
        if (!cached) cached = await makeLLMClient(provider)
        return cached.complete(completeOpts)
      },
    }

    const ultra = new UltraExpertise({ client: llm, model })
    const rawResult = await ultra.author({ taskDescription: task, rootDir: resolve(draftRoot) })
    // stopAfterAnalyze is not set, so result is always the full type.
    if ('stopped' in rawResult) throw new Error('unexpected dry-run result from mcp ultra tool')
    const result = rawResult
    return {
      draft_dir: result.draftDir,
      slug: result.analysis.name,
      analysis: result.analysis,
      synthesis: {
        // omit file contents from MCP response — they're already on disk
        file_paths: result.synthesis.files.map((f: { path: string }) => f.path),
        next_steps: result.synthesis.next_steps ?? [],
      },
      validation: result.validation,
      files_written: result.files_written,
    }
  },
}
