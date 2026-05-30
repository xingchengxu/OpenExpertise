import { describe, it, expect, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { schemaCommand } from '../src/commands/schema.js'

const noopLogger = { info: () => {}, error: () => {}, warn: () => {}, debug: () => {} } as never

describe('schemaCommand', () => {
  let dir: string
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  it('prints JSON containing "$id" to stdout and exits 0 (default, no --write)', async () => {
    const writes: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(((s: string) => {
      writes.push(String(s))
      return true
    }) as never)
    const code = await schemaCommand({ logger: noopLogger })
    spy.mockRestore()
    expect(code).toBe(0)
    const out = writes.join('')
    expect(out).toContain('"$id"')
    // Ensure it's valid JSON
    const parsed = JSON.parse(out) as Record<string, unknown>
    expect(typeof parsed.$id).toBe('string')
  })

  it('writes a file whose parsed JSON has a $schema key and exits 0 (--write --out <file>)', async () => {
    dir = mkdtempSync(join(tmpdir(), 'oe-schema-'))
    const outFile = join(dir, 'exp.schema.json')
    const code = await schemaCommand({ logger: noopLogger, write: true, out: outFile })
    expect(code).toBe(0)
    const contents = readFileSync(outFile, 'utf8')
    const parsed = JSON.parse(contents) as Record<string, unknown>
    expect(typeof parsed.$schema).toBe('string')
    expect(parsed.$schema as string).toContain('draft-07')
  })

  it('writes experience.schema.json to cwd when --write is set without --out', async () => {
    dir = mkdtempSync(join(tmpdir(), 'oe-schema-cwd-'))
    const origCwd = process.cwd()
    process.chdir(dir)
    try {
      const code = await schemaCommand({ logger: noopLogger, write: true })
      expect(code).toBe(0)
      const contents = readFileSync(join(dir, 'experience.schema.json'), 'utf8')
      const parsed = JSON.parse(contents) as Record<string, unknown>
      expect(typeof parsed.$id).toBe('string')
    } finally {
      process.chdir(origCwd)
    }
  })
})
