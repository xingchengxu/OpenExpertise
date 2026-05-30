# `oe ultra`

LLM-author a new experience from a natural-language task description.

## Synopsis

```
oe ultra [options] <task>
```

## Description

`oe ultra` passes your plain-English task description to `UltraExpertise`, a two-phase LLM pipeline that:

1. **Analyse phase** — decomposes the task into phases, selects appropriate node kinds (`tool`, `agent`, `skill`, etc.), and surfaces open questions.
2. **Synthesis phase** — generates a complete `experience.yaml` plus any required tool stubs, then runs `oe validate` on the draft internally.

### Quality loop (on by default)

After synthesis, `oe ultra` runs an internal **critique→revise quality loop** (default: 1 round). A **critic** scores the draft on decomposition and prompt quality, deterministic validation/preflight errors feed an incremental **reviser**, and the command keeps the best-scoring round. The loop is **keep-best with a monotonicity gate**: the final draft is never worse than the one-shot synthesis. The final score and the bar are printed in the summary (e.g. `Quality loop: 1 round, final score 86/100 (bar 80)`).

Set `--max-rounds 0` to disable the loop entirely (one-shot synthesis). Tune the pass bar with `OE_ULTRA_SCORE_BAR` (default `80`) and override the critic model with `OE_ULTRA_CRITIC_MODEL`.

The draft is written to `<draft-root>/<slug>/` (default: `.openexpertise/drafts/<slug>/`). The `<slug>` is derived from the task description.

If the generated YAML passes validation, `oe ultra` exits `0` and logs the next steps (`oe run <draftDir>` or `mv <draftDir> examples/<slug>`). If the draft fails validation, it exits `2` with a warning listing the schema errors — the files are still written so you can inspect and fix them.

::: warning LLM required
`oe ultra` always calls an LLM. Set `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` before invoking it. If neither is set, the command exits `1` immediately.
:::

## Arguments

| Argument | Required | Description                                                                              |
| -------- | -------- | ---------------------------------------------------------------------------------------- |
| `<task>` | ✓        | Natural-language description of the workflow you want to create. Quote the whole string. |

## Options

| Flag                  | Description                                                                         | Default                 |
| --------------------- | ----------------------------------------------------------------------------------- | ----------------------- |
| `--dry-run`           | Run Phase 1 (analyse) only and print the detected shape; **no files written**.      | `false`                 |
| `--max-rounds <n>`    | Critique→revise quality-loop rounds. `0` disables the loop (one-shot synthesis).    | `1`                     |
| `--run`               | After writing the draft, smoke-run it once. Never changes the exit code.            | `false`                 |
| `--draft-root <dir>`  | Directory under which the draft experience folder is created.                       | `.openexpertise/drafts` |
| `--llm <provider>`    | LLM provider: `anthropic` \| `openai`. Auto-detected from environment when omitted. | auto                    |
| `--log-format <fmt>`  | Log format: `json` \| `pretty`                                                      | `pretty`                |
| `--log-level <level>` | Log verbosity: `info` \| `debug` \| `warn` \| `error`                               | `info`                  |
| `-h, --help`          | Display help and exit                                                               | —                       |

## Environment variables

| Variable                | Purpose                                                                           | Default      |
| ----------------------- | --------------------------------------------------------------------------------- | ------------ |
| `OE_ULTRA_SCORE_BAR`    | Quality-loop pass bar (0–100). The loop reports the final score against this bar. | `80`         |
| `OE_ULTRA_CRITIC_MODEL` | Override the critic model (same provider as the author) used by the quality loop. | author model |

## Exit codes

| Code | Meaning                                                                                       |
| ---- | --------------------------------------------------------------------------------------------- |
| `0`  | Draft written and passes `oe validate` (or `--dry-run` analysis printed)                      |
| `1`  | LLM provider not configured, LLM call failed, or `--max-rounds` is not a non-negative integer |
| `2`  | Draft written but fails `oe validate` — inspect and fix before running                        |

## Examples

Author a new experience from a description:

```bash
oe ultra "fetch open GitHub issues, triage by severity, post a Slack digest"
```

