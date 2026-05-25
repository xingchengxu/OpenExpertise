import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SCRIPT = join(HERE, '..', 'scripts', 'validate-experience.mjs')
const HELLO = join(HERE, '..', 'assets', 'examples', 'hello-tool', 'experience.yaml')

describe('validate-experience.mjs', () => {
  it('exits 0 on a valid experience', () => {
    const out = execFileSync('node', [SCRIPT, HELLO], { encoding: 'utf8' })
    expect(out).toContain('OK:')
  })
  it('exits non-zero on a missing file', () => {
    expect(() => execFileSync('node', [SCRIPT, '/does/not/exist.yaml'], { encoding: 'utf8' })).toThrow()
  })
})
