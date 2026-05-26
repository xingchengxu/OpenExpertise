#!/usr/bin/env node
// Standalone validator usable without the full oe CLI installed.
// Usage: node validate-experience.mjs <path-to-experience.yaml>

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseExperienceYaml, validateExperienceSpec, ValidationError } from '@openexpertise/schema'

const arg = process.argv[2]
if (!arg) {
  console.error('usage: validate-experience.mjs <path-to-experience.yaml>')
  process.exit(2)
}

const abs = resolve(arg)
let source
try {
  source = readFileSync(abs, 'utf8')
} catch (err) {
  console.error(`cannot read ${abs}: ${err.message}`)
  process.exit(1)
}

try {
  const spec = parseExperienceYaml(source)
  validateExperienceSpec(spec)
  console.log(`OK: ${abs}`)
  process.exit(0)
} catch (err) {
  if (err instanceof ValidationError) {
    console.error(`VALIDATION FAILED: ${err.message}`)
    if (err.errors?.length) {
      for (const msg of err.errors) console.error(`  - ${msg}`)
    }
  } else {
    console.error(`PARSE FAILED: ${err.message}`)
  }
  process.exit(1)
}
