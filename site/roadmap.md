---
title: Roadmap
description: What's in v0.1, what's coming in v0.2 + v0.3, and what's deliberately deferred to "after public traction".
---

# Roadmap

What's shipped, what's coming, and what's deliberately not coming. Updated whenever direction changes — date-stamped on every entry.

## Where we are (v0.1.1, 2026-05-28)

Shipped in 0.1.1 (patch over 0.1.0):

- **`oe demo`** — preview 4 bundled examples without an API key. The `review-branch` demo ships with a built-in advisor evolution proposal that demonstrates the author → run → evolve loop in 60 seconds.
- **`oe init --template <name>`** — 4 starter shapes (`tool-only` / `agent` / `cli-agent` / `full-pipeline`) instead of hello-world only.
- **`oe submit`** — zero-friction registry submission. Detects your GH remote, generates the registry entry, opens a pre-filled issue.
- **`mcp-resource` dataset source** — actually wired to a runtime (was declared in schema but threw at runtime in 0.1.0). Spawns MCP servers via stdio per `mcp.json` config.
- **Ecosystem positioning page** at `/ecosystem` covering MCP / Skills / /workflows / autonomous agents.
- **Cookbook** with 10 self-contained recipes.

Shipped in 0.1.0 (foundation):

- **Six node kinds** — `tool` / `agent` / `skill` / `dataset` / `experience` / `cli-agent`
- **Two schedulers** — Sequential (default), Parallel (`runtime.concurrency: N`)
- **State store** — better-sqlite3 blackboard, 3 merge strategies (`set_once` / `last_wins` / `array_append`)
- **Event log** — JSONL append-only, EventBus pub-sub, crash-safe `appendFileSync`
- **CLI** — `init`, `validate`, `run`, `resume`, `inspect`, `state`, `reset-state`, `evolve`, `diff`, `ultra`, `doctor`, `install`, `registry`, `installed`, `submit` (new in 0.1.1), `demo` (new in 0.1.1)
- **Evolution advisor** — `oe evolve <run-id>` proposes `add-node` / `tune-param` / `add-dataset-case` operations as `git apply`-ready diffs
- **`oe ultra` LLM authoring** — single-keyword YAML synthesis with tool stubs + prompt files
- **MCP server** — `oe-mcp` exposes 7 tools for Claude Desktop / Cursor / other MCP clients
- **TUI dashboard** — htop-grade live render with per-node activity, tokens, status glyphs
- **12 examples** — all with mocked-LLM e2e tests
- **292 tests passing across 65 test files** (0.1.1 figure; 0.1.0 shipped with 265)
- **Multi-LLM providers** — Anthropic + OpenAI SDKs; OpenAI-protocol redirect for vLLM/Ollama/LM Studio
- **cli-agent providers** — Claude Code, Codex, Gemini subprocess integration with `--skip-trust` Gemini handling
- **VitePress docs site** with examples gallery and GitHub Pages auto-deploy
- **Experience registry foundation** — `registry.json`-driven `oe install <name>` for community-published experiences

## Coming in v0.2 (target: 2026-Q3)

Higher-priority items shaping V2. Each has a one-line rationale and a confidence (high / medium / low).

### Open NodeKind union (high confidence)

Today `NodeKind` is a closed TS enum — third-party dispatchers need to fork the schema. V2 will expose it as a string and let dispatchers self-declare. Unblocks the ecosystem play.

**Why now:** users have asked for plugin-style dispatchers (a `webhook` kind, a `temporal` kind, etc.). The path forward is to ship the pattern in OE first, then formalize the registration contract.

### Streaming LLM output (medium)

Today the agent dispatcher waits for the full response. V2 will stream tokens as they arrive, with a new `node.token-stream` event piped into the TUI.

**Why now:** users running long generations want feedback; the TUI already has the rendering hooks needed.

**Risk:** AJV validation happens on the final response, so streaming + structured-output need careful handling. We'll likely ship streaming for free-form `cli-agent` text first, then add it to `agent` once we've solved the schema-mid-stream UX.

### Pipeline + Loop parallelism (high)

V1 pipelines and loops run sequentially even when `runtime.concurrency > 1`. V2 will parallelize the outer pipeline iterations + loop iterations where data-flow allows.

**Why now:** users have reported the limitation explicitly. The fix is well-scoped.

### Cross-run evolution (medium)

