import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve, dirname, relative, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { EXPERIENCE_SCHEMA } from '@openexpertise/schema'
import { printNextSteps } from '../output-helpers.js'
import type { Logger } from 'pino'

const HERE = dirname(fileURLToPath(import.meta.url))
// dist/commands/init.js → ../../../templates
const TEMPLATES_ROOT = resolve(HERE, '..', '..', 'templates')

export const TEMPLATES = ['tool-only', 'agent', 'cli-agent', 'full-pipeline'] as const
export type Template = (typeof TEMPLATES)[number]

export interface InitOpts {
  name: string
  template?: Template
  listTemplates?: boolean
  logger: Logger
}

const TEMPLATE_DESCRIPTIONS: Record<Template, string> = {
  'tool-only': 'Single tool node, no LLM. Runs offline, no API key needed.',
  agent: 'Single agent node with structured output via Anthropic/OpenAI.',
  'cli-agent': 'Single cli-agent node delegating to Claude Code.',
  'full-pipeline': 'tool → agent → cli-agent → tool. Shows fan-out + state passing.',
}

const YAML_LANGUAGE_SERVER_HEADER = '# yaml-language-server: $schema=./experience.schema.json\n'

function copyTreeWithSubstitution(src: string, dest: string, name: string): string[] {
  const created: string[] = []
  const walk = (s: string, d: string) => {
    mkdirSync(d, { recursive: true })
    const entries = readdirSync(s)
    for (const entry of entries) {
      const sp = join(s, entry)
      const dp = join(d, entry)
      if (statSync(sp).isDirectory()) {
        walk(sp, dp)
      } else {
        const body = readFileSync(sp, 'utf8')
        let replaced = body.replaceAll('{{NAME}}', name)
        // Inject yaml-language-server header into top-level experience.yaml (not nested ones)
        if (entry === 'experience.yaml' && d === dest) {
          if (!replaced.startsWith('# yaml-language-server:')) {
            replaced = YAML_LANGUAGE_SERVER_HEADER + replaced
          }
        }
        writeFileSync(dp, replaced)
        created.push(relative(dest, dp))
      }
    }
  }
  walk(src, dest)
  return created
}

export async function initCommand(opts: InitOpts): Promise<number> {
  if (opts.listTemplates) {
    process.stdout.write('Available templates:\n')
    for (const t of TEMPLATES) {
      process.stdout.write(`  ${t.padEnd(16)} ${TEMPLATE_DESCRIPTIONS[t]}\n`)
    }
    return 0
  }

  const template: Template = opts.template ?? 'tool-only'
  if (!TEMPLATES.includes(template)) {
    opts.logger.error(
      { template, available: TEMPLATES },
      `unknown template "${template}". Run \`oe init --list-templates\`.`,
    )
    return 1
  }

  const dir = resolve(opts.name)
  if (existsSync(dir)) {
    opts.logger.error({ dir }, 'directory already exists')
    return 1
  }

  const src = join(TEMPLATES_ROOT, template)
  if (!existsSync(src)) {
    opts.logger.error({ src }, `template directory not found. Reinstall @openexpertise/cli.`)
    return 1
  }

  mkdirSync(dir, { recursive: true })
  const experienceName = basename(dir)
  const files = copyTreeWithSubstitution(src, dir, experienceName)

  // Write the JSON Schema alongside experience.yaml for editor autocomplete
  const schemaPath = join(dir, 'experience.schema.json')
  writeFileSync(schemaPath, JSON.stringify(EXPERIENCE_SCHEMA, null, 2) + '\n')
  files.push('experience.schema.json')

  opts.logger.info(
    { dir, template, files },
    `scaffolded ${opts.name}/ from the \`${template}\` template`,
  )
  printNextSteps([
    `oe graph ${dir}  — visualize the scaffold`,
    `cd ${opts.name} && oe run .  — run it`,
    `open in VS Code (Red Hat YAML ext) for autocomplete + inline validation`,
  ])
  return 0
}
