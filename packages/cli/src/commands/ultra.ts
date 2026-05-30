import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Logger } from 'pino'
import type { LLMClient } from '@openexpertise/core'
import { runExperience } from '@openexpertise/core'
import { parseExperienceYaml } from '@openexpertise/schema'
import { UltraExpertise } from '@openexpertise/authoring'
import type { AnalysisOutput } from '@openexpertise/authoring'
import { makeLLMClient, resolveLLMProvider, defaultModelFor } from '../llm-factory.js'
import { buildRunContext } from '../run-context.js'

// ─── ANSI helpers ────────────────────────────────────────────────────────────
const CYAN_DIM = '\x1b[36;2m'
const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const BOLD = '\x1b[1m'
const RESET = '\x1b[0m'

function spinnerLine(text: string): string {
  return `${CYAN_DIM}⟳ ${text}${RESET}`
}

function checkLine(text: string): string {
  return `${GREEN}⟳ ${text} ✓${RESET}`
}

function out(line: string): void {
  process.stdout.write(line + '\n')
}

function formatDuration(ms: number): string {
  return (ms / 1000).toFixed(1) + 's'
}

function printAnalysisShape(analysis: AnalysisOutput): void {
  const nodeCount = analysis.node_sketches.length
  const kindCounts: Record<string, number> = {}
  for (const n of analysis.node_sketches) {
    kindCounts[n.kind] = (kindCounts[n.kind] ?? 0) + 1
  }
  const kindSummary = Object.entries(kindCounts)
    .map(([k, v]) => `${v} ${k}`)
    .join(', ')
  out(`  Detected shape: ${nodeCount} nodes (${kindSummary})`)
  if (analysis.phases.length > 0) {
    out(`  Phases: ${analysis.phases.map((p) => p.id).join(' → ')}`)
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface UltraOpts {
  taskDescription: string
  draftRoot: string
  logger: Logger
  llm?: string
  dryRun?: boolean
  maxRounds?: number
  run?: boolean
}

export async function ultraCommand(opts: UltraOpts): Promise<number> {
  const provider = resolveLLMProvider(opts.llm !== undefined ? { flag: opts.llm } : {})
  const model = defaultModelFor(provider)
  let cached: LLMClient | null = null
  const llm: LLMClient = {
    async complete(completeOpts) {
      if (!cached) cached = await makeLLMClient(provider)
      return cached.complete(completeOpts)
    },
  }

  const criticModel = process.env['OE_ULTRA_CRITIC_MODEL']
  const ultra = new UltraExpertise({
    client: llm,
    model,
    ...(criticModel ? { criticModel } : {}),
  })
  const rootDir = resolve(opts.draftRoot)

  const HERE = dirname(fileURLToPath(import.meta.url))
  // The repo's examples/ corpus for grounding. From the COMPILED module
  // (packages/cli/dist/commands/ultra.js) the repo-root examples/ is four levels up
  // (commands → dist → cli → packages → repo-root). A published @openexpertise/cli
  // tarball ships only "dist" (see package.json "files"), so it won't include
  // examples/ — author() no-ops grounding via an existsSync guard when the dir is
  // absent, so a stripped install simply skips exemplars rather than throwing.
  const corpusDir = resolve(HERE, '../../../../examples')

  // Label for the critique/revise sub-lines: matches the spec sample `↳ round 1/1`.
  // The CLI --max-rounds option defaults to '1', so opts.maxRounds is 1 in the
  // common case; the `?? 1` covers programmatic callers that omit it.
  const maxRoundsLabel = opts.maxRounds ?? 1

  // Track current spinner line so we can replace it on completion
  let currentSpinnerText = ''

  function startPhase(label: string): void {
    currentSpinnerText = label
    process.stdout.write('\r' + spinnerLine(label))
  }

  function completePhase(label: string, durationMs: number): void {
    // Overwrite the spinner line with a check line
    const checkText = `${label} (${formatDuration(durationMs)})`
    process.stdout.write(
      '\r' +
        ' '.repeat(spinnerLine(currentSpinnerText).replace(/\x1b\[[^m]*m/g, '').length + 4) +
        '\r',
    )
    out(checkLine(checkText))
  }

  opts.logger.info({ task: opts.taskDescription }, 'ultraexpertise: starting analyze phase')

  const phase1Label = `Phase 1/2: Analyzing the task… (using ${provider} ${model})`
  startPhase(phase1Label)

  let analysisDurationMs = 0

  const result = await ultra.author({
    taskDescription: opts.taskDescription,
    rootDir,
    corpusDir, // bundled examples/ corpus for grounding (Step 3); author() no-ops if absent
    stopAfterAnalyze: opts.dryRun ?? false,
    ...(opts.maxRounds !== undefined ? { maxRounds: opts.maxRounds } : {}),
    onPhase(event) {
      if (event.phase === 'analyze' && event.status === 'start') {
        // Already shown above — no-op
      } else if (event.phase === 'analyze' && event.status === 'done') {
        analysisDurationMs = event.duration_ms
        completePhase(`Phase 1/2: Analyzing the task`, event.duration_ms)
        printAnalysisShape(event.result)
      } else if (event.phase === 'synthesize' && event.status === 'start') {
        startPhase('Phase 2/2: Synthesizing files… (this is the heavy LLM call)')
      } else if (event.phase === 'synthesize' && event.status === 'done') {
        completePhase('Phase 2/2: Synthesizing files', event.duration_ms)
      } else if (event.phase === 'critique' && event.status === 'start') {
        startPhase(`  ↳ critique round ${event.round}/${maxRoundsLabel}…`)
      } else if (event.phase === 'critique' && event.status === 'done') {
        const high = event.result.findings.filter((f) => f.severity === 'high').length
        completePhase(
          `  ↳ critique round ${event.round}/${maxRoundsLabel} — score ${event.result.score}, ${event.result.findings.length} findings (${high} high)`,
          event.duration_ms,
        )
      } else if (event.phase === 'revise' && event.status === 'start') {
        startPhase(`  ↳ revise round ${event.round}/${maxRoundsLabel}…`)
      } else if (event.phase === 'revise' && event.status === 'done') {
        completePhase(`  ↳ revise round ${event.round}/${maxRoundsLabel}`, event.duration_ms)
      }
    },
  })

  // ── Dry-run path ──────────────────────────────────────────────────────────
  if ('stopped' in result && result.stopped) {
    const analysis = result.analysis
    out('')
    out(`${BOLD}Detected shape:${RESET}`)
    out(`  Name: ${analysis.name}`)
    if (analysis.phases.length > 0) {
      out(`  Phases: ${analysis.phases.map((p) => p.id).join(' → ')}`)
    }
    if (analysis.node_sketches.length > 0) {
      out(`  Nodes:`)
      for (const n of analysis.node_sketches) {
        const fanOut = n.fan_out_over ? `, for_each over ${n.fan_out_over}` : ''
        out(`    - ${n.id} (${n.kind}${fanOut})`)
      }
    }
    if (analysis.open_questions && analysis.open_questions.length > 0) {
      out(`  Open questions:`)
      for (const q of analysis.open_questions) {
        out(`    - ${q}`)
      }
    }
    out('')
    out(`${CYAN_DIM}(dry-run: stopped after analyze; no files written)${RESET}`)
    out('')
    out('If this shape looks right, re-run without --dry-run to synthesize.')
    out('If not, refine the task description and try again.')

    opts.logger.info(
      {
        slug: analysis.name,
        phases: analysis.phases.map((p) => p.id),
        nodes: analysis.node_sketches.map((n) => `${n.id}(${n.kind})`),
        open_questions: analysis.open_questions ?? [],
        dry_run: true,
        duration_ms: analysisDurationMs,
      },
      'ultraexpertise: analyze phase complete (dry-run)',
    )
    return 0
  }

  // ── Full run path ─────────────────────────────────────────────────────────
  // Narrow the type: we already returned for the dry-run case above.
  const fullResult = result as Exclude<typeof result, { stopped: true }>

  opts.logger.info(
    {
      slug: fullResult.analysis.name,
      draftDir: fullResult.draftDir,
      phases: fullResult.analysis.phases.map((p) => p.id),
      nodes: fullResult.analysis.node_sketches.map((n) => `${n.id}(${n.kind})`),
      open_questions: fullResult.analysis.open_questions ?? [],
      files_written: fullResult.files_written,
      valid: fullResult.validation.valid,
      validation_errors: fullResult.validation.errors ?? [],
      next_steps: fullResult.synthesis.next_steps ?? [],
    },
    'ultraexpertise: draft created',
  )

  // ── Files summary ────────────────────────────────────────────────────────
  const filesCount = fullResult.files_written.length
  out(
    `  Files written: ${filesCount} (${fullResult.files_written.slice(0, 3).join(', ')}${filesCount > 3 ? `×${filesCount - 3}` : ''})`,
  )
  out('')

  // ── Validation result ────────────────────────────────────────────────────
  if (!fullResult.validation.valid) {
    out(`${RED}✗ Draft created with validation errors:${RESET}`)
    for (const e of fullResult.validation.errors ?? []) {
      out(`    - ${e}`)
    }
    out('')
    out(`  The draft is still in ${fullResult.draftDir} — fix manually, or`)
    out('  re-run oe ultra with a more specific task description.')

    opts.logger.warn(
      { errors: fullResult.validation.errors },
      'draft did not pass oe validate — inspect and fix before running',
    )
    return 2
  }

  out(`${GREEN}✓ Draft created at ${fullResult.draftDir}/${RESET}`)
  out('')
  out(`  Validation: ${GREEN}✓ experience valid${RESET}`)
  out('')

  if ('loop' in fullResult && fullResult.loop && fullResult.loop.rounds_run > 0) {
    const loop = fullResult.loop
    const score = loop.final_score ?? 0
    const scoreBar = Number(process.env['OE_ULTRA_SCORE_BAR'] ?? 80)
    out(
      `  Quality loop: ${loop.rounds_run} round${loop.rounds_run === 1 ? '' : 's'}, final score ${score}/100 (bar ${scoreBar})`,
    )
    out('')
  }

  out('  Next steps:')

  // Prefer synthesis.next_steps if available, else fall back to static checklist
  const nextSteps: string[] =
    fullResult.synthesis.next_steps && fullResult.synthesis.next_steps.length > 0
      ? fullResult.synthesis.next_steps
      : buildDefaultNextSteps(fullResult.draftDir, fullResult.analysis.name)

  nextSteps.forEach((step: string, i: number) => {
    out(`    ${i + 1}. ${step}`)
  })

  out('')
  out('  Reference: https://xingchengxu.github.io/OpenExpertise/guide/authoring-ultra')

  opts.logger.info(
    {
      run: `oe run ${fullResult.draftDir}`,
      promote: `mv ${fullResult.draftDir} examples/${fullResult.analysis.name}`,
    },
    'next: run or promote',
  )

  // ── Optional smoke run (--run) ─────────────────────────────────────────────
  // ADVISORY: this runs the freshly-authored draft once as a smoke test. The
  // ultra draft ships defensive tool stubs, so a tool-only draft runs with no
  // wiring; agent/skill nodes need an LLM key and fail gracefully without one.
  // The authoring result (a valid draft) already returns 0 — the smoke outcome
  // NEVER changes that exit code. A draft with agent nodes legitimately can't
  // smoke-run without a key, so the run is informational only and merely prints.
  // (--dry-run returns earlier, so this path is unreachable in dry-run.)
  if (opts.run) {
    const draftDir = fullResult.draftDir
    out('')
    const wireHint = `  Set an API key (agent nodes) or wire the tool stubs, then: oe run ${draftDir}`
    try {
      const spec = parseExperienceYaml(readFileSync(join(draftDir, 'experience.yaml'), 'utf8'))
      const { dispatchers, events } = buildRunContext(
        opts.llm !== undefined ? { llm: opts.llm } : {},
      )
      const result = await runExperience({
        spec,
        experienceDir: draftDir,
        dispatchers,
        events,
        args: {},
      })
      opts.logger.info(
        { runId: result.runId, status: result.status, finalState: result.finalState },
        'ultraexpertise: smoke run complete',
      )
      if (result.status === 'success') {
        out(`${GREEN}✓ smoke run succeeded (run ${result.runId})${RESET}`)
        const fields = Object.keys(result.finalState)
        const summary =
          fields.length > 0
            ? `${fields.length} state field${fields.length === 1 ? '' : 's'}: ${fields.slice(0, 4).join(', ')}${fields.length > 4 ? '…' : ''}`
            : 'no state fields written'
        out(`  final state — ${summary}`)
        out(`  → oe inspect ${result.runId} --experience ${draftDir} --html for a report`)
      } else {
        out(`${RED}✗ smoke run ${result.status}${RESET}`)
        out(wireHint)
      }
    } catch (err) {
      // A thrown run (e.g. missing LLM key for an agent node) must NOT crash
      // oe ultra — the draft is still valid. Print and continue.
      const msg = err instanceof Error ? err.message : String(err)
      opts.logger.warn({ err: msg }, 'ultraexpertise: smoke run could not complete (non-blocking)')
      out(`${RED}✗ smoke run could not complete: ${msg}${RESET}`)
      out(wireHint)
    }
  }

  return 0
}

export interface UltraReviseOpts {
  draftPath: string
  feedback: string
  logger: Logger
  llm?: string
  maxRounds?: number
}

export async function ultraReviseCommand(opts: UltraReviseOpts): Promise<number> {
  const provider = resolveLLMProvider(opts.llm !== undefined ? { flag: opts.llm } : {})
  const model = defaultModelFor(provider)
  let cached: LLMClient | null = null
  const llm: LLMClient = {
    async complete(completeOpts) {
      if (!cached) cached = await makeLLMClient(provider)
      return cached.complete(completeOpts)
    },
  }

  const criticModel = process.env['OE_ULTRA_CRITIC_MODEL']
  const ultra = new UltraExpertise({
    client: llm,
    model,
    ...(criticModel ? { criticModel } : {}),
  })
  const draftDir = resolve(opts.draftPath)

  // Track current spinner line so we can replace it on completion (mirrors ultraCommand)
  let currentSpinnerText = ''
  function startPhase(label: string): void {
    currentSpinnerText = label
    process.stdout.write('\r' + spinnerLine(label))
  }
  function completePhase(label: string, durationMs: number): void {
    const checkText = `${label} (${formatDuration(durationMs)})`
    process.stdout.write(
      '\r' +
        ' '.repeat(spinnerLine(currentSpinnerText).replace(/\x1b\[[^m]*m/g, '').length + 4) +
        '\r',
    )
    out(checkLine(checkText))
  }

  opts.logger.info({ draftDir, feedback: opts.feedback }, 'ultraexpertise: starting revise')
  startPhase(`Revising draft… (using ${provider} ${model})`)

  let result: Awaited<ReturnType<UltraExpertise['reviseDraft']>>
  try {
    result = await ultra.reviseDraft({
      draftDir,
      feedback: opts.feedback,
      ...(opts.maxRounds !== undefined ? { maxRounds: opts.maxRounds } : {}),
      onPhase(event) {
        if (event.phase === 'critique' && event.status === 'start') {
          startPhase(`  ↳ critique round ${event.round}…`)
        } else if (event.phase === 'critique' && event.status === 'done') {
          const high = event.result.findings.filter((f) => f.severity === 'high').length
          completePhase(
            `  ↳ critique round ${event.round} — score ${event.result.score}, ${event.result.findings.length} findings (${high} high)`,
            event.duration_ms,
          )
        } else if (event.phase === 'revise' && event.status === 'start') {
          startPhase(`  ↳ revise round ${event.round}…`)
        } else if (event.phase === 'revise' && event.status === 'done') {
          completePhase(`  ↳ revise round ${event.round}`, event.duration_ms)
        }
      },
    })
  } catch (err) {
    out(`${RED}✗ ultra-revise failed: ${(err as Error).message}${RESET}`)
    opts.logger.error({ err: (err as Error).message }, 'ultra-revise failed')
    return 2
  }

  opts.logger.info(
    {
      slug: result.analysis.name,
      draftDir: result.draftDir,
      files_written: result.files_written,
      valid: result.validation.valid,
      validation_errors: result.validation.errors ?? [],
      rounds_run: result.loop.rounds_run,
      final_score: result.loop.final_score,
    },
    'ultraexpertise: draft revised',
  )

  const filesCount = result.files_written.length
  out(
    `  Files written: ${filesCount} (${result.files_written.slice(0, 3).join(', ')}${filesCount > 3 ? `×${filesCount - 3}` : ''})`,
  )
  out('')

  if (result.loop.rounds_run > 0) {
    const score = result.loop.final_score ?? 0
    const scoreBar = Number(process.env['OE_ULTRA_SCORE_BAR'] ?? 80)
    out(
      `  Quality loop: ${result.loop.rounds_run} round${result.loop.rounds_run === 1 ? '' : 's'}, final score ${score}/100 (bar ${scoreBar})`,
    )
    out('')
  }

  if (!result.validation.valid) {
    out(`${RED}✗ Revised draft has validation errors:${RESET}`)
    for (const e of result.validation.errors ?? []) {
      out(`    - ${e}`)
    }
    out('')
    out(`  The draft is still in ${result.draftDir} — fix manually, or re-run oe ultra-revise.`)
    opts.logger.warn({ errors: result.validation.errors }, 'revised draft did not pass oe validate')
    return 2
  }

  out(`${GREEN}✓ Draft revised at ${result.draftDir}/${RESET}`)
  out('')
  out(`  Validation: ${GREEN}✓ experience valid${RESET}`)
  opts.logger.info({ run: `oe run ${result.draftDir}` }, 'next: run the revised draft')
  return 0
}

function buildDefaultNextSteps(draftDir: string, name: string): string[] {
  return [
    `cd ${draftDir}`,
    'Open tools/*.mjs and replace each // TODO: marker with real logic',
    '(Optional) Edit prompts/*.md to fine-tune the LLM voice',
    'oe run .                          — try the scaffold against fixtures',
    'oe inspect <run-id>               — see the full event trail',
    `Write an e2e test (copy pattern from e2e/your-first-experience.e2e.test.ts)`,
    `(Optional) oe submit ${name}      — publish to the registry`,
  ]
}
