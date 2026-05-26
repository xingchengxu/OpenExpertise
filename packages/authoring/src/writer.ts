import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve, relative } from 'node:path'

export class PathTraversalError extends Error {
  constructor(public readonly attemptedPath: string) {
    super(`writeDraft rejected unsafe path: "${attemptedPath}"`)
    this.name = 'PathTraversalError'
  }
}

export interface WriteDraftOpts {
  draftDir: string
  experienceYaml: string
  files: Array<{ path: string; content: string }>
}

export interface WriteDraftResult {
  draftDir: string
  files_written: string[]
}

export async function writeDraft(opts: WriteDraftOpts): Promise<WriteDraftResult> {
  const absRoot = resolve(opts.draftDir)
  mkdirSync(absRoot, { recursive: true })

  const written: string[] = []

  // experience.yaml is always at the root.
  const yamlAbs = join(absRoot, 'experience.yaml')
  writeFileSync(yamlAbs, opts.experienceYaml)
  written.push('experience.yaml')

  for (const f of opts.files) {
    if (isAbsolute(f.path)) {
      throw new PathTraversalError(f.path)
    }
    const abs = resolve(absRoot, f.path)
    const rel = relative(absRoot, abs)
    if (rel.startsWith('..') || isAbsolute(rel)) {
      throw new PathTraversalError(f.path)
    }
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, f.content)
    written.push(rel)
  }

  return { draftDir: absRoot, files_written: written }
}
