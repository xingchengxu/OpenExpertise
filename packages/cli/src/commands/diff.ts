import type { Logger } from 'pino'

export interface DiffOpts {
  experiencePath: string
  logger: Logger
}

export async function diffCommand(opts: DiffOpts): Promise<number> {
  opts.logger.info(
    { experiencePath: opts.experiencePath },
    'oe diff is a Plan 6 placeholder — evolution advisor not implemented yet',
  )
  return 0
}
