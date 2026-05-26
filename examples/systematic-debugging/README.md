# systematic-debugging

**The superpowers `systematic-debugging` skill, as a YAML flow.**

```
capture_symptoms → hypothesize → verify_hypothesis (for_each)
                                       │
                                       ▼
                                  localize → propose_fix → verify_fix
```

When a test fails — at 2am on-call, or in CI, or just locally — this flow walks the failure through the same discipline a senior engineer would: observe, hypothesize, verify each hypothesis with evidence from the codebase, localize the actual buggy line, propose the minimum edit via Claude Code, then re-run the test to confirm the fix.

## Why OE instead of just running the skill in Claude Code

The skill is excellent. What OE adds:

- **Persistent state.** Every hypothesis + every check result + the diagnosis live in SQLite. Walk away mid-investigation; resume tomorrow.
- **Replayable trail.** `oe inspect <run-id>` reconstructs exactly which hypotheses fired, what evidence each found, why localize converged. Postmortem material that writes itself.
- **Evolvable workflow.** After 5 runs, `oe evolve` sees patterns (e.g., "you always hypothesize about the wrong function first") and proposes a smarter `hypothesize.md`. The skill itself doesn't get smarter; this flow does.
- **Fixture-driven for safe practice.** Run it against the bundled `fixtures/buggy_repo` first; then point it at your real codebase.

## Prereqs

- `claude` CLI on PATH and authenticated (used by `verify_hypothesis` and `propose_fix`).
- `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` set (for `hypothesize` and `localize` agents).
- Node 20+ in the workdir being debugged (the bundled fixture's tests run via `node --test`).

## Run on the bundled fixture

The default `args` in `experience.yaml` point at `./fixtures/buggy_repo`, which has a known off-by-one in `validateUserId`. Run it:

```bash
node packages/cli/dist/bin.js run examples/systematic-debugging --tui
```

Expected wall time: ~2–4 minutes. The fix Claude Code lands should change `id < MAX_USER_ID` to `id > MAX_USER_ID` (or equivalent), the verify_fix tool re-runs the tests, and `verification_status` reads `passed`.

After the run:

```bash
node packages/cli/dist/bin.js state diagnosis
node packages/cli/dist/bin.js state fix_proposal
node packages/cli/dist/bin.js state verification_status   # should print 'passed'
```

## Run on your own repo

Override the args in `experience.yaml`:

```yaml
- id: capture_symptoms
  args:
    repo_path: '/absolute/or/relative/path/to/your/repo'
    failing_test_cmd: 'pnpm test --filter @your/pkg'
```

`failing_test_cmd` is run with `cwd: repo_path`. Anything that exits non-zero on failure works — pytest, vitest, cargo test, go test.

⚠ **Important:** the `propose_fix` step calls Claude Code with edit access to your repo. Commit your work first; review the diff after. The flow does NOT auto-commit.

## Mocked e2e

`e2e/systematic-debugging.e2e.test.ts` covers the full graph with a scripted LLM + scripted runner — no real CLI required, no actual file edits in test land.

## Evolve after multiple runs

After ~5 real runs:

```bash
node packages/cli/dist/bin.js evolve <recent-run-id>
```

Typical advisor proposals:

- Add a `prefilter` agent before hypothesize that classifies the failure type (compile / assertion / runtime / timeout) and steers hypothesize accordingly.
- Add a `git_blame` tool node before hypothesize that surfaces the most recent commit touching the failing line — most bugs are recently-introduced.
- Add a `regression_test_writer` cli-agent after `propose_fix` that asks Claude to write a NEW test capturing the bug, before verify_fix runs.

That's the loop: skill → flow → run → advisor → upgraded flow.

## Mapping to the superpowers skill

| superpowers skill phase            | OE node                       |
| ---------------------------------- | ----------------------------- |
| Observe (capture symptoms)         | `capture_symptoms`            |
| Hypothesize (generate candidates)  | `hypothesize`                 |
| Verify (test each hypothesis)      | `verify_hypothesis` (fan-out) |
| Localize (single root cause)       | `localize`                    |
| Fix (minimum edit)                 | `propose_fix`                 |
| Verify the fix doesn't break tests | `verify_fix`                  |

Same discipline; durable, replayable, evolvable.
