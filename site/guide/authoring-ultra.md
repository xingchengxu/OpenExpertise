---
title: Authoring with oe ultra
description: "A 30-minute walkthrough — go from a one-sentence description to a fully scaffolded, tested OpenExpertise flow with one keyword. The complement to 'Your first experience' — same destination, half the YAML."
---

<div v-pre>

# Authoring with oe ultra

By the end of this 30-minute walkthrough you'll have:

- A complete experience scaffolded by `oe ultra` from a one-sentence English description
- All `// TODO:` stubs filled with real logic
- A working run against real PRs in a mocked fixture
- A mocked e2e test in CI
- A `git apply`-ready evolution proposal from the advisor

This is the companion to [Your first experience](/guide/first-experience). Same destination — a tested, registry-submittable flow — but **half the YAML you write by hand**, because `oe ultra` writes the scaffolding for you.

::: tip When `oe ultra` is the right tool
Use `oe ultra` when you can describe your problem in 1-2 sentences and the shape is roughly known.
Use `oe init --template <name>` + manual editing when you have an exact YAML in mind already.
Both produce the same kind of artifact.
:::

---

## Step 1 — Describe the problem in one sentence (2 min)

The whole input to `oe ultra` is a natural-language task description. Get it tight before invoking:

> When a contributor opens their first PR, fetch the PR diff and their previous merged PR count, craft a personalized welcome message (different tone for first-time vs returning contributors), and post it as a PR comment.

This sentence captures: the trigger (PR open), the inputs (diff, merged-count), the LLM work (write personalized welcome), the conditional (first-time vs returning), and the output (PR comment).

Three node kinds: a **tool** to fetch the PR diff and contributor history, an **agent** to craft the welcome, and a **tool** to post the comment. Total: 5 nodes (the fetch splits into two tools for diff vs. history, giving you clean `reads:` / `writes:` contracts on each).

::: warning The advisor will help, but...
A vague description (`"do PR things"`) gets you a vague scaffold. Spend 90 seconds making the sentence concrete. The cost-benefit is huge — Phase 1 analysis can only sketch nodes as well as your description implies them.
:::

---

## Step 2 — Invoke `oe ultra` (3 min)

```bash
export ANTHROPIC_API_KEY=sk-ant-...   # or OPENAI_API_KEY=...
oe ultra "When a contributor opens their first PR, fetch the diff and their previous merged PR count, craft a personalized welcome (different tone for first-time vs returning contributors), and post it as a PR comment."
```

`oe ultra` runs a two-phase LLM pipeline:

