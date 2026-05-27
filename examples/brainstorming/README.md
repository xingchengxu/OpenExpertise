# brainstorming

**The superpowers `brainstorming` skill, as a YAML flow.**

```
load_seed → diverge (Claude Code × 3 angles) → cluster (agent) → critique (Claude Code × clusters) → synthesize (agent)
```

A real-use brainstorming pipeline. Drop in a seed question + 3 angles, get back 3 sharp, critique-tested picks.

## What's a "seed" here?

A `fixtures/seed.json` with two fields:

- `topic`: the question you want to brainstorm against.
- `angles`: an array of 3 angles (perspective + framing), each `{name, description}`. The flow generates ideas from each angle in parallel.

Default seed asks: _"How should an open-source dev-tools project reduce time-to-first-successful-run for new users?"_ with three angles: practitioner, contrarian, analogist.

## Why use OE over just running the skill in Claude Code

- **Persistent state**: every angle's ideas, every cluster, every critique lives in SQLite. Walk away, come back, `oe state picks` gives you the answer.
- **Parallel fan-out** with bounded concurrency: `for_each: { concurrency: 3 }` on diverge runs Claude Code 3 times in parallel, then 2-way on critique. No external coordinator.
- **Reproducible**: same seed.json + same prompts = same shape of output. The LLM still produces fresh language, but the structure is locked.
- **Evolvable**: after a few real runs, `oe evolve` proposes upgrades — add a "wildcard" 4th angle, add a vote step between cluster and synthesize, etc.

## Run on the default seed

```bash
node packages/cli/dist/bin.js run examples/brainstorming --tui
```

Expected wall time: ~3-5 minutes.

After:

```bash
node packages/cli/dist/bin.js state picks            # the top 3 + reasoning + next actions
node packages/cli/dist/bin.js state clusters         # the 3-5 thematic clusters
node packages/cli/dist/bin.js state raw_ideas        # all 15 raw ideas across 3 angles
```

## Run on your own topic

Edit `fixtures/seed.json`:

```json
{
  "topic": "<your question — open-ended, specific enough to ground the ideas>",
  "angles": [
    { "name": "<angle-1>", "description": "<framing for this angle>" },
    { "name": "<angle-2>", "description": "..." },
    { "name": "<angle-3>", "description": "..." }
  ]
}
```

Pick angles that genuinely differ. 3 variations of the same perspective produce 3 variations of the same ideas.

## Mocked e2e

`e2e/brainstorming.e2e.test.ts` runs the full graph with a scripted LLM + scripted runner — no real CLI or API key required.

## Mapping to the superpowers skill

| superpowers skill phase        | OE node                                      |
| ------------------------------ | -------------------------------------------- |
| Diverge (multi-angle ideation) | `diverge` (cli-agent fan-out over angles)    |
| Cluster (theme grouping)       | `cluster` (agent)                            |
| Critique (poke holes)          | `critique` (cli-agent fan-out over clusters) |
| Synthesize (pick top 3)        | `synthesize` (agent)                         |
