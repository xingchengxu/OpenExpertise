import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

export interface McpResourceOpts {
  server: string
  uri: string
  experienceDir: string
  nodeId: string
}

interface McpJsonServer {
  command: string
  args?: string[]
  env?: Record<string, string>
}

interface McpJson {
  servers?: Record<string, McpJsonServer>
}

interface MaybeBlob {
  text?: string
  blob?: string
  mimeType?: string
  uri?: string
}

function loadMcpJson(experienceDir: string, nodeId: string): Record<string, McpJsonServer> {
  const path = resolve(experienceDir, 'mcp.json')
  if (!existsSync(path)) {
    throw new Error(
      `mcp-resource source on node "${nodeId}" requires \`mcp.json\` at ${experienceDir}/mcp.json to map server names to spawn commands. ` +
        `Create it with shape { "servers": { "<name>": { "command": "...", "args": [...] } } }. See docs/registry.md.`,
    )
  }
  let parsed: McpJson
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`Could not parse ${path}: ${msg}`)
  }
  if (!parsed.servers || typeof parsed.servers !== 'object') {
    throw new Error(`${path} is missing a \`servers\` object at the top level.`)
  }
  return parsed.servers
}

function normalizeContents(contents: unknown[]): unknown[] {
  // Each item is { uri, mimeType?, text? | blob? }
  const items = contents as MaybeBlob[]
  const rows: unknown[] = []
  for (const item of items) {
    if (typeof item.text === 'string') {
      // Try JSON parse: if it's an array, spread; if object, push; otherwise push as { text }
      const trimmed = item.text.trim()
      if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
        try {
          const parsed = JSON.parse(trimmed)
          if (Array.isArray(parsed)) {
            rows.push(...parsed)
          } else {
            rows.push(parsed)
          }
          continue
        } catch {
          // fall through to push as text
        }
      }
      rows.push({ text: item.text, ...(item.mimeType ? { mimeType: item.mimeType } : {}) })
    } else if (typeof item.blob === 'string') {
      rows.push({ blob: item.blob, ...(item.mimeType ? { mimeType: item.mimeType } : {}) })
    } else {
      rows.push(item)
    }
  }
  return rows
}

export async function loadMcpResourceSource(opts: McpResourceOpts): Promise<unknown[]> {
  const servers = loadMcpJson(opts.experienceDir, opts.nodeId)
  const serverConfig = servers[opts.server]
  if (!serverConfig) {
    const available = Object.keys(servers).join(', ') || '(none)'
    throw new Error(
      `MCP server "${opts.server}" referenced by node "${opts.nodeId}" is not declared in ${opts.experienceDir}/mcp.json. Available servers: ${available}. Add it under the \`servers\` object.`,
    )
  }

  const transport = new StdioClientTransport({
    command: serverConfig.command,
    args: serverConfig.args ?? [],
    env: { ...process.env, ...(serverConfig.env ?? {}) } as Record<string, string>,
  })

  const client = new Client(
    {
      name: 'openexpertise-dataset',
      version: '0.1.1',
    },
    {
      capabilities: {},
    },
  )

  try {
    try {
      await client.connect(transport)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(
        `MCP server "${opts.server}" failed to start: ${msg}. ` +
          `Check that \`${serverConfig.command} ${(serverConfig.args ?? []).join(' ')}\` runs standalone.`,
      )
    }

    let response
    try {
      response = await client.readResource({ uri: opts.uri })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(
        `MCP server "${opts.server}" failed to read resource "${opts.uri}": ${msg}. ` +
          `Check the URI is correct and the server has access.`,
      )
    }

    const contents = response.contents
    if (!Array.isArray(contents)) {
      throw new Error(
        `MCP server "${opts.server}" returned non-array \`contents\` for "${opts.uri}". ` +
          `Expected MCP v1 resources/read response shape.`,
      )
    }
    return normalizeContents(contents)
  } finally {
    try {
      await client.close()
    } catch {
      // best-effort teardown
    }
  }
}
