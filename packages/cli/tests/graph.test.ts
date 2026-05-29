import { describe, it, expect, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { graphCommand } from '../src/commands/graph.js'

const YAML = `name: demo
version: 0.1.0
state:
  schema:
    x: { type: string }
phases:
  - { id: main }
graph:
  nodes:
    - { id: a, kind: tool, phase: main, impl: ./t.mjs, writes: [x] }
    - { id: b, kind: agent, phase: main, prompt: ./p.md, reads: [x], writes: [x] }
  edges:
    - { from: a, to: b }
`
const noopLogger = { info: () => {}, error: () => {}, warn: () => {}, debug: () => {} } as never

describe('graphCommand', () => {
  let dir: string
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  it('prints Mermaid flowchart to stdout and exits 0', async () => {
    dir = mkdtempSync(join(tmpdir(), 'oe-graph-'))
    writeFileSync(join(dir, 'experience.yaml'), YAML)
    const writes: string[] = []
    const spy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(((s: string) => {
        writes.push(String(s))
        return true
      }) as never)
    const code = await graphCommand({ path: dir, logger: noopLogger })
    spy.mockRestore()
    expect(code).toBe(0)
    const out = writes.join('')
    expect(out).toContain('flowchart TD')
    expect(out).toContain('a["a"]:::tool')
    expect(out).toContain('a --> b')
  })

  it('writes HTML to a file with -o and exits 0', async () => {
    dir = mkdtempSync(join(tmpdir(), 'oe-graph-html-'))
    writeFileSync(join(dir, 'experience.yaml'), YAML)
    const outFile = join(dir, 'graph.html')
    const code = await graphCommand({ path: dir, html: true, out: outFile, logger: noopLogger })
    expect(code).toBe(0)
    const html = readFileSync(outFile, 'utf8')
    expect(html).toContain('<!doctype html>')
    expect(html).toContain('class="mermaid"')
    expect(html).toContain('flowchart TD')
  })

  it('returns 1 when the experience is not found', async () => {
    dir = mkdtempSync(join(tmpdir(), 'oe-graph-missing-'))
    const code = await graphCommand({ path: join(dir, 'nope'), logger: noopLogger })
    expect(code).toBe(1)
  })
})
