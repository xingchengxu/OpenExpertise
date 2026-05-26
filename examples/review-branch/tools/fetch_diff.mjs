import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

export default async function fetchDiff(_bundle, _ctx) {
  const path = resolve(HERE, '..', 'fixtures', 'add-user-lookup.diff')
  const diff = readFileSync(path, 'utf8')
  return { state_delta: { diff } }
}
