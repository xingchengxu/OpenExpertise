import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Logger } from 'pino'

export interface DiffOpts {
  experiencePath: string
  logger: Logger
}

export async function diffCommand(opts: DiffOpts): Promise<number> {
  const dir = resolve(opts.experiencePath)
  const evoDir = join(dir, '.openexpertise', 'evolution')
  if (!existsSync(evoDir)) {
    opts.logger.info({ evoDir }, 'no evolution proposals yet — run `oe evolve <run-id>` first')
    return 0
  }
  const files = readdirSync(evoDir).filter((f) => f.endsWith('.md'))
  if (files.length === 0) {
    opts.logger.info({ evoDir }, 'evolution directory is empty')
    return 0
  }
  files.sort()
  opts.logger.info({ count: files.length }, 'pending evolution proposals')
  for (const f of files) {
    const md = readFileSync(join(evoDir, f), 'utf8')
    // First 20 lines for compact listing
    const preview = md.split('\n').slice(0, 20).join('\n')
    opts.logger.info({ file: f }, 'proposal')
    process.stdout.write(preview + '\n---\n')
  }
  return 0
}
