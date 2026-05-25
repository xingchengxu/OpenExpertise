import { mkdtempSync, cpSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

export interface Sandbox {
  dir: string
  cleanup(): void
}

export function copyExampleToSandbox(exampleName: string): Sandbox {
  const dir = mkdtempSync(join(tmpdir(), `oe-e2e-${exampleName}-`))
  const src = resolve(HERE, '..', 'examples', exampleName)
  cpSync(src, dir, { recursive: true })
  return {
    dir,
    cleanup() {
      rmSync(dir, { recursive: true, force: true })
    },
  }
}
