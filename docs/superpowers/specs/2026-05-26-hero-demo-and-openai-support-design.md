# Hero Demo + OpenAI Support — Design Spec

Date: 2026-05-26
Status: Approved (brainstorm)
Successor to: `2026-05-25-openexpertise-design.md` (V1)
Position: Post-V1 polish — first deliverable in the path toward "viral OSS" readiness.

## Why this exists

V1 is feature-complete (Plans 1–6, 105/105 tests). What's missing is a packaged narrative that
makes a reader on Hacker News in 30 seconds say "I get it, I want this." The current `hello-tool`
example is a smoke test, not a story. The current `review-branch` example asks the agent to review
`pr_id: "PR-1234"` with **no actual code attached** — the LLM is hallucinating findings.

This spec rebuilds `review-branch` into a hero demo that closes the **evolution loop** — the single
strongest differentiator vs LangGraph / CrewAI / Mastra / Inngest — and ships an OpenAI client so the
demo is not Anthropic-only.

## Goals

1. A 90-second screencast of `review-branch` that shows the experience improving itself across two runs.
2. A root README hero section above the fold that lets a stranger run the demo locally in <2 minutes.
3. OpenAI as a first-class second LLM provider, selectable via `--llm openai` or env-var auto-detect.
4. A `docs/demo-script.md` recording checklist so the GIF/Loom is reproducible.

## Non-goals

- Recording the GIF/Loom asset itself (handed off to the user / a contributor).
- Publishing to npm (separate launch task).
- Building a docs site (separate launch task).
- Auto-applying evolution proposals (V2 feature; manual `git apply` is the V1 contract).
- Supporting additional providers (Gemini, Bedrock, local models) — explicit YAGNI until demand.

## Demo narrative

Six beats, ~90 seconds total:

```
1. cat examples/review-branch/fixtures/add-user-lookup.diff       (10s)
   → small Python diff: new endpoint, contains
     f"SELECT * FROM users WHERE id={user_id}"

2. oe run examples/review-branch --tui                            (20s)
   → TUI shows fan-out: bugs / perf / tests dimensions
     each reviewing the diff
   → findings: "missing null check", "no unit test"
     — SQL injection MISSED
   → risk_score: 0.3

3. oe evolve <run-id>                                              (15s)
   → writes proposal: "Add `security` dimension. Default
     reviewers focus on logic/tests; injection-class
     bugs need a dedicated reviewer."
   → diff block edits tools/list_dimensions.mjs

4. git apply .openexpertise/proposals/<run-id>.diff               (10s)
   → one-line edit:
     + { key: 'security', focus: 'injection / authz / secrets' }

5. oe run examples/review-branch --tui                            (25s)
   → now 4 dimensions; security catches
     "SQL injection in user_lookup"
   → risk_score: 0.85

6. tagline overlay                                                 (10s)
   "the graph improved itself. state persisted. this is OpenExpertise."
```

## Code changes

### A. Rework `examples/review-branch/`

**New files:**

- `examples/review-branch/fixtures/add-user-lookup.diff` — ≈30-line unified diff adding a Python
  Flask endpoint `GET /users/<id>` whose body uses `f"SELECT * FROM users WHERE id={user_id}"`.
  Also missing: a null check on the cursor row, an automated test. Deliberately gives the
  bugs/perf/tests dimensions something legitimate to flag while leaving the injection issue
  outside their stated focus.
- `examples/review-branch/tools/fetch_diff.mjs` — reads the fixture file via `args.path` (default
  `./fixtures/add-user-lookup.diff` relative to the experience dir) and writes `{ diff: string }`
  to state.

**Modified files:**

- `examples/review-branch/experience.yaml`:
  - Add `diff: { type: string }` to `state.schema`.
  - Insert `fetch_diff` as first node in phase `collect`; edges `fetch_diff → seed_dimensions`.
  - All review/verify nodes gain `reads: [diff]` so the resolver substitutes `{{diff}}` in prompts.
- `examples/review-branch/prompts/review.md`:

  ```
  You are reviewing dimension **{{$item.key}}** of a code change.

  Focus ONLY on {{$item.focus}}. Do NOT report issues outside this scope —
  other reviewers handle other dimensions.

  Diff under review:

  ```diff
  {{diff}}
  ```

  Return findings via the structured_output tool. Each finding needs `title` and `severity`
  (low | medium | high).
  ```

- `examples/review-branch/prompts/verify.md` — gets `{{diff}}` injected so the verifier can
  ground itself in the actual code rather than the prior agent's claim.
- `examples/review-branch/prompts/score.md` — unchanged behavior.
- `examples/review-branch/README.md` — rewritten as the on-page demo walkthrough.

**Test update:**

- `e2e/review-branch.e2e.test.ts` — the mocked LLM client must:
  - Return per-dimension `findings` for `bugs`/`perf`/`tests` that exclude SQL injection.
  - Return per-finding `verified_findings` matching the input shape.
  - Return a numeric `risk_score`.
  - Continue to pass with the new `fetch_diff` upstream node (test fixture already has the diff
    file on disk so no mock is needed for the tool).

### B. Add OpenAI LLM client

**New package: `packages/llm-openai/`**

```
packages/llm-openai/
├── package.json             # depends on openai ^4.0, @openexpertise/core (workspace)
├── tsconfig.json
├── src/
│   ├── index.ts             # exports OpenAILLMClient
│   └── client.ts            # the implementation
└── tests/
    └── client.test.ts       # nock-based or msw test of mapping
```

