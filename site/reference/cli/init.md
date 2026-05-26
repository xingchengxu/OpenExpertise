# `oe init`

Scaffold a new experience directory with a minimal `experience.yaml`, a stub tool, and a `README.md`.

## Synopsis

```
oe init <name>
```

## Description

`oe init` creates a new directory named `<name>` in the current working directory. Inside it writes three files:

- `experience.yaml` — a minimal valid experience with one `tool` node that writes a `greeting` field to state.
- `tools/hello.mjs` — the ESM tool stub that returns `{ state_delta: { greeting: 'Hello, OpenExpertise!' } }`.
- `README.md` — a one-line placeholder.

The generated experience passes `oe validate` immediately and can be executed with `oe run <name>` without any API key, because the scaffold uses only a `tool` node (no agent or LLM calls).

If the target directory already exists, `init` exits with code `1` and logs an error — it never overwrites an existing directory.

## Arguments

| Argument | Required | Description |
|---|---|---|
| `<name>` | ✓ | Name of the directory to create (also used as the experience `name` field in YAML) |

## Options

| Flag | Description | Default |
|---|---|---|
| `--log-format <fmt>` | Log format: `json` \| `pretty` | `pretty` |
| `--log-level <level>` | Log verbosity: `info` \| `debug` \| `warn` \| `error` | `info` |
| `-h, --help` | Display help and exit | — |

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Directory scaffolded successfully |
| `1` | Target directory already exists or write error |

## Examples

Scaffold a new experience called `my-workflow`:

```bash
oe init my-workflow
```

```
{"level":"info","dir":"/…/my-workflow","msg":"experience scaffolded"}
```

Immediately validate and run:

```bash
oe validate my-workflow
oe run my-workflow
```

Scaffold and inspect generated files:

```bash
oe init review-pipeline
ls review-pipeline/
# experience.yaml  README.md  tools/
cat review-pipeline/experience.yaml
```

## Notes / gotchas

- The scaffold uses `kind: tool` with a single `.mjs` file. To add LLM-powered nodes, edit `experience.yaml` and add `agent` or `skill` nodes manually, or use [`oe ultra`](/reference/cli/ultra) to generate a more complex experience from a description.
- The `name` argument becomes the top-level `name:` field in `experience.yaml`. Spaces and special characters in `<name>` may cause YAML or filesystem issues; prefer kebab-case.
- `oe init` does not run `oe validate` internally — call it yourself before the first `oe run`.

## See also

- [`oe validate`](/reference/cli/validate) — check the generated YAML before running
- [`oe run`](/reference/cli/run) — execute the scaffolded experience
- [`oe ultra`](/reference/cli/ultra) — LLM-authored scaffold from a natural-language description
- [Hand-writing experience.yaml](/guide/authoring-yaml)
- [The 6 node kinds](/concepts/node-kinds)
