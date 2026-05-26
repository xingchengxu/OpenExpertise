# OpenExpertise vs the alternatives

A short take on how OpenExpertise positions against the most-asked-about peers. Fuller treatment as the project matures and we get specific feedback.

## vs LangGraph

LangGraph is a Python library for building stateful, multi-actor LLM applications as graphs. It's deeply integrated with LangChain and excellent at iterative agent loops.

**Where they overlap:** graph-based orchestration, state, conditional edges.

**Where OpenExpertise differs:**

- Heterogeneous node kinds in one graph (tool, agent, skill, dataset, experience). LangGraph nodes are typically Python functions wrapping LLM calls.
- Declarative YAML format with strict schema validation — graph structure is reviewable by non-engineers.
- TypeScript / Node runtime — fits front-end-adjacent teams better.
- An explicit evolution advisor that proposes graph upgrades from runtime traces.

## vs CrewAI

CrewAI optimizes for multi-agent collaboration ("crews" of role-playing agents). The mental model is agent teams.

**Where they overlap:** structured agent orchestration, role specialization.

**Where OpenExpertise differs:**

- The unit is an _experience_ — a graph of mixed nodes, not a team of agents. Most nodes aren't LLM calls.
- State is structured and persistent across runs; CrewAI state is per-run.
- Determinism: tool/dataset nodes are pure code with cache keys. Reruns don't pay LLM cost.

## vs Mastra

Mastra is a TypeScript framework for building AI applications with workflows, agents, and RAG.

**Where they overlap:** TypeScript, workflows-as-graphs, agent abstractions.

**Where OpenExpertise differs:**

- Declarative YAML graph + Claude Code authoring skill (`experience-creator`) — the graph is data, not code.
- First-class evolution loop.
- Aimed at codifying _human_ expertise into a runnable artifact, not at building production app backends. Different problem framing.

## vs Inngest / Temporal

Inngest and Temporal are durable workflow engines (general-purpose, not LLM-specific) with retries, schedules, and event-driven steps.

**Where they overlap:** durability, retries, observable runs.

**Where OpenExpertise differs:**

- LLM-aware primitives (agent kind, structured output, schema-validated tool calls).
- Lighter — no separate service to deploy; runs as a CLI against a local SQLite store.
- Per-experience state schema rather than free-form workflow inputs/outputs.
- Trade-off: less production-grade as a general workflow engine. We're a different shape of tool.

## Picking the right one

- **Heavy production LLM app backend?** Mastra / Inngest + LangChain.
- **Multi-agent role-play patterns?** CrewAI.
- **Codifying an expert's runbook as a versioned, evolvable artifact?** OpenExpertise.
- **Stateful Python agent loops with deep LangChain integration?** LangGraph.

These are not exhaustive lists of features — they're positioning notes. PRs welcome to expand or correct.
