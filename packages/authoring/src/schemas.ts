// JSON Schemas for the two structured-output payloads UltraExpertise
// expects back from the LLM. Both are AJV-compatible (draft-07-ish).

export const ANALYSIS_SCHEMA = {
  type: 'object',
  required: ['name', 'description', 'phases', 'state_fields', 'node_sketches'],
  properties: {
    name: { type: 'string', pattern: '^[a-z][a-z0-9-]*$', maxLength: 60 },
    description: { type: 'string' },
    domain: { type: 'string' },
    phases: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
        },
      },
    },
    state_fields: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'type'],
        properties: {
          name: { type: 'string' },
          type: { type: 'string', enum: ['string', 'number', 'boolean', 'array', 'object'] },
          merge: { type: 'string', enum: ['array_append', 'set_once', 'last_wins'] },
          description: { type: 'string' },
        },
      },
    },
    node_sketches: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'kind', 'purpose'],
        properties: {
          id: { type: 'string' },
          kind: {
            type: 'string',
            enum: ['tool', 'agent', 'skill', 'dataset', 'experience', 'cli-agent'],
          },
          phase: { type: 'string' },
          purpose: { type: 'string' },
          fan_out_over: { type: 'string' },
        },
      },
    },
    open_questions: { type: 'array', items: { type: 'string' } },
  },
} as const

export const SYNTHESIS_SCHEMA = {
  type: 'object',
  required: ['experience_yaml', 'files'],
  properties: {
    experience_yaml: { type: 'string' },
    files: {
      type: 'array',
      items: {
        type: 'object',
        required: ['path', 'content'],
        properties: {
          path: { type: 'string' },
          content: { type: 'string' },
        },
      },
    },
    next_steps: { type: 'array', items: { type: 'string' } },
  },
} as const

export interface AnalysisOutput {
  name: string
  description: string
  domain?: string
  phases: Array<{ id: string; title?: string }>
  state_fields: Array<{
    name: string
    type: 'string' | 'number' | 'boolean' | 'array' | 'object'
    merge?: 'array_append' | 'set_once' | 'last_wins'
    description?: string
  }>
  node_sketches: Array<{
    id: string
    kind: 'tool' | 'agent' | 'skill' | 'dataset' | 'experience' | 'cli-agent'
    phase?: string
    purpose: string
    fan_out_over?: string
  }>
  open_questions?: string[]
}

export interface SynthesisOutput {
  experience_yaml: string
  files: Array<{ path: string; content: string }>
  next_steps?: string[]
}
