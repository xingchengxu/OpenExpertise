import type { Logger } from 'pino'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { loadRegistry } from '../registry-data.js'

export interface RegistryCmdOpts {
  json?: boolean
  logger: Logger
}

export async function registryCommand(opts: RegistryCmdOpts): Promise<number> {
  const reg = loadRegistry()
  if (opts.json) {
    process.stdout.write(JSON.stringify(reg, null, 2) + '\n')
    return 0
  }
  process.stdout.write(`OpenExpertise registry (v${reg.version}, updated ${reg.updated})\n`)
  process.stdout.write(`${reg.experiences.length} curated experiences:\n\n`)
  for (const e of reg.experiences) {
    const tags = e.tags.join(', ')
    process.stdout.write(`  ${e.name} @ ${e.ref}\n`)
    process.stdout.write(`    ${e.description}\n`)
    process.stdout.write(`    tags: ${tags}\n`)
    process.stdout.write(`    install: oe install ${e.name}\n\n`)
  }
  return 0
}

export interface InstalledCmdOpts {
  json?: boolean
  logger: Logger
}

export async function installedCommand(opts: InstalledCmdOpts): Promise<number> {
  const base = resolve('.openexpertise', 'experiences')
  if (!existsSync(base)) {
    if (opts.json) {
      process.stdout.write(JSON.stringify({ installed: [] }) + '\n')
    } else {
      process.stdout.write(
        'Nothing installed yet.\nRun `oe registry` to see curated experiences, or `oe install gh:owner/repo` for any GitHub repo.\n',
      )
    }
    return 0
  }
  const names = readdirSync(base).filter((n) => statSync(join(base, n)).isDirectory())
  if (opts.json) {
    process.stdout.write(JSON.stringify({ installed: names }) + '\n')
    return 0
  }
  if (names.length === 0) {
    process.stdout.write('Nothing installed yet.\n')
    return 0
  }
  process.stdout.write(
    `${names.length} installed experience(s) in .openexpertise/experiences/:\n\n`,
  )
  for (const n of names) {
    process.stdout.write(`  ${n}\n`)
    process.stdout.write(`    run: oe run .openexpertise/experiences/${n}\n\n`)
  }
  return 0
}
