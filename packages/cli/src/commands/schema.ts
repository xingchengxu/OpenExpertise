import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { EXPERIENCE_SCHEMA } from '@openexpertise/schema'
import type { Logger } from 'pino'

export interface SchemaOpts {
  logger: Logger
  write?: boolean
  out?: string
}

export async function schemaCommand(opts: SchemaOpts): Promise<number> {
  try {
    const json = JSON.stringify(EXPERIENCE_SCHEMA, null, 2) + '\n'
    if (opts.write) {
      const outPath = resolve(opts.out ?? 'experience.schema.json')
      writeFileSync(outPath, json)
      opts.logger.info(
        { out: outPath },
        'wrote experience.schema.json — point your editor at it: # yaml-language-server: $schema=./<file>',
      )
    } else {
      process.stdout.write(json)
    }
    return 0
  } catch (err) {
    opts.logger.error({ err: (err as Error).message }, 'schema command failed')
    return 1
  }
}
