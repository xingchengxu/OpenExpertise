// Tiny {{placeholder}} interpolation. Used by AgentDispatcher and SkillDispatcher
// to fill prompt templates with values from the resolved input bundle.

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g

export interface InterpolateOpts {
  template: string
  values: Record<string, unknown>
  // When a placeholder is not in `values`, throw (default true) vs leave as-is (false).
  strict?: boolean
}

export function interpolatePrompt(opts: InterpolateOpts): string {
  const strict = opts.strict ?? true
  return opts.template.replace(PLACEHOLDER_RE, (match, key: string) => {
    if (!(key in opts.values)) {
      if (strict) {
        throw new Error(`Prompt placeholder "{{${key}}}" has no value in the input bundle`)
      }
      return match
    }
    const v = opts.values[key]
    if (typeof v === 'string') return v
    return JSON.stringify(v)
  })
}
