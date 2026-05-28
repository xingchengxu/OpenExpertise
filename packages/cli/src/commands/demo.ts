import type { Logger } from 'pino'
import { loadDemo, listDemos } from '../demo-data.js'

export interface DemoOpts {
  name?: string
  json?: boolean
  logger: Logger
}

// ANSI helpers — same palette as doctor.ts
const GREEN = '\x1b[32m'
const CYAN = '\x1b[36m'
const DIM = '\x1b[2m'
const BOLD = '\x1b[1m'
const RESET = '\x1b[0m'

export async function demoCommand(opts: DemoOpts): Promise<number> {
  // No arg → list
  if (!opts.name) {
    const demos = listDemos()
    if (opts.json) {
      process.stdout.write(JSON.stringify({ demos }, null, 2) + '\n')
      return 0
    }
    process.stdout.write(
      `${BOLD}OpenExpertise demos${RESET} — pre-recorded runs you can preview without an API key.\n\n`,
    )
    for (const d of demos) {
      const star = d.has_evolution ? ' ★' : ''
      process.stdout.write(`  ${CYAN}oe demo ${d.name}${RESET}${star} — ${d.one_liner}\n`)
    }
    process.stdout.write(
      `\n${DIM}★ marks demos that include a built-in evolution proposal (the advisor's killer feature).${RESET}\n`,
    )
    process.stdout.write(`${DIM}Use --json for machine-readable output.${RESET}\n`)
    return 0
  }

  // Named demo
  const demo = loadDemo(opts.name)
  if (!demo) {
    process.stderr.write(`unknown demo "${opts.name}". Run \`oe demo\` to list available demos.\n`)
    return 1
  }

  if (opts.json) {
    process.stdout.write(JSON.stringify(demo, null, 2) + '\n')
    return 0
  }

  // Pretty-printed
  process.stdout.write(`${BOLD}${CYAN}=== ${demo.name} ===${RESET}\n`)
  process.stdout.write(`${demo.one_liner}\n\n`)
  process.stdout.write(`${DIM}command:${RESET}  ${demo.run.command}\n`)
  process.stdout.write(`${DIM}duration:${RESET} ${demo.run.duration}\n`)
  process.stdout.write(`${DIM}status:${RESET}   ${GREEN}${demo.run.status}${RESET}\n`)
  process.stdout.write(
    `${DIM}events:${RESET}   ${demo.run.event_count} (across ${demo.run.node_count} nodes)\n\n`,
  )
  process.stdout.write(`${BOLD}final state:${RESET}\n`)
  for (const [field, preview] of Object.entries(demo.run.final_state_preview)) {
    process.stdout.write(`  ${CYAN}${field}:${RESET} ${preview}\n`)
  }
  if (demo.evolution_proposal) {
    process.stdout.write(`\n${BOLD}★ evolution proposal (after ~5 similar runs)${RESET}\n`)
    process.stdout.write(`  ${DIM}operation:${RESET} ${demo.evolution_proposal.operation}\n`)
    process.stdout.write(`  ${DIM}rationale:${RESET} ${demo.evolution_proposal.rationale}\n\n`)
    process.stdout.write(`  ${DIM}diff (apply with \`git apply\`):${RESET}\n`)
    const indented = demo.evolution_proposal.diff
      .split('\n')
      .map((l) => '    ' + l)
      .join('\n')
    process.stdout.write(indented + '\n')
  }
  if (demo.tip) {
    process.stdout.write(`\n${DIM}tip:${RESET} ${demo.tip}\n`)
  }
  process.stdout.write(
    `\n${DIM}─────────────────────────────────────────────────────────────${RESET}\n`,
  )
  process.stdout.write(`${DIM}ⓘ This is a pre-recorded demo. To run for real:${RESET}\n`)
  process.stdout.write(`  ${CYAN}oe install ${demo.name}${RESET}\n`)
  process.stdout.write(`  ${CYAN}oe run .openexpertise/experiences/${demo.name}${RESET}\n`)
  return 0
}
