# OpenExpertise vs Claude Code directly

OpenExpertise is the orchestration layer above Claude Code; Claude Code is the autonomous AI worker below it. Most users will want both.

## What "using Claude Code directly" means

Claude Code (and its peers Codex CLI, Gemini CLI) is an autonomous coding assistant that takes a natural-language prompt and improvises a plan, runs tools, writes code, reads files, and produces results — all in a single interactive session. It is exceptional at open-ended, exploratory tasks where the best path cannot be specified in advance: "debug this failing test," "refactor this module," "explain this codebase."

The strength of Claude Code is its generality. It can handle tasks that no pre-defined workflow could anticipate. When you don't know what the right steps are, or when the task is genuinely one-off, using Claude Code directly is not just acceptable — it is the right choice.

The limitation is the flip side of that strength. Claude Code improvises a different trajectory each run. There is no guaranteed step sequence, no structured output schema, no persistent state between sessions, and no audit trail of which decisions were made and why. For recurring processes that must produce comparable, auditable results every time, raw CLI sessions are not enough.

## Where they overlap

- Both use Claude (Anthropic's models) to do LLM-powered work.
- Both can read and write files, run shell commands, and call tools.
- Both are invocable from the command line.
- Both can use MCP tools.
- OpenExpertise can literally call Claude Code as a `cli-agent` node — they compose.

## Where OpenExpertise differs

The README's comparison diagram captures it precisely:

```
┌─────────────────────────────────────┐    ┌───────────────────────────────────────┐
│   Claude Code                       │    │   OpenExpertise                       │
│   "AI bash"                         │    │   "AI Makefile"                       │
│                                     │ vs │                                       │
│   - improvised each run             │    │   - same DAG every run                │
│   - opaque trajectory               │    │   - JSONL event log + SQLite state    │
│   - one-shot, no memory             │    │   - evolves itself across runs        │
│   - general-purpose                 │    │   - codifies a specific SOP           │
└─────────────────────────────────────┘    └───────────────────────────────────────┘
         autonomous worker                           workflow conductor
                                                    (can call the workers)
```

Concretely:

| Dimension         | OpenExpertise                                                       | Claude Code directly                                     |
| ----------------- | ------------------------------------------------------------------- | -------------------------------------------------------- |
| Run consistency   | Same DAG executes the same phases in the same order every run       | Improvises a different path each time                    |
| State persistence | SQLite blackboard; `oe state findings` works hours later            | Session memory only; state is lost when the session ends |
| Audit trail       | JSONL event log per run; every node write recorded                  | No structured log; terminal output only                  |
| Self-improvement  | `oe evolve <run-id>` proposes graph patches from trace data         | No equivalent                                            |
| Resumability      | `oe resume <run-id>` replays cached steps                           | No equivalent                                            |
| Schema validation | State schema validated before execution; structured output per node | No schema enforcement                                    |
| Non-LLM steps     | `tool` and `dataset` nodes run pure code, no LLM cost               | All work done by the LLM                                 |
| Authoring         | `oe ultra "<task>"` authors a YAML SOP                              | `/ultraexpertise` skill generates an OE experience       |

## When to use Claude Code directly (not OpenExpertise)

This is the decision tree from the README:

```
Are you trying to automate a recurring, multi-step process
that mixes deterministic logic + LLM judgment?
                   │
           ┌───────┴────────┐
          YES               NO
           │                 │
   Need it durable,       Use Claude Code
   reproducible,          or Codex directly.
   evolvable?
   │
   └─► Use OpenExpertise.
```

More specifically, use Claude Code directly when:

- The task is exploratory — you don't know the right steps in advance.
- It is a one-off task with no expectation of future runs.
- The process is too fluid and context-dependent to codify in a DAG.
- You want maximum autonomy: let the model figure out the whole plan.

## When to use OpenExpertise (not Claude Code directly)

Use OpenExpertise when:

- Your team has a SOP they follow every Monday morning — code review, incident triage, release gates, compliance check.
- You need the output to be comparable and auditable across runs.
- You want non-engineers to read and review the workflow definition.
- You need to build on past runs: state from run N feeds run N+1.
- You want the workflow to improve: each run's trace feeds the evolution advisor.

## Specific positioning

Claude Code and OpenExpertise are not competitors — OpenExpertise calls Claude Code. The question is whether your task warrants the structure of a SOP. If it does, OpenExpertise is the layer that makes it repeatable, persistent, and self-improving. If it doesn't, open a Claude Code session and just run it.