**Phase 1 — Analysis.** The LLM reads your description and returns a structured plan: a slug, an ordered list of phases, the SQLite blackboard schema (`state_fields`), one `node_sketch` per step (each tagged with a kind and purpose), and up to 5 `open_questions`. The LLM is instructed to use `tool` for everything deterministic and `agent` only for genuine judgment. See [docs/ultraexpertise.md](https://github.com/xingchengxu/OpenExpertise/blob/main/docs/ultraexpertise.md) for the full analysis schema.

**Phase 2 — Synthesis.** A second LLM call receives the analysis plan and materializes the full `experience_yaml` string, a `files[]` array (every supporting file with its path and content), and `next_steps[]`. Generated tool stubs include a `// TODO:` comment marking the real integration point — the stub returns fixture data so `oe run` doesn't crash before you wire the real thing.

**Phase 3 — Materialization.** The writer creates the draft directory under `.openexpertise/drafts/<slug>/`, checks all paths for traversal attacks, writes every file, and runs `oe validate` against the result.

After ~15 seconds you'll see output like:

```
slug:       pr-welcome-bot
draft dir:  .openexpertise/drafts/pr-welcome-bot/
validation: PASS

phases:  collect → compose → deliver
nodes:   fetch_diff(tool)  fetch_contributor_history(tool)  compose_welcome(agent)  post_comment(tool)

open questions:
  1. Which GitHub token env var name should fetch_diff use? (e.g. GITHUB_TOKEN)
  2. Should the "returning contributor" threshold be >1 merged PR or >3?

next steps:
  oe run .openexpertise/drafts/pr-welcome-bot
  mv .openexpertise/drafts/pr-welcome-bot examples/pr-welcome-bot
```

The draft is never auto-promoted. `mv` is a deliberate user decision.

---

## Step 3 — Read what `oe ultra` generated (5 min)

```bash
cd .openexpertise/drafts/pr-welcome-bot
ls -R
# experience.yaml
# prompts/compose_welcome.md
# tools/fetch_diff.mjs
# tools/fetch_contributor_history.mjs
# tools/post_comment.mjs
# next_steps.md
# README.md
```

Walk through each file before touching anything:

**`experience.yaml`** — The complete graph declaration. Ultra auto-generated the state schema, the node declarations with `reads:` / `writes:` contracts, and the edges. It looks roughly like:

```yaml
name: pr-welcome-bot
description: Personalized PR welcome bot for first-time and returning contributors.
version: 0.1.0

state:
  schema:
    pr_diff: { type: string }
    merged_pr_count: { type: number }
    welcome_message: { type: string }
    comment_url: { type: string }

phases:
  - { id: collect }
  - { id: compose }
  - { id: deliver }

graph:
  nodes:
    - id: fetch_diff
      kind: tool
      phase: collect
      impl: ./tools/fetch_diff.mjs
      writes: [pr_diff]
    - id: fetch_contributor_history
      kind: tool
      phase: collect
      impl: ./tools/fetch_contributor_history.mjs
      writes: [merged_pr_count]
    - id: compose_welcome
      kind: agent
      phase: compose
      prompt: ./prompts/compose_welcome.md
      reads: [pr_diff, merged_pr_count]
      schema:
        type: object
        required: [welcome_message]
        properties:
          welcome_message: { type: string }
      writes: [welcome_message]
    - id: post_comment
      kind: tool
      phase: deliver
      impl: ./tools/post_comment.mjs
      reads: [welcome_message]
      writes: [comment_url]
  edges:
    - { from: fetch_diff, to: compose_welcome }
    - { from: fetch_contributor_history, to: compose_welcome }
    - { from: compose_welcome, to: post_comment }
```

Note the two parallel tool nodes at the start — `fetch_diff` and `fetch_contributor_history` both write into state before `compose_welcome` reads both. The scheduler sees no edge between the two fetch nodes and runs them concurrently.

**`prompts/compose_welcome.md`** — A generated prompt that reads `{{pr_diff}}` and `{{merged_pr_count}}` from state and asks the LLM to write a personalized message. It will need fine-tuning but the shape is right.

**`tools/fetch_diff.mjs`** — Each tool stub looks like this:

```js
// tools/fetch_diff.mjs
// TODO: replace with a real Octokit call
// e.g. const { data } = await octokit.pulls.get({ owner, repo, pull_number })
export default async function fetchDiff() {
  return {
    state_delta: {
      pr_diff: `diff --git a/README.md b/README.md\n+# Hello\n-# World`,
    },
  }
}
```

The `// TODO:` marker is where the real integration goes. Until then, the stub returns fixture data — the flow is runnable from minute one.

**`next_steps.md`** — Ultra writes a guide telling you the exact order to fill the TODOs: fill `fetch_diff` first (it feeds the agent), then `fetch_contributor_history`, then verify the prompt, last wire `post_comment`.

---

## Step 4 — Sanity-check the scaffold (2 min)

```bash
oe validate .
# INFO: experience valid
```

Validation passing means the structure is sound: every `reads:` field is declared in `state.schema`, every `writes:` field is declared too, every edge references real node IDs. It does **not** mean the tools do anything useful — the stubs return fixtures. Fix any schema violations now, before spending tokens.