`OpenAILLMClient implements LLMClient` from `@openexpertise/core`. Maps:

- `complete(opts)` → `openai.chat.completions.create({...})`
- `opts.system` → `messages: [{ role: 'system', content: ... }, ...opts.messages]`
- `opts.tools` → OpenAI `tools: [{ type: 'function', function: { name, description, parameters } }]`
- Force structured output when tools provided: `tool_choice: { type: 'function', function: { name } }`
  if exactly one tool, else `tool_choice: 'required'`.
- Map response `choices[0].message.tool_calls[]` back to our `tool_calls: [{ name, input }]`,
  parsing `function.arguments` from string → object.
- `usage` → our `usage: { input_tokens, output_tokens }` shape.
- `stop_reason` mapping: `tool_calls` / `stop` / `length` → preserve as string.

Default model: `gpt-4o-2024-11-20` (most recent gpt-4o snapshot as of cutoff). Configurable via
`opts.model`.

### C. CLI wiring

In `packages/cli/src/`:

- New flag on `oe run` and `oe evolve`: `--llm <anthropic|openai>`.
- Provider selection precedence:
  1. Explicit `--llm` flag.
  2. If only `OPENAI_API_KEY` set → openai.
  3. If only `ANTHROPIC_API_KEY` set → anthropic.
  4. If both set → anthropic (preserves existing default; documented).
  5. If neither → error with a helpful message naming both env vars.
- The lazy-getter proxy that constructs the LLM client (Plan 2) becomes a factory keyed on the
  resolved provider; no eager construction.
- Default models per provider: `claude-sonnet-4-6` for anthropic, `gpt-4o-2024-11-20` for openai
  (the latter must match the `OpenAILLMClient` default in section B).

### D. Root README rewrite

New top-of-file structure (above the fold = first viewport):

```
# OpenExpertise

> [TYPE: pitch] One paragraph: heterogeneous executable graphs that codify expert
> knowledge into runnable, evolving artifacts. The graph re-runs deterministically,
> persists structured state, and the evolution advisor proposes upgrades after each run.

![demo](docs/assets/hero.gif)   ← placeholder until recorded

## 60-second demo

  $ git clone <repo> && cd OpenExpertise && pnpm install && pnpm -r build
  $ export ANTHROPIC_API_KEY=sk-...   # or OPENAI_API_KEY
  $ node packages/cli/dist/bin.js run examples/review-branch --tui

  [transcript of the 6 beats above, lightly trimmed]

## Why OpenExpertise

  - Heterogeneous nodes ...
  - Persistent state ...
  - Evolution loop ...
  → see docs/comparison.md for vs LangGraph / CrewAI / Mastra / Inngest
```

Existing CLI table, architecture section, and Plan history move below the fold.

### E. `docs/demo-script.md`

A recording checklist with:

- Pre-flight: env vars set, repo cleaned, `.openexpertise/` purged, terminal sized to 100×30.
- Per-scene: keystrokes verbatim, expected output snippets to look for, pause/narration cues.
- Failure modes: what to do if Claude unexpectedly catches the SQL injection on Run 1, or doesn't
  propose `security` on the evolve call (Risk #1 and Risk #2 below).

### F. `docs/comparison.md` (stub)

Two-paragraph stub naming the four comparison targets and our differentiators. Placeholder for
fuller treatment in the launch-prep task.

## Risks and mitigations

1. **Real Claude/GPT catches SQL injection under "bugs" focus despite prompt narrowing.**
   - Mitigation: prompt says "Focus ONLY on {focus}. Do NOT report issues outside this scope."
   - Fallback: if both providers leak, swap the missing dimension to `observability` (no logs on
     a state-changing endpoint — much harder to catch incidentally). The narrative is identical.
2. **Real Claude/GPT does not reliably propose `security` from the evolve call.**
   - Mitigation: tighten advisor system prompt to emphasize "what reviewer focus was missing from
     the dimension list, given the diff content."
   - Fallback: demo script documents a pre-recorded canned proposal that the recorder can paste
     into the proposals dir, with a sidebar note that production runs are stochastic.
3. **OpenAI tool-call response shape edge cases** (empty tool_calls, multiple tool_calls, refusal).
   - Mitigation: test coverage for each branch; refusal → return `{ text, tool_calls: [] }` so the
     caller decides (matches Anthropic client behavior).
4. **`oe evolve` requires a run-id from `oe run` output.**
   - Mitigation: verify `oe run` prints run-id on a single line that's easy to copy; tighten the
     log format if not. Already done in Plan 4.

## Out-of-scope (named so we don't drift)

- A Gemini / Bedrock / Ollama / local-model client.
- A docs site (Starlight, Astro, Docusaurus).
- npm publish, GitHub remote setup, launch announcements.
- A web UI / playground.
- Apply-proposal automation (`oe evolve --apply`).
- Updating `experience-creator` skill templates to use the new demo style (separate polish).
- Authentication beyond bearer-token env vars.

## Success criteria

- `pnpm test` green with new tests including OpenAI client + updated review-branch e2e.
- `pnpm typecheck && pnpm lint && pnpm format:check` clean.
- A fresh user with `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY`) can clone, install, build, and run
  the 6-beat demo with zero further setup.
- `docs/demo-script.md` is concrete enough that someone other than the author could record the GIF.
- Root README hero section reads as a pitch, not as project documentation.
