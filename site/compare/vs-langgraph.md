# OpenExpertise vs LangGraph

OpenExpertise is a declarative YAML orchestrator for codifying expert SOPs; LangGraph is a Python library for building stateful, multi-actor LLM applications as first-class code graphs.

## What LangGraph is

LangGraph (from LangChain) is a Python library that lets you define stateful workflows as directed graphs — including cycles. Each node is a Python function (or async function), edges carry typed state, and the framework handles checkpointing and resumption. It is deeply integrated with the LangChain tool ecosystem: retrievers, vector stores, memory adapters, and dozens of community integrations are available out of the box.

LangGraph's superpower is iterative agent loops with real state. A node can write to shared state, a conditional edge can route back to an earlier node based on what was written, and the built-in `MemorySaver` or LangGraph Cloud persistence layer keeps the conversation alive across turns. For production systems that require complex, branching agent reasoning — multi-hop RAG, agentic research, human-in-the-loop review — LangGraph is a mature, battle-tested choice.

LangGraph Studio provides a visual debugger that lets you inspect, replay, and interrupt graph runs in a GUI, which is especially useful during development of complex graphs. The LangGraph Platform (cloud offering) adds deployment, scaling, and observability on top.

## Where they overlap

- Directed acyclic (and cyclic) graph execution model.
- Conditional edges for dynamic routing.
- Typed shared state that flows between nodes.
- Persistence and resumability of runs.
- Support for parallel node execution.
- Multiple LLM providers via LangChain's model abstraction layer.

## Where OpenExpertise differs

| Dimension | OpenExpertise | LangGraph |
|---|---|---|
| Graph definition | Declarative YAML — readable by non-engineers, diff-able in PRs | Python code — full expressiveness, requires Python developer |
| Schema validation | AJV validates `state.schema` and node structure before execution | Runtime type checking via TypedDict / Pydantic; no pre-run graph validation |
| Node heterogeneity | 6 kinds: `tool`, `agent`, `skill`, `dataset`, `experience`, `cli-agent` | Nodes are Python functions; heterogeneity is modeled in code |
| CLI integration | `cli-agent` node delegates to Claude Code / Codex / Gemini subprocess | No native CLI delegation; calls LLMs via LangChain model interfaces |
| Evolution loop | `oe evolve` reads event log, proposes YAML graph patches | No equivalent; graph changes require code edits |
| Runtime | TypeScript / Node.js | Python |
| Authoring | `oe ultra "<task>"` or `/ultraexpertise` in Claude Code | Code-first; no LLM authoring of the graph itself |
| Ecosystem | Small; early-stage | Large; LangChain tool ecosystem, community integrations |
| Cycles | Not supported (DAG only) | First-class support for cycles and iterative loops |

## When to pick LangGraph over OpenExpertise

- Your team is Python-first and you want to leverage the LangChain ecosystem.
- Your workflow requires cycles — the agent needs to loop back based on intermediate results.
- You're building a production multi-turn agent with complex human-in-the-loop patterns.
- You need LangGraph Studio for visual debugging and the LangGraph Platform for deployment.
- Your graphs are dynamic in structure — nodes and edges computed at runtime from data.

## When to pick OpenExpertise over LangGraph

- Your "workflow" is a team SOP — a fixed sequence of phases with known structure that non-engineers should be able to read and review.
- You need YAML that can live in a git repo, be reviewed in a PR, and be patched via `git apply`.
- You want the evolution loop: the runtime proposes graph improvements from trace data.
- You want to delegate individual nodes to Claude Code, Codex, or Gemini as subprocess workers.
- Your team is TypeScript/Node-first or you want to avoid a Python dependency.

## Specific positioning

LangGraph is the right tool for complex, code-defined, Python agent graphs — especially when you need cycles, LangChain integrations, or a visual debugger. OpenExpertise is for teams that want their SOP as a version-controlled YAML artifact with built-in evolution, not a Python codebase.