```
{"level":"info","task":"fetch open GitHub issues…","msg":"ultraexpertise: starting analyze phase"}
{"level":"info","slug":"github-issue-triage","draftDir":"/…/.openexpertise/drafts/github-issue-triage","phases":["fetch","triage","notify"],"nodes":["fetch-issues(tool)","triage(agent)","post-slack(tool)"],"open_questions":[],"files_written":["experience.yaml","tools/fetch-issues.mjs","tools/post-slack.mjs"],"valid":true,"validation_errors":[],"next_steps":["review open questions","run `oe run`"],"msg":"ultraexpertise: draft created"}
{"level":"info","run":"oe run /…/.openexpertise/drafts/github-issue-triage","promote":"mv /…/.openexpertise/drafts/github-issue-triage examples/github-issue-triage","msg":"next: run or promote"}
```

Preview the detected shape without writing any files (`--dry-run`):

```bash
oe ultra "fetch open GitHub issues, triage by severity, post a Slack digest" --dry-run
```

```
Detected shape:
  Name: github-issue-triage
  Phases: fetch → triage → notify
  Nodes:
    - fetch-issues (tool)
    - triage (agent)
    - post-slack (tool)

(dry-run: stopped after analyze; no files written)
```

Author and smoke-run the draft once (`--run`):

```bash
oe ultra "write a greeting to state" --run
```

Run a deeper quality loop, or disable it entirely:

```bash
oe ultra "deep web research pipeline" --max-rounds 2   # two critique→revise rounds
oe ultra "deep web research pipeline" --max-rounds 0   # one-shot, no loop
```

Raise the quality bar via the environment:

```bash
OE_ULTRA_SCORE_BAR=90 oe ultra "summarise a PDF into a structured JSON report"
```

Use OpenAI instead of Anthropic:

```bash
oe ultra "summarise a PDF and output a structured JSON report" --llm openai
```

Write the draft to a custom directory:

```bash
oe ultra "run a nightly oncall runbook" --draft-root /tmp/oe-drafts
```

Validate-only failure (exit 2) — draft still written for manual correction:

```bash
oe ultra "an intentionally ambiguous task"
# exit: 2 if the LLM produced invalid YAML
oe validate .openexpertise/drafts/<slug>
```

Promote a working draft to the examples directory:

```bash
oe ultra "deep web research pipeline"
oe run .openexpertise/drafts/deep-web-research-pipeline   # smoke-test
mv .openexpertise/drafts/deep-web-research-pipeline examples/deep-web-research-pipeline
```

## Notes / gotchas

- **An LLM API key is always required.** Provider detection follows the same order as `oe run` and `oe evolve`: `--llm` flag first, then `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`.
- **Default models**: `claude-sonnet-4-6` for Anthropic, `gpt-4o-2024-11-20` for OpenAI.
- **Exit code 2** means the YAML was generated but is invalid — the files are on disk for you to inspect. Run `oe validate <draftDir>` to see the specific errors, then edit `experience.yaml` and re-validate.
- The `<task>` argument is a single string. On most shells, wrap it in double quotes. Long descriptions (several sentences) produce better results than single-word prompts.
- **The quality loop is on by default** (`--max-rounds 1`) and is keep-best with a monotonicity gate — the final draft is never worse than the one-shot synthesis. Set `--max-rounds 0` to skip it.
- `--dry-run` stops after the analyse phase and writes nothing — use it to sanity-check the decomposition before spending the heavy synthesis LLM call.
- `--run` smoke-runs the authored draft once. Tool-only drafts run with no wiring; agent/skill nodes need an LLM key and fail gracefully without one. The smoke outcome is informational and **never** changes the exit code.
- To iterate on an existing draft with natural-language feedback, use [`oe ultra-revise`](/reference/cli/ultra-revise) — it reuses the same critique→revise roles without re-decomposing the task.
- Open questions surfaced by the advisor (logged as `open_questions`) are hints about ambiguities in your task description. Address them by editing the draft or re-running with a more detailed task.

## See also

- [`oe ultra-revise`](/reference/cli/ultra-revise) — apply NL feedback to an existing draft
- [`oe validate`](/reference/cli/validate) — validate the generated YAML
- [`oe run`](/reference/cli/run) — execute the drafted experience
- [`oe init`](/reference/cli/init) — minimal hand-written scaffold alternative
- [oe ultra — LLM authors for you](/guide/authoring-ultra)
- [What is an experience?](/concepts/experiences)
- [The 6 node kinds](/concepts/node-kinds)
