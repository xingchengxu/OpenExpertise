---
title: Guide
description: Hands-on path from install through authoring, running, evolving, and integrating OpenExpertise.
---

# Guide

The hands-on path. Concepts page is the *what*; this is the *how*.

## Getting started

[1. Install & first run](/guide/getting-started)
: Clone, install, run the canary `hello-tool` example, verify your environment.

[2. Your first experience](/guide/first-experience)
: Build a 2-tool flow from scratch with `state.schema` declaration. No LLM yet.

[3. Run with an LLM](/guide/run-with-llm)
: Add an `agent` node with structured output. AJV schemas. Env-var setup. Default models per provider.

[4. The TUI dashboard](/guide/tui)
: Anatomy, status glyphs, activity strings per dispatcher.

## Authoring

[Hand-writing `experience.yaml`](/guide/authoring-yaml)
: The full YAML shape, from `state.schema` through `graph.nodes` to `edges`.

[`oe ultra` — LLM authors for you](/guide/authoring-ultra)
: One keyword, full experience synthesized into a validated draft directory.

[From inside Claude Code](/guide/authoring-slash-command)
: Run `/oe-authoring` (or invoke the `oe-mcp` server) without leaving your editor.

[Tool stubs in `.mjs`](/guide/tool-stubs)
: The default-export signature, `state_delta` vs `edge_output`, error handling.

[Prompt files](/guide/prompt-files)
: Markdown prompts with `{{var}}` interpolation. `v-pre` gotchas. System vs user.

## Running

[Concurrency + 429 retry](/guide/concurrency)
: `runtime.concurrency` vs `for_each.concurrency`. Per-provider 429 retry with backoff.

[Resume + cache](/guide/resume-cache)
: How `oe resume` works. When the content-hash key hits. When it doesn't.

[Error policies (`on_error`)](/guide/on-error)
: `fail` (default) vs `skip` vs `retry`. Cascade behavior. When to use which.

[Self-hosted LLMs (vLLM, Ollama, LM Studio)](/guide/self-hosted-llm)
: Point `OPENAI_BASE_URL` at your local server. The default-model override pattern.

## Evolving

[The advisor](/guide/evolution-advisor)
: What `EvolutionAdvisor.analyze()` reads, what it proposes, confidence levels.

[Applying proposals](/guide/applying-proposals)
: Extracting the embedded diff. `git apply` workflow. Handling drift.

[Author → run → evolve loop](/guide/closed-loop)
: The full lifecycle with one LLM provider driving all three stages.

## Integration

[MCP server (use OE from Claude Code)](/guide/mcp-server)
: `oe-mcp` exposes 6 tools so Claude Desktop / Cursor can invoke OE primitives.

[cli-agent node (call CLIs from OE)](/guide/cli-agent-usage)
: Outbound: have an OE node spawn a Claude Code / Codex / Gemini session.

[Skills + SKILL.md](/guide/skills)
: Package reusable LLM capabilities as redistributable SKILL.md packages.

---

→ **Stuck?** Hit [FAQ + troubleshooting](/faq).
→ **Pattern-shopping?** Browse the [cookbook](/cookbook/).
→ **Want concepts first?** Start at [Concepts](/concepts/).
