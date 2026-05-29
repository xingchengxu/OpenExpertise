import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv from 'ajv'
import type { LLMClient, LLMTool, LLMUsage } from '@openexpertise/core'
import { parseExperienceYaml, validateExperienceSpec, ValidationError } from '@openexpertise/schema'
import {
  ANALYSIS_SCHEMA,
  SYNTHESIS_SCHEMA,
  CRITIQUE_SCHEMA,
  type AnalysisOutput,
  type SynthesisOutput,
  type CritiqueOutput,
  type CritiqueFinding,
} from './schemas.js'
import { preflightDraft, type PreflightResult } from './preflight.js'
import { pickExemplars, type Exemplar } from './grounding.js'
import { writeDraft, type WriteDraftResult } from './writer.js'
import { slugify } from './slug.js'

const HERE = dirname(fileURLToPath(import.meta.url))

export interface UltraExpertiseOpts {
  client: LLMClient
  model?: string
  criticModel?: string
}

export interface UltraResult {
  analysis: AnalysisOutput
  synthesis: SynthesisOutput
}

export interface LoopMeta {
  rounds_run: number
  final_score: number | null
  critiques: CritiqueOutput[]
  tokens?: { input: number; output: number }
}

export type PhaseEvent =
  | { phase: 'analyze'; status: 'start' }
  | { phase: 'analyze'; status: 'done'; duration_ms: number; result: AnalysisOutput }
  | { phase: 'synthesize'; status: 'start' }
  | { phase: 'synthesize'; status: 'done'; duration_ms: number; result: SynthesisOutput }
  | { phase: 'critique'; status: 'start'; round: number }
  | { phase: 'critique'; status: 'done'; round: number; duration_ms: number; result: CritiqueOutput }
  | { phase: 'revise'; status: 'start'; round: number }
  | { phase: 'revise'; status: 'done'; round: number; duration_ms: number; result: SynthesisOutput }

export class UltraExpertise {
  private readonly ajv = new Ajv({ allErrors: true, strict: false })
  private readonly validateAnalysis = this.ajv.compile(ANALYSIS_SCHEMA)
  private readonly validateSynthesis = this.ajv.compile(SYNTHESIS_SCHEMA)
  private readonly validateCritique = this.ajv.compile(CRITIQUE_SCHEMA)

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

