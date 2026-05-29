import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Logger } from 'pino'
import { parseExperienceYaml } from '@openexpertise/schema'
import { summarizeRun, renderRunReportHtml } from '../run-report.js'

export interface InspectOpts {
  experiencePath: string
  runId: string
  logger: Logger
  html?: boolean
  out?: string
  direction?: 'TD' | 'LR'
}

export async function inspectCommand(opts: InspectOpts): Promise<number> {
  const dir = resolve(opts.experiencePath)
  const logPath = join(dir, '.openexpertise', 'runs', `${opts.runId}.jsonl`)
  if (!existsSync(logPath)) {
    opts.logger.error({ logPath }, 'run log not found')
    return 1
  }
  const lines = readFileSync(logPath, 'utf8').trim().split('\n')
  const events: Array<{ type: string; ts?: string; [k: string]: unknown }> = lines
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l))
  // Stable sort by ts ascending. Events without a ts go to the end.
  events.sort((a, b) => {
    if (!a.ts && !b.ts) return 0
    if (!a.ts) return 1
    if (!b.ts) return -1
    return a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0
  })

  if (opts.html) {
    // Load the experience spec (needed for the DAG).
    const yamlPath = join(dir, 'experience.yaml')
    if (!existsSync(yamlPath)) {
      opts.logger.error({ yamlPath }, 'experience.yaml not found — required for --html report')
      return 1
    }
    let spec: ReturnType<typeof parseExperienceYaml>
    try {
      spec = parseExperienceYaml(readFileSync(yamlPath, 'utf8'))
    } catch (err) {
      opts.logger.error({ err }, 'failed to parse experience.yaml')
      return 1
    }

    const summary = summarizeRun(events)
    const html = renderRunReportHtml(spec, summary, opts.runId)

    if (opts.out) {
      const outPath = resolve(opts.out)
      writeFileSync(outPath, html)
      opts.logger.info({ out: outPath }, 'wrote run report')
    } else {
      process.stdout.write(html)
    }
    return 0
  }

  // Default: existing event-logging path (unchanged).
  for (const event of events) {
    opts.logger.info(event, event.type)
  }
  return 0
}
