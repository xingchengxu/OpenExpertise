import { describe, it, expect } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import {
  InMemoryTransport,
} from '@modelcontextprotocol/sdk/inMemory.js'
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
    expect(names).toEqual([])
  })
})
