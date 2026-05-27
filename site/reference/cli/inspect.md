# `oe inspect`

Render a run trace from the event log.

## Synopsis

```
oe inspect [options] <run-id>
```

## Description

`oe inspect` reads the newline-delimited JSON event log at `.openexpertise/runs/<run-id>.jsonl`, sorts events by their `ts` timestamp in ascending order, and emits each event through the logger. Events without a `ts` field are placed at the end.

The command is read-only and does not modify any state. It is useful for post-mortem debugging, auditing, or understanding what a run actually did.

## Arguments

| Argument   | Required | Description                                                                                |
| ---------- | -------- | ------------------------------------------------------------------------------------------ |
| `<run-id>` | ✓        | The run-id to inspect. Must match a `.jsonl` file at `.openexpertise/runs/<run-id>.jsonl`. |

## Options

| Flag                  | Description                                                                                     | Default  |
| --------------------- | ----------------------------------------------------------------------------------------------- | -------- |
| `--experience <path>` | Path to the experience directory (or `experience.yaml`). Used to locate `.openexpertise/runs/`. | `.`      |
| `--log-format <fmt>`  | Log format: `json` \| `pretty`                                                                  | `pretty` |
| `--log-level <level>` | Log verbosity: `info` \| `debug` \| `warn` \| `error`                                           | `info`   |
| `-h, --help`          | Display help and exit                                                                           | —        |

## Exit codes

| Code | Meaning                                |
| ---- | -------------------------------------- |
| `0`  | Log read and emitted successfully      |
| `1`  | Run log not found at the expected path |

## Examples

Inspect the most recent run (paste the run-id from `oe run` output):

```bash
oe inspect 4f3a1b2c-0d9e-4f7a-8b6c-1e2d3f4a5b6c
```

```
{"level":"info","type":"run.started","runId":"4f3a1b2c-…","args":{},"msg":"run.started"}
{"level":"info","type":"node.started","nodeId":"hello","msg":"node.started"}
{"level":"info","type":"node.completed","nodeId":"hello","durationMs":12,"msg":"node.completed"}
{"level":"info","type":"run.completed","status":"success","msg":"run.completed"}
```

Inspect a run from a specific experience directory:

```bash
oe inspect 4f3a1b2c-0d9e-4f7a-8b6c-1e2d3f4a5b6c --experience examples/review-branch
```

Filter to node-level events only:

```bash
oe --log-format json inspect 4f3a1b2c-0d9e-4f7a-8b6c-1e2d3f4a5b6c \
  | jq 'select(.type | startswith("node."))'
```

Count how many nodes ran:

```bash
oe --log-format json inspect 4f3a1b2c-0d9e-4f7a-8b6c-1e2d3f4a5b6c \
  | jq -s '[.[] | select(.type=="node.completed")] | length'
```

## Notes / gotchas

- Events are **sorted by `ts`** on read, not by file order. The `.jsonl` on disk may be written out-of-order during concurrent runs; `oe inspect` always produces a chronological trace.
- Events without a `ts` field (rare, implementation-defined) sort to the **end** of the output.
- `oe inspect` prints via the logger, so `--log-level warn` would suppress all `info`-level events. Use the default (`info`) or `debug` for full output.
- To see evolution proposals generated for this run, use [`oe diff`](/reference/cli/diff) or open `.openexpertise/evolution/<run-id>.md` directly.

## See also

- [`oe run`](/reference/cli/run) — execute an experience and produce a run log
- [`oe resume`](/reference/cli/resume) — re-run using a prior run log as cache
- [`oe diff`](/reference/cli/diff) — view evolution proposals linked to a run
- [Events & event log](/concepts/events)
