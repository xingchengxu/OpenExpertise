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
  const candidate = extractJsonCandidate(opts.stdout)
  try {
    parsed = JSON.parse(candidate)
  } catch (err) {
    throw new Error(
      `cli-agent${tag} was configured with \`output_format: json\` but stdout is not valid JSON ` +
        `(${(err as Error).message}). ` +
        `First 200 chars: '${opts.stdout.slice(0, 200)}'. ` +
        `Common causes: the prompt didn't include a JSON contract; ` +
        `the CLI wrapped JSON in markdown fences (add 'output JSON only, no markdown' to the prompt).`,
    )
  }

  if (opts.schema) {
    const validate = ajv.compile(opts.schema)
    if (!validate(parsed)) {
      const msgs = (validate.errors ?? []).map(
        (e) => `${e.instancePath || '(root)'}: ${e.message ?? 'invalid'}`,
      )
      throw new Error(
        `cli-agent${tag}: parsed JSON output failed schema validation: ${msgs.join(', ')}. ` +
          `Check the \`schema:\` field on the node in experience.yaml and ensure the prompt ` +
          `instructs the model to produce JSON that matches that schema.`,
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

/**
 * Extracts a JSON candidate string from raw cli stdout that may be wrapped in
 * agent-specific transports:
 *
 *  - Claude Code's `--output-format json` returns an envelope shaped like
 *    `{type:"result", result: string, ...}` where `result` carries the actual
 *    model output as a string. We unwrap once.
 *  - Many models emit JSON inside a markdown fence:  ```json\n{...}\n``` .
 *    We strip the fence.
 *  - Otherwise the input is assumed to already be the JSON.
 *
 * Returns the best candidate for JSON.parse. The caller still wraps parse in
 * try/catch for safety.
 */
function extractJsonCandidate(raw: string): string {
  const trimmed = raw.trim()
  // 1) Try parsing the whole thing as a known envelope shape with a string
  //    `result` field. If so, recurse on result.
  try {
    const env = JSON.parse(trimmed) as unknown
    if (env && typeof env === 'object' && !Array.isArray(env)) {
      const r = (env as { result?: unknown }).result
      if (typeof r === 'string') {
        return extractJsonCandidate(r)
      }
    }
  } catch {
    // not an envelope; fall through
  }
  // 2) Strip a markdown fence — accept ```json or bare ```
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (fence && fence[1]) return fence[1].trim()
  return trimmed
}
