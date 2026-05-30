# `oe evolve`

Generate evolution proposals for a prior run.

## Synopsis

```
oe evolve [options] [run-id]
```

## Description

`oe evolve` feeds a completed run's event log and state diff to the `EvolutionAdvisor`, which calls an LLM to analyse what happened and propose concrete improvements to the experience YAML.

The advisor receives:

- The full `experience.yaml` source.
- All events from `.openexpertise/runs/<run-id>.jsonl`.
- A per-field diff of state values changed during the run (computed from the SQLite history).

The resulting Markdown document is written to `.openexpertise/evolution/<run-id>.md`. Use [`oe diff`](/reference/cli/diff) to list all pending proposals, or open the file directly.

### Cross-run analysis (`--runs`)

Pass `--runs a,b,c` (a comma-separated list of run-ids) to analyse **several runs at once**. Cross-run mode surfaces **stable patterns** that recur across ≥2 runs versus one-off blips — so you can act on systemic issues rather than chasing a single flaky run. The result is written to `.openexpertise/evolution/cross-run-*.md`. Provide either a single `[run-id]` **or** `--runs` (one is required).

::: tip Automated via `oe run --evolve`
Passing `--evolve` to `oe run` calls `oe evolve` automatically after a successful run. Use `oe evolve` directly when you want to generate proposals for an older run-id or when you skipped `--evolve` originally.
:::

## Arguments

| Argument   | Required | Description                                                                                                                   |
| ---------- | -------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `[run-id]` | —\*      | Run-id of the completed run to analyse (single-run mode). Must match a `.jsonl` file at `.openexpertise/runs/<run-id>.jsonl`. |

\* Provide either `[run-id]` **or** `--runs` — one is required.

## Options

| Flag                  | Description                                                                            | Default  |
| --------------------- | -------------------------------------------------------------------------------------- | -------- |
| `--experience <path>` | Path to the experience directory (or `experience.yaml`).                               | `.`      |
| `--runs <ids>`        | Comma-separated run-ids for **cross-run analysis** (stable patterns vs one-off blips). | —        |
| `--llm <provider>`    | LLM provider: `anthropic` \| `openai`. Auto-detected from environment when omitted.    | auto     |
| `--log-format <fmt>`  | Log format: `json` \| `pretty`                                                         | `pretty` |
| `--log-level <level>` | Log verbosity: `info` \| `debug` \| `warn` \| `error`                                  | `info`   |
| `-h, --help`          | Display help and exit                                                                  | —        |

## Exit codes

| Code | Meaning                                                                                                   |
| ---- | --------------------------------------------------------------------------------------------------------- |
| `0`  | Proposals written successfully                                                                            |
| `1`  | Neither `[run-id]` nor `--runs` given, `experience.yaml` not found, run log not found, or LLM call failed |

## Examples

Generate proposals for a specific run:

```bash
oe evolve 4f3a1b2c-0d9e-4f7a-8b6c-1e2d3f4a5b6c
```

```
{"level":"info","outPath":"/…/.openexpertise/evolution/4f3a1b2c-….md","proposalCount":3,"msg":"evolution proposal written"}
```

Cross-run analysis across several runs (stable patterns vs one-off blips):

```bash
oe evolve --runs 4f3a1b2c-…,7a2c9d1e-…,b3e5f8a0-…
```

```
{"level":"info","outPath":"/…/.openexpertise/evolution/cross-run-….md","runCount":3,"stablePatterns":2,"msg":"cross-run evolution proposal written"}
```

Generate proposals using OpenAI:

```bash
oe evolve 4f3a1b2c-0d9e-4f7a-8b6c-1e2d3f4a5b6c --llm openai
```

Generate proposals for a run in a non-current experience directory:

```bash
oe evolve 4f3a1b2c-0d9e-4f7a-8b6c-1e2d3f4a5b6c --experience examples/review-branch
```

Then review proposals:

```bash
oe diff --experience examples/review-branch
```

## Notes / gotchas

- **An LLM API key is always required.** Unlike `oe run`, there is no scenario where `oe evolve` operates without an LLM call.
- **Provider detection order**: if `--llm` is not passed, `ANTHROPIC_API_KEY` is checked first, then `OPENAI_API_KEY`. If neither is set, the command exits `1`.
- `oe evolve` analyses a **specific run-id**, not the latest run. If you want proposals for the most recent run, copy the run-id from the `oe run` log.
- **Single-run vs cross-run**: pass a single `[run-id]` for one run, or `--runs a,b,c` to analyse several at once. Cross-run output lands in `.openexpertise/evolution/cross-run-*.md` and highlights patterns recurring across ≥2 runs — use it to separate systemic issues from one-off blips. One of the two is required.
- Proposals are stored as Markdown files and are never applied automatically. Review them with `oe diff`, then edit `experience.yaml` manually.
- Running `oe evolve` multiple times for the same run-id overwrites `.openexpertise/evolution/<run-id>.md`.

## See also

- [`oe run`](/reference/cli/run) — run with `--evolve` to trigger automatically
- [`oe diff`](/reference/cli/diff) — list pending evolution proposals
- [`oe inspect`](/reference/cli/inspect) — review the run events before evolving
- [The advisor](/guide/evolution-advisor)
- [Applying proposals](/guide/applying-proposals)
- [Evolution loop](/concepts/evolution-loop)
