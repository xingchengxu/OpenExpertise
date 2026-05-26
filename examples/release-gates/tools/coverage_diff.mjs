import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

export default async function coverageDiff() {
  const before = JSON.parse(
    readFileSync(resolve(HERE, '..', 'fixtures', 'coverage_before.json'), 'utf8'),
  )
  const after = JSON.parse(
    readFileSync(resolve(HERE, '..', 'fixtures', 'coverage_after.json'), 'utf8'),
  )
  const delta = {
    line_coverage_before: before.line_coverage,
    line_coverage_after: after.line_coverage,
    delta_pct: Number((after.line_coverage - before.line_coverage).toFixed(2)),
    regression: after.line_coverage < before.line_coverage,
  }
  return { state_delta: { coverage_delta: delta } }
}
