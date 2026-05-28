---
title: Your first experience
description: A 30-minute walkthrough from zero to a tested, registry-submittable OpenExpertise flow. We build a weekly engineering digest together.
---

<div v-pre>

# Your first experience

By the end of this 30-minute walkthrough you will have:

- A working OpenExpertise experience you authored yourself
- A mocked end-to-end test that runs in CI with zero LLM spend
- An experience shaped like the most common real-world OE pattern
- (Optional) Your name in the curated registry

We build a **weekly engineering digest**: it reads merged PRs from a fixture, classifies each one in parallel, synthesizes a 5-bullet summary, and writes a Markdown report. Four node kinds, four phases, real LLM calls. The full reference implementation lives at [`examples/your-first-experience`](https://github.com/xingchengxu/OpenExpertise/tree/main/examples/your-first-experience).

::: tip Prereqs

- `npm install -g @openexpertise/cli` (Node 20+)
- `oe doctor` shows green (ANTHROPIC_API_KEY or OPENAI_API_KEY set)
- ~30 minutes
  :::

---

## Step 1 — Pick a problem worth codifying (3 min)

Before any YAML, ask: **does this problem recur?** OpenExpertise pays off when:

- The process runs at least weekly
- It has 3+ steps that mix deterministic code (load data, save a file) with LLM judgment (classify, summarize, decide)
- You want the output to look the same every run — same structure, comparable quality

Our running example — "weekly engineering digest" — passes all three. Every Monday-morning manager wants to know what shipped. The process has clear deterministic bookends (fetch PRs, write report) and an LLM-judgment middle (classify each PR, synthesize into bullets). Same shape every week.

> Even if you're not an engineering manager, this pattern is identical for almost every "recurring multi-step report": customer feedback digest, support-ticket summary, changelog draft, incident retrospective.

---

## Step 2 — Sketch the graph on paper (3 min)

Before writing YAML, draw boxes:

```
load_prs (tool)
   ↓
classify_pr (agent, for_each over each PR, concurrency 3)
   ↓
synthesize_digest (agent, reads all classifications)
   ↓
write_digest (tool, writes ./out/digest.md)
```

Four nodes. Each has one job. The fan-out happens at `classify_pr` — one LLM call per PR, up to 3 in parallel. Everything else is sequential.

This is the most common shape in real-world OE flows: **load → fan-out → synthesize → save**. If you internalize this shape, you can write 80% of flows almost on autopilot.

---

## Step 3 — Scaffold the directory (2 min)

```bash
oe init weekly-digest --template full-pipeline
cd weekly-digest
```

`--template full-pipeline` gives you a 4-node skeleton with the right shape. You'll edit it heavily, but starting from a validated working flow is faster than from a blank file.

Look at what was created:

```bash
ls -R
# experience.yaml
# prompts/classify.md  tools/load_input.mjs  tools/save_output.mjs
# fixtures/input.txt   README.md              package.json
```

You'll repurpose most of these files. The key one is `experience.yaml` — that's your graph declaration.

---

## Step 4 — Define the data shape (2 min)

Open `experience.yaml`. The `state.schema` block declares every field the graph touches. Replace it with the four fields our digest needs:

```yaml
state:
  schema:
    prs: { type: array, items: { type: object } }
    classified: { type: array, items: { type: object }, merge: array_append }
    digest: { type: object }
    digest_path: { type: string }
```

**`merge: array_append`** on `classified` is the key line. When `classify_pr` runs as a fan-out (one call per PR), each LLM response writes one entry into `classified`. `array_append` tells the scheduler to concatenate those entries rather than overwrite each other — 8 PRs in → 8 entries accumulated.

Without `merge: array_append`, the last PR to finish would overwrite all the others' results. Every fan-out that accumulates results needs this.

---

## Step 5 — Wire the loader (3 min)

Create a fixture file with your PRs. Copy the sample fixture from the reference implementation — 8 PRs that cover all five categories:

```bash
mkdir -p fixtures
```

Create `fixtures/recent_prs.json`:

```json
[
  {
    "number": 142,
    "title": "feat(scheduler): exponential backoff on 429 responses",
    "author": "alice",
    "merged_at": "2026-05-22T10:14:00Z",
    "body": "Adds retry-with-backoff to the LLM client. Closes #138."
  },
  {
    "number": 143,
    "title": "fix(cli): oe state crashes when field is undefined",
    "author": "bob",
    "merged_at": "2026-05-22T15:02:00Z",
    "body": "Use optional chaining on the state lookup path. Adds regression test."
  },
  {
    "number": 144,
    "title": "chore: bump @anthropic-ai/sdk to 0.42.0",
    "author": "alice",
    "merged_at": "2026-05-23T09:31:00Z",
    "body": "Routine upgrade. Tests still pass."
  },
  {
    "number": 145,
    "title": "docs: README hero rewrite with animated demo",
    "author": "carol",
    "merged_at": "2026-05-23T14:50:00Z",
    "body": "Replaces the static screenshot with an asciinema-generated SVG. Adds CI badge."
  },
  {
    "number": 146,
    "title": "refactor(dispatchers): extract common timeout handling",
    "author": "bob",
    "merged_at": "2026-05-24T11:11:00Z",
    "body": "All three dispatcher kinds had duplicated 429-retry code. Lifted into core/retry.ts."
  },
  {
    "number": 147,
    "title": "feat(cli): oe inspect --html generates a self-contained report",
    "author": "dave",
    "merged_at": "2026-05-24T16:42:00Z",
    "body": "Mermaid graph + timeline + state diff in a single .html. Pin to a PR."
  },
  {
    "number": 148,
    "title": "fix(tui): activity feed scrolls past the last event",
    "author": "alice",
    "merged_at": "2026-05-25T08:20:00Z",
    "body": "Off-by-one in the Ink renderer's scroll buffer. Trivial."
  },
  {
    "number": 149,
    "title": "docs(cookbook): add retry-with-backoff recipe",
    "author": "carol",
    "merged_at": "2026-05-25T13:05:00Z",
    "body": "Cross-links from the new on_error reference page. Companion to #142."
  }
]
```

Now create `tools/load_prs.mjs` (rename from `load_input.mjs`):

```js
// tools/load_prs.mjs
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

export default async function loadPrs() {
  const path = resolve(HERE, '..', 'fixtures', 'recent_prs.json')
  const prs = JSON.parse(readFileSync(path, 'utf8'))
  return { state_delta: { prs } }
}
```

Why `dirname(fileURLToPath(import.meta.url))`? ES modules don't have `__dirname`. This is the idiomatic ES module equivalent — it gives you the directory of the current `.mjs` file regardless of what directory you run `oe run` from.

The tool returns `{ state_delta: { prs } }`. That object is the only contract: put fields you want persisted in `state_delta`. The scheduler writes them to the SQLite blackboard.

Update the node declaration in `experience.yaml`:

```yaml
graph:
  nodes:
    - id: load_prs
      kind: tool
      phase: load
      impl: ./tools/load_prs.mjs
      writes: [prs]
```

Verify:

```bash
oe validate
# INFO: experience valid
```

If you misspelled a field (e.g. `writes: [prrs]`) the validator catches it before any code runs. Fix it now — not during a 45-second LLM run.

---

## Step 6 — Write the classifier (5 min)

The classifier is the most interesting node. It has two features you'll use in most real flows:

**1. `for_each` fan-out** — instead of passing the whole `prs` array to one LLM call, `for_each` spawns one call per item. Each call receives the item as `$item`.

**2. Structured schema with an enum constraint** — every classification must be one of 5 categories. If the LLM returns something outside the enum, AJV validation rejects it loudly — the node fails, you see an error, you fix the prompt. Silent hallucinations become loud failures.

Add this node to `experience.yaml`:

```yaml
- id: classify_pr
  kind: agent
  phase: classify
  prompt: ./prompts/classify.md
  for_each: { source: $.prs, concurrency: 3 }
  reads: [prs]
  schema:
    type: object
    required: [classified]
    properties:
      classified:
        type: array
        items:
          type: object
          required: [number, category, summary]
          properties:
            number: { type: number }
            category: { type: string, enum: [feature, fix, chore, refactor, docs] }
            summary: { type: string }
  writes: [classified]
```

`for_each: { source: $.prs, concurrency: 3 }` means: iterate over the `prs` array in state, spawn up to 3 LLM calls at a time. For 8 PRs that's roughly 3× faster than sequential.

Create `prompts/classify.md`:

```markdown
You are classifying merged pull requests for a weekly engineering digest.

Pull request:

- Number: #{{$item.number}}
- Title: {{$item.title}}
- Body: {{$item.body}}
- Author: {{$item.author}}
- Merged at: {{$item.merged_at}}

Produce `classified` via `structured_output`:

- `number`: the PR number ({{$item.number}}, copy as-is)
- `category`: one of `feature`, `fix`, `chore`, `refactor`, `docs`
  - `feature` — new user-visible capability
  - `fix` — corrects existing behavior
  - `chore` — dependency bumps, build config, non-functional housekeeping
  - `refactor` — internal restructuring without behavior change
  - `docs` — README / docs site / comments
- `summary`: one sentence (≤ 120 chars) describing the change in plain language

Output exactly one element in the `classified` array.
```

`{{$item.number}}` and `{{$item.title}}` are template interpolations — the runtime substitutes the current fan-out item's fields before sending the prompt to the LLM.

::: tip Concurrency and rate limits
`concurrency: 3` means at most 3 simultaneous LLM calls. For 8 PRs you'll see three waves (3 + 3 + 2). Increase to match your account's rate limit tier. The scheduler handles the fan-in automatically — once all iterations complete, the next node (synthesize_digest) starts.
:::

---

## Step 7 — Write the synthesizer (3 min)

After all 8 PRs are classified, a single agent call synthesizes the digest. Add to `experience.yaml`:

```yaml
- id: synthesize_digest
  kind: agent
  phase: synthesize
  prompt: ./prompts/synthesize.md
  reads: [classified]
  schema:
    type: object
    required: [digest]
    properties:
      digest:
        type: object
        required: [headline, bullets, by_category]
        properties:
          headline: { type: string }
          bullets:
            type: array
            items: { type: string }
          by_category:
            type: object
            properties:
              feature: { type: number }
              fix: { type: number }
              chore: { type: number }
              refactor: { type: number }
              docs: { type: number }
  writes: [digest]
```

Notice `reads: [classified]`. This node only sees the `classified` field — the accumulated array of all 8 PR classifications. It doesn't need to know about `prs` or the original fixture. State reads are explicit and minimal.

Create `prompts/synthesize.md`:

```markdown
You are writing a weekly engineering digest. You have N classified pull requests; synthesize a 5-bullet summary plus a category breakdown.

Classified PRs:
```

{{classified}}

```

Produce `digest` via `structured_output`:

- `headline`: a 4-7 word title for the week (no date)
- `bullets`: an array of exactly 5 strings, each one sentence, capturing the most important threads. Group related PRs into one bullet; don't list every PR.
- `by_category`: an object with keys `feature`, `fix`, `chore`, `refactor`, `docs` and integer counts

Rules:

- Lead with the user-visible features. Bugs come second. Refactors and chores last.
- Avoid "we" / "the team did X" — write declaratively about what shipped.
- If a category has zero entries, set its count to 0 (do not omit the key).
```

`{{classified}}` renders the entire accumulated array as JSON. For 8 PRs that's a small payload — well within any LLM's context window.

---

## Step 8 — Write the report saver (3 min)

The last node writes the digest to a Markdown file. Create `tools/write_digest.mjs`:

```js
// tools/write_digest.mjs
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

export default async function writeDigest(input) {
  const digest = input._state?.digest
  const classified = input._state?.classified ?? []
  if (!digest) {
    throw new Error('write_digest requires `digest` in state')
  }
  const outDir = resolve(HERE, '..', 'out')
  mkdirSync(outDir, { recursive: true })
  const outPath = resolve(outDir, 'digest.md')

  const lines = []
  lines.push(`# ${digest.headline}`)
  lines.push('')
  lines.push('## This week')
  lines.push('')
  for (const b of digest.bullets) lines.push(`- ${b}`)
  lines.push('')
  lines.push('## By category')
  lines.push('')
  for (const [cat, count] of Object.entries(digest.by_category ?? {})) {
    lines.push(`- **${cat}**: ${count}`)
  }
  lines.push('')
  lines.push('## All PRs')
  lines.push('')
  for (const c of classified) {
    lines.push(`- #${c.number} (${c.category}) — ${c.summary}`)
  }
  lines.push('')

  writeFileSync(outPath, lines.join('\n'))
  return { state_delta: { digest_path: outPath } }
}
```

`input._state` gives the tool a read-only view of the state fields declared in `reads:`. The tool reads `digest` (the structured output from the synthesizer) and `classified` (all 8 classified PRs), then assembles a Markdown file.

`mkdirSync(outDir, { recursive: true })` is a sane default — always create the `out/` directory if it doesn't exist. Tools that write files should never assume the directory is there.

Add the node to `experience.yaml`:

```yaml
- id: write_digest
  kind: tool
  phase: save
  impl: ./tools/write_digest.mjs
  reads: [digest, classified]
  writes: [digest_path]
