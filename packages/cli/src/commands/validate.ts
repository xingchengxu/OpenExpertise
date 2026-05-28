import { readFileSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { parseExperienceYaml, validateExperienceSpec, ValidationError } from '@openexpertise/schema'
import type { Logger } from 'pino'

export interface ValidateOpts {
  path: string
  logger: Logger
}

export async function validateCommand(opts: ValidateOpts): Promise<number> {
  const yamlPath = resolveExperienceYaml(opts.path)
  if (!existsSync(yamlPath)) {
    opts.logger.error(
      { path: yamlPath },
      `experience.yaml not found at ${yamlPath}. Pass a directory containing experience.yaml or the yaml file directly.`,
    )
    return 1
  }
  const source = readFileSync(yamlPath, 'utf8')
  try {
    const spec = parseExperienceYaml(source)
    validateExperienceSpec(spec)
    opts.logger.info({ path: yamlPath }, 'experience valid')
    return 0
  } catch (err) {
    if (err instanceof ValidationError) {
      opts.logger.error({ errors: err.errors }, err.message)
    } else {
      opts.logger.error({ err: (err as Error).message }, 'validation failed')
    }
    return 1
  }
}

export function resolveExperienceYaml(input: string): string {
  const abs = resolve(input)
  if (abs.endsWith('.yaml') || abs.endsWith('.yml')) return abs
  return join(abs, 'experience.yaml')
}
