import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

export default async function loadQuestion() {
  const path = resolve(HERE, '..', 'fixtures', 'question.json')
  const data = JSON.parse(readFileSync(path, 'utf8'))
  return { state_delta: { question: data.question } }
}