If you see an error like `writes field 'comment_url' not declared in state.schema`, the synthesizer made a typo — add the field to the schema manually. These are rare but worth catching before the first run.

---

## Step 5 — Run the scaffolded flow with stubs (3 min)

```bash
oe run . --tui
```

The TUI dashboard shows each phase as it executes. `fetch_diff` and `fetch_contributor_history` both complete in milliseconds (they're returning fixture strings). Then `compose_welcome` fires a real LLM call against the fixture diff — you watch the tokens stream in. Then `post_comment` logs the message to the console (it's a stub).

After the run:

```bash
oe state welcome_message
# → "Hey @alice! Thanks for opening your first PR — really excited to see
#    this contribution! The diff touches the scheduler retry logic. One
#    suggestion: add a test for the 429 case you're fixing..."
```

The agent's output against fixture data is real. This is enough to know if the prompt is in the right ballpark. The welcome reads generically right now because the diff is a one-line fixture — but the structure (personalized opener, diff reference, one suggestion) is correct.

---

## Step 6 — Iterate the prompt (3 min)

Open `prompts/compose_welcome.md`. The generated version looks roughly like:

```markdown
You are writing a personalized welcome comment for a GitHub PR.

PR diff:
{{pr_diff}}

Contributor's merged PR count: {{merged_pr_count}}

Write a welcome_message via structured_output.

Rules:

- If merged_pr_count is 0, this is their first PR. Be extra warm and encouraging.
- If merged_pr_count >= 1, they're a returning contributor. Be warm but brief.
- Reference one specific thing from the diff.
- Keep it under 150 words.
```

The shape is right but the voice is flat. Edit it:

```markdown
You are writing a personalized welcome comment for a GitHub PR.

PR diff:
{{pr_diff}}

Contributor's merged PR count: {{merged_pr_count}}

Write a welcome_message via structured_output.

Rules:

- If merged_pr_count is 0, this is their first PR. Be warm and encouraging —
  not saccharine. Acknowledge that opening a first PR takes courage.
  Example opener: "Really glad to see this — welcome to the contributor list!"
- If merged_pr_count >= 1, be warm but brief. Skip the encouragement preamble.
  Example opener: "Nice catch — good to see you back."
- Reference one specific file or function name from the diff (not a generic summary).
- Keep it under 120 words. No markdown headers. End with an offer to help.
```

Rerun:

```bash
oe run . --tui
oe state welcome_message
```

Compare the two outputs. The second should be noticeably warmer for first-timers and more efficient for returners.

::: tip The fast feedback loop
Tool stubs returning fixture data is what makes this loop tight. You're iterating prompts at LLM-API-latency — typically 2-5 seconds per run. You are NOT waiting on GitHub API auth, Octokit setup, or rate limits. Fill the real integrations last.
:::

---

## Step 7 — Fill in the real tool integrations (5 min)

Open `tools/fetch_diff.mjs`. The `// TODO:` marker is where the real call goes. For this tutorial, replace the stub with a hardcoded sample fixture that mimics what Octokit returns, so the run is reproducible without a GitHub token:

```js
// tools/fetch_diff.mjs
// Tutorial: hardcoded fixture for 3 sample PRs.
// Production: replace with:
//   import { Octokit } from '@octokit/rest'
//   const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN })
//   const { data } = await octokit.pulls.get({ owner, repo, pull_number })
//   return { state_delta: { pr_diff: data.diff_url } }

export default async function fetchDiff() {
  return {
    state_delta: {
      pr_diff: `diff --git a/packages/core/src/scheduler.ts b/packages/core/src/scheduler.ts
