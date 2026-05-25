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
  for (const line of lines) {
    const event = JSON.parse(line) as { type: string }
    opts.logger.info(event, event.type)
  }
  return 0
}
