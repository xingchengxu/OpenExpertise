import hash from 'object-hash'
import type { NodeSpec } from '@openexpertise/schema'

export interface CacheKeyInput {
  nodeSpec: NodeSpec
  stateView: Record<string, unknown>
  edgeInputs: Record<string, unknown>
  args: Record<string, unknown>
  runtimeVersion: string
}

export function computeCacheKey(input: CacheKeyInput): string {
  return hash(
    {
      n: input.nodeSpec,
      s: input.stateView,
      e: input.edgeInputs,
      a: input.args,
      v: input.runtimeVersion,
    },
    { algorithm: 'sha256', encoding: 'hex' },
  )
}