  async synthesize(
    taskDescription: string,
    analysis: AnalysisOutput,
    exemplars?: Exemplar[],
  ): Promise<SynthesisOutput> {
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
      ...(exemplars && exemplars.length > 0 ? { exemplars } : {}),
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

  // Returns the (post-filtered) critique AND the LLMUsage so the loop can sum
  // tokens into loop.tokens. usage is `undefined` on the soft-fail paths (no
  // successful completion to attribute tokens to).
  async critique(
    taskDescription: string,
    analysis: AnalysisOutput,
    draft: SynthesisOutput,
    preflight: PreflightResult,
    validation: { valid: boolean; errors?: string[] },
    exemplars?: Exemplar[],
  ): Promise<{ critique: CritiqueOutput | null; usage?: LLMUsage | undefined }> {
    const systemPath = resolve(HERE, 'prompts/critic.md')
    const system = readFileSync(systemPath, 'utf8')
    const tool: LLMTool = {
      name: 'structured_output',
      description: 'Return the structured critique matching the schema',
      input_schema: CRITIQUE_SCHEMA as unknown as Record<string, unknown>,
    }
    const userPayload = {
      task: taskDescription,
      analysis,
      draft,
      preflight,
      validation,
      ...(exemplars && exemplars.length > 0 ? { exemplars } : {}),
    }
    let result
    try {
      result = await this.opts.client.complete({
        model: this.opts.criticModel ?? this.opts.model ?? 'claude-sonnet-4-6',
        system,
        messages: [{ role: 'user', content: JSON.stringify(userPayload, null, 2) }],
        tools: [tool],
        max_tokens: 8192,
      })
    } catch {
      // soft-fail: a flaky critic can never crash the headline command
      return { critique: null }
    }
    const usage = result.usage
    const call = result.tool_calls?.find((c) => c.name === 'structured_output')
    if (!call) {
      // soft-fail: no structured_output tool call → treat as "no findings"
      return { critique: null, usage }
    }
    if (!this.validateCritique(call.input)) {
      // soft-fail: malformed critique → treat as "no findings"
      return { critique: null, usage }
    }
    const data = call.input as CritiqueOutput

    // Anchor post-filter: drop any finding whose cited anchor is absent from the draft.
    const draftNodeIds = new Set<string>()
    const draftFields = new Set<string>()
    try {
      const spec = parseExperienceYaml(draft.experience_yaml)
      for (const n of spec.graph?.nodes ?? []) draftNodeIds.add(n.id)
      for (const k of Object.keys(spec.state?.schema ?? {})) draftFields.add(k)
    } catch {
      // unparseable draft → keep no anchors, so all findings are dropped
    }
    const draftFiles = new Set(draft.files.map((f) => f.path.replace(/^\.\//, '')))
    const anchored = data.findings.filter((f: CritiqueFinding) => {
      // check the most-specific anchor present; we do not OR across multiple fields
      if (f.anchor.node_id) return draftNodeIds.has(f.anchor.node_id)
      if (f.anchor.state_field) return draftFields.has(f.anchor.state_field)
      if (f.anchor.file_path) return draftFiles.has(f.anchor.file_path.replace(/^\.\//, ''))
      // no anchor field set (or all empty) → unverifiable → drop
      return false
    })
    return { critique: { ...data, findings: anchored }, usage }
  }

  // Returns the revised synthesis AND the LLMUsage so the loop can sum tokens.
  // Throws (caught at the loop call site) on missing/invalid tool output.
  private async revise(
    taskDescription: string,
    analysis: AnalysisOutput,
    currentDraft: SynthesisOutput,
    findings: CritiqueFinding[],
    validationErrors: string[],
    exemplars?: Exemplar[],
  ): Promise<{ synthesis: SynthesisOutput; usage?: LLMUsage | undefined }> {
    const systemPath = resolve(HERE, 'prompts/reviser.md')
    const system = readFileSync(systemPath, 'utf8')
    const tool: LLMTool = {
      name: 'structured_output',
      description: 'Return the incrementally revised experience.yaml + supporting files',
      input_schema: SYNTHESIS_SCHEMA as unknown as Record<string, unknown>,
    }
    const userPayload = {
      task: taskDescription,
      analysis,
      current_draft: currentDraft,
      findings,
      validation_errors: validationErrors,
      ...(exemplars && exemplars.length > 0 ? { exemplars } : {}),
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
      throw new Error('UltraExpertise.revise: LLM did not return a structured_output tool call')
    }
    const data = call.input
    if (!this.validateSynthesis(data)) {
      const msgs = (this.validateSynthesis.errors ?? []).map(
        (e) => `${e.instancePath || '(root)'}: ${e.message ?? 'invalid'}`,
      )
      throw new Error(`UltraExpertise.revise: AJV validation failed: ${msgs.join(', ')}`)
    }
    return { synthesis: data as SynthesisOutput, usage: result.usage }
  }

  async author(opts: {
    taskDescription: string
    rootDir: string
    draftSlug?: string
    stopAfterAnalyze?: boolean
    maxRounds?: number
    exemplars?: Exemplar[]
    corpusDir?: string
    onPhase?: (event: PhaseEvent) => void
  }): Promise<
    | (UltraResult &
        WriteDraftResult & { validation: { valid: boolean; errors?: string[] } } & { loop?: LoopMeta })
    | { analysis: AnalysisOutput; stopped: true }
  > {
    const { onPhase } = opts
    // Default 0 (not 1) for true byte-for-byte back-compat: every EXISTING author()
    // caller that omits maxRounds (the legacy ScriptedLLM/CannedLLM author() tests
    // and e2e) keeps the round-0 one-shot behavior with NO loop key. The CLI option
    // (Task 8) is the ONLY place that defaults to 1, so `oe ultra` runs the loop.
    const maxRounds = opts.maxRounds ?? 0

    onPhase?.({ phase: 'analyze', status: 'start' })
    const t0 = Date.now()
    const analysis = await this.analyze(opts.taskDescription)
    onPhase?.({ phase: 'analyze', status: 'done', duration_ms: Date.now() - t0, result: analysis })

    if (opts.stopAfterAnalyze) {
      return { analysis, stopped: true }
    }

    // Grounding (spec Design > Grounding, lines 154-168; Decision #13): the analysis
    // is now available, so if the caller passed a `corpusDir`, scan it on disk into an
    // Exemplar[] and pick the closest few. author() owns the scan+pick because the CLI
    // cannot pick before analyze() runs (analysis is the ranking key). An explicitly
    // passed `exemplars[]` short-circuits the scan; absent both → no-op (empty), which
    // synthesize()/critique()/revise() treat as "no exemplars key in the payload".
    let exemplars: Exemplar[] | undefined = opts.exemplars
    if ((!exemplars || exemplars.length === 0) && opts.corpusDir) {
      const corpus = this.scanCorpus(opts.corpusDir)
      exemplars = pickExemplars(analysis, corpus, 2)
    }

    onPhase?.({ phase: 'synthesize', status: 'start' })
    const t1 = Date.now()
    const synthesis = await this.synthesize(opts.taskDescription, analysis, exemplars)
    onPhase?.({
      phase: 'synthesize',
      status: 'done',
      duration_ms: Date.now() - t1,
      result: synthesis,
    })

    const scoreBar = Number(process.env['OE_ULTRA_SCORE_BAR'] ?? 80)

    // Round 0: the synthesized baseline.
    type Round = {
      synthesis: SynthesisOutput
      preflight: PreflightResult
      validation: { valid: boolean; errors?: string[] }
      critique: CritiqueOutput | null
      composite: number
    }
    const evaluate = (s: SynthesisOutput, critique: CritiqueOutput | null): Round => {
      const preflight = preflightDraft(s)
      const validation = this.validateGeneratedYaml(s.experience_yaml)
      let composite = 0
      if (validation.valid && preflight.ok && critique) {
        const high = critique.findings.filter((f) => f.severity === 'high').length
        const med = critique.findings.filter((f) => f.severity === 'medium').length
        composite = Math.max(0, Math.min(100, critique.score - 25 * high - 5 * med))
      } else if (validation.valid && preflight.ok && !critique) {
        composite = 0
      }
      return { synthesis: s, preflight, validation, critique, composite }
    }

    let current = evaluate(synthesis, null)
    let best = current
    const critiques: CritiqueOutput[] = []
    let roundsRun = 0
    const tokens = { input: 0, output: 0 }

    const isBetter = (a: Round, b: Round): boolean => {
      if (a.validation.valid !== b.validation.valid) return a.validation.valid
      return a.composite > b.composite // ties keep the earlier (b stays best)
    }

    const addUsage = (usage?: LLMUsage): void => {
      tokens.input += usage?.input_tokens ?? 0
      tokens.output += usage?.output_tokens ?? 0
    }

    for (let round = 1; round <= maxRounds; round++) {
      onPhase?.({ phase: 'critique', status: 'start', round })
      const tc = Date.now()
      const { critique, usage: critiqueUsage } = await this.critique(
        opts.taskDescription,
        analysis,
        current.synthesis,
        current.preflight,
        current.validation,
        exemplars,
      )
      addUsage(critiqueUsage)
      onPhase?.({
        phase: 'critique',
        status: 'done',
        round,
        duration_ms: Date.now() - tc,
        result: critique ?? { score: 0, findings: [] },
      })
      roundsRun = round

      if (critique) critiques.push(critique)
      // re-evaluate current with the critique so its composite is scored
      current = evaluate(current.synthesis, critique)
      if (isBetter(current, best)) best = current

      // Soft-fail / nothing-to-do: stop, keep best.
      if (!critique) break
      const highRemaining = critique.findings.filter((f) => f.severity === 'high').length
      const earlyStop =
        current.validation.valid &&
        current.preflight.ok &&
        highRemaining === 0 &&
        current.composite >= scoreBar
      if (critique.findings.length === 0 || earlyStop) break

      // Revise.
      onPhase?.({ phase: 'revise', status: 'start', round })
      const tr = Date.now()
      let revised: SynthesisOutput
      try {
        const reviseResult = await this.revise(
          opts.taskDescription,
          analysis,
          current.synthesis,
          critique.findings,
          current.validation.errors ?? [],
          exemplars,
        )
        revised = reviseResult.synthesis
        addUsage(reviseResult.usage)
      } catch {
        break // reviser error → keep best, stop
      }
      onPhase?.({ phase: 'revise', status: 'done', round, duration_ms: Date.now() - tr, result: revised })

      // The reviser targeted this round's findings; treat them as resolved and
      // score the revised draft by the critic's subjective `score` (composite =
      // clamp(score), no finding penalty) so loop.final_score reports post-fix
      // quality instead of null/0 on the auto-fix success path. If a later round
      // critiques this draft for real, that re-scores it.
      const revisedRound = evaluate(revised, { score: critique.score, findings: [] })
      // Monotonicity gate: reject a revise that regresses validity.
      if (best.validation.valid && !revisedRound.validation.valid) {
        break // diverging → keep prior best, stop
      }
      current = revisedRound
      if (isBetter(current, best)) best = current
    }

    const slug = opts.draftSlug ?? slugify(analysis.name)
    const draftDir = join(opts.rootDir, slug)
    const writeResult = await writeDraft({
      draftDir,
      experienceYaml: best.synthesis.experience_yaml,
      files: best.synthesis.files,
    })
    const validation = best.validation

    if (maxRounds <= 0) {
      return { analysis, synthesis: best.synthesis, ...writeResult, validation }
    }
    const loop: LoopMeta = {
      rounds_run: roundsRun,
      final_score: best.critique ? best.composite : null,
      critiques,
      tokens,
    }
    return { analysis, synthesis: best.synthesis, ...writeResult, validation, loop }
  }

  // Scan a corpus dir of authored experiences into Exemplar[]. Each immediate
  // subdir with an experience.yaml becomes one exemplar (name = dir, description
  // pulled from the YAML's `description:` line if present, excerpt = the raw YAML
  // capped so the critic/synthesizer payload stays small). Missing dir → [].
  private scanCorpus(corpusDir: string): Exemplar[] {
    if (!existsSync(corpusDir)) return []
    const out: Exemplar[] = []
    for (const entry of readdirSync(corpusDir)) {
      const yamlPath = join(corpusDir, entry, 'experience.yaml')
      if (!existsSync(yamlPath) || !statSync(join(corpusDir, entry)).isDirectory()) continue
      let raw: string
      try {
        raw = readFileSync(yamlPath, 'utf8')
      } catch {
        continue
      }
      const descMatch = raw.match(/^description:\s*(.+)$/m)
      out.push({
        name: entry,
        description: descMatch ? descMatch[1]!.trim() : entry,
        experience_yaml_excerpt: raw.slice(0, 4000),
      })
    }
    return out
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
