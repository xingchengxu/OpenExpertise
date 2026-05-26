import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import type { ToolHandler } from './tools/types.js'
import { validateTool } from './tools/validate.js'
import { stateTool } from './tools/state.js'
import { inspectTool } from './tools/inspect.js'
import { runTool } from './tools/run.js'
import { evolveTool } from './tools/evolve.js'
import { ultraTool } from './tools/ultra.js'

const ALL_TOOLS: ToolHandler[] = [
  validateTool,
  stateTool,
  inspectTool,
  runTool,
  evolveTool,
  ultraTool,
]

export interface CreateServerOpts {
  // Reserved for future DI (e.g., custom logger or test overrides).
  // Kept as an object param so the signature can grow without breaking callers.
}

export function createServer(_opts: CreateServerOpts = {}): Server {
  const server = new Server(
    { name: 'openexpertise', version: '0.1.0' },
    { capabilities: { tools: {} } },
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: ALL_TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }))

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params
    const tool = ALL_TOOLS.find((t) => t.name === name)
    if (!tool) {
      return {
        content: [{ type: 'text', text: `unknown tool: ${name}` }],
        isError: true,
      }
    }
    try {
      const result = await tool.call((args ?? {}) as Record<string, unknown>)
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    } catch (err) {
      return {
        content: [{ type: 'text', text: `error in ${name}: ${(err as Error).message}` }],
        isError: true,
      }
    }
  })

  return server
}
