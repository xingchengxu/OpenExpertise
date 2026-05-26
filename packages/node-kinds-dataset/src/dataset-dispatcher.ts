import type {
  NodeDispatcher,
  NodeInputBundle,
  NodeOutput,
  ResolvedImpl,
  RunContext,
} from '@openexpertise/core'
import type { NodeSpec, DatasetNodeSpec } from '@openexpertise/schema'
import { loadFileSource } from './sources/file.js'
import { loadSqliteSource } from './sources/sqlite.js'
import { loadHttpSource } from './sources/http.js'

interface DatasetImpl extends ResolvedImpl {
  spec: DatasetNodeSpec
  [k: string]: unknown
}

export class DatasetDispatcher implements NodeDispatcher {
  readonly kind = 'dataset' as const

  async resolve(node: NodeSpec, _ctx: RunContext): Promise<DatasetImpl> {
    if (node.kind !== 'dataset') {
      throw new Error(`DatasetDispatcher cannot resolve kind=${node.kind}`)
    }
    return { spec: node as DatasetNodeSpec }
  }

  async run(impl: ResolvedImpl, _bundle: NodeInputBundle, ctx: RunContext): Promise<NodeOutput> {
    const di = impl as DatasetImpl
    const writes = di.spec.writes ?? []
    if (writes.length !== 1) {
      throw new Error(
        `Dataset "${di.spec.id}" must declare exactly one write field; got ${writes.length}`,
      )
    }
    const writeField = writes[0] as string

    let rows: unknown[]
    const src = di.spec.source
    switch (src.type) {
      case 'file':
        rows = loadFileSource({
          uri: src.uri,
          ...(src.format ? { format: src.format } : {}),
          experienceDir: ctx.experienceDir,
        })
        break
      case 'sqlite':
        rows = loadSqliteSource({
          uri: src.uri,
          query: src.query,
          experienceDir: ctx.experienceDir,
        })
        break
      case 'http':
        rows = await loadHttpSource({
          url: src.url,
          ...(src.method ? { method: src.method } : {}),
          ...(src.body !== undefined ? { body: src.body } : {}),
        })
        break
      case 'mcp-resource':
        throw new Error(`mcp-resource dataset source is not implemented in V1`)
      default: {
        const _exhaustive: never = src
        throw new Error(`Unknown dataset source: ${JSON.stringify(_exhaustive)}`)
      }
    }

    return { state_delta: { [writeField]: rows } }
  }
}