```

And add all four edges:

```yaml
edges:
  - { from: load_prs, to: classify_pr }
  - { from: classify_pr, to: synthesize_digest }
  - { from: synthesize_digest, to: write_digest }
```

Run validation one more time before spending tokens:

```bash
oe validate
# INFO: experience valid
```

---

## Step 9 — Run it for real (3 min)

```bash
export ANTHROPIC_API_KEY=sk-ant-...   # or OPENAI_API_KEY=...
oe run . --tui
```

The TUI dashboard shows each node's status in real time: `load_prs` finishes in under a second, then `classify_pr` spawns three concurrent LLM calls, you watch them tick off (3 + 3 + 2), then `synthesize_digest` makes one more call and `write_digest` writes the file.

After the run completes:

```bash
oe state digest_path
# → /Users/you/weekly-digest/out/digest.md

cat $(oe state digest_path | tail -1)
```

You'll see something like:

```markdown
# Scheduler reliability and CLI polish

## This week

- Exponential backoff now protects against 429 rate limits in both the scheduler and LLM client.
- Two CLI bugs are fixed: undefined state field access and a TUI scroll-buffer off-by-one.
- oe inspect gains a self-contained HTML report with Mermaid graph, timeline, and state diff.
- Internal timeout handling is unified — duplicated retry code lifted from all three dispatchers.
- Documentation updated with animated demo, CI badge, and a new retry-with-backoff cookbook recipe.

