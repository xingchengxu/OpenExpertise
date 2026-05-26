import { describe, it, expect } from 'vitest'
import { DefaultSubprocessRunner, type SubprocessRunner } from '../src/runner.js'

describe('DefaultSubprocessRunner', () => {
  const runner: SubprocessRunner = new DefaultSubprocessRunner()

  it('captures stdout from a successful subprocess', async () => {
    const res = await runner.run(
      { cmd: process.execPath, args: ['-e', 'process.stdout.write("hello")'] },
      { timeoutMs: 5000, cwd: process.cwd() },
    )
    expect(res.exitCode).toBe(0)
    expect(res.stdout).toBe('hello')
    expect(res.stderr).toBe('')
    expect(res.timedOut).toBe(false)
  })

  it('captures stderr separately', async () => {
    const res = await runner.run(
      { cmd: process.execPath, args: ['-e', 'process.stderr.write("oops")'] },
      { timeoutMs: 5000, cwd: process.cwd() },
    )
    expect(res.stderr).toBe('oops')
    expect(res.stdout).toBe('')
  })

  it('reports non-zero exit codes without throwing', async () => {
    const res = await runner.run(
      { cmd: process.execPath, args: ['-e', 'process.exit(2)'] },
      { timeoutMs: 5000, cwd: process.cwd() },
    )
    expect(res.exitCode).toBe(2)
    expect(res.timedOut).toBe(false)
  })

  it('enforces timeout via SIGTERM', async () => {
    const start = Date.now()
    const res = await runner.run(
      { cmd: process.execPath, args: ['-e', 'setInterval(()=>{}, 1000)'] },
      { timeoutMs: 200, cwd: process.cwd() },
    )
    const elapsed = Date.now() - start
    expect(res.timedOut).toBe(true)
    expect(elapsed).toBeLessThan(5000)
  })

  it('pipes stdin when SpawnSpec.stdin is set', async () => {
    const res = await runner.run(
      {
        cmd: process.execPath,
        args: [
          '-e',
          'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>process.stdout.write(d))',
        ],
        stdin: 'piped-input',
      },
      { timeoutMs: 5000, cwd: process.cwd() },
    )
    expect(res.stdout).toBe('piped-input')
  })

  it('respects env overrides', async () => {
    const res = await runner.run(
      {
        cmd: process.execPath,
        args: ['-e', 'process.stdout.write(process.env.OE_TEST||"none")'],
        env: { OE_TEST: 'visible' },
      },
      { timeoutMs: 5000, cwd: process.cwd() },
    )
    expect(res.stdout).toBe('visible')
  })
})
