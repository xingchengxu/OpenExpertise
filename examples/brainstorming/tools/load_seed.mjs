import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

export default async function loadSeed() {
  const seed = JSON.parse(readFileSync(resolve(HERE, '..', 'fixtures', 'seed.json'), 'utf8'))
  return {
    state_delta: {
      topic: seed.topic,
      angles: seed.angles,
    },
  }
}
