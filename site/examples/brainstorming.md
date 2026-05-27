---
title: brainstorming
description: The superpowers brainstorming skill as an OpenExpertise YAML flow — diverge across 3 angles, cluster, critique, synthesize top 3 picks.
---

# brainstorming

_The superpowers `brainstorming` skill translated into an OpenExpertise flow: load a seed question and angles, diverge across three angles in parallel via Claude Code, cluster the ideas into themes, critique each cluster adversarially, then synthesize the top 3 picks._

## What it demonstrates

- The [superpowers brainstorming skill](https://github.com/xingchengxu/OpenExpertise/blob/main/skills/brainstorming/SKILL.md) as a durable, replayable YAML graph
- `diverge` fan-out: one Claude Code call per angle with `for_each.concurrency: 3` — all three in parallel
- `critique` fan-out: one Claude Code call per cluster with `for_each.concurrency: 2`
- `array_append` merge: raw ideas from all angles accumulate into one flat list
- Mixed node kinds: `tool + cli-agent + agent` in one graph
- Persistent state: every idea, cluster, critique, and final picks live in SQLite

## The graph

```
load_seed → diverge (cli-agent, for_each ×3 angles, concurrency:3)
                  │
                  ▼
              cluster (agent)
                  │
                  ▼
          critique (cli-agent, for_each ×N clusters, concurrency:2)
                  │
                  ▼
            synthesize (agent)
```

Phases: `seed` → `diverge` → `converge` → `critique` → `synthesize`.

## State schema

| Field       | Type            | Merge          | Description                                                                                         |
| ----------- | --------------- | -------------- | --------------------------------------------------------------------------------------------------- |
| `topic`     | `string`        | —              | The question to brainstorm                                                                          |
| `angles`    | `array<object>` | —              | `[{name, description}]` loaded from `fixtures/seed.json`                                            |
| `raw_ideas` | `array<object>` | `array_append` | All 15 ideas from 3 angles × 5 ideas each                                                           |
| `clusters`  | `array<object>` | —              | `[{id, name, description, idea_indices}]` from `cluster`                                            |
| `critiques` | `array<object>` | `array_append` | One critique per cluster: `{cluster_id, biggest_weakness, what_we_dont_know, best_idea_in_cluster}` |
| `picks`     | `object`        | —              | `{top_3[], reasoning, next_actions[]}` — the final output                                           |

## How it runs

```bash
# Uses the bundled seed: "How should an open-source dev-tools project
# reduce time-to-first-successful-run for new users?"
oe run examples/brainstorming --tui
```

The `claude` CLI must be on PATH and authenticated. `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY`) must be set for the `cluster` and `synthesize` agent nodes. Expected wall time: 3–5 minutes.

After the run:

```bash
oe state picks           # top 3 + reasoning + next actions
oe state clusters        # thematic clusters
oe state raw_ideas       # all 15 ideas across 3 angles
```

## What happens, step by step

### 1. Seed

`load_seed` reads `fixtures/seed.json` and writes `topic` and `angles` to state. The default seed uses three contrasting angles: `practitioner`, `contrarian`, and `analogist`.

### 2. Diverge (parallel fan-out)

`diverge` runs once per angle via `for_each: { source: $.angles, concurrency: 3 }`. All three Claude Code calls fire in parallel. Each receives `$item` (the current angle's `name` and `description`) and generates exactly 5 concrete, specific ideas. Results merge into `raw_ideas` via `array_append` — 15 ideas total.

Example for the default topic:

- **practitioner** angle: "Add a `setup --dry-run` flag that prints what would happen without making changes"
- **contrarian** angle: "Remove all optional flags — make the first run unconditionally succeed on a default project"
- **analogist** angle: "Borrow the Homebrew pattern: one copy-paste command that self-configures"

### 3. Cluster

The `cluster` agent reads `topic` and all 15 `raw_ideas` and groups them into 3–5 thematic clusters. Each cluster gets an `id`, `name`, `description`, and the indices of which ideas it contains.

### 4. Critique (fan-out)

`critique` runs once per cluster via `for_each: { source: $.clusters, concurrency: 2 }`. Each iteration asks Claude Code to identify the `biggest_weakness`, `what_we_dont_know`, and the `best_idea_in_cluster`. Results merge into `critiques`.

### 5. Synthesize

`synthesize` reads `topic`, all `raw_ideas`, `clusters`, and `critiques` and returns the final `picks` object: the top 3 ideas that survived critique, the reasoning, and `next_actions`.

```bash
$ oe state picks
{
  "top_3": [
    {"idea": "Add a setup --dry-run flag...", "why_strongest": "..."},
    ...
  ],
  "reasoning": "...",
  "next_actions": ["..."]
}
```

## Run on your own topic

Edit `fixtures/seed.json`:

```json
{
  "topic": "<your open-ended, specific question>",
  "angles": [
    { "name": "<angle-1>", "description": "<framing for this angle>" },
    { "name": "<angle-2>", "description": "..." },
    { "name": "<angle-3>", "description": "..." }
  ]
}
```

Pick angles that genuinely differ — three variations of the same perspective produce three variations of the same ideas.

## Mapping to the superpowers skill

| Superpowers phase              | OE node                          |
| ------------------------------ | -------------------------------- |
| Diverge (multi-angle ideation) | `diverge` (cli-agent, for_each)  |
| Cluster (theme grouping)       | `cluster` (agent)                |
| Critique (poke holes)          | `critique` (cli-agent, for_each) |
| Synthesize (pick top 3)        | `synthesize` (agent)             |

## Source

[examples/brainstorming/](https://github.com/xingchengxu/OpenExpertise/tree/main/examples/brainstorming)
