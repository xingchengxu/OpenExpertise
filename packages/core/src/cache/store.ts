import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import type { NodeOutput } from '../dispatcher/types.js'

export interface CacheStoreOpts {
  dir: string // absolute path to .openexpertise/cache/
}

export class CacheStore {
  constructor(private readonly opts: CacheStoreOpts) {
    mkdirSync(opts.dir, { recursive: true })
  }

  get(key: string): NodeOutput | undefined {
    const p = join(this.opts.dir, `${key}.json`)
    if (!existsSync(p)) return undefined
    return JSON.parse(readFileSync(p, 'utf8')) as NodeOutput
  }

  put(key: string, output: NodeOutput): void {
    const p = join(this.opts.dir, `${key}.json`)
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, JSON.stringify(output))
  }
}
