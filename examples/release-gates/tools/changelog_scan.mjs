import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

export default async function changelogScan() {
  const path = resolve(HERE, '..', 'fixtures', 'changelog.md')
  const md = readFileSync(path, 'utf8')
  const breaking = []
  for (const line of md.split('\n')) {
    if (/\[breaking\]/i.test(line) || /^\s*[-*]\s*BREAKING/i.test(line)) {
      breaking.push({ line: line.trim() })
    }
  }
  return { state_delta: { breaking_changes: breaking } }
}
