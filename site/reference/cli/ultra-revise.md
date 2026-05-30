# `oe ultra-revise`

Apply natural-language feedback to an **existing** draft, reusing the critique→revise quality loop.

## Synopsis

```
oe ultra-revise [options] <draftPath> <feedback>
```

## Description

`oe ultra-revise` takes a draft you already have — typically one authored by [`oe ultra`](/reference/cli/ultra) — and applies a plain-English revision directive to it. It reuses the same **critic** and **reviser** roles that power the `oe ultra` quality loop: the critic scores the draft, the reviser edits it toward your feedback, and the result is re-validated.

Unlike `oe ultra`, this command does **not** re-decompose the task from scratch. It edits the YAML and tool stubs already on disk in `<draftPath>`, keeping the structure you've built while steering it with your directive (e.g. "split the triage step into two nodes", "switch the notifier from Slack to email").

On success the revised draft overwrites the files in `<draftPath>` and the command prints the next step (`oe run <draftPath>`). If the revised draft fails validation, the files are still written so you can inspect and fix them.

::: warning LLM required
`oe ultra-revise` always calls an LLM. Set `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` before invoking it.
:::

## Arguments

| Argument      | Required | Description                                                          |
| ------------- | -------- | -------------------------------------------------------------------- |
| `<draftPath>` | ✓        | Path to the existing draft directory (containing `experience.yaml`). |
| `<feedback>`  | ✓        | Natural-language directive for the revision. Quote the whole string. |

## Options

| Flag               | Description                                                                         | Default |
| ------------------ | ----------------------------------------------------------------------------------- | ------- |
| `--max-rounds <n>` | Critique→revise rounds. `0` disables the loop (single pass).                        | `1`     |
| `--llm <provider>` | LLM provider: `anthropic` \| `openai`. Auto-detected from environment when omitted. | auto    |
| `-h, --help`       | Display help and exit                                                               | —       |

## Exit codes

| Code | Meaning                                                                              |
| ---- | ------------------------------------------------------------------------------------ |
| `0`  | Draft revised and passes `oe validate`                                               |
| `1`  | LLM provider not configured, or `--max-rounds` is not a non-negative integer         |
| `2`  | Revision failed, or the revised draft fails `oe validate` — inspect and fix manually |

## Examples

Refine a draft authored by `oe ultra`:

```bash
oe ultra-revise .openexpertise/drafts/github-issue-triage \
  "add a node that posts a summary to Slack after triage"
```

Steer the structure of a draft:

```bash
oe ultra-revise .openexpertise/drafts/deep-research \
  "split the synthesis step into a draft node and a fact-check node"
```

Run a deeper loop (two critique→revise rounds):

```bash
oe ultra-revise .openexpertise/drafts/oncall-runbook \
  "make the retry policy more aggressive" --max-rounds 2
```

Disable the loop for a single fast pass:

```bash
oe ultra-revise .openexpertise/drafts/my-draft "tighten the agent prompts" --max-rounds 0
```

Use OpenAI:

```bash
oe ultra-revise .openexpertise/drafts/my-draft "convert the tool node to an agent" --llm openai
```

## Notes / gotchas

- **An LLM API key is always required.** Provider detection follows the same order as `oe ultra`: `--llm` flag first, then `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`.
- This command **edits in place** — it overwrites the files in `<draftPath>`. Commit or copy the draft first if you want to keep the prior version.
- `--max-rounds 0` disables the critique→revise loop and does a single revision pass. The default (`1`) runs one critic-scored round.
- For authoring a brand-new experience from scratch, use [`oe ultra`](/reference/cli/ultra). Use `ultra-revise` only when you already have a draft to iterate on.
- Always validate and smoke-run the revised draft (`oe run <draftPath>`) before promoting it to production.

## See also

- [`oe ultra`](/reference/cli/ultra) — author a new experience (also runs the quality loop)
- [`oe validate`](/reference/cli/validate) — validate the revised YAML
- [`oe run`](/reference/cli/run) — execute the revised draft
- [oe ultra — LLM authors for you](/guide/authoring-ultra)
