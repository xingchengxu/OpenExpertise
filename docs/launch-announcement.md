# Launch Announcement Drafts — OpenExpertise v0.1.0

Three drafts for different platforms. Pick one (or all). Edit before posting — the goal here
is an honest first pass, not final copy.

---

## Draft 1: Hacker News (Show HN)

**Title (choose one):**

> Show HN: OpenExpertise – AI-era Makefile, codify expert workflows as YAML graphs
>
> _or_
>
> Show HN: OpenExpertise – Orchestrate Claude Code, Codex, Gemini in one DAG

---

**Body:**

I kept solving the same problem: an LLM agent would do the right thing once, and then
I had no reliable way to get it to do it the same way a second time. No persistent state, no
replay log, no way to evolve the procedure. Every run was improvised from scratch.

OpenExpertise is a TypeScript CLI and runtime that lets you codify those procedures as
version-controlled YAML graphs ("experiences"), run them with deterministic flow + LLM-powered
nodes, and use the LLM again to evolve the graph after each run.

**Why I built it:**
The pain isn't that AI agents are bad — Claude Code and Codex are genuinely useful. The pain
is that they're stateless and improvised. Your code review SOP, your oncall triage runbook, your
release-gate checklist: each of these is implicit knowledge that lives in the head of whoever
is on-call. OpenExpertise is an attempt to make that knowledge explicit, runnable, and
self-improving. It's not replacing the agents — it's the orchestration layer above them.

**How it's different:**

| | OpenExpertise | LangGraph | CrewAI | Anthropic `/workflows` | Claude Code |
|---|---|---|---|---|---|
| Declarative YAML graph | ✓ | Python code | Python code | JS code | — |
| Schema-validated flow | ✓ | — | — | partial | — |
| Persistent SQLite state across runs | ✓ | — | — | — | — |
| Self-evolution advisor | ✓ | — | — | — | — |
| Calls Claude Code / Codex / Gemini | ✓ | — | — | — | (is one) |
| Callable AS MCP tool | ✓ | — | — | — | (consumes) |
| 6 heterogeneous node kinds in one graph | ✓ | (functions) | (agents only) | (agents only) | — |
| TypeScript / Node runtime | ✓ | — | — | ✓ | — |

Caveats: LangGraph has a much larger community, more integrations, and is better suited to
iterative Python agent loops. CrewAI has richer multi-agent role-play patterns. These are
genuinely different shapes of tool. The comparison.md in the repo is more balanced.

**What's in v0.1.0:**

- 6 node kinds in one graph: `tool` (deterministic code), `agent` (LLM + structured output),
  `skill` (SKILL.md packages), `dataset` (file / SQLite / HTTP), `experience` (nested),
  `cli-agent` (delegate to Claude Code / Codex / Gemini subprocesses)
- 11 built-in examples, each with a mocked-LLM e2e test — from `hello-tool` (no API key needed)
  to `deep-research` (multi-vendor LLM search) and `systematic-debugging` (superpowers skill
  translated to YAML)
- 227 passing tests across 58 test files
- MCP server (`oe-mcp`) exposing 6 tools so Claude Code / Codex / Gemini can run experiences
  from inside their own sessions
- Persistent SQLite state + JSONL event log for every run; `oe resume <run-id>` and
  `oe inspect <run-id>` work
- Evolution advisor: `oe evolve <run-id>` reads the run trace and proposes YAML diffs

**Try it:**

```bash
git clone https://github.com/xingchengxu/OpenExpertise && cd OpenExpertise
pnpm install && pnpm -r build
# Hello world — no API key needed:
node packages/cli/dist/bin.js run examples/hello-tool
# Hero demo (needs ANTHROPIC_API_KEY or OPENAI_API_KEY):
node packages/cli/dist/bin.js run examples/review-branch --tui
```

**Limitations (honest):**

- No npm release yet — install from source only; `node packages/cli/dist/bin.js` is the
  entry point, not `oe`
- No UI. CLI and MCP only.
- MCP server is inbound-only today — OE can be called as an MCP tool, but `oe run` doesn't
  yet reach out to arbitrary MCP servers from inside a graph
- The evolution advisor is opinionated (it leans toward "add a missing dimension"); you'll
  want to review its proposals before applying
- No multi-tenant / shared state across different teams or machines; state is local SQLite
- v0.1.0 — not production-grade. Early, feedback wanted.

**Links:**

- Repo: https://github.com/xingchengxu/OpenExpertise
- Comparison vs alternatives: `docs/comparison.md`
- CLI agent integration: `docs/cli-agent.md`
- MCP server: `docs/mcp-server.md`

---

## Draft 2: Reddit r/programming

**Title:** I built an "AI-era Makefile" — codify expert runbooks as versioned YAML graphs that
run LLM agents, persist state, and evolve themselves. v0.1.0 is out.

---

**Body:**

