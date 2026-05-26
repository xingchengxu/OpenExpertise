// Capture symptoms = run the failing test command in repo_path and harvest
// the actual stderr/stdout for the hypothesize agent.

import { spawnSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

export default async function captureSymptoms(input) {
  const repoArg = input._state?.repo_path ?? input.repo_path
  const cmdArg = input._state?.failing_test_cmd ?? input.failing_test_cmd
  if (typeof repoArg !== 'string' || typeof cmdArg !== 'string') {
    throw new Error('capture_symptoms requires repo_path and failing_test_cmd in state or args')
  }
  // Resolve repo_path relative to the experience directory when it's relative.
  const repoPath = resolve(HERE, '..', repoArg)
  const tokens = cmdArg.split(/\s+/).filter((t) => t.length > 0)
  const [cmd, ...args] = tokens
  if (!cmd) {
    throw new Error('failing_test_cmd is empty')
  }
  const result = spawnSync(cmd, args, {
    cwd: repoPath,
    encoding: 'utf8',
    timeout: 60_000,
  })
  return {
    state_delta: {
      symptoms: {
        repo_path: repoPath,
        cmd: cmdArg,
        exit_code: result.status,
        stdout: (result.stdout ?? '').slice(0, 8000),
        stderr: (result.stderr ?? '').slice(0, 8000),
      },
      repo_path: repoPath,
      failing_test_cmd: cmdArg,
    },
  }
}
