import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface RegistryEntry {
  name: string
  owner: string
  repo: string
  subpath?: string
  ref: string
  description: string
  tags: string[]
}

export interface Registry {
  version: number
  updated: string
  description: string
  experiences: RegistryEntry[]
}

const HERE = dirname(fileURLToPath(import.meta.url))

let cached: Registry | null = null

export function loadRegistry(): Registry {
  if (cached) return cached
  const path = resolve(HERE, '..', 'registry.json')
  cached = JSON.parse(readFileSync(path, 'utf8')) as Registry
  return cached
}

export function findByName(name: string): RegistryEntry | null {
  const reg = loadRegistry()
  return reg.experiences.find((e) => e.name === name) ?? null
}
