import type { SpawnSpec } from '../runner.js'
import type { BuildCommandOpts, CliAgentProvider } from './types.js'

export class GeminiProvider implements CliAgentProvider {
  readonly name = 'gemini' as const

  buildCommand(opts: BuildCommandOpts): SpawnSpec {
    // --yolo bypasses interactive permission prompts so the CLI can run
    // non-interactively. Users can override via extra_args if they want
    // a stricter permission mode.
    const args: string[] = ['--yolo', '--prompt', opts.prompt]
    if (opts.model) {
      args.push('--model', opts.model)
    }
    if (opts.extra_args && opts.extra_args.length > 0) {
      args.push(...opts.extra_args)
    }
    return { cmd: 'gemini', args }
  }
}
