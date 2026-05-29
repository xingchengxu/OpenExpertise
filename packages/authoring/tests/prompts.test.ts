import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const read = (name: string) => readFileSync(resolve(HERE, '../src/prompts', name), 'utf8')

describe('loop prompt files', () => {
  it('critic.md uses the unique SOP critic marker and no clashing markers', () => {
    const t = read('critic.md')
    expect(t).toContain('SOP critic')
    expect(t).not.toContain('architect')
    expect(t).not.toContain('synthesizer')
    expect(t.trimEnd().endsWith('Return only the structured_output tool call.')).toBe(true)
  })

  it('reviser.md uses the unique SOP reviser marker and no clashing markers', () => {
    const t = read('reviser.md')
    expect(t).toContain('SOP reviser')
    expect(t).not.toContain('architect')
    expect(t).not.toContain('synthesizer')
    expect(t.trimEnd().endsWith('Return only the structured_output tool call.')).toBe(true)
  })
})
