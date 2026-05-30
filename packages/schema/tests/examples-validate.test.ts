import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseExperienceYaml, validateExperienceSpec } from '../src/index.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const examplesDir = resolve(__dirname, '../../../examples')

function findExperienceYamls(root: string): string[] {
  const results: string[] = []
  let entries: string[]
  try {
    entries = readdirSync(root)
  } catch {
    return results
  }
  for (const entry of entries) {
    const candidate = join(root, entry, 'experience.yaml')
    try {
      readFileSync(candidate)
      results.push(candidate)
    } catch {
      // not a directory or no experience.yaml — skip
    }
  }
  return results.sort()
}

const experienceFiles = findExperienceYamls(examplesDir)

describe('examples drift-guard: all examples validate against the schema', () => {
  it('finds at least 13 example files (glob sanity check)', () => {
    expect(experienceFiles.length).toBeGreaterThanOrEqual(13)
  })

  for (const filePath of experienceFiles) {
    it(`validates ${filePath.replace(examplesDir + '/', '')}`, () => {
      const source = readFileSync(filePath, 'utf8')
      const spec = parseExperienceYaml(source)
      expect(() => validateExperienceSpec(spec)).not.toThrow()
    })
  }
})
