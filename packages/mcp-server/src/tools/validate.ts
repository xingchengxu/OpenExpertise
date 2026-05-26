import { readFileSync, existsSync } from 'node:fs'
import { parseExperienceYaml, validateExperienceSpec, ValidationError } from '@openexpertise/schema'
import type { ToolHandler } from './types.js'
import { resolveExperienceYaml } from './validate-path.js'

export const validateTool: ToolHandler = {
  name: 'oe_validate',
  description:
    'Validate an OpenExpertise experience.yaml. Returns { valid, errors? }. ' +
    'errors[] is populated when valid is false.',
  inputSchema: {
    type: 'object',
    required: ['experience_path'],
    properties: {
      experience_path: {
        type: 'string',
        description: 'Path to the experience directory or a .yaml file',
      },
    },
  },
  async call(args) {
    const p = args['experience_path']
    if (typeof p !== 'string') {
      return { valid: false, errors: ['experience_path is required and must be a string'] }
    }
    const yamlPath = resolveExperienceYaml(p)
    if (!existsSync(yamlPath)) {
      return { valid: false, errors: [`experience.yaml not found at ${yamlPath}`] }
    }
    try {
      const source = readFileSync(yamlPath, 'utf8')
      const spec = parseExperienceYaml(source)
      validateExperienceSpec(spec)
      return { valid: true }
    } catch (err) {
      if (err instanceof ValidationError) {
        return { valid: false, errors: err.errors.length > 0 ? err.errors : [err.message] }
      }
      return { valid: false, errors: [(err as Error).message] }
    }
  },
}
