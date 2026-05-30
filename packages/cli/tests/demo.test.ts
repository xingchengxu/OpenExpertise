import { describe, it, expect, vi, beforeEach } from 'vitest'
import { demoCommand } from '../src/commands/demo.js'
import type { Logger } from 'pino'

const mockLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() } as unknown as Logger

describe('oe demo', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lists all demos when no name given', async () => {
    const writes: string[] = []
    const spy = vi
      .spyOn(process.stdout, 'write')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockImplementation((chunk: any) => {
        writes.push(String(chunk))
        return true
      })
    const code = await demoCommand({ json: false, logger: mockLogger })
    spy.mockRestore()
    expect(code).toBe(0)
    const all = writes.join('')
    expect(all).toContain('deep-research')
    expect(all).toContain('review-branch')
    expect(all).toContain('systematic-debugging')
    expect(all).toContain('brainstorming')
  })

  it('emits valid JSON in list mode with --json', async () => {
    const writes: string[] = []
    const spy = vi
      .spyOn(process.stdout, 'write')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockImplementation((chunk: any) => {
        writes.push(String(chunk))
        return true
      })
    const code = await demoCommand({ json: true, logger: mockLogger })
    spy.mockRestore()
    expect(code).toBe(0)
    const parsed = JSON.parse(writes.join(''))
    expect(Array.isArray(parsed.demos)).toBe(true)
    expect(parsed.demos.length).toBeGreaterThanOrEqual(4)
  })

  it('prints a specific demo when name given', async () => {
    const writes: string[] = []
    const spy = vi
      .spyOn(process.stdout, 'write')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockImplementation((chunk: any) => {
        writes.push(String(chunk))
        return true
      })
    const code = await demoCommand({ name: 'review-branch', json: false, logger: mockLogger })
    spy.mockRestore()
    expect(code).toBe(0)
    const all = writes.join('')
    expect(all).toContain('review-branch')
    expect(all).toContain('evolution proposal')
    expect(all).toContain('add-node')
    expect(all).toContain('pre-recorded demo')
    expect(all).toContain('oe graph')
    expect(all).toContain('oe inspect')
  })

  it('returns 1 + writes to stderr for unknown demo', async () => {
    const errWrites: string[] = []
    const spy = vi
      .spyOn(process.stderr, 'write')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockImplementation((chunk: any) => {
        errWrites.push(String(chunk))
        return true
      })
    const code = await demoCommand({ name: 'nope', json: false, logger: mockLogger })
    spy.mockRestore()
    expect(code).toBe(1)
    expect(errWrites.join('')).toContain('unknown demo')
  })

  it('emits valid JSON for a specific demo with --json', async () => {
    const writes: string[] = []
    const spy = vi
      .spyOn(process.stdout, 'write')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockImplementation((chunk: any) => {
        writes.push(String(chunk))
        return true
      })
    const code = await demoCommand({ name: 'deep-research', json: true, logger: mockLogger })
    spy.mockRestore()
    expect(code).toBe(0)
    const parsed = JSON.parse(writes.join(''))
    expect(parsed.name).toBe('deep-research')
    expect(parsed.run.command).toBeTypeOf('string')
    expect(parsed.run.final_state_preview).toBeTypeOf('object')
  })
})
