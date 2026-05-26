import { readFileSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import type { ToolHandler } from './types.js'

export const inspectTool: ToolHandler = {
  name: 'oe_inspect',
  description:
    'Return the parsed event log for a prior run. Each event is one parsed JSONL line.',
  inputSchema: {
    type: 'object',
    required: ['experience_path', 'run_id'],
    properties: {
      experience_path: { type: 'string' },
      run_id: { type: 'string' },
    },
  },
  async call(args) {
    const p = args['experience_path']
    const runId = args['run_id']
    if (typeof p !== 'string') throw new Error('experience_path is required')
    if (typeof runId !== 'string') throw new Error('run_id is required')
    const dir = resolve(p)
    const logPath = join(dir, '.openexpertise', 'runs', `${runId}.jsonl`)
    if (!existsSync(logPath)) {
      throw new Error(`run log not found at ${logPath}`)
    }
    const events = readFileSync(logPath, 'utf8')
      .trim()
      .split('\n')
      .filter((l) => l.length > 0)
      .map((l) => JSON.parse(l))
    return { events }
  },
}
