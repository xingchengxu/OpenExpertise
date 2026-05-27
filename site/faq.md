---
title: FAQ + Troubleshooting
description: Answers to the common questions, decoding the common errors, and links to the right next page.
---

# FAQ + Troubleshooting

The questions and errors that come up first. If you don't find it here, search the site (`/`) — every page is indexed.

[[toc]]

## Concept questions

### Is this an agent framework?

**No.** OpenExpertise is **the orchestration layer above agent frameworks**. The graph is deterministic YAML; the LLM only fills in the gaps inside nodes (a single agent's structured response, or a single skill's reply). The graph never changes at runtime.

If you want an autonomous agent that explores freely, use [Claude Code](https://github.com/anthropics/claude-code), Codex, or Gemini directly. If you want to **wrap one of those agents in a reproducible workflow**, use OE. See [vs Claude Code directly](/compare/vs-claude-code) for the side-by-side.

### How is this different from LangGraph / CrewAI / Mastra?

The full matrix is at [Compare](/compare/). Short version:

- **vs LangGraph** — they're Python and code-as-graph; we're YAML-first and dispatcher-modular. You define the same DAG, but ours lives in source-control as a single artifact that humans can review.
- **vs CrewAI** — they're agent-conversation-centric; we're graph-execution-centric. Less "agents talking", more "DAG executes with LLM inside specific nodes".
- **vs Mastra** — closest spiritual neighbor. Different design: we treat **the graph + state + events** as the durable substrate; agent-internals are pluggable dispatchers.
- **vs Inngest / Temporal** — they're durable execution backends without LLM batteries-included; we ship LLM dispatchers + 429 retry + structured output + evolution loop on top of a similar primitive.

### Why YAML and not Python / TypeScript / JSX?

Three reasons:

1. **Git-reviewable.** A YAML graph is a flat artifact. Five reviewers can look at the same `experience.yaml` and see the whole shape.
2. **Tool-friendly.** Schema-validated, LLM-authorable (`oe ultra` writes them), diffable, type-narrowed in editors with the published JSON schema.
3. **Single source of truth.** The same file feeds the validator, the runtime, the TUI, and the evolution advisor. Nothing is hidden behind a Python decorator.

If you genuinely want a code-first DAG, see the programmatic [`runExperience`](/reference/api/run-experience) API — but most production users prefer YAML once they've tried both.

### What's the difference between a `tool` and a `cli-agent`?

| `tool`                                                                      | `cli-agent`                                                                   |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Pure JS function. Deterministic. You write the .mjs.                        | Subprocess that spawns `claude` / `codex` / `gemini`. Non-deterministic.      |
| Synchronous-ish (returns when the function returns).                        | Async — takes seconds to minutes per invocation.                              |
| No tokens, no metrics, no LLM dependency.                                   | Tokens spent inside the CLI's session. Not always exposed.                    |
| Use for: HTTP fetch, file IO, parsing, deterministic logic, classification. | Use for: anything where you want a different vendor's CLI to do agentic work. |

### What's the difference between an `agent` and a `skill`?

Both are LLM calls. Difference is where the prompt lives:

- **`agent`** — inline prompt path + inline JSON schema in `experience.yaml`. Optimized for one specific structured output you control fully.
- **`skill`** — points at a `SKILL.md` package (frontmatter + body, à la Anthropic skills). Optimized for reusable, redistributable capabilities. The SKILL.md travels independent of the experience.

If you'd reuse the same prompt + schema across multiple experiences, package it as a skill. Otherwise inline as an agent.

### Does it work without an LLM?

**Yes for `tool` and `dataset` nodes.** You can build a deterministic-only workflow (the [`hello-tool`](/examples/hello-tool) and [`dataset-aggregate`](/examples/dataset-aggregate) examples don't touch an LLM).

For `agent` / `skill` / `cli-agent` nodes you need a configured provider (`ANTHROPIC_API_KEY`, or `OPENAI_API_KEY` + `OPENAI_BASE_URL`, or the CLI installed locally). The 11 examples ship with mocked-LLM e2e tests that exercise the structure without burning real tokens.

### Can I run experiences offline?

Yes — point `OPENAI_BASE_URL` at a local vLLM / Ollama / LM Studio server. See [Self-hosted LLMs](/guide/self-hosted-llm). `tool` / `dataset` nodes don't need any model.

### Will my workflow change between runs?

**No.** The graph is fixed by your YAML. The LLM only fills in nodes' content (`findings`, `summary`, etc.). The shape is stable, the path is stable, the state schema is stable.

If you want to **change** the graph, that's `oe evolve` — but it writes a markdown file with a unified diff, and you `git apply` it consciously. Nothing auto-applies.

## Setup questions

### What Node version?

20.x, 22.x, or 24.x. We CI on all three. 18 will work but isn't tested.

### Why `pnpm` specifically?

`@openexpertise/*` ships as a pnpm-workspace monorepo with internal `workspace:*` links. `pnpm install` resolves them transparently. You can use `npm` / `yarn` for downstream consumers post-publish, but for **developing inside the repo**, pnpm is required.

If `pnpm install` fails with `ERR_PNPM_UNSUPPORTED_ENGINE`, you need `pnpm@9+`. `npm i -g pnpm@9`.

### Why does `better-sqlite3` install say it's compiling native code?

`better-sqlite3` is a native module — first install on a new machine rebuilds it for your platform. If you see a build error here, you're missing build tools:

- macOS: `xcode-select --install`
- Ubuntu: `sudo apt install build-essential python3`
- Windows: install Visual Studio Build Tools (the official `node-gyp` README has the recipe)

Subsequent installs are cached.

### Where does state live?

`<cwd>/.openexpertise/state.sqlite` (one DB per workspace). Events live at `<cwd>/.openexpertise/runs/<run-id>.jsonl`. Per-run cache at `<cwd>/.openexpertise/cache/<key>.json`.

All three are git-ignorable by default. If you want a different location, see the `OE_DATA_DIR` env var documented in [Architecture](/operations/architecture).

### How do I run only one node from a graph?

You don't directly — but `oe resume <run-id>` will skip every cached step and only re-execute the ones that are dirty or downstream of dirty. Combine with `oe reset-state <field>` to mark a field stale and force re-execution.

## Common errors

### `Error: Node "X" has unknown kind "xyz"`

Your YAML has `kind: xyz`, which isn't one of `tool` / `agent` / `skill` / `dataset` / `experience` / `cli-agent`. Check spelling. The 6 valid kinds are documented at [Node kinds](/concepts/node-kinds).

### `Error: cycle detected in graph: A → B → A`

`oe validate` will tell you which edges form the cycle. Common cause: copy-paste mistake creating a back-edge. Use `oe inspect <run-id>` after a clean run to see the actual ordering.

### `Error: schema validation failed for node "X"`

The `agent` node's structured output didn't match its declared schema. Look at the error path — AJV will say exactly which property failed. Most common:

- Missing `required` property → either tighten the prompt or make the field optional in schema.
- `additionalProperties: false` rejected an unexpected key → the model added a field; either allow it or refine the prompt.
- Type mismatch → e.g., model returned `"5"` (string) where you wanted `5` (number).

The agent dispatcher retries once if shape-invalid. If it fails twice, the node errors and `on_error` policy kicks in.

### `Error: provider "X" not configured`

Your YAML references a provider (`anthropic`, `openai`, `claude-code`, `codex`, `gemini`) that isn't set up in environment or in `runtime.providers`. For LLM SDKs:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
# or
export OPENAI_API_KEY=sk-...
export OPENAI_BASE_URL=https://api.openai.com/v1  # default OK
```

For cli-agent providers, the CLI must be installed: see [cli-agent usage](/guide/cli-agent-usage).

### `Error: Tool impl ./tools/X.mjs not found`

Path is relative to the **experience directory** (the dir containing `experience.yaml`), not the cwd. If you ran `oe run examples/review-branch` from the repo root, paths like `./tools/foo.mjs` resolve to `examples/review-branch/tools/foo.mjs`.

### `Error: Tool returned non-object: undefined`

Your tool's default export didn't `return` a `{ state_delta }` object. Even if you do nothing, return `{ state_delta: {} }`. See [Tool stubs](/guide/tool-stubs).

### `429 Too Many Requests`

The LLM provider is rate-limiting you. The Anthropic and OpenAI clients retry with exponential backoff (250ms, 500ms, 1s, 2s, ...) up to 5 attempts. If you keep hitting 429:

- Drop `--concurrency` (or the YAML's `runtime.concurrency`)
- Drop `for_each.concurrency` on the busy node
- Get a higher-tier API key

See [Concurrency + 429 retry](/guide/concurrency) for the details.

### TUI shows `?` for a node that did run

The TUI tracks nodes by ID. If you've edited the YAML mid-run with `oe resume`, old run files may have IDs that don't exist anymore. Easiest fix: start a fresh run with `oe run`.

### `oe evolve` produced a diff that won't `git apply`

The evolution advisor's diff isn't pre-validated. If the diff line numbers drifted between when the run happened and when you applied (because you edited the source in between), `git apply` will reject it. Options:

- Edit by hand using the proposal as guidance (it tells you the operation + rationale)
- Re-run + re-evolve from a clean state to get a fresh diff
- Use `git apply --reject` to apply hunks that still match and merge the rejected `.rej` manually

This is documented as a known V1 limitation at [Evolution loop](/concepts/evolution-loop).

## Performance & cost

### How much does a typical run cost?

Depends entirely on the graph. As reference points from our test suite:

| Example                                                 | Tokens (in/out) | API cost (USD, Claude 3.5 Sonnet) |
| ------------------------------------------------------- | --------------- | --------------------------------- |
| `hello-tool`                                            | 0 / 0           | $0.00                             |
| `agent-echo`                                            | ~600 / ~80      | $0.003                            |
| `review-branch` (3 dimensions + verifier + score)       | ~12K / ~2K      | $0.07                             |
| `tri-cli-orchestration` (Claude + Codex + Gemini chain) | Varies by tier  | $0.05 – $0.15                     |
| `deep-research` (multi-source synthesis)                | ~40K / ~6K      | $0.20                             |

Use `oe inspect <run-id>` to see exact tokens per node. Use `node.tokens` events to integrate with your own cost tracker. See [Observability](/operations/observability).

### Why is my run slow?

Three common causes:

1. **No concurrency** — set `runtime.concurrency: 4` (or pass `--concurrency 4`) so independent nodes can run in parallel.
2. **Sequential `for_each`** — default concurrency in `for_each` is 1. Set `concurrency: N` to fan out properly.
3. **Long LLM responses** — if you're asking for a 5-page-long summary, that's the bottleneck. Tighten the schema's max sizes or split into multiple agents.

`oe inspect <run-id>` shows per-node duration. Look for the long tail.

## Production questions

### Can I run this as a service?

Yes. Use the programmatic API ([`runExperience`](/reference/api/run-experience)) inside your service, or `oe run` as a subprocess. See [Deployment](/operations/deployment) for cron / queue / containerized patterns.

### How do I monitor production runs?

Subscribe to the [EventBus](/reference/api/event-bus) and pipe events to Prometheus / Datadog / your APM of choice. The shape is stable — `node.tokens` for spend, `node.failed` for alerts, `node.activity` for live tracing. See [Observability](/operations/observability) for the recipe.

### Is there a hosted version?

No. OpenExpertise is open-source MIT and runs entirely on your infrastructure. Your state, your events, your tokens — never touches our servers.

### What about secrets management?

OE itself never reads secrets — it just reads env vars (`ANTHROPIC_API_KEY` etc.) at runtime. Manage them however you'd manage any env var: 1Password CLI, AWS Secrets Manager, Doppler, etc.

`tool` nodes that need their own credentials (a tool calling GitHub API, for example) read those from env too. See [Deployment](/operations/deployment) for patterns.

---

→ **Still stuck?** Open an issue at [github.com/xingchengxu/OpenExpertise/issues](https://github.com/xingchengxu/OpenExpertise/issues) — please include `oe doctor` output and the relevant `oe inspect` excerpt.
