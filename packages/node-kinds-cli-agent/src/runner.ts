import { spawn } from 'node:child_process'

export interface SpawnSpec {
  cmd: string
  args: string[]
  env?: Record<string, string>
  stdin?: string
}

export interface RunResult {
  stdout: string
  stderr: string
  exitCode: number
  timedOut: boolean
}

export interface SubprocessRunner {
  run(spec: SpawnSpec, opts: { timeoutMs: number; cwd: string }): Promise<RunResult>
}

export class DefaultSubprocessRunner implements SubprocessRunner {
  async run(spec: SpawnSpec, opts: { timeoutMs: number; cwd: string }): Promise<RunResult> {
    return new Promise<RunResult>((resolve) => {
      const child = spawn(spec.cmd, spec.args, {
        cwd: opts.cwd,
        env: { ...process.env, ...(spec.env ?? {}) },
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      let stdout = ''
      let stderr = ''
      let timedOut = false
      let settled = false

      const settle = (exitCode: number) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        clearTimeout(killTimer)
        resolve({ stdout, stderr, exitCode, timedOut })
      }

      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8')
      })
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8')
      })
      child.on('error', () => settle(-1))
      child.on('close', (code) => settle(code ?? -1))

      let killTimer: NodeJS.Timeout = setTimeout(() => undefined, 0)
      const timer = setTimeout(() => {
        timedOut = true
        child.kill('SIGTERM')
        killTimer = setTimeout(() => {
          if (!child.killed) child.kill('SIGKILL')
        }, 2000)
      }, opts.timeoutMs)

      if (spec.stdin !== undefined) {
        child.stdin.write(spec.stdin)
      }
      child.stdin.end()
    })
  }
}
