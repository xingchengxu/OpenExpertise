#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createServer } from './server.js'

async function main() {
  const server = createServer({})
  const transport = new StdioServerTransport()
  await server.connect(transport)
  // Stay alive; transport keeps the process running until stdin closes.
}

main().catch((err) => {
  console.error(`oe-mcp failed to start: ${(err as Error).message}`)
  process.exit(1)
})
