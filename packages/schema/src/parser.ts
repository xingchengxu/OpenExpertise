import { parseDocument, YAMLError } from 'yaml'
import type { ExperienceSpec } from './types.js'

export class ParseError extends Error {
  constructor(message: string, public readonly line?: number, public readonly column?: number) {
    super(message)
    this.name = 'ParseError'
  }
}

export function parseExperienceYaml(source: string): ExperienceSpec {
  const doc = parseDocument(source, { prettyErrors: true })
  if (doc.errors.length > 0) {
    const first = doc.errors[0] as YAMLError
    const pos = first.linePos?.[0]
    throw new ParseError(
      `YAML parse error at line ${pos?.line ?? '?'}, column ${pos?.col ?? '?'}: ${first.message}`,
      pos?.line,
      pos?.col,
    )
  }
  const parsed = doc.toJS()
  if (typeof parsed !== 'object' || parsed === null) {
    throw new ParseError('experience.yaml must be a YAML mapping at the top level')
  }
  return parsed as ExperienceSpec
}
