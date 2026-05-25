import { pathToFileURL } from 'node:url'
import { resolve, isAbsolute } from 'node:path'
import { existsSync } from 'node:fs'

export interface LoadedToolModule {
  default?: (args: unknown, ctx?: unknown) => Promise<unknown> | unknown
  [k: string]: unknown
}

export async function loadToolModule(
  impl: string,
  experienceDir: string,
): Promise<LoadedToolModule> {
  const abs = isAbsolute(impl) ? impl : resolve(experienceDir, impl)
  if (!existsSync(abs)) {
    throw new Error(`Tool impl not found: ${abs} (declared as "${impl}" in experience.yaml)`)
  }
  const url = pathToFileURL(abs).href
  return (await import(url)) as LoadedToolModule
}
