# `oe reset-state`

Delete the persistent state blackboard (destructive).

## Synopsis

```
oe reset-state [options]
```

## Description

`oe reset-state` deletes the SQLite file at `.openexpertise/state.sqlite`, wiping all accumulated state for the experience. This operation is **irreversible** — no backup is made.

Because the operation is destructive, `oe reset-state` requires an explicit `--yes` flag. Without it, the command exits `1` and logs an error asking you to confirm. This prevents accidental data loss when the command is invoked interactively.

If the state file does not exist (e.g. no runs have been performed), the command exits `0` and logs that there is nothing to reset.

::: warning Destructive operation
`oe reset-state --yes` permanently deletes all state written by every previous run of the experience. There is no undo. Consider inspecting the current state with [`oe state`](/reference/cli/state) before resetting.
:::

## Arguments

None.

## Options

| Flag                  | Description                                                           | Default  |
| --------------------- | --------------------------------------------------------------------- | -------- |
| `--experience <path>` | Path to the experience directory (or `experience.yaml`).              | `.`      |
| `--yes`               | Confirm the destructive action. Required for the deletion to proceed. | `false`  |
| `--log-format <fmt>`  | Log format: `json` \| `pretty`                                        | `pretty` |
| `--log-level <level>` | Log verbosity: `info` \| `debug` \| `warn` \| `error`                 | `info`   |
| `-h, --help`          | Display help and exit                                                 | —        |

## Exit codes

| Code | Meaning                                              |
| ---- | ---------------------------------------------------- |
| `0`  | State deleted (or state file did not exist)          |
| `1`  | `--yes` not provided, or `experience.yaml` not found |

## Examples

Reset state with confirmation:

```bash
oe reset-state --yes
```

```
{"level":"info","dbPath":"/…/.openexpertise/state.sqlite","msg":"state reset"}
```

Attempt without `--yes` (fails safely):

```bash
oe reset-state
```

```
{"level":"error","msg":"reset-state requires --yes to confirm destructive action"}
# exit code: 1
```

Reset state for a specific experience directory:

```bash
oe reset-state --yes --experience examples/review-branch
```

Dry-run — inspect what would be deleted before confirming:

```bash
oe state --experience examples/review-branch   # preview current values
oe reset-state --yes --experience examples/review-branch
```

## Notes / gotchas

- Only the `state.sqlite` file is deleted. Run logs under `.openexpertise/runs/` and evolution proposals under `.openexpertise/evolution/` are **not** affected.
- After resetting state, the next `oe run` starts with a blank blackboard — all `state.schema` fields will be `undefined` until nodes write them.
- To reset state in CI scripts non-interactively, always pass `--yes`.

## See also

- [`oe state`](/reference/cli/state) — read current state before deciding to reset
- [`oe run`](/reference/cli/run) — re-run after a reset to rebuild state
- [State (SQLite blackboard)](/concepts/state)
