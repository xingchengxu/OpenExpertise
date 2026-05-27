---
title: Concepts
description: The mental model behind OpenExpertise — what an experience is, how state flows, why Code-as-Law, and how the runtime executes the graph.
---

# Concepts

Start here if you want to **understand the system** before writing YAML. Each page is 5–10 minutes; read top-to-bottom for the full conceptual tour, or jump to whichever piece you need.

::: tip Recommended order

1. [What is an experience?](/concepts/experiences)
2. [Code-as-Law](/concepts/code-as-law) — our central thesis
3. [The 6 node kinds](/concepts/node-kinds) — at-a-glance + decision tree
4. [State (SQLite blackboard)](/concepts/state)
5. [Edges & control flow](/concepts/control-flow)
6. [Events & event log](/concepts/events)
7. [Scheduler](/concepts/scheduler) — Sequential vs Parallel
8. [Dispatchers](/concepts/dispatchers) — the pluggable execution layer
9. [Cache key + memoization](/concepts/cache) — how `oe resume` works
10. [Evolution loop](/concepts/evolution-loop) — author → run → evolve closes
    :::

## Core model

The mental model in one paragraph: an **experience** is a YAML-declared DAG of **nodes** running over a **SQLite-backed state** with a **JSONL event log**. The graph never changes at runtime — that's [Code-as-Law](/concepts/code-as-law). LLMs only fill in node bodies. After a run, the [evolution loop](/concepts/evolution-loop) can propose YAML diffs.

| Page                                   | What it covers                               |
| -------------------------------------- | -------------------------------------------- |
| [Experiences](/concepts/experiences)   | The unit of authoring + the file layout      |
| [Code-as-Law](/concepts/code-as-law)   | Why YAML, why not autonomous                 |
| [Node kinds](/concepts/node-kinds)     | The 6 kinds + the decision tree              |
| [State](/concepts/state)               | SQLite blackboard + merge strategies         |
| [Control flow](/concepts/control-flow) | Edges, `when:`, `for_each`, pipelines, loops |
| [Events](/concepts/events)             | The JSONL event log + 10 event types         |

## Node kinds in depth

A page per kind — what's in the YAML, what the dispatcher does, the gotchas.

| Page                                    | Kind                                       |
| --------------------------------------- | ------------------------------------------ |
| [tool](/concepts/node-tool)             | Deterministic JS function                  |
| [agent](/concepts/node-agent)           | LLM with AJV-validated structured output   |
| [skill](/concepts/node-skill)           | Reusable SKILL.md package                  |
| [dataset](/concepts/node-dataset)       | File / SQLite / HTTP / MCP-resource loader |
| [experience](/concepts/node-experience) | Nested sub-experience                      |
| [cli-agent](/concepts/node-cli-agent)   | Subprocess to Claude Code / Codex / Gemini |

## Runtime

How the graph actually executes.

| Page                                       | What it covers                           |
| ------------------------------------------ | ---------------------------------------- |
| [Scheduler](/concepts/scheduler)           | Sequential + Parallel, wave algorithm    |
| [Dispatchers](/concepts/dispatchers)       | One per kind, two-phase resolve + run    |
| [Cache](/concepts/cache)                   | Content-hash memoization for `oe resume` |
| [Evolution loop](/concepts/evolution-loop) | The advisor and the 3 operations         |

## Where to next

- **Want to write your first experience?** → [Guide: First Experience](/guide/first-experience)
- **Want to see real examples?** → [Examples gallery](/examples/)
- **Want to evaluate against other frameworks?** → [Compare](/compare/)
- **Want the YAML schema?** → [Schema reference](/reference/schema)
