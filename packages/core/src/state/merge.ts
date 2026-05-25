import type { MergeStrategy, StateFieldSchema } from '@openexpertise/schema'

export interface MergeContext {
  field: string
  schema: StateFieldSchema
  existing: unknown
  incoming: unknown
}

export function applyMerge(ctx: MergeContext): unknown {
  // $ref-only field schemas don't carry merge metadata — treat as last_wins.
  const strategy: MergeStrategy =
    'merge' in ctx.schema ? (ctx.schema.merge ?? 'last_wins') : 'last_wins'
  switch (strategy) {
    case 'array_append': {
      if (!Array.isArray(ctx.incoming)) {
        throw new Error(`Field "${ctx.field}" uses array_append but write is not an array`)
      }
      const base = Array.isArray(ctx.existing) ? ctx.existing : []
      return [...base, ...ctx.incoming]
    }
    case 'set_once': {
      if (ctx.existing !== undefined && ctx.existing !== null) {
        throw new Error(`Field "${ctx.field}" is set_once and already has a value`)
      }
      return ctx.incoming
    }
    case 'last_wins':
    default:
      return ctx.incoming
  }
}
