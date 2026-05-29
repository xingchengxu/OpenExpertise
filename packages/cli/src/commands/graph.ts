import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseExperienceYaml, validateExperienceSpec, ValidationError } from '@openexpertise/schema'
import type { Logger } from 'pino'
import { resolveExperienceYaml } from './validate.js'
import { renderMermaid, renderMermaidHtml } from '../render-mermaid.js'

export interface GraphOpts {
  path: string
  logger: Logger
  html?: boolean
  out?: string
  direction?: 'TD' | 'LR'
}

export async function graphCommand(opts: GraphOpts): Promise<number> {
  const yamlPath = resolveExperienceYaml(opts.path)
  if (!existsSync(yamlPath)) {
    opts.logger.error(
      { path: yamlPath },
      `experience.yaml not found at ${yamlPath}. Pass a directory containing experience.yaml or the yaml file directly.`,
    )
    return 1
  }
  const source = readFileSync(yamlPath, 'utf8')
  try {
    const spec = parseExperienceYaml(source)
    validateExperienceSpec(spec)
    const mermaid = renderMermaid(spec, opts.direction ? { direction: opts.direction } : {})
    const output = opts.html ? renderMermaidHtml(spec, mermaid) : mermaid
    if (opts.out) {
      const outPath = resolve(opts.out)
      writeFileSync(outPath, output)
      opts.logger.info({ out: outPath }, `wrote ${outPath}`)
    } else {
      process.stdout.write(output)
    }
    return 0
  } catch (err) {
    if (err instanceof ValidationError) {
      opts.logger.error({ errors: err.errors }, err.message)
    } else {
      opts.logger.error({ err: (err as Error).message }, 'graph failed')
    }
    return 1
  }
}
