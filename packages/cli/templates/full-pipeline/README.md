# {{NAME}}

A full-pipeline starter — tool → agent → cli-agent → tool. Shows how the four most common node kinds compose with state passing between every step.

```
load_input (tool)
   → summarize (agent, structured output)
     → expand_with_claude_code (cli-agent)
       → save_output (tool, writes report.md)
```

## Prereqs

- `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` set (for the summarize agent).
- `claude` CLI on PATH (for the expand cli-agent).
- Verify with `oe doctor`.

## Run

```bash
oe validate
oe run .
oe state output_path                       # path of the generated report.md
cat $(oe state output_path)                # see the result
```

## What this demonstrates

- **State passing across kinds.** `load_input` writes `input_text`; `summarize` reads it, writes `summary`; `expand_with_claude_code` reads `summary.tldr` etc., writes `deep_dive`; `save_output` reads both, writes a Markdown file.
- **Structured output mid-pipeline.** `summary` is AJV-validated, so subsequent nodes can rely on its shape.
- **Mixed deterministic + LLM steps.** The first and last nodes are pure JS. The middle two consult LLMs.
- **Phases.** Each step is in its own phase, so `oe inspect` renders them as a clean timeline.

## Next steps

- Edit `fixtures/input.txt` and re-run to see how the output adapts.
- After several runs, try `oe evolve <run-id>` to see what the advisor proposes.
- Add a downstream `agent` node that reviews the generated report and writes a `feedback` field. That's the closed-loop pattern.
- See [`examples/deep-research`](https://github.com/xingchengxu/OpenExpertise/tree/main/examples/deep-research) for a more elaborate research pipeline.
