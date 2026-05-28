---
title: Cross-vendor CLI agent chain
description: Chain Claude Code, Codex, and Gemini in series so each provider consumes the previous output — for cross-checking, specialization, and false-positive reduction.
---

# Cross-vendor CLI agent chain

## When to use this

- **Cross-checking.** Each provider sees the previous provider's output and can flag errors, omissions, or hallucinations the first agent missed. Serial chaining gives you independent review without requiring a human in the loop.
- **Specialization.** Claude Code excels at tool use and structured output; Codex is optimized for code generation and critique; Gemini can leverage web search and has a large context window. Use each for what it does best in the same pipeline.
- **False-positive reduction in security and compliance use cases.** A finding that survives three independent AI reviewers is substantially more reliable than one that exits a single-model pipeline. See [Use case: Multi-vendor compliance scan](/use-cases/compliance-scan-multi-vendor) for a worked example.

## The shape

```
load_input (tool)
  → claude_summarize (cli-agent, claude-code)
    → codex_critique (cli-agent, codex, reads claude's summary)
      → gemini_verdict (cli-agent, gemini, reads both prior outputs)
        → save_report (tool)
```

Each `cli-agent` node declares exactly which prior state fields it `reads`, so the dependency is explicit in the YAML rather than implicit in the prompt.

## Three-CLI YAML

<div v-pre>

```yaml
name: cross-vendor-chain
version: 0.1.0
state:
  schema:
    input_text: { type: string }
    claude_summary: { type: string }
    codex_critique: { type: string }
    gemini_verdict: { type: object }
graph:
  nodes:
    - id: load_input
      kind: tool
      impl: ./tools/load_input.mjs
      writes: [input_text]
    - id: claude_summarize
      kind: cli-agent
      provider: claude-code
      prompt: |
        Summarize the following input in 3 sentences:
        {{input_text}}
      reads: [input_text]
      output_format: text
      writes: [claude_summary]
      timeout_ms: 120000
    - id: codex_critique
      kind: cli-agent
      provider: codex
      prompt: |
        Here is a summary by another AI:
        {{claude_summary}}

        The original input was:
        {{input_text}}

        What did the summary miss? What got wrong? Output critique in 3 bullet points.
      reads: [input_text, claude_summary]
      output_format: text
      writes: [codex_critique]
      timeout_ms: 120000
    - id: gemini_verdict
      kind: cli-agent
      provider: gemini
      prompt: |
        You are the final judge between two AI takes on the same input.

        Original input: {{input_text}}
        Claude's summary: {{claude_summary}}
        Codex's critique: {{codex_critique}}

        Return JSON: {"verdict": {"final_summary": "...", "claude_score": 0.0-1.0, "codex_score": 0.0-1.0, "notes": "..."}}
      reads: [input_text, claude_summary, codex_critique]
      output_format: json
      schema:
        type: object
        required: [verdict]
        properties:
          verdict:
            type: object
            required: [final_summary, claude_score, codex_score, notes]
            properties:
              final_summary: { type: string }
              claude_score: { type: number }
              codex_score: { type: number }
              notes: { type: string }
      writes: [gemini_verdict]
      timeout_ms: 180000
  edges:
    - { from: load_input, to: claude_summarize }
    - { from: claude_summarize, to: codex_critique }
    - { from: codex_critique, to: gemini_verdict }
```

</div>

## Walkthrough

**State flows between providers via `reads:` declarations.** Each `cli-agent` node declares the state fields it needs. At dispatch time, the runtime interpolates those values into the prompt template. `codex_critique` declares `reads: [input_text, claude_summary]` — it never sees `gemini_verdict` (which doesn't exist yet) and can never accidentally read state that belongs to a later stage.

**Timeouts matter for serial chains.** `cli-agent` nodes spawn a live CLI process; if the process hangs, the whole run stalls. The default timeout is 600 seconds, which is appropriate for long tasks but too long for a sequential chain where the total wall time is the sum of each step. Setting `timeout_ms: 120000` (2 minutes) on the early nodes and `timeout_ms: 180000` (3 minutes) on the final judge keeps the pipeline responsive and produces a clear error if a provider is unresponsive.

**The final agent's structured output makes the chain auditable.** `gemini_verdict` uses `output_format: json` with an explicit `schema:`. The runtime validates the response with AJV before writing it to state. This means `claude_score` and `codex_score` are guaranteed numbers, not free-form text — downstream tools and the event log can query them directly. For compliance use cases, the scores become the audit trail.

## Variations

- **Parallel fan-out instead of serial.** Have all three providers receive the same `input_text` simultaneously, then add a fourth `kind: cli-agent` synthesis node that reads all three outputs. Use `merge: set_once` on each provider's output field so concurrent writes are safe. See [Fan-out with concurrency](/cookbook/fan-out-with-concurrency) for the fan-out pattern.
- **Cost-aware ordering.** Put the cheapest provider first. Add a `when:` edge from its output node to the next provider that only fires if the cheap provider's output is below a confidence threshold. You pay for the expensive provider only when needed.
- **Same vendor, different models.** Use `provider: claude-code` on two nodes with different prompts — one for a "devil's advocate" critique and one for a synthesis. The pattern generalizes to any two roles that benefit from independent reasoning on the same input.

## Common pitfalls

- **JSON-mode CLIs wrapping output in Markdown fences.** When `output_format: json`, the cli-agent dispatcher strips common fence patterns (` ``` `, ` ```json `) before parsing. If a provider still fails to produce valid JSON, add "Output JSON only, no markdown fences" to the end of your prompt. Pinning the instruction at the end of the prompt tends to have higher compliance than putting it at the top.
- **Token limits on latter providers.** Each `cli-agent` receives the full prompt with all interpolated state. For very long `input_text` values, `gemini_verdict` receives the original text _plus_ two full prior outputs. If the total exceeds the provider's context window, the call fails. Mitigate by adding a `kind: tool` node that truncates or compresses `input_text` to a safe length before the chain starts.
- **Provider-specific behavior differences.** Codex does not expose its chain-of-thought — the `codex_critique` output is the final answer only. Gemini may decline requests with ambiguous policy signals; if a prompt references security vulnerabilities or legal text, add a clarifying system-level instruction to avoid refusals. Claude Code tends to add unsolicited explanation; use `output_format: text` and strip it in a downstream tool if you need clean output.
- **Long chain latency.** Three serial CLI sessions add up. Each provider cold-starts a process, authenticates, and runs to completion before the next begins. For latency-sensitive use cases, prefer the parallel fan-out variant above.

## See also

- [Example: tri-cli-orchestration](/examples/tri-cli-orchestration) — the canonical runnable demo this recipe is extracted from
- [Concepts: cli-agent node](/concepts/node-cli-agent)
- [Use case: Multi-vendor compliance scan](/use-cases/compliance-scan-multi-vendor) — a production case study using this pattern
