import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as childProcess from 'node:child_process'
import * as fs from 'node:fs'

// We import the module under test after setting up mocks via vi.mock
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof childProcess>()
  return { ...actual, spawnSync: vi.fn() }
})

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof fs>()
  return { ...actual, mkdirSync: vi.fn(), rmdirSync: vi.fn() }
})

// Mock the core import so it doesn't actually resolve the workspace package
vi.mock('@openexpertise/core', () => ({}))

import { doctorCommand } from '../src/commands/doctor.js'

const spawnSyncMock = vi.mocked(childProcess.spawnSync)
const mkdirSyncMock = vi.mocked(fs.mkdirSync)
const rmdirSyncMock = vi.mocked(fs.rmdirSync)

// Helper: build a successful spawnSync return for a given version string
function spawnSuccess(version: string) {
  return {
    status: 0,
    stdout: version,
    stderr: '',
    error: undefined,
    pid: 1,
    output: [],
    signal: null,
  }
}

// Helper: build a failing spawnSync return (binary not found)
function spawnNotFound() {
  return {
    status: null,
    stdout: '',
    stderr: '',
    error: new Error('ENOENT'),
    pid: 0,
    output: [],
    signal: null,
  }
}

// Capture stdout written via process.stdout.write
function captureStdout(): { get: () => string; restore: () => void } {
  const chunks: string[] = []
  const spy = vi
    .spyOn(process.stdout, 'write')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .mockImplementation((chunk: any) => {
      chunks.push(String(chunk))
      return true
    })
  return {
    get: () => chunks.join(''),
    restore: () => spy.mockRestore(),
  }
}

let originalVersion: string

beforeEach(() => {
  originalVersion = process.version
  // Default: all binaries found
  spawnSyncMock.mockImplementation((cmd: string) => {
    const versions: Record<string, string> = {
      pnpm: '9.10.0',
      claude: '1.0.118',
      codex: '0.2.0',
      gemini: '2.0.0',
    }
    const v = versions[String(cmd)]
    if (v) return spawnSuccess(v)
    return spawnNotFound()
  })

  mkdirSyncMock.mockImplementation(() => undefined)
  rmdirSyncMock.mockImplementation(() => undefined)

  // Default: both keys set
  process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test'
  process.env['OPENAI_API_KEY'] = 'sk-openai-test'
})

afterEach(() => {
  vi.clearAllMocks()
  delete process.env['ANTHROPIC_API_KEY']
  delete process.env['OPENAI_API_KEY']
  // Restore process.version if it was overridden
  if (process.version !== originalVersion) {
    Object.defineProperty(process, 'version', { value: originalVersion, configurable: true })
  }
})

