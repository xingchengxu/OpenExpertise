// Tiny JSONPath-like resolver. Supports only $.field.subfield syntax in Plan 1.
// Plan 2 will add operators (==, &&, etc.) for `when:` / `until:` predicates.

const PATH_RE = /^\$\.[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)*$/

export function resolveExpression(value: unknown, state: Record<string, unknown>): unknown {
  if (typeof value === 'string' && PATH_RE.test(value)) {
    return resolvePath(value, state)
  }
  if (Array.isArray(value)) {
    return value.map((v) => resolveExpression(v, state))
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      out[k] = resolveExpression(v, state)
    }
    return out
  }
  return value
}

function resolvePath(path: string, state: Record<string, unknown>): unknown {
  const parts = path.slice(2).split('.') // strip leading "$."
  let cur: unknown = state
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined
    if (typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[p]
  }
  return deepCopy(cur)
}

function deepCopy<T>(v: T): T {
  if (v === null || typeof v !== 'object') return v
  return JSON.parse(JSON.stringify(v))
}
