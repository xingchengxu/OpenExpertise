---
title: vs the alternatives
description: How OpenExpertise positions against LangGraph, CrewAI, Mastra, Inngest, /workflows, and using Claude Code directly.
---

# vs the alternatives

OpenExpertise occupies a specific niche. It is the **orchestration layer** that sits above LLM coding assistants — not a replacement for them, and not a general-purpose workflow engine. Here is where it sits relative to its neighbors.

## Master comparison table

| Dimension                                            |                 OpenExpertise                  |                   LangGraph                   |                   CrewAI                    |                   Mastra                    |             Inngest / Temporal              |            `/workflows` (Anthropic)             |                  Claude Code                  |
| ---------------------------------------------------- | :--------------------------------------------: | :-------------------------------------------: | :-----------------------------------------: | :-----------------------------------------: | :-----------------------------------------: | :---------------------------------------------: | :-------------------------------------------: |
| Declarative graph (YAML / JSON, not code)            |      <span class="pill pill-ok">✓</span>       |      <span class="pill pill-no">—</span>      |     <span class="pill pill-no">—</span>     |     <span class="pill pill-no">—</span>     |     <span class="pill pill-no">—</span>     |       <span class="pill pill-no">—</span>       |      <span class="pill pill-no">—</span>      |
| Schema validation before run                         |      <span class="pill pill-ok">✓</span>       |      <span class="pill pill-no">—</span>      |     <span class="pill pill-no">—</span>     | <span class="pill pill-warn">partial</span> | <span class="pill pill-warn">partial</span> |   <span class="pill pill-warn">partial</span>   |      <span class="pill pill-no">—</span>      |
| Persistent state across runs                         |      <span class="pill pill-ok">✓</span>       |      <span class="pill pill-no">—</span>      |     <span class="pill pill-no">—</span>     | <span class="pill pill-warn">partial</span> |     <span class="pill pill-ok">✓</span>     |       <span class="pill pill-no">—</span>       |      <span class="pill pill-no">—</span>      |
| Self-evolution (advisor loop)                        |      <span class="pill pill-ok">✓</span>       |      <span class="pill pill-no">—</span>      |     <span class="pill pill-no">—</span>     |     <span class="pill pill-no">—</span>     |     <span class="pill pill-no">—</span>     |       <span class="pill pill-no">—</span>       |      <span class="pill pill-no">—</span>      |
| Multi-CLI integration (Claude Code / Codex / Gemini) |      <span class="pill pill-ok">✓</span>       |      <span class="pill pill-no">—</span>      |     <span class="pill pill-no">—</span>     |     <span class="pill pill-no">—</span>     |     <span class="pill pill-no">—</span>     |       <span class="pill pill-no">—</span>       |   <span class="pill pill-na">is one</span>    |
| Callable as MCP tool                                 |      <span class="pill pill-ok">✓</span>       |      <span class="pill pill-no">—</span>      |     <span class="pill pill-no">—</span>     |     <span class="pill pill-no">—</span>     |     <span class="pill pill-no">—</span>     |       <span class="pill pill-no">—</span>       | <span class="pill pill-warn">consumes</span>  |
| Multiple LLM providers                               |      <span class="pill pill-ok">✓</span>       |      <span class="pill pill-ok">✓</span>      |     <span class="pill pill-ok">✓</span>     |     <span class="pill pill-ok">✓</span>     |    <span class="pill pill-na">n/a</span>    |  <span class="pill pill-warn">Anthropic</span>  | <span class="pill pill-warn">Anthropic</span> |
| Parallel + 429-aware retry                           |      <span class="pill pill-ok">✓</span>       |      <span class="pill pill-ok">✓</span>      | <span class="pill pill-warn">partial</span> | <span class="pill pill-warn">partial</span> |     <span class="pill pill-ok">✓</span>     |   <span class="pill pill-warn">unknown</span>   |      <span class="pill pill-no">—</span>      |
| One-keyword authoring                                | <span class="pill pill-ok">✓ `oe ultra`</span> |      <span class="pill pill-no">—</span>      |     <span class="pill pill-no">—</span>     |     <span class="pill pill-no">—</span>     |     <span class="pill pill-no">—</span>     | <span class="pill pill-ok">✓ `ultrawork`</span> |      <span class="pill pill-no">—</span>      |
| Heterogeneous node kinds                             |   <span class="pill pill-ok">6 kinds</span>    | <span class="pill pill-warn">functions</span> | <span class="pill pill-warn">agents</span>  |  <span class="pill pill-warn">mixed</span>  |  <span class="pill pill-warn">steps</span>  |   <span class="pill pill-warn">agents</span>    |      <span class="pill pill-no">—</span>      |

## Decision tree

```
What are you trying to do?
│
├─ Automate a recurring multi-step process that mixes
│  deterministic code + LLM judgment, and you need it
│  to run the same way every time, leave a trail,
│  and get better at it?
│       └─► Use OpenExpertise.
│
├─ Build a production app backend with complex agent
│  graphs, deep Python ecosystem, and LangChain tools?
│       └─► Use LangGraph (Python).
│
├─ Model a "team" of role-playing agents with explicit
│  collaboration patterns?
│       └─► Use CrewAI.
│
├─ Build a TypeScript app backend with agents, RAG,
│  memory, and full-stack integration?
│       └─► Use Mastra.
│
├─ Need enterprise-grade durable workflows — retries,
│  event queues, cron schedules — for general backend
│  logic that also happens to call LLMs?
│       └─► Use Inngest or Temporal.
│
├─ Your team uses Claude Code and you want SOPs to
│  live natively inside it with an interactive TUI?
│       └─► Watch /workflows (Anthropic, in preview).
│
└─ One-off task, exploration, or ad-hoc scripting?
        └─► Use Claude Code / Codex / Gemini directly.
```

## Pairwise comparisons

- [vs Anthropic /workflows](/compare/vs-workflows) — the closest conceptual sibling, currently unreleased
- [vs LangGraph](/compare/vs-langgraph) — stateful Python agent graphs
- [vs CrewAI](/compare/vs-crewai) — multi-agent role-play orchestration
- [vs Mastra](/compare/vs-mastra) — TypeScript AI workflow framework
- [vs Inngest / Temporal](/compare/vs-inngest) — durable general-purpose workflow engines
- [vs Claude Code directly](/compare/vs-claude-code) — when you don't need an orchestration layer at all

> These pages are positioning notes, not product benchmarks. PRs that improve accuracy are welcome.
