import { resolve } from 'node:path'
import type { LLMClient } from '@openexpertise/core'
import { UltraExpertise } from '@openexpertise/authoring'
import { makeLLMClient, resolveLLMProvider, defaultModelFor } from '@openexpertise/cli/llm-factory'
import type { ToolHandler } from './types.js'

export const ultraReviseTool: ToolHandler = {
  name: 'oe_ultra_revise',
  description:
    'Apply natural-language feedback to an existing OpenExpertise draft. Reads the draft back, ' +
    'runs a steered critique→revise pass with the feedback as a high-priority directive, prunes ' +
    'stale files, writes the incremental result, and validates. ' +
    'Returns { draft_dir, analysis, synthesis, validation, files_written, loop }.',
  inputSchema: {
    type: 'object',
    required: ['draft_dir', 'feedback'],
    properties: {
      draft_dir: { type: 'string', description: 'Path to the existing draft directory' },
      feedback: { type: 'string', description: 'Natural-language directive for the revision' },
      max_rounds: {
        type: 'number',
        description: 'critique→revise rounds (default 1)',
      },
    },
  },
  async call(args) {
    const draftDir = args['draft_dir']
    if (typeof draftDir !== 'string') throw new Error('draft_dir is required')
    const feedback = args['feedback']
    if (typeof feedback !== 'string') throw new Error('feedback is required')

    const provider = resolveLLMProvider({})
    const model = defaultModelFor(provider)
    let cached: LLMClient | null = null
    const llm: LLMClient = {
      async complete(completeOpts) {
        if (!cached) cached = await makeLLMClient(provider)
        return cached.complete(completeOpts)
      },
    }

    const maxRounds =
      typeof args['max_rounds'] === 'number' ? (args['max_rounds'] as number) : undefined
    const criticModel = process.env['OE_ULTRA_CRITIC_MODEL']
    const ultra = new UltraExpertise({
      client: llm,
      model,
      ...(criticModel ? { criticModel } : {}),
    })
    const result = await ultra.reviseDraft({
      draftDir: resolve(draftDir),
      feedback,
      ...(maxRounds !== undefined ? { maxRounds } : {}),
    })
    return {
      draft_dir: result.draftDir,
      analysis: result.analysis,
      synthesis: {
        // omit file contents from MCP response — they're already on disk
        file_paths: result.synthesis.files.map((f: { path: string }) => f.path),
        next_steps: result.synthesis.next_steps ?? [],
      },
      validation: result.validation,
      files_written: result.files_written,
      loop: result.loop,
    }
  },
}
