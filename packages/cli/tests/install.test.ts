import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as childProcess from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof childProcess>()
  return { ...actual, spawnSync: vi.fn() }
})

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof fs>()
  return {
    ...actual,
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    mkdtempSync: vi.fn(),
    cpSync: vi.fn(),
    rmSync: vi.fn(),
  }
})

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof os>()
  return { ...actual, tmpdir: vi.fn(() => '/tmp') }
})

// Mock registry-data so tests don't need a real registry.json on disk
vi.mock('../src/registry-data.js', () => ({
  findByName: vi.fn((name: string) => {
    if (name === 'deep-research') {
      return {
        name: 'deep-research',
        owner: 'xingchengxu',
        repo: 'OpenExpertise',
        subpath: 'examples/deep-research',
        ref: 'v0.1.0',
        description: 'Multi-vendor deep research.',
        tags: ['research'],
      }
    }
    return null
  }),
}))

import { installCommand } from '../src/commands/install.js'
import pino from 'pino'

const spawnSyncMock = vi.mocked(childProcess.spawnSync)
const existsSyncMock = vi.mocked(fs.existsSync)
const mkdirSyncMock = vi.mocked(fs.mkdirSync)
const mkdtempSyncMock = vi.mocked(fs.mkdtempSync)
const cpSyncMock = vi.mocked(fs.cpSync)
const rmSyncMock = vi.mocked(fs.rmSync)

function makeLogger() {
  return pino({ level: 'silent' })
}

function spawnSuccess() {
  return {
    status: 0,
    stdout: '',
    stderr: '',
    error: undefined,
    pid: 1,
    output: [],
    signal: null,
  }
}

function spawnFail(stderr = 'clone failed') {
  return {
    status: 1,
    stdout: '',
    stderr,
    error: undefined,
    pid: 1,
    output: [],
    signal: null,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  // Default: dest does not exist, tmp dir is fresh
  existsSyncMock.mockReturnValue(true) // experience.yaml + sourcePath exist by default
  // Override per-call below when needed
  mkdtempSyncMock.mockReturnValue('/tmp/oe-install-abc')
  mkdirSyncMock.mockImplementation(() => undefined)
  cpSyncMock.mockImplementation(() => undefined)
  rmSyncMock.mockImplementation(() => undefined)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('installCommand — gh: spec', () => {
  it('parses gh:owner/repo and clones from HTTPS', async () => {
    // dest does not exist, then tmp + experience.yaml do
    existsSyncMock
      .mockReturnValueOnce(false) // dest doesn't exist
      .mockReturnValue(true) // sourcePath + experience.yaml exist

    spawnSyncMock.mockReturnValue(spawnSuccess())

    const code = await installCommand({ spec: 'gh:myuser/myrepo', logger: makeLogger() })

    expect(code).toBe(0)
    expect(spawnSyncMock).toHaveBeenCalledWith(
      'git',
      expect.arrayContaining(['clone', '--depth=1', '--branch', 'main']),
      expect.objectContaining({ encoding: 'utf8' }),
    )
    // URL must be HTTPS
    const args = spawnSyncMock.mock.calls[0]![1] as string[]
    const urlArg = args.find((a) => a.startsWith('https://'))
    expect(urlArg).toBe('https://github.com/myuser/myrepo.git')
  })

  it('parses gh:owner/repo@v1.2.3 and passes the ref to git', async () => {
    existsSyncMock.mockReturnValueOnce(false).mockReturnValue(true)

    spawnSyncMock.mockReturnValue(spawnSuccess())

    const code = await installCommand({ spec: 'gh:myuser/myrepo@v1.2.3', logger: makeLogger() })

    expect(code).toBe(0)
    const args = spawnSyncMock.mock.calls[0]![1] as string[]
    expect(args).toContain('v1.2.3')
  })

  it('--ref option overrides the embedded ref in gh: spec', async () => {
    existsSyncMock.mockReturnValueOnce(false).mockReturnValue(true)

    spawnSyncMock.mockReturnValue(spawnSuccess())

    const code = await installCommand({
      spec: 'gh:myuser/myrepo@v1.0.0',
      ref: 'v2.0.0',
      logger: makeLogger(),
    })

    expect(code).toBe(0)
    const args = spawnSyncMock.mock.calls[0]![1] as string[]
    expect(args).toContain('v2.0.0')
    expect(args).not.toContain('v1.0.0')
  })

  it('gh:bad (no slash) returns exit 1 with format hint', async () => {
    existsSyncMock.mockReturnValue(false)

    await expect(installCommand({ spec: 'gh:badformat', logger: makeLogger() })).rejects.toThrow(
      'Format: gh:owner/repo[@ref]',
    )
  })
})

describe('installCommand — curated name', () => {
  it('resolves deep-research from registry and uses pinned ref', async () => {
    existsSyncMock.mockReturnValueOnce(false).mockReturnValue(true)

    spawnSyncMock.mockReturnValue(spawnSuccess())

    const code = await installCommand({ spec: 'deep-research', logger: makeLogger() })

    expect(code).toBe(0)
    const args = spawnSyncMock.mock.calls[0]![1] as string[]
    expect(args).toContain('v0.1.0')
    const urlArg = args.find((a) => a.startsWith('https://'))
    expect(urlArg).toBe('https://github.com/xingchengxu/OpenExpertise.git')
  })

  it('unknown curated name returns error mentioning oe registry', async () => {
    existsSyncMock.mockReturnValue(false)

    await expect(
      installCommand({ spec: 'unknown-experience', logger: makeLogger() }),
    ).rejects.toThrow('oe registry')
  })
})

describe('installCommand — guard conditions', () => {
  it('returns 1 if dest already exists', async () => {
    existsSyncMock.mockReturnValueOnce(true) // dest exists

    const code = await installCommand({ spec: 'gh:user/repo', logger: makeLogger() })

    expect(code).toBe(1)
    expect(spawnSyncMock).not.toHaveBeenCalled()
  })

  it('returns 1 if git clone fails', async () => {
    existsSyncMock
      .mockReturnValueOnce(false) // dest doesn't exist
      .mockReturnValue(true)

    spawnSyncMock.mockReturnValue(spawnFail('remote: repository not found'))

    const code = await installCommand({ spec: 'gh:user/repo', logger: makeLogger() })

    expect(code).toBe(1)
    expect(cpSyncMock).not.toHaveBeenCalled()
  })

  it('returns 1 if experience.yaml missing in source', async () => {
    existsSyncMock
      .mockReturnValueOnce(false) // dest doesn't exist
      .mockReturnValueOnce(true) // sourcePath exists
      .mockReturnValueOnce(false) // experience.yaml missing

    spawnSyncMock.mockReturnValue(spawnSuccess())

    const code = await installCommand({ spec: 'gh:user/repo', logger: makeLogger() })

    expect(code).toBe(1)
    expect(cpSyncMock).not.toHaveBeenCalled()
  })

  it('always cleans up tmp dir (finally block)', async () => {
    existsSyncMock.mockReturnValueOnce(false).mockReturnValue(true)

    spawnSyncMock.mockReturnValue(spawnFail())

    await installCommand({ spec: 'gh:user/repo', logger: makeLogger() })

    expect(rmSyncMock).toHaveBeenCalledWith('/tmp/oe-install-abc', { recursive: true, force: true })
  })
})
