# The `cli-agent` node kind

`cli-agent` delegates a graph step to an agentic CLI subprocess (Claude Code, Codex, or Gemini). Each invocation is stateless: one subprocess per node run, captures the final stdout, optionally parses JSON and validates against an AJV schema, writes the result to state.

## Why use it

Three reasons to pick `cli-agent` over the SDK-only `agent` kind:

1. **The CLI has tools.** Claude Code can read/edit files, search code, run bash. Codex and Gemini have their own. With `cli-agent`, the CLI does its own tool use — you only see the final answer.
2. **Skills, plugins, MCP.** All three CLIs have their own extension ecosystems. `cli-agent` invokes them in the user's normal CLI environment, so installed skills/plugins/MCP servers Just Work.
3. **No API key juggling.** The CLI uses whatever auth the user already set up.

## YAML reference

```yaml
- id: my_step
  kind: cli-agent
  provider: claude-code   # or codex, or gemini
  prompt: |               # inline only; use {{state_field}} for templating
    Review the diff:
    {{diff}}
  workdir: ./checkout     # optional; default = experience dir
  model: claude-sonnet-4-6  # optional, provider-specific
  output_format: json     # text (default) | json
  schema:                 # only used in json mode; AJV-validated
    type: object
    required: [findings]
  timeout_ms: 600000      # default 10min
  extra_args: ['--allowed-tools', 'Read,Grep']  # passed verbatim to the CLI
  reads: [diff]           # standard state-view declaration — REQUIRED if prompt uses {{diff}}
  writes: [findings]      # output state field
```

**Important about `reads:`** — `{{placeholder}}` interpolation only sees state fields declared in `reads:`. If your prompt references `{{foo}}`, the node MUST declare `reads: [foo]` (or rely on `for_each` or `args`).

## Providers (V1)

| Provider | Command shape |
|---|---|
| `claude-code` | `claude -p "<prompt>" --output-format <text\|json> [--model X] [extra_args]` |
| `codex` | `codex exec --skip-git-repo-check [--model X] [extra_args] "<prompt>"` |
| `gemini` | `gemini --yolo --prompt "<prompt>" [--model X] [extra_args]` |

The provider field is enforced by the schema; unknown values are rejected at `oe validate`.

## Output handling

- **text mode (default):** stdout is written to a single field — the first entry in `writes:`. If `writes:` is empty, the output is dropped. If `writes:` has more than one entry, the dispatcher refuses to run (ambiguous mapping).
- **json mode:** stdout is `JSON.parse`'d. If `schema:` is set, AJV validates the result. Validation failures throw, triggering the node's `on_error` policy.

## Error policy interaction

- Subprocess exits non-zero → throws → `on_error` applies
- Subprocess times out → throws → `on_error` applies
- JSON parse fails or schema invalid → throws → `on_error` applies

Use `on_error: { policy: retry, attempts: 3, backoff: exponential, base_ms: 1000 }` for flaky CLI invocations.

## Testing

For deterministic tests, inject a `SubprocessRunner`:

```ts
class FakeRunner implements SubprocessRunner {
  async run(spec, opts) {
    return { stdout: 'canned', stderr: '', exitCode: 0, timedOut: false }
  }
}
dispatchers.register(new CliAgentDispatcher({ runner: new FakeRunner() }))
```

See `e2e/cli-agent.e2e.test.ts` for a worked example.

## V1 limitations

- **Stateless only.** Each node runs a fresh subprocess; no conversation memory across nodes. Session-mode is a V2 candidate.
- **Inline prompts only.** No file-path loading (unlike the `agent` kind). Read the file in a preceding `tool` node and pass it via `reads:` if you need that.
- **No streaming.** We wait for the subprocess to finish, then parse stdout in one go.
- **No concurrency within a node.** Use `for_each` for fan-out (still sequential per the V1 scheduler).
- **CLI versions are not version-pinned.** If a provider release changes its flags, the provider file in `packages/node-kinds-cli-agent/src/providers/` needs updating.
