# {{NAME}}

A starter agent flow — one LLM call with AJV-validated structured output. The agent classifies a topic into a category with confidence and reasoning.

## Prereqs

- `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` set.

## Run

```bash
oe validate
oe run .
oe state classification
```

## What this demonstrates

- The `agent` node kind — calls an LLM with a system prompt, a structured-output schema, and the declared `reads:` as the user message.
- AJV schema validation on the response — invalid LLM outputs fail loudly with a helpful error.
- Inline `args:` for static parameters (the topic) plus state-backed `reads:` for dynamic data.

## Next steps

- Swap the `agent` for a `cli-agent` to delegate to Claude Code / Codex / Gemini — see [`oe init another-flow --template cli-agent`](https://xingchengxu.github.io/OpenExpertise/concepts/node-cli-agent).
- Add a downstream `tool` node that consumes `classification` and writes to a file.
- After a few runs, try `oe evolve <run-id>` to see what the advisor proposes.
- Visualize it: `oe graph .` (paste the Mermaid into your README).
- Turn a run into a shareable report: `oe inspect <run-id> --html -o report.html`.
- Let the LLM iterate the YAML for you: `oe ultra-revise <run-id>`.
