import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

const ALLOWED = new Set(['MIT', 'BSD-3-Clause', 'Apache-2.0', 'ISC'])

export default async function licenseCheck() {
  const path = resolve(HERE, '..', 'fixtures', 'deps.json')
  const deps = JSON.parse(readFileSync(path, 'utf8'))
  const issues = deps
    .filter((d) => !ALLOWED.has(d.license))
    .map((d) => ({ package: d.name, license: d.license, severity: 'high' }))
  return { state_delta: { license_issues: issues } }
}
