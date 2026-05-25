import type {
  NodeDispatcher,
  NodeInputBundle,
  NodeOutput,
  ResolvedImpl,
  RunContext,
} from '@openexpertise/core'
import type { NodeSpec, ToolNodeSpec } from '@openexpertise/schema'
import { loadToolModule, type LoadedToolModule } from './loader.js'

interface ToolImpl extends ResolvedImpl {
  module: LoadedToolModule
  nodeId: string
  [k: string]: unknown
}

export class ToolDispatcher implements NodeDispatcher {
  readonly kind = 'tool' as const

  async resolve(node: NodeSpec, ctx: RunContext): Promise<ToolImpl> {
    if (node.kind !== 'tool') throw new Error(`ToolDispatcher cannot resolve kind=${node.kind}`)
    const t = node as ToolNodeSpec
    const mod = await loadToolModule(t.impl, ctx.experienceDir)
    return { module: mod, nodeId: t.id }
  }

  async run(impl: ResolvedImpl, bundle: NodeInputBundle, _ctx: RunContext): Promise<NodeOutput> {
    const ti = impl as ToolImpl
    const fn = ti.module.default
    if (typeof fn !== 'function') {
      throw new Error(`Tool "${ti.nodeId}" module has no default export (or it is not a function)`)
    }
    const result = await fn({
      ...bundle.args,
      _edge_inputs: bundle.edge_inputs,
      _state: bundle.state_view,
    })
    if (result === null || typeof result !== 'object') {
      throw new Error(
        `Tool "${ti.nodeId}" default export must return an object with at least { state_delta }`,
      )
    }
    const obj = result as Record<string, unknown>
    const out: NodeOutput = {
      state_delta: (obj['state_delta'] as Record<string, unknown>) ?? {},
    }
    if (obj['edge_output'] !== undefined) {
      out.edge_output = obj['edge_output']
    }
    if (obj['metrics']) {
      out.metrics = obj['metrics'] as NonNullable<NodeOutput['metrics']>
    }
    return out
  }
}
