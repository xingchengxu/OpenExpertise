import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

export default async function loadIssue() {
  const path = resolve(HERE, '..', 'fixtures', 'issue.json')
  const issue = JSON.parse(readFileSync(path, 'utf8'))
  return { state_delta: { issue } }
}
