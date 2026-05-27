# `oe resume`

Re-run an experience with cached results from a prior run.

## Synopsis

```
oe resume [options] <run-id>
```

## Description

`oe resume` replays an experience using the event log from a previous run as a cache. Nodes whose outputs were recorded in the original run are restored from the log rather than re-executed. Only nodes that did not complete in the prior run (e.g. because it failed partway through) are dispatched again.

The original args are recovered automatically from the first event (`run.started`) in the prior run's `.jsonl` log, so you do not need to pass `--args` again.

`oe resume` writes a **new** run-id and a new event log — the original log is never modified. The new run-id is returned in the `resume complete` log line.

::: warning API key required for agent/skill nodes
`oe resume` currently hard-wires the Anthropic client (`AnthropicLLMClient`) for agent and skill nodes. Set `ANTHROPIC_API_KEY` before resuming an experience that contains those node kinds.
:::

## Arguments

| Argument   | Required | Description                                                                                            |
| ---------- | -------- | ------------------------------------------------------------------------------------------------------ |
| `<run-id>` | ✓        | The run-id of the prior run to resume from. Must match a file at `.openexpertise/runs/<run-id>.jsonl`. |

## Options

| Flag                  | Description                                              | Default  |
| --------------------- | -------------------------------------------------------- | -------- |
| `--experience <path>` | Path to the experience directory (or `experience.yaml`). | `.`      |
| `--log-format <fmt>`  | Log format: `json` \| `pretty`                           | `pretty` |
| `--log-level <level>` | Log verbosity: `info` \| `debug` \| `warn` \| `error`    | `info`   |
| `-h, --help`          | Display help and exit                                    | —        |

## Exit codes

| Code | Meaning                                                                                       |
| ---- | --------------------------------------------------------------------------------------------- |
| `0`  | Resumed run completed with `status: success`                                                  |
| `1`  | `experience.yaml` not found, prior run log not found, or run completed with `status: failure` |

## Examples

Resume the most-recently-failed run (copy the run-id from the prior `oe run` output):

```bash
oe resume 4f3a1b2c-0d9e-4f7a-8b6c-1e2d3f4a5b6c
```

```
{"level":"info","type":"run.started","runId":"9a8b7c6d-…","msg":"run.started"}
{"level":"info","type":"node.cached","nodeId":"fetch-data","msg":"node.cached"}
{"level":"info","type":"node.completed","nodeId":"analyse","msg":"node.completed"}
{"level":"info","runId":"9a8b7c6d-…","status":"success","originalRunId":"4f3a1b2c-…","msg":"resume complete"}
```

Resume a run in a specific experience directory:

```bash
oe resume 4f3a1b2c-0d9e-4f7a-8b6c-1e2d3f4a5b6c --experience examples/review-branch
```

Get JSON output:

```bash
oe --log-format json resume 4f3a1b2c-0d9e-4f7a-8b6c-1e2d3f4a5b6c | jq '.msg'
```

## Notes / gotchas

- **LLM provider is fixed to Anthropic** in the current implementation of `oe resume`. Unlike `oe run`, there is no `--llm` flag; the `AnthropicLLMClient` is always used for any `agent` or `skill` nodes that fire.
- **Args are recovered from the log**, not accepted on the command line. If the original run log's first line does not contain an `args` field, an empty object is used.
- **A new run-id is always issued.** Inspect the resumed run with `oe inspect <new-run-id>`, not the original run-id.
- The cache key used to match nodes from the prior run is based on node id + input hash — the same mechanism described in [Cache key + memoization](/concepts/cache).
- `oe resume` does not accept `--tui`, `--evolve`, or `--concurrency`. Use `oe run` if you need those features and are starting fresh.

## See also

- [`oe run`](/reference/cli/run) — start a new run from scratch
- [`oe inspect`](/reference/cli/inspect) — examine the event log for any run-id
- [Resume + cache](/guide/resume-cache)
- [Cache key + memoization](/concepts/cache)
