import type { SpawnSpec } from '../runner.js'
import type { BuildCommandOpts, CliAgentProvider } from './types.js'

export class CodexProvider implements CliAgentProvider {
  readonly name = 'codex' as const

  buildCommand(opts: BuildCommandOpts): SpawnSpec {
    const args: string[] = ['exec', '--skip-git-repo-check']
    if (opts.model) {
      args.push('--model', opts.model)
    }
    if (opts.extra_args && opts.extra_args.length > 0) {
      args.push(...opts.extra_args)
    }
    args.push(opts.prompt)
    return { cmd: 'codex', args }
  }
}
