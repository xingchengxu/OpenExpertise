# `oe run`

Execute an experience from start to finish.

## Synopsis

```
oe run [options] [path]
```

## Description

`oe run` is the primary execution command. It loads `experience.yaml`, builds a dispatcher registry for all six node kinds (`tool`, `agent`, `skill`, `dataset`, `experience`, `cli-agent`), wires an event bus, and hands off to the `runExperience` core scheduler.

Each completed run writes a newline-delimited JSON event log to `.openexpertise/runs/<run-id>.jsonl` and updates the SQLite state blackboard at `.openexpertise/state.sqlite`.

**LLM construction is lazy.** The SDK client is only instantiated the first time an `agent` or `skill` node actually dispatches. Experiences that contain only `tool` or `dataset` nodes — like `examples/hello-tool` — run completely without any API key configured.

If `--evolve` is passed and the run succeeds, `oe evolve` is invoked automatically using the same LLM provider. Failures in that follow-on step are logged as warnings and do not change the exit code.

### TUI mode

Pass `--tui` to replace streaming log lines with a full-screen interactive dashboard. The TUI unmounts automatically when the run finishes.

## Arguments

| Argument | Required | Description |
|---|---|---|
| `[path]` | — | Path to an `experience.yaml` file or to a directory containing one. Defaults to `.` (current directory). |

## Options

| Flag | Description | Default |
|---|---|---|
| `--args <json>` | JSON object passed as the `args` map to the experience | `{}` |
| `--tui` | Show interactive TUI dashboard instead of log output | `false` |
| `--evolve` | After a successful run, automatically generate evolution proposals | `false` |
| `--llm <provider>` | LLM provider: `anthropic` \| `openai`. Auto-detected from environment when omitted. | auto |
| `--concurrency <n>` | Node-level concurrency limit. Overrides `runtime.concurrency` in YAML. Must be a positive integer. | YAML default |
| `--log-format <fmt>` | Log format: `json` \| `pretty` | `pretty` |
| `--log-level <level>` | Log verbosity: `info` \| `debug` \| `warn` \| `error` | `info` |
| `-h, --help` | Display help and exit | — |

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Run completed with `status: success` |
| `1` | Run completed with `status: failure` or an unhandled runtime error |
| `2` | Invalid invocation: `--args` is not valid JSON, or `--concurrency` is not a positive integer |

## Examples

Run the `hello-tool` example (no API key needed):

```bash
oe run examples/hello-tool
```

```
{"level":"info","type":"run.started","runId":"…","msg":"run.started"}
{"level":"info","type":"node.completed","nodeId":"hello","msg":"node.completed"}
{"level":"info","runId":"…","status":"success","finalState":{"greeting":"Hello, OpenExpertise!"},"msg":"run complete"}
```

Pass structured arguments to the experience:

```bash
oe run examples/review-branch --args '{"branch":"feat/my-feature","base":"main"}'
```

Run with the TUI dashboard:

```bash
oe run examples/oncall-runbook --tui
```

Run with an explicit LLM provider:

```bash
oe run examples/agent-echo --llm anthropic
```

Run and automatically generate evolution proposals afterward:

```bash
oe run examples/review-branch --evolve
```

Cap parallel node execution at 2:

```bash
oe run examples/deep-research --concurrency 2
```

Capture JSON logs for downstream processing:

```bash
oe --log-format json run examples/hello-tool | jq 'select(.type=="run.complete")'
```

## Notes / gotchas

- **Lazy LLM construction**: `--llm` or an API key environment variable is not required when the experience contains only `tool`, `dataset`, `experience`, or `cli-agent` nodes. The SDK is never instantiated unless an `agent` or `skill` node fires.
- **Provider detection order**: if `--llm` is not passed, `ANTHROPIC_API_KEY` is checked first. If neither key is set and an LLM node fires, the run exits `1` with an error message.
- **`--args` must be a JSON object** (`{…}`), not an array or scalar. Malformed JSON exits `2` before any nodes run.
- **`--concurrency` is per-run**, not global. Setting it to `1` forces strict sequential execution regardless of the YAML `runtime.concurrency` field.
- The `--evolve` flag uses the same LLM provider resolution as the run itself. If the LLM call fails inside `oe evolve`, the warning is non-fatal and the exit code reflects only the run result.
- Run IDs are UUID v4 strings emitted as part of the `run.started` event; capture them from the log if you want to call `oe inspect` or `oe evolve` later.

::: tip Resuming failed runs
If a run exits `1` due to a transient error (rate limit, network blip), use [`oe resume`](/reference/cli/resume) with the failed run-id to replay from the last successful cached node rather than starting over.
:::

## See also

- [`oe validate`](/reference/cli/validate) — validate YAML before running
- [`oe resume`](/reference/cli/resume) — re-run with node-level caching
- [`oe inspect`](/reference/cli/inspect) — replay the event log after a run
- [`oe evolve`](/reference/cli/evolve) — generate improvement proposals from a run
- [Concurrency + 429 retry](/guide/concurrency)
- [Error policies (on_error)](/guide/on-error)
- [The TUI dashboard](/guide/tui)
- [Scheduler (Sequential + Parallel)](/concepts/scheduler)
