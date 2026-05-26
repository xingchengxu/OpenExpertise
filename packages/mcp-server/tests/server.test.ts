import { describe, it, expect } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import {
  InMemoryTransport,
} from '@modelcontextprotocol/sdk/inMemory.js'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createServer } from '../src/server.js'

async function connectClient() {
  const server = createServer({})
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  const client = new Client({ name: 'test-client', version: '0.0.0' }, { capabilities: {} })
  await client.connect(clientTransport)
  return { client, server }
}

describe('mcp-server', () => {
  it('listTools returns the registered set (empty in skeleton)', async () => {
    const { client } = await connectClient()
    const result = await client.listTools()
    const names = result.tools.map((t) => t.name).sort()
    // Will grow to the full 5 as Tasks 4-8 register tools. Skeleton task asserts
    // the framework is wired and listTools round-trips.
    expect(Array.isArray(names)).toBe(true)
    expect(names).toEqual(['oe_evolve', 'oe_inspect', 'oe_run', 'oe_state', 'oe_validate'])
  })

  it('oe_validate accepts a well-formed experience and reports valid', async () => {
    const { client } = await connectClient()
    const dir = mkdtempSync(join(tmpdir(), 'oe-mcp-validate-'))
    try {
      writeFileSync(
        join(dir, 'experience.yaml'),
        `name: t
version: 0.1.0
state: { schema: { x: { type: string } } }
graph:
  nodes: [{ id: a, kind: tool, impl: ./x.mjs, writes: [x] }]
  edges: []`,
      )
      const result = await client.callTool({
        name: 'oe_validate',
        arguments: { experience_path: dir },
      })
      const content = result.content as Array<{ type: string; text: string }>
      const payload = JSON.parse(content[0]!.text) as { valid: boolean; errors?: string[] }
      expect(payload.valid).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('oe_validate reports errors when experience is malformed', async () => {
    const { client } = await connectClient()
    const dir = mkdtempSync(join(tmpdir(), 'oe-mcp-validate-bad-'))
    try {
      writeFileSync(join(dir, 'experience.yaml'), `name: missing-graph\nversion: 0.1.0\n`)
      const result = await client.callTool({
        name: 'oe_validate',
        arguments: { experience_path: dir },
      })
      const content = result.content as Array<{ type: string; text: string }>
      const payload = JSON.parse(content[0]!.text) as { valid: boolean; errors?: string[] }
      expect(payload.valid).toBe(false)
      expect(payload.errors?.length ?? 0).toBeGreaterThan(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('oe_state returns "no state yet" when no runs have happened', async () => {
    const { client } = await connectClient()
    const dir = mkdtempSync(join(tmpdir(), 'oe-mcp-state-'))
    try {
      writeFileSync(
        join(dir, 'experience.yaml'),
        `name: t
version: 0.1.0
state: { schema: { x: { type: string } } }
graph: { nodes: [{ id: a, kind: tool, impl: ./x.mjs, writes: [x] }], edges: [] }`,
      )
      const result = await client.callTool({
        name: 'oe_state',
        arguments: { experience_path: dir },
      })
      const content = result.content as Array<{ type: string; text: string }>
      const payload = JSON.parse(content[0]!.text) as { snapshot?: unknown; note?: string }
      expect(payload.note).toMatch(/no runs/i)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('oe_run executes hello-tool and returns final state', async () => {
    const { client } = await connectClient()
    // Use the actual hello-tool example (LLM-free, deterministic).
    const helloPath = resolve(import.meta.dirname, '..', '..', '..', 'examples', 'hello-tool')
    const result = await client.callTool({
      name: 'oe_run',
      arguments: { experience_path: helloPath },
    })
    const content = result.content as Array<{ type: string; text: string }>
    const payload = JSON.parse(content[0]!.text) as {
      run_id: string
      status: string
      final_state: Record<string, unknown>
    }
    expect(payload.status).toBe('success')
    expect(payload.final_state).toHaveProperty('greeting')
    expect(payload.run_id).toMatch(/^[0-9a-f-]+$/)
  }, 30000)

  it('oe_inspect reads the event log for a run', async () => {
    const { client } = await connectClient()
    const dir = mkdtempSync(join(tmpdir(), 'oe-mcp-inspect-'))
    try {
      const runsDir = join(dir, '.openexpertise', 'runs')
      mkdirSync(runsDir, { recursive: true })
      const events = [
        { type: 'run.started', run_id: 'r1', ts: '2026-05-26T00:00:00Z' },
        { type: 'node.completed', run_id: 'r1', node_id: 'a', ts: '2026-05-26T00:00:01Z' },
        { type: 'run.finished', run_id: 'r1', ts: '2026-05-26T00:00:02Z', status: 'success' },
      ]
      writeFileSync(
        join(runsDir, 'r1.jsonl'),
        events.map((e) => JSON.stringify(e)).join('\n'),
      )
      const result = await client.callTool({
        name: 'oe_inspect',
        arguments: { experience_path: dir, run_id: 'r1' },
      })
      const content = result.content as Array<{ type: string; text: string }>
      const payload = JSON.parse(content[0]!.text) as { events: unknown[] }
      expect(payload.events.length).toBe(3)
      expect((payload.events[0] as { type: string }).type).toBe('run.started')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('oe_evolve throws a helpful error when no LLM env var is set', async () => {
    const { client } = await connectClient()
    const dir = mkdtempSync(join(tmpdir(), 'oe-mcp-evolve-'))
    try {
      const runsDir = join(dir, '.openexpertise', 'runs')
      mkdirSync(runsDir, { recursive: true })
      writeFileSync(
        join(dir, 'experience.yaml'),
        `name: t
version: 0.1.0
state: { schema: { x: { type: string } } }
graph: { nodes: [{ id: a, kind: tool, impl: ./x.mjs, writes: [x] }], edges: [] }`,
      )
      writeFileSync(
        join(runsDir, 'r1.jsonl'),
        JSON.stringify({ type: 'run.started', run_id: 'r1' }),
      )
      // Clear any LLM env vars for this test.
      const prevA = process.env.ANTHROPIC_API_KEY
      const prevO = process.env.OPENAI_API_KEY
      delete process.env.ANTHROPIC_API_KEY
      delete process.env.OPENAI_API_KEY
      try {
        const result = await client.callTool({
          name: 'oe_evolve',
          arguments: { experience_path: dir, run_id: 'r1' },
        })
        expect(result.isError).toBe(true)
        const content = result.content as Array<{ type: string; text: string }>
        expect(content[0]!.text).toMatch(/ANTHROPIC_API_KEY|OPENAI_API_KEY/)
      } finally {
        if (prevA !== undefined) process.env.ANTHROPIC_API_KEY = prevA
        if (prevO !== undefined) process.env.OPENAI_API_KEY = prevO
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