## By category

- **feature**: 2
- **fix**: 2
- **chore**: 1
- **refactor**: 1
- **docs**: 2
  ...
```

Inspect the full event timeline:

```bash
oe inspect <run-id>
# → each node's start/complete events sorted by timestamp
# → per-node token counts
# → state diffs showing what each node wrote
```

---

## Step 10 — Test it without burning tokens (3 min)

The part that separates a one-off script from a production-grade OE experience: a mocked-LLM end-to-end test that runs in CI in under a second.

Create `e2e/weekly-digest.e2e.test.ts` (pattern from any file in the repo's `e2e/` directory):

```typescript
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, cpSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseExperienceYaml } from '@openexpertise/schema'
import {
  DispatcherRegistry,
  EventBus,
  runExperience,
  type LLMClient,
  type LLMCompleteOpts,
} from '@openexpertise/core'
import { ToolDispatcher } from '@openexpertise/node-kinds-tool'
import { AgentDispatcher } from '@openexpertise/node-kinds-agent'

const HERE = dirname(fileURLToPath(import.meta.url))

class ScriptedLLM implements LLMClient {
  async complete(opts: LLMCompleteOpts) {
    const prompt = opts.messages[0]?.content ?? ''

    if (prompt.includes('classifying merged pull requests')) {
      const numberMatch = /Number: #(\d+)/.exec(prompt)
      const number = numberMatch ? parseInt(numberMatch[1], 10) : 0
      return {
        text: '',
        tool_calls: [
          {
            name: 'structured_output',
            input: { classified: [{ number, category: 'feature', summary: 'sample' }] },
          },
        ],
      }
    }

    if (prompt.includes('weekly engineering digest')) {
      return {
        text: '',
        tool_calls: [
          {
            name: 'structured_output',
            input: {
              digest: {
                headline: 'A productive week',
                bullets: ['five', 'bullets', 'go', 'right', 'here'],
                by_category: { feature: 2, fix: 2, chore: 1, refactor: 1, docs: 2 },
              },
            },
          },
        ],
      }
    }

    return { text: 'unknown prompt' }
  }
}

