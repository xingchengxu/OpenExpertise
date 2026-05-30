# `oe init`

Scaffold a new experience directory from a starter template — with editor autocomplete wired in.

## Synopsis

```
oe init [options] <name>
```

## Description

`oe init` creates a new directory named `<name>` in the current working directory from a starter template (default `tool-only`). It writes:

- `experience.yaml` — a valid experience for the chosen template, with a `# yaml-language-server: $schema=./experience.schema.json` header at the top for instant editor autocomplete.
- `experience.schema.json` — the `experience.yaml` JSON Schema, so VS Code / any yaml-language-server editor gives you autocomplete, hover docs, and inline validation out of the box.
- the template's tool/agent stubs (e.g. `tools/hello.mjs`) and a `README.md`.

The `tool-only` scaffold passes `oe validate` immediately and can be executed with `oe run <name>` **without any API key**, because it uses only a `tool` node. Templates that include `agent`/`skill` nodes need an LLM key to run.

If the target directory already exists, `init` exits with code `1` and logs an error — it never overwrites an existing directory.

::: tip Editor autocomplete is automatic
Because `oe init` writes both `experience.schema.json` and the `# yaml-language-server: $schema=` header, autocomplete works the moment you open `experience.yaml`. For an **existing** project, run [`oe schema --write`](/reference/cli/schema) and add the header yourself. See [Editor support](/guide/editor-support).
:::

## Arguments

| Argument | Required | Description                                                                         |
| -------- | -------- | ----------------------------------------------------------------------------------- |
| `<name>` | ✓\*      | Name of the directory to create (also used as the experience `name` field in YAML). |

\* Optional only when `--list-templates` is passed (which lists templates and exits).

## Options

| Flag                  | Description                                                                 | Default     |
| --------------------- | --------------------------------------------------------------------------- | ----------- |
| `--template <name>`   | Starter template: `tool-only` \| `agent` \| `cli-agent` \| `full-pipeline`. | `tool-only` |
| `--list-templates`    | List available templates and exit (no `<name>` required).                   | —           |
| `--log-format <fmt>`  | Log format: `json` \| `pretty`                                              | `pretty`    |
| `--log-level <level>` | Log verbosity: `info` \| `debug` \| `warn` \| `error`                       | `info`      |
| `-h, --help`          | Display help and exit                                                       | —           |

## Exit codes

| Code | Meaning                                        |
| ---- | ---------------------------------------------- |
| `0`  | Directory scaffolded successfully              |
| `1`  | Target directory already exists or write error |

## Examples

Scaffold a new experience called `my-workflow` (default `tool-only` template):

```bash
oe init my-workflow
```

```
{"level":"info","dir":"/…/my-workflow","template":"tool-only","files":["experience.yaml","experience.schema.json","tools/hello.mjs","README.md"],"msg":"scaffolded my-workflow/ from the `tool-only` template"}
```

Immediately validate and run:

```bash
oe validate my-workflow
oe run my-workflow
```

List the available templates:

```bash
oe init --list-templates
```

Scaffold from a specific template:

```bash
oe init review-pipeline --template full-pipeline
```

Inspect the generated files (note `experience.schema.json` + the schema header):

```bash
oe init review-pipeline
ls review-pipeline/
# experience.yaml  experience.schema.json  README.md  tools/
head -1 review-pipeline/experience.yaml
# yaml-language-server: $schema=./experience.schema.json
```

## Notes / gotchas

- **Pick a template** with `--template`: `tool-only` (default, no API key), `agent`, `cli-agent`, or `full-pipeline`. Run `oe init --list-templates` to see them. To go further, edit `experience.yaml` directly or use [`oe ultra`](/reference/cli/ultra) to generate an experience from a natural-language description.
- **Editor autocomplete is wired automatically**: `oe init` writes `experience.schema.json` and the `# yaml-language-server: $schema=` header. For existing projects, run [`oe schema --write`](/reference/cli/schema) and add the header yourself.
- The `name` argument becomes the top-level `name:` field in `experience.yaml`. Spaces and special characters in `<name>` may cause YAML or filesystem issues; prefer kebab-case.
- `oe init` does not run `oe validate` internally — call it yourself before the first `oe run`.

## See also

- [`oe validate`](/reference/cli/validate) — check the generated YAML before running
- [`oe run`](/reference/cli/run) — execute the scaffolded experience
- [`oe schema`](/reference/cli/schema) — emit the JSON Schema for existing projects
- [`oe ultra`](/reference/cli/ultra) — LLM-authored scaffold from a natural-language description
- [Editor support](/guide/editor-support) — autocomplete, hover docs, inline validation
- [Hand-writing experience.yaml](/guide/authoring-yaml)
- [The 6 node kinds](/concepts/node-kinds)
