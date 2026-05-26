import type { SpawnSpec } from '../runner.js'

export type ProviderName = 'claude-code' | 'codex' | 'gemini'

export interface BuildCommandOpts {
  prompt: string
  workdir: string
  outputFormat: 'text' | 'json'
  model?: string
  extra_args?: string[]
}

export interface CliAgentProvider {
  readonly name: ProviderName
  buildCommand(opts: BuildCommandOpts): SpawnSpec
}
