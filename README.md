# OpenExpertise

An open-source execution engine for **experience flows** — heterogeneous executable
graphs that codify expert knowledge into runnable, evolving artifacts.

See `docs/superpowers/specs/2026-05-25-openexpertise-design.md` for the V1 design.

## Status

Walking skeleton (Plan 1 of 5). One node kind (`tool`) wired end-to-end.
Not yet usable for real experiences.

## Quick start

```bash
pnpm install
pnpm -r build
node packages/cli/dist/bin.js run examples/hello-tool
```

You should see structured log lines for `run.started`, `state.write`,
`run.finished`, and a final state of `{ greeting: 'hello, World' }`.

## Development

```bash
pnpm test          # all unit + e2e tests
pnpm typecheck     # tsc across all packages
pnpm lint          # eslint
pnpm format:check  # prettier
```

## What's next

- Plan 2: agent / skill / dataset / experience dispatchers + control-flow primitives.
- Plan 3: cache + resume + remaining CLI commands + TUI.
- Plan 4: `experience-creator` authoring skill.
- Plan 5: evolution advisor + binary distribution.

See `docs/superpowers/plans/` for the breakdown.
