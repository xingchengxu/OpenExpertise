# `oe state`

Inspect the persistent state blackboard.

## Synopsis

```
oe state [options] [field]
```

## Description

`oe state` reads from the SQLite blackboard at `.openexpertise/state.sqlite` and prints the current values stored there. The blackboard persists across runs: each `oe run` merges `state_delta` writes from completed nodes into it.

When called without `[field]`, the command prints a full snapshot of all fields defined in the experience's `state.schema`. When a `[field]` argument is supplied, only that field's current value is printed.

If the SQLite file does not exist yet (i.e. no run has completed), `oe state` exits `0` and logs that no state file exists. It does not treat this as an error.

## Arguments

| Argument  | Required | Description                                                                       |
| --------- | -------- | --------------------------------------------------------------------------------- |
| `[field]` | —        | A specific state field name to read. When omitted, the full snapshot is returned. |

## Options

| Flag                  | Description                                              | Default  |
| --------------------- | -------------------------------------------------------- | -------- |
| `--experience <path>` | Path to the experience directory (or `experience.yaml`). | `.`      |
| `--log-format <fmt>`  | Log format: `json` \| `pretty`                           | `pretty` |
| `--log-level <level>` | Log verbosity: `info` \| `debug` \| `warn` \| `error`    | `info`   |
| `-h, --help`          | Display help and exit                                    | —        |

## Exit codes

| Code | Meaning                                                    |
| ---- | ---------------------------------------------------------- |
| `0`  | State read successfully (or state file does not exist yet) |
| `1`  | `experience.yaml` not found                                |

## Examples

Print the full state snapshot for the experience in the current directory:

```bash
oe state
```

```
{"level":"info","snapshot":{"greeting":"Hello, OpenExpertise!"},"msg":"full state snapshot"}
```

Read a single field:

```bash
oe state greeting
```

```
{"level":"info","field":"greeting","value":"Hello, OpenExpertise!","msg":"state field"}
```

Read state for a specific experience:

```bash
oe state --experience examples/review-branch
```

Read a field from a specific experience:

```bash
oe state last_run_summary --experience examples/review-branch
```

Extract the raw value with `jq`:

```bash
oe --log-format json state greeting | jq -r '.value'
```

## Notes / gotchas

- `oe state` reads the **current** (latest) value of each field. To see historical writes across runs, use the `StateStore.history(field)` programmatic API.
- The `state.schema` in `experience.yaml` defines which fields are tracked. Requesting a field not in the schema will return `undefined` rather than an error.
- To wipe all state and start fresh, use [`oe reset-state`](/reference/cli/reset-state).

## See also

- [`oe reset-state`](/reference/cli/reset-state) — delete the state blackboard
- [`oe run`](/reference/cli/run) — execute an experience (produces state writes)
- [State (SQLite blackboard)](/concepts/state)
