# OpenExpertise vs Mastra

OpenExpertise is a YAML-defined SOP runtime with a self-improvement loop; Mastra is a TypeScript framework for building full-stack AI applications with agents, workflows, and RAG.

## What Mastra is

Mastra is an open-source TypeScript framework aimed at developers building AI-powered applications — think production backends that need agents, retrieval-augmented generation, memory, and workflow orchestration all in one coherent package. It integrates with a broad set of LLM providers via the AI SDK and ships first-class support for tool calling, voice, and multi-step workflow graphs defined in TypeScript code.

Mastra's workflow system lets you define directed graphs as TypeScript objects: nodes are typed steps, edges carry typed context, and the runtime handles execution, retries, and state. Unlike pure orchestration layers, Mastra is designed to be the application framework itself — you build your AI features on top of it, not alongside it. The Mastra team also provides managed cloud deployment for workflows, agents, and knowledge bases.

For a TypeScript team building a new AI product — customer support bots, internal knowledge assistants, code generation pipelines — Mastra is a compelling all-in-one choice. It reduces the number of libraries a team needs to integrate and provides consistent abstractions across agents, memory, and retrieval.

## Where they overlap

- TypeScript / Node.js runtime.
- Workflow graphs with typed state flowing between nodes.
- LLM agent abstractions with structured output.
- Support for multiple LLM providers.
- Tool/function calling integration.

## Where OpenExpertise differs

| Dimension          | OpenExpertise                                                                                       | Mastra                                                        |
| ------------------ | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Graph definition   | Declarative YAML — the graph is data, not code                                                      | TypeScript code — Mastra `Step` / `Workflow` objects          |
| Schema validation  | AJV validates `state.schema` and graph structure before execution                                   | TypeScript types + Zod schemas at runtime                     |
| Target use case    | Codifying a team's expert SOP into a persistent, evolvable artifact                                 | Building a production AI application backend                  |
| Evolution loop     | `oe evolve` proposes graph patches from runtime traces; `oe evolve --runs` finds cross-run patterns | No equivalent                                                 |
| CLI integration    | `cli-agent` node calls Claude Code / Codex / Gemini subprocesses                                    | No native CLI delegation                                      |
| Self-improvement   | First-class: author → run → evolve is a closed loop                                                 | Not present                                                   |
| MCP server         | Exposes OE as 8 MCP tools; can be called from Claude Code                                           | Supports MCP as a consumer                                    |
| Authoring          | `oe ultra "<task>"` auto-generates YAML                                                             | Code-first; no LLM authoring of the workflow graph            |
| Node heterogeneity | 6 kinds: `tool`, `agent`, `skill`, `dataset`, `experience`, `cli-agent`                             | Steps are TypeScript functions; heterogeneity modeled in code |

## When to pick Mastra over OpenExpertise

- You're building a production AI application (not codifying an existing SOP) and want an all-in-one framework.
- You need built-in RAG, vector search, and memory alongside workflows.
- Your team wants workflow logic expressed in TypeScript rather than YAML.
- You need Mastra Cloud for managed deployment, scaling, and observability.
- You're integrating voice or multi-modal capabilities into your application.

## When to pick OpenExpertise over Mastra

- The problem is a recurring, human-defined SOP — a process your team already follows that you want to codify, not a new application you're building.
- Non-engineer stakeholders need to read and review the workflow definition.
- You want the evolution loop: runtime behavior drives graph improvement proposals.
- You want to call Claude Code, Codex, or Gemini as first-class subprocess workers from within the graph.
- You want the graph to live as a YAML file alongside your code, tracked in git and deployed without a cloud service.

## Specific positioning

Mastra and OpenExpertise are both TypeScript-first and both model work as graphs, but they serve different ambitions. Mastra is for building AI products; OpenExpertise is for automating the recurring expert processes that run those products — code review, incident triage, release gates, compliance checks.
