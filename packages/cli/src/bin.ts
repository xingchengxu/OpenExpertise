#!/usr/bin/env node
import { buildProgram } from './index.js'

const program = buildProgram()
program.parseAsync(process.argv).catch((err) => {
  process.stderr.write(`oe: ${(err as Error).message}\n`)
  process.exit(1)
})
