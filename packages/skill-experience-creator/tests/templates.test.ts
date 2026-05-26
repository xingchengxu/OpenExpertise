import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseExperienceYaml, validateExperienceSpec } from '@openexpertise/schema'

const HERE = dirname(fileURLToPath(import.meta.url))
const TEMPLATES_DIR = join(HERE, '..', 'assets', 'templates')

describe('starter templates', () => {
  const files = readdirSync(TEMPLATES_DIR).filter((f) => f.endsWith('.yaml'))
  it('finds at least 5 templates', () => {
    expect(files.length).toBeGreaterThanOrEqual(5)
  })
  for (const file of files) {
    it(`${file} parses and validates`, () => {
      const src = readFileSync(join(TEMPLATES_DIR, file), 'utf8')
      const spec = parseExperienceYaml(src)
      expect(() => validateExperienceSpec(spec)).not.toThrow()
    })
  }
})
