// Each tool exports a handler with this contract.
// Tools added in later tasks register themselves via the registry in server.ts.
export interface ToolHandler {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  call(args: Record<string, unknown>): Promise<unknown>
}
