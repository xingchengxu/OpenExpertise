import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
export const EXPERIENCE_SCHEMA: Record<string, unknown> = JSON.parse(
  readFileSync(resolve(HERE, 'schemas/experience.schema.json'), 'utf8'),
) as Record<string, unknown>

export * from './types.js'
export { parseExperienceYaml } from './parser.js'
export { validateExperienceSpec, ValidationError } from './validator.js'
