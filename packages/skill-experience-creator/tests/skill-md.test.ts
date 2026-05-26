import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'

const HERE = dirname(fileURLToPath(import.meta.url))
const SKILL_MD = join(HERE, '..', 'SKILL.md')

describe('SKILL.md', () => {
  it('parses as valid frontmatter + body', () => {
    const src = readFileSync(SKILL_MD, 'utf8')
    const { data, content } = matter(src)
    expect(data.name).toBe('experience-creator')
    expect(typeof data.description).toBe('string')
    expect(data.description.length).toBeGreaterThan(50)
    expect(content).toContain('# Experience Creator')
    expect(content).toContain('Step 1')
    expect(content).toContain('Step 5')
  })
})