let dir: string
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

describe('weekly-digest end-to-end (mocked LLM)', () => {
  it('loads 8 PRs, classifies each, synthesizes digest, and writes digest.md', async () => {
    dir = mkdtempSync(join(tmpdir(), 'oe-e2e-digest-'))
    cpSync(join(HERE, '..', 'weekly-digest'), dir, { recursive: true })

    const spec = parseExperienceYaml(readFileSync(join(dir, 'experience.yaml'), 'utf8'))
    const dispatchers = new DispatcherRegistry()
    dispatchers.register(new ToolDispatcher())
    dispatchers.register(new AgentDispatcher({ client: new ScriptedLLM() }))

    const result = await runExperience({
      spec,
      experienceDir: dir,
      dispatchers,
      events: new EventBus(),
      args: {},
    })

    expect(result.status).toBe('success')
    expect((result.finalState.prs as unknown[]).length).toBe(8)
    expect((result.finalState.classified as unknown[]).length).toBe(8)
    expect((result.finalState.digest as { bullets: string[] }).bullets.length).toBe(5)

    const digestPath = result.finalState.digest_path as string
    expect(digestPath.endsWith('out/digest.md')).toBe(true)

    const written = readFileSync(digestPath, 'utf8')
    expect(written).toContain('A productive week')
    expect(written).toContain('five')
  })
})
```

The `ScriptedLLM` routes on prompt substrings — no network, no tokens, deterministic. Every assertion maps to a real requirement:

- `prs.length === 8` — loader ran and read the full fixture
- `classified.length === 8` — fan-out produced one entry per PR and `array_append` merged them
- `bullets.length === 5` — synthesizer schema constraint held
- `digest_path` ends with `out/digest.md` — the saver node ran and recorded the path
- file content includes the headline — the file was actually written

The reference version of this test runs in the repo at [`e2e/your-first-experience.e2e.test.ts`](https://github.com/xingchengxu/OpenExpertise/tree/main/e2e/your-first-experience.e2e.test.ts).

---

## (Optional) Submit to the registry (1 min)

If your flow would be useful to others:

```bash
git init
git remote add origin <your-github-repo>
git add . && git commit -m "feat: weekly engineering digest"
git push -u origin main
git tag v0.1.0 && git push --tags

