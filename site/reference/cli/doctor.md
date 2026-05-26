# `oe doctor`

Check that all prerequisites and runtime dependencies are satisfied.

## Synopsis

```
oe doctor [options]
```

## Description

Runs a series of environment checks and reports any missing or misconfigured dependencies:

- Node.js version (`>=20`)
- CLI binaries on PATH (`claude`, `codex`, `gemini`) — only flagged as missing, not required
- `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` — reports which are set (does not print values)
- SQLite availability

Exits with code `0` if all required checks pass, `1` if any required check fails.

## Options

| Flag | Description |
|---|---|
| `--json` | Output results as JSON |
| `--quiet` | Suppress output; use only the exit code |

## Example

```bash
oe doctor
```

```
✔ Node.js v22.4.0
✔ ANTHROPIC_API_KEY set
✔ SQLite available
✘ codex not found on PATH (optional — required only for cli-agent nodes with provider: codex)
✘ gemini not found on PATH (optional — required only for cli-agent nodes with provider: gemini)

1 optional dependency missing. Run `oe doctor --json` for machine-readable output.
```
