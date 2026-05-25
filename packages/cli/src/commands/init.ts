import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Logger } from 'pino'

export interface InitOpts {
  name: string
  logger: Logger
}

export async function initCommand(opts: InitOpts): Promise<number> {
  const dir = resolve(opts.name)
  if (existsSync(dir)) {
    opts.logger.error({ dir }, 'directory already exists')
    return 1
  }
  mkdirSync(join(dir, 'tools'), { recursive: true })
  writeFileSync(
    join(dir, 'experience.yaml'),
    `name: ${opts.name}
description: A new OpenExpertise experience.
version: 0.1.0

state:
  schema:
    greeting:
      type: string

graph:
  nodes:
    - id: hello
      kind: tool
      impl: ./tools/hello.mjs
      writes: [greeting]
  edges: []
`,
  )
  writeFileSync(
    join(dir, 'tools/hello.mjs'),
    `export default async function hello() {\n  return { state_delta: { greeting: 'Hello, OpenExpertise!' } }\n}\n`,
  )
  writeFileSync(join(dir, 'README.md'), `# ${opts.name}\n\nA new OpenExpertise experience.\n`)
  opts.logger.info({ dir }, 'experience scaffolded')
  return 0
}
