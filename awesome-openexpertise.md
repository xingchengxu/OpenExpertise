# Awesome OpenExpertise

A curated list of OpenExpertise experiences, integrations, and resources.

Submit a PR to add your work. Inclusion criteria: works on `v0.1.0+`, has a README, has at least one e2e or smoke test, and the maintainer is reachable.

---

## Curated experiences (in [`registry.json`](registry.json) — `oe install <name>`)

### Research & analysis

- **[deep-research](examples/deep-research/)** — Multi-vendor research: Claude Code WebSearch + Gemini Google Search → cited synthesis. Bundled.

### Engineering workflows

- **[review-branch](examples/review-branch/)** ★ — Multi-dim code review + verifier + score + advisor evolution. The hero demo. Bundled.
- **[systematic-debugging](examples/systematic-debugging/)** — The superpowers `systematic-debugging` skill as a YAML flow. Bundled.
- **[release-gates](examples/release-gates/)** — License + changelog + coverage + security scan → release gate. Bundled.
- **[issue-triage](examples/issue-triage/)** — Classify → search dupes → conditional dedup → route. Bundled.

### Ideation & strategy

- **[brainstorming](examples/brainstorming/)** — Translates the superpowers `brainstorming` skill. Diverge → cluster → critique → synthesize top 3. Bundled.

### Operations

- **[oncall-runbook](examples/oncall-runbook/)** — Incident triage via `for_each` fan-out across 3 dimensions. Bundled.

### Primitive demos (single-node-kind teaching examples)

- **[hello-tool](examples/hello-tool/)** — Smallest possible flow. No LLM. Bundled.
- **[dataset-aggregate](examples/dataset-aggregate/)** — Load CSV → aggregate. Bundled.
- **[agent-echo](examples/agent-echo/)** — Single agent with structured output. Bundled.
- **[cli-orchestration](examples/cli-orchestration/)** — Two CLI providers in one flow. Bundled.
- **[tri-cli-orchestration](examples/tri-cli-orchestration/)** ★ — Claude → Codex → Gemini in one DAG. Bundled.

---

## Integrations

### LLM providers

- **Anthropic** — via `@openexpertise/node-kinds-agent` (default).
- **OpenAI / OpenAI-compatible** — via `@openexpertise/llm-openai`. Works with Azure OpenAI, self-hosted vLLM, Together AI, Groq, and anything else speaking the OpenAI API.

### CLI agents (`cli-agent` node kind)

- **Claude Code** — `provider: claude-code`
- **Codex CLI** — `provider: codex`
- **Gemini CLI** — `provider: gemini`

### MCP

- **`oe-mcp` server** — exposes 6 OE tools (`oe_validate`, `oe_state`, `oe_inspect`, `oe_run`, `oe_evolve`, `oe_ultra`) to any MCP-aware client. Bidirectional integration with Claude Code / Codex / Gemini sessions.

### Skills

- **Anthropic [SKILL.md](https://github.com/anthropics/skills) packages** — run via the `skill` node kind, or use `@openexpertise/skill-experience-creator` to teach an LLM how to author OE flows.

---

## Talks & writeups

_None yet — be the first._

---

## Templates & starters

- **`oe init <name>`** — bundled scaffolder. Creates a working YAML + tool stub + README.
- **`oe install gh:owner/repo[@ref]`** — install any GitHub repo with an `experience.yaml`.

---

## Community-contributed experiences

_Submit a PR to add yours here AND to [`registry.json`](registry.json)._

The registry entry makes `oe install <name>` work; the awesome-list entry helps people discover it.

Template for a contribution:

```markdown
- **[your-experience](https://github.com/your-handle/your-repo)** — One-sentence description. Tags: tag1, tag2. (Author: @your-handle)
```

---

## Contributing to OpenExpertise itself

See [CONTRIBUTING.md](CONTRIBUTING.md).

Issues, design docs, and roadmap: [/project/roadmap](site/project/roadmap.md) (rendered on the docs site).

---

## License

This list is MIT-licensed, same as OpenExpertise itself. Linked projects use their own licenses — check each before depending on it.
