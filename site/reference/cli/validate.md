# `oe validate`

Parse and schema-validate an `experience.yaml` file without executing it.

## Synopsis

```
oe validate [path]
```

## Description

`oe validate` loads the `experience.yaml` at `<path>` (or `./experience.yaml` when `<path>` is omitted), parses the YAML, and runs the full `@openexpertise/schema` validator against it. No nodes are executed; no API keys are required.

If `<path>` points to a directory, the command appends `experience.yaml` automatically. If `<path>` ends in `.yaml` or `.yml`, it is used as-is.

On success the command logs `experience valid` and exits `0`. On failure it logs each schema violation and exits `1`.

## Arguments

| Argument | Required | Description |
|---|---|---|
| `[path]` | — | Path to an `experience.yaml` file or to a directory that contains one. Defaults to `.` (current directory). |

## Options

| Flag | Description | Default |
|---|---|---|
| `--log-format <fmt>` | Log format: `json` \| `pretty` | `pretty` |
| `--log-level <level>` | Log verbosity: `info` \| `debug` \| `warn` \| `error` | `info` |
| `-h, --help` | Display help and exit | — |

## Exit codes

| Code | Meaning |
|---|---|
| `0` | YAML is valid |
| `1` | Validation failed (parse error, schema violation, or file not found) |

## Examples

Validate the experience in the current directory:

```bash
oe validate
```

```
{"level":"info","path":"/…/experience.yaml","msg":"experience valid"}
```

Validate by explicit path to the YAML file:

```bash
oe validate examples/hello-tool/experience.yaml
```

Validate a directory (auto-resolves to `experience.yaml` inside it):

```bash
oe validate examples/review-branch
```

Get machine-readable output for CI:

```bash
oe --log-format json validate examples/hello-tool | jq '.msg'
```

Fail fast on invalid YAML and print errors:

```bash
oe validate /tmp/broken.yaml; echo "exit: $?"
```

```
{"level":"error","errors":[{"message":"graph.nodes[0].id is required"}],"msg":"validation failed"}
exit: 1
```

## Notes / gotchas

- `oe validate` does **not** check whether tool `impl` files exist on disk — it only validates the YAML structure. Use `oe run` to catch missing files at execution time.
- The validator is synchronous and fast; use it as a pre-commit or CI step.
- `oe run` calls the same parser internally, so a passing `oe validate` means `oe run` will not fail at the parse stage.

## See also

- [`oe init`](/reference/cli/init) — generate a valid scaffold to start from
- [`oe run`](/reference/cli/run) — execute after validation passes
- [YAML schema reference](/reference/schema)
- [The 6 node kinds](/concepts/node-kinds)
