import type { SpawnSpec } from '../runner.js'
import type { BuildCommandOpts, CliAgentProvider } from './types.js'

export class GeminiProvider implements CliAgentProvider {
  readonly name = 'gemini' as const

  buildCommand(opts: BuildCommandOpts): SpawnSpec {
    // Flags explained:
    //   --yolo        : bypass interactive tool-approval prompts (non-interactive runs)
    //   --skip-trust  : bypass the "current folder is not trusted" gate.
    //                   Without this, gemini exits 55 in any non-whitelisted dir
    //                   (including all /tmp/* and most experience workdirs),
    //                   AND silently downgrades --yolo to "default" approval
    //                   mode even when the trust gate is satisfied. Both
    //                   conditions are real (observed against gemini 0.43).
    // Users can still override via extra_args if they want stricter behavior.
    const args: string[] = ['--yolo', '--skip-trust', '--prompt', opts.prompt]
    if (opts.model) {
      args.push('--model', opts.model)
    }
    if (opts.extra_args && opts.extra_args.length > 0) {
      args.push(...opts.extra_args)
    }
    return { cmd: 'gemini', args }
  }
}
