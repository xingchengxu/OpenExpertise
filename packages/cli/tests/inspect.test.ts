import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
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
})
