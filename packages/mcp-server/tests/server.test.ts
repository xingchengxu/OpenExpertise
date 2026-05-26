import { describe, it, expect } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import {
  InMemoryTransport,
} from '@modelcontextprotocol/sdk/inMemory.js'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
    expect(names).toEqual(expect.arrayContaining(['oe_validate', 'oe_state']))
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
})
