import { Command } from 'commander'
import { validateCommand } from './commands/validate.js'
import { runCommand } from './commands/run.js'
import { inspectCommand } from './commands/inspect.js'
import { resumeCommand } from './commands/resume.js'
import { initCommand } from './commands/init.js'
import { stateCommand, resetStateCommand } from './commands/state.js'
import { diffCommand } from './commands/diff.js'
import { evolveCommand } from './commands/evolve.js'
import { ultraCommand } from './commands/ultra.js'
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
    .option('--tui', 'show interactive dashboard instead of log output', false)
    .option('--evolve', 'after a successful run, generate evolution proposals', false)
    .option('--llm <provider>', 'LLM provider: anthropic | openai (auto-detected from env)')
    .option(
      '--concurrency <n>',
      'node-level concurrency (overrides runtime.concurrency in YAML)',
      (v) => Number.parseInt(v, 10),
    )
    .action(
      async (
        path: string,
        cmdOpts: {
          args: string
          tui: boolean
          evolve: boolean
          llm?: string
          concurrency?: number
        },
        cmd: Command,
      ) => {
        const root = cmd.optsWithGlobals<{ logFormat: string; logLevel: string }>()
        const logger = makeLogger({ pretty: root.logFormat === 'pretty', level: root.logLevel })
        let args: Record<string, unknown> = {}
        try {
          args = JSON.parse(cmdOpts.args) as Record<string, unknown>
        } catch {
          logger.error('--args must be valid JSON')
          process.exit(2)
        }
        process.exit(
          await runCommand({
            path,
            args,
            logger,
            tui: cmdOpts.tui,
            evolve: cmdOpts.evolve,
            ...(cmdOpts.llm !== undefined ? { llm: cmdOpts.llm } : {}),
            ...(cmdOpts.concurrency !== undefined ? { concurrency: cmdOpts.concurrency } : {}),
          }),
        )
      },
    )

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

  program
    .command('init')
    .description('Scaffold a new experience directory')
    .argument('<name>', 'directory name to create')
    .action(async (name: string, _opts: unknown, cmd: Command) => {
      const root = cmd.optsWithGlobals<{ logFormat: string; logLevel: string }>()
      const logger = makeLogger({ pretty: root.logFormat === 'pretty', level: root.logLevel })
      process.exit(await initCommand({ name, logger }))
    })

  program
    .command('state')
    .description('Inspect the persistent state blackboard')
    .argument('[field]', 'specific field to read; omit for full snapshot')
    .option('--experience <path>', 'experience path', '.')
    .action(async (field: string | undefined, cmdOpts: { experience: string }, cmd: Command) => {
      const root = cmd.optsWithGlobals<{ logFormat: string; logLevel: string }>()
      const logger = makeLogger({ pretty: root.logFormat === 'pretty', level: root.logLevel })
      process.exit(
        await stateCommand({
          experiencePath: cmdOpts.experience,
          ...(field !== undefined ? { field } : {}),
          logger,
        }),
      )
    })

  program
    .command('reset-state')
    .description('Delete the persistent state blackboard (destructive)')
    .option('--experience <path>', 'experience path', '.')
    .option('--yes', 'confirm destructive action', false)
    .action(async (cmdOpts: { experience: string; yes: boolean }, cmd: Command) => {
      const root = cmd.optsWithGlobals<{ logFormat: string; logLevel: string }>()
      const logger = makeLogger({ pretty: root.logFormat === 'pretty', level: root.logLevel })
      process.exit(
        await resetStateCommand({ experiencePath: cmdOpts.experience, yes: cmdOpts.yes, logger }),
      )
    })

  program
    .command('diff')
    .description('List pending evolution proposals')
    .option('--experience <path>', 'experience path', '.')
    .action(async (cmdOpts: { experience: string }, cmd: Command) => {
      const root = cmd.optsWithGlobals<{ logFormat: string; logLevel: string }>()
      const logger = makeLogger({ pretty: root.logFormat === 'pretty', level: root.logLevel })
      process.exit(await diffCommand({ experiencePath: cmdOpts.experience, logger }))
    })

  program
    .command('evolve')
    .description('Generate evolution proposals for a prior run')
    .argument('<run-id>', 'prior run id')
    .option('--experience <path>', 'experience path', '.')
    .option('--llm <provider>', 'LLM provider: anthropic | openai (auto-detected from env)')
    .action(async (runId: string, cmdOpts: { experience: string; llm?: string }, cmd: Command) => {
      const root = cmd.optsWithGlobals<{ logFormat: string; logLevel: string }>()
      const logger = makeLogger({ pretty: root.logFormat === 'pretty', level: root.logLevel })
      process.exit(
        await evolveCommand({
          experiencePath: cmdOpts.experience,
          runId,
          logger,
          ...(cmdOpts.llm !== undefined ? { llm: cmdOpts.llm } : {}),
        }),
      )
    })

  program
    .command('ultra')
    .description('LLM-author a new experience from a natural-language task description')
    .argument('<task>', 'the task description (natural language)')
    .option('--draft-root <dir>', 'directory for the draft', '.openexpertise/drafts')
    .option('--llm <provider>', 'LLM provider: anthropic | openai (auto-detected from env)')
    .action(async (task: string, cmdOpts: { draftRoot: string; llm?: string }, cmd: Command) => {
      const root = cmd.optsWithGlobals<{ logFormat: string; logLevel: string }>()
      const logger = makeLogger({ pretty: root.logFormat === 'pretty', level: root.logLevel })
      process.exit(
        await ultraCommand({
          taskDescription: task,
          draftRoot: cmdOpts.draftRoot,
          logger,
          ...(cmdOpts.llm !== undefined ? { llm: cmdOpts.llm } : {}),
        }),
      )
    })

  return program
}
