import type { NodeKind, NodeSpec } from '@openexpertise/schema'
import type { RunContext } from '../run/context.js'

export interface NodeInputBundle {
  state_view: Readonly<Record<string, unknown>>
  edge_inputs: Record<string, unknown>
  args: Record<string, unknown>
}

export interface NodeOutput {
  state_delta: Record<string, unknown>
  edge_output?: unknown
  metrics?: { tokens_in?: number; tokens_out?: number; cost_usd?: number }
}

export interface ResolvedImpl {
  /* opaque to the runtime; each dispatcher fills it as needed */
  [k: string]: unknown
}

export interface NodeDispatcher {
  readonly kind: NodeKind
  resolve(node: NodeSpec, ctx: RunContext): Promise<ResolvedImpl>
  run(impl: ResolvedImpl, bundle: NodeInputBundle, ctx: RunContext): Promise<NodeOutput>
}
