import { resolve, join } from 'node:path'

export function resolveExperienceYaml(input: string): string {
  const abs = resolve(input)
  if (abs.endsWith('.yaml') || abs.endsWith('.yml')) return abs
  return join(abs, 'experience.yaml')
}
