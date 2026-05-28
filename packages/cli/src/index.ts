import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
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
import { doctorCommand } from './commands/doctor.js'
import { installCommand } from './commands/install.js'
import { registryCommand, installedCommand } from './commands/registry.js'
import { submitCommand } from './commands/submit.js'
import { demoCommand } from './commands/demo.js'
import { makeLogger } from './logger.js'

const HERE = dirname(fileURLToPath(import.meta.url))
// dist/index.js → ../package.json
const PKG_VERSION = (() => {
  try {
    return JSON.parse(readFileSync(resolve(HERE, '..', 'package.json'), 'utf8')).version as string
  } catch {
    return '0.0.0'
  }
})()

export function buildProgram(): Command {
  const program = new Command()
  program
    .name('oe')
    .description('OpenExpertise CLI — execute and inspect experience flows')
    .version(PKG_VERSION)
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
        if (cmdOpts.concurrency !== undefined && !Number.isInteger(cmdOpts.concurrency)) {
          logger.error('--concurrency must be a positive integer')
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
    .argument('[name]', 'directory name to create')
    .option(
      '--template <name>',
      'starter template: tool-only | agent | cli-agent | full-pipeline',
      'tool-only',
    )
    .option('--list-templates', 'list available templates and exit')
    .action(
      async (
        name: string | undefined,
        cmdOpts: { template?: string; listTemplates?: boolean },
        cmd: Command,
      ) => {
        const root = cmd.optsWithGlobals<{ logFormat: string; logLevel: string }>()
        const logger = makeLogger({ pretty: root.logFormat === 'pretty', level: root.logLevel })
        if (!name && !cmdOpts.listTemplates) {
          logger.error('missing required argument: name')
          process.exit(1)
        }
        const opts = {
          name: name ?? '',
          ...(cmdOpts.template !== undefined ? { template: cmdOpts.template as never } : {}),
          ...(cmdOpts.listTemplates ? { listTemplates: true } : {}),
          logger,
        }
        process.exit(await initCommand(opts))
      },
    )

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

  program
    .command('doctor')
    .description('Check environment readiness for running OpenExpertise')
    .option('--json', 'output machine-readable JSON')
    .action(async (cmdOpts: { json?: boolean }) => {
      process.exit(await doctorCommand({ json: cmdOpts.json ?? false }))
    })

  program
    .command('install <spec>')
    .description('Install an experience from a curated registry name or gh:user/repo[@ref]')
    .option('--ref <ref>', 'override the ref (branch, tag, or SHA)')
    .action(async (spec: string, cmdOpts: { ref?: string }, cmd: Command) => {
      const root = cmd.optsWithGlobals<{ logFormat: string; logLevel: string }>()
      const logger = makeLogger({ pretty: root.logFormat === 'pretty', level: root.logLevel })
      process.exit(
        await installCommand({
          spec,
          logger,
          ...(cmdOpts.ref !== undefined ? { ref: cmdOpts.ref } : {}),
        }),
      )
    })

  program
    .command('registry')
    .description('List curated experiences in the OpenExpertise registry')
    .option('--json', 'output as JSON')
    .action(async (cmdOpts: { json?: boolean }, cmd: Command) => {
      const root = cmd.optsWithGlobals<{ logFormat: string; logLevel: string }>()
      const logger = makeLogger({ pretty: root.logFormat === 'pretty', level: root.logLevel })
      process.exit(await registryCommand({ json: cmdOpts.json ?? false, logger }))
    })

  program
    .command('installed')
    .description('List experiences installed via `oe install`')
    .option('--json', 'output as JSON')
    .action(async (cmdOpts: { json?: boolean }, cmd: Command) => {
      const root = cmd.optsWithGlobals<{ logFormat: string; logLevel: string }>()
      const logger = makeLogger({ pretty: root.logFormat === 'pretty', level: root.logLevel })
      process.exit(await installedCommand({ json: cmdOpts.json ?? false, logger }))
    })

  program
    .command('submit [path]')
    .description(
      'Submit an experience to the OpenExpertise registry (opens pre-filled GitHub issue)',
    )
    .option('--tags <list>', 'comma-separated tags')
    .option('--name <name>', 'override the experience name')
    .option('--ref <ref>', 'override the git ref to pin')
    .option('--subpath <subpath>', 'override the subpath')
    .option('--description <text>', 'override the description')
    .option('--dry-run', 'print the entry; do not open the browser')
    .option('--output <file>', 'write the entry to a file')
    .action(
      async (
        path: string | undefined,
        cmdOpts: {
          tags?: string
          name?: string
          ref?: string
          subpath?: string
          description?: string
          dryRun?: boolean
          output?: string
        },
        cmd: Command,
      ) => {
        const root = cmd.optsWithGlobals<{ logFormat: string; logLevel: string }>()
        const logger = makeLogger({ pretty: root.logFormat === 'pretty', level: root.logLevel })
        const opts = {
          ...(path !== undefined ? { path } : {}),
          ...(cmdOpts.tags !== undefined ? { tags: cmdOpts.tags } : {}),
          ...(cmdOpts.name !== undefined ? { name: cmdOpts.name } : {}),
          ...(cmdOpts.ref !== undefined ? { ref: cmdOpts.ref } : {}),
          ...(cmdOpts.subpath !== undefined ? { subpath: cmdOpts.subpath } : {}),
          ...(cmdOpts.description !== undefined ? { description: cmdOpts.description } : {}),
          ...(cmdOpts.dryRun ? { dryRun: true } : {}),
          ...(cmdOpts.output !== undefined ? { output: cmdOpts.output } : {}),
          logger,
        }
        process.exit(await submitCommand(opts))
      },
    )

  program
    .command('demo [name]')
    .description('Preview a pre-recorded run of a bundled example (zero API key needed)')
    .option('--json', 'output as JSON')
    .action(async (name: string | undefined, cmdOpts: { json?: boolean }) => {
      process.exit(
        await demoCommand({
          ...(name !== undefined ? { name } : {}),
          json: cmdOpts.json ?? false,
          logger: makeLogger(),
        }),
      )
    })

  return program
}
