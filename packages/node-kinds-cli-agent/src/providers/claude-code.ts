import type { SpawnSpec } from '../runner.js'
import type { BuildCommandOpts, CliAgentProvider } from './types.js'

export class ClaudeCodeProvider implements CliAgentProvider {
  readonly name = 'claude-code' as const

  buildCommand(opts: BuildCommandOpts): SpawnSpec {
    const args: string[] = ['-p', opts.prompt, '--output-format', opts.outputFormat]
    if (opts.model) {
      args.push('--model', opts.model)
    }
    if (opts.extra_args && opts.extra_args.length > 0) {
      args.push(...opts.extra_args)
    }
    return { cmd: 'claude', args }
  }
}
