import type { NodeKind } from '@openexpertise/schema'
import type { NodeDispatcher } from './types.js'
export type { NodeDispatcher, NodeInputBundle, NodeOutput, ResolvedImpl } from './types.js'

export class DispatcherRegistry {
  private readonly map = new Map<NodeKind, NodeDispatcher>()

  register(dispatcher: NodeDispatcher): void {
    if (this.map.has(dispatcher.kind)) {
      throw new Error(`Dispatcher for kind "${dispatcher.kind}" already registered`)
    }
    this.map.set(dispatcher.kind, dispatcher)
  }

  get(kind: NodeKind): NodeDispatcher {
    const d = this.map.get(kind)
    if (!d) throw new Error(`No dispatcher registered for kind "${kind}"`)
    return d
  }

  has(kind: NodeKind): boolean {
    return this.map.has(kind)
  }
}