describe('doctorCommand', () => {
  it('all-pass scenario returns exit 0 and 9 passing checks', async () => {
    const stdout = captureStdout()
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit')
    })

    const code = await doctorCommand({ json: false })

    stdout.restore()
    exitSpy.mockRestore()

    expect(code).toBe(0)
    const out = stdout.get()
    expect(out).toContain('Node version')
    expect(out).toContain('pnpm')
    expect(out).toContain('claude CLI')
    expect(out).toContain('codex CLI')
    expect(out).toContain('gemini CLI')
    expect(out).toContain('ANTHROPIC_API_KEY')
    expect(out).toContain('OPENAI_API_KEY')
    expect(out).toContain('.openexpertise/ writable')
    expect(out).toContain('@openexpertise/core importable')
    // Should have summary
    expect(out).toContain('Summary:')
    // No failures
    expect(out).toContain('0 failures')
    // Next-steps hints
    expect(out).toContain('oe init')
  })

  it('missing claude CLI → 1 warn, exit code 0', async () => {
    spawnSyncMock.mockImplementation((cmd: string) => {
      if (String(cmd) === 'claude') return spawnNotFound()
      const versions: Record<string, string> = { pnpm: '9.10.0', codex: '0.2.0', gemini: '2.0.0' }
      const v = versions[String(cmd)]
      return v ? spawnSuccess(v) : spawnNotFound()
    })

    const stdout = captureStdout()
    const code = await doctorCommand({ json: false })
    stdout.restore()

    expect(code).toBe(0)
    const out = stdout.get()
    expect(out).toContain('claude CLI: not found')
    expect(out).toContain('1 warning')
    expect(out).toContain('0 failures')
  })

  it('Node < 20 → 1 fail, exit code 1', async () => {
    Object.defineProperty(process, 'version', { value: 'v18.20.0', configurable: true })

    const stdout = captureStdout()
    const code = await doctorCommand({ json: false })
    stdout.restore()

    expect(code).toBe(1)
    const out = stdout.get()
    expect(out).toContain('v18.20.0')
    expect(out).toContain('1 failure')
  })

  it('neither API key set → 2 warns for env, exit 0', async () => {
    delete process.env['ANTHROPIC_API_KEY']
    delete process.env['OPENAI_API_KEY']

    const stdout = captureStdout()
    const code = await doctorCommand({ json: false })
    stdout.restore()

    expect(code).toBe(0)
    const out = stdout.get()
    expect(out).toContain('ANTHROPIC_API_KEY: not set')
    expect(out).toContain('OPENAI_API_KEY: not set')
    // 2 warns from keys
    expect(out).toMatch(/[2-9] warnings/)
  })

  it('.openexpertise/ not writable → 1 fail, exit 1', async () => {
    mkdirSyncMock.mockImplementation(() => {
      throw new Error('EACCES: permission denied')
    })

    const stdout = captureStdout()
    const code = await doctorCommand({ json: false })
    stdout.restore()

    expect(code).toBe(1)
    const out = stdout.get()
    expect(out).toContain('.openexpertise/ writable')
    expect(out).toContain('1 failure')
  })

  it('--json flag emits valid parseable JSON with 8 checks', async () => {
    const stdout = captureStdout()
    const code = await doctorCommand({ json: true })
    stdout.restore()

    expect(code).toBe(0)
    const raw = stdout.get()
    const parsed = JSON.parse(raw) as {
      checks: Array<{ name: string; status: string; detail: string }>
      summary: { passed: number; warned: number; failed: number }
    }
    expect(parsed.checks).toHaveLength(9)
    expect(parsed.checks.every((c) => ['pass', 'warn', 'fail'].includes(c.status))).toBe(true)
    expect(parsed.checks.every((c) => typeof c.name === 'string' && c.name.length > 0)).toBe(true)
    expect(parsed.checks.every((c) => typeof c.detail === 'string')).toBe(true)
    expect(typeof parsed.summary.passed).toBe('number')
    expect(typeof parsed.summary.warned).toBe('number')
    expect(typeof parsed.summary.failed).toBe('number')
  })

  it('--json flag does not print ANSI codes or human text', async () => {
    const stdout = captureStdout()
    await doctorCommand({ json: true })
    stdout.restore()

    const raw = stdout.get()
    // Should not contain ANSI escape sequences
    expect(raw).not.toContain('\x1b[')
    // Should not contain emoji summary line
    expect(raw).not.toContain('Summary:')
    // Should be valid JSON
    expect(() => JSON.parse(raw)).not.toThrow()
  })

  it('--json with a fail reflects failed count in summary', async () => {
    Object.defineProperty(process, 'version', { value: 'v16.0.0', configurable: true })

    const stdout = captureStdout()
    const code = await doctorCommand({ json: true })
    stdout.restore()

    expect(code).toBe(1)
    const parsed = JSON.parse(stdout.get()) as {
      checks: Array<{ name: string; status: string; detail: string }>
      summary: { passed: number; warned: number; failed: number }
    }
    expect(parsed.summary.failed).toBeGreaterThanOrEqual(1)
    const nodeCheck = parsed.checks.find((c) => c.name === 'Node version')
    expect(nodeCheck?.status).toBe('fail')
  })
})
