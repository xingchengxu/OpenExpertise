# `oe schema`

Print the `experience.yaml` JSON Schema — wire it into your editor for autocomplete, hover docs, and inline validation.

## Synopsis

```
oe schema [options]
```

## Description

`oe schema` emits the canonical JSON Schema for `experience.yaml` to **stdout**. Point any [yaml-language-server](https://github.com/redhat-developer/yaml-language-server)-backed editor (VS Code, Neovim, etc.) at this schema and you get autocomplete on node kinds and fields, hover documentation, and inline validation as you type.

Pass `--write` to save the schema as `experience.schema.json` next to your experience instead of printing it. Then add this header to the top of `experience.yaml`:

```yaml
# yaml-language-server: $schema=./experience.schema.json
```

::: tip `oe init` wires this automatically
New experiences scaffolded with [`oe init`](/reference/cli/init) already ship `experience.schema.json` plus the `# yaml-language-server:` header — autocomplete works out of the box. Use `oe schema --write` to add it to an **existing** project. See the [Editor support](/guide/editor-support) guide.
:::

This command is a **pure transform**: it never calls an LLM and **needs no API key**.

## Options

| Flag               | Description                                                          | Default                  |
| ------------------ | -------------------------------------------------------------------- | ------------------------ |
| `--write`          | Write `experience.schema.json` locally instead of printing to stdout | `false`                  |
| `-o, --out <file>` | Output path for `--write`                                            | `experience.schema.json` |
| `-h, --help`       | Display help and exit                                                | —                        |

## Exit codes

| Code | Meaning                               |
| ---- | ------------------------------------- |
| `0`  | Schema printed or written             |
| `1`  | Write error (rare — bad `--out` path) |

## Examples

Print the schema to stdout:

```bash
oe schema
```

Save it next to your experience for editor autocomplete:

```bash
oe schema --write
```

```
{"level":"info","out":"/…/experience.schema.json","msg":"wrote experience.schema.json — point your editor at it: # yaml-language-server: $schema=./<file>"}
```

Then add the header to `experience.yaml`:

```yaml
# yaml-language-server: $schema=./experience.schema.json
name: my-workflow
# …
```

Write to a custom path:

```bash
oe schema --write -o schemas/oe-experience.schema.json
```

Pipe the schema into another tool:

```bash
oe schema | jq '.properties.nodes'
```

## Notes / gotchas

- **No API key required.** The schema is bundled with the CLI; emitting it is offline and deterministic.
- The `# yaml-language-server: $schema=` header is **relative** to the YAML file. If you write the schema to a different directory, adjust the path in the header accordingly.
- The same schema is also served from a public URL on this docs site, so you can point your editor at the hosted copy instead of a local file. See [Editor support](/guide/editor-support).
- Re-run `oe schema --write` after upgrading the CLI to refresh a stale local `experience.schema.json`.

## See also

- [`oe init`](/reference/cli/init) — scaffolds the schema + header automatically
- [`oe validate`](/reference/cli/validate) — full CLI-side validation of a YAML file
- [Editor support](/guide/editor-support) — autocomplete, hover docs, inline validation
- [Hand-writing experience.yaml](/guide/authoring-yaml)
