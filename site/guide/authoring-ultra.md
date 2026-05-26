# oe ultra — LLM authors for you

Turn a plain-English task description into a validated `experience.yaml`, tool stubs, prompt files, and a README in one command.

## When you need this

- You have a repeatable workflow in mind but don't want to author the YAML by hand.
- You are prototyping quickly: get a runnable skeleton in under 60 seconds, then refine.
- Your task naturally decomposes into collect / analyze / verify / report phases and you want the LLM to figure out the nodes.
- You want a starting point for the [author → run → evolve loop](/guide/closed-loop).

## The minimal example

```bash
export ANTHROPIC_API_KEY=sk-ant-...
oe ultra "Review pull requests against SOC2 controls and produce a risk score"
```

Output:

```
slug:       soc2-pr-review
draft dir:  .openexpertise/drafts/soc2-pr-review/
validation: PASS

phases: collect → analyze → verify → report
nodes:  fetch_pr (tool)  review_control (agent ×N)  verify (agent)  score (tool)

open questions:
  1. Which SOC2 controls are in scope?
  2. What is the GitHub token env var name?

next steps:
  oe run .openexpertise/drafts/soc2-pr-review
  mv .openexpertise/drafts/soc2-pr-review examples/soc2-pr-review
```

## How it works

`oe ultra` is a two-phase pipeline implemented in `packages/authoring/src/ultra.ts`.

**Phase 1 — Analysis.** The LLM reads your task description against the `analyzer.md` system prompt and returns a structured plan: a `name` slug, an ordered list of `phases`, a `state_fields` array (the SQLite blackboard schema), `node_sketches` (one per step, each tagged with a `kind`), and up to 5 `open_questions`. The LLM is instructed to keep LLM-kind nodes to steps that genuinely need judgment, and to use `tool` for everything deterministic.

**Phase 2 — Synthesis.** A second LLM call receives the analysis and the `synthesizer.md` system prompt. It materializes the full `experience_yaml` string, a `files[]` array (every supporting file with its path and content), and `next_steps[]`. Generated tool stubs include a `// TODO:` comment marking the real integration point — they are runnable as fixture data before you wire them up.

**Phase 3 — Materialization.** The writer creates the draft directory, checks all paths for traversal attacks, and writes every file. Then `oe validate` runs against the result. If validation fails, the CLI prints which schema constraints were violated.

The draft is never auto-promoted. `mv <draft> examples/<slug>` is a deliberate user decision.

## Variations

**Custom draft root:**

```bash
oe ultra "Triage GitHub issues by severity" --draft-root ./my-experiences
```

**Force a specific LLM provider:**

```bash
oe ultra "Analyze logs for anomalies" --llm openai
```

**Use the MCP tool** from inside any MCP-aware CLI:

```
oe_ultra({ "task": "Summarize weekly team Slack threads" })
```

Returns `{ slug, draft_dir, analysis, synthesis: { file_paths, next_steps }, validation, files_written }`. File contents are on disk at `draft_dir`.

**Customize the analyzer / synthesizer prompts** by forking the package and editing `packages/authoring/src/prompts/analyzer.md` and `synthesizer.md`. The system prompts ship with the package; there is no flag to override them at runtime.

## Gotchas

- **Tool stubs need real wiring.** Every generated `tools/*.mjs` has a `// TODO:` comment. The stub returns fixture data so `oe run` doesn't crash, but it won't do anything useful until you fill in the real API call or file path.
- **No `--refine` flag.** `oe ultra` is a one-shot pipeline. Iterative improvement happens via `oe evolve` after running the generated experience — not via re-running `oe ultra`.
- **cli-agent prompts are inline only.** The synthesizer emits inline `prompt:` strings for `cli-agent` nodes; file-path loading for `cli-agent` is a V2 feature. For `agent` nodes, prompt files are generated under `prompts/`.
- **ANTHROPIC_API_KEY or OPENAI_API_KEY must be set.** `oe ultra` auto-detects the provider from env. If neither key is present the command exits immediately with an explanation.

## See also

- [From inside Claude Code](/guide/authoring-slash-command) — the `/ultraexpertise` slash command
- [Hand-writing experience.yaml](/guide/authoring-yaml) — understand every field
- [Author → run → evolve loop](/guide/closed-loop)
- [`oe ultra` CLI reference](/reference/cli/ultra)
- [UltraExpertise API](/reference/api/ultra-expertise)