Today `oe evolve` looks at one run. V2 will support `oe evolve --runs <run1>,<run2>,...` for advisor analysis across multiple runs to surface stable patterns vs. one-off blips.

**Why now:** the most-asked feature in user feedback. Implementation is mostly prompt engineering on top of the existing advisor.

### Prompt rewriting (low)

V1's advisor proposes `add-node` / `tune-param` / `add-dataset-case` but never rewrites a prompt's markdown body. V2 may add `rewrite-prompt` as a fourth operation.

**Why deferred:** prompt rewriting is a different LLM task than graph evolution; we want to ship cross-run evolution first and see if prompt rewrites are still needed afterward.

### `oe inspect --html` (medium)

Today `oe inspect` renders to terminal. V2 will also produce a self-contained HTML report (Mermaid graph + timeline) you can pin to a PR.

**Why now:** common ask from teams running OE in CI.

### Plugin-friendly LLMClient (medium)

V1 supports Anthropic + OpenAI through hard-coded adapters. V2 will add a clearer `LLMClient` interface so adding `gemini-api` (the SDK, not the CLI), `mistral`, `cohere`, etc. is a 50-line module.

**Why now:** the CLI-side is already vendor-flexible via cli-agent; the SDK side should match.

## Deferred to v0.3+ ("after public traction")

These have been considered and explicitly pushed off:

- **Hosted execution** — running OE flows on our infrastructure. Currently zero plan to do this; OE is positioned as a library you self-host. We may revisit if enterprise users specifically request hosted billing.
- **Multi-region distributed scheduler** — V1 runs in one process. Sharding across machines isn't on the roadmap; users wanting this can layer OE on top of Inngest/Temporal.
- **Web UI for authoring** — `oe ultra` writes YAML well; we'd rather invest in better LLM authoring than a drag-drop builder.
- **Auto-applying evolution proposals** — explicit anti-feature. The contract is "advisor proposes, human applies via `git apply`". Auto-apply would break the trust contract.
- **Tool isolation / sandboxing** — tools are JS files in your repo running in your process. Sandboxing is your concern (Docker, Firecracker, etc.). We won't ship a sandbox.

## Open questions (we don't know the answer yet)

- **Pricing for hosted features.** None planned today. If we ever ship hosted (registry browsing, central evolution proposal review, etc.), pricing TBD.
- **Trademark / governance.** Currently MIT-licensed, single-maintainer. If usage takes off we'll formalize governance (steering committee, contributor ladder, etc.).
- **Long-tail provider support.** Adding every LLM provider is anti-scope. Anthropic + OpenAI cover the SDK side; the OpenAI-compatible redirect covers vLLM/Ollama/local. For exotic providers, the answer is probably "wrap them in an `OpenAI`-compatible proxy."

## Release cadence

- **v0.1.x** (current series) — patch releases for bug fixes, new examples, doc improvements. No breaking changes.
- **v0.2.0** (target Q3 2026) — first significant feature drop. May contain breaking changes to the dispatcher interface and the `NodeKind` type — semver-major signal.
- **v0.x** in general — pre-1.0. Schema-level breaking changes possible at minor-version bumps. Marked clearly in CHANGELOG.
- **v1.0.0** — when the schema is stable enough that we can promise no breaking changes to `experience.yaml` shape across minors.

## How to influence the roadmap

1. **Open an issue** at [github.com/xingchengxu/OpenExpertise/issues](https://github.com/xingchengxu/OpenExpertise/issues) — describe your use case, what's blocking, what shape an ideal API would have.
2. **Ship an experience to the registry** — adds pressure for missing primitives (every external experience is signal about what's missing).
3. **Write a custom dispatcher** — if you fork the `NodeKind` type to add a kind, please tell us. That data shapes the V2 plugin design.

## How this page is maintained

Every entry has the date it was added or last revised. When something ships, it moves up to "Where we are". When direction changes, the entry is rewritten (not silently deleted) with a strikethrough on the old plan.

This page is the single source of truth for "what's coming". If it's not here, it's not on the near-term roadmap.

---

→ See the [CHANGELOG](https://github.com/xingchengxu/OpenExpertise/blob/main/CHANGELOG.md) for what shipped per release.
→ Want to discuss a use case before opening an issue? Start with [Use Cases](/use-cases/) and [Compare](/compare/).
