import { spawnSync } from 'node:child_process'
import { mkdirSync, rmdirSync } from 'node:fs'
import { join } from 'node:path'
import { printNextSteps } from '../output-helpers.js'

export interface DoctorOpts {
  json: boolean
}

export interface CheckResult {
  name: string
  status: 'pass' | 'warn' | 'fail'
  detail: string
}

// ANSI helpers
const GREEN = '\x1b[32m'
const YELLOW = '\x1b[33m'
const RED = '\x1b[31m'
const RESET = '\x1b[0m'

function icon(status: 'pass' | 'warn' | 'fail'): string {
  if (status === 'pass') return `${GREEN}✓${RESET}`
  if (status === 'warn') return `${YELLOW}⚠${RESET}`
  return `${RED}✗${RESET}`
}

function probeVersion(cmd: string, args: string[]): string | null {
  const result = spawnSync(cmd, args, { timeout: 5000, encoding: 'utf8' })
  if (result.error || result.status !== 0) {
    // Some CLIs output version to stderr
    const stderr = (result.stderr ?? '').trim()
    if (stderr.length > 0) {
      return (stderr.split('\n')[0] ?? '').trim() || null
    }
    return null
  }
  const stdout = (result.stdout ?? '').trim()
  if (stdout.length > 0) return (stdout.split('\n')[0] ?? '').trim() || null
  const stderr = (result.stderr ?? '').trim()
  if (stderr.length > 0) return (stderr.split('\n')[0] ?? '').trim() || null
  return null
}

function checkNodeVersion(): CheckResult {
  const raw = process.version // e.g. "v22.5.0"
  const match = /^v?(\d+)/.exec(raw)
  const major = match?.[1] !== undefined ? parseInt(match[1], 10) : 0
  if (major >= 20) {
    return { name: 'Node version', status: 'pass', detail: `${raw} (≥ 20.0.0)` }
  }
  return { name: 'Node version', status: 'fail', detail: `${raw} — must be ≥ 20.0.0` }
}

function checkPnpm(): CheckResult {
  const version = probeVersion('pnpm', ['--version'])
  if (version !== null) {
    return { name: 'pnpm', status: 'pass', detail: version }
  }
  return {
    name: 'pnpm',
    status: 'warn',
    detail: 'not found on PATH (npm/yarn work too, but pnpm is recommended)',
  }
}

function checkCli(name: string, cmd: string): CheckResult {
  const version = probeVersion(cmd, ['--version'])
  if (version !== null) {
    return { name: `${name} CLI`, status: 'pass', detail: version }
  }
  return {
    name: `${name} CLI`,
    status: 'warn',
    detail: `not found on PATH (only needed for cli-agent nodes with provider: ${name.toLowerCase()})`,
  }
}

function checkApiKeys(): CheckResult[] {
  const anthropic = process.env['ANTHROPIC_API_KEY']
  const openai = process.env['OPENAI_API_KEY']

  const results: CheckResult[] = [
    {
      name: 'ANTHROPIC_API_KEY',
      status: anthropic ? 'pass' : 'warn',
      detail: anthropic ? 'set' : 'not set (you can still use OpenAI-only nodes)',
    },
    {
      name: 'OPENAI_API_KEY',
      status: openai ? 'pass' : 'warn',
      detail: openai ? 'set' : 'not set (you can still use Claude-only nodes)',
    },
  ]

  // Downgrade to warn only if neither is set; if at least one is set the individual warns are fine
  if (!anthropic && !openai) {
    // Both warn — add note to the first one
    results[0] = {
      name: 'ANTHROPIC_API_KEY',
      status: 'warn',
      detail: 'not set',
    }
    results[1] = {
      name: 'OPENAI_API_KEY',
      status: 'warn',
      detail: 'not set — at least one LLM API key is required for agent/evolve/ultra commands',
    }
  }

  return results
}

function checkWritable(): CheckResult {
  const probePath = join('.openexpertise', '.doctor-probe')
  try {
    mkdirSync(probePath, { recursive: true })
    rmdirSync(probePath)
    return { name: '.openexpertise/ writable', status: 'pass', detail: 'directory is writable' }
  } catch (err) {
    return {
      name: '.openexpertise/ writable',
      status: 'fail',
      detail: `cannot write to .openexpertise/: ${(err as Error).message}`,
    }
  }
}

async function checkCoreImportable(): Promise<CheckResult> {
  try {
    await import('@openexpertise/core')
    return { name: '@openexpertise/core importable', status: 'pass', detail: 'import succeeded' }
  } catch (err) {
    return {
      name: '@openexpertise/core importable',
      status: 'fail',
      detail: `import failed: ${(err as Error).message}`,
    }
  }
}

export async function doctorCommand(opts: DoctorOpts): Promise<number> {
  const checks: CheckResult[] = []

  checks.push(checkNodeVersion())
  checks.push(checkPnpm())
  checks.push(checkCli('claude', 'claude'))
  checks.push(checkCli('codex', 'codex'))
  checks.push(checkCli('gemini', 'gemini'))
  checks.push(...checkApiKeys())
  checks.push(checkWritable())
  checks.push(await checkCoreImportable())

  const passed = checks.filter((c) => c.status === 'pass').length
  const warned = checks.filter((c) => c.status === 'warn').length
  const failed = checks.filter((c) => c.status === 'fail').length

  if (opts.json) {
    const output = {
      checks: checks.map((c) => ({ name: c.name, status: c.status, detail: c.detail })),
      summary: { passed, warned, failed },
    }
    process.stdout.write(JSON.stringify(output, null, 2) + '\n')
  } else {
    for (const check of checks) {
      process.stdout.write(`${icon(check.status)} ${check.name}: ${check.detail}\n`)
    }
    process.stdout.write('\n')
    const parts: string[] = []
    parts.push(`${passed} passed`)
    parts.push(`${warned} warning${warned !== 1 ? 's' : ''}`)
    parts.push(`${failed} failure${failed !== 1 ? 's' : ''}`)
    process.stdout.write(`Summary: ${parts.join(' · ')}\n`)
    printNextSteps([
      `oe init my-flow  — scaffold`,
      `oe ultra "<task>"  — let the LLM author one`,
      `oe demo  — preview without an API key`,
    ])
  }

  return failed > 0 ? 1 : 0
}