oe submit --tags digest,engineering --dry-run    # preview the registry entry
oe submit --tags digest,engineering              # opens a pre-filled GitHub issue
```

A maintainer reviews the issue. Once merged, `oe install weekly-digest` works for anyone.

---

## What you learned

| Concept                            | Where you used it                                                                       |
| ---------------------------------- | --------------------------------------------------------------------------------------- |
| **The four-kind pattern**          | `tool` load → `agent` fan-out → `agent` synthesis → `tool` save                         |
| **`merge: array_append`**          | `classified` accumulates one entry per PR across 8 parallel iterations                  |
| **`for_each` with concurrency**    | `classify_pr` processes 3 PRs simultaneously, ~3× faster than sequential                |
| **Enum constraints**               | `category` field validated by AJV — invalid LLM output fails loudly                     |
| **`reads:` / `writes:` contracts** | Every node declares its state footprint; the validator checks them before any code runs |
| **Mocked e2e tests**               | `ScriptedLLM` routes by prompt substring — zero tokens, CI-safe                         |
| **Author → run → inspect loop**    | `oe run`, `oe state`, `oe inspect` give you the full picture after every run            |

---

## Next steps

- **Swap the fixture for live data.** Change `load_prs` to a `dataset` node with `source.type: http` and `url: https://api.github.com/repos/<owner>/<repo>/pulls?state=closed&per_page=8`. Add a `GITHUB_TOKEN` for non-anonymous access.
- **Try `oe evolve <run-id>`** after 5+ real runs — the advisor reads the event log and state diff, then proposes prompt rewrites or new nodes as a `git apply`-ready diff.
- **Read [`/cookbook`](/cookbook/)** for 10 self-contained patterns: retry with backoff, conditional edges, nested experiences, merge strategies, hybrid LLM routing.
- **Browse [`/examples`](/examples/)** for 12 more complete flows — including the multi-vendor `tri-cli-orchestration` where Claude, Codex, and Gemini share state in one DAG.

If you got stuck at any point, the canonical reference for this tutorial is at [`examples/your-first-experience`](https://github.com/xingchengxu/OpenExpertise/tree/main/examples/your-first-experience).

</div>
