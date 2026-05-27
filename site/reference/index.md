---
title: Reference
description: The canonical reference for the OpenExpertise CLI, programmatic API, and experience.yaml schema.
---

# Reference

Authoritative documentation for every public surface. If a name shows up here, that's the contract.

## [CLI](/reference/cli/)

12 commands: `init`, `validate`, `run`, `resume`, `inspect`, `state`, `reset-state`, `evolve`, `diff`, `ultra`, `doctor`, plus the registry commands.

Common flows:

```bash
oe init my-flow        # scaffold a new experience
oe validate            # check the YAML schema
oe run . --tui         # run with the TUI dashboard
oe inspect <run-id>    # event timeline + per-node metrics
oe evolve <run-id>     # advisor proposes graph upgrades
```

→ [Browse all CLI commands](/reference/cli/)

## [Programmatic API](/reference/api/)

9 modules exposing the same primitives the CLI uses. Useful when embedding OE in a service.

```ts
import { runExperience, EventBus } from '@openexpertise/core'

const events = new EventBus()
events.subscribe((e) => /* … */)

await runExperience({ specPath: './experience.yaml', events })
```

→ [Browse the API](/reference/api/)

## [YAML schema](/reference/schema)

The canonical shape of `experience.yaml`. AJV-validated by `oe validate` and the runtime.

Top-level sections: `meta`, `runtime`, `state.schema`, `graph` (`nodes` + `edges` + optional `pipelines` + `loops`).

→ [Read the full schema](/reference/schema)

## When to look here vs the guides

- **Looking up a specific flag, command, or function signature?** → Reference.
- **Trying to _do_ something for the first time?** → [Guide](/guide/).
- **Trying to _understand_ something?** → [Concepts](/concepts/).
- **Looking for a copy-paste snippet?** → [Cookbook](/cookbook/).
