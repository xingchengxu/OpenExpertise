# `oe doctor`

Check that all runtime prerequisites are satisfied before running an experience.

## Synopsis

```
oe doctor [options]
```

## Description

`oe doctor` runs a sequence of environment checks and prints the result of each one with a colored icon (`✓` pass, `⚠` warn, `✗` fail). It exits with code `0` if no check has `fail` status, or `1` if any check fails.

Warnings (`⚠`) indicate missing optional dependencies. Failures (`✗`) indicate missing required dependencies that will prevent any experience from running.

### Checks performed

| Check                              | Pass condition                                | Status if missing                                      |
| ---------------------------------- | --------------------------------------------- | ------------------------------------------------------ |
| **Node version**                   | `process.version` major ≥ 20                  | `fail`                                                 |
| **pnpm**                           | `pnpm --version` exits 0                      | `warn` (npm/yarn work too)                             |
| **claude CLI**                     | `claude --version` exits 0                    | `warn` (only needed for `provider: claude-code` nodes) |
| **codex CLI**                      | `codex --version` exits 0                     | `warn` (only needed for `provider: codex` nodes)       |
| **gemini CLI**                     | `gemini --version` exits 0                    | `warn` (only needed for `provider: gemini` nodes)      |
| **ANTHROPIC_API_KEY**              | `process.env.ANTHROPIC_API_KEY` is set        | `warn` (can still use OpenAI-only nodes)               |
| **OPENAI_API_KEY**                 | `process.env.OPENAI_API_KEY` is set           | `warn` (can still use Claude-only nodes)               |
| **.openexpertise/ writable**       | Can `mkdir` + `rmdir` under `.openexpertise/` | `fail`                                                 |
| **@openexpertise/core importable** | `import('@openexpertise/core')` succeeds      | `fail`                                                 |

::: info Both API keys warn independently
If neither `ANTHROPIC_API_KEY` nor `OPENAI_API_KEY` is set, both warn and the second message reads: "not set — at least one LLM API key is required for agent/evolve/ultra commands".
:::

## Options

| Flag     | Default | Description                                                                         |
| -------- | ------- | ----------------------------------------------------------------------------------- |
| `--json` | `false` | Output all check results as a machine-readable JSON object instead of colored text. |

There is no `--quiet` flag. For scripting, use `--json` and inspect the exit code.

## Exit codes

| Code | Meaning                                                                                                                     |
| ---- | --------------------------------------------------------------------------------------------------------------------------- |
| `0`  | All checks passed or warned. No failures.                                                                                   |
| `1`  | One or more checks failed (Node version too old, `.openexpertise/` not writable, or `@openexpertise/core` fails to import). |

## Examples

### Human-readable output

```bash
oe doctor
```

```
✓ Node version: v22.5.0 (≥ 20.0.0)
✓ pnpm: 9.15.4
⚠ codex CLI: not found on PATH (only needed for cli-agent nodes with provider: codex)
⚠ gemini CLI: not found on PATH (only needed for cli-agent nodes with provider: gemini)
✓ claude CLI: 1.0.3
✓ ANTHROPIC_API_KEY: set
⚠ OPENAI_API_KEY: not set (you can still use Claude-only nodes)
✓ .openexpertise/ writable: directory is writable
✓ @openexpertise/core importable: import succeeded

Summary: 6 passed · 3 warnings · 0 failures
```

Exit code: `0`

### Machine-readable JSON output

```bash
oe doctor --json
```

```json
{
  "checks": [
    { "name": "Node version", "status": "pass", "detail": "v22.5.0 (≥ 20.0.0)" },
    { "name": "pnpm", "status": "pass", "detail": "9.15.4" },
    { "name": "claude CLI", "status": "pass", "detail": "1.0.3" },
    {
      "name": "codex CLI",
      "status": "warn",
      "detail": "not found on PATH (only needed for cli-agent nodes with provider: codex)"
    },
    {
      "name": "gemini CLI",
      "status": "warn",
      "detail": "not found on PATH (only needed for cli-agent nodes with provider: gemini)"
    },
    { "name": "ANTHROPIC_API_KEY", "status": "pass", "detail": "set" },
    {
      "name": "OPENAI_API_KEY",
      "status": "warn",
      "detail": "not set (you can still use Claude-only nodes)"
    },
    { "name": ".openexpertise/ writable", "status": "pass", "detail": "directory is writable" },
    { "name": "@openexpertise/core importable", "status": "pass", "detail": "import succeeded" }
  ],
  "summary": { "passed": 6, "warned": 3, "failed": 0 }
}
```

### Use in CI

```yaml
- name: Check OE environment
  run: oe doctor
  # exits 0 only if Node >= 20, .openexpertise/ writable, and core importable
```

### Parse JSON in a script

```bash
result=$(oe doctor --json)
failed=$(echo "$result" | jq '.summary.failed')
if [ "$failed" -gt 0 ]; then
  echo "Environment check failed"
  exit 1
fi
```

## Common failure modes

### `✗ Node version: v18.x.x — must be ≥ 20.0.0`

Upgrade Node.js to 20 LTS or later. The runtime relies on native `fetch` (Node 18+) and ESM module loading behavior that behaves consistently on 20+.

### `✗ .openexpertise/ writable: cannot write to .openexpertise/: EACCES`

The current directory is not writable. Either:

- Run `oe doctor` (and `oe run`) from a directory you own.
- Fix permissions: `chmod u+w .`

### `✗ @openexpertise/core importable: import failed: Cannot find module ...`

The workspace has not been built. Run `pnpm install && pnpm -r build` from the repo root. If you are using the global npm install, ensure you are on a compatible version: `npm install -g @openexpertise/cli`.

## See also

- [Deployment](/operations/deployment)
- [CLI overview](/reference/cli/)
- [`oe run`](/reference/cli/run)
