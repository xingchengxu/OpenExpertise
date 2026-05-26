---
title: CLI reference
description: Complete reference for the oe binary — every command, every flag.
---

# CLI reference

The `oe` binary is the primary interface to OpenExpertise. Until the package is published to npm, invoke it directly:

```bash
node packages/cli/dist/bin.js <command> [options]
```

After `npm install -g @openexpertise/cli` (post-publish):

```bash
oe <command> [options]
```

All examples on this page use the short `oe` form for brevity.

## Verbs at a glance

| Command | Purpose |
|---|---|
| [`oe diff`](/reference/cli/diff) | List pending evolution proposals |
| [`oe evolve`](/reference/cli/evolve) | Generate evolution proposals for a prior run |
| [`oe init`](/reference/cli/init) | Scaffold a new experience directory |
| [`oe inspect`](/reference/cli/inspect) | Render a run trace from the event log |
| [`oe reset-state`](/reference/cli/reset-state) | Delete the persistent state blackboard (destructive) |
| [`oe resume`](/reference/cli/resume) | Re-run an experience with cached results from a prior run |
| [`oe run`](/reference/cli/run) | Execute an experience |
| [`oe state`](/reference/cli/state) | Inspect the persistent state blackboard |
| [`oe ultra`](/reference/cli/ultra) | LLM-author a new experience from a natural-language description |
| [`oe validate`](/reference/cli/validate) | Validate an `experience.yaml` file or directory |

## Global flags

These flags are accepted by every command and must be placed **before** the subcommand name.

| Flag | Description | Default |
|---|---|---|
| `--log-format <fmt>` | Log format: `json` or `pretty` | `pretty` |
| `--log-level <level>` | Log verbosity: `info`, `debug`, `warn`, or `error` | `info` |
| `-V, --version` | Print the `oe` version and exit | — |
| `-h, --help` | Display help and exit | — |

Example — machine-readable JSON logs:

```bash
oe --log-format json --log-level debug run examples/hello-tool
```

## Standard exit codes

| Code | Meaning |
|---|---|
| `0` | Success |
| `1` | Runtime failure (experience error, file not found, LLM error, etc.) |
| `2` | Invalid invocation (bad flag value, missing required argument) |

## Environment variables

| Variable | Used by | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | `run`, `resume`, `evolve`, `ultra` | Authenticates against the Anthropic API; selects Anthropic as the default LLM provider |
| `OPENAI_API_KEY` | `run`, `resume`, `evolve`, `ultra` | Authenticates against the OpenAI API; selects OpenAI as the default LLM provider when `ANTHROPIC_API_KEY` is absent |
| `OPENAI_BASE_URL` | `run`, `resume`, `evolve`, `ultra` | Override the OpenAI-compatible endpoint (e.g. for vLLM or Ollama) |

When both `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` are set, Anthropic takes precedence unless `--llm openai` is passed.

## Commands by use case

### Author

| Command | When to use |
|---|---|
| [`oe init`](/reference/cli/init) | Bootstrap a new experience directory with a minimal scaffold |
| [`oe ultra`](/reference/cli/ultra) | Describe a task in plain English; let the LLM write the YAML for you |

### Validate

| Command | When to use |
|---|---|
| [`oe validate`](/reference/cli/validate) | Check YAML syntax and schema correctness before running |

### Run

| Command | When to use |
|---|---|
| [`oe run`](/reference/cli/run) | Execute an experience from scratch |
| [`oe resume`](/reference/cli/resume) | Re-run, reusing cached node results from a prior run |

### Inspect

| Command | When to use |
|---|---|
| [`oe inspect`](/reference/cli/inspect) | Replay the event log for a completed run |
| [`oe state`](/reference/cli/state) | Read current values from the SQLite blackboard |
| [`oe diff`](/reference/cli/diff) | Preview pending evolution proposals |

### Evolve

| Command | When to use |
|---|---|
| [`oe evolve`](/reference/cli/evolve) | Ask the LLM advisor to analyse a run and propose YAML improvements |
| [`oe diff`](/reference/cli/diff) | See what proposals are waiting to be reviewed |

### Reset

| Command | When to use |
|---|---|
| [`oe reset-state`](/reference/cli/reset-state) | Wipe the SQLite blackboard to start with a clean slate |

## See also

- [Install & first run](/guide/getting-started)
- [What is an experience?](/concepts/experiences)
- [State (SQLite blackboard)](/concepts/state)
- [Evolution loop](/concepts/evolution-loop)
