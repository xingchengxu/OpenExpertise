import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

export default async function loadInput() {
  const path = resolve(HERE, '..', 'fixtures', 'input.txt')
  const text = readFileSync(path, 'utf8')
  return { state_delta: { input_text: text } }
}
