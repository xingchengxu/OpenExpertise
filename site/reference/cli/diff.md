# `oe diff`

List pending evolution proposals.

## Synopsis

```
oe diff [options]
```

## Description

`oe diff` scans the `.openexpertise/evolution/` directory for Markdown files produced by [`oe evolve`](/reference/cli/evolve). For each file found, it logs the filename and prints a preview of the first 20 lines to stdout, followed by a `---` separator.

Files are listed in alphabetical order (which corresponds to run-id order when UUIDs are used). The command is read-only and does not modify any files.

If the evolution directory does not exist or is empty, `oe diff` exits `0` with an informational message rather than an error.

## Arguments

None.

## Options

| Flag                  | Description                                              | Default  |
| --------------------- | -------------------------------------------------------- | -------- |
| `--experience <path>` | Path to the experience directory (or `experience.yaml`). | `.`      |
| `--log-format <fmt>`  | Log format: `json` \| `pretty`                           | `pretty` |
| `--log-level <level>` | Log verbosity: `info` \| `debug` \| `warn` \| `error`    | `info`   |
| `-h, --help`          | Display help and exit                                    | —        |

## Exit codes

| Code | Meaning                                                         |
| ---- | --------------------------------------------------------------- |
| `0`  | Directory scanned (including the case where no proposals exist) |

## Examples

List proposals for the experience in the current directory:

```bash
oe diff
```

```
{"level":"info","count":2,"msg":"pending evolution proposals"}
{"level":"info","file":"4f3a1b2c-….md","msg":"proposal"}
# Evolution proposals — run 4f3a1b2c-…

## Proposal 1: increase concurrency
…
---
{"level":"info","file":"9a8b7c6d-….md","msg":"proposal"}
# Evolution proposals — run 9a8b7c6d-…
…
---
```

List proposals for a specific experience:

```bash
oe diff --experience examples/review-branch
```

No proposals yet:

```bash
oe diff
```

```
{"level":"info","evoDir":"/…/.openexpertise/evolution","msg":"no evolution proposals yet — run `oe evolve <run-id>` first"}
```

Open a specific proposal file directly:

```bash
cat .openexpertise/evolution/4f3a1b2c-0d9e-4f7a-8b6c-1e2d3f4a5b6c.md
```

## Notes / gotchas

- `oe diff` shows only the **first 20 lines** of each proposal as a preview. Open the `.md` files directly for the full content.
- Proposals are never applied automatically. After reviewing, edit `experience.yaml` manually to incorporate any changes you agree with.
- Running `oe evolve` again for the same run-id overwrites that proposal file — previous proposals for that run-id are lost.
- There is no `oe diff --apply` or patch command. Applying proposals is a deliberate, human-in-the-loop step.

## See also

- [`oe evolve`](/reference/cli/evolve) — generate proposals from a run
- [`oe inspect`](/reference/cli/inspect) — examine the underlying run events
- [Applying proposals](/guide/applying-proposals)
- [Author → run → evolve loop](/guide/closed-loop)
- [Evolution loop](/concepts/evolution-loop)
