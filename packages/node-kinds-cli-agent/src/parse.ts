import Ajv from 'ajv'

const ajv = new Ajv({ allErrors: true, strict: false })

export interface ParseOpts {
  stdout: string
  outputFormat: 'text' | 'json'
  writes: string[]
  schema?: Record<string, unknown>
  nodeId?: string
}

export function parseOutput(opts: ParseOpts): Record<string, unknown> {
  const tag = opts.nodeId ? ` for node "${opts.nodeId}"` : ''
  if (opts.outputFormat === 'text') {
    if (opts.writes.length === 0) return {}
    if (opts.writes.length > 1) {
      throw new Error(
        `cli-agent${tag}: text mode requires zero or one writes field; got ${opts.writes.length}. ` +
          `Use output_format: json with a schema for multi-field output.`,
      )
    }
    const field = opts.writes[0]!
    return { [field]: opts.stdout }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(opts.stdout)
  } catch (err) {
    throw new Error(
      `cli-agent${tag}: stdout was not valid JSON (${(err as Error).message}); raw start: ${opts.stdout.slice(0, 120)}`,
    )
  }

  if (opts.schema) {
    const validate = ajv.compile(opts.schema)
    if (!validate(parsed)) {
      const msgs = (validate.errors ?? []).map(
        (e) => `${e.instancePath || '(root)'}: ${e.message ?? 'invalid'}`,
      )
      throw new Error(
        `cli-agent${tag}: parsed output failed schema validation: ${msgs.join(', ')}`,
      )
    }
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(
      `cli-agent${tag}: JSON output must be a plain object (got ${typeof parsed}); ` +
        `the dispatcher needs key-value pairs to map into state_delta.`,
    )
  }
  return parsed as Record<string, unknown>
}
