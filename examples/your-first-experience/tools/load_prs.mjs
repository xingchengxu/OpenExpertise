import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

export default async function loadPrs() {
  const path = resolve(HERE, '..', 'fixtures', 'recent_prs.json')
  const prs = JSON.parse(readFileSync(path, 'utf8'))
  return { state_delta: { prs } }
}
