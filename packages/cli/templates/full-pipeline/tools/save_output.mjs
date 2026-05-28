import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

export default async function saveOutput(input) {
  const summary = input._state?.summary
  const deepDive = input._state?.deep_dive
  if (!summary || !deepDive) {
    throw new Error('save_output requires both `summary` and `deep_dive` in state')
  }
  const outDir = resolve(HERE, '..', 'out')
  mkdirSync(outDir, { recursive: true })
  const outPath = resolve(outDir, 'report.md')
  const md = [
    `# ${summary.category} report`,
    '',
    `## TL;DR`,
    '',
    summary.tldr,
    '',
    `## Key points`,
    '',
    ...summary.key_points.map((p) => `- ${p}`),
    '',
    `## Deep dive`,
    '',
    deepDive,
    '',
  ].join('\n')
  writeFileSync(outPath, md)
  return { state_delta: { output_path: outPath } }
}
