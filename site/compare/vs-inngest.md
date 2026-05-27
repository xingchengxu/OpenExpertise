# OpenExpertise vs Inngest / Temporal

OpenExpertise is a lightweight, LLM-aware SOP runtime; Inngest and Temporal are production-grade, general-purpose durable workflow engines that also happen to support LLM calls.

## What Inngest and Temporal are

**Temporal** is a battle-hardened open-source durable workflow platform. Workflows are code (Go, Java, TypeScript, Python) and the Temporal server acts as a durable execution substrate: if a worker crashes mid-workflow, the workflow resumes from its last checkpoint. Temporal is widely used in large-scale backend systems — payments, logistics, ML pipelines — where reliability over days or weeks is non-negotiable. It has a rich ecosystem of SDKs, activity workers, and the Temporal Cloud managed service.

**Inngest** is a TypeScript-first event-driven durable functions platform. Functions are ordinary TypeScript decorated with `inngest.createFunction`, and the Inngest platform handles retries, concurrency limits, fan-out, scheduling, and event-driven triggers. It is designed to deploy alongside serverless (Vercel, Cloudflare Workers) and traditional backends alike. Inngest has strong LLM-aware primitives in its newer releases: `step.ai.infer()` provides structured retry and rate-limit handling for LLM calls, addressing the 429-problem that OpenExpertise also solves independently.

Both Inngest and Temporal are general-purpose engines. An LLM call is just another activity or step — they have no concept of "agent output schema," "state blackboard," or "evolution advisor." Their strength is operational reliability and scale; their abstraction layer is one level below LLM orchestration.

## Where they overlap

- Durable execution with automatic retry on failure.
- Observable runs with event logs and step-level status.
- Parallel step execution.
- Resumability — a run can be paused and continued later.
- Structured state (inputs and outputs per step).

## Where OpenExpertise differs

| Dimension             | OpenExpertise                                                             | Inngest / Temporal                                                                 |
| --------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| LLM-aware primitives  | `agent` node kind with structured output, prompt files, schema validation | LLM calls are plain activities/steps; no structured output or prompt abstractions  |
| Deployment footprint  | Runs as a CLI against a local SQLite store; zero separate services        | Requires Inngest Dev Server / Temporal server or cloud service                     |
| Graph definition      | Declarative YAML — the graph is a data artifact                           | TypeScript / Go / Java code — the workflow is a code artifact                      |
| Schema validation     | `state.schema` validated with AJV before execution                        | Workflow inputs typed via language type system; no pre-run validation of the graph |
| Self-evolution        | `oe evolve` proposes graph changes from runtime traces                    | Not present                                                                        |
| Multi-CLI integration | `cli-agent` delegates to Claude Code / Codex / Gemini subprocesses        | Not present                                                                        |
| Authoring             | `oe ultra` auto-generates YAML from natural language                      | Code-first                                                                         |
| Scope                 | LLM + expert-process orchestration                                        | General-purpose distributed systems: payments, ETL, ML, logistics                  |
| 429-aware retry       | Built in; exponential backoff on HTTP 429                                 | Inngest has `step.ai.infer()`; Temporal requires custom activity retry policy      |

## When to pick Inngest / Temporal over OpenExpertise

- You need production-grade durability at scale — tens of thousands of concurrent workflow instances.
- Your workflows run for days or weeks and must survive server restarts, deployments, and infrastructure failures.
- You're orchestrating general backend logic (payments, emails, ETL) that includes some LLM calls as steps.
- You need Temporal's rich observability UI, query language, and versioning for long-lived workflows.
- You need Inngest's event-driven triggers, serverless deployment, or deep integration with Vercel/Next.js.

## When to pick OpenExpertise over Inngest / Temporal

- Your workflow is a team SOP — a fixed set of phases with LLM judgment at specific decision points.
- You want zero infrastructure: `oe run examples/review-branch` with a local SQLite store and no cloud account.
- You need the evolution loop: runtime trace → advisor → graph improvement proposal.
- You want a YAML artifact that non-engineers can review in a PR.
- You want to call Claude Code, Codex, or Gemini as first-class subprocess workers from within the graph.
- You want one-keyword authoring: `oe ultra "triage incoming support tickets"`.

## Specific positioning

Inngest and Temporal are load-bearing production infrastructure; OpenExpertise is a lightweight SOP runtime that trades raw operational scale for LLM-aware primitives and a self-improvement loop. If you need both, use Inngest/Temporal as the durable substrate and invoke OpenExpertise experiences as steps within that larger system.
