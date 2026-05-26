// TypeScript types for the experience.yaml format v0.1.0.
// These are hand-authored to match `src/schemas/experience.schema.json`.
// Keep the two in sync — see tests/parser.test.ts for the consistency check.

export type NodeKind = 'agent' | 'skill' | 'tool' | 'dataset' | 'experience' | 'cli-agent'

export type MergeStrategy = 'array_append' | 'set_once' | 'last_wins'

export interface ForEachClause {
  source: string // a JSONPath-like expression that resolves to an array
  concurrency?: number // V1: parsed but ignored; runtime is sequential
}

export interface PipelineGroupSpec {
  id: string
  items: string // JSONPath expression resolving to an array
  stages: string[] // node ids in order
  phase?: string
}

export interface LoopSpec {
  id: string
  body: string // node id to repeat
  until?: string // boolean expression
  max_iters?: number
  budget?: number // not enforced in V1; reserved
  phase?: string
}

// A state field is either an inline schema (with `type` and the usual JSON Schema
// shape) or a $ref to an external schema file. Making this a discriminated union
// makes invalid states (e.g. both `type` and `$ref` set) unrepresentable.
export type StateFieldSchema =
  | {
      type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null'
      description?: string
      items?: StateFieldSchema | { $ref: string }
      properties?: Record<string, StateFieldSchema>
      required?: string[]
      merge?: MergeStrategy
    }
  | { $ref: string }

export interface StateSpec {
  schema: Record<string, StateFieldSchema>
  store?: string // path to SQLite file; default `.openexpertise/state.sqlite`
}

export interface PhaseSpec {
  id: string
  title?: string
}

export interface ToolNodeSpec {
  id: string
  kind: 'tool'
  phase?: string
  impl: string // path to .ts/.js module relative to experience.yaml
  args?: Record<string, unknown>
  reads?: string[]
  writes?: string[]
  on_error?: ErrorPolicy
  for_each?: ForEachClause
}

// Placeholders for kinds added in later plans. They exist so the parser can
// accept full experience.yaml files now, even if Plan 1 only dispatches tool.
export interface AgentNodeSpec {
  id: string
  kind: 'agent'
  phase?: string
  prompt: string
  model?: string
  schema?: string | Record<string, unknown>
  reads?: string[]
  writes?: string[]
  args?: Record<string, unknown>
  on_error?: ErrorPolicy
  for_each?: ForEachClause
}

export interface SkillNodeSpec {
  id: string
  kind: 'skill'
  phase?: string
  impl: string
  inputs?: Record<string, unknown>
  model?: string
  schema?: string | Record<string, unknown>
  reads?: string[]
  writes?: string[]
  on_error?: ErrorPolicy
  for_each?: ForEachClause
}

export interface DatasetNodeSpec {
  id: string
  kind: 'dataset'
  phase?: string
  source: DatasetSource
  reads?: string[]
  writes?: string[]
  on_error?: ErrorPolicy
  for_each?: ForEachClause
}

export interface ExperienceNodeSpec {
  id: string
  kind: 'experience'
  phase?: string
  impl: string
  args?: Record<string, unknown>
  state_scope?: 'shared' | 'isolated'
  reads?: string[]
  writes?: string[]
  on_error?: ErrorPolicy
  for_each?: ForEachClause
}

export interface CliAgentNodeSpec {
  id: string
  kind: 'cli-agent'
  phase?: string
  provider: 'claude-code' | 'codex' | 'gemini'
  prompt: string // inline only in V1 — no file-path loading
  model?: string
  workdir?: string // relative to experience dir; default = experience dir
  output_format?: 'text' | 'json' // default 'text'
  schema?: Record<string, unknown> // AJV schema validated against parsed JSON output
  timeout_ms?: number // default 600_000
  extra_args?: string[]
  reads?: string[]
  writes?: string[]
  on_error?: ErrorPolicy
  for_each?: ForEachClause
}

export type DatasetSource =
  | { type: 'file'; uri: string; format?: 'json' | 'jsonl' | 'csv' | 'parquet'; transform?: string }
  | { type: 'sqlite'; uri: string; query: string }
  | { type: 'http'; url: string; method?: 'GET' | 'POST'; body?: unknown }
  | { type: 'mcp-resource'; server: string; uri: string }

export type NodeSpec =
  | ToolNodeSpec
  | AgentNodeSpec
  | SkillNodeSpec
  | DatasetNodeSpec
  | ExperienceNodeSpec
  | CliAgentNodeSpec

export type ErrorPolicy =
  | { policy: 'skip' }
  | { policy: 'fail_run' }
  | { policy: 'retry'; attempts: number; backoff?: 'linear' | 'exponential'; base_ms?: number }

export interface EdgeSpec {
  from: string
  to: string
  when?: string // JSONPath-ish expression (Plan 2)
}

export interface GraphSpec {
  nodes: NodeSpec[]
  edges: EdgeSpec[]
  pipelines?: PipelineGroupSpec[]
  loops?: LoopSpec[]
}

export interface ExperienceSpec {
  name: string
  description?: string
  version: string
  state: StateSpec
  phases?: PhaseSpec[]
  graph: GraphSpec
}
