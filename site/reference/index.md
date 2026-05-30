---
title: Reference
description: The canonical reference for the OpenExpertise CLI, programmatic API, and experience.yaml schema.
---

# Reference

Authoritative documentation for every public surface. If a name shows up here, that's the contract.

## [CLI](/reference/cli/)

`init`, `validate`, `run`, `resume`, `inspect`, `state`, `reset-state`, `evolve`, `diff`, `ultra`, `ultra-revise`, `graph`, `schema`, `doctor`, `demo`, plus the registry commands.

Common flows:

```bash
oe init my-flow        # scaffold a new experience (+ editor autocomplete schema)
oe validate            # check the YAML schema
oe graph .             # render the experience DAG as Mermaid
oe run . --tui         # run with the TUI dashboard
oe inspect <id> --html # event timeline + per-node metrics → HTML run report
oe evolve <id>         # advisor proposes graph upgrades
```

New since v0.1.0: `oe graph` (Mermaid DAG), `oe schema` (JSON Schema for editor autocomplete), and `oe ultra-revise` (apply feedback to an existing draft).

→ [Browse all CLI commands](/reference/cli/)

## [Programmatic API](/reference/api/)

9 modules exposing the same primitives the CLI uses. Useful when embedding OE in a service.

```ts
import { runExperience, EventBus } from '@openexpertise/core'

const events = new EventBus()
events.subscribe((e) => /* … */)

await runExperience({ specPath: './experience.yaml', events })
```

Recent additions: [`UltraExpertise`](/reference/api/ultra-expertise) gains the critique → revise quality loop (the `loop` field + `maxRounds`/`criticModel`/`exemplars` opts) and a `reviseDraft()` method; [`EvolutionAdvisor`](/reference/api/evolution-advisor) gains `analyzeAcrossRuns()` + `renderMarkdownCrossRun()` for cross-run analysis.

→ [Browse the API](/reference/api/)

## [YAML schema](/reference/schema)

The canonical shape of `experience.yaml`. AJV-validated by `oe validate` and the runtime, and available as a JSON Schema for [editor autocomplete](/guide/editor-support) via `oe schema`.

Top-level sections: `name`, `version`, `description`, `state.schema`, `phases`, `graph` (`nodes` + `edges` + optional `pipelines` + `loops`), `runtime`.

→ [Read the full schema](/reference/schema)

## When to look here vs the guides

- **Looking up a specific flag, command, or function signature?** → Reference.
- **Trying to _do_ something for the first time?** → [Guide](/guide/).
- **Trying to _understand_ something?** → [Concepts](/concepts/).
- **Looking for a copy-paste snippet?** → [Cookbook](/cookbook/).
