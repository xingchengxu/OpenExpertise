import { readFileSync, existsSync, unlinkSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseExperienceYaml } from '@openexpertise/schema'
import { StateStore } from '@openexpertise/core'
import type { Logger } from 'pino'

export interface StateOpts {
  experiencePath: string
  field?: string
  logger: Logger
}

export async function stateCommand(opts: StateOpts): Promise<number> {
  const dir = resolve(opts.experiencePath)
  const yamlPath = join(dir, 'experience.yaml')
  if (!existsSync(yamlPath)) {
    opts.logger.error({ yamlPath }, 'experience.yaml not found')
    return 1
  }
  const spec = parseExperienceYaml(readFileSync(yamlPath, 'utf8'))
  const dbPath = join(dir, '.openexpertise', 'state.sqlite')
  if (!existsSync(dbPath)) {
    opts.logger.info({ dbPath }, 'state file does not exist yet (no runs performed)')
    return 0
  }
  const store = new StateStore({ dbPath, spec })
  try {
    if (opts.field) {
      const v = store.get(opts.field)
      opts.logger.info({ field: opts.field, value: v }, 'state field')
    } else {
      const snap = store.snapshot()
      opts.logger.info({ snapshot: snap }, 'full state snapshot')
    }
    return 0
  } finally {
    store.close()
  }
}

export interface ResetStateOpts {
  experiencePath: string
  yes: boolean
  logger: Logger
}

export async function resetStateCommand(opts: ResetStateOpts): Promise<number> {
  const dir = resolve(opts.experiencePath)
  const dbPath = join(dir, '.openexpertise', 'state.sqlite')
  if (!existsSync(dbPath)) {
    opts.logger.info({ dbPath }, 'no state to reset')
    return 0
  }
  if (!opts.yes) {
    opts.logger.error('reset-state requires --yes to confirm destructive action')
    return 1
  }
  unlinkSync(dbPath)
  opts.logger.info({ dbPath }, 'state reset')
  return 0
}
