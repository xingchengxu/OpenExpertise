# OpenExpertise vs CrewAI

OpenExpertise models expert workflows as persistent, evolvable graphs; CrewAI models multi-agent collaboration as teams of role-playing agents.

## What CrewAI is

CrewAI is a Python framework built around the "crew" metaphor: you define a set of agents with distinct roles, backstories, and tool access, then assemble them into a crew and assign them tasks. The framework handles agent-to-agent communication, task delegation, and the sequential or hierarchical execution of those tasks. It is one of the more accessible entry points for multi-agent patterns — defining a "Senior Researcher" agent and a "Report Writer" agent, each with a few lines of Python, is genuinely fast.

CrewAI has a growing ecosystem of pre-built tools (web search, code interpretation, file I/O) and a paid cloud platform (CrewAI Cloud) that adds deployment and monitoring. For use cases that are naturally framed as "a team of specialists tackling a problem together" — research pipelines, content generation workflows, competitive analysis — the role-based mental model maps intuitively onto the problem.

CrewAI also ships "Flows," a lightweight state machine layer on top of crews, which adds more explicit control flow to what would otherwise be fully agent-driven execution. This is an acknowledgment that pure role-play is not enough for complex, deterministic SOPs.

## Where they overlap

- Structured orchestration of multiple LLM agent calls.
- Role specialization — different agents for different sub-tasks.
- Sequential and parallel task execution.
- Python runtime; installable via pip.
- Support for popular LLM providers via LiteLLM integration.

## Where OpenExpertise differs

| Dimension | OpenExpertise | CrewAI |
|---|---|---|
| Fundamental unit | An _experience_: a graph of mixed node kinds | A _crew_: a team of role-playing agents |
| Non-LLM nodes | First-class: `tool` (pure code) and `dataset` nodes can be most of the graph | Tasks are generally LLM-driven; deterministic logic lives outside the crew abstraction |
| State persistence | SQLite blackboard, typed schema, survives process exit, resumable | Per-run memory; not persistent across runs by default |
| Determinism | `tool` and `dataset` nodes have cache keys; reruns don't pay LLM cost for cached steps | Agent outputs are re-generated each run |
| Graph definition | Declarative YAML with AJV schema validation | Python code (Agents, Tasks, Crew objects) |
| Evolution loop | `oe evolve` proposes graph upgrades from runtime traces | No equivalent |
| CLI integration | `cli-agent` delegates to Claude Code / Codex / Gemini subprocesses | No equivalent |
| Authoring | `oe ultra "<task>"` generates YAML | Code-first |

## When to pick CrewAI over OpenExpertise

- Your problem is naturally framed as "a team of specialists" — the role metaphor matches your mental model.
- You want a Python framework with pip install and a small learning curve.
- You need CrewAI's pre-built tool integrations (Serper, BrowserBase, etc.).
- You're building a one-shot research or content pipeline, not a recurring SOP.
- You want the CrewAI Cloud platform for deployment and monitoring without running your own infrastructure.

## When to pick OpenExpertise over CrewAI

- Your workflow is a recurring SOP — it should run identically every time, leave an audit trail, and improve across runs.
- You need most of the graph to be deterministic code, with LLM calls at specific decision points only.
- You need persistent state: a node's output from run #1 must be available to run #2.
- You want the YAML to be reviewable by non-engineers and tracked in a git repo.
- You need to delegate specific nodes to Claude Code, Codex, or Gemini as subprocess workers.

## Specific positioning

CrewAI shines for agent-heavy pipelines where the role metaphor is natural and one-shot execution is acceptable. OpenExpertise is for teams that need a persistent, auditable, deterministic-first SOP runtime where LLM agents are nodes in a larger, evolving graph — not the whole show.
