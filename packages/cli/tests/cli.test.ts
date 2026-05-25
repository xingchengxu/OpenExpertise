import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { buildProgram } from '../src/index.js'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'oe-cli-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

describe('oe CLI', () => {
  it('exits 0 on valid experience', async () => {
    const yaml = `
name: t
version: 0.1.0
state: { schema: { greeting: { type: string } } }
graph:
  nodes: [{ id: g, kind: tool, impl: ./greet.mjs, writes: [greeting] }]
  edges: []
`
    writeFileSync(join(dir, 'experience.yaml'), yaml)
    const program = buildProgram()
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit') })
    await expect(program.parseAsync(['node', 'oe', 'validate', dir]))
      .rejects.toThrow('exit')
    expect(exit).toHaveBeenCalledWith(0)
    exit.mockRestore()
  })
})
