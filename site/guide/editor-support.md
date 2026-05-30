---
title: Editor support (autocomplete + validation)
---

# Editor support (autocomplete + validation)

OpenExpertise ships a full JSON Schema for `experience.yaml`. Wire it to your editor once and you get:

- **Autocomplete** for every key (`kind`, `reads`, `writes`, `on_error`, …)
- **Hover docs** — descriptions inline while you type
- **Inline validation** — red squiggles on unknown fields or wrong types, before you run a single command

The schema is served at:

```
https://xingchengxu.github.io/OpenExpertise/schemas/experience.schema.json
```

---

## VS Code (recommended)

### Install the Red Hat YAML extension

```bash
code --install-extension redhat.vscode-yaml
```

Or search **"YAML"** in the Extensions panel (publisher: Red Hat).

### How `oe init` wires it for you

When you scaffold a new experience, `oe init` does two things automatically:

1. **Writes `experience.schema.json`** into the project root (a local copy of the schema).
2. **Prepends a `# yaml-language-server:` comment** to `experience.yaml`:

```yaml
# yaml-language-server: $schema=./experience.schema.json
name: my-flow
version: 0.1.0
...
```

The Red Hat YAML extension reads that comment and activates the schema **immediately** — no workspace settings needed, works offline.

---

## Existing projects

For projects you created before `oe init` started injecting the header, you have two options:

### Option A — local schema file (works offline)

```bash
# In your experience directory:
oe schema --write          # writes experience.schema.json
```

Then add the header as the first line of `experience.yaml`:

```yaml
# yaml-language-server: $schema=./experience.schema.json
name: my-flow
```

### Option B — public URL (no local file needed)

Add the header pointing at the hosted schema (requires internet access; works once the docs site is deployed):

```yaml
# yaml-language-server: $schema=https://xingchengxu.github.io/OpenExpertise/schemas/experience.schema.json
name: my-flow
```

---

## Neovim / any yaml-language-server editor

Any editor that embeds or wraps `yaml-language-server` respects the `# yaml-language-server: $schema=` comment — the same header works without additional configuration.

For Neovim with `nvim-lspconfig`, ensure `yamlls` is configured with `yaml.schemas` if you want workspace-wide coverage:

```lua
require('lspconfig').yamlls.setup {
  settings = {
    yaml = {
      schemas = {
        ['https://xingchengxu.github.io/OpenExpertise/schemas/experience.schema.json'] =
          '*/experience.yaml',
      },
    },
  },
}
```

This applies the schema to every `experience.yaml` in your workspace without the per-file comment.

---

## `oe schema` reference

| Flag                  | Effect                                                  |
| --------------------- | ------------------------------------------------------- |
| `oe schema`           | Print the JSON Schema to stdout                         |
| `oe schema --write`   | Write `experience.schema.json` in the current directory |
| `oe schema -o <file>` | Write to a specific path                                |

---

## Summary

| Scenario         | What to do                                                                               |
| ---------------- | ---------------------------------------------------------------------------------------- |
| New project      | `oe init` — schema header + local file scaffolded automatically                          |
| Existing project | `oe schema --write`, then add `# yaml-language-server: $schema=./experience.schema.json` |
| No local file    | Use the public URL in the comment                                                        |
| VS Code          | Install the Red Hat **YAML** extension                                                   |
| Neovim           | Configure `yamlls` with `yaml.schemas` (or use the per-file comment)                     |
