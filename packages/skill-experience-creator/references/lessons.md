# Lessons — hard-won gotchas from V1 development

These are recorded inline in `docs/superpowers/overnight-progress.md` and worth surfacing here.

## State schema enforcement is strict

A node's `writes:` field must be declared in `state.schema`. The validator catches typos at load time. If you get "undeclared state field", look for a misspelled field name.

## Fan-out replicas need merge strategies

If a `for_each` node writes a field, that field must declare `merge: array_append` (each replica appends one item). Without a merge strategy, the second replica clobbers the first.

## Agent text mode requires exactly one `writes` field

`AgentDispatcher` without a schema writes the LLM's text to `writes[0]`. If you declare multiple writes, it throws. Use a `schema:` to write multiple fields atomically.

## Pipeline stages don't get topological scheduling

Pipeline-stage nodes are excluded from the main DAG pass and run instead in the pipeline pass (after the topo pass). If you want a node to run after a pipeline completes, give it an edge from the pipeline's last stage and don't put it in the pipeline.

## Loop bodies are also excluded from the main DAG pass

Same as pipelines: the loop body runs in the loop pass (third pass), not the topo pass. If you need it to also fire standalone, declare two separate nodes.

## Cache invalidates when ANY input changes

Cache keys hash (node spec, state slice, edge inputs, args, runtime version). A change to ANY of these busts the cache. Bumping `RUNTIME_VERSION` in `scheduler.ts` invalidates all caches.

## `exactOptionalPropertyTypes: true` is on

Optional fields are `foo?: T`, never `foo?: T | undefined`. Build conditional objects with `...(cond ? { foo } : {})` rather than passing `foo: maybe`.

## `noUncheckedIndexedAccess: true` is on

Array index access returns `T | undefined`. Use `arr[0]?.field` or `arr[0]!.field` deliberately.

## ESM imports use `.js` extensions in source

TypeScript NodeNext / Bundler module resolution requires `import { x } from './foo.js'` even though the source is `foo.ts`. Don't strip the `.js`.

## SQLite file is per-experience and persists across runs

The blackboard is at `.openexpertise/state.sqlite`. To wipe it, `oe reset-state --yes`. State is the WHOLE POINT of OpenExpertise — don't fight it.

## Run logs are JSONL under `.openexpertise/runs/<run-id>.jsonl`

`oe inspect <run-id>` replays them. `oe resume <run-id>` re-runs with cache + original args.
