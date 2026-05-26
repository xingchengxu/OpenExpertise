import { readFileSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { parseExperienceYaml } from '@openexpertise/schema'
import { StateStore } from '@openexpertise/core'
import type { ToolHandler } from './types.js'

export const stateTool: ToolHandler = {
  name: 'oe_state',
  description:
    "Inspect the SQLite blackboard for an experience. " +
    "Returns { field, value } if 'field' is provided, otherwise { snapshot } with all fields.",
  inputSchema: {
    type: 'object',
    required: ['experience_path'],
    properties: {
      experience_path: { type: 'string' },
      field: { type: 'string', description: 'Optional: a single field name to read' },
    },
  },
  async call(args) {
    const p = args['experience_path']
    if (typeof p !== 'string') {
      throw new Error('experience_path is required and must be a string')
    }
    const dir = resolve(p)
    const yamlPath = join(dir, 'experience.yaml')
    if (!existsSync(yamlPath)) {
      throw new Error(`experience.yaml not found at ${yamlPath}`)
    }
    const spec = parseExperienceYaml(readFileSync(yamlPath, 'utf8'))
    const dbPath = join(dir, '.openexpertise', 'state.sqlite')
    if (!existsSync(dbPath)) {
      return { note: 'no runs have populated state yet', dbPath }
    }
    const store = new StateStore({ dbPath, spec })
    try {
      const field = args['field']
      if (typeof field === 'string') {
        return { field, value: store.get(field) }
      }
      return { snapshot: store.snapshot() }
    } finally {
      store.close()
    }
  },
}