--- a/packages/core/src/scheduler.ts
+++ b/packages/core/src/scheduler.ts
@@ -42,6 +42,10 @@ export class Scheduler {
+  private maxRetries = 3
+
+  async retryWithBackoff(fn: () => Promise<void>, attempt = 0): Promise<void> {
+    try { await fn() } catch (e) {
+      if (attempt >= this.maxRetries) throw e
+      await sleep(Math.pow(2, attempt) * 100)
+      return this.retryWithBackoff(fn, attempt + 1)
+    }
+  }
`,
    },
  }
}
```

Same for `tools/fetch_contributor_history.mjs` — replace the stub to return a realistic count:

```js
// tools/fetch_contributor_history.mjs
// Production: call GitHub REST API to count merged PRs by author.
// Tutorial: returns a fixture value. Change to 0 to test first-time flow,
// change to 3 to test returning-contributor flow.

export default async function fetchContributorHistory() {
  return { state_delta: { merged_pr_count: 0 } }
}
```

For `tools/post_comment.mjs`, leave the `console.log` mock in place — in production, swap it for `octokit.issues.createComment(...)`. The state still records `comment_url` so the run is fully traceable:

```js
// tools/post_comment.mjs
export default async function postComment(input) {
  const message = input._state?.welcome_message
  // Production: await octokit.issues.createComment({ owner, repo, issue_number, body: message })
  console.log('[mock] posting PR comment:', message)
  return { state_delta: { comment_url: 'https://github.com/example/pr/1#comment-mock' } }
}
```

---

## Step 8 — Run end-to-end (3 min)

```bash
oe run . --tui
```

This time all three tools return real-shaped data. The TUI shows `fetch_diff` and `fetch_contributor_history` completing concurrently in the collect phase, `compose_welcome` streaming tokens in the compose phase, `post_comment` logging the mock in the deliver phase.

Capture the run ID and inspect the full event trail:

```bash
oe state run_id
# → run_2026_05_28_143012_pr-welcome-bot

oe inspect run_2026_05_28_143012_pr-welcome-bot
# → events sorted by timestamp:
#   [collect] fetch_diff:complete  (12ms, 0 tokens)
#   [collect] fetch_contributor_history:complete  (8ms, 0 tokens)
#   [compose] compose_welcome:start  → complete  (2341ms, 312 tokens)
#   [deliver] post_comment:complete  (3ms, 0 tokens)
#
# state diff after compose_welcome:
#   welcome_message: "Really glad to see this — welcome to the contributor list!
#     The retry-with-backoff addition to the scheduler is a solid fix for the
#     429 problem. One question: should maxRetries be configurable? Happy to
#     help if you'd like to add that. Welcome aboard!"
```

The JSONL trail is the post-mortem artifact. Every token spent, every state delta, every timing — all queryable later.

---

## Step 9 — Write the mocked e2e test (3 min)

The part that separates a one-off script from a production-grade OE experience: a mocked-LLM end-to-end test that runs in CI in under a second.

Copy the pattern from the canonical reference:

```bash
cp e2e/your-first-experience.e2e.test.ts e2e/pr-welcome-bot.e2e.test.ts
```

Edit the copy to match the PR welcome bot's shape. The key pieces are the `ScriptedLLM` router (routes by prompt substring, no network) and the assertions:

```typescript
// e2e/pr-welcome-bot.e2e.test.ts
class ScriptedLLM implements LLMClient {
  async complete(opts: LLMCompleteOpts) {
    const prompt = opts.messages[0]?.content ?? ''

    if (prompt.includes('personalized welcome comment')) {
      return {
        text: '',
        tool_calls: [
          {
            name: 'structured_output',
            input: {
              welcome_message:
                'Really glad to see this — welcome to the contributor list! ' +
                'The retry-with-backoff addition looks solid. Welcome aboard!',
            },
          },
        ],
      }
    }

    return { text: 'unknown prompt' }
  }
}

describe('pr-welcome-bot end-to-end (mocked LLM)', () => {
  it('fetches diff + history, composes welcome, posts comment', async () => {
    // ... setup, runExperience, assertions ...
    expect(result.status).toBe('success')
    expect(result.finalState.pr_diff).toContain('retryWithBackoff')
    expect(result.finalState.merged_pr_count).toBe(0)
    expect(result.finalState.welcome_message).toContain('welcome')
    expect(result.finalState.comment_url).toContain('github.com')
  })
})
```

See [`e2e/your-first-experience.e2e.test.ts`](https://github.com/xingchengxu/OpenExpertise/tree/main/e2e/your-first-experience.e2e.test.ts) for the full scaffolding pattern (imports, `ScriptedLLM`, temp directory setup, `runExperience` call).

---

## Step 10 — Evolve after a few runs (1 min)

After 5+ real runs against live PRs, ask the advisor what it noticed:

```bash
oe evolve run_2026_05_28_143012_pr-welcome-bot
```

A plausible advisor proposal for this flow after real runs:

```
Proposal: add a `tone_check` agent after `compose_welcome`
Rationale: across 12 runs, 3 welcome messages scored below the
"warm but not saccharine" threshold implied by the prompt. A second
agent reading compose_welcome's output and scoring warmth (1-5) would
flag borderline cases before post_comment fires.

New node:
  id: tone_check
  kind: agent
  phase: compose
  prompt: ./prompts/tone_check.md
  reads: [welcome_message, merged_pr_count]
  schema: { type: object, required: [tone_score], properties: { tone_score: { type: number } } }
  writes: [tone_score]
Edge: compose_welcome → tone_check → post_comment (with when: '$.tone_score >= 3')

Estimated cost increase: +0.8 cents per run (one extra 200-token call).
```

The proposal is emitted as a `git apply`-ready diff. Review it, apply it, run again. The author → run → evolve loop is the most important pattern in OpenExpertise — it turns a one-time scaffold into a self-improving system.

---

## What you learned

| Concept                                | Where you used it                                                                                                                      |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Two-phase ultra pipeline**           | Phase 1 analysis ("what's the shape?") then Phase 2 synthesis ("write all the files")                                                  |
| **Tool stubs with `// TODO:` markers** | Scaffold is runnable from minute one — stubs return fixture data until you wire real integrations                                      |
| **Fixture-first development**          | Write and iterate the LLM logic against fake data; swap to real integrations last                                                      |
| **Concurrent collect phase**           | `fetch_diff` and `fetch_contributor_history` run in parallel — no explicit concurrency config needed when there's no edge between them |
| **`oe inspect` JSONL trail**           | Every run produces a queryable event log: timings, tokens, state diffs                                                                 |
| **ScriptedLLM pattern**                | Mocked e2e test routes by prompt substring — zero tokens, runs in CI                                                                   |
| **Author → run → evolve loop**         | `oe ultra` scaffolds, `oe run` exercises, `oe evolve` proposes the next improvement                                                    |

---

## When NOT to use `oe ultra`

- **You have a specific YAML in mind already.** `oe init --template <name>` + manual editing is faster — you skip the two LLM calls and get exactly what you pictured.
- **You're learning the framework.** `oe init --template full-pipeline` and reading the generated YAML teaches more than a black-box scaffold. The [Your first experience](/guide/first-experience) walkthrough is designed for this.
- **The shape is exotic.** Multi-loop, nested-experience, advanced control flow — ultra is best at the "standard collect → process → deliver" shape. Unusual graph structures need a human hand.

---

## Next steps

- [Your first experience](/guide/first-experience) — same destination via manual authoring; teaches the YAML from first principles
- [Cookbook](/cookbook/) — 10 patterns for when you're ready to compose fan-out, retry, nested experiences
- [Dispatchers](/concepts/dispatchers) — how each node kind gets dispatched under the hood
- [docs/ultraexpertise.md](https://github.com/xingchengxu/OpenExpertise/blob/main/docs/ultraexpertise.md) — the technical reference for the two-phase pipeline, analysis schema, and materialization logic

</div>
