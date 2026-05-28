import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadMcpResourceSource } from '../src/sources/mcp-resource.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const TEST_SERVER = resolve(HERE, 'fixtures', 'mcp-test-server.mjs')

function makeExperienceDir(serverConfig: Record<string, unknown> | null): string {
  const dir = mkdtempSync(join(tmpdir(), 'oe-mcp-test-'))
  if (serverConfig !== null) {
    writeFileSync(join(dir, 'mcp.json'), JSON.stringify({ servers: serverConfig }, null, 2))
  }
  return dir
}

describe('mcp-resource dataset source', () => {
  let dir: string

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  it('reads a JSON-array resource and returns rows', async () => {
    dir = makeExperienceDir({ test: { command: 'node', args: [TEST_SERVER] } })
    const rows = await loadMcpResourceSource({
      server: 'test',
      uri: 'test://items/list',
      experienceDir: dir,
      nodeId: 'node1',
    })
    expect(rows.length).toBe(3)
    expect(rows[0]).toMatchObject({ id: 1, name: 'alpha' })
  }, 15000)

  it('wraps a single-object JSON resource as a 1-element array', async () => {
    dir = makeExperienceDir({ test: { command: 'node', args: [TEST_SERVER] } })
    const rows = await loadMcpResourceSource({
      server: 'test',
      uri: 'test://single-obj',
      experienceDir: dir,
      nodeId: 'node1',
    })
    expect(rows.length).toBe(1)
    expect(rows[0]).toMatchObject({ kind: 'singleton', value: 42 })
  }, 15000)

  it('returns text content as { text } when not JSON', async () => {
    dir = makeExperienceDir({ test: { command: 'node', args: [TEST_SERVER] } })
    const rows = await loadMcpResourceSource({
      server: 'test',
      uri: 'test://doc',
      experienceDir: dir,
      nodeId: 'node1',
    })
    expect(rows.length).toBe(1)
    expect(rows[0]).toMatchObject({ text: 'Hello from MCP test server.' })
  }, 15000)

  it('errors helpfully when mcp.json is missing', async () => {
    dir = makeExperienceDir(null)
    await expect(
      loadMcpResourceSource({
        server: 'test',
        uri: 'test://anything',
        experienceDir: dir,
        nodeId: 'node1',
      }),
    ).rejects.toThrow(/mcp.json/)
  })

  it('errors helpfully when server name is unknown', async () => {
    dir = makeExperienceDir({ other: { command: 'node', args: [TEST_SERVER] } })
    await expect(
      loadMcpResourceSource({
        server: 'test',
        uri: 'test://items/list',
        experienceDir: dir,
        nodeId: 'node1',
      }),
    ).rejects.toThrow(/not declared/)
  })

  it('errors helpfully when resource uri is unknown', async () => {
    dir = makeExperienceDir({ test: { command: 'node', args: [TEST_SERVER] } })
    await expect(
      loadMcpResourceSource({
        server: 'test',
        uri: 'test://does-not-exist',
        experienceDir: dir,
        nodeId: 'node1',
      }),
    ).rejects.toThrow(/failed to read resource/)
  }, 15000)
})
