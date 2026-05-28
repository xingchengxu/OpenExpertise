import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { submitCommand } from '../src/commands/submit.js'
import type { Logger } from 'pino'

const mockLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() } as unknown as Logger

// Mock spawnSync at the module level
vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process')
  return {
    ...actual,
    spawnSync: vi.fn(actual.spawnSync),
  }
})

import { spawnSync } from 'node:child_process'
const mockSpawn = spawnSync as unknown as ReturnType<typeof vi.fn>

function setupExperience(name = 'my-flow', description = 'A test flow', addYaml = true): string {
  const dir = mkdtempSync(join(tmpdir(), 'oe-submit-test-'))
  if (addYaml) {
    writeFileSync(
      join(dir, 'experience.yaml'),
      `name: ${name}
description: ${description}
version: 0.1.0
state:
  schema:
    out: { type: string }
graph:
  nodes:
    - id: noop
      kind: tool
      impl: ./tools/noop.mjs
      writes: [out]
  edges: []
`,
    )
  }
  return dir
}

function mockGit(remote: string, ref: string, isTag = false, repoRoot?: string) {
  mockSpawn.mockImplementation(((cmd: string, args: string[], _opts: unknown) => {
    if (cmd !== 'git') {
      // Pass through to other spawns (e.g. open)
      return { status: 0, stdout: '', stderr: '', signal: null, pid: 0, output: [] }
    }
    const sub = args.join(' ')
    if (sub.includes('remote get-url origin')) {
      return { status: 0, stdout: remote + '\n', stderr: '', signal: null, pid: 0, output: [] }
    }
    if (sub.includes('describe --exact-match --tags HEAD')) {
      return isTag
        ? { status: 0, stdout: ref + '\n', stderr: '', signal: null, pid: 0, output: [] }
        : { status: 128, stdout: '', stderr: 'no tag', signal: null, pid: 0, output: [] }
    }
    if (sub.includes('rev-parse --abbrev-ref HEAD')) {
      return { status: 0, stdout: ref + '\n', stderr: '', signal: null, pid: 0, output: [] }
    }
    if (sub.includes('rev-parse --show-toplevel')) {
      return {
        status: 0,
        stdout: (repoRoot ?? '/some/repo') + '\n',
        stderr: '',
        signal: null,
        pid: 0,
        output: [],
      }
    }
    return { status: 1, stdout: '', stderr: '', signal: null, pid: 0, output: [] }
  }) as never)
}

describe('oe submit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 1 if experience.yaml is missing', async () => {
    const dir = setupExperience('x', 'x', false)
    const errs: string[] = []
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation((c: unknown) => {
      errs.push(String(c))
      return true
    })
    const code = await submitCommand({ path: dir, dryRun: true, logger: mockLogger })
    spy.mockRestore()
    expect(code).toBe(1)
    expect(errs.join('')).toContain('experience.yaml not found')
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns 1 if no github remote is detected', async () => {
    const dir = setupExperience()
    mockSpawn.mockImplementation(
      () =>
        ({
          status: 1,
          stdout: '',
          stderr: '',
          signal: null,
          pid: 0,
          output: [],
        }) as never,
    )
    const errs: string[] = []
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation((c: unknown) => {
      errs.push(String(c))
      return true
    })
    const code = await submitCommand({ path: dir, dryRun: true, logger: mockLogger })
    spy.mockRestore()
    expect(code).toBe(1)
    expect(errs.join('')).toContain('could not detect a github remote')
    rmSync(dir, { recursive: true, force: true })
  })

  it('generates an entry with --dry-run', async () => {
    const dir = setupExperience('my-flow', 'A useful flow')
    mockGit('https://github.com/jane/my-flow.git', 'v1.0.0', true, dir)
    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((c: unknown) => {
      out.push(String(c))
      return true
    })
    const code = await submitCommand({
      path: dir,
      tags: 'security,ci',
      dryRun: true,
      logger: mockLogger,
    })
    spy.mockRestore()
    expect(code).toBe(0)
    const text = out.join('')
    expect(text).toContain('my-flow')
    expect(text).toContain('"owner": "jane"')
    expect(text).toContain('"repo": "my-flow"')
    expect(text).toContain('"ref": "v1.0.0"')
    expect(text).toContain('security')
    expect(text).toContain('dry-run')
    rmSync(dir, { recursive: true, force: true })
  })

  it('parses both https and git@ remote URLs', async () => {
    const dir = setupExperience()
    mockGit('git@github.com:jane/x-flow.git', 'main', false, dir)
    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((c: unknown) => {
      out.push(String(c))
      return true
    })
    await submitCommand({ path: dir, dryRun: true, logger: mockLogger })
    spy.mockRestore()
    const text = out.join('')
    expect(text).toContain('"owner": "jane"')
    expect(text).toContain('"repo": "x-flow"')
    rmSync(dir, { recursive: true, force: true })
  })

  it('warns when the ref is not a tag', async () => {
    const dir = setupExperience()
    mockGit('https://github.com/jane/x.git', 'main', false, dir)
    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((c: unknown) => {
      out.push(String(c))
      return true
    })
    await submitCommand({ path: dir, dryRun: true, tags: 'x', logger: mockLogger })
    spy.mockRestore()
    expect(out.join('')).toContain('not a tag')
    rmSync(dir, { recursive: true, force: true })
  })

  it('warns when no tags are provided', async () => {
    const dir = setupExperience()
    mockGit('https://github.com/jane/x.git', 'v0.1.0', true, dir)
    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((c: unknown) => {
      out.push(String(c))
      return true
    })
    await submitCommand({ path: dir, dryRun: true, logger: mockLogger })
    spy.mockRestore()
    expect(out.join('')).toContain('No tags')
    rmSync(dir, { recursive: true, force: true })
  })

  it('writes to --output file', async () => {
    const dir = setupExperience('outflow', 'Flow that writes')
    mockGit('https://github.com/jane/outflow.git', 'v0.2.0', true, dir)
    const outFile = join(dir, 'entry.json')
    const code = await submitCommand({
      path: dir,
      tags: 'x',
      output: outFile,
      logger: mockLogger,
    })
    expect(code).toBe(0)
    const content = JSON.parse(readFileSync(outFile, 'utf8')) as {
      name: string
      tags: string[]
    }
    expect(content.name).toBe('outflow')
    expect(content.tags).toContain('x')
    rmSync(dir, { recursive: true, force: true })
  })

  it('overrides name / ref / description via flags', async () => {
    const dir = setupExperience('original-name', 'original desc')
    mockGit('https://github.com/jane/repo.git', 'main', false, dir)
    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((c: unknown) => {
      out.push(String(c))
      return true
    })
    await submitCommand({
      path: dir,
      name: 'override-name',
      ref: 'v9.9.9',
      description: 'overridden description',
      tags: 'x',
      dryRun: true,
      logger: mockLogger,
    })
    spy.mockRestore()
    const text = out.join('')
    expect(text).toContain('"name": "override-name"')
    expect(text).toContain('"ref": "v9.9.9"')
    expect(text).toContain('overridden description')
    rmSync(dir, { recursive: true, force: true })
  })
})
