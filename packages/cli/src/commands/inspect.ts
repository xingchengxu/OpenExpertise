import { readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Logger } from 'pino'

export interface InspectOpts {
  experiencePath: string
  runId: string
  logger: Logger
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
  for (const event of events) {
    opts.logger.info(event, event.type)
  }
  return 0
}