If you've spent time getting an AI coding assistant to do a complex, multi-step task — a
code review, an incident triage, a release checklist — you know the frustrating part isn't
getting it right once. It's that the next time you need the same thing done, you're starting
from zero. The agent improvises again. Any lessons learned from last time are gone.

OpenExpertise is my attempt to fix that. It's a CLI + runtime for TypeScript/Node that lets
you write those procedures as YAML graphs ("experiences"), run them deterministically, and
use the LLM to propose improvements to the graph after each run. It's not a chat assistant
and not a Python agent framework — it's closer to a Makefile that knows how to call Claude
Code and Codex.

**The problem in one sentence:**
Agents do the right thing once and forget. You can't get them to do it reliably the second
time, leave an audit trail, or improve without you re-engineering the prompt from scratch.

**The shape of the solution:**
A YAML graph defines the flow. Six node kinds cover the range from pure-code tools through
LLM agents through CLI subprocess delegation (Claude Code, Codex, Gemini) — mixed in one
graph, validated against a schema. State is persisted to SQLite after every node. After a
run, `oe evolve <run-id>` reads the event log and proposes a YAML diff.

**Two concrete examples that ship with v0.1.0:**

_deep-research_: A 7-node DAG that takes a research question, decomposes it into
sub-questions, fans out parallel searches to Claude Code (WebSearch) and Gemini (Google
Search), extracts citations, and cross-references. Multi-vendor search in one graph.

![oe run deep-research --tui output](../docs/assets/deep-research-tui.png)

_systematic-debugging_: The Anthropic superpowers `systematic-debugging` skill translated
directly into a YAML flow — capture symptoms → hypothesize → verify each hypothesis via
Claude Code (fan-out) → localize → propose fix → verify fix. Ships with a self-contained
buggy repo fixture (off-by-one in `validateUserId`) you can run it against immediately.

Both examples ship with mocked-LLM e2e tests so you can validate the structure without API
keys.

This is v0.1.0 — early, source-install only (npm publish coming), no UI yet. The comparison
to LangGraph / CrewAI / Anthropic's own workflows tool is in `docs/comparison.md` in the
repo — I've tried to be honest about where those tools are better fits.

Repo: https://github.com/xingchengxu/OpenExpertise

Happy to answer questions in the comments. Especially curious whether the evolution advisor
framing resonates, or whether it sounds like a gimmick.

---

## Draft 3: X/Twitter Thread (8 tweets)

**1/8**

Show: OpenExpertise v0.1.0 — an AI-era Makefile. Write your expert runbooks as YAML
graphs. Run them with deterministic flow + LLM nodes. Let the LLM evolve the graph.
github.com/xingchengxu/OpenExpertise

**2/8**

What makes it different: the graph structure is fixed YAML, schema-validated. LLMs only
fill the gaps inside individual nodes — they can't rewrite the flow at runtime. After the
run, `oe evolve` reads the trace and proposes graph upgrades as git-apply-ready diffs.

**3/8**

An experience looks like this:

```yaml
graph:
  nodes:
    - id: triage
      kind: agent
      prompt: "Classify this issue: {{title}}"
      writes: [category]
    - id: route
      kind: tool
      impl: ./tools/route.mjs
      reads: [category]
```

6 node kinds. Validated before the first node runs.

**4/8**

The `cli-agent` node kind delegates a step to a CLI agent subprocess. Three providers
ship in v0.1.0:

- `claude-code` (`claude -p`)
- `codex` (`codex exec`)
- `gemini` (`gemini --prompt`)

State flows between them via SQLite. One graph, three vendors.

**5/8**

The headline example: `deep-research`. A research question → decompose → parallel searches
via Claude Code WebSearch AND Gemini Google Search (concurrency: 2) → citations →
cross-reference synthesis. Multi-vendor search in one DAG.
examples/deep-research/ ships with a mocked e2e test.

**6/8**

Every run writes a JSONL event log + SQLite state. After a run:

- `oe inspect <run-id>` — replay the event log chronologically
- `oe resume <run-id>` — re-run from the last successful node (cache replay)
- `oe evolve <run-id>` — advisor proposes YAML diffs from the trace

The review-branch demo: Run 1 misses SQL injection. Advisor proposes "add security
reviewer." Run 2 catches it.

**7/8**

You can also run OE experiences FROM Claude Code (or Codex, Gemini) via the MCP server:

```
claude mcp add openexpertise -- node $PWD/packages/mcp-server/dist/bin.js
```

6 MCP tools: oe_run, oe_validate, oe_state, oe_inspect, oe_evolve, oe_ultra.
External agents can trigger full OE pipelines from inside their own sessions.

**8/8**

v0.1.0 is out. Source install only for now (npm publish next). 227 tests, 11 examples,
14 packages, MIT license. Feedback very welcome — especially on the evolution advisor
and the cli-agent integration.

github.com/xingchengxu/OpenExpertise
