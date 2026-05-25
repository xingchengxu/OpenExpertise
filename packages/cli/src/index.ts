import { Command } from 'commander'
import { validateCommand } from './commands/validate.js'
import { runCommand } from './commands/run.js'
import { inspectCommand } from './commands/inspect.js'
import { resumeCommand } from './commands/resume.js'
import { makeLogger } from './logger.js'

export function buildProgram(): Command {
  const program = new Command()
  program
    .name('oe')
    .description('OpenExpertise CLI — execute and inspect experience flows')
    .version('0.1.0')
    .option('--log-format <fmt>', 'log format: json | pretty', 'pretty')
    .option('--log-level <level>', 'log level', 'info')

  program
    .command('validate')
    .description('Validate an experience.yaml file or directory')
    .argument('[path]', 'path to experience.yaml or experience directory', '.')
    .action(async (path: string, _cmdOpts: unknown, cmd: Command) => {
      const root = cmd.optsWithGlobals<{ logFormat: string; logLevel: string }>()
      const logger = makeLogger({ pretty: root.logFormat === 'pretty', level: root.logLevel })
      process.exit(await validateCommand({ path, logger }))
    })

  program
    .command('run')
    .description('Execute an experience')
    .argument('[path]', 'path to experience.yaml or experience directory', '.')
    .option('--args <json>', 'JSON object passed as args to the experience', '{}')
    .action(async (path: string, cmdOpts: { args: string }, cmd: Command) => {
      const root = cmd.optsWithGlobals<{ logFormat: string; logLevel: string }>()
      const logger = makeLogger({ pretty: root.logFormat === 'pretty', level: root.logLevel })
      let args: Record<string, unknown> = {}
      try {
        args = JSON.parse(cmdOpts.args) as Record<string, unknown>
      } catch {
        logger.error('--args must be valid JSON')
        process.exit(2)
      }
      process.exit(await runCommand({ path, args, logger }))
    })

  program
    .command('inspect')
    .description('Render a run trace from .openexpertise/runs/<run-id>.jsonl')
    .argument('<run-id>', 'run id')
    .option('--experience <path>', 'experience path', '.')
    .action(async (runId: string, cmdOpts: { experience: string }, cmd: Command) => {
      const root = cmd.optsWithGlobals<{ logFormat: string; logLevel: string }>()
      const logger = makeLogger({ pretty: root.logFormat === 'pretty', level: root.logLevel })
      process.exit(await inspectCommand({ experiencePath: cmdOpts.experience, runId, logger }))
    })

  program
    .command('resume')
    .description('Re-run an experience with cached results from a prior run')
    .argument('<run-id>', 'prior run id')
    .option('--experience <path>', 'experience path', '.')
    .action(async (runId: string, cmdOpts: { experience: string }, cmd: Command) => {
      const root = cmd.optsWithGlobals<{ logFormat: string; logLevel: string }>()
      const logger = makeLogger({ pretty: root.logFormat === 'pretty', level: root.logLevel })
      process.exit(await resumeCommand({ experiencePath: cmdOpts.experience, runId, logger }))
    })

  return program
}
