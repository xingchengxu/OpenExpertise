import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspectCommand } from '../src/commands/inspect.js'

let dir: string
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

describe('inspectCommand', () => {
  it('emits events sorted by ts even if the JSONL is out of order', async () => {
    dir = mkdtempSync(join(tmpdir(), 'oe-inspect-'))
    mkdirSync(join(dir, '.openexpertise/runs'), { recursive: true })
    const lines = [
      JSON.stringify({ type: 'node.started', node_id: 'b', ts: '2026-05-26T00:00:02Z' }),
      JSON.stringify({ type: 'node.started', node_id: 'a', ts: '2026-05-26T00:00:01Z' }),
      JSON.stringify({ type: 'node.finished', node_id: 'a', ts: '2026-05-26T00:00:03Z' }),
      JSON.stringify({ type: 'run.started', ts: '2026-05-26T00:00:00Z' }),
    ]
    writeFileSync(join(dir, '.openexpertise/runs/r1.jsonl'), lines.join('\n'))

    const emitted: Array<{ ts: string; type: string }> = []
    const logger = {
      info: (event: { ts: string; type: string }) =>
        emitted.push({ ts: event.ts, type: event.type }),
      error: () => {},
      warn: () => {},
      debug: () => {},
    } as never

    const code = await inspectCommand({ experiencePath: dir, runId: 'r1', logger })
    expect(code).toBe(0)
    // Sorted by ts ascending
    expect(emitted.map((e) => e.ts)).toEqual([
      '2026-05-26T00:00:00Z',
      '2026-05-26T00:00:01Z',
      '2026-05-26T00:00:02Z',
      '2026-05-26T00:00:03Z',
    ])
  })

  it('renders a self-contained HTML run report with --html and writes to --out', async () => {
    dir = mkdtempSync(join(tmpdir(), 'oe-inspect-html-'))
    mkdirSync(join(dir, '.openexpertise/runs'), { recursive: true })

    // Seed a JSONL run log with node events matching the spec's node ids
    const runId = 'html-test-run-1'
    const lines = [
      JSON.stringify({ type: 'run.started', run_id: runId, ts: '2026-05-26T00:00:00Z' }),
      JSON.stringify({ type: 'node.started', run_id: runId, node_id: 'step_a', ts: '2026-05-26T00:00:01Z' }),
      JSON.stringify({ type: 'node.finished', run_id: runId, node_id: 'step_a', ts: '2026-05-26T00:00:03Z', metrics: { tokens_in: 10, tokens_out: 5 } }),
      JSON.stringify({ type: 'node.started', run_id: runId, node_id: 'step_b', ts: '2026-05-26T00:00:03Z' }),
      JSON.stringify({ type: 'node.failed', run_id: runId, node_id: 'step_b', ts: '2026-05-26T00:00:04Z', error: 'something went wrong' }),
      JSON.stringify({ type: 'run.finished', run_id: runId, ts: '2026-05-26T00:00:05Z', status: 'failed' }),
    ]
    writeFileSync(join(dir, `.openexpertise/runs/${runId}.jsonl`), lines.join('\n'))

    // Seed an experience.yaml with nodes matching the node_ids above
    const experienceYaml = `name: test-experience
version: 0.1.0
state:
  schema: {}
graph:
  nodes:
    - id: step_a
      kind: tool
      impl: ./tools/a.mjs
    - id: step_b
      kind: agent
      prompt: ./prompts/b.md
  edges:
    - from: step_a
      to: step_b
`
    writeFileSync(join(dir, 'experience.yaml'), experienceYaml)

    const outFile = join(dir, 'report.html')
    const logs: string[] = []
    const logger = {
      info: (obj: unknown, msg?: string) => logs.push(String(msg ?? obj)),
      error: (obj: unknown, msg?: string) => logs.push(String(msg ?? obj)),
      warn: () => {},
      debug: () => {},
    } as never

    const code = await inspectCommand({
      experiencePath: dir,
      runId,
      html: true,
      out: outFile,
      logger,
    })

    expect(code).toBe(0)
    const html = readFileSync(outFile, 'utf8')
    expect(html).toContain('<!doctype html>')
    expect(html).toContain('class="mermaid"')
    expect(html).toContain(':::status_')
    expect(html).toContain(runId)
  })
})
