import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import type { ExperienceSpec } from './types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const schemaPath = resolve(__dirname, 'schemas/experience.schema.json')
const schema = JSON.parse(readFileSync(schemaPath, 'utf8'))

const ajv = new Ajv({ allErrors: true, strict: false })
addFormats(ajv)
const validateJsonSchema = ajv.compile(schema)

export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly errors: string[] = [],
  ) {
    super(message)
    this.name = 'ValidationError'
  }
}

export function validateExperienceSpec(spec: unknown): asserts spec is ExperienceSpec {
  if (!validateJsonSchema(spec)) {
    const messages = (validateJsonSchema.errors ?? []).map(
      (e) => `${e.instancePath || '(root)'}: ${e.message ?? 'invalid'}`,
    )
    throw new ValidationError(`Schema validation failed:\n${messages.join('\n')}`, messages)
  }

  // Beyond JSON Schema: referential integrity checks
  const s = spec as ExperienceSpec
  const nodeIds = new Set(s.graph.nodes.map((n) => n.id))

  // Duplicate node ids first — every subsequent check assumes a structurally
  // valid graph where the Set didn't silently dedupe collisions.
  if (nodeIds.size !== s.graph.nodes.length) {
    throw new ValidationError('Duplicate node ids in graph.nodes')
  }

  const definedNodeList = [...nodeIds].join(', ')
  for (const edge of s.graph.edges) {
    if (!nodeIds.has(edge.from)) {
      throw new ValidationError(
        `Edge \`${edge.from} → ${edge.to}\` references node \`${edge.from}\` which doesn't exist. ` +
          `Add it to \`graph.nodes:\` or fix the typo. ` +
          `Defined nodes: ${definedNodeList || '(none)'}`,
      )
    }
    if (!nodeIds.has(edge.to)) {
      throw new ValidationError(
        `Edge \`${edge.from} → ${edge.to}\` references node \`${edge.to}\` which doesn't exist. ` +
          `Add it to \`graph.nodes:\` or fix the typo. ` +
          `Defined nodes: ${definedNodeList || '(none)'}`,
      )
    }
  }

  const declaredFields = new Set(Object.keys(s.state.schema))
  for (const node of s.graph.nodes) {
    for (const field of node.writes ?? []) {
      if (!declaredFields.has(field)) {
        throw new ValidationError(
          `Node "${node.id}" writes undeclared state field "${field}". Declare it in state.schema.`,
        )
      }
    }
    for (const field of node.reads ?? []) {
      if (!declaredFields.has(field)) {
        throw new ValidationError(
          `Node "${node.id}" reads undeclared state field "${field}". Declare it in state.schema.`,
        )
      }
    }
  }
}
