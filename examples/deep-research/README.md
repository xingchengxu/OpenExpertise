# deep-research

**A real deep-research pipeline. Not a toy.**

```
load_question → clarify → decompose ┬─ search_claude (for_each)
                                    └─ search_gemini (for_each)
                                            │
                                            ▼
                                    extract_citations
                                            │
                                            ▼
                                    cross_reference
```

Multi-vendor: **Claude Code's WebSearch** for academic / general / technical sub-questions, **Gemini's Google Search grounding** for current-events / recent sub-questions. Both feed a synthesis agent that produces a cited cross-referenced summary.

## What you get out

After a run, your blackboard contains:

- `clarified_question` — the narrowed question that drove the search
- `claude_subqs[]`, `gemini_subqs[]` — how the planner split the work
- `raw_findings[]` — every claim + evidence + URL collected
- `citations[]` — deduplicated list of every URL referenced
- `cross_referenced` — executive summary, key findings, open questions

Inspect with `oe state cross_referenced` after the run. Resume later with `oe resume <run-id>` — the search calls are cached, so re-running only re-syntheses.

## Prereqs

- `claude` CLI (Claude Code) on PATH and authenticated. WebSearch tool enabled (it is by default).
- `gemini` CLI on PATH and authenticated. Google Search grounding enabled (it is by default).
- `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` set for the `agent` nodes (clarify/decompose/cross_reference).

If you only have one of the two CLIs, the planner can be steered toward that vendor by setting `claude_subqs: []` or `gemini_subqs: []` — but the demo is most interesting with both.

## Run

```bash
# Edit fixtures/question.json to your question, then:
node packages/cli/dist/bin.js run examples/deep-research --tui --concurrency 4
```

Expect ~3–8 minutes wall time depending on how many sub-questions the planner emits and how rate-limited the CLIs are. With `--concurrency 4`, the `search_claude` and `search_gemini` fan-outs run their iterations in parallel up to 2-wide each (per node-level `for_each.concurrency: 2`), and the two search nodes themselves run as siblings.

## Inspect the result

```bash
# Pretty-print the final synthesis
node packages/cli/dist/bin.js state cross_referenced

# Or replay the full event log (sorted by ts; parallel-safe)
node packages/cli/dist/bin.js inspect <run-id>
```

## Evolve

After a run, `oe evolve <run-id>` will read the events + state diff and propose graph upgrades. Typical proposals:

- Add a third vendor (e.g. `search_codex` for code-heavy questions)
- Add an academic-paper specialist (`cli-agent` with a Semantic Scholar MCP server)
- Add a fact-check verifier between `search_*` and `cross_reference`

Author → run → evolve is the loop.

## Mocked e2e

`e2e/deep-research.e2e.test.ts` exercises the full graph with a scripted LLM + scripted subprocess runner — no real CLI required to verify the structure.

## Customizing the planner

The decomposition heuristics are in `prompts/decompose.md`. Edit the "Two search vendors are available" section to:

- Bias toward one vendor (e.g. always Claude for confidentiality)
- Add a third vendor (mirror the `claude_subqs` / `gemini_subqs` shape with `codex_subqs` etc. and add a third `search_*` node)
- Change the parallelism — `for_each.concurrency: N` controls iterations per node; `runtime.concurrency: N` at the top of `experience.yaml` controls how many sibling nodes (the two search_* nodes) run in parallel.
