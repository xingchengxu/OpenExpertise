---
title: Operations
description: Running OpenExpertise in production — architecture, observability, deployment patterns.
---

# Operations

When you're past "does this work on my laptop" and into "we run this in CI / cron / a service / a queue".

## [Architecture overview](/operations/architecture)

What's in each of the 15 packages, how data flows from `oe run` to SQLite to JSONL, and where the swappable plugin points are.

## [Observability](/operations/observability)

The three observability surfaces:

- **JSONL event log** — every meaningful runtime moment, durably written.
- **TUI dashboard** — live render with status glyphs + activity + tokens.
- **Programmatic subscribers** — `EventBus.subscribe()` for Prometheus / Datadog / PagerDuty.

Integration recipes for the common backends.

## [Performance & cost](/operations/performance)

Hard numbers per example (wall time, tokens, USD cost on Claude 3.5 Sonnet and gpt-4o), plus the 6 levers you have when you need to bring them down: concurrency, tight schemas, cache + resume, cheaper models, conditional skip, cli-agent for long sessions.

Includes the runtime's overhead profile (framework adds <100ms total, LLM dominates) and memory footprint (<50MB resident for typical runs).

## [Deployment](/operations/deployment)

How to run OE in production:

- **CI** — `oe run` as a step, results checked in or posted to PR comments.
- **Cron** — scheduled runs producing dated artifacts under `.openexpertise/runs/`.
- **Containers** — Dockerfile pattern, volume mounts for `.openexpertise/`, secret handling.
- **Service** — embedding `runExperience()` inside an existing Node service.
- **Queue worker** — pulling run requests from SQS / Redis / Kafka.

## Operational characteristics

- **Single-process by default** — V1 runs in one Node process. Shard across machines with your own queue.
- **State is local** — better-sqlite3 file at `.openexpertise/state.sqlite`. Backup as a file. Restore by replacing.
- **Event log is JSONL** — append-only, crash-safe via `appendFileSync`. Tail with `tail -f`. Parse with `jq`.
- **No external dependencies** — no Redis, no Postgres, no S3 required. Just Node + your LLM provider.
- **Stateless schedulers** — the runtime is the state; the scheduler reads from it. Restart-safe via `oe resume`.

## Limits

| Surface                        | V1 limit                                       | Workaround                                             |
| ------------------------------ | ---------------------------------------------- | ------------------------------------------------------ |
| Max run duration               | None (in-process), but `node` will hold memory | Run as subprocess and persist artifacts via filesystem |
| Max concurrency                | `runtime.concurrency` setting; default 1       | Tune per workflow; 429-retry handles overflow          |
| Max nodes per experience       | None practical; tested up to ~50               | Split into nested experiences                          |
| Max state field size           | SQLite-bounded (~1 GB blob practically)        | Externalize large blobs to filesystem + store paths    |
| Concurrent runs same workspace | Not coordinated — state is shared SQLite       | One workspace per concurrent run if needed             |

→ **Need horizontal scale?** Layer OE on top of [Inngest](https://www.inngest.com/) or [Temporal](https://temporal.io/) for durable orchestration; OE handles the LLM-touching nodes within each invocation.
