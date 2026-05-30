# `oe graph`

Render an experience's DAG as a Mermaid `flowchart`.

## Synopsis

```
oe graph [options] [path]
```

## Description

`oe graph` loads `experience.yaml`, validates it, and renders the node graph as a [Mermaid](https://mermaid.js.org/) `flowchart`. By default it prints the diagram to **stdout** so you can paste it straight into a GitHub README, issue, or PR comment — GitHub renders Mermaid fenced blocks natively.

The diagram groups nodes into **phase subgraphs**, gives each node kind its own shape and colour (`tool`, `agent`, `skill`, `dataset`, `experience`, `cli-agent`), and labels edges produced by `for_each` fan-out and conditional `when` dependencies.

This is a **pure transform**: it reads YAML and writes a diagram. It never calls an LLM and **needs no API key**.

## Arguments

| Argument | Required | Description                                                                                              |
| -------- | -------- | -------------------------------------------------------------------------------------------------------- |
| `[path]` | —        | Path to an `experience.yaml` file or to a directory containing one. Defaults to `.` (current directory). |

## Options

| Flag               | Description                                          | Default       |
| ------------------ | ---------------------------------------------------- | ------------- |
| `--html`           | Wrap the diagram in a self-contained HTML page       | `false`       |
| `--lr`             | Left-to-right layout instead of the default top-down | top-down (TD) |
| `-o, --out <file>` | Write to a file instead of printing to stdout        | stdout        |
| `-h, --help`       | Display help and exit                                | —             |

## Exit codes

| Code | Meaning                                                    |
| ---- | ---------------------------------------------------------- |
| `0`  | Diagram rendered successfully                              |
| `1`  | `experience.yaml` not found, or the YAML failed validation |

## Examples

Print the Mermaid diagram for an example to stdout:

```bash
oe graph examples/hello-tool
```

```
flowchart TD
  greet["greet"]:::tool
  classDef tool fill:#e3f2fd,stroke:#1565c0
```

Paste that into a GitHub Markdown file inside a fenced ` ```mermaid ` block and it renders inline.

Render left-to-right (useful for wide, linear pipelines):

```bash
oe graph examples/review-branch --lr
```

Write a self-contained HTML page you can open in a browser:

```bash
oe graph examples/deep-research --html -o deep-research.html
open deep-research.html
```

Save the raw Mermaid to a file:

```bash
oe graph examples/oncall-runbook -o runbook.mmd
```

## Notes / gotchas

- **No API key required.** `oe graph` is a deterministic YAML-to-diagram transform; it never instantiates an LLM client.
- The YAML must **validate** first. If validation fails, `oe graph` exits `1` and logs the schema errors — fix them (or run [`oe validate`](/reference/cli/validate)) before graphing.
- `--lr` and `-o` work with or without `--html`. Without `--html`, `-o` writes raw Mermaid (`.mmd`); with `--html`, it writes a standalone page.
- To embed a diagram in a GitHub README, copy the stdout output into a fenced code block tagged `mermaid` — GitHub renders it without any extra tooling.
- Every built-in example page on this site already shows its `oe graph` output, auto-embedded by the docs build.

## See also

- [`oe validate`](/reference/cli/validate) — validate the YAML before graphing
- [`oe inspect`](/reference/cli/inspect) — `--html` colours this same DAG by each node's run status
- [`oe schema`](/reference/cli/schema) — emit the JSON Schema for editor autocomplete
- [What is an experience?](/concepts/experiences)
- [The 6 node kinds](/concepts/node-kinds)
