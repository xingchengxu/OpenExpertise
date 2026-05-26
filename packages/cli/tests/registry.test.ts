import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'

// Mock the registry data module so tests don't need a real file on disk
vi.mock('../src/registry-data.js', () => ({
  loadRegistry: vi.fn(() => ({
    version: 1,
    updated: '2026-05-27',
    description: 'Curated OpenExpertise experiences.',
    experiences: [
      {
        name: 'deep-research',
        owner: 'xingchengxu',
        repo: 'OpenExpertise',
        subpath: 'examples/deep-research',
        ref: 'v0.1.0',
        description: 'Multi-vendor deep research.',
        tags: ['research', 'multi-vendor'],
      },
      {
        name: 'brainstorming',
        owner: 'xingchengxu',
        repo: 'OpenExpertise',
        subpath: 'examples/brainstorming',
        ref: 'v0.1.0',
        description: 'Brainstorm skill.',
        tags: ['ideation'],
      },
    ],
  })),
  findByName: vi.fn(),
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof fs>()
  return {
    ...actual,
    existsSync: vi.fn(),
    readdirSync: vi.fn(),
    statSync: vi.fn(),
  }
})

import { registryCommand, installedCommand } from '../src/commands/registry.js'
import pino from 'pino'

const existsSyncMock = vi.mocked(fs.existsSync)
const readdirSyncMock = vi.mocked(fs.readdirSync)
const statSyncMock = vi.mocked(fs.statSync)

function makeLogger() {
  return pino({ level: 'silent' })
}

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

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('registryCommand', () => {
  it('--json returns parseable JSON with experiences array', async () => {
    const stdout = captureStdout()
    const code = await registryCommand({ json: true, logger: makeLogger() })
    stdout.restore()

    expect(code).toBe(0)
    const parsed = JSON.parse(stdout.get()) as { experiences: Array<{ name: string }> }
    expect(Array.isArray(parsed.experiences)).toBe(true)
    expect(parsed.experiences.length).toBeGreaterThan(0)
    expect(parsed.experiences[0]).toHaveProperty('name')
  })

  it('human output lists each experience by name', async () => {
    const stdout = captureStdout()
    const code = await registryCommand({ json: false, logger: makeLogger() })
    stdout.restore()

    expect(code).toBe(0)
    const out = stdout.get()
    expect(out).toContain('deep-research')
    expect(out).toContain('brainstorming')
    expect(out).toContain('v0.1.0')
    expect(out).toContain('oe install deep-research')
  })

  it('human output contains description and tags', async () => {
    const stdout = captureStdout()
    const code = await registryCommand({ json: false, logger: makeLogger() })
    stdout.restore()

    expect(code).toBe(0)
    const out = stdout.get()
    expect(out).toContain('Multi-vendor deep research')
    expect(out).toContain('research, multi-vendor')
  })

  it('human output shows registry version header', async () => {
    const stdout = captureStdout()
    await registryCommand({ json: false, logger: makeLogger() })
    stdout.restore()

    expect(stdout.get()).toContain('OpenExpertise registry')
    expect(stdout.get()).toContain('v1')
  })
})

describe('installedCommand', () => {
  it('--json returns { installed: [] } when base dir does not exist', async () => {
    existsSyncMock.mockReturnValue(false)

    const stdout = captureStdout()
    const code = await installedCommand({ json: true, logger: makeLogger() })
    stdout.restore()

    expect(code).toBe(0)
    const parsed = JSON.parse(stdout.get()) as { installed: string[] }
    expect(parsed.installed).toEqual([])
  })

  it('human output says nothing installed when base dir does not exist', async () => {
    existsSyncMock.mockReturnValue(false)

    const stdout = captureStdout()
    const code = await installedCommand({ json: false, logger: makeLogger() })
    stdout.restore()

    expect(code).toBe(0)
    expect(stdout.get()).toContain('Nothing installed yet')
  })

  it('--json lists directories present in experiences dir', async () => {
    existsSyncMock.mockReturnValue(true)
    readdirSyncMock.mockReturnValue(['deep-research', 'brainstorming'] as unknown as fs.Dirent[])
    statSyncMock.mockReturnValue({ isDirectory: () => true } as fs.Stats)

    const stdout = captureStdout()
    const code = await installedCommand({ json: true, logger: makeLogger() })
    stdout.restore()

    expect(code).toBe(0)
    const parsed = JSON.parse(stdout.get()) as { installed: string[] }
    expect(parsed.installed).toContain('deep-research')
    expect(parsed.installed).toContain('brainstorming')
  })

  it('human output shows each installed name and run command', async () => {
    existsSyncMock.mockReturnValue(true)
    readdirSyncMock.mockReturnValue(['deep-research'] as unknown as fs.Dirent[])
    statSyncMock.mockReturnValue({ isDirectory: () => true } as fs.Stats)

    const stdout = captureStdout()
    const code = await installedCommand({ json: false, logger: makeLogger() })
    stdout.restore()

    expect(code).toBe(0)
    const out = stdout.get()
    expect(out).toContain('deep-research')
    expect(out).toContain('oe run .openexpertise/experiences/deep-research')
  })
})
