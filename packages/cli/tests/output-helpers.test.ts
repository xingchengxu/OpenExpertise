import { describe, it, expect, vi } from 'vitest'
import { printNextSteps } from '../src/output-helpers.js'

describe('printNextSteps', () => {
  it('writes one → line per hint', () => {
    const writes: string[] = []
    const spy = vi
      .spyOn(process.stdout, 'write')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockImplementation((chunk: any) => {
        writes.push(String(chunk))
        return true
      })
    printNextSteps(['a', 'b'])
    spy.mockRestore()
    const all = writes.join('')
    expect(all).toContain('→')
    expect((all.match(/→/g) ?? []).length).toBe(2)
    expect(all).toContain('a')
    expect(all).toContain('b')
  })

  it('writes nothing when hints array is empty', () => {
    const writes: string[] = []
    const spy = vi
      .spyOn(process.stdout, 'write')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockImplementation((chunk: any) => {
        writes.push(String(chunk))
        return true
      })
    printNextSteps([])
    spy.mockRestore()
    expect(writes).toHaveLength(0)
  })
})
