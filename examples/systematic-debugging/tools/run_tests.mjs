// Run the test command again and return a verification status.
// Used after the fix is applied to confirm the failing test now passes.

import { spawnSync } from 'node:child_process'

export default async function runTests(input) {
  const repoPath = input._state?.repo_path
  const cmdArg = input._state?.failing_test_cmd
  if (typeof repoPath !== 'string' || typeof cmdArg !== 'string') {
    throw new Error('run_tests requires repo_path and failing_test_cmd in state')
  }
  const tokens = cmdArg.split(/\s+/).filter((t) => t.length > 0)
  const [cmd, ...args] = tokens
  if (!cmd) throw new Error('failing_test_cmd is empty')
  const result = spawnSync(cmd, args, {
    cwd: repoPath,
    encoding: 'utf8',
    timeout: 60_000,
  })
  const passed = result.status === 0
  return {
    state_delta: {
      verification_status: passed ? 'passed' : 'failed',
      verification_output: passed
        ? (result.stdout ?? '').slice(0, 2000)
        : (result.stderr ?? '').slice(0, 4000) || (result.stdout ?? '').slice(0, 4000),
    },
  }
}
