---
title: CLI reference
description: Complete reference for the oe binary — every command, every flag.
---

# CLI reference

The `oe` binary is the primary interface to OpenExpertise. Install once:

```bash
npm install -g @openexpertise/cli
```

Then use:

```bash
oe <command> [options]
```

When developing from source (after `pnpm -r build`), you can also invoke via:

```bash
node packages/cli/dist/bin.js <command> [options]
```

All examples on this page use the short `oe` form.

## Verbs at a glance

| Command                                          | Purpose                                                         |
| ------------------------------------------------ | --------------------------------------------------------------- |
| [`oe diff`](/reference/cli/diff)                 | List pending evolution proposals                                |
| [`oe evolve`](/reference/cli/evolve)             | Generate evolution proposals for one run or across several runs |
| [`oe graph`](/reference/cli/graph)               | Render an experience's DAG as a Mermaid diagram                 |
| [`oe init`](/reference/cli/init)                 | Scaffold a new experience directory from a template             |
| [`oe inspect`](/reference/cli/inspect)           | Render a run trace, or an HTML run report (`--html`)            |
| [`oe reset-state`](/reference/cli/reset-state)   | Delete the persistent state blackboard (destructive)            |
| [`oe resume`](/reference/cli/resume)             | Re-run an experience with cached results from a prior run       |
| [`oe run`](/reference/cli/run)                   | Execute an experience                                           |
| [`oe schema`](/reference/cli/schema)             | Print the `experience.yaml` JSON Schema (editor autocomplete)   |
| [`oe state`](/reference/cli/state)               | Inspect the persistent state blackboard                         |
| [`oe ultra`](/reference/cli/ultra)               | LLM-author a new experience from a natural-language description |
| [`oe ultra-revise`](/reference/cli/ultra-revise) | Apply natural-language feedback to an existing draft            |
| [`oe validate`](/reference/cli/validate)         | Validate an `experience.yaml` file or directory                 |

## Global flags

These flags are accepted by every command and must be placed **before** the subcommand name.

| Flag                  | Description                                        | Default  |
| --------------------- | -------------------------------------------------- | -------- |
| `--log-format <fmt>`  | Log format: `json` or `pretty`                     | `pretty` |
| `--log-level <level>` | Log verbosity: `info`, `debug`, `warn`, or `error` | `info`   |
| `-V, --version`       | Print the `oe` version and exit                    | —        |
| `-h, --help`          | Display help and exit                              | —        |

Example — machine-readable JSON logs:

```bash
oe --log-format json --log-level debug run examples/hello-tool
```

## Standard exit codes

| Code | Meaning                                                             |
| ---- | ------------------------------------------------------------------- |
| `0`  | Success                                                             |
| `1`  | Runtime failure (experience error, file not found, LLM error, etc.) |
| `2`  | Invalid invocation (bad flag value, missing required argument)      |

## Environment variables

| Variable                | Used by                                            | Purpose                                                                                                             |
| ----------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`     | `run`, `resume`, `evolve`, `ultra`, `ultra-revise` | Authenticates against the Anthropic API; selects Anthropic as the default LLM provider                              |
| `OPENAI_API_KEY`        | `run`, `resume`, `evolve`, `ultra`, `ultra-revise` | Authenticates against the OpenAI API; selects OpenAI as the default LLM provider when `ANTHROPIC_API_KEY` is absent |
| `OPENAI_BASE_URL`       | `run`, `resume`, `evolve`, `ultra`, `ultra-revise` | Override the OpenAI-compatible endpoint (e.g. for vLLM or Ollama)                                                   |
| `OE_ULTRA_SCORE_BAR`    | `ultra`, `ultra-revise`                            | Quality-loop pass bar (0–100, default `80`)                                                                         |
| `OE_ULTRA_CRITIC_MODEL` | `ultra`, `ultra-revise`                            | Override the critic model used by the quality loop (same provider as the author)                                    |

When both `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` are set, Anthropic takes precedence unless `--llm openai` is passed. `oe graph` and `oe schema` are pure transforms and require no API key.

## Commands by use case

### Author

| Command                                          | When to use                                                          |
| ------------------------------------------------ | -------------------------------------------------------------------- |
| [`oe init`](/reference/cli/init)                 | Bootstrap a new experience directory from a starter template         |
| [`oe ultra`](/reference/cli/ultra)               | Describe a task in plain English; let the LLM write the YAML for you |
| [`oe ultra-revise`](/reference/cli/ultra-revise) | Steer an existing draft with natural-language feedback               |
| [`oe schema`](/reference/cli/schema)             | Emit the JSON Schema to wire editor autocomplete into a project      |

### Validate

| Command                                  | When to use                                                                                                                                                                                             |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`oe validate`](/reference/cli/validate) | Check YAML syntax and schema correctness before running                                                                                                                                                 |
| [`oe graph`](/reference/cli/graph)       | Render the experience's DAG as a Mermaid `flowchart` — stdout (paste into a README), `--html` for a standalone page, `-o <file>` to write, `--lr` for left-to-right layout. Pure transform; no API key. |
| [`oe schema`](/reference/cli/schema)     | Emit the `experience.yaml` JSON Schema for editor autocomplete — stdout, or `--write` to save `experience.schema.json`. Pure transform; no API key.                                                     |

### Run

| Command                              | When to use                                          |
| ------------------------------------ | ---------------------------------------------------- |
| [`oe run`](/reference/cli/run)       | Execute an experience from scratch                   |
| [`oe resume`](/reference/cli/resume) | Re-run, reusing cached node results from a prior run |

### Inspect

| Command                                | When to use                                                      |
| -------------------------------------- | ---------------------------------------------------------------- |
| [`oe inspect`](/reference/cli/inspect) | Replay the event log, or render an HTML run report with `--html` |
| [`oe state`](/reference/cli/state)     | Read current values from the SQLite blackboard                   |
| [`oe diff`](/reference/cli/diff)       | Preview pending evolution proposals                              |

### Evolve

| Command                              | When to use                                                                                      |
| ------------------------------------ | ------------------------------------------------------------------------------------------------ |
| [`oe evolve`](/reference/cli/evolve) | Ask the LLM advisor to analyse a run (or `--runs a,b,c` across several) and propose improvements |
| [`oe diff`](/reference/cli/diff)     | See what proposals are waiting to be reviewed                                                    |

### Reset

| Command                                        | When to use                                            |
| ---------------------------------------------- | ------------------------------------------------------ |
| [`oe reset-state`](/reference/cli/reset-state) | Wipe the SQLite blackboard to start with a clean slate |

## See also

- [Install & first run](/guide/getting-started)
- [What is an experience?](/concepts/experiences)
- [State (SQLite blackboard)](/concepts/state)
- [Evolution loop](/concepts/evolution-loop)
