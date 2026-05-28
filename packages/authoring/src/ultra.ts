import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv from 'ajv'
import type { LLMClient, LLMTool } from '@openexpertise/core'
import { parseExperienceYaml, validateExperienceSpec, ValidationError } from '@openexpertise/schema'
import {
  ANALYSIS_SCHEMA,
  SYNTHESIS_SCHEMA,
  type AnalysisOutput,
  type SynthesisOutput,
} from './schemas.js'
import { writeDraft, type WriteDraftResult } from './writer.js'
import { slugify } from './slug.js'

const HERE = dirname(fileURLToPath(import.meta.url))

export interface UltraExpertiseOpts {
  client: LLMClient
  model?: string
}

export interface UltraResult {
  analysis: AnalysisOutput
  synthesis: SynthesisOutput
}

export type PhaseEvent =
  | { phase: 'analyze'; status: 'start' }
  | { phase: 'analyze'; status: 'done'; duration_ms: number; result: AnalysisOutput }
  | { phase: 'synthesize'; status: 'start' }
  | { phase: 'synthesize'; status: 'done'; duration_ms: number; result: SynthesisOutput }

export class UltraExpertise {
  private readonly ajv = new Ajv({ allErrors: true, strict: false })
  private readonly validateAnalysis = this.ajv.compile(ANALYSIS_SCHEMA)
  private readonly validateSynthesis = this.ajv.compile(SYNTHESIS_SCHEMA)

  constructor(private readonly opts: UltraExpertiseOpts) {}

  async analyze(taskDescription: string): Promise<AnalysisOutput> {
    const systemPath = resolve(HERE, 'prompts/analyzer.md')
    const system = readFileSync(systemPath, 'utf8')
    const tool: LLMTool = {
      name: 'structured_output',
      description: 'Return the structured analysis matching the schema',
      input_schema: ANALYSIS_SCHEMA as unknown as Record<string, unknown>,
    }
    const result = await this.opts.client.complete({
      model: this.opts.model ?? 'claude-sonnet-4-6',
      system,
      messages: [{ role: 'user', content: taskDescription }],
      tools: [tool],
      max_tokens: 8192,
    })
    const call = result.tool_calls?.find((c) => c.name === 'structured_output')
    if (!call) {
      throw new Error('UltraExpertise.analyze: LLM did not return a structured_output tool call')
    }
    const data = call.input
    if (!this.validateAnalysis(data)) {
      const msgs = (this.validateAnalysis.errors ?? []).map(
        (e) => `${e.instancePath || '(root)'}: ${e.message ?? 'invalid'}`,
      )
      throw new Error(`UltraExpertise.analyze: AJV validation failed: ${msgs.join(', ')}`)
    }
    return data as AnalysisOutput
  }

  async synthesize(taskDescription: string, analysis: AnalysisOutput): Promise<SynthesisOutput> {
    const systemPath = resolve(HERE, 'prompts/synthesizer.md')
    const system = readFileSync(systemPath, 'utf8')
    const tool: LLMTool = {
      name: 'structured_output',
      description: 'Return the synthesized experience.yaml + supporting files',
      input_schema: SYNTHESIS_SCHEMA as unknown as Record<string, unknown>,
    }
    const userPayload = {
      task: taskDescription,
      analysis,
    }
    const result = await this.opts.client.complete({
      model: this.opts.model ?? 'claude-sonnet-4-6',
      system,
      messages: [{ role: 'user', content: JSON.stringify(userPayload, null, 2) }],
      tools: [tool],
      max_tokens: 16384,
    })
    const call = result.tool_calls?.find((c) => c.name === 'structured_output')
    if (!call) {
      throw new Error('UltraExpertise.synthesize: LLM did not return a structured_output tool call')
    }
    const data = call.input
    if (!this.validateSynthesis(data)) {
      const msgs = (this.validateSynthesis.errors ?? []).map(
        (e) => `${e.instancePath || '(root)'}: ${e.message ?? 'invalid'}`,
      )
      throw new Error(`UltraExpertise.synthesize: AJV validation failed: ${msgs.join(', ')}`)
    }
    return data as SynthesisOutput
  }

  async author(opts: {
    taskDescription: string
    rootDir: string
    draftSlug?: string
    stopAfterAnalyze?: boolean
    onPhase?: (event: PhaseEvent) => void
  }): Promise<
    | (UltraResult & WriteDraftResult & { validation: { valid: boolean; errors?: string[] } })
    | { analysis: AnalysisOutput; stopped: true }
  > {
    const { onPhase } = opts

    onPhase?.({ phase: 'analyze', status: 'start' })
    const t0 = Date.now()
    const analysis = await this.analyze(opts.taskDescription)
    onPhase?.({ phase: 'analyze', status: 'done', duration_ms: Date.now() - t0, result: analysis })

    if (opts.stopAfterAnalyze) {
      return { analysis, stopped: true }
    }

    onPhase?.({ phase: 'synthesize', status: 'start' })
    const t1 = Date.now()
    const synthesis = await this.synthesize(opts.taskDescription, analysis)
    onPhase?.({
      phase: 'synthesize',
      status: 'done',
      duration_ms: Date.now() - t1,
      result: synthesis,
    })

    const slug = opts.draftSlug ?? slugify(analysis.name)
    const draftDir = join(opts.rootDir, slug)
    const writeResult = await writeDraft({
      draftDir,
      experienceYaml: synthesis.experience_yaml,
      files: synthesis.files,
    })
    const validation = this.validateGeneratedYaml(synthesis.experience_yaml)
    return { analysis, synthesis, ...writeResult, validation }
  }

  private validateGeneratedYaml(source: string): { valid: boolean; errors?: string[] } {
    try {
      const spec = parseExperienceYaml(source)
      validateExperienceSpec(spec)
      return { valid: true }
    } catch (err) {
      if (err instanceof ValidationError) {
        return { valid: false, errors: err.errors.length > 0 ? err.errors : [err.message] }
      }
      return { valid: false, errors: [(err as Error).message] }
    }
  }
}
