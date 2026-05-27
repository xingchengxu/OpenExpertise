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
        throw new Error(
          `State field "${ctx.field}" is configured with \`merge: array_append\` in state.schema, ` +
            `but the node wrote a ${typeof ctx.incoming} instead of an array. ` +
            `Fix the node's output to produce an array, or change the merge strategy in state.schema.`,
        )
      }
      const base = Array.isArray(ctx.existing) ? ctx.existing : []
      return [...base, ...ctx.incoming]
    }
    case 'set_once': {
      if (ctx.existing !== undefined && ctx.existing !== null) {
        throw new Error(
          `State field "${ctx.field}" is configured with \`merge: set_once\` but it already has a value. ` +
            `set_once fields can only be written once per run. ` +
            `To allow overwrites, change \`merge: set_once\` to \`merge: last_wins\` in state.schema.`,
        )
      }
      return ctx.incoming
    }
    case 'last_wins':
    default:
      return ctx.incoming
  }
}
