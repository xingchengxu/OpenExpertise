import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

export default async function writeDigest(input) {
  const digest = input._state?.digest
  const classified = input._state?.classified ?? []
  if (!digest) {
    throw new Error('write_digest requires `digest` in state')
  }
  const outDir = resolve(HERE, '..', 'out')
  mkdirSync(outDir, { recursive: true })
  const outPath = resolve(outDir, 'digest.md')

  const lines = []
  lines.push(`# ${digest.headline}`)
  lines.push('')
  lines.push('## This week')
  lines.push('')
  for (const b of digest.bullets) {
    lines.push(`- ${b}`)
  }
  lines.push('')
  lines.push('## By category')
  lines.push('')
  for (const [cat, count] of Object.entries(digest.by_category ?? {})) {
    lines.push(`- **${cat}**: ${count}`)
  }
  lines.push('')
  lines.push('## All PRs')
  lines.push('')
  for (const c of classified) {
    lines.push(`- #${c.number} (${c.category}) — ${c.summary}`)
  }
  lines.push('')

  writeFileSync(outPath, lines.join('\n'))
  return { state_delta: { digest_path: outPath } }
}
